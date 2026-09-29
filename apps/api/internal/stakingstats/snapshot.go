package stakingstats

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"math/big"
	"sort"
	"strings"
	"sync"

	"stakewars.com/api/internal/starknet"
)

const (
	readConcurrency         = 4
	commissionDenominator   = 10_000
	scheduleDays            = 8
	largestExitCount        = 12
	maxExactTimesPerRefresh = 64
	daySeconds              = 86_400
)

type validatorState struct {
	Address    string
	Info       stakerInfo
	Pools      []poolInfo
	Commission *uint64
}

type blockTime struct {
	Block     uint64
	Timestamp uint64
}

// readValidators reads every indexed staker. A staker whose read fails keeps
// its previous state, so one throttled request does not discard a refresh.
func (s *Service) readValidators(ctx context.Context, stakers []stakerRow) ([]validatorState, error) {
	previous := make(map[string]validatorState, len(s.validators))
	for _, validator := range s.validators {
		previous[validator.Address] = validator
	}
	results := make([]*validatorState, len(stakers))
	errs := make([]error, len(stakers))
	semaphore := make(chan struct{}, readConcurrency)
	var wait sync.WaitGroup
	for index, staker := range stakers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			results[index], errs[index] = s.readValidator(ctx, staker.Address)
		}()
	}
	wait.Wait()

	validators := make([]validatorState, 0, len(stakers))
	kept := 0
	for index, result := range results {
		if err := errs[index]; err != nil {
			prior, ok := previous[stakers[index].Address]
			if !ok || ctx.Err() != nil {
				return nil, fmt.Errorf("read validator %s: %w", stakers[index].Address, err)
			}
			validators = append(validators, prior)
			kept++
			continue
		}
		if result != nil {
			validators = append(validators, *result)
		}
	}
	if kept > 0 {
		slog.WarnContext(ctx, "Kept previous state for unreadable validators", "count", kept)
	}
	return validators, nil
}

