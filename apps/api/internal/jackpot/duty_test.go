package jackpot

import (
	"context"
	"errors"
	"testing"

	"stakewars.com/api/internal/starknet"
)

func TestDutyLocksExpiredActiveJackpot(t *testing.T) {
	reader := &fakeReader{
		jackpot: starknet.JackpotState{ID: 7, Status: statusActive, EndsAt: 100},
		head:    starknet.ChainHead{BlockNumber: 200, Timestamp: 100},
	}
	submitter := &fakeSubmitter{}

	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if submitter.locked != 7 || submitter.settled != 0 {
		t.Fatalf("unexpected keeper calls: %+v", submitter)
	}
}

func TestDutyWaitsUntilJackpotExpiry(t *testing.T) {
	reader := &fakeReader{
		jackpot: starknet.JackpotState{ID: 7, Status: statusActive, EndsAt: 101},
		head:    starknet.ChainHead{BlockNumber: 200, Timestamp: 100},
	}
	submitter := &fakeSubmitter{}

	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if submitter.locked != 0 || submitter.settled != 0 {
		t.Fatalf("keeper submitted before expiry: %+v", submitter)
	}
}

func TestDutySettlesWhenRandomnessIsAvailable(t *testing.T) {
	reader := &fakeReader{
		jackpot: starknet.JackpotState{
			ID: 8, Status: statusDrawing, RandomnessBlock: 500,
		},
		head: starknet.ChainHead{BlockNumber: 510, Timestamp: 100},
	}
	submitter := &fakeSubmitter{}

	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if submitter.settled != 8 || submitter.locked != 0 {
		t.Fatalf("unexpected keeper calls: %+v", submitter)
	}
}

func TestDutyWaitsForRandomnessAvailabilityDelay(t *testing.T) {
	reader := &fakeReader{
		jackpot: starknet.JackpotState{
			ID: 8, Status: statusDrawing, RandomnessBlock: 500,
		},
		head: starknet.ChainHead{BlockNumber: 509, Timestamp: 100},
	}
	submitter := &fakeSubmitter{}

	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if submitter.settled != 0 {
		t.Fatal("keeper settled before randomness was available")
	}
}

func TestDutyTreatsNoActiveJackpotAsIdle(t *testing.T) {
	reader := &fakeReader{err: starknet.ErrNoActiveJackpot}
	if err := NewDuty(reader, &fakeSubmitter{}).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestDutyPropagatesSubmissionFailure(t *testing.T) {
	reader := &fakeReader{
		jackpot: starknet.JackpotState{ID: 7, Status: statusActive, EndsAt: 100},
		head:    starknet.ChainHead{BlockNumber: 200, Timestamp: 100},
	}
	submitter := &fakeSubmitter{err: errors.New("reverted")}
	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err == nil {
		t.Fatal("expected keeper submission failure")
	}
}

type fakeReader struct {
	jackpot starknet.JackpotState
	head    starknet.ChainHead
	err     error
}

func (r *fakeReader) ActiveJackpot(context.Context) (starknet.JackpotState, error) {
	return r.jackpot, r.err
}

func (r *fakeReader) ChainHead(context.Context) (starknet.ChainHead, error) {
	return r.head, r.err
}

type fakeSubmitter struct {
	locked  uint64
	settled uint64
	err     error
}

func (s *fakeSubmitter) LockJackpot(_ context.Context, id uint64) (string, error) {
	s.locked = id
	return "0xlock", s.err
}

func (s *fakeSubmitter) SettleJackpot(_ context.Context, id uint64) (string, error) {
	s.settled = id
	return "0xsettle", s.err
}
