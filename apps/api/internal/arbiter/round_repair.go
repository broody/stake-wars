package arbiter

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"stakewars.com/api/internal/starknet"
)

// RoundLabelRepair moves one incorrectly labelled open round to its intended
// label and fills the vacated label with the explicitly identified auction.
// It exists for operational repair of duplicate coordinator creation, not for
// normal auction cycling.
type RoundLabelRepair struct {
	ExistingRoundID   uint64
	ExistingAuctionID uint64
	CorrectedRoundID  uint64
	MissingAuctionID  uint64
}

type RoundLabelRepairer struct {
	store          *Store
	reader         starknet.WhisperReader
	network        string
	whisperAddress string
}

func NewRoundLabelRepairer(
	store *Store,
	reader starknet.WhisperReader,
	network string,
	whisperAddress string,
) (*RoundLabelRepairer, error) {
	if store == nil || reader == nil {
		return nil, fmt.Errorf("Arbiter round repair dependencies are required")
	}
	network = strings.TrimSpace(network)
	if network == "" {
		return nil, fmt.Errorf("Arbiter round repair network is required")
	}
	whisperAddress, err := starknet.NormalizeAddress(whisperAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid round repair Whisper address: %w", err)
	}
	return &RoundLabelRepairer{
		store: store, reader: reader, network: network, whisperAddress: whisperAddress,
	}, nil
}

func (r *RoundLabelRepairer) Repair(ctx context.Context, spec RoundLabelRepair) error {
	if spec.ExistingRoundID == 0 || spec.ExistingAuctionID == 0 ||
		spec.CorrectedRoundID == 0 || spec.MissingAuctionID == 0 {
		return fmt.Errorf("Arbiter round repair IDs must be positive")
	}
	if spec.CorrectedRoundID == spec.ExistingRoundID ||
		spec.ExistingAuctionID == spec.MissingAuctionID {
		return fmt.Errorf("Arbiter round repair identities must be distinct")
	}

	existingAuction, err := r.reader.Auction(ctx, r.whisperAddress, spec.ExistingAuctionID)
	if err != nil {
		return fmt.Errorf("read incorrectly labelled Whisper auction: %w", err)
	}
	missingAuction, err := r.reader.Auction(ctx, r.whisperAddress, spec.MissingAuctionID)
	if err != nil {
		return fmt.Errorf("read missing Whisper auction: %w", err)
	}
	existingRound := canonicalRoundFromAuction(
		r.network, spec.ExistingRoundID, r.whisperAddress, existingAuction,
	)
	correctedRound := canonicalRoundFromAuction(
		r.network, spec.CorrectedRoundID, r.whisperAddress, existingAuction,
	)
	missingRound := canonicalRoundFromAuction(
		r.network, spec.ExistingRoundID, r.whisperAddress, missingAuction,
	)
	if err := validateCanonicalRound(
		existingRound, existingAuction, existingRound.BiddingDurationSeconds,
	); err != nil {
		return fmt.Errorf("verify incorrectly labelled Arbiter round: %w", err)
	}
	if err := validateCanonicalRound(
		missingRound, missingAuction, missingRound.BiddingDurationSeconds,
	); err != nil {
		return fmt.Errorf("verify missing Arbiter round: %w", err)
	}
	if existingAuction.Status == starknet.WhisperStatusSettled ||
		existingAuction.Status == starknet.WhisperStatusAborted {
		return fmt.Errorf("incorrectly labelled Arbiter round is already terminal")
	}
	return r.store.relabelAndInsertRound(ctx, existingRound, correctedRound, missingRound)
}

func canonicalRoundFromAuction(
	network string,
	roundID uint64,
	whisperAddress string,
	auction starknet.WhisperAuction,
) CanonicalRound {
	return CanonicalRound{
		Network: network, RoundID: roundID,
		WhisperAddress: whisperAddress, AuctionID: auction.ID,
		ExpectedCreator: auction.Creator, PaymentToken: auction.PaymentToken,
		MetadataHash: auction.MetadataHash, WinnerPayloadDomain: auction.WinnerPayloadDomain,
		VaultAddress:           auction.VaultAddress,
		BiddingDurationSeconds: auction.Schedule.BiddingDuration,
	}
}