func (s *Service) readValidator(ctx context.Context, staker string) (*validatorState, error) {
	result, err := s.callWithRetry(ctx, s.contracts.Staking, "staker_info_v1", []string{staker})
	if starknet.IsRPCError(err, starknet.RPCContractError) {
		// The staker withdrew after the index last saw it.
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	info, err := decodeStakerInfoV1(result, s.contracts.StrkToken)
	if err != nil {
		return nil, err
	}
	state := &validatorState{Address: staker, Info: info, Commission: info.Commission}
	result, err = s.callWithRetry(ctx, s.contracts.Staking, "staker_pool_info", []string{staker})
	switch {
	case starknet.IsRPCError(err, starknet.RPCEntrypointNotFound):
		if info.Pool != nil {
			state.Pools = []poolInfo{*info.Pool}
		}
	case err != nil:
		return nil, err
	default:
		pools, err := decodeStakerPoolInfo(result)
		if err != nil {
			return nil, err
		}
		state.Pools = pools.Pools
		state.Commission = pools.Commission
	}
	return state, nil
}

func (s *Service) callWithRetry(ctx context.Context, contract, entrypoint string, calldata []string) ([]string, error) {
	result, err := s.chain.Call(ctx, contract, entrypoint, calldata, nil)
	if err == nil || starknet.IsRPCError(err, starknet.RPCContractError) ||
		starknet.IsRPCError(err, starknet.RPCEntrypointNotFound) || ctx.Err() != nil {
		return result, err
	}
	return s.chain.Call(ctx, contract, entrypoint, calldata, nil)
}

type tokenTotals struct {
	staked  map[string]*big.Int
	pending map[string]*big.Int
}

func (s *Service) refreshSnapshot(ctx context.Context, head starknet.ChainBlockHeader) error {
	c := s.contracts
	result, err := s.chain.Call(ctx, c.Staking, "contract_parameters_v1", nil, nil)
	if err != nil {
		return fmt.Errorf("read staking parameters: %w", err)
	}
	parameters, err := decodeStakingParameters(result)
	if err != nil {
		return err
	}
	result, err = s.chain.Call(ctx, c.Staking, "get_epoch_info", nil, nil)
	if err != nil {
		return fmt.Errorf("read epoch info: %w", err)
	}
	epochInfo, err := decodeEpochInfo(result)
	if err != nil {
		return err
	}
	result, err = s.chain.Call(ctx, c.Staking, "get_current_epoch", nil, nil)
	if err != nil {
		return fmt.Errorf("read current epoch: %w", err)
	}
	if len(result) != 1 {
		return fmt.Errorf("unexpected current epoch length %d", len(result))
	}
	epochID, err := parseU64(result[0])
	if err != nil {
		return fmt.Errorf("decode current epoch: %w", err)
	}
	result, err = s.chain.Call(ctx, c.Staking, "get_tokens", nil, nil)
	if err != nil {
		return fmt.Errorf("read staking tokens: %w", err)
	}
	tokenStates, err := decodeTokens(result)
	if err != nil {
		return err
	}
	totals := tokenTotals{staked: make(map[string]*big.Int), pending: make(map[string]*big.Int)}
	for _, token := range tokenStates {
		if _, err := s.token(ctx, token.Address); err != nil {
			return err
		}
		staked, err := s.callU128(ctx, c.Staking, "get_total_stake_for_token", []string{token.Address}, nil)
		if err != nil {
			// Disabled tokens revert; they carry no active stake.
			if !starknet.IsRPCError(err, starknet.RPCContractError) {
				return fmt.Errorf("read token stake: %w", err)
			}
			staked = new(big.Int)
		}
		totals.staked[token.Address] = staked
	}
	result, err = s.chain.Call(ctx, c.Staking, "get_current_total_staking_power", nil, nil)
	if err != nil {
		return fmt.Errorf("read total staking power: %w", err)
	}
	if len(result) != 2 {
		return fmt.Errorf("unexpected total staking power length %d", len(result))
	}
	strkPower, err := parseU128(result[0])
	if err != nil {
		return fmt.Errorf("decode STRK staking power: %w", err)
	}
	btcPower, err := parseU128(result[1])
	if err != nil {
		return fmt.Errorf("decode BTC staking power: %w", err)
	}
	btcShare := uint64(defaultBtcSharePercent)
	if alpha, err := s.callU128(ctx, c.RewardSupplier, "get_alpha", nil, nil); err == nil && alpha.IsUint64() && alpha.Uint64() <= 100 {
		btcShare = alpha.Uint64()
	}
	yearlyMint, err := s.callU128(ctx, c.MintingCurve, "yearly_mint", nil, nil)
	if err != nil {
		return fmt.Errorf("read yearly mint: %w", err)
	}
	prices := s.readPrices(ctx)

	stakers, err := s.store.activeStakers(ctx)
	if err != nil {
		return err
	}
	stakerSet := make([]string, len(stakers))
	for index, staker := range stakers {
		stakerSet[index] = staker.Address
	}
	// Balances refresh periodically; a newly indexed or removed validator
	// refreshes the list immediately.
	if key := strings.Join(stakerSet, ","); s.validators == nil || key != s.validatorSet ||
		s.clock().Sub(s.validatorsReadAt) >= validatorRefreshPeriod {
		validators, err := s.readValidators(ctx, stakers)
		if err != nil {
			return err
		}
		s.validatorSet = key
		for _, validator := range validators {
			for _, pool := range validator.Pools {
				if _, err := s.token(ctx, pool.Token); err != nil {
					return err
				}
			}
		}
		s.validators = validators
		s.validatorsReadAt = s.clock()
	}

	rows, err := s.store.exitIntentsBetween(ctx, s.liveBook.watermark, math.MaxInt64)
	if err != nil {
		return err
	}
	for _, row := range rows {
		s.liveBook.apply(row)
	}
	s.mu.RLock()
	membersSynced := s.progress.MembersSynced
	s.mu.RUnlock()
	// Counting walks every delegation position, so it follows the validator
	// refresh cadence rather than every tick.
	if membersSynced && (s.delegators == nil || s.delegatorsReadAt.Before(s.validatorsReadAt)) {
		counts, err := s.countDelegators(ctx)
		if err != nil {
			return err
		}
		s.delegators = counts
		s.delegatorsReadAt = s.clock()
	}
	counts := s.delegators
	if err := s.resolveIntentTimes(ctx, head, parameters.ExitWaitWindowSecs); err != nil {
		return err
	}

	apr := APR{}
	strkRewards := new(big.Int).Mul(yearlyMint, big.NewInt(int64(100-btcShare)))
	strkRewards.Quo(strkRewards, big.NewInt(100))
	btcRewards := new(big.Int).Sub(yearlyMint, strkRewards)
	if strkPower.Sign() > 0 {
		value := ratioPercent(strkRewards, strkPower)
		apr.MaxStrkPercent = &value
	}
	if btcPower.Sign() > 0 && prices != nil && prices.BtcUsd > 0 {
		value := ratioPercent(btcRewards, btcPower) * prices.StrkUsd / prices.BtcUsd
		apr.MaxBtcPercent = &value
	}

	start, length, duration := epochInfo.bounds(epochID)
	elapsed := uint64(0)
	if head.Number > start {
		elapsed = min(head.Number-start, length)
	}
	remainingSeconds := float64(length-elapsed) * float64(duration) / float64(length)

	snapshot := &Snapshot{
		Network:    s.config.Network,
		ObservedAt: s.clock().UTC(),
		Block:      BlockRef{Number: head.Number, Timestamp: int64(head.Timestamp)},
		Contracts: ContractRefs{
			Staking: c.Staking, RewardSupplier: c.RewardSupplier,
			MintingCurve: c.MintingCurve, FeaturedPool: c.FeaturedPool,
		},
		Epoch: Epoch{
			ID: epochID, StartBlock: start, LengthBlocks: length, DurationSeconds: duration,
			BlocksElapsed: elapsed, EstimatedEndAt: int64(head.Timestamp) + int64(remainingSeconds),
		},
		Parameters: Parameters{
			MinStake:              parameters.MinStake.String(),
			ExitWaitWindowSeconds: parameters.ExitWaitWindowSecs,
			YearlyMint:            yearlyMint.String(),
			BtcRewardSharePercent: btcShare,
		},
		Prices: prices,
		APR:    apr,
	}
	s.buildValidators(snapshot, counts, btcShare)
	s.buildUnstaking(snapshot, &totals, parameters.ExitWaitWindowSecs, prices)
	s.buildTotals(snapshot, tokenStates, &totals, counts)

	live := &HistoryPoint{
		Timestamp: int64(head.Timestamp), Block: head.Number, Live: true,
		StrkStaked: totals.staked[c.StrkToken].String(), BtcStaked: btcPower.String(),
	}
	strkPending, btcPending := s.liveBook.totals(c.StrkToken, s.tokenDecimals)
	live.StrkPending, live.BtcPending = strkPending.String(), btcPending.String()
	if snapshot.Featured != nil {
		live.FeaturedStrk = &snapshot.Featured.TotalStrk
		live.FeaturedBtc = &snapshot.Featured.DelegatedBtc
	}
	snapshot.livePoint = live

	s.mu.Lock()
	s.snapshot = snapshot
	s.mu.Unlock()
	return nil
}

type delegatorCounts struct {
	ByStaker map[string]int
	Total    int
}

// countDelegators counts, per validator, the pool positions that are active
// or exiting, and network-wide the distinct delegator addresses behind them.
func (s *Service) countDelegators(ctx context.Context) (*delegatorCounts, error) {
	positions, err := s.store.activePositions(ctx)
	if err != nil {
		return nil, err
	}
	counts := &delegatorCounts{ByStaker: make(map[string]int)}
	seen := make(map[string]struct{}, len(positions))
	members := make(map[string]struct{}, len(positions))
	add := func(staker, pool, member string) {
		key := pool + "|" + member
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		members[member] = struct{}{}
		counts.ByStaker[staker]++
	}
	for _, position := range positions {
		add(position.Staker, position.Pool, position.Member)
	}
	// A member who requested a full exit has no active balance but is still
	// delegated until the exit is withdrawn.
	for _, intent := range s.liveBook.list() {
		add(intent.Staker, intent.Pool, intent.Identifier)
	}
	counts.Total = len(members)
	return counts, nil
}

// ratioPercent returns numerator / denominator as a percentage.
func ratioPercent(numerator, denominator *big.Int) float64 {
	value, _ := new(big.Rat).SetFrac(numerator, denominator).Float64()
	return value * 100
}

func (s *Service) buildValidators(snapshot *Snapshot, counts *delegatorCounts, btcShare uint64) {
	strkToken := s.contracts.StrkToken
	pendingStrk := make(map[string]*big.Int)
	pendingBtc := make(map[string]*big.Int)
	for _, intent := range s.liveBook.list() {
		target := pendingBtc
		amount := intent.Amount
		if intent.Token == strkToken {
			target = pendingStrk
		} else if decimals, ok := s.tokenDecimals(intent.Token); ok {
			amount = normalizeAmount(intent.Amount, decimals)
		} else {
			continue
		}
		if target[intent.Staker] == nil {
			target[intent.Staker] = new(big.Int)
		}
		target[intent.Staker].Add(target[intent.Staker], amount)
	}

	type weighted struct {
		validator Validator
		strk, btc *big.Int
		active    bool
	}
	rows := make([]weighted, 0, len(s.validators))
	activeStrk, activeBtc := new(big.Int), new(big.Int)
	for _, state := range s.validators {
		delegatedStrk, delegatedBtc := new(big.Int), new(big.Int)
		pools := make([]ValidatorPool, 0, len(state.Pools))
		for _, pool := range state.Pools {
			meta := s.tokens[pool.Token]
			pools = append(pools, ValidatorPool{
				Address: pool.Pool, Token: pool.Token, Symbol: meta.Symbol,
				Decimals: meta.Decimals, Amount: pool.Amount.String(),
			})
			if pool.Token == strkToken {
				delegatedStrk.Add(delegatedStrk, pool.Amount)
			} else {
				delegatedBtc.Add(delegatedBtc, normalizeAmount(pool.Amount, meta.Decimals))
			}
		}
		total := new(big.Int).Add(state.Info.AmountOwn, delegatedStrk)
		validator := Validator{
			Address:            state.Address,
			RewardAddress:      state.Info.RewardAddress,
			OperationalAddress: state.Info.OperationalAddress,
			Featured:           state.Address == s.contracts.FeaturedStaker,
			Status:             "active",
			SelfStake:          state.Info.AmountOwn.String(),
			DelegatedStrk:      delegatedStrk.String(),
			TotalStrk:          total.String(),
			DelegatedBtc:       delegatedBtc.String(),
			Pools:              pools,
			CommissionBps:      state.Commission,
			PendingStrk:        bigOrZero(pendingStrk[state.Address]).String(),
			PendingBtc:         bigOrZero(pendingBtc[state.Address]).String(),
			UnclaimedRewards:   state.Info.UnclaimedOwn.String(),
		}
		if state.Info.UnstakeTime != nil {
			validator.Status = "exiting"
			unstakeAt := int64(*state.Info.UnstakeTime)
			validator.UnstakeAt = &unstakeAt
		}
		if counts != nil {
			delegators := counts.ByStaker[state.Address]
			validator.Delegators = &delegators
		}
		active := validator.Status == "active"
		if active {
			activeStrk.Add(activeStrk, total)
			activeBtc.Add(activeBtc, delegatedBtc)
		}
		rows = append(rows, weighted{validator: validator, strk: total, btc: delegatedBtc, active: active})
	}

	// Staking power weighs a validator's share of STRK and of BTC by the
	// reward split, as the consensus contract does.
	strkWeight := float64(100-btcShare) / 100
	btcWeight := float64(btcShare) / 100
	if activeBtc.Sign() == 0 {
		strkWeight, btcWeight = 1, 0
	}
	for index := range rows {
		row := &rows[index]
		if !row.active {
			continue
		}
		power := 0.0
		if activeStrk.Sign() > 0 {
			power += strkWeight * ratioPercent(row.strk, activeStrk)
		}
		if activeBtc.Sign() > 0 {
			power += btcWeight * ratioPercent(row.btc, activeBtc)
		}
		row.validator.StakingPowerPercent = power
		if commission := row.validator.CommissionBps; commission != nil && *commission <= commissionDenominator {
			keep := float64(commissionDenominator-*commission) / commissionDenominator
			if snapshot.APR.MaxStrkPercent != nil {
				value := *snapshot.APR.MaxStrkPercent * keep
				row.validator.AprStrkPercent = &value
			}
			if snapshot.APR.MaxBtcPercent != nil && row.btc.Sign() > 0 {
				value := *snapshot.APR.MaxBtcPercent * keep
				row.validator.AprBtcPercent = &value
			}
		}
	}

	sort.SliceStable(rows, func(i, j int) bool {
		left, right := rows[i], rows[j]
		if left.active != right.active {
			return left.active
		}
		if left.validator.StakingPowerPercent != right.validator.StakingPowerPercent {
			return left.validator.StakingPowerPercent > right.validator.StakingPowerPercent
		}
		if cmp := left.strk.Cmp(right.strk); cmp != 0 {
			return cmp > 0
		}
		return left.validator.Address < right.validator.Address
	})
	snapshot.Validators = make([]Validator, 0, len(rows))
	for index, row := range rows {
		if row.active {
			rank := index + 1
			row.validator.Rank = &rank
		}
		snapshot.Validators = append(snapshot.Validators, row.validator)
		if row.validator.Featured {
			featured := row.validator
			snapshot.Featured = &featured
		}
	}
}

func (s *Service) buildUnstaking(snapshot *Snapshot, totals *tokenTotals, exitWindow uint64, prices *Prices) {
	strkToken := s.contracts.StrkToken
	now := s.clock().Unix()
	today := now - now%daySeconds
	schedule := make([]UnlockDay, scheduleDays)
	scheduleStrk := make([]*big.Int, scheduleDays)
	scheduleBtc := make([]*big.Int, scheduleDays)
	for day := range schedule {
		schedule[day].Day = today + int64(day)*daySeconds
		scheduleStrk[day], scheduleBtc[day] = new(big.Int), new(big.Int)
	}
	withdrawableStrk, withdrawableBtc := new(big.Int), new(big.Int)
	add := func(unlockAt int64, token string, amount *big.Int) {
		normalized := amount
		isStrk := token == strkToken
		if !isStrk {
			decimals, ok := s.tokenDecimals(token)
			if !ok {
				return
			}
			normalized = normalizeAmount(amount, decimals)
		}
		if unlockAt <= now {
			if isStrk {
				withdrawableStrk.Add(withdrawableStrk, normalized)
			} else {
				withdrawableBtc.Add(withdrawableBtc, normalized)
			}
			return
		}
		day := min(int((unlockAt-today)/daySeconds), scheduleDays-1)
		schedule[day].Count++
		if isStrk {
			scheduleStrk[day].Add(scheduleStrk[day], normalized)
		} else {
			scheduleBtc[day].Add(scheduleBtc[day], normalized)
		}
	}

	intents := s.liveBook.list()
	known := s.knownBlockTimes()
	exits := make([]PendingExit, 0, len(intents))
	values := make([]float64, 0, len(intents))
	for _, intent := range intents {
		if totals.pending[intent.Token] == nil {
			totals.pending[intent.Token] = new(big.Int)
		}
		totals.pending[intent.Token].Add(totals.pending[intent.Token], intent.Amount)
		timestamp, estimated := s.estimatedBlockTime(intent.IntentBlock, known)
		unlockAt := int64(timestamp + exitWindow)
		add(unlockAt, intent.Token, intent.Amount)

		meta := s.tokens[intent.Token]
		amount, _ := new(big.Rat).SetFrac(intent.Amount, pow10(int(meta.Decimals))).Float64()
		value := amount
		switch {
		case intent.Token == strkToken && prices != nil:
			value = amount * prices.StrkUsd
		case intent.Token != strkToken && prices != nil:
			value = amount * prices.BtcUsd
		case intent.Token != strkToken:
			// Without prices, rank STRK exits only.
			continue
		}
		exits = append(exits, PendingExit{
			Member: intent.Identifier, Validator: intent.Staker, Token: intent.Token,
			Symbol: meta.Symbol, Decimals: meta.Decimals, Amount: intent.Amount.String(),
			UnlockAt: unlockAt, Estimated: estimated,
		})
		values = append(values, value)
	}
	order := make([]int, len(exits))
	for index := range order {
		order[index] = index
	}
	sort.SliceStable(order, func(i, j int) bool { return values[order[i]] > values[order[j]] })
	largest := make([]PendingExit, 0, largestExitCount)
	for _, index := range order[:min(len(order), largestExitCount)] {
		largest = append(largest, exits[index])
	}

	exitingValidators := make([]ExitingValidator, 0)
	for _, validator := range snapshot.Validators {
		if validator.UnstakeAt == nil {
			continue
		}
		self, _ := new(big.Int).SetString(validator.SelfStake, 10)
		add(*validator.UnstakeAt, strkToken, self)
		exitingValidators = append(exitingValidators, ExitingValidator{
			Address: validator.Address, SelfStake: validator.SelfStake,
			DelegatedStrk: validator.DelegatedStrk, DelegatedBtc: validator.DelegatedBtc,
			UnlockAt: *validator.UnstakeAt,
		})
	}
	sort.SliceStable(exitingValidators, func(i, j int) bool {
		return exitingValidators[i].UnlockAt < exitingValidators[j].UnlockAt
	})

	for day := range schedule {
		schedule[day].Strk = scheduleStrk[day].String()
		schedule[day].Btc = scheduleBtc[day].String()
	}
	snapshot.Unstaking = Unstaking{
		PendingExits:      len(intents),
		WithdrawableStrk:  withdrawableStrk.String(),
		WithdrawableBtc:   withdrawableBtc.String(),
		Schedule:          schedule,
		Largest:           largest,
		ExitingValidators: exitingValidators,
	}
}

func (s *Service) buildTotals(
	snapshot *Snapshot,
	tokenStates []tokenState,
	totals *tokenTotals,
	counts *delegatorCounts,
) {
	strkToken := s.contracts.StrkToken
	strkStaked, btcStaked, btcPending := new(big.Int), new(big.Int), new(big.Int)
	snapshot.Tokens = make([]TokenStake, 0, len(tokenStates))
	for _, state := range tokenStates {
		meta := s.tokens[state.Address]
		staked := bigOrZero(totals.staked[state.Address])
		pending := bigOrZero(totals.pending[state.Address])
		kind := "btc"
		if state.Address == strkToken {
			kind = "strk"
			strkStaked.Add(strkStaked, staked)
		} else {
			btcStaked.Add(btcStaked, normalizeAmount(staked, meta.Decimals))
			btcPending.Add(btcPending, normalizeAmount(pending, meta.Decimals))
		}
		snapshot.Tokens = append(snapshot.Tokens, TokenStake{
			Address: state.Address, Symbol: meta.Symbol, Decimals: meta.Decimals, Kind: kind,
			Active: state.Active, Staked: staked.String(), Pending: pending.String(),
		})
	}
	delegatorPending := bigOrZero(totals.pending[strkToken])
	validatorPending := new(big.Int)
	active, exiting := 0, 0
	for _, validator := range snapshot.Validators {
		if validator.Status == "exiting" {
			exiting++
			self, _ := new(big.Int).SetString(validator.SelfStake, 10)
			validatorPending.Add(validatorPending, self)
		} else {
			active++
		}
	}
	snapshot.Totals = Totals{
		StrkStaked:            strkStaked.String(),
		BtcStaked:             btcStaked.String(),
		StrkPending:           new(big.Int).Add(delegatorPending, validatorPending).String(),
		StrkPendingDelegators: delegatorPending.String(),
		StrkPendingValidators: validatorPending.String(),
		BtcPending:            btcPending.String(),
		ActiveValidators:      active,
		ExitingValidators:     exiting,
	}
	if counts != nil {
		total := counts.Total
		snapshot.Totals.Delegators = &total
	}
}

// resolveIntentTimes loads cached intent block timestamps and reads exact
// headers for the exits that may still be inside their window.
func (s *Service) resolveIntentTimes(ctx context.Context, head starknet.ChainBlockHeader, exitWindow uint64) error {
	intents := s.liveBook.list()
	missing := make([]uint64, 0)
	seen := make(map[uint64]bool)
	for _, intent := range intents {
		if _, ok := s.blockTimes[intent.IntentBlock]; !ok && !seen[intent.IntentBlock] {
			seen[intent.IntentBlock] = true
			missing = append(missing, intent.IntentBlock)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	// A recent anchor keeps estimates for the last exit window accurate.
	const anchorDistance = 100_000
	if head.Number > anchorDistance {
		if err := s.ensureBlockTime(ctx, head.Number-anchorDistance); err != nil {
			return err
		}
	}
	horizon := int64(head.Timestamp) - int64(exitWindow) - 2*daySeconds
	known := s.knownBlockTimes()
	var exact []uint64
	for _, block := range missing {
		if _, ok := s.blockTimes[block]; ok {
			continue
		}
		if estimate, _ := s.estimatedBlockTime(block, known); int64(estimate) >= horizon {
			exact = append(exact, block)
		}
	}
	sort.Slice(exact, func(i, j int) bool { return exact[i] > exact[j] })
	exact = exact[:min(len(exact), maxExactTimesPerRefresh)]
	var wait sync.WaitGroup
	headers := make([]starknet.ChainBlockHeader, len(exact))
	errs := make([]error, len(exact))
	semaphore := make(chan struct{}, readConcurrency)
	for index, block := range exact {
		wait.Add(1)
		go func() {
			defer wait.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			headers[index], errs[index] = s.chain.BlockHeader(ctx, &block)
		}()
	}
	wait.Wait()
	for index, header := range headers {
		if errs[index] != nil {
			return fmt.Errorf("read exit intent block: %w", errs[index])
		}
		s.blockTimes[header.Number] = header.Timestamp
		if err := s.store.saveBlockTime(ctx, header.Number, header.Timestamp); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) ensureBlockTime(ctx context.Context, block uint64) error {
	if _, ok := s.blockTimes[block]; ok {
		return nil
	}
	header, err := s.chain.BlockHeader(ctx, &block)
	if err != nil {
		return fmt.Errorf("read block %d: %w", block, err)
	}
	s.blockTimes[block] = header.Timestamp
	return s.store.saveBlockTime(ctx, block, header.Timestamp)
}

// knownBlockTimes returns every read header sorted by block number.
func (s *Service) knownBlockTimes() []blockTime {
	points := make([]blockTime, 0, len(s.blockTimes))
	for block, timestamp := range s.blockTimes {
		points = append(points, blockTime{Block: block, Timestamp: timestamp})
	}
	sort.Slice(points, func(i, j int) bool { return points[i].Block < points[j].Block })
	return points
}

// estimatedBlockTime returns a block's timestamp, interpolating between the
// nearest known headers when it has not been read.
func (s *Service) estimatedBlockTime(block uint64, known []blockTime) (uint64, bool) {
	if timestamp, ok := s.blockTimes[block]; ok {
		return timestamp, false
	}
	return interpolateBlockTime(known, block), true
}

// interpolateBlockTime estimates a timestamp from points sorted by block.
func interpolateBlockTime(points []blockTime, block uint64) uint64 {
	if len(points) == 0 {
		return 0
	}
	if len(points) == 1 {
		return points[0].Timestamp
	}
	index := sort.Search(len(points), func(i int) bool { return points[i].Block > block })
	// Use the bracketing pair, or the nearest pair at either end to extrapolate.
	low, high := index-1, index
	if low < 0 {
		low, high = 0, 1
	} else if high >= len(points) {
		low, high = len(points)-2, len(points)-1
	}
	left, right := points[low], points[high]
	if right.Block == left.Block {
		return left.Timestamp
	}
	slope := (float64(right.Timestamp) - float64(left.Timestamp)) / (float64(right.Block) - float64(left.Block))
	estimate := float64(left.Timestamp) + slope*(float64(block)-float64(left.Block))
	if estimate < 0 {
		return 0
	}
	return uint64(estimate)
}

func bigOrZero(value *big.Int) *big.Int {
	if value == nil {
		return new(big.Int)
	}
	return value
}
