package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrChallengeNotFound    = errors.New("challenge not found")
	ErrChallengeUnavailable = errors.New("challenge expired or already used")
	ErrSessionNotFound      = errors.New("session not found")
)

type Challenge struct {
	ID            string
	WalletAddress string
	Nonce         string
	IssuedAt      time.Time
	ExpiresAt     time.Time
}

type Session struct {
	WalletAddress string
	CreatedAt     time.Time
	ExpiresAt     time.Time
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) CreateChallenge(ctx context.Context, challenge Challenge) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO auth_challenges(id, wallet_address, nonce, issued_at, expires_at)
		VALUES (?, ?, ?, ?, ?)
	`, challenge.ID, challenge.WalletAddress, challenge.Nonce, challenge.IssuedAt.Unix(), challenge.ExpiresAt.Unix())
	if err != nil {
		return fmt.Errorf("insert auth challenge: %w", err)
	}
	return nil
}

func (s *Store) Challenge(ctx context.Context, id string) (Challenge, error) {
	var challenge Challenge
	var issuedAt, expiresAt int64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, wallet_address, nonce, issued_at, expires_at
		FROM auth_challenges
		WHERE id = ?
	`, id).Scan(
		&challenge.ID,
		&challenge.WalletAddress,
		&challenge.Nonce,
		&issuedAt,
		&expiresAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Challenge{}, ErrChallengeNotFound
	}
	if err != nil {
		return Challenge{}, fmt.Errorf("read auth challenge: %w", err)
	}
	challenge.IssuedAt = time.Unix(issuedAt, 0).UTC()
	challenge.ExpiresAt = time.Unix(expiresAt, 0).UTC()
	return challenge, nil
}

// ConsumeChallengeAndCreateSession atomically prevents challenge replay and
// persists the new session.
func (s *Store) ConsumeChallengeAndCreateSession(
	ctx context.Context,
	challenge Challenge,
	consumedAt time.Time,
	tokenHash []byte,
	session Session,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin auth transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `
		UPDATE auth_challenges
		SET consumed_at = ?
		WHERE id = ?
		  AND wallet_address = ?
		  AND consumed_at IS NULL
		  AND expires_at > ?
	`, consumedAt.Unix(), challenge.ID, challenge.WalletAddress, consumedAt.Unix())
	if err != nil {
		return fmt.Errorf("consume auth challenge: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("inspect consumed challenge: %w", err)
	}
	if rows != 1 {
		return ErrChallengeUnavailable
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO auth_sessions(token_hash, wallet_address, created_at, expires_at)
		VALUES (?, ?, ?, ?)
	`, tokenHash, session.WalletAddress, session.CreatedAt.Unix(), session.ExpiresAt.Unix()); err != nil {
		return fmt.Errorf("insert auth session: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit auth transaction: %w", err)
	}
	return nil
}

func (s *Store) Session(ctx context.Context, tokenHash []byte, now time.Time) (Session, error) {
	var session Session
	var createdAt, expiresAt int64
	err := s.db.QueryRowContext(ctx, `
		SELECT wallet_address, created_at, expires_at
		FROM auth_sessions
		WHERE token_hash = ? AND expires_at > ?
	`, tokenHash, now.Unix()).Scan(&session.WalletAddress, &createdAt, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("read auth session: %w", err)
	}
	session.CreatedAt = time.Unix(createdAt, 0).UTC()
	session.ExpiresAt = time.Unix(expiresAt, 0).UTC()
	return session, nil
}
