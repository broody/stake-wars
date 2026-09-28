package beacon

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"stakewars.com/api/internal/starknet"
)

// Duty is one idempotent piece of periodic maintenance.
type Duty interface {
	Reconcile(ctx context.Context) error
}

// Worker runs maintenance duties immediately and then at a fixed interval.
type Worker struct {
	interval    time.Duration
	dutyTimeout time.Duration
	duties      []Duty
}

func NewWorker(interval time.Duration, duties ...Duty) *Worker {
	return &Worker{interval: interval, dutyTimeout: 2 * time.Minute, duties: duties}
}

func (w *Worker) Run(ctx context.Context) error {
	if w.interval <= 0 {
		return fmt.Errorf("maintenance worker interval must be positive")
	}
	w.reconcileAndReport(ctx)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			w.reconcileAndReport(ctx)
		}
	}
}

func (w *Worker) reconcileAndReport(ctx context.Context) {
	if err := w.reconcile(ctx); err != nil && ctx.Err() == nil {
		slog.ErrorContext(ctx, "Maintenance worker reconciliation failed", "error", err)
	}
}

func (w *Worker) reconcile(ctx context.Context) error {
	var result error
	for _, duty := range w.duties {
		dutyContext, cancel := context.WithTimeout(ctx, w.dutyTimeout)
		err := duty.Reconcile(dutyContext)
		cancel()
		if err != nil {
			result = errors.Join(result, err)
		}
	}
	return result
}

// SettlementDuty submits the permissionless settlement once the chain clock
// passes the current round's deadline. Settlement also opens the next round.
type SettlementDuty struct {
	reader    starknet.BeaconReader
	submitter starknet.BeaconSubmitter
}

func NewSettlementDuty(
	reader starknet.BeaconReader,
	submitter starknet.BeaconSubmitter,
) *SettlementDuty {
	return &SettlementDuty{reader: reader, submitter: submitter}
}

func (d *SettlementDuty) Reconcile(ctx context.Context) error {
	status, err := d.reader.Status(ctx)
	if err != nil {
		return fmt.Errorf("read Beacon status: %w", err)
	}
	auction := status.Auction
	if !status.Initialized || auction.Status != starknet.BeaconAuctionBidding || auction.EndsAt == 0 {
		return nil
	}
	chainTimestamp, err := d.reader.ChainTimestamp(ctx)
	if err != nil {
		return fmt.Errorf("read Starknet chain time for Beacon round %d: %w", auction.RoundID, err)
	}
	if chainTimestamp < auction.EndsAt {
		return nil
	}
	hash, err := d.submitter.SettleBeaconAuction(ctx, auction.RoundID)
	if errors.Is(err, starknet.ErrKeeperRecheckRequired) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("settle Beacon round %d: %w", auction.RoundID, err)
	}
	slog.InfoContext(ctx, "Beacon settlement submitted",
		"round_id", auction.RoundID, "transaction_hash", hash)
	return nil
}
