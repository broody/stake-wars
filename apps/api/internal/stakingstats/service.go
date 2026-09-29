// Package stakingstats indexes the official Starknet staking contracts and
// serves network-wide validator, exit, and history statistics.
package stakingstats

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"sync"
	"time"

	"stakewars.com/api/internal/starknet"
)

const (
	indexBudget            = 70 * time.Second
	historyBudget          = 100 * time.Second
	validatorRefreshPeriod = 5 * time.Minute
	priceRefreshPeriod     = 5 * time.Minute
	defaultBtcSharePercent = 25
	streamDeployment       = "deployment"
)

// ErrNotReady reports that the first snapshot has not been built yet.
var ErrNotReady = errors.New("staking statistics are not ready")

// Pragma's public Starknet oracles, used only for optional USD context.
var defaultOracles = map[string]string{
	"SN_MAIN":    "0x2a85bd616f912537c50a49a4076db02c00b29b2cdc8a197ce92ed1837fa875b",
	"SN_SEPOLIA": "0x36031daa264c24520b11d93af622c848b2499b66b41d611bac95e13cfca131a",
}

type Config struct {
	Network string
	// FeaturedPool is the Stake Wars delegation pool. Its staker is featured,
	// and its staking contract is the one indexed.
	FeaturedPool string
}

type contracts struct {
	Staking         string
	StrkToken       string
	RewardSupplier  string
	MintingCurve    string
	FeaturedPool    string
	FeaturedStaker  string
	DeploymentBlock uint64
}

type tokenMeta struct {
	Symbol   string
	Decimals uint8
}

type Service struct {
	chain  Chain
	store  *Store
	config Config
	oracle string
	clock  func() time.Time

	// Written only by Reconcile.
	contracts        *contracts
	tokens           map[string]tokenMeta
	blockTimes       map[uint64]uint64
	progressBlocks   map[string]uint64
	liveBook         *pendingBook
	sampleBook       *pendingBook
	validators       []validatorState
	validatorSet     string
	validatorsReadAt time.Time
	delegators       *delegatorCounts
	delegatorsReadAt time.Time
	prices           *Prices
	pricesReadAt     time.Time

	mu       sync.RWMutex
	snapshot *Snapshot
	samples  []sampleRow
	progress IndexProgress
}

func NewService(chain Chain, store *Store, config Config) (*Service, error) {
	pool, err := normalizeAddress(config.FeaturedPool)
	if err != nil || pool == "0x0" {
		return nil, fmt.Errorf("invalid featured staking pool address")
	}
	config.FeaturedPool = pool
	return &Service{
		chain:          chain,
		store:          store,
		config:         config,
		oracle:         defaultOracles[config.Network],
		clock:          time.Now,
		tokens:         make(map[string]tokenMeta),
		blockTimes:     make(map[uint64]uint64),
		progressBlocks: make(map[string]uint64),
		liveBook:       newPendingBook(),
	}, nil
}

// Reconcile advances the index, refreshes the live snapshot, and extends the
// daily history. It is safe to call repeatedly from the maintenance worker.
func (s *Service) Reconcile(ctx context.Context) error {
	started := s.clock()
	if s.contracts == nil {
		if err := s.resolveContracts(ctx); err != nil {
			return fmt.Errorf("resolve staking contracts: %w", err)
		}
		samples, err := s.store.samples(ctx)
		if err != nil {
			return err
		}
		if s.blockTimes, err = s.store.blockTimes(ctx); err != nil {
			return err
		}
		s.mu.Lock()
		s.samples = samples
		s.mu.Unlock()
	}
	head, err := s.chain.BlockHeader(ctx, nil)
	if err != nil {
		return fmt.Errorf("read Starknet head: %w", err)
	}
	s.blockTimes[head.Number] = head.Timestamp
	s.setIndexProgress(func(progress *IndexProgress) {
		progress.HeadBlock = head.Number
		progress.DeploymentBlock = s.contracts.DeploymentBlock
	})

	var result error
	if err := s.index(ctx, head.Number, started.Add(indexBudget)); err != nil {
		result = errors.Join(result, fmt.Errorf("index staking events: %w", err))
	}
	if err := s.refreshSnapshot(ctx, head); err != nil {
		result = errors.Join(result, fmt.Errorf("refresh staking snapshot: %w", err))
	}
	// History uses whatever remains of the tick after indexing and the snapshot.
	if err := s.extendHistory(ctx, head, started.Add(historyBudget)); err != nil {
		result = errors.Join(result, fmt.Errorf("extend staking history: %w", err))
	}
	return result
}

// Current returns the latest snapshot.
func (s *Service) Current(context.Context) (Snapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.snapshot == nil {
		return Snapshot{}, ErrNotReady
	}
	snapshot := *s.snapshot
	snapshot.Index = s.progress
	return snapshot, nil
}

// History returns every daily sample followed by the live observation.
func (s *Service) History(context.Context) (History, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.snapshot == nil {
		return History{}, ErrNotReady
	}
	history := History{
		Network: s.config.Network,
		Synced:  s.progress.HistorySynced,
		Points:  make([]HistoryPoint, 0, len(s.samples)+1),
	}
	for _, sample := range s.samples {
		history.Points = append(history.Points, HistoryPoint{
			Timestamp: int64(sample.Timestamp), Block: sample.Block,
			StrkStaked: sample.StrkStaked, BtcStaked: sample.BtcStaked,
			StrkPending: sample.StrkPending, BtcPending: sample.BtcPending,
			FeaturedStrk: sample.FeaturedStrk, FeaturedBtc: sample.FeaturedBtc,
		})
	}
	if live := s.snapshot.livePoint; live != nil {
		history.Points = append(history.Points, *live)
	}
	return history, nil
}

