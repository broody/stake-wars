package beacon

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrNoRound      = errors.New("no Beacon round")
	ErrNoController = errors.New("no Beacon controller")
	ErrNoBillboard  = errors.New("no Beacon billboard")
)

type CanonicalRound struct {
	Network                string
	RoundID                uint64
	WhisperAddress         string
	AuctionID              uint64
	ExpectedCreator        string
	PaymentToken           string
	MetadataHash           string
	WinnerPayloadDomain    string
	VaultAddress           string
	BiddingDurationSeconds uint64
	BillboardStartsAt      *time.Time
	BillboardExpiresAt     *time.Time
	ClaimedController      string
	ClaimedAt              *time.Time
	ActiveArtworkID        string
}

type ControllerRecord struct {
	RoundID         uint64
	Address         string
	ClaimedAt       time.Time
	StartsAt        *time.Time
	ActiveArtworkID string
}

type BillboardRecord struct {
	ImageURL       string
	ThumbnailURL   string
	Description    string
	DestinationURL string
	UpdatedAt      time.Time
}

type SettlementProjection struct {
	RoundID                   uint64
	WhisperAddress            string
	AuctionID                 uint64
	HasWinner                 bool
	WinnerGroupHandle         string
	WinnerCommitment          string
	WinningBid                string
	SecondHighestBid          string
	ClearingPrice             string
	FundedBidCount            uint32
	SettlementHash            string
	SettlementTransactionHash string
	SettledAt                 time.Time
}

type UnresolvedWinner struct {
	RoundID           uint64
	AuctionID         uint64
	WinnerGroupHandle string
	WinnerCommitment  string
	SettledAt         time.Time
}

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) RegisterRound(ctx context.Context, round CanonicalRound) error {
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO beacon_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			bidding_duration_seconds
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(network, round_id) DO NOTHING
	`, round.Network, round.RoundID, round.WhisperAddress, round.AuctionID,
		round.ExpectedCreator, round.PaymentToken, round.MetadataHash,
		round.WinnerPayloadDomain, round.VaultAddress, round.BiddingDurationSeconds)
	if err != nil {
		return fmt.Errorf("register Beacon round: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("register Beacon round: %w", err)
	}
	if rows == 1 {
		return nil
	}
	existing, err := s.round(ctx, round.Network, round.RoundID)
	if err != nil {
		return err
	}
	if !sameCanonicalRoundIdentity(existing, round) {
		return fmt.Errorf("register Beacon round: conflicting canonical round")
	}
	if existing.BiddingDurationSeconds == 0 && round.BiddingDurationSeconds > 0 {
		result, err := s.db.ExecContext(ctx, `
			UPDATE beacon_rounds SET bidding_duration_seconds = ?, updated_at = unixepoch()
			WHERE network = ? AND round_id = ? AND bidding_duration_seconds = 0
		`, round.BiddingDurationSeconds, round.Network, round.RoundID)
		if err != nil {
			return fmt.Errorf("record Beacon round schedule: %w", err)
		}
		rows, err := result.RowsAffected()
		if err != nil || rows != 1 {
			return fmt.Errorf("record Beacon round schedule: round was not updated")
		}
		return nil
	}
	if existing.BiddingDurationSeconds != round.BiddingDurationSeconds {
		return fmt.Errorf("register Beacon round: conflicting bidding duration")
	}
	return nil
}

func (s *Store) round(ctx context.Context, network string, roundID uint64) (CanonicalRound, error) {
	var round CanonicalRound
	err := s.db.QueryRowContext(ctx, `
		SELECT network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			bidding_duration_seconds
		FROM beacon_rounds WHERE network = ? AND round_id = ?
	`, network, roundID).Scan(&round.Network, &round.RoundID, &round.WhisperAddress,
		&round.AuctionID, &round.ExpectedCreator, &round.PaymentToken, &round.MetadataHash,
		&round.WinnerPayloadDomain, &round.VaultAddress, &round.BiddingDurationSeconds)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRound{}, ErrNoRound
	}
	if err != nil {
		return CanonicalRound{}, fmt.Errorf("read Beacon round: %w", err)
	}
	return round, nil
}

// PrepareCycle installs the unique predecessor-to-successor intent before any
// external transaction is requested. Its return value reports an already
// registered successor.
func (s *Store) PrepareCycle(
	ctx context.Context,
	predecessor CanonicalRound,
	successorRoundID uint64,
	metadataHash string,
) (bool, error) {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO beacon_cycle_jobs(
			network, predecessor_round_id, predecessor_whisper_address,
			predecessor_auction_id, successor_round_id, expected_metadata_hash
		) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(network, predecessor_round_id) DO NOTHING
	`, predecessor.Network, predecessor.RoundID, predecessor.WhisperAddress,
		predecessor.AuctionID, successorRoundID, metadataHash)
	if err != nil {
		return false, fmt.Errorf("prepare Beacon cycle: %w", err)
	}
	var storedSuccessor uint64
	var storedMetadata, state string
	err = s.db.QueryRowContext(ctx, `
		SELECT successor_round_id, expected_metadata_hash, state
		FROM beacon_cycle_jobs WHERE network = ? AND predecessor_round_id = ?
	`, predecessor.Network, predecessor.RoundID).Scan(&storedSuccessor, &storedMetadata, &state)
	if err != nil {
		return false, fmt.Errorf("read Beacon cycle: %w", err)
	}
	if storedSuccessor != successorRoundID || storedMetadata != metadataHash {
		return false, fmt.Errorf("prepare Beacon cycle: conflicting successor intent")
	}
	return state == "registered", nil
}

