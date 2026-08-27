package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/images"
)

const maxJSONBodyBytes = 64 * 1024

type PublicConfig struct {
	Network             string
	MaxImageBytes       int64
	AuthEnabled         bool
	ToriiURL            string
	ImageUploadsEnabled bool
}

type Dependencies struct {
	DB             *sql.DB
	Auth           *auth.Service
	Config         PublicConfig
	AllowedOrigins []string
	Torii          *ToriiGateway
	Images         *images.Service
	Arbiter        arbiterReader
	ArbiterHistory arbiterHistoryReader
}

type arbiterReader interface {
	Current(ctx context.Context) (arbiter.Snapshot, error)
}

type arbiterHistoryReader interface {
	List(ctx context.Context, limit int, cursor string) (arbiter.HistoryPage, error)
}

// NewHandler returns the API's HTTP routes.
func NewHandler(dependencies Dependencies) http.Handler {
	server := &server{dependencies: dependencies}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /readyz", server.ready)
	mux.HandleFunc("GET /v1/config", server.publicConfig)
	mux.HandleFunc("GET /v1/arbiter", server.arbiterState)
	mux.HandleFunc("GET /v1/arbiter/history", server.arbiterHistory)
	mux.HandleFunc("POST /v1/auth/challenges", server.createChallenge)
	mux.HandleFunc("POST /v1/auth/sessions", server.createSession)
	mux.HandleFunc("GET /v1/sector-artworks", server.listSectorImages)
	mux.HandleFunc("POST /v1/sector-artworks/uploads", server.authorizeSectorImage)
	mux.HandleFunc("POST /v1/sector-artworks/uploads/{uploadID}/complete", server.completeSectorImage)
	if dependencies.Torii != nil {
		mux.Handle("/torii/graphql", dependencies.Torii)
		mux.Handle("/torii/health", dependencies.Torii)
	}

	return securityHeaders(cors(dependencies.AllowedOrigins, mux))
}

func (s *server) arbiterHistory(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.ArbiterHistory == nil {
		w.Header().Set("Cache-Control", "public, max-age=10")
		writeJSON(w, http.StatusOK, arbiter.HistoryPage{Entries: []arbiter.HistoryEntry{}})
		return
	}
	limit := 0
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil {
			writeProblem(w, http.StatusBadRequest, "invalid request", "limit must be an integer")
			return
		}
		limit = parsed
	}
	page, err := s.dependencies.ArbiterHistory.List(
		r.Context(),
		limit,
		r.URL.Query().Get("cursor"),
	)
	if errors.Is(err, arbiter.ErrInvalidHistoryQuery) {
		writeProblem(w, http.StatusBadRequest, "invalid request", err.Error())
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "read Arbiter history", "error", err)
		writeProblem(
			w,
			http.StatusInternalServerError,
			"Arbiter history unavailable",
			"could not read verified Arbiter history",
		)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=10")
	writeJSON(w, http.StatusOK, page)
}

func (s *server) arbiterState(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.Arbiter == nil {
		w.Header().Set("Cache-Control", "public, max-age=5")
		writeJSON(w, http.StatusOK, arbiter.Snapshot{
			Network:    s.dependencies.Config.Network,
			Phase:      arbiter.PhaseNone,
			ObservedAt: time.Now().UTC(),
		})
		return
	}
	snapshot, err := s.dependencies.Arbiter.Current(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "read Arbiter state", "error", err)
		writeProblem(
			w,
			http.StatusBadGateway,
			"Arbiter unavailable",
			"could not verify the current Arbiter round",
		)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=5")
	writeJSON(w, http.StatusOK, snapshot)
}

