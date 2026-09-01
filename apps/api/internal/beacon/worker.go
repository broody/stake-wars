package beacon

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"stakewars.com/api/internal/starknet"
)

// Duty is one idempotent piece of periodic Beacon maintenance.
type Duty interface {
	Reconcile(ctx context.Context) error
}

// Worker runs Beacon duties immediately and then at a fixed interval.
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
		return fmt.Errorf("Beacon worker interval must be positive")
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
		slog.ErrorContext(ctx, "Beacon worker reconciliation failed", "error", err)
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

type cycleStore interface {
	Current(ctx context.Context, network string) (CanonicalRound, error)
}

// CycleOutcome is the terminal round state passed to an idempotent restarter.
type CycleOutcome struct {
	Round   CanonicalRound
	Auction starknet.WhisperAuction
	Result  *starknet.WhisperResult
}

// RoundRestarter owns the authorized create-and-register transaction. Calling
// EnsureNextRound repeatedly for the same outcome must be safe.
type RoundRestarter interface {
	EnsureNextRound(ctx context.Context, outcome CycleOutcome) error
}

// AuctionCycleDuty observes terminal Whisper rounds and asks the configured
// restarter to create and register the next start-on-bid round.
type AuctionCycleDuty struct {
	store     cycleStore
	reader    starknet.WhisperReader
	restarter RoundRestarter
	network   string
}

func NewAuctionCycleDuty(
	store cycleStore,
	reader starknet.WhisperReader,
	restarter RoundRestarter,
	network string,
) *AuctionCycleDuty {
	return &AuctionCycleDuty{
		store: store, reader: reader, restarter: restarter, network: network,
	}
}

func (d *AuctionCycleDuty) Reconcile(ctx context.Context) error {
	round, err := d.store.Current(ctx, d.network)
	if errors.Is(err, ErrNoRound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read current Beacon round: %w", err)
	}
	auction, err := d.reader.Auction(ctx, round.WhisperAddress, round.AuctionID)
	if err != nil {
		return fmt.Errorf("read terminal Whisper auction: %w", err)
	}
	outcome := CycleOutcome{Round: round, Auction: auction}
	switch auction.Status {
	case starknet.WhisperStatusSettled:
		result, err := d.reader.Result(ctx, round.WhisperAddress, round.AuctionID)
		if err != nil {
			return fmt.Errorf("read terminal Whisper result: %w", err)
		}
		outcome.Result = &result
	case starknet.WhisperStatusAborted:
	default:
		return nil
	}
	if err := d.restarter.EnsureNextRound(ctx, outcome); err != nil {
		return fmt.Errorf("ensure next Beacon round: %w", err)
	}
	return nil
}
