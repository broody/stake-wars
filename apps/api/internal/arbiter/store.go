package arbiter

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrNoRound      = errors.New("no Arbiter round")
	ErrNoController = errors.New("no Arbiter controller")
)

type CanonicalRound struct {
	Network             string
	RoundID             uint64
	WhisperAddress      string
	AuctionID           uint64
	ExpectedCreator     string
	PaymentToken        string
	MetadataHash        string
	WinnerPayloadDomain string
	VaultAddress        string
	BillboardStartsAt   *time.Time
	BillboardExpiresAt  *time.Time
	ClaimedController   string
	ClaimedAt           *time.Time
	ActiveArtworkID     string
}

type ControllerRecord struct {
	Address   string
	ClaimedAt time.Time
	StartsAt  *time.Time
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) Current(ctx context.Context, network string) (CanonicalRound, error) {
	var round CanonicalRound
	var billboardStartsAt, billboardExpiresAt sql.NullInt64
	var claimedController, activeArtworkID sql.NullString
	var claimedAtUnix sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			billboard_starts_at, billboard_expires_at, claimed_controller,
			claimed_at, active_artwork_id
		FROM arbiter_rounds
		WHERE network = ?
		ORDER BY round_id DESC
		LIMIT 1
	`, network).Scan(
		&round.Network, &round.RoundID, &round.WhisperAddress, &round.AuctionID,
		&round.ExpectedCreator, &round.PaymentToken, &round.MetadataHash,
		&round.WinnerPayloadDomain, &round.VaultAddress, &billboardStartsAt,
		&billboardExpiresAt, &claimedController, &claimedAtUnix, &activeArtworkID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRound{}, ErrNoRound
	}
	if err != nil {
		return CanonicalRound{}, fmt.Errorf("read current Arbiter round: %w", err)
	}
	if billboardStartsAt.Valid {
		value := time.Unix(billboardStartsAt.Int64, 0).UTC()
		round.BillboardStartsAt = &value
	}
	if billboardExpiresAt.Valid {
		value := time.Unix(billboardExpiresAt.Int64, 0).UTC()
		round.BillboardExpiresAt = &value
	}
	if claimedController.Valid {
		round.ClaimedController = claimedController.String
	}
	if claimedAtUnix.Valid {
		value := time.Unix(claimedAtUnix.Int64, 0).UTC()
		round.ClaimedAt = &value
	}
	if activeArtworkID.Valid {
		round.ActiveArtworkID = activeArtworkID.String
	}
	return round, nil
}

// Controller returns the newest claimed controller independently from the
// newest auction round. This keeps control continuous while a later round is
// pending, resolving, aborted, or settled without a qualifying bid.
func (s *Store) Controller(ctx context.Context, network string) (ControllerRecord, error) {
	var controller ControllerRecord
	var claimedAt int64
	var startsAt sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT claimed_controller, claimed_at, billboard_starts_at
		FROM arbiter_rounds
		WHERE network = ? AND claimed_controller IS NOT NULL AND claimed_at IS NOT NULL
		ORDER BY claimed_at DESC, round_id DESC
		LIMIT 1
	`, network).Scan(&controller.Address, &claimedAt, &startsAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ControllerRecord{}, ErrNoController
	}
	if err != nil {
		return ControllerRecord{}, fmt.Errorf("read current Arbiter controller: %w", err)
	}
	controller.ClaimedAt = time.Unix(claimedAt, 0).UTC()
	if startsAt.Valid {
		value := time.Unix(startsAt.Int64, 0).UTC()
		controller.StartsAt = &value
	}
	return controller, nil
}
