package beacon

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrNoController = errors.New("no Beacon controller")
	ErrNoBillboard  = errors.New("no Beacon billboard")
)

const (
	sourceWhisper = "whisper"
	sourceOpen    = "open"
)

type ControllerRecord struct {
	RoundID         uint64
	Address         string
	ClaimedAt       time.Time
	ActiveArtworkID string
}

type BillboardRecord struct {
	ImageURL       string
	ThumbnailURL   string
	Description    string
	DestinationURL string
	UpdatedAt      time.Time
}

// Settlement is one verified onchain round result. Every settled open-auction
// round has a winner because only a bid at or above the reserve starts a round.
type Settlement struct {
	RoundID    uint64
	Controller string
	WinningBid string
	BidCount   uint32
	SettledAt  time.Time
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

// ProjectionCursor reports the newest imported Whisper-era round and the newest
// projected open-auction round so projection can resume without overlap.
func (s *Store) ProjectionCursor(
	ctx context.Context,
	network string,
) (legacyRoundID uint64, openRoundID uint64, err error) {
	err = s.db.QueryRowContext(ctx, `
		SELECT
			COALESCE(MAX(CASE WHEN source = ? THEN round_id END), 0),
			COALESCE(MAX(CASE WHEN source = ? THEN round_id END), 0)
		FROM beacon_controllers WHERE network = ?
	`, sourceWhisper, sourceOpen, network).Scan(&legacyRoundID, &openRoundID)
	if err != nil {
		return 0, 0, fmt.Errorf("read Beacon projection cursor: %w", err)
	}
	return legacyRoundID, openRoundID, nil
}

// SaveSettlement records an immutable settled round. Replaying the same
// settlement is a no-op; a different result for the same round fails closed.
func (s *Store) SaveSettlement(ctx context.Context, network string, settlement Settlement) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin Beacon settlement projection: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var existing Settlement
	var source string
	var settledAt int64
	err = tx.QueryRowContext(ctx, `
		SELECT round_id, source, controller, winning_bid, bid_count, settled_at
		FROM beacon_controllers WHERE network = ? AND round_id = ?
	`, network, settlement.RoundID).Scan(
		&existing.RoundID, &source, &existing.Controller, &existing.WinningBid,
		&existing.BidCount, &settledAt,
	)
	if err == nil {
		existing.SettledAt = time.Unix(settledAt, 0).UTC()
		if source != sourceOpen || existing != settlement {
			return fmt.Errorf("project Beacon settlement: conflicting immutable outcome for round %d", settlement.RoundID)
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read existing Beacon settlement: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO beacon_controllers(
			network, round_id, source, controller, winning_bid, bid_count, settled_at
		) VALUES (?, ?, ?, ?, ?, ?, ?)
	`, network, settlement.RoundID, sourceOpen, settlement.Controller,
		settlement.WinningBid, settlement.BidCount, settlement.SettledAt.Unix()); err != nil {
		return fmt.Errorf("insert Beacon settlement: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Beacon settlement projection: %w", err)
	}
	return nil
}

// Controller returns the newest winner. Control stays with that address until
// a later round settles, so an open or unsettled round never creates a gap.
func (s *Store) Controller(ctx context.Context, network string) (ControllerRecord, error) {
	var controller ControllerRecord
	var claimedAt int64
	var activeArtworkID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT round_id, controller, settled_at, active_artwork_id
		FROM beacon_controllers
		WHERE network = ?
		ORDER BY round_id DESC
		LIMIT 1
	`, network).Scan(&controller.RoundID, &controller.Address, &claimedAt, &activeArtworkID)
	if errors.Is(err, sql.ErrNoRows) {
		return ControllerRecord{}, ErrNoController
	}
	if err != nil {
		return ControllerRecord{}, fmt.Errorf("read current Beacon controller: %w", err)
	}
	controller.ClaimedAt = time.Unix(claimedAt, 0).UTC()
	if activeArtworkID.Valid {
		controller.ActiveArtworkID = activeArtworkID.String
	}
	return controller, nil
}

// CurrentBillboard returns the newest published signal independently from the
// current controller. A newly settled winner has an empty publication slot,
// so the prior signal remains active until the winner publishes a replacement.
func (s *Store) CurrentBillboard(ctx context.Context, network string) (BillboardRecord, error) {
	var billboard BillboardRecord
	var updatedAt int64
	err := s.db.QueryRowContext(ctx, `
		SELECT a.image_url, a.thumbnail_url, a.description, a.destination_url,
			a.updated_at
		FROM beacon_controllers c
		JOIN beacon_artworks a
			ON a.network = c.network AND a.id = c.active_artwork_id
		WHERE c.network = ? AND a.moderation_status = 'approved'
		ORDER BY c.round_id DESC
		LIMIT 1
	`, network).Scan(
		&billboard.ImageURL, &billboard.ThumbnailURL, &billboard.Description,
		&billboard.DestinationURL, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return BillboardRecord{}, ErrNoBillboard
	}
	if err != nil {
		return BillboardRecord{}, fmt.Errorf("read current Beacon billboard: %w", err)
	}
	billboard.UpdatedAt = time.Unix(updatedAt, 0).UTC()
	return billboard, nil
}

func (s *Store) History(
	ctx context.Context,
	network string,
	limit int,
	beforeRoundID *uint64,
) ([]HistoryEntry, error) {
	query := `
		SELECT round_id, controller, bid_count, winning_bid
		FROM beacon_controllers
		WHERE network = ?
	`
	arguments := []any{network}
	if beforeRoundID != nil {
		query += " AND round_id < ?"
		arguments = append(arguments, *beforeRoundID)
	}
	query += " ORDER BY round_id DESC LIMIT ?"
	arguments = append(arguments, limit)

	rows, err := s.db.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list Beacon history: %w", err)
	}
	defer rows.Close()

	entries := make([]HistoryEntry, 0)
	for rows.Next() {
		var entry HistoryEntry
		if err := rows.Scan(
			&entry.RoundID, &entry.WinnerAddress, &entry.BidCount, &entry.WinningBid,
		); err != nil {
			return nil, fmt.Errorf("scan Beacon history: %w", err)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate Beacon history: %w", err)
	}
	return entries, nil
}
