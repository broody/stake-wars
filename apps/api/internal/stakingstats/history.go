package stakingstats

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"time"

	"stakewars.com/api/internal/starknet"
)

const (
	// A daily sample may land this many seconds before its UTC midnight.
	sampleTolerance = 10 * 60
	maxSearchProbes = 48
)

// extendHistory records one sample per UTC midnight, oldest first, never past
// the indexed exit-intent log.
func (s *Service) extendHistory(ctx context.Context, head starknet.ChainBlockHeader, deadline time.Time) error {
	cursor, found, err := s.store.cursor(ctx, streamStaking)
	if err != nil {
		return err
	}
	through, indexed := indexedThrough(cursor, found)
	if !indexed {
		return nil
	}

	s.mu.RLock()
	var latest *sampleRow
	var previous *sampleRow
	if count := len(s.samples); count > 0 {
		latest = &s.samples[count-1]
		if count > 1 {
			previous = &s.samples[count-2]
		}
	}
	s.mu.RUnlock()

	var low blockTime
	var target uint64
	// blocksPerSecond guides the first probe toward the next midnight.
	blocksPerSecond := 0.0
	if latest == nil {
		deployment := s.contracts.DeploymentBlock
		if err := s.ensureBlockTime(ctx, deployment); err != nil {
			return err
		}
		low = blockTime{Block: deployment, Timestamp: s.blockTimes[deployment]}
		target = low.Timestamp - low.Timestamp%daySeconds + daySeconds
	} else {
		low = blockTime{Block: latest.Block, Timestamp: latest.Timestamp}
		target = midnightAfterSample(latest.Timestamp)
		if previous != nil && latest.Timestamp > previous.Timestamp {
			blocksPerSecond = float64(latest.Block-previous.Block) / float64(latest.Timestamp-previous.Timestamp)
		}
	}
	high := blockTime{Block: head.Number, Timestamp: head.Timestamp}
	featuredFrom, featuredKnown, err := s.store.registeredBlock(ctx, s.contracts.FeaturedStaker)
	if err != nil {
		return err
	}

	for target+sampleTolerance < head.Timestamp && s.clock().Before(deadline) {
		point, err := s.blockAtOrBefore(ctx, target, low, high, blocksPerSecond)
		if err != nil {
			return err
		}
		if point.Block > through {
			break
		}
		sample, err := s.readSample(ctx, point, featuredKnown && point.Block >= featuredFrom)
		if err != nil {
			return fmt.Errorf("sample block %d: %w", point.Block, err)
		}
		if err := s.store.saveSample(ctx, sample); err != nil {
			return err
		}
		s.mu.Lock()
		s.samples = append(s.samples, sample)
		s.mu.Unlock()
		if point.Timestamp > low.Timestamp {
			blocksPerSecond = float64(point.Block-low.Block) / float64(point.Timestamp-low.Timestamp)
		}
		low = point
		target += daySeconds
	}

	synced := target+sampleTolerance >= head.Timestamp
	s.mu.Lock()
	defer s.mu.Unlock()
	if count := len(s.samples); count > 0 {
		through := int64(s.samples[count-1].Timestamp)
		s.progress.HistoryThrough = &through
	}
	s.progress.HistorySynced = synced
	return nil
}

// midnightAfterSample returns the next UTC midnight after the day a sample
// represents; a sample sits at most sampleTolerance before its midnight.
func midnightAfterSample(timestamp uint64) uint64 {
	represented := timestamp + sampleTolerance
	return represented - represented%daySeconds + daySeconds
}

// blockAtOrBefore finds a block at or before target within sampleTolerance.
// low must be at or before target and high after it.
func (s *Service) blockAtOrBefore(
	ctx context.Context,
	target uint64,
	low, high blockTime,
	blocksPerSecond float64,
) (blockTime, error) {
	for probe := 0; high.Block-low.Block > 1 && probe < maxSearchProbes; probe++ {
		if target-low.Timestamp <= sampleTolerance {
			break
		}
		var guess uint64
		switch {
		case probe == 0 && blocksPerSecond > 0:
			guess = low.Block + uint64(blocksPerSecond*float64(target-low.Timestamp))
		case probe < 8 && high.Timestamp > low.Timestamp:
			fraction := float64(target-low.Timestamp) / float64(high.Timestamp-low.Timestamp)
			guess = low.Block + uint64(fraction*float64(high.Block-low.Block))
		default:
			guess = low.Block + (high.Block-low.Block)/2
		}
		guess = max(low.Block+1, min(guess, high.Block-1))
		if err := s.ensureBlockTime(ctx, guess); err != nil {
			return blockTime{}, err
		}
		point := blockTime{Block: guess, Timestamp: s.blockTimes[guess]}
		if point.Timestamp <= target {
			low = point
		} else {
			high = point
		}
	}
	return low, nil
}

