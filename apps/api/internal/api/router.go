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
	"time"

	"stakewars.com/api/internal/auth"
)

const maxJSONBodyBytes = 64 * 1024

type PublicConfig struct {
	Network       string
	MaxImageBytes int64
	AuthEnabled   bool
}

type Dependencies struct {
	DB             *sql.DB
	Auth           *auth.Service
	Config         PublicConfig
	AllowedOrigins []string
}

// NewHandler returns the API's HTTP routes.
func NewHandler(dependencies Dependencies) http.Handler {
	server := &server{dependencies: dependencies}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /readyz", server.ready)
	mux.HandleFunc("GET /v1/config", server.publicConfig)
	mux.HandleFunc("POST /v1/auth/challenges", server.createChallenge)
	mux.HandleFunc("POST /v1/auth/sessions", server.createSession)

	return securityHeaders(cors(dependencies.AllowedOrigins, mux))
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
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *server) publicConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"network":             s.dependencies.Config.Network,
		"maxImageBytes":       s.dependencies.Config.MaxImageBytes,
		"authEnabled":         s.dependencies.Config.AuthEnabled,
		"supportedImageTypes": []string{"image/webp", "image/jpeg", "image/png"},
	})
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
