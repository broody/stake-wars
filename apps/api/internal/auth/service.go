package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

var (
	ErrInvalidWallet       = errors.New("invalid wallet address")
	ErrInvalidSignature    = errors.New("invalid wallet signature")
	ErrVerificationFailure = errors.New("wallet signature verification failed")
)

type SignatureVerifier interface {
	NormalizeWallet(value string) (string, error)
	TypedData(wallet, nonce string, issuedAt, expiresAt time.Time) (json.RawMessage, error)
	Verify(ctx context.Context, wallet string, typedData json.RawMessage, signature []string) (bool, error)
}

type ServiceConfig struct {
	ChallengeTTL time.Duration
	SessionTTL   time.Duration
}

type ChallengeResponse struct {
	ID            string          `json:"challengeId"`
	WalletAddress string          `json:"walletAddress"`
	TypedData     json.RawMessage `json:"typedData"`
	ExpiresAt     time.Time       `json:"expiresAt"`
}

type SessionResponse struct {
	Token         string    `json:"token"`
	TokenType     string    `json:"tokenType"`
	WalletAddress string    `json:"walletAddress"`
	ExpiresAt     time.Time `json:"expiresAt"`
}

type Service struct {
	store    *Store
	verifier SignatureVerifier
	config   ServiceConfig
	now      func() time.Time
	random   io.Reader
}

func NewService(store *Store, verifier SignatureVerifier, config ServiceConfig) *Service {
	return &Service{
		store:    store,
		verifier: verifier,
		config:   config,
		now:      func() time.Time { return time.Now().UTC() },
		random:   rand.Reader,
	}
}

func (s *Service) CreateChallenge(ctx context.Context, wallet string) (ChallengeResponse, error) {
	wallet, err := s.verifier.NormalizeWallet(wallet)
	if err != nil {
		return ChallengeResponse{}, fmt.Errorf("%w: %v", ErrInvalidWallet, err)
	}

	id, err := randomHex(s.random, 16)
	if err != nil {
		return ChallengeResponse{}, err
	}
	nonce, err := randomHex(s.random, 31)
	if err != nil {
		return ChallengeResponse{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	challenge := Challenge{
		ID:            id,
		WalletAddress: wallet,
		Nonce:         nonce,
		IssuedAt:      now,
		ExpiresAt:     now.Add(s.config.ChallengeTTL),
	}
	typedData, err := s.verifier.TypedData(
		challenge.WalletAddress,
		challenge.Nonce,
		challenge.IssuedAt,
		challenge.ExpiresAt,
	)
	if err != nil {
		return ChallengeResponse{}, fmt.Errorf("build wallet challenge: %w", err)
	}
	if err := s.store.CreateChallenge(ctx, challenge); err != nil {
		return ChallengeResponse{}, err
	}

	return ChallengeResponse{
		ID:            challenge.ID,
		WalletAddress: challenge.WalletAddress,
		TypedData:     typedData,
		ExpiresAt:     challenge.ExpiresAt,
	}, nil
}

func (s *Service) CreateSession(
	ctx context.Context,
	challengeID, wallet string,
	signature []string,
) (SessionResponse, error) {
	wallet, err := s.verifier.NormalizeWallet(wallet)
	if err != nil {
		return SessionResponse{}, fmt.Errorf("%w: %v", ErrInvalidWallet, err)
	}
	challenge, err := s.store.Challenge(ctx, challengeID)
	if err != nil {
		return SessionResponse{}, err
	}
	now := s.now().UTC().Truncate(time.Second)
	if challenge.WalletAddress != wallet || !challenge.ExpiresAt.After(now) {
		return SessionResponse{}, ErrChallengeUnavailable
	}
	typedData, err := s.verifier.TypedData(
		challenge.WalletAddress,
		challenge.Nonce,
		challenge.IssuedAt,
		challenge.ExpiresAt,
	)
	if err != nil {
		return SessionResponse{}, fmt.Errorf("rebuild wallet challenge: %w", err)
	}
	valid, err := s.verifier.Verify(ctx, wallet, typedData, signature)
	if err != nil {
		return SessionResponse{}, fmt.Errorf("%w: %v", ErrVerificationFailure, err)
	}
	if !valid {
		return SessionResponse{}, ErrInvalidSignature
	}

	token, err := randomToken(s.random, 32)
	if err != nil {
		return SessionResponse{}, err
	}
	hash := sha256.Sum256([]byte(token))
	session := Session{
		WalletAddress: wallet,
		CreatedAt:     now,
		ExpiresAt:     now.Add(s.config.SessionTTL),
	}
	if err := s.store.ConsumeChallengeAndCreateSession(
		ctx,
		challenge,
		now,
		hash[:],
		session,
	); err != nil {
		return SessionResponse{}, err
	}

	return SessionResponse{
		Token:         token,
		TokenType:     "Bearer",
		WalletAddress: wallet,
		ExpiresAt:     session.ExpiresAt,
	}, nil
}

func (s *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	hash := sha256.Sum256([]byte(token))
	return s.store.Session(ctx, hash[:], s.now().UTC())
}

func randomHex(source io.Reader, size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := io.ReadFull(source, buffer); err != nil {
		return "", fmt.Errorf("generate random value: %w", err)
	}
	return "0x" + hex.EncodeToString(buffer), nil
}

func randomToken(source io.Reader, size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := io.ReadFull(source, buffer); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