type server struct {
	dependencies Dependencies
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) ready(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.DB == nil {
		writeProblem(w, http.StatusServiceUnavailable, "not ready", "database is not configured")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.dependencies.DB.PingContext(ctx); err != nil {
		slog.ErrorContext(r.Context(), "readiness check failed", "error", err)
		writeProblem(w, http.StatusServiceUnavailable, "not ready", "database is unavailable")
		return
	}
	if s.dependencies.Torii != nil {
		if err := s.dependencies.Torii.Ready(ctx); err != nil {
			slog.ErrorContext(r.Context(), "Torii readiness check failed", "error", err)
			writeProblem(w, http.StatusServiceUnavailable, "not ready", "Torii is unavailable")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *server) publicConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"network":             s.dependencies.Config.Network,
		"maxImageBytes":       s.dependencies.Config.MaxImageBytes,
		"authEnabled":         s.dependencies.Config.AuthEnabled,
		"toriiUrl":            s.dependencies.Config.ToriiURL,
		"imageUploadsEnabled": s.dependencies.Config.ImageUploadsEnabled,
		"supportedImageTypes": []string{"image/webp", "image/jpeg", "image/png"},
	})
}

func (s *server) listSectorImages(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.Images == nil {
		w.Header().Set("Cache-Control", "public, max-age=30")
		writeJSON(w, http.StatusOK, map[string]any{"artworks": []images.Artwork{}})
		return
	}
	approved, err := s.dependencies.Images.Approved(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "list sector images", "error", err)
		writeProblem(w, http.StatusInternalServerError, "internal error", "could not list Sector images")
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{"artworks": approved})
}

func (s *server) authorizeSectorImage(w http.ResponseWriter, r *http.Request) {
	session, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if s.dependencies.Images == nil {
		writeProblem(w, http.StatusServiceUnavailable, "uploads unavailable", "image storage is not configured")
		return
	}
	var input struct {
		Targets       []images.Target  `json:"targets"`
		Placement     images.Placement `json:"placement"`
		ContentType   string           `json:"contentType"`
		DetailSize    int64            `json:"detailSize"`
		ThumbnailSize int64            `json:"thumbnailSize"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid request", err.Error())
		return
	}
	authorization, err := s.dependencies.Images.Authorize(
		r.Context(), session.WalletAddress, images.AuthorizeInput{
			Targets: input.Targets, Placement: input.Placement,
			ContentType: input.ContentType, DetailSize: input.DetailSize,
			ThumbnailSize: input.ThumbnailSize,
		},
	)
	switch {
	case err == nil:
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusCreated, authorization)
	case errors.Is(err, images.ErrInvalidImage):
		writeProblem(w, http.StatusBadRequest, "invalid image", err.Error())
	case errors.Is(err, images.ErrForbidden):
		writeProblem(w, http.StatusForbidden, "ownership required", "the authenticated wallet cannot manage this Sector image")
	case errors.Is(err, images.ErrUploadUnavailable):
		writeProblem(w, http.StatusServiceUnavailable, "uploads unavailable", "image uploads are not configured")
	default:
		slog.ErrorContext(r.Context(), "authorize sector image", "error", err)
		writeProblem(w, http.StatusBadGateway, "upload authorization failed", "could not authorize the image upload")
	}
}

func (s *server) completeSectorImage(w http.ResponseWriter, r *http.Request) {
	session, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	if s.dependencies.Images == nil {
		writeProblem(w, http.StatusServiceUnavailable, "uploads unavailable", "image storage is not configured")
		return
	}
	uploadID := r.PathValue("uploadID")
	if uploadID == "" {
		writeProblem(w, http.StatusBadRequest, "invalid request", "upload ID is required")
		return
	}
	image, err := s.dependencies.Images.Complete(r.Context(), uploadID, session.WalletAddress)
	switch {
	case err == nil:
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusCreated, image)
	case errors.Is(err, images.ErrInvalidImage):
		writeProblem(w, http.StatusBadRequest, "invalid image", err.Error())
	case errors.Is(err, images.ErrForbidden), errors.Is(err, images.ErrUploadNotFound):
		writeProblem(w, http.StatusForbidden, "upload unavailable", "the upload is expired, completed, or no longer owned by this wallet")
	case errors.Is(err, images.ErrUploadUnavailable):
		writeProblem(w, http.StatusServiceUnavailable, "uploads unavailable", "image uploads are not configured")
	default:
		slog.ErrorContext(r.Context(), "complete sector image", "error", err)
		writeProblem(w, http.StatusBadGateway, "upload validation failed", "could not validate the uploaded image")
	}
}

func (s *server) authenticate(w http.ResponseWriter, r *http.Request) (auth.Session, bool) {
	if s.dependencies.Auth == nil {
		writeProblem(w, http.StatusServiceUnavailable, "authentication unavailable", "authentication is not configured")
		return auth.Session{}, false
	}
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, prefix) || strings.TrimSpace(strings.TrimPrefix(header, prefix)) == "" {
		writeProblem(w, http.StatusUnauthorized, "authentication required", "a valid bearer session is required")
		return auth.Session{}, false
	}
	session, err := s.dependencies.Auth.Authenticate(r.Context(), strings.TrimSpace(strings.TrimPrefix(header, prefix)))
	if errors.Is(err, auth.ErrSessionNotFound) {
		writeProblem(w, http.StatusUnauthorized, "authentication required", "the bearer session is invalid or expired")
		return auth.Session{}, false
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "authenticate API session", "error", err)
		writeProblem(w, http.StatusInternalServerError, "internal error", "could not authenticate the session")
		return auth.Session{}, false
	}
	return session, true
}

func (s *server) createChallenge(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.Auth == nil {
		writeProblem(w, http.StatusServiceUnavailable, "authentication unavailable", "authentication is not configured")
		return
	}
	var input struct {
		WalletAddress string `json:"walletAddress"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid request", err.Error())
		return
	}
	challenge, err := s.dependencies.Auth.CreateChallenge(r.Context(), input.WalletAddress)
	if errors.Is(err, auth.ErrInvalidWallet) {
		writeProblem(w, http.StatusBadRequest, "invalid wallet", "walletAddress must be a non-zero Starknet address")
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "create auth challenge", "error", err)
		writeProblem(w, http.StatusInternalServerError, "internal error", "could not create challenge")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusCreated, challenge)
}