func (s *Store) relabelAndInsertRound(
	ctx context.Context,
	existing CanonicalRound,
	corrected CanonicalRound,
	missing CanonicalRound,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin Arbiter round label repair: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	correctedStored, correctedErr := roundFromQuery(ctx, tx, corrected.Network, corrected.RoundID)
	missingStored, missingErr := roundFromQuery(ctx, tx, missing.Network, missing.RoundID)
	if correctedErr == nil && missingErr == nil {
		if !sameCanonicalRoundIdentity(correctedStored, corrected) ||
			!sameCanonicalRoundIdentity(missingStored, missing) {
			return fmt.Errorf("repair Arbiter round labels: conflicting repaired state")
		}
		if correctedStored.BiddingDurationSeconds != corrected.BiddingDurationSeconds ||
			missingStored.BiddingDurationSeconds != missing.BiddingDurationSeconds {
			return fmt.Errorf("repair Arbiter round labels: conflicting repaired schedule")
		}
		return tx.Commit()
	}
	if !errors.Is(correctedErr, ErrNoRound) || missingErr != nil {
		return fmt.Errorf("repair Arbiter round labels: unexpected target state")
	}
	if !sameCanonicalRoundIdentity(missingStored, existing) {
		return fmt.Errorf("repair Arbiter round labels: existing round identity mismatch")
	}

	for _, table := range []string{
		"arbiter_round_outcomes", "arbiter_image_uploads", "arbiter_artworks",
	} {
		var count int
		query := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE network = ? AND %s = ?", table,
			map[string]string{
				"arbiter_round_outcomes": "round_id",
				"arbiter_image_uploads":  "controller_round_id",
				"arbiter_artworks":       "controller_round_id",
			}[table],
		)
		if err := tx.QueryRowContext(ctx, query, existing.Network, existing.RoundID).Scan(&count); err != nil {
			return fmt.Errorf("inspect Arbiter round repair dependencies: %w", err)
		}
		if count != 0 {
			return fmt.Errorf("repair Arbiter round labels: existing round has dependent records")
		}
	}
	var predecessorJobs int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM arbiter_cycle_jobs
		WHERE network = ? AND predecessor_round_id = ?
	`, existing.Network, existing.RoundID).Scan(&predecessorJobs); err != nil {
		return fmt.Errorf("inspect Arbiter cycle repair dependencies: %w", err)
	}
	if predecessorJobs != 0 {
		return fmt.Errorf("repair Arbiter round labels: existing round has a successor job")
	}

	result, err := tx.ExecContext(ctx, `
		UPDATE arbiter_rounds
		SET round_id = ?, bidding_duration_seconds = ?, updated_at = unixepoch()
		WHERE network = ? AND round_id = ? AND auction_id = ?
	`, corrected.RoundID, corrected.BiddingDurationSeconds,
		existing.Network, existing.RoundID, existing.AuctionID)
	if err != nil {
		return fmt.Errorf("relabel Arbiter round: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("relabel Arbiter round: round was not updated")
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO arbiter_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			bidding_duration_seconds
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, missing.Network, missing.RoundID, missing.WhisperAddress, missing.AuctionID,
		missing.ExpectedCreator, missing.PaymentToken, missing.MetadataHash,
		missing.WinnerPayloadDomain, missing.VaultAddress, missing.BiddingDurationSeconds)
	if err != nil {
		return fmt.Errorf("insert missing Arbiter round: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Arbiter round label repair: %w", err)
	}
	return nil
}

type roundQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func roundFromQuery(
	ctx context.Context,
	queryer roundQueryer,
	network string,
	roundID uint64,
) (CanonicalRound, error) {
	var round CanonicalRound
	err := queryer.QueryRowContext(ctx, `
		SELECT network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			bidding_duration_seconds
		FROM arbiter_rounds WHERE network = ? AND round_id = ?
	`, network, roundID).Scan(
		&round.Network, &round.RoundID, &round.WhisperAddress, &round.AuctionID,
		&round.ExpectedCreator, &round.PaymentToken, &round.MetadataHash,
		&round.WinnerPayloadDomain, &round.VaultAddress, &round.BiddingDurationSeconds,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return CanonicalRound{}, ErrNoRound
	}
	if err != nil {
		return CanonicalRound{}, err
	}
	return round, nil
}
