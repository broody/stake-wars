package stakingstats

import (
	"context"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"stakewars.com/api/internal/starknet"
)

const (
	eventChunkSize     = 1000
	confirmationBlocks = 10
	maxIndexWindow     = 500_000
)

var (
	selectorNewStaker         = mustAddress(starknet.Selector("NewStaker"))
	selectorStakerExitIntent  = mustAddress(starknet.Selector("StakerExitIntent"))
	selectorDeleteStaker      = mustAddress(starknet.Selector("DeleteStaker"))
	selectorNewDelegationPool = mustAddress(starknet.Selector("NewDelegationPool"))
	selectorPoolExitIntent    = mustAddress(starknet.Selector("RemoveFromDelegationPoolIntent"))
	selectorPoolExitAction    = mustAddress(starknet.Selector("RemoveFromDelegationPoolAction"))
	selectorPoolExitChange    = mustAddress(starknet.Selector("ChangeDelegationPoolIntent"))
	selectorPoolMemberBalance = mustAddress(starknet.Selector("PoolMemberBalanceChanged"))
	stakingStreamSelectors    = []string{
		selectorNewStaker, selectorStakerExitIntent, selectorDeleteStaker, selectorNewDelegationPool,
		selectorPoolExitIntent, selectorPoolExitAction, selectorPoolExitChange,
	}
)

// Chain is the read-only Starknet boundary used by the staking index.
type Chain interface {
	BlockNumber(ctx context.Context) (uint64, error)
	BlockHeader(ctx context.Context, block *uint64) (starknet.ChainBlockHeader, error)
	Call(ctx context.Context, contract, entrypoint string, calldata []string, block *uint64) ([]string, error)
	StorageAt(ctx context.Context, contract, key string) (string, error)
	Deployed(ctx context.Context, contract string, block uint64) (bool, error)
	Events(ctx context.Context, filter starknet.EventFilter) (starknet.EventPage, error)
}

type eventApplier func(tx *storeTx, events []starknet.EmittedEvent) error

// syncStream advances one event stream through limit, committing each page
// with its continuation token so an interrupted backfill resumes in place. It
// reports whether the stream reached limit and the last block it has covered.
func (s *Service) syncStream(
	ctx context.Context,
	stream string,
	start, limit uint64,
	address string,
	keys [][]string,
	apply eventApplier,
	deadline time.Time,
) (bool, uint64, error) {
	cursor, found, err := s.store.cursor(ctx, stream)
	if err != nil {
		return false, 0, err
	}
	if !found {
		cursor = indexCursor{NextBlock: start}
	}
	covered, _ := indexedThrough(cursor, true)
	if s.progressBlocks[stream] > covered {
		covered = s.progressBlocks[stream]
	}
	defer func() { s.progressBlocks[stream] = covered }()
	for s.clock().Before(deadline) {
		if err := ctx.Err(); err != nil {
			return false, covered, err
		}
		if cursor.WindowEnd == nil {
			if cursor.NextBlock > limit {
				return true, covered, nil
			}
			end := min(limit, cursor.NextBlock+maxIndexWindow-1)
			cursor.WindowEnd = &end
			cursor.ContinuationToken = ""
		}
		page, err := s.chain.Events(ctx, starknet.EventFilter{
			FromBlock:         cursor.NextBlock,
			ToBlock:           *cursor.WindowEnd,
			Address:           address,
			Keys:              keys,
			ChunkSize:         eventChunkSize,
			ContinuationToken: cursor.ContinuationToken,
		})
		if cursor.ContinuationToken != "" && starknet.IsRPCError(err, starknet.RPCInvalidContinuationToken) {
			// Every write tolerates replay, so restart the window from its first block.
			slog.WarnContext(ctx, "Restarting staking index window", "stream", stream, "from", cursor.NextBlock)
			cursor.ContinuationToken = ""
			continue
		}
		if err != nil {
			return false, covered, fmt.Errorf("read %s events: %w", stream, err)
		}
		next := cursor
		if page.ContinuationToken == "" {
			next = indexCursor{NextBlock: *cursor.WindowEnd + 1}
		} else {
			next.ContinuationToken = page.ContinuationToken
		}
		if err := s.store.update(ctx, func(tx *storeTx) error {
			if err := apply(tx, page.Events); err != nil {
				return err
			}
			return tx.saveCursor(stream, next)
		}); err != nil {
			return false, covered, err
		}
		cursor = next
		// Within a window, the newest committed event bounds progress.
		if through, _ := indexedThrough(cursor, true); through > covered {
			covered = through
		}
		if count := len(page.Events); count > 0 && page.Events[count-1].BlockNumber > covered {
			covered = page.Events[count-1].BlockNumber
		}
	}
	return false, covered, nil
}

