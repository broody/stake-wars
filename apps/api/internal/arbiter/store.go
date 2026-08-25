package arbiter

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var ErrNoRound = errors.New("no Arbiter round")

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
