package supplydrop

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"stakewars.com/api/internal/starknet"
)

const (
	statusActive                = 2
	statusDrawing               = 3
	randomnessAvailabilityDelay = 10
)

type Duty struct {
	reader    starknet.SupplyDropReader
	submitter starknet.SupplyDropSubmitter
}

func NewDuty(
	reader starknet.SupplyDropReader,
	submitter starknet.SupplyDropSubmitter,
) *Duty {
	return &Duty{reader: reader, submitter: submitter}
}

func (d *Duty) Reconcile(ctx context.Context) error {
	current, err := d.reader.ActiveSupplyDrop(ctx)
	if errors.Is(err, starknet.ErrNoActiveSupplyDrop) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read active supply_drop: %w", err)
	}
	head, err := d.reader.ChainHead(ctx)
	if err != nil {
		return fmt.Errorf("read Starknet head for supply_drop %d: %w", current.ID, err)
	}

	switch current.Status {
	case statusActive:
		if head.Timestamp < current.EndsAt {
			return nil
		}
		slog.InfoContext(
			ctx,
			"Expired SupplyDrop requires locking",
			"supply_drop_id", current.ID,
			"ends_at", current.EndsAt,
			"chain_timestamp", head.Timestamp,
		)
		hash, err := d.submitter.LockSupplyDrop(ctx, current.ID)
		if errors.Is(err, starknet.ErrKeeperRecheckRequired) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("lock expired supply_drop %d: %w", current.ID, err)
		}
		slog.InfoContext(ctx, "SupplyDrop locked", "supply_drop_id", current.ID, "transaction_hash", hash)
	case statusDrawing:
		if current.RandomnessBlock == 0 ||
			head.BlockNumber < current.RandomnessBlock+randomnessAvailabilityDelay {
			return nil
		}
		slog.InfoContext(
			ctx,
			"SupplyDrop randomness is ready for settlement",
			"supply_drop_id", current.ID,
			"randomness_block", current.RandomnessBlock,
			"chain_block", head.BlockNumber,
		)
		hash, err := d.submitter.SettleSupplyDrop(ctx, current.ID)
		if errors.Is(err, starknet.ErrKeeperRecheckRequired) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("settle supply_drop %d: %w", current.ID, err)
		}
		slog.InfoContext(
			ctx,
			"SupplyDrop settlement submitted",
			"supply_drop_id", current.ID,
			"transaction_hash", hash,
		)
	}
	return nil
}
