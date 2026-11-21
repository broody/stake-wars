package api

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/starknet"
	"stakewars.com/api/internal/survivor"
)

func (s *server) survivorLeaderboard(w http.ResponseWriter, r *http.Request) {
	var id int64
	if raw := r.URL.Query().Get("round"); raw != "" {
		var err error
		id, err = strconv.ParseInt(raw, 10, 64)
		if err != nil || id < 1 {
			writeProblem(w, 400, "invalid request", "round must be a positive integer")
			return
		}
	}
	var board survivor.Board
	var err error
	switch r.URL.Query().Get("scope") {
	case "":
		board, err = s.survivors.Board(r.Context(), id)
	case "all":
		if id != 0 {
			writeProblem(w, 400, "invalid request", "choose a round or all-time standings")
			return
		}
		board, err = s.survivors.AllTime(r.Context())
	default:
		writeProblem(w, 400, "invalid scope", "unknown leaderboard scope")
		return
	}
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	board.PayoutsEnabled = s.dependencies.SurvivorPayouts
	writeJSON(w, http.StatusOK, board)
}

func (s *server) startSurvivorRun(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Round int64 `json:"round"`
	}
	if err := decodeJSON(w, r, &input); err != nil || input.Round < 0 {
		writeProblem(w, 400, "invalid request", "invalid round ID")
		return
	}
	ticket, err := s.survivors.Start(r.Context(), input.Round)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusCreated, ticket)
}

func (s *server) finishSurvivorRun(w http.ResponseWriter, r *http.Request) {
	session, ok := s.authenticate(w, r, auth.Survivor)
	if !ok {
		return
	}
	var input struct {
		Token  string `json:"token"`
		Replay []byte `json:"replay"`
	}
	if err := decodeLimitedJSON(w, r, &input, 310000); err != nil {
		writeProblem(w, 400, "invalid replay", "a run ticket and base64 replay are required")
		return
	}
	if s.dependencies.SurvivorAccounts == nil {
		writeProblem(w, 503, "Survivor unavailable", "wallet verification is unavailable")
		return
	}
	score, err := s.survivors.Finish(r.Context(), input.Token, session.WalletAddress, input.Replay, s.dependencies.SurvivorAccounts.IsOutis)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]int{"destroyed": score})
}

func (s *server) survivorWalletProfile(w http.ResponseWriter, r *http.Request) {
	wallet, err := starknet.NormalizeAddress(r.URL.Query().Get("wallet"))
	if err != nil {
		writeProblem(w, 400, "invalid wallet", "supply a Starknet address")
		return
	}
	name, err := s.survivors.Profile(r.Context(), wallet)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]string{"name": name})
}

func (s *server) survivorProfile(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Guest string  `json:"guestId"`
		Name  *string `json:"name"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeProblem(w, 400, "invalid profile", "invalid profile fields")
		return
	}
	player, err := survivor.GuestPlayer(input.Guest)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	var name string
	if input.Name == nil {
		name, err = s.survivors.Profile(r.Context(), player)
	} else {
		name, err = s.survivors.SetGuestName(r.Context(), player, *input.Name)
	}
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]string{"name": name})
}

func (s *server) setSurvivorWalletName(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Wallet    string   `json:"wallet"`
		Name      string   `json:"name"`
		Signature []string `json:"signature"`
		Revision  int64    `json:"revision"`
	}
	if err := decodeJSON(w, r, &input); err != nil || len(input.Signature) > 64 {
		writeProblem(w, 400, "invalid profile", "invalid wallet name request")
		return
	}
	wallet, err := starknet.NormalizeAddress(input.Wallet)
	if err != nil {
		writeProblem(w, 400, "invalid wallet", "supply a Starknet address")
		return
	}
	name, err := survivor.ValidName(input.Name)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	revision, err := s.survivors.NextNameRevision(r.Context(), wallet)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	data, err := starknet.SurvivorNameData(s.dependencies.Config.Network, wallet, name, revision)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if len(input.Signature) == 0 {
		writeJSON(w, 200, map[string]any{"revision": revision, "typedData": data})
		return
	}
	if input.Revision != revision {
		s.survivorError(w, r, survivor.ErrRevision)
		return
	}
	if s.dependencies.SurvivorSignatures == nil {
		writeProblem(w, 503, "profile unavailable", "wallet verification is unavailable")
		return
	}
	ok, err := s.dependencies.SurvivorSignatures.VerifySurvivorMessage(r.Context(), wallet, data, input.Signature)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	if !ok {
		writeProblem(w, 403, "invalid signature", "sign the name change with this wallet")
		return
	}
	if err = s.survivors.SetWalletName(r.Context(), wallet, name, revision); err != nil {
		s.survivorError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]string{"name": name})
}

func (s *server) attachSurvivorWallet(w http.ResponseWriter, r *http.Request) {
	session, ok := s.authenticate(w, r, auth.Survivor)
	if !ok {
		return
	}
	var input struct {
		Token string `json:"token"`
		Guest string `json:"guestId"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeProblem(w, 400, "invalid run", "supply a run ticket and guest ID")
		return
	}
	from, err := survivor.GuestPlayer(input.Guest)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	if s.dependencies.SurvivorAccounts == nil {
		writeProblem(w, 503, "Survivor unavailable", "wallet verification is unavailable")
		return
	}
	err = s.survivors.Attach(r.Context(), input.Token, from, session.WalletAddress, s.dependencies.SurvivorAccounts.IsOutis)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	writeJSON(w, 200, map[string]string{"wallet": session.WalletAddress})
}