func (s *Store) MarkCycleSubmitted(
	ctx context.Context,
	network string,
	predecessorRoundID uint64,
	transactionHash string,
) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE beacon_cycle_jobs SET state = 'submitted', transaction_hash = ?,
			attempts = attempts + 1, last_error = NULL, updated_at = unixepoch()
		WHERE network = ? AND predecessor_round_id = ? AND state != 'registered'
	`, transactionHash, network, predecessorRoundID)
	if err != nil {
		return fmt.Errorf("mark Beacon cycle submitted: %w", err)
	}
	return nil
}

func (s *Store) MarkCycleRegistered(
	ctx context.Context,
	network string,
	predecessorRoundID uint64,
) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE beacon_cycle_jobs SET state = 'registered', last_error = NULL,
			updated_at = unixepoch()
		WHERE network = ? AND predecessor_round_id = ?
	`, network, predecessorRoundID)
	if err != nil {
		return fmt.Errorf("mark Beacon cycle registered: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("mark Beacon cycle registered: cycle job not found")
	}
	return nil
}

func (s *Store) Current(ctx context.Context, network string) (CanonicalRound, error) {
	var round CanonicalRound
	var billboardStartsAt, billboardExpiresAt sql.NullInt64
	var claimedController, activeArtworkID sql.NullString
	var claimedAtUnix sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			bidding_duration_seconds,
			billboard_starts_at, billboard_expires_at, claimed_controller,
			claimed_at, active_artwork_id
		FROM beacon_rounds
		WHERE network = ?
		ORDER BY round_id DESC
		LIMIT 1
	`, network).Scan(
		&round.Network, &round.RoundID, &round.WhisperAddress, &round.AuctionID,
		&round.ExpectedCreator, &round.PaymentToken, &round.MetadataHash,
		&round.WinnerPayloadDomain, &round.VaultAddress, &round.BiddingDurationSeconds,
		&billboardStartsAt,
		&billboardExpiresAt, &claimedController, &claimedAtUnix, &activeArtworkID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRound{}, ErrNoRound
	}
	if err != nil {
		return CanonicalRound{}, fmt.Errorf("read current Beacon round: %w", err)
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
	var activeArtworkID sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT round_id, claimed_controller, claimed_at, billboard_starts_at,
			active_artwork_id
		FROM beacon_rounds
		WHERE network = ? AND claimed_controller IS NOT NULL AND claimed_at IS NOT NULL
		ORDER BY round_id DESC
		LIMIT 1
	`, network).Scan(
		&controller.RoundID, &controller.Address, &claimedAt, &startsAt,
		&activeArtworkID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return ControllerRecord{}, ErrNoController
	}
	if err != nil {
		return ControllerRecord{}, fmt.Errorf("read current Beacon controller: %w", err)
	}
	controller.ClaimedAt = time.Unix(claimedAt, 0).UTC()
	if startsAt.Valid {
		value := time.Unix(startsAt.Int64, 0).UTC()
		controller.StartsAt = &value
	}
	if activeArtworkID.Valid {
		controller.ActiveArtworkID = activeArtworkID.String
	}
	return controller, nil
}

