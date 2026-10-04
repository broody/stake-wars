package control

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"stakewars.com/api/internal/starknet"
)

type operatorReader interface {
	OperatorStatus(ctx context.Context, operator string) (starknet.OperatorStatus, error)
}

// SyncDuty synchronizes Operators whose stake left the official delegation
// pool outside the game. The Control System only re-reads the pool inside a
// transaction, so until someone submits one the World, and every view indexed
// from it, keeps showing the departed Operator's Sectors and artwork.
type SyncDuty struct {
	lister    starknet.OperatorLister
	reader    operatorReader
	submitter starknet.ControlSubmitter
}

func NewSyncDuty(
	lister starknet.OperatorLister,
	reader operatorReader,
	submitter starknet.ControlSubmitter,
) *SyncDuty {
	return &SyncDuty{lister: lister, reader: reader, submitter: submitter}
}

func (d *SyncDuty) Reconcile(ctx context.Context) error {
	operators, err := d.lister.ActiveOperators(ctx)
	if err != nil {
		return fmt.Errorf("list active Operators: %w", err)
	}
	// Submit only for Operators the chain itself reports as out of sync, so an
	// idle pass costs no gas.
	var result error
	pending := make([]string, 0)
	for _, operator := range operators {
		status, err := d.reader.OperatorStatus(ctx, operator)
		if err != nil {
			result = errors.Join(result, fmt.Errorf("read Operator %s: %w", operator, err))
			continue
		}
		if status.NeedsSync {
			pending = append(pending, operator)
		}
	}
	for start := 0; start < len(pending); start += starknet.MaxSyncBatch {
		batch := pending[start:min(start+starknet.MaxSyncBatch, len(pending))]
		hash, err := d.submitter.SyncOperators(ctx, batch)
		if errors.Is(err, starknet.ErrKeeperRecheckRequired) {
			return result
		}
		if err != nil {
			return errors.Join(result, fmt.Errorf("sync %d Operators: %w", len(batch), err))
		}
		slog.InfoContext(ctx, "Operators synchronized",
			"operators", batch, "transaction_hash", hash)
	}
	return result
}