func (s *Service) readSample(ctx context.Context, point blockTime, featured bool) (sampleRow, error) {
	block := point.Block
	c := s.contracts
	var (
		wait                         sync.WaitGroup
		strk                         *big.Int
		power, featuredInfo, poolRes []string
		strkErr, powerErr            error
		infoErr, poolErr             error
	)
	wait.Add(2)
	go func() {
		defer wait.Done()
		strk, strkErr = s.callU128(ctx, c.Staking, "get_total_stake", nil, &block)
	}()
	go func() {
		defer wait.Done()
		power, powerErr = s.chain.Call(ctx, c.Staking, "get_current_total_staking_power", nil, &block)
	}()
	if featured {
		wait.Add(2)
		go func() {
			defer wait.Done()
			featuredInfo, infoErr = s.chain.Call(ctx, c.Staking, "staker_info_v1", []string{c.FeaturedStaker}, &block)
		}()
		go func() {
			defer wait.Done()
			poolRes, poolErr = s.chain.Call(ctx, c.Staking, "staker_pool_info", []string{c.FeaturedStaker}, &block)
		}()
	}
	wait.Wait()

	if strkErr != nil {
		return sampleRow{}, fmt.Errorf("read total stake: %w", strkErr)
	}
	// Before BTC staking the contract has no BTC staking power.
	btc := new(big.Int)
	switch {
	case powerErr == nil && len(power) == 2:
		value, err := parseU128(power[1])
		if err != nil {
			return sampleRow{}, fmt.Errorf("decode BTC staking power: %w", err)
		}
		btc = value
	case powerErr == nil, starknet.IsRPCError(powerErr, starknet.RPCEntrypointNotFound):
	default:
		return sampleRow{}, fmt.Errorf("read staking power: %w", powerErr)
	}

	sample := sampleRow{
		Block: point.Block, Timestamp: point.Timestamp,
		StrkStaked: strk.String(), BtcStaked: btc.String(),
	}
	if featured && infoErr == nil {
		if info, err := decodeStakerInfoV1(featuredInfo, c.StrkToken); err == nil {
			pools := make([]poolInfo, 0)
			if poolErr == nil {
				if decoded, err := decodeStakerPoolInfo(poolRes); err == nil {
					pools = decoded.Pools
				}
			} else if info.Pool != nil {
				pools = append(pools, *info.Pool)
			}
			featuredStrk := new(big.Int).Set(info.AmountOwn)
			featuredBtc := new(big.Int)
			for _, pool := range pools {
				if pool.Token == c.StrkToken {
					featuredStrk.Add(featuredStrk, pool.Amount)
					continue
				}
				meta, err := s.token(ctx, pool.Token)
				if err != nil {
					return sampleRow{}, err
				}
				featuredBtc.Add(featuredBtc, normalizeAmount(pool.Amount, meta.Decimals))
			}
			strkValue, btcValue := featuredStrk.String(), featuredBtc.String()
			sample.FeaturedStrk, sample.FeaturedBtc = &strkValue, &btcValue
		}
	}

	if s.sampleBook == nil || s.sampleBook.watermark.Block > block {
		s.sampleBook = newPendingBook()
	}
	rows, err := s.store.exitIntentsBetween(ctx, s.sampleBook.watermark, block)
	if err != nil {
		return sampleRow{}, err
	}
	for _, row := range rows {
		s.sampleBook.apply(row)
	}
	strkPending, btcPending := s.sampleBook.totals(c.StrkToken, s.tokenDecimals)
	sample.StrkPending, sample.BtcPending = strkPending.String(), btcPending.String()
	return sample, nil
}
