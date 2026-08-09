package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

type fakeVerifier struct {
	valid bool
}

func (f *fakeVerifier) NormalizeWallet(value string) (string, error) {
	if value == "" || value == "0x0" {
		return "", errors.New("invalid address")
	}
	return value, nil
}

func (f *fakeVerifier) TypedData(
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

func (f *fakeVerifier) Verify(
	context.Context,
	string,
	json.RawMessage,
	[]string,
) (bool, error) {
	return f.valid, nil
}

func TestChallengeCreatesSingleUseSession(t *testing.T) {
	service := newTestService(t, &fakeVerifier{valid: true})

	challenge, err := service.CreateChallenge(context.Background(), "0x123")
	if err != nil {
		t.Fatal(err)
	}
	if challenge.WalletAddress != "0x123" || len(challenge.TypedData) == 0 {
		t.Fatalf("unexpected challenge: %+v", challenge)
	}

	session, err := service.CreateSession(
		context.Background(), challenge.ID, challenge.WalletAddress, []string{"0x1", "0x2"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if session.Token == "" || session.TokenType != "Bearer" {
		t.Fatalf("unexpected session: %+v", session)
	}

	stored, err := service.Authenticate(context.Background(), session.Token)
	if err != nil {
		t.Fatal(err)
	}
	if stored.WalletAddress != challenge.WalletAddress {
		t.Fatalf("unexpected authenticated wallet %s", stored.WalletAddress)
	}

	if _, err := service.CreateSession(
		context.Background(), challenge.ID, challenge.WalletAddress, []string{"0x1", "0x2"},
	); !errors.Is(err, ErrChallengeUnavailable) {
		t.Fatalf("expected replay rejection, got %v", err)
	}
}

func TestExpiredChallengeCannotCreateSession(t *testing.T) {
	service := newTestService(t, &fakeVerifier{valid: true})
	now := service.now()

	challenge, err := service.CreateChallenge(context.Background(), "0x123")
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time { return now.Add(6 * time.Minute) }

	if _, err := service.CreateSession(
		context.Background(), challenge.ID, challenge.WalletAddress, []string{"0x1"},
	); !errors.Is(err, ErrChallengeUnavailable) {
		t.Fatalf("expected expired challenge rejection, got %v", err)
	}
}

func TestInvalidSignatureCannotCreateSession(t *testing.T) {
	service := newTestService(t, &fakeVerifier{valid: false})
	challenge, err := service.CreateChallenge(context.Background(), "0x123")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.CreateSession(
		context.Background(), challenge.ID, challenge.WalletAddress, []string{"0x1"},
	); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected signature rejection, got %v", err)
	}
}

func newTestService(t *testing.T, verifier SignatureVerifier) *Service {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	service := NewService(
		NewStore(db),
		verifier,
		ServiceConfig{ChallengeTTL: 5 * time.Minute, SessionTTL: 15 * time.Minute},
	)
	service.now = func() time.Time { return time.Unix(1_700_000_000, 0).UTC() }
	service.random = bytes.NewReader(bytes.Repeat([]byte{0x42}, 256))
	return service
}
