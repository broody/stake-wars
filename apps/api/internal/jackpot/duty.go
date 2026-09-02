package jackpot

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
	reader    starknet.JackpotReader
	submitter starknet.JackpotSubmitter
}

func NewDuty(
	reader starknet.JackpotReader,
	submitter starknet.JackpotSubmitter,
) *Duty {
	return &Duty{reader: reader, submitter: submitter}
}

func (d *Duty) Reconcile(ctx context.Context) error {
	current, err := d.reader.ActiveJackpot(ctx)
	if errors.Is(err, starknet.ErrNoActiveJackpot) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read active jackpot: %w", err)
	}
	head, err := d.reader.ChainHead(ctx)
	if err != nil {
		return fmt.Errorf("read Starknet head for jackpot %d: %w", current.ID, err)
	}

	switch current.Status {
	case statusActive:
		if head.Timestamp < current.EndsAt {
			return nil
		}
		slog.InfoContext(
			ctx,
			"Expired Jackpot requires locking",
			"jackpot_id", current.ID,
			"ends_at", current.EndsAt,
			"chain_timestamp", head.Timestamp,
		)
		hash, err := d.submitter.LockJackpot(ctx, current.ID)
		if err != nil {
			return fmt.Errorf("lock expired jackpot %d: %w", current.ID, err)
		}
		slog.InfoContext(ctx, "Jackpot locked", "jackpot_id", current.ID, "transaction_hash", hash)
	case statusDrawing:
		if current.RandomnessBlock == 0 ||
			head.BlockNumber < current.RandomnessBlock+randomnessAvailabilityDelay {
			return nil
		}
		slog.InfoContext(
			ctx,
			"Jackpot randomness is ready for settlement",
			"jackpot_id", current.ID,
			"randomness_block", current.RandomnessBlock,
			"chain_block", head.BlockNumber,
		)
		hash, err := d.submitter.SettleJackpot(ctx, current.ID)
		if err != nil {
			return fmt.Errorf("settle jackpot %d: %w", current.ID, err)
		}
		slog.InfoContext(
			ctx,
			"Jackpot settlement submitted",
			"jackpot_id", current.ID,
			"transaction_hash", hash,
		)
	}
	return nil
}