func (s *Store) CurrentController(
	ctx context.Context,
	network string,
) (uint64, string, string, error) {
	controller, err := s.Controller(ctx, network)
	if err != nil {
		return 0, "", "", err
	}
	return controller.RoundID, controller.Address, controller.ActiveArtworkID, nil
}

func (s *Store) Billboard(
	ctx context.Context,
	network string,
	artworkID string,
) (BillboardRecord, error) {
	var billboard BillboardRecord
	var updatedAt int64
	err := s.db.QueryRowContext(ctx, `
		SELECT image_url, thumbnail_url, description, destination_url, updated_at
		FROM beacon_artworks
		WHERE network = ? AND id = ? AND moderation_status = 'approved'
	`, network, artworkID).Scan(
		&billboard.ImageURL, &billboard.ThumbnailURL, &billboard.Description,
		&billboard.DestinationURL, &updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return BillboardRecord{}, ErrNoBillboard
	}
	if err != nil {
		return BillboardRecord{}, fmt.Errorf("read Beacon billboard: %w", err)
	}
	billboard.UpdatedAt = time.Unix(updatedAt, 0).UTC()
	return billboard, nil
}

func (s *Store) UnprojectedRounds(
	ctx context.Context,
	network string,
) ([]CanonicalRound, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT r.network, r.round_id, r.whisper_address, r.auction_id,
			r.expected_creator, r.payment_token, r.metadata_hash,
			r.winner_payload_domain, r.vault_address, r.bidding_duration_seconds
		FROM beacon_rounds r
		LEFT JOIN beacon_round_outcomes o
			ON o.network = r.network AND o.round_id = r.round_id
		WHERE r.network = ? AND o.round_id IS NULL
		ORDER BY r.round_id ASC
	`, network)
	if err != nil {
		return nil, fmt.Errorf("list unprojected Beacon rounds: %w", err)
	}
	defer rows.Close()

	rounds := make([]CanonicalRound, 0)
	for rows.Next() {
		var round CanonicalRound
		if err := rows.Scan(
			&round.Network,
			&round.RoundID,
			&round.WhisperAddress,
			&round.AuctionID,
			&round.ExpectedCreator,
			&round.PaymentToken,
			&round.MetadataHash,
			&round.WinnerPayloadDomain,
			&round.VaultAddress,
			&round.BiddingDurationSeconds,
		); err != nil {
			return nil, fmt.Errorf("scan unprojected Beacon round: %w", err)
		}
		rounds = append(rounds, round)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate unprojected Beacon rounds: %w", err)
	}
	return rounds, nil
}

func (s *Store) SaveSettlement(
	ctx context.Context,
	network string,
	projection SettlementProjection,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin Beacon settlement projection: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var whisperAddress string
	var auctionID uint64
	err = tx.QueryRowContext(ctx, `
		SELECT whisper_address, auction_id
		FROM beacon_rounds
		WHERE network = ? AND round_id = ?
	`, network, projection.RoundID).Scan(&whisperAddress, &auctionID)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("project Beacon settlement: %w", ErrNoRound)
	}
	if err != nil {
		return fmt.Errorf("read projected Beacon round: %w", err)
	}
	if whisperAddress != projection.WhisperAddress || auctionID != projection.AuctionID {
		return fmt.Errorf("project Beacon settlement: canonical identity mismatch")
	}

	var existing SettlementProjection
	var hasWinner int
	var settledAt int64
	err = tx.QueryRowContext(ctx, `
		SELECT round_id, whisper_address, auction_id, has_winner,
			winner_group_handle, winner_commitment, winning_bid,
			second_highest_bid, clearing_price, funded_bid_count,
			settlement_hash, COALESCE(settlement_transaction_hash, ''), settled_at
		FROM beacon_round_outcomes
		WHERE network = ? AND round_id = ?
	`, network, projection.RoundID).Scan(
		&existing.RoundID,
		&existing.WhisperAddress,
		&existing.AuctionID,
		&hasWinner,
		&existing.WinnerGroupHandle,
		&existing.WinnerCommitment,
		&existing.WinningBid,
		&existing.SecondHighestBid,
		&existing.ClearingPrice,
		&existing.FundedBidCount,
		&existing.SettlementHash,
		&existing.SettlementTransactionHash,
		&settledAt,
	)
	if err == nil {
		existing.HasWinner = hasWinner == 1
		existing.SettledAt = time.Unix(settledAt, 0).UTC()
		if existing != projection {
			return fmt.Errorf("project Beacon settlement: conflicting immutable outcome")
		}
		return nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read existing Beacon settlement: %w", err)
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO beacon_round_outcomes(
			network, round_id, whisper_address, auction_id, terminal_status,
			has_winner, winner_group_handle, winner_commitment, winning_bid,
			second_highest_bid, clearing_price,
			funded_bid_count, settlement_hash, settlement_transaction_hash,
			settled_at
		) VALUES (
			?, ?, ?, ?, 'settled',
			?, ?, ?, ?, ?,
			?, ?, ?, NULLIF(?, ''), ?
		)
	`,
		network,
		projection.RoundID,
		projection.WhisperAddress,
		projection.AuctionID,
		boolInt(projection.HasWinner),
		projection.WinnerGroupHandle,
		projection.WinnerCommitment,
		projection.WinningBid,
		projection.SecondHighestBid,
		projection.ClearingPrice,
		projection.FundedBidCount,
		projection.SettlementHash,
		projection.SettlementTransactionHash,
		projection.SettledAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("insert Beacon settlement: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Beacon settlement projection: %w", err)
	}
	return nil
}

