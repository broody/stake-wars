package stakingstats

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
)

const (
	streamStaking = "staking"
	streamMembers = "pool-members"
)

// Store persists the rebuildable staking index. Writes are grouped per event
// page, and every write tolerates replay of the same page after a restart.
type Store struct {
	db      *sql.DB
	network string
}

func NewStore(db *sql.DB, network string) *Store {
	return &Store{db: db, network: network}
}

type indexCursor struct {
	NextBlock         uint64
	WindowEnd         *uint64
	ContinuationToken string
}

type stakerRow struct {
	Address         string
	RegisteredBlock uint64
	ExitTimestamp   *uint64
}

type poolRow struct {
	Staker string
	Token  string
}

type position struct {
	Block, Transaction, Event uint64
}

func (p position) after(other position) bool {
	if p.Block != other.Block {
		return p.Block > other.Block
	}
	if p.Transaction != other.Transaction {
		return p.Transaction > other.Transaction
	}
	return p.Event > other.Event
}

type exitIntentRow struct {
	Position    position
	Pool        string
	Identifier  string
	Token       string
	Staker      string
	Amount      *big.Int
	ResetsClock bool
}

type sampleRow struct {
	Block        uint64
	Timestamp    uint64
	StrkStaked   string
	BtcStaked    string
	StrkPending  string
	BtcPending   string
	FeaturedStrk *string
	FeaturedBtc  *string
}

func (s *Store) cursor(ctx context.Context, stream string) (indexCursor, bool, error) {
	var cursor indexCursor
	var windowEnd sql.NullInt64
	err := s.db.QueryRowContext(ctx, `SELECT next_block, window_end, continuation_token
		FROM staking_index_cursors WHERE network = ? AND stream = ?`, s.network, stream).
		Scan(&cursor.NextBlock, &windowEnd, &cursor.ContinuationToken)
	if errors.Is(err, sql.ErrNoRows) {
		return indexCursor{}, false, nil
	}
	if err != nil {
		return indexCursor{}, false, fmt.Errorf("read %s index cursor: %w", stream, err)
	}
	if windowEnd.Valid {
		end := uint64(windowEnd.Int64)
		cursor.WindowEnd = &end
	}
	return cursor, true, nil
}

// storeTx groups one page of index writes with its cursor update.
type storeTx struct {
	ctx     context.Context
	tx      *sql.Tx
	network string
}