func (s *Service) applyStakingEvents(tx *storeTx, events []starknet.EmittedEvent) error {
	for _, event := range events {
		if err := s.applyStakingEvent(tx, event); err != nil {
			// A malformed event means the contract emitted a schema this index does
			// not know. Skip it rather than stall every other statistic.
			slog.WarnContext(tx.ctx, "Skipping unrecognized staking event",
				"block", event.BlockNumber, "transaction", event.TransactionHash, "error", err)
		}
	}
	return nil
}

func (s *Service) applyStakingEvent(tx *storeTx, event starknet.EmittedEvent) error {
	if len(event.Keys) == 0 {
		return fmt.Errorf("event has no selector")
	}
	keys := make([]string, len(event.Keys))
	for index, key := range event.Keys {
		normalized, err := normalizeAddress(key)
		if err != nil {
			return fmt.Errorf("decode event key: %w", err)
		}
		keys[index] = normalized
	}
	block := event.BlockNumber
	at := position{Block: block, Transaction: event.TransactionIndex, Event: event.EventIndex}

	switch keys[0] {
	case selectorNewStaker:
		if len(keys) != 2 {
			return fmt.Errorf("unexpected NewStaker keys")
		}
		return tx.registerStaker(keys[1], block)
	case selectorStakerExitIntent:
		if len(keys) != 2 || len(event.Data) < 1 {
			return fmt.Errorf("unexpected StakerExitIntent shape")
		}
		exitTimestamp, err := parseU64(event.Data[0])
		if err != nil {
			return fmt.Errorf("decode exit timestamp: %w", err)
		}
		return tx.stakerExitIntent(keys[1], block, exitTimestamp)
	case selectorDeleteStaker:
		if len(keys) != 2 {
			return fmt.Errorf("unexpected DeleteStaker keys")
		}
		return tx.deleteStaker(keys[1], block)
	case selectorNewDelegationPool:
		// V0 pools omit the token key; they are always STRK pools.
		switch len(keys) {
		case 3:
			return tx.createPool(keys[2], keys[1], s.contracts.StrkToken, block)
		case 4:
			return tx.createPool(keys[2], keys[1], keys[3], block)
		}
		return fmt.Errorf("unexpected NewDelegationPool keys")
	case selectorPoolExitIntent:
		var staker, pool, token, identifier string
		switch len(keys) {
		case 4:
			staker, pool, identifier = keys[1], keys[2], keys[3]
		case 5:
			staker, pool, token, identifier = keys[1], keys[2], keys[3], keys[4]
		default:
			return fmt.Errorf("unexpected RemoveFromDelegationPoolIntent keys")
		}
		amount, err := intentAmount(event.Data, 2)
		if err != nil {
			return err
		}
		return s.recordExitIntent(tx, at, pool, identifier, token, staker, amount, true)
	case selectorPoolExitAction, selectorPoolExitChange:
		var pool, token, identifier string
		switch len(keys) {
		case 3:
			pool, identifier = keys[1], keys[2]
		case 4:
			pool, token, identifier = keys[1], keys[2], keys[3]
		default:
			return fmt.Errorf("unexpected delegation pool exit keys")
		}
		amount := new(big.Int)
		if keys[0] == selectorPoolExitChange {
			var err error
			if amount, err = intentAmount(event.Data, 2); err != nil {
				return err
			}
		}
		return s.recordExitIntent(tx, at, pool, identifier, token, "", amount, false)
	}
	return nil
}