func (s *server) survivorError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, survivor.ErrName), errors.Is(err, survivor.ErrGuest):
		writeProblem(w, 400, "invalid player", err.Error())
	case errors.Is(err, sql.ErrNoRows):
		writeProblem(w, 404, "round unavailable", "round not found")
	case errors.Is(err, survivor.ErrClaim):
		writeProblem(w, 403, "claim unavailable", err.Error())
	case errors.Is(err, survivor.ErrTicket):
		writeProblem(w, 403, "invalid ticket", err.Error())
	case errors.Is(err, survivor.ErrReplay):
		writeProblem(w, 422, "invalid replay", err.Error())
	case errors.Is(err, survivor.ErrRevision):
		writeProblem(w, 409, "name changed", err.Error())
	case errors.Is(err, survivor.ErrClosed):
		writeProblem(w, 409, "round closed", err.Error())
	case errors.Is(err, survivor.ErrBusy):
		w.Header().Set("Retry-After", "2")
		writeProblem(w, 503, "verifier busy", err.Error())
	default:
		slog.ErrorContext(r.Context(), "Survivor request failed", "error", err)
		writeProblem(w, 500, "Survivor unavailable", "could not process this request")
	}
}

func (s *server) survivorClaim(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("round"), 10, 64)
	if err != nil || id < 1 {
		writeProblem(w, 400, "invalid round", "round must be a positive integer")
		return
	}
	if !s.dependencies.SurvivorPayouts || s.dependencies.SurvivorSignatures == nil || s.dependencies.SurvivorAccounts == nil {
		writeProblem(w, 503, "claims unavailable", "prize payouts are not enabled")
		return
	}
	p, err := s.survivors.Prize(r.Context(), id)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	data, err := starknet.SurvivorClaimData(s.dependencies.Config.Network, p.Round, p.Wallet, p.Amount)
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	if r.Method == http.MethodGet {
		writeJSON(w, 200, data)
		return
	}
	var input struct {
		Signature []string `json:"signature"`
	}
	if err := decodeJSON(w, r, &input); err != nil || len(input.Signature) == 0 || len(input.Signature) > 64 {
		writeProblem(w, 400, "invalid claim", "a claim signature is required")
		return
	}
	ok, err := s.dependencies.SurvivorAccounts.IsOutis(r.Context(), p.Wallet)
	if err == nil && ok {
		ok, err = s.dependencies.SurvivorSignatures.VerifySurvivorMessage(r.Context(), p.Wallet, data, input.Signature)
	}
	if err != nil {
		s.survivorError(w, r, err)
		return
	}
	if !ok {
		s.survivorError(w, r, survivor.ErrClaim)
		return
	}
	if err = s.survivors.Claim(r.Context(), p); err != nil {
		s.survivorError(w, r, err)
		return
	}
	writeJSON(w, 202, map[string]bool{"claimed": true})
}