func (s *Store) UnresolvedWinners(
	ctx context.Context,
	network string,
) ([]UnresolvedWinner, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT o.round_id, o.auction_id, o.winner_group_handle,
			o.winner_commitment, o.settled_at
		FROM beacon_round_outcomes o
		JOIN beacon_rounds r
			ON r.network = o.network AND r.round_id = o.round_id
		WHERE o.network = ? AND o.terminal_status = 'settled'
			AND o.has_winner = 1 AND r.claimed_controller IS NULL
		ORDER BY o.round_id ASC
	`, network)
	if err != nil {
		return nil, fmt.Errorf("list unresolved Beacon winners: %w", err)
	}
	defer rows.Close()

	winners := make([]UnresolvedWinner, 0)
	for rows.Next() {
		var winner UnresolvedWinner
		var settledAt int64
		if err := rows.Scan(
			&winner.RoundID,
			&winner.AuctionID,
			&winner.WinnerGroupHandle,
			&winner.WinnerCommitment,
			&settledAt,
		); err != nil {
			return nil, fmt.Errorf("scan unresolved Beacon winner: %w", err)
		}
		winner.SettledAt = time.Unix(settledAt, 0).UTC()
		winners = append(winners, winner)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate unresolved Beacon winners: %w", err)
	}
	return winners, nil
}

// ResolveWinner atomically activates the address disclosed from the winning
// encrypted capsule after its group and commitment match the immutable result.
func (s *Store) ResolveWinner(
	ctx context.Context,
	network string,
	winner UnresolvedWinner,
	address string,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin Beacon winner resolution: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var auctionID uint64
	var winnerGroup, winnerCommitment string
	var hasWinner int
	var currentAddress sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT o.auction_id, o.has_winner, o.winner_group_handle,
			o.winner_commitment, r.claimed_controller
		FROM beacon_round_outcomes o
		JOIN beacon_rounds r
			ON r.network = o.network AND r.round_id = o.round_id
		WHERE o.network = ? AND o.round_id = ? AND o.terminal_status = 'settled'
	`, network, winner.RoundID).Scan(
		&auctionID, &hasWinner, &winnerGroup, &winnerCommitment, &currentAddress,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("resolve Beacon winner: settlement not found")
	}
	if err != nil {
		return fmt.Errorf("read Beacon winner settlement: %w", err)
	}
	if hasWinner != 1 || auctionID != winner.AuctionID ||
		winnerGroup != winner.WinnerGroupHandle || winnerCommitment != winner.WinnerCommitment {
		return fmt.Errorf("resolve Beacon winner: immutable outcome mismatch")
	}
	if currentAddress.Valid {
		if currentAddress.String != address {
			return fmt.Errorf("resolve Beacon winner: conflicting address")
		}
		return nil
	}

	result, err := tx.ExecContext(ctx, `
		UPDATE beacon_rounds
		SET claimed_controller = ?, claimed_at = ?, billboard_starts_at = ?,
			updated_at = unixepoch()
		WHERE network = ? AND round_id = ? AND claimed_controller IS NULL
	`, address, winner.SettledAt.Unix(), winner.SettledAt.Unix(), network, winner.RoundID)
	if err != nil {
		return fmt.Errorf("save resolved Beacon winner: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("save resolved Beacon winner: round was not updated")
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Beacon winner resolution: %w", err)
	}
	return nil
}

