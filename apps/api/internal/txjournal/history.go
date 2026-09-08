package txjournal

import (
	"context"
	"fmt"
)

type Filter struct {
	AttemptID         int64
	Limit             int
	Network, TargetID string
}

type HistoryAttempt struct {
	ID            int64          `json:"id"`
	Network       string         `json:"network"`
	Source        string         `json:"source"`
	Account       string         `json:"account_address"`
	Contract      string         `json:"contract_address"`
	Entrypoint    string         `json:"entrypoint"`
	TargetID      string         `json:"target_id"`
	CorrelationID string         `json:"correlation_id,omitempty"`
	Status        string         `json:"status"`
	Hash          string         `json:"transaction_hash,omitempty"`
	CreatedAt     int64          `json:"created_at"`
	UpdatedAt     int64          `json:"updated_at"`
	EventCount    int            `json:"event_count"`
	Events        []HistoryEvent `json:"events"`
}

type HistoryEvent struct {
	ID        int64   `json:"id"`
	Stage     string  `json:"stage"`
	Status    string  `json:"status"`
	Hash      string  `json:"transaction_hash,omitempty"`
	Block     *uint64 `json:"block_number,omitempty"`
	Code      *int    `json:"rpc_code,omitempty"`
	Message   string  `json:"error_message,omitempty"`
	Data      string  `json:"error_data,omitempty"`
	CreatedAt int64   `json:"created_at"`
}

// History reads only journal tables. Include at most 100 recent events per
// attempt; EventCount makes truncation visible while durable storage is intact.
func (s *Store) History(ctx context.Context, filter Filter) ([]HistoryAttempt, error) {
	if filter.Limit < 1 || filter.Limit > 100 || filter.AttemptID < 0 {
		return nil, fmt.Errorf("history limit must be 1-100 and attempt ID must be nonnegative")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,network,source,account_address,contract_address,entrypoint,target_id,correlation_id,status,transaction_hash,created_at,updated_at,
  (SELECT count(*) FROM transaction_attempt_events e WHERE e.attempt_id=a.id)
  FROM transaction_attempts a WHERE (?=0 OR id=?) AND (?='' OR network=?) AND (?='' OR target_id=?) ORDER BY id DESC LIMIT ?`, filter.AttemptID, filter.AttemptID, filter.Network, filter.Network, filter.TargetID, filter.TargetID, filter.Limit)
	if err != nil {
		return nil, fmt.Errorf("read transaction history: %w", err)
	}
	result := make([]HistoryAttempt, 0)
	for rows.Next() {
		var a HistoryAttempt
		if err := rows.Scan(&a.ID, &a.Network, &a.Source, &a.Account, &a.Contract, &a.Entrypoint, &a.TargetID, &a.CorrelationID, &a.Status, &a.Hash, &a.CreatedAt, &a.UpdatedAt, &a.EventCount); err != nil {
			rows.Close()
			return nil, err
		}
		result = append(result, a)
	}
	readErr := rows.Err()
	rows.Close()
	if readErr != nil {
		return nil, readErr
	}
	// The application deliberately has one SQLite connection. Close the attempt
	// cursor before reading events; no database transaction spans this report.
	for i := range result {
		events, err := s.db.QueryContext(ctx, `SELECT id,stage,status,transaction_hash,block_number,rpc_code,error_message,error_data,created_at
   FROM (SELECT * FROM transaction_attempt_events WHERE attempt_id=? ORDER BY id DESC LIMIT 100) ORDER BY id`, result[i].ID)
		if err != nil {
			return nil, err
		}
		result[i].Events = make([]HistoryEvent, 0)
		for events.Next() {
			var event HistoryEvent
			if err := events.Scan(&event.ID, &event.Stage, &event.Status, &event.Hash, &event.Block, &event.Code, &event.Message, &event.Data, &event.CreatedAt); err != nil {
				events.Close()
				return nil, err
			}
			result[i].Events = append(result[i].Events, event)
		}
		readErr := events.Err()
		events.Close()
		if readErr != nil {
			return nil, readErr
		}
	}
	return result, nil
}