// intentAmount reads new_intent_amount, the last field of an intent event.
func intentAmount(data []string, fields int) (*big.Int, error) {
	if len(data) != fields {
		return nil, fmt.Errorf("unexpected exit intent data length %d", len(data))
	}
	amount, err := parseU128(data[fields-1])
	if err != nil {
		return nil, fmt.Errorf("decode exit intent amount: %w", err)
	}
	return amount, nil
}

func (s *Service) recordExitIntent(
	tx *storeTx,
	at position,
	pool, identifier, token, staker string,
	amount *big.Int,
	resetsClock bool,
) error {
	if token == "" || staker == "" {
		row, found, err := tx.pool(pool)
		if err != nil {
			return err
		}
		if found {
			if token == "" {
				token = row.Token
			}
			if staker == "" {
				staker = row.Staker
			}
		}
		if token == "" {
			token = s.contracts.StrkToken
		}
	}
	return tx.recordExitIntent(exitIntentRow{
		Position: at, Pool: pool, Identifier: identifier, Token: token, Staker: staker,
		Amount: amount, ResetsClock: resetsClock,
	})
}

func memberApplier(pools map[string]poolRow) eventApplier {
	return func(tx *storeTx, events []starknet.EmittedEvent) error {
		for _, event := range events {
			pool, err := normalizeAddress(event.FromAddress)
			if err != nil {
				continue
			}
			// Other contracts may emit an event with the same name; only the
			// official delegation pools count.
			if _, ok := pools[pool]; !ok || len(event.Keys) != 2 || len(event.Data) != 2 {
				continue
			}
			member, err := normalizeAddress(event.Keys[1])
			if err != nil {
				continue
			}
			amount, err := parseU128(event.Data[1])
			if err != nil {
				continue
			}
			if err := tx.setMemberBalance(pool, member, amount, event.BlockNumber); err != nil {
				return err
			}
		}
		return nil
	}
}

// deploymentBlock binary-searches the first block at which contract exists.
func deploymentBlock(ctx context.Context, chain Chain, contract string, head uint64) (uint64, error) {
	deployed, err := chain.Deployed(ctx, contract, head)
	if err != nil {
		return 0, err
	}
	if !deployed {
		return 0, fmt.Errorf("staking contract %s is not deployed", contract)
	}
	low, high := uint64(0), head
	for low < high {
		middle := low + (high-low)/2
		deployed, err := chain.Deployed(ctx, contract, middle)
		if err != nil {
			return 0, err
		}
		if deployed {
			high = middle
		} else {
			low = middle + 1
		}
	}
	return low, nil
}

// index advances the staking stream, then the pool-member stream, which may
// never pass the staking stream because pools are discovered there.
func (s *Service) index(ctx context.Context, head uint64, deadline time.Time) error {
	safeHead := uint64(0)
	if head > confirmationBlocks {
		safeHead = head - confirmationBlocks
	}
	start := s.contracts.DeploymentBlock
	stakingSynced, stakingCovered, err := s.syncStream(
		ctx, streamStaking, start, safeHead, s.contracts.Staking,
		[][]string{stakingStreamSelectors}, s.applyStakingEvents, deadline,
	)
	s.setIndexProgress(func(progress *IndexProgress) {
		progress.StakingBlock = stakingCovered
		progress.StakingSynced = stakingSynced
	})
	if err != nil {
		return err
	}
	// Pool discovery is complete only through whole staking windows.
	stakingCursor, found, err := s.store.cursor(ctx, streamStaking)
	if err != nil {
		return err
	}
	stakingThrough, indexed := indexedThrough(stakingCursor, found)
	if !indexed || stakingThrough < start {
		return nil
	}

	pools, err := s.store.pools(ctx)
	if err != nil {
		return err
	}
	membersSynced, membersCovered, err := s.syncStream(
		ctx, streamMembers, start, stakingThrough, "",
		[][]string{{selectorPoolMemberBalance}}, memberApplier(pools), deadline,
	)
	s.setIndexProgress(func(progress *IndexProgress) {
		progress.MembersBlock = membersCovered
		progress.MembersSynced = membersSynced && stakingSynced
	})
	return err
}
