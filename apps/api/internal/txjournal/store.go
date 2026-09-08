// Package txjournal stores public transaction metadata and sanitized diagnostics.
// It never stores signing keys, signed transactions, request bodies, or calldata.
package txjournal

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

type Metadata struct {
	Network, Source, Account, Contract, Entrypoint, TargetID, CorrelationID string
}
type Attempt struct {
	ID int64
	Metadata
	Status, Hash string
}
type Event struct {
	Stage, Status, Hash string
	Block               *uint64
	Code                *int
	Message, Data       string
}

func (s *Store) Begin(ctx context.Context, m Metadata) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin transaction journal: %w", err)
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `INSERT INTO transaction_attempts
		(network,source,account_address,contract_address,entrypoint,target_id,correlation_id,status)
		VALUES (?,?,?,?,?,?,?,'preparing')`, m.Network, m.Source, m.Account, m.Contract, m.Entrypoint, m.TargetID, m.CorrelationID)
	if err != nil {
		return 0, fmt.Errorf("record transaction intent: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO transaction_attempt_events(attempt_id,stage,status) VALUES (?,'prepare','preparing')`, id); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

// Record appends an event and updates the projection atomically. Diagnostics
// survive cancellation of the network request, with a separate bounded write.
func (s *Store) Record(ctx context.Context, id int64, e Event) error {
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	tx, err := s.db.BeginTx(writeCtx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction event: %w", err)
	}
	defer tx.Rollback()
	e.Message = SafeText(e.Message)
	e.Data = SafeData(e.Data)
	result, err := tx.ExecContext(writeCtx, `UPDATE transaction_attempts SET status=?,
		transaction_hash=CASE WHEN ?='' THEN transaction_hash ELSE ? END,updated_at=unixepoch() WHERE id=?`, e.Status, e.Hash, e.Hash, id)
	if err != nil {
		return fmt.Errorf("update transaction attempt: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return fmt.Errorf("transaction attempt %d not found", id)
	}
	_, err = tx.ExecContext(writeCtx, `INSERT INTO transaction_attempt_events
		(attempt_id,stage,status,transaction_hash,block_number,rpc_code,error_message,error_data)
		VALUES (?,?,?,?,?,?,?,?)`, id, e.Stage, e.Status, e.Hash, e.Block, e.Code, e.Message, e.Data)
	if err != nil {
		return fmt.Errorf("append transaction event: %w", err)
	}
	return tx.Commit()
}

func (s *Store) Pending(ctx context.Context, network, source, account string) ([]Attempt, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,contract_address,entrypoint,target_id,correlation_id,status,transaction_hash
		FROM transaction_attempts WHERE network=? AND source=? AND account_address=?
		AND status IN ('preparing','broadcasting','submitted','unknown') ORDER BY id`, network, source, account)
	if err != nil {
		return nil, fmt.Errorf("read pending transactions: %w", err)
	}
	defer rows.Close()
	var result []Attempt
	for rows.Next() {
		a := Attempt{Metadata: Metadata{Network: network, Source: source, Account: account}}
		if err := rows.Scan(&a.ID, &a.Contract, &a.Entrypoint, &a.TargetID, &a.CorrelationID, &a.Status, &a.Hash); err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}
