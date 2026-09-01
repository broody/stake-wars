package beacon

import (
	"context"
	"errors"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

func TestAuctionCycleDutyRestartsTerminalRound(t *testing.T) {
	round := canonicalRoundFixture()
	reader := &fakeWhisperReader{
		auction: whisperAuctionFixture(starknet.WhisperStatusSettled),
		result:  starknet.WhisperResult{AuctionID: round.AuctionID, HasWinner: true},
	}
	restarter := &fakeRoundRestarter{}
	duty := NewAuctionCycleDuty(
		fakeRoundStore{round: round}, reader, restarter, "SN_SEPOLIA",
	)

	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if restarter.calls != 1 || restarter.outcome.Result == nil ||
		restarter.outcome.Round.RoundID != round.RoundID {
		t.Fatalf("unexpected restart outcome: %+v", restarter.outcome)
	}
}

func TestAuctionCycleDutyLeavesOpenRoundAlone(t *testing.T) {
	restarter := &fakeRoundRestarter{}
	duty := NewAuctionCycleDuty(
		fakeRoundStore{round: canonicalRoundFixture()},
		&fakeWhisperReader{auction: whisperAuctionFixture(starknet.WhisperStatusPending)},
		restarter,
		"SN_SEPOLIA",
	)

	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if restarter.calls != 0 {
		t.Fatalf("expected no restart, got %d", restarter.calls)
	}
}

func TestWorkerRetriesAfterTransientDutyFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	duty := &transientDuty{cancel: cancel}
	worker := NewWorker(time.Millisecond, duty)

	if err := worker.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if duty.calls < 2 {
		t.Fatalf("expected retry after transient failure, got %d call(s)", duty.calls)
	}
}

type fakeRoundRestarter struct {
	calls   int
	outcome CycleOutcome
}

type transientDuty struct {
	calls  int
	cancel context.CancelFunc
}

func (d *transientDuty) Reconcile(context.Context) error {
	d.calls++
	if d.calls == 1 {
		return errors.New("temporary Torii failure")
	}
	d.cancel()
	return nil
}

func (r *fakeRoundRestarter) EnsureNextRound(
	_ context.Context,
	outcome CycleOutcome,
) error {
	r.calls++
	r.outcome = outcome
	return nil
}