func (s *Store) History(
	ctx context.Context,
	network string,
	limit int,
	beforeRoundID *uint64,
) ([]HistoryEntry, error) {
	query := `
		SELECT o.round_id, r.claimed_controller, o.funded_bid_count, o.winning_bid
		FROM beacon_round_outcomes o
		JOIN beacon_rounds r
			ON r.network = o.network AND r.round_id = o.round_id
		WHERE o.network = ? AND o.terminal_status = 'settled' AND o.has_winner = 1
	`
	arguments := []any{network}
	if beforeRoundID != nil {
		query += " AND o.round_id < ?"
		arguments = append(arguments, *beforeRoundID)
	}
	query += " ORDER BY o.round_id DESC LIMIT ?"
	arguments = append(arguments, limit)

	rows, err := s.db.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, fmt.Errorf("list Beacon history: %w", err)
	}
	defer rows.Close()

	entries := make([]HistoryEntry, 0)
	for rows.Next() {
		var entry HistoryEntry
		var winner sql.NullString
		if err := rows.Scan(
			&entry.RoundID,
			&winner,
			&entry.BidCount,
			&entry.WinningBid,
		); err != nil {
			return nil, fmt.Errorf("scan Beacon history: %w", err)
		}
		if winner.Valid {
			entry.WinnerAddress = &winner.String
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate Beacon history: %w", err)
	}
	return entries, nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func sameCanonicalRoundIdentity(left, right CanonicalRound) bool {
	return left.Network == right.Network && left.RoundID == right.RoundID &&
		left.WhisperAddress == right.WhisperAddress && left.AuctionID == right.AuctionID &&
		left.ExpectedCreator == right.ExpectedCreator && left.PaymentToken == right.PaymentToken &&
		left.MetadataHash == right.MetadataHash &&
		left.WinnerPayloadDomain == right.WinnerPayloadDomain &&
		left.VaultAddress == right.VaultAddress
}
