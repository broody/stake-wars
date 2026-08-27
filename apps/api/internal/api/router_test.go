package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/database"
)

func TestHealth(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	NewHandler(Dependencies{}).ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
	if got, want := response.Body.String(), "{\"status\":\"ok\"}\n"; got != want {
		t.Fatalf("expected body %q, got %q", want, got)
	}
}

func TestReadinessAndPublicConfig(t *testing.T) {
	dependencies := testDependencies(t)
	handler := NewHandler(dependencies)

	readyRequest := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	readyResponse := httptest.NewRecorder()
	handler.ServeHTTP(readyResponse, readyRequest)
	if readyResponse.Code != http.StatusOK {
		t.Fatalf("expected ready status, got %d: %s", readyResponse.Code, readyResponse.Body.String())
	}

	configRequest := httptest.NewRequest(http.MethodGet, "/v1/config", nil)
	configResponse := httptest.NewRecorder()
	handler.ServeHTTP(configResponse, configRequest)
	if configResponse.Code != http.StatusOK {
		t.Fatalf("expected config status, got %d", configResponse.Code)
	}
	var payload struct {
		MaxImageBytes int64 `json:"maxImageBytes"`
	}
	if err := json.NewDecoder(configResponse.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.MaxImageBytes != 2*1024*1024 {
		t.Fatalf("unexpected image limit %d", payload.MaxImageBytes)
	}
}

func TestArbiterHasStableNoRoundResponse(t *testing.T) {
	handler := NewHandler(testDependencies(t))
	request := httptest.NewRequest(http.MethodGet, "/v1/arbiter", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected Arbiter status, got %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		Network string          `json:"network"`
		Phase   string          `json:"phase"`
		Round   json.RawMessage `json:"round"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Network != "SN_MAIN" || payload.Phase != "none" || string(payload.Round) != "null" {
		t.Fatalf("unexpected no-round response: %+v", payload)
	}
	if got := response.Header().Get("Cache-Control"); got != "public, max-age=5" {
		t.Fatalf("unexpected Cache-Control %q", got)
	}
}

func TestArbiterHistoryIsPaginatedAndPublic(t *testing.T) {
	dependencies := testDependencies(t)
	winner := "0x777"
	dependencies.ArbiterHistory = apiTestArbiterHistory{
		page: arbiter.HistoryPage{
			Entries: []arbiter.HistoryEntry{{
				RoundID: 4, WinnerAddress: &winner, BidCount: 3, WinningBid: "100",
			}},
		},
	}
	handler := NewHandler(dependencies)
	request := httptest.NewRequest(http.MethodGet, "/v1/arbiter/history?limit=25", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected history status, got %d: %s", response.Code, response.Body.String())
	}
	var payload arbiter.HistoryPage
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Entries) != 1 || payload.Entries[0].RoundID != 4 ||
		payload.Entries[0].WinnerAddress == nil || payload.Entries[0].BidCount != 3 {
		t.Fatalf("unexpected history response: %+v", payload)
	}
	if got := response.Header().Get("Cache-Control"); got != "public, max-age=10" {
		t.Fatalf("unexpected Cache-Control %q", got)
	}

	invalidRequest := httptest.NewRequest(http.MethodGet, "/v1/arbiter/history?limit=nope", nil)
	invalidResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidResponse, invalidRequest)
	if invalidResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid limit rejection, got %d", invalidResponse.Code)
	}
}

func TestChallengeAndSessionFlow(t *testing.T) {
	handler := NewHandler(testDependencies(t))

	challengeRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/auth/challenges",
		strings.NewReader(`{"walletAddress":"0x123"}`),
	)
	challengeRequest.Header.Set("Content-Type", "application/json")
	challengeResponse := httptest.NewRecorder()
	handler.ServeHTTP(challengeResponse, challengeRequest)
	if challengeResponse.Code != http.StatusCreated {
		t.Fatalf("expected challenge status, got %d: %s", challengeResponse.Code, challengeResponse.Body.String())
	}
	var challenge struct {
		ID            string          `json:"challengeId"`
		WalletAddress string          `json:"walletAddress"`
		TypedData     json.RawMessage `json:"typedData"`
	}
	if err := json.NewDecoder(challengeResponse.Body).Decode(&challenge); err != nil {
		t.Fatal(err)
	}
	if challenge.ID == "" || len(challenge.TypedData) == 0 {
		t.Fatalf("unexpected challenge: %+v", challenge)
	}

	sessionBody, err := json.Marshal(map[string]any{
		"challengeId":   challenge.ID,
		"walletAddress": challenge.WalletAddress,
		"signature":     []string{"0x1", "0x2"},
	})
	if err != nil {
		t.Fatal(err)
	}
	sessionRequest := httptest.NewRequest(http.MethodPost, "/v1/auth/sessions", strings.NewReader(string(sessionBody)))
	sessionRequest.Header.Set("Content-Type", "application/json")
	sessionResponse := httptest.NewRecorder()
	handler.ServeHTTP(sessionResponse, sessionRequest)
	if sessionResponse.Code != http.StatusCreated {
		t.Fatalf("expected session status, got %d: %s", sessionResponse.Code, sessionResponse.Body.String())
	}
	var session struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(sessionResponse.Body).Decode(&session); err != nil {
		t.Fatal(err)
	}
	if session.Token == "" {
		t.Fatal("expected bearer token")
	}
}

func TestCORSAllowsConfiguredOriginOnly(t *testing.T) {
	handler := NewHandler(Dependencies{AllowedOrigins: []string{"https://stakewars.gg"}})

	allowedRequest := httptest.NewRequest(http.MethodOptions, "/v1/auth/challenges", nil)
	allowedRequest.Header.Set("Origin", "https://stakewars.gg")
	allowedResponse := httptest.NewRecorder()
	handler.ServeHTTP(allowedResponse, allowedRequest)
	if allowedResponse.Code != http.StatusNoContent {
		t.Fatalf("expected allowed preflight, got %d", allowedResponse.Code)
	}
	if got := allowedResponse.Header().Get("Access-Control-Allow-Origin"); got != "https://stakewars.gg" {
		t.Fatalf("unexpected allowed origin %q", got)
	}

	deniedRequest := httptest.NewRequest(http.MethodOptions, "/v1/auth/challenges", nil)
	deniedRequest.Header.Set("Origin", "https://attacker.example")
	deniedResponse := httptest.NewRecorder()
	handler.ServeHTTP(deniedResponse, deniedRequest)
	if deniedResponse.Code != http.StatusForbidden {
		t.Fatalf("expected denied preflight, got %d", deniedResponse.Code)
	}
}

func TestSectorImagesArePublicAndUploadsRequireAuthentication(t *testing.T) {
	handler := NewHandler(testDependencies(t))

	listRequest := httptest.NewRequest(http.MethodGet, "/v1/sector-artworks", nil)
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected public image list, got %d: %s", listResponse.Code, listResponse.Body.String())
	}
	if got, want := listResponse.Body.String(), "{\"artworks\":[]}\n"; got != want {
		t.Fatalf("expected body %q, got %q", want, got)
	}

	uploadRequest := httptest.NewRequest(
		http.MethodPost,
		"/v1/sector-artworks/uploads",
		strings.NewReader(`{"sectorId":42}`),
	)
	uploadRequest.Header.Set("Content-Type", "application/json")
	uploadResponse := httptest.NewRecorder()
	handler.ServeHTTP(uploadResponse, uploadRequest)
	if uploadResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected upload authentication requirement, got %d", uploadResponse.Code)
	}
}

func testDependencies(t *testing.T) Dependencies {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	authService := auth.NewService(
		auth.NewStore(db),
		apiTestVerifier{},
		auth.ServiceConfig{ChallengeTTL: 5 * time.Minute, SessionTTL: 15 * time.Minute},
	)
	return Dependencies{
		DB:             db,
		Auth:           authService,
		Config:         PublicConfig{Network: "SN_MAIN", MaxImageBytes: 2 * 1024 * 1024, AuthEnabled: true},
		AllowedOrigins: []string{"https://stakewars.gg"},
	}
}

type apiTestVerifier struct{}

type apiTestArbiterHistory struct {
	page arbiter.HistoryPage
	err  error
}

func (h apiTestArbiterHistory) List(
	context.Context,
	int,
	string,
) (arbiter.HistoryPage, error) {
	return h.page, h.err
}

func (apiTestVerifier) NormalizeWallet(value string) (string, error) {
	return value, nil
}

func (apiTestVerifier) TypedData(
	wallet, nonce string,
	issuedAt, expiresAt time.Time,
) (json.RawMessage, error) {
	return json.Marshal(map[string]any{
		"wallet":    wallet,
		"nonce":     nonce,
		"issuedAt":  issuedAt.Unix(),
		"expiresAt": expiresAt.Unix(),
	})
}

func (apiTestVerifier) Verify(
	context.Context,
	string,
	json.RawMessage,
	[]string,
) (bool, error) {
	return true, nil
}