func (s *Store) update(ctx context.Context, apply func(*storeTx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin staking index write: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if err := apply(&storeTx{ctx: ctx, tx: tx, network: s.network}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit staking index write: %w", err)
	}
	return nil
}

func (t *storeTx) saveCursor(stream string, cursor indexCursor) error {
	var windowEnd any
	if cursor.WindowEnd != nil {
		windowEnd = int64(*cursor.WindowEnd)
	}
	_, err := t.tx.ExecContext(t.ctx, `INSERT INTO staking_index_cursors
		(network, stream, next_block, window_end, continuation_token, updated_at)
		VALUES (?, ?, ?, ?, ?, unixepoch())
		ON CONFLICT(network, stream) DO UPDATE SET
			next_block = excluded.next_block,
			window_end = excluded.window_end,
			continuation_token = excluded.continuation_token,
			updated_at = excluded.updated_at`,
		t.network, stream, int64(cursor.NextBlock), windowEnd, cursor.ContinuationToken)
	if err != nil {
		return fmt.Errorf("save %s index cursor: %w", stream, err)
	}
	return nil
}

// registerStaker records a staker, or re-registers an address whose earlier
// stake was fully withdrawn before block.
func (t *storeTx) registerStaker(staker string, block uint64) error {
	_, err := t.tx.ExecContext(t.ctx, `INSERT INTO staking_stakers
		(network, staker_address, registered_block) VALUES (?, ?, ?)
		ON CONFLICT(network, staker_address) DO UPDATE SET
			registered_block = excluded.registered_block,
			exit_intent_block = NULL,
			exit_timestamp = NULL,
			deleted_block = NULL
		WHERE staking_stakers.deleted_block IS NOT NULL
			AND staking_stakers.deleted_block <= excluded.registered_block`,
		t.network, staker, int64(block))
	return wrap("record staker", err)
}

func (t *storeTx) stakerExitIntent(staker string, block, exitTimestamp uint64) error {
	_, err := t.tx.ExecContext(t.ctx, `UPDATE staking_stakers
		SET exit_intent_block = ?, exit_timestamp = ?
		WHERE network = ? AND staker_address = ? AND registered_block <= ?
			AND (exit_intent_block IS NULL OR exit_intent_block <= ?)`,
		int64(block), int64(exitTimestamp), t.network, staker, int64(block), int64(block))
	return wrap("record staker exit intent", err)
}

func (t *storeTx) deleteStaker(staker string, block uint64) error {
	_, err := t.tx.ExecContext(t.ctx, `UPDATE staking_stakers SET deleted_block = ?
		WHERE network = ? AND staker_address = ? AND registered_block <= ?`,
		int64(block), t.network, staker, int64(block))
	return wrap("record staker deletion", err)
}

func (t *storeTx) createPool(pool, staker, token string, block uint64) error {
	_, err := t.tx.ExecContext(t.ctx, `INSERT OR IGNORE INTO staking_pools
		(network, pool_address, staker_address, token_address, created_block)
		VALUES (?, ?, ?, ?, ?)`, t.network, pool, staker, token, int64(block))
	return wrap("record delegation pool", err)
}

func (t *storeTx) pool(pool string) (poolRow, bool, error) {
	var row poolRow
	err := t.tx.QueryRowContext(t.ctx, `SELECT staker_address, token_address FROM staking_pools
		WHERE network = ? AND pool_address = ?`, t.network, pool).Scan(&row.Staker, &row.Token)
	if errors.Is(err, sql.ErrNoRows) {
		return poolRow{}, false, nil
	}
	if err != nil {
		return poolRow{}, false, fmt.Errorf("read delegation pool: %w", err)
	}
	return row, true, nil
}

func (t *storeTx) recordExitIntent(row exitIntentRow) error {
	resets := 0
	if row.ResetsClock {
		resets = 1
	}
	_, err := t.tx.ExecContext(t.ctx, `INSERT OR IGNORE INTO staking_exit_intents
		(network, block_number, transaction_index, event_index, pool_address, identifier,
		 token_address, staker_address, amount, resets_clock)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.network, int64(row.Position.Block), int64(row.Position.Transaction), int64(row.Position.Event),
		row.Pool, row.Identifier, row.Token, row.Staker, row.Amount.String(), resets)
	return wrap("record exit intent", err)
}

func (t *storeTx) setMemberBalance(pool, member string, amount *big.Int, block uint64) error {
	_, err := t.tx.ExecContext(t.ctx, `INSERT INTO staking_pool_members
		(network, pool_address, member_address, amount, updated_block) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(network, pool_address, member_address) DO UPDATE SET
			amount = excluded.amount, updated_block = excluded.updated_block
		WHERE excluded.updated_block >= staking_pool_members.updated_block`,
		t.network, pool, member, amount.String(), int64(block))
	return wrap("record pool member balance", err)
}

func (s *Store) activeStakers(ctx context.Context) ([]stakerRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT staker_address, registered_block, exit_timestamp
		FROM staking_stakers WHERE network = ? AND deleted_block IS NULL
		ORDER BY registered_block, staker_address`, s.network)
	if err != nil {
		return nil, fmt.Errorf("read stakers: %w", err)
	}
	defer rows.Close()
	var result []stakerRow
	for rows.Next() {
		var row stakerRow
		var exit sql.NullInt64
		if err := rows.Scan(&row.Address, &row.RegisteredBlock, &exit); err != nil {
			return nil, fmt.Errorf("read staker: %w", err)
		}
		if exit.Valid {
			value := uint64(exit.Int64)
			row.ExitTimestamp = &value
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func (s *Store) registeredBlock(ctx context.Context, staker string) (uint64, bool, error) {
	var block uint64
	err := s.db.QueryRowContext(ctx, `SELECT registered_block FROM staking_stakers
		WHERE network = ? AND staker_address = ?`, s.network, staker).Scan(&block)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("read staker registration: %w", err)
	}
	return block, true, nil
}

func (s *Store) pools(ctx context.Context) (map[string]poolRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT pool_address, staker_address, token_address
		FROM staking_pools WHERE network = ?`, s.network)
	if err != nil {
		return nil, fmt.Errorf("read delegation pools: %w", err)
	}
	defer rows.Close()
	result := make(map[string]poolRow)
	for rows.Next() {
		var address string
		var row poolRow
		if err := rows.Scan(&address, &row.Staker, &row.Token); err != nil {
			return nil, fmt.Errorf("read delegation pool: %w", err)
		}
		result[address] = row
	}
	return result, rows.Err()
}

// exitIntentsBetween returns log rows after from and at or before throughBlock
// in chain order.
func (s *Store) exitIntentsBetween(
	ctx context.Context,
	from position,
	throughBlock uint64,
) ([]exitIntentRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT block_number, transaction_index, event_index,
			pool_address, identifier, token_address, staker_address, amount, resets_clock
		FROM staking_exit_intents
		WHERE network = ? AND (block_number, transaction_index, event_index) > (?, ?, ?)
			AND block_number <= ?
		ORDER BY block_number, transaction_index, event_index`,
		s.network, int64(from.Block), int64(from.Transaction), int64(from.Event), int64(throughBlock))
	if err != nil {
		return nil, fmt.Errorf("read exit intents: %w", err)
	}
	defer rows.Close()
	var result []exitIntentRow
	for rows.Next() {
		var row exitIntentRow
		var amount string
		var resets int
		if err := rows.Scan(&row.Position.Block, &row.Position.Transaction, &row.Position.Event,
			&row.Pool, &row.Identifier, &row.Token, &row.Staker, &amount, &resets); err != nil {
			return nil, fmt.Errorf("read exit intent: %w", err)
		}
		parsed, ok := new(big.Int).SetString(amount, 10)
		if !ok {
			return nil, fmt.Errorf("stored exit intent amount is invalid")
		}
		row.Amount = parsed
		row.ResetsClock = resets == 1
		result = append(result, row)
	}
	return result, rows.Err()
}

type memberPosition struct {
	Staker, Pool, Member string
}

// activePositions lists every delegation-pool position with an active balance.
func (s *Store) activePositions(ctx context.Context) ([]memberPosition, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT p.staker_address, m.pool_address, m.member_address
		FROM staking_pool_members m
		JOIN staking_pools p ON p.network = m.network AND p.pool_address = m.pool_address
		WHERE m.network = ? AND m.amount <> '0'`, s.network)
	if err != nil {
		return nil, fmt.Errorf("read delegation positions: %w", err)
	}
	defer rows.Close()
	var positions []memberPosition
	for rows.Next() {
		var position memberPosition
		if err := rows.Scan(&position.Staker, &position.Pool, &position.Member); err != nil {
			return nil, fmt.Errorf("read delegation position: %w", err)
		}
		positions = append(positions, position)
	}
	return positions, rows.Err()
}

// blockTimes returns every cached block header timestamp.
func (s *Store) blockTimes(ctx context.Context) (map[uint64]uint64, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT block_number, timestamp FROM staking_block_times
		WHERE network = ?`, s.network)
	if err != nil {
		return nil, fmt.Errorf("read block times: %w", err)
	}
	defer rows.Close()
	result := make(map[uint64]uint64)
	for rows.Next() {
		var block, timestamp uint64
		if err := rows.Scan(&block, &timestamp); err != nil {
			return nil, fmt.Errorf("read block time: %w", err)
		}
		result[block] = timestamp
	}
	return result, rows.Err()
}

func (s *Store) saveBlockTime(ctx context.Context, block, timestamp uint64) error {
	_, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO staking_block_times
		(network, block_number, timestamp) VALUES (?, ?, ?)`, s.network, int64(block), int64(timestamp))
	return wrap("record block time", err)
}

func (s *Store) samples(ctx context.Context) ([]sampleRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT block_number, timestamp, strk_staked, btc_staked,
			strk_pending, btc_pending, featured_strk, featured_btc
		FROM staking_samples WHERE network = ? ORDER BY timestamp`, s.network)
	if err != nil {
		return nil, fmt.Errorf("read staking samples: %w", err)
	}
	defer rows.Close()
	var result []sampleRow
	for rows.Next() {
		var row sampleRow
		var featuredStrk, featuredBtc sql.NullString
		if err := rows.Scan(&row.Block, &row.Timestamp, &row.StrkStaked, &row.BtcStaked,
			&row.StrkPending, &row.BtcPending, &featuredStrk, &featuredBtc); err != nil {
			return nil, fmt.Errorf("read staking sample: %w", err)
		}
		if featuredStrk.Valid {
			row.FeaturedStrk = &featuredStrk.String
		}
		if featuredBtc.Valid {
			row.FeaturedBtc = &featuredBtc.String
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func (s *Store) latestSample(ctx context.Context) (*sampleRow, error) {
	var row sampleRow
	err := s.db.QueryRowContext(ctx, `SELECT block_number, timestamp FROM staking_samples
		WHERE network = ? ORDER BY timestamp DESC LIMIT 1`, s.network).Scan(&row.Block, &row.Timestamp)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read latest staking sample: %w", err)
	}
	return &row, nil
}

func (s *Store) saveSample(ctx context.Context, row sampleRow) error {
	_, err := s.db.ExecContext(ctx, `INSERT OR REPLACE INTO staking_samples
		(network, block_number, timestamp, strk_staked, btc_staked, strk_pending, btc_pending,
		 featured_strk, featured_btc)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.network, int64(row.Block), int64(row.Timestamp), row.StrkStaked, row.BtcStaked,
		row.StrkPending, row.BtcPending, nullableString(row.FeaturedStrk), nullableString(row.FeaturedBtc))
	return wrap("record staking sample", err)
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func wrap(action string, err error) error {
	if err != nil {
		return fmt.Errorf("%s: %w", action, err)
	}
	return nil
}
