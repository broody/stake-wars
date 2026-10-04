package control

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"stakewars.com/api/internal/starknet"
)

func TestSyncDutySubmitsOnlyOperatorsNeedingSync(t *testing.T) {
	reader := fakeReader{statuses: map[string]starknet.OperatorStatus{
		"0x1": {},
		"0x2": {NeedsSync: true, Exiting: true},
		"0x3": {NeedsSync: true},
	}}
	submitter := &fakeSubmitter{}

	duty := NewSyncDuty(fakeLister{operators: []string{"0x1", "0x2", "0x3"}}, reader, submitter)
	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(submitter.batches, [][]string{{"0x2", "0x3"}}) {
		t.Fatalf("unexpected sync batches: %v", submitter.batches)
	}
}

func TestSyncDutyStaysIdleWhenEveryOperatorIsCurrent(t *testing.T) {
	reader := fakeReader{statuses: map[string]starknet.OperatorStatus{"0x1": {}, "0x2": {}}}
	submitter := &fakeSubmitter{}

	duty := NewSyncDuty(fakeLister{operators: []string{"0x1", "0x2"}}, reader, submitter)
	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(submitter.batches) != 0 {
		t.Fatalf("keeper paid for an idle pass: %v", submitter.batches)
	}
}

func TestSyncDutySplitsLargeBatches(t *testing.T) {
	operators := make([]string, 0, starknet.MaxSyncBatch+1)
	statuses := make(map[string]starknet.OperatorStatus)
	for i := 1; i <= starknet.MaxSyncBatch+1; i++ {
		operator := fmt.Sprintf("0x%x", i)
		operators = append(operators, operator)
		statuses[operator] = starknet.OperatorStatus{NeedsSync: true}
	}
	submitter := &fakeSubmitter{}

	duty := NewSyncDuty(fakeLister{operators: operators}, fakeReader{statuses: statuses}, submitter)
	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(submitter.batches) != 2 ||
		len(submitter.batches[0]) != starknet.MaxSyncBatch ||
		len(submitter.batches[1]) != 1 {
		t.Fatalf("unexpected sync batches: %v", submitter.batches)
	}
}

func TestSyncDutySyncsRemainingOperatorsWhenOneReadFails(t *testing.T) {
	reader := fakeReader{
		statuses: map[string]starknet.OperatorStatus{"0x2": {NeedsSync: true}},
		failing:  map[string]bool{"0x1": true},
	}
	submitter := &fakeSubmitter{}

	duty := NewSyncDuty(fakeLister{operators: []string{"0x1", "0x2"}}, reader, submitter)
	if err := duty.Reconcile(context.Background()); err == nil {
		t.Fatal("expected the failed Operator read to be reported")
	}
	if !reflect.DeepEqual(submitter.batches, [][]string{{"0x2"}}) {
		t.Fatalf("unexpected sync batches: %v", submitter.batches)
	}
}

func TestSyncDutyWaitsForRecheckAfterPendingTransaction(t *testing.T) {
	reader := fakeReader{statuses: map[string]starknet.OperatorStatus{"0x1": {NeedsSync: true}}}
	submitter := &fakeSubmitter{err: starknet.ErrKeeperRecheckRequired}

	duty := NewSyncDuty(fakeLister{operators: []string{"0x1"}}, reader, submitter)
	if err := duty.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestSyncDutyPropagatesFailures(t *testing.T) {
	reader := fakeReader{statuses: map[string]starknet.OperatorStatus{"0x1": {NeedsSync: true}}}
	lister := fakeLister{operators: []string{"0x1"}}

	submitter := &fakeSubmitter{err: errors.New("reverted")}
	if err := NewSyncDuty(lister, reader, submitter).Reconcile(context.Background()); err == nil {
		t.Fatal("expected keeper submission failure")
	}

	submitter = &fakeSubmitter{}
	failing := fakeLister{err: errors.New("Torii offline")}
	if err := NewSyncDuty(failing, reader, submitter).Reconcile(context.Background()); err == nil {
		t.Fatal("expected Operator discovery failure")
	}
	if len(submitter.batches) != 0 {
		t.Fatalf("keeper submitted without discovery: %v", submitter.batches)
	}
}

type fakeLister struct {
	operators []string
	err       error
}

func (l fakeLister) ActiveOperators(context.Context) ([]string, error) {
	return l.operators, l.err
}

type fakeReader struct {
	statuses map[string]starknet.OperatorStatus
	failing  map[string]bool
}

func (r fakeReader) OperatorStatus(_ context.Context, operator string) (starknet.OperatorStatus, error) {
	if r.failing[operator] {
		return starknet.OperatorStatus{}, errors.New("RPC offline")
	}
	return r.statuses[operator], nil
}

type fakeSubmitter struct {
	batches [][]string
	err     error
}

func (s *fakeSubmitter) SyncOperators(_ context.Context, operators []string) (string, error) {
	s.batches = append(s.batches, append([]string(nil), operators...))
	return "0xsync", s.err
}
