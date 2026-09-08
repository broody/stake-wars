package challenge

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"stakewars.com/api/internal/starknet"
)

func TestDutyUsesCanonicalChallengeAndChainDeadline(t *testing.T) {
	for _, test := range []struct {
		name         string
		id, deadline uint64
		want         bool
	}{
		{"expired", 2, 99, true},
		{"at deadline", 2, 100, true},
		{"still active on chain", 2, 101, false},
		{"already settled with stale index", 0, 0, false},
		{"different challenge with stale index", 3, 99, false},
		{"missing deadline", 2, 0, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			reader, submitter := fixtures()
			reader.sectors[527] = starknet.SectorStatus{ID: 527, ActiveChallengeID: test.id, ChallengeDeadline: test.deadline}
			if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
				t.Fatal(err)
			}
			if (len(submitter.calls) == 1) != test.want {
				t.Fatalf("unexpected calls: %v", submitter.calls)
			}
		})
	}
}

func TestDutySkipsUnverifiableState(t *testing.T) {
	for _, failure := range []string{"discovery", "head", "sector", "wrong sector"} {
		t.Run(failure, func(t *testing.T) {
			reader, submitter := fixtures()
			switch failure {
			case "discovery":
				reader.discoveryErr = errors.New("offline")
			case "head":
				reader.headErr = errors.New("offline")
			case "sector":
				reader.readErrors[527] = errors.New("offline")
			case "wrong sector":
				reader.sectors[527] = starknet.SectorStatus{ID: 1, ActiveChallengeID: 2, ChallengeDeadline: 90}
			}
			if err := NewDuty(reader, submitter).Reconcile(context.Background()); err == nil {
				t.Fatal("expected failure")
			}
			if len(submitter.calls) != 0 {
				t.Fatal("submitted without verified state")
			}
		})
	}
}

func TestDutyDoesNotResubmitDespiteToriiLag(t *testing.T) {
	reader, submitter := fixtures()
	submitter.send = func(id uint32) (string, error) {
		reader.sectors[id] = starknet.SectorStatus{ID: id}
		return "0x123", nil
	}
	duty := NewDuty(reader, submitter)
	for i := 0; i < 2; i++ {
		if err := duty.Reconcile(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if !reflect.DeepEqual(submitter.calls, []uint32{527}) {
		t.Fatalf("duplicate settlement: %v", submitter.calls)
	}
}

func TestDutyHandlesManualSettlementAndEscalationRaces(t *testing.T) {
	for _, deadline := range []uint64{0, 110} {
		reader, submitter := fixtures()
		submitter.send = func(id uint32) (string, error) {
			reader.sectors[id] = starknet.SectorStatus{ID: id, ActiveChallengeID: 2, ChallengeDeadline: deadline}
			return "", errors.New("contract rejected changed state")
		}
		if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
}

func TestDutyRetriesFailureAndDoesNotStarveOtherSectors(t *testing.T) {
	reader, submitter := fixtures()
	reader.candidates = nil
	for i := uint32(0); i < 7; i++ {
		reader.candidates = append(reader.candidates, starknet.ChallengeCandidate{SectorID: i, ChallengeID: 2})
		reader.sectors[i] = starknet.SectorStatus{ID: i, ActiveChallengeID: 2, ChallengeDeadline: 99}
	}
	submitter.send = func(uint32) (string, error) { return "", errors.New("fee estimation failed") }
	duty := NewDuty(reader, submitter)
	for i := 0; i < 2; i++ {
		if err := duty.Reconcile(context.Background()); err == nil {
			t.Fatal("expected retriable failure")
		}
	}
	want := []uint32{0, 1, 2, 3, 4, 5, 6, 0, 1, 2}
	if !reflect.DeepEqual(submitter.calls, want) {
		t.Fatalf("got %v, want %v", submitter.calls, want)
	}
}

func TestDutyStopsOnUncertainSubmittedTransaction(t *testing.T) {
	reader, submitter := fixtures()
	reader.candidates = append(reader.candidates, starknet.ChallengeCandidate{SectorID: 528, ChallengeID: 3})
	reader.sectors[528] = starknet.SectorStatus{ID: 528, ActiveChallengeID: 3, ChallengeDeadline: 99}
	submitter.send = func(uint32) (string, error) { return "0x123", context.DeadlineExceeded }
	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err == nil {
		t.Fatal("expected receipt timeout")
	}
	if !reflect.DeepEqual(submitter.calls, []uint32{527}) {
		t.Fatalf("submitted past pending receipt: %v", submitter.calls)
	}
}

func TestDutyRechecksAfterPreviousKeeperTransactionCompletes(t *testing.T) {
	reader, submitter := fixtures()
	submitter.send = func(uint32) (string, error) { return "", starknet.ErrKeeperRecheckRequired }
	if err := NewDuty(reader, submitter).Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestDutyHonorsCancellation(t *testing.T) {
	reader, submitter := fixtures()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := NewDuty(reader, submitter).Reconcile(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(submitter.calls) != 0 {
		t.Fatal("submitted after cancellation")
	}
}

func fixtures() (*fakeReader, *fakeSubmitter) {
	return &fakeReader{
		candidates: []starknet.ChallengeCandidate{{SectorID: 527, ChallengeID: 2}},
		sectors:    map[uint32]starknet.SectorStatus{527: {ID: 527, ActiveChallengeID: 2, ChallengeDeadline: 99}},
		readErrors: make(map[uint32]error),
	}, &fakeSubmitter{}
}

type fakeReader struct {
	candidates            []starknet.ChallengeCandidate
	sectors               map[uint32]starknet.SectorStatus
	readErrors            map[uint32]error
	discoveryErr, headErr error
}

func (r *fakeReader) ContestedSectors(context.Context) ([]starknet.ChallengeCandidate, error) {
	return r.candidates, r.discoveryErr
}
func (r *fakeReader) SectorStatus(_ context.Context, id uint32) (starknet.SectorStatus, error) {
	return r.sectors[id], r.readErrors[id]
}
func (r *fakeReader) ChainHead(context.Context) (starknet.ChainHead, error) {
	return starknet.ChainHead{Timestamp: 100}, r.headErr
}

type fakeSubmitter struct {
	calls []uint32
	send  func(uint32) (string, error)
}

func (s *fakeSubmitter) SettleChallenge(_ context.Context, id uint32) (string, error) {
	s.calls = append(s.calls, id)
	if s.send != nil {
		return s.send(id)
	}
	return "0x123", nil
}