func (s *server) createSession(w http.ResponseWriter, r *http.Request) {
	if s.dependencies.Auth == nil {
		writeProblem(w, http.StatusServiceUnavailable, "authentication unavailable", "authentication is not configured")
		return
	}
	var input struct {
		ChallengeID   string   `json:"challengeId"`
		WalletAddress string   `json:"walletAddress"`
		Signature     []string `json:"signature"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		writeProblem(w, http.StatusBadRequest, "invalid request", err.Error())
		return
	}
	if input.ChallengeID == "" || input.WalletAddress == "" || len(input.Signature) == 0 {
		writeProblem(w, http.StatusBadRequest, "invalid request", "challengeId, walletAddress, and signature are required")
		return
	}

	session, err := s.dependencies.Auth.CreateSession(
		r.Context(), input.ChallengeID, input.WalletAddress, input.Signature,
	)
	switch {
	case err == nil:
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusCreated, session)
	case errors.Is(err, auth.ErrInvalidWallet):
		writeProblem(w, http.StatusBadRequest, "invalid wallet", "walletAddress must be a non-zero Starknet address")
	case errors.Is(err, auth.ErrChallengeNotFound),
		errors.Is(err, auth.ErrChallengeUnavailable),
		errors.Is(err, auth.ErrInvalidSignature):
		writeProblem(w, http.StatusUnauthorized, "authentication failed", "challenge or signature is invalid")
	case errors.Is(err, auth.ErrVerificationFailure):
		slog.WarnContext(r.Context(), "wallet verification unavailable", "error", err)
		writeProblem(w, http.StatusServiceUnavailable, "authentication unavailable", "wallet verification is temporarily unavailable")
	default:
		slog.ErrorContext(r.Context(), "create auth session", "error", err)
		writeProblem(w, http.StatusInternalServerError, "internal error", "could not create session")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("request body must contain one JSON object")
		}
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeProblem(w http.ResponseWriter, status int, title, detail string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"title":  title,
			"detail": detail,
		},
	})
}

func cors(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && slices.Contains(allowedOrigins, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			if origin == "" || !slices.Contains(allowedOrigins, origin) {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}