func (s *Service) setIndexProgress(update func(*IndexProgress)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	update(&s.progress)
}

func (s *Service) resolveContracts(ctx context.Context) error {
	result, err := s.chain.Call(ctx, s.config.FeaturedPool, "contract_parameters_v1", nil, nil)
	if err != nil {
		return fmt.Errorf("read featured pool: %w", err)
	}
	pool, err := decodePoolParameters(result)
	if err != nil {
		return err
	}
	result, err = s.chain.Call(ctx, pool.StakingContract, "contract_parameters_v1", nil, nil)
	if err != nil {
		return fmt.Errorf("read staking parameters: %w", err)
	}
	parameters, err := decodeStakingParameters(result)
	if err != nil {
		return err
	}
	mintingCurve, err := s.chain.StorageAt(ctx, parameters.RewardSupplier, starknet.Selector("minting_curve_dispatcher"))
	if err != nil {
		return fmt.Errorf("read minting curve address: %w", err)
	}
	if mintingCurve, err = normalizeAddress(mintingCurve); err != nil || mintingCurve == "0x0" {
		return fmt.Errorf("reward supplier has no minting curve")
	}

	deployment, found, err := s.store.cursor(ctx, streamDeployment)
	if err != nil {
		return err
	}
	if !found {
		head, err := s.chain.BlockNumber(ctx)
		if err != nil {
			return err
		}
		block, err := deploymentBlock(ctx, s.chain, pool.StakingContract, head)
		if err != nil {
			return fmt.Errorf("find staking deployment: %w", err)
		}
		deployment = indexCursor{NextBlock: block}
		if err := s.store.update(ctx, func(tx *storeTx) error {
			return tx.saveCursor(streamDeployment, deployment)
		}); err != nil {
			return err
		}
	}
	s.contracts = &contracts{
		Staking:         pool.StakingContract,
		StrkToken:       parameters.Token,
		RewardSupplier:  parameters.RewardSupplier,
		MintingCurve:    mintingCurve,
		FeaturedPool:    s.config.FeaturedPool,
		FeaturedStaker:  pool.Staker,
		DeploymentBlock: deployment.NextBlock,
	}
	slog.InfoContext(ctx, "Staking statistics contracts resolved",
		"staking", pool.StakingContract, "featured_staker", pool.Staker,
		"deployment_block", deployment.NextBlock)
	return nil
}

// token returns cached ERC-20 metadata, reading it on first use.
func (s *Service) token(ctx context.Context, address string) (tokenMeta, error) {
	if meta, ok := s.tokens[address]; ok {
		return meta, nil
	}
	decimalsResult, err := s.chain.Call(ctx, address, "decimals", nil, nil)
	if err != nil {
		return tokenMeta{}, fmt.Errorf("read token decimals: %w", err)
	}
	if len(decimalsResult) != 1 {
		return tokenMeta{}, fmt.Errorf("unexpected token decimals response")
	}
	decimals, err := parseU64(decimalsResult[0])
	if err != nil || decimals > 36 {
		return tokenMeta{}, fmt.Errorf("invalid token decimals")
	}
	symbol := ""
	if symbolResult, err := s.chain.Call(ctx, address, "symbol", nil, nil); err == nil {
		symbol, _ = decodeString(symbolResult)
	}
	if symbol == "" {
		symbol = strings.ToUpper(address[:min(len(address), 8)])
	}
	meta := tokenMeta{Symbol: symbol, Decimals: uint8(decimals)}
	s.tokens[address] = meta
	return meta, nil
}

func (s *Service) tokenDecimals(address string) (uint8, bool) {
	meta, ok := s.tokens[address]
	return meta.Decimals, ok
}

func (s *Service) readPrices(ctx context.Context) *Prices {
	if s.oracle == "" {
		return nil
	}
	now := s.clock()
	if s.prices != nil && now.Sub(s.pricesReadAt) < priceRefreshPeriod {
		return s.prices
	}
	read := func(pair string) (float64, uint64, error) {
		result, err := s.chain.Call(ctx, s.oracle, "get_data_median",
			[]string{"0x0", "0x" + fmt.Sprintf("%x", []byte(pair))}, nil)
		if err != nil {
			return 0, 0, err
		}
		return decodePragmaPrice(result)
	}
	strk, strkUpdated, err := read("STRK/USD")
	if err != nil {
		slog.DebugContext(ctx, "STRK price unavailable", "error", err)
		return s.prices
	}
	btc, btcUpdated, err := read("BTC/USD")
	if err != nil {
		slog.DebugContext(ctx, "BTC price unavailable", "error", err)
		return s.prices
	}
	updated := min(strkUpdated, btcUpdated)
	if now.Unix()-int64(updated) > int64(24*time.Hour/time.Second) {
		// A day-old oracle price is not presented as current.
		s.prices = nil
		return nil
	}
	s.prices = &Prices{StrkUsd: strk, BtcUsd: btc, UpdatedAt: int64(updated), Source: "pragma"}
	s.pricesReadAt = now
	return s.prices
}

func (s *Service) callU128(ctx context.Context, contract, entrypoint string, calldata []string, block *uint64) (*big.Int, error) {
	result, err := s.chain.Call(ctx, contract, entrypoint, calldata, block)
	if err != nil {
		return nil, err
	}
	if len(result) != 1 {
		return nil, fmt.Errorf("unexpected %s response length %d", entrypoint, len(result))
	}
	return parseU128(result[0])
}

// indexedThrough converts an exclusive cursor into the last indexed block.
func indexedThrough(cursor indexCursor, found bool) (uint64, bool) {
	if !found || cursor.NextBlock == 0 {
		return 0, false
	}
	return cursor.NextBlock - 1, true
}
