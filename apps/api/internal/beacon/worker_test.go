package beacon

import (
	"context"
	"errors"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

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

func TestSettlementDutyUsesTheChainDeadline(t *testing.T) {
	for _, test := range []struct {
		name      string
		auction   starknet.BeaconAuction
		chainTime uint64
		want      bool
	}{
		{"expired", biddingAuction(7, "0xabc", "120", 1_000, 2_000), 2_001, true},
		{"at deadline", biddingAuction(7, "0xabc", "120", 1_000, 2_000), 2_000, true},
		{"still open on chain", biddingAuction(7, "0xabc", "120", 1_000, 2_000), 1_999, false},
		{"pending without bids", pendingAuction(7), 9_999, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			reader := newFakeBeaconReader(7, 7, test.auction)
			reader.timestamp = test.chainTime
			submitter := &fakeBeaconSubmitter{}
			if err := NewSettlementDuty(reader, submitter).Reconcile(context.Background()); err != nil {
				t.Fatal(err)
			}
			if (len(submitter.rounds) == 1) != test.want ||
				(test.want && submitter.rounds[0] != 7) {
				t.Fatalf("unexpected settlements: %v", submitter.rounds)
			}
		})
	}
}

func TestSettlementDutyToleratesRecheckAndReportsFailures(t *testing.T) {
	reader := newFakeBeaconReader(7, 7, biddingAuction(7, "0xabc", "120", 1_000, 2_000))
	reader.timestamp = 3_000
	submitter := &fakeBeaconSubmitter{err: starknet.ErrKeeperRecheckRequired}
	if err := NewSettlementDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatalf("recheck must wait for the next pass: %v", err)
	}
	submitter.err = errors.New("reverted")
	if err := NewSettlementDuty(reader, submitter).Reconcile(context.Background()); err == nil {
		t.Fatal("expected submission failure")
	}
	reader.statusErr = errors.New("offline")
	submitter.rounds = nil
	if err := NewSettlementDuty(reader, submitter).Reconcile(context.Background()); err == nil ||
		len(submitter.rounds) != 0 {
		t.Fatal("submitted without verified state")
	}
	uninitialized := &fakeBeaconReader{}
	if err := NewSettlementDuty(uninitialized, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
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

type fakeBeaconSubmitter struct {
	rounds []uint64
	err    error
}

func (s *fakeBeaconSubmitter) SettleBeaconAuction(_ context.Context, roundID uint64) (string, error) {
	s.rounds = append(s.rounds, roundID)
	return "0xabc", s.err
}
