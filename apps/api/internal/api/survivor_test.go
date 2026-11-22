package api

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/survivor"
)

func TestSurvivorRankedAdmission(t *testing.T) {
	deps := testDependencies(t)
	deps.SurvivorAccounts = survivorTestWallet{}
	handler := NewHandler(deps)
	request := func(method, path, body, token string, want int) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != want {
			t.Fatalf("%s: got %d want %d: %s", path, rec.Code, want, rec.Body.String())
		}
		return rec
	}
	const board = "/v1/survivors/leaderboard"
	const runs = "/v1/survivors/runs"
	request(http.MethodGet, board, "", "", 200)
	request(http.MethodGet, board+"?round=xyz", "", "", 400)
	round, err := survivor.NewStore(deps.DB, deps.Config.Network).Open(t.Context(), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"round":%d}`, round)
	rec := request(http.MethodPost, runs, body, "", 201)
	request(http.MethodPost, runs+"/finish", "{}", "", 401)
	token := "signed-test-session"
	hash := sha256.Sum256([]byte(token))
	if _, err := deps.DB.Exec("INSERT INTO auth_sessions VALUES (?,?,unixepoch(),unixepoch()+900,'artwork')", hash[:], "0x123"); err != nil {
		t.Fatal(err)
	}
	request(http.MethodPost, runs+"/finish", "{}", token, 403)
	var challenge auth.ChallengeResponse
	created := request(http.MethodPost, "/v1/auth/challenges", `{"walletAddress":"0x123","scope":"survivor"}`, "", 201)
	if err := json.NewDecoder(created.Body).Decode(&challenge); err != nil || !strings.Contains(string(challenge.TypedData), auth.Survivor.Statement()) {
		t.Fatal("expected a Survivor sign-in")
	}
	var session auth.SessionResponse
	signed := request(http.MethodPost, "/v1/auth/sessions", fmt.Sprintf(`{"walletAddress":"0x123","challengeId":%q,"signature":["0x1"]}`, challenge.ID), "", 201)
	if err := json.NewDecoder(signed.Body).Decode(&session); err != nil || session.Token == "" {
		t.Fatal("expected authenticated session")
	}
	token = session.Token
	request(http.MethodPost, "/v1/sector-artworks/uploads", "{}", token, 403)

	var ticket survivor.Ticket
	if err := json.NewDecoder(rec.Body).Decode(&ticket); err != nil || len(ticket.Token) != 128 {
		t.Fatal("expected a run ticket")
	}
	guestBody := fmt.Sprintf(`{"token":%q,"replay":"AAA=","guestId":"89940506-50f8-4ce7-b6db-338b9bfbad25"}`, ticket.Token)
	request(http.MethodPost, runs+"/finish", guestBody, "", 401)
	request(http.MethodPost, runs+"/finish", guestBody, token, 400)
	// The client cannot supply a score or submit for another player's wallet.
	request(http.MethodPost, runs+"/finish", fmt.Sprintf(`{"token":%q,"destroyed":400}`, ticket.Token), token, 400)
	request(http.MethodPost, runs+"/finish", fmt.Sprintf(`{"token":%q,"replay":""}`, ticket.Token), token, 422)
	request(http.MethodPost, runs+"/finish", `{"token":"unknown","replay":""}`, token, 403)
	rec = request(http.MethodGet, board, "", "", 200)
	var result survivor.Board
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil || result.Round == nil || result.Round.ID != round || len(result.Entries) != 0 {
		t.Fatal("expected open round with no completed runs")
	}
}

type survivorTestWallet struct{}

func (survivorTestWallet) IsOutis(_ context.Context, wallet string) (bool, error) {
	return wallet == "0x123", nil
}
func (survivorTestWallet) VerifySurvivorMessage(_ context.Context, wallet string, data json.RawMessage, sig []string) (bool, error) {
	if wallet != "0x123" || len(sig) != 1 {
		return false, nil
	}
	return strings.Contains(string(data), "SetSurvivorName") && strings.Contains(string(data), `"Name":"Signal"`) && sig[0] == "0xdef", nil
}

func TestSurvivorProfiles(t *testing.T) {
	deps := testDependencies(t)
	deps.SurvivorSignatures = survivorTestWallet{}
	h := NewHandler(deps)
	request := func(method, path, body string, want int) string {
		t.Helper()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, "/v1/survivors/"+path, strings.NewReader(body)))
		if rec.Code != want {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body.String())
		}
		return rec.Body.String()
	}
	const guestID = "89940506-50f8-4ce7-b6db-338b9bfbad25"
	profile := func(id, name string) string { return fmt.Sprintf(`{"guestId":%q,"name":%q}`, id, name) }
	request("POST", "profile", profile("0x123", "Alias"), 400)
	request("POST", "profile", profile(guestID, ""), 400)
	request("POST", "profile", profile(guestID, "Orbit"), 200)
	if body := request("POST", "profile", fmt.Sprintf(`{"guestId":%q}`, guestID), 200); !strings.Contains(body, "Orbit") {
		t.Fatal(body)
	}
	request("POST", "profile", `{"wallet":"0x123","name":"Alias"}`, 400)
	const fields = `"wallet":"0x123","name":"Signal"`
	if body := request("POST", "profile/wallet", "{"+fields+"}", 200); !strings.Contains(body, "SetSurvivorName") {
		t.Fatal(body)
	}
	request("POST", "profile/wallet", "{"+fields+`,"revision":1,"signature":["0x0"]}`, 403)
	signed := "{" + fields + `,"revision":1,"signature":["0xdef"]}`
	request("POST", "profile/wallet", signed, 200)
	request("POST", "profile/wallet", signed, 409)
	if body := request("GET", "profile?wallet=0x000123", "", 200); !strings.Contains(body, "Signal") {
		t.Fatal(body)
	}
	request("POST", "runs", "{}", 201)
	request("POST", "runs/finish", fmt.Sprintf(`{"guestId":%q,"token":"bad"}`, guestID), 401)
	request("POST", "runs/wallet", fmt.Sprintf(`{"guestId":%q,"token":"bad"}`, guestID), 401)
}

func TestSurvivorClipEndpoint(t *testing.T) {
	deps := testDependencies(t)
	handler := NewHandler(deps)
	_, err := deps.DB.Exec(`INSERT INTO survivor_runs (id,network,player,destroyed) VALUES (7,?,'0x5',25),(8,'SN_OTHER','0x5',25);
        INSERT INTO survivor_clips (run_id,clip) VALUES (7,x'1f8b00'),(8,x'1f8b01')`, deps.Config.Network)
	if err != nil {
		t.Fatal(err)
	}
	get := func(path string, want int) *httptest.ResponseRecorder {
		t.Helper()
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != want {
			t.Fatalf("%s: got %d want %d", path, rec.Code, want)
		}
		return rec
	}
	rec := get("/v1/survivors/runs/7/clip", 200)
	if rec.Body.String() != "\x1f\x8b\x00" || rec.Header().Get("Content-Type") != "application/octet-stream" {
		t.Fatalf("clip %q %v", rec.Body.String(), rec.Header())
	}
	get("/v1/survivors/runs/8/clip", 404)
	get("/v1/survivors/runs/9/clip", 404)
	get("/v1/survivors/runs/zero/clip", 400)
}
