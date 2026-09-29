package stakingstats

import (
	"context"
	"fmt"
	"math"
	"math/big"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

const (
	testStaking        = "0x5a"
	testStrk           = "0x57"
	testBtc            = "0xb7c"
	testRewardSupplier = "0x5e"
	testMintingCurve   = "0x3c"
	testFeaturedPool   = "0xf001"
	testOtherPool      = "0xb001"
	testFeatured       = "0xfea"
	testOther          = "0xde"
	testHead           = 5_000
	testBlockSeconds   = 60
	testExitWindow     = 604_800
)

// testBase is a UTC midnight, so every 1,440 test blocks is another day.
var testBase = uint64(1_790_640_000)

func blockTimestamp(block uint64) uint64 { return testBase + block*testBlockSeconds }

func wei(value int64) string {
	return "0x" + new(big.Int).Mul(big.NewInt(value), pow10(18)).Text(16)
}

type fakeChain struct {
	calls  map[string][]string
	events []starknet.EmittedEvent
}

func callKey(contract, entrypoint string, calldata []string, block string) string {
	return strings.Join([]string{contract, entrypoint, strings.Join(calldata, ","), block}, "|")
}

func (f *fakeChain) set(contract, entrypoint string, calldata []string, result ...string) {
	f.calls[callKey(contract, entrypoint, calldata, "*")] = result
}

func (f *fakeChain) BlockNumber(context.Context) (uint64, error) { return testHead, nil }

func (f *fakeChain) BlockHeader(_ context.Context, block *uint64) (starknet.ChainBlockHeader, error) {
	number := uint64(testHead)
	if block != nil {
		number = *block
	}
	return starknet.ChainBlockHeader{Number: number, Timestamp: blockTimestamp(number)}, nil
}

func (f *fakeChain) Call(_ context.Context, contract, entrypoint string, calldata []string, block *uint64) ([]string, error) {
	if block != nil {
		if result, ok := f.calls[callKey(contract, entrypoint, calldata, strconv.FormatUint(*block, 10))]; ok {
			return result, nil
		}
	}
	if result, ok := f.calls[callKey(contract, entrypoint, calldata, "*")]; ok {
		return result, nil
	}
	return nil, fmt.Errorf("unexpected call %s.%s(%v)", contract, entrypoint, calldata)
}

func (f *fakeChain) StorageAt(_ context.Context, contract, key string) (string, error) {
	if contract == testRewardSupplier && key == starknet.Selector("minting_curve_dispatcher") {
		return testMintingCurve, nil
	}
	return "0x0", nil
}

func (f *fakeChain) Deployed(_ context.Context, contract string, block uint64) (bool, error) {
	return contract == testStaking && block >= 5, nil
}

// Events pages two events at a time to exercise continuation tokens.
func (f *fakeChain) Events(_ context.Context, filter starknet.EventFilter) (starknet.EventPage, error) {
	var matches []starknet.EmittedEvent
	for _, event := range f.events {
		if event.BlockNumber < filter.FromBlock || event.BlockNumber > filter.ToBlock {
			continue
		}
		if filter.Address != "" && event.FromAddress != filter.Address {
			continue
		}
		if !contains(filter.Keys[0], event.Keys[0]) {
			continue
		}
		matches = append(matches, event)
	}
	offset := 0
	if filter.ContinuationToken != "" {
		offset, _ = strconv.Atoi(filter.ContinuationToken)
	}
	end := min(len(matches), offset+2)
	page := starknet.EventPage{Events: matches[offset:end]}
	if end < len(matches) {
		page.ContinuationToken = strconv.Itoa(end)
	}
	return page, nil
}

func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func newFakeChain() *fakeChain {
	f := &fakeChain{calls: make(map[string][]string)}
	f.set(testFeaturedPool, "contract_parameters_v1", nil, testFeatured, "0x0", testStaking, testStrk, "0x3e8")
	f.set(testStaking, "contract_parameters_v1", nil, wei(20_000), testStrk, "0xa7", "0xc1", testRewardSupplier, "0x93a80")
	f.set(testStaking, "get_epoch_info", nil, "0xe10", "0x3c", "0x0", "0x0", "0x3c", "0xe10")
	f.set(testStaking, "get_current_epoch", nil, "0x53")
	f.set(testStaking, "get_tokens", nil, "0x2", testStrk, "0x1", testBtc, "0x1")
	f.set(testStrk, "decimals", nil, "0x12")
	f.set(testStrk, "symbol", nil, "0x0", "0x5354524b", "0x4")
	f.set(testBtc, "decimals", nil, "0x8")
	f.set(testBtc, "symbol", nil, "0x57425443")
	f.set(testStaking, "get_total_stake_for_token", []string{testStrk}, wei(1_000))
	f.set(testStaking, "get_total_stake_for_token", []string{testBtc}, "0x5f5e100")
	f.set(testStaking, "get_current_total_staking_power", nil, wei(1_000), wei(1))
	f.set(testStaking, "get_total_stake", nil, wei(900))
	f.set(testRewardSupplier, "get_alpha", nil, "0x19")
	f.set(testMintingCurve, "yearly_mint", nil, wei(100))
	f.set(testStaking, "staker_info_v1", []string{testFeatured},
		"0xaa", "0xbb", "0x1", wei(600), wei(1), "0x0", testFeaturedPool, wei(300), "0x3e8")
	f.set(testStaking, "staker_pool_info", []string{testFeatured}, "0x0", "0x3e8", "0x1", testFeaturedPool, testStrk, wei(300))
	f.set(testStaking, "staker_info_v1", []string{testOther},
		"0xcc", "0xdd", "0x0", fmt.Sprintf("0x%x", testBase+400_000), wei(50), "0x0", "0x1")
	f.set(testStaking, "staker_pool_info", []string{testOther}, "0x0", "0x1f4", "0x1", testOtherPool, testBtc, "0x5f5e100")

	stakingEvent := func(block uint64, name string, keys []string, data ...string) starknet.EmittedEvent {
		return starknet.EmittedEvent{
			FromAddress: testStaking, BlockNumber: block, TransactionHash: fmt.Sprintf("0x%x", block),
			Keys: append([]string{starknet.Selector(name)}, keys...), Data: data,
		}
	}
	memberEvent := func(block uint64, pool, member string, old, new string) starknet.EmittedEvent {
		return starknet.EmittedEvent{
			FromAddress: pool, BlockNumber: block, TransactionHash: fmt.Sprintf("0x%x", block),
			Keys: []string{starknet.Selector("PoolMemberBalanceChanged"), member}, Data: []string{old, new},
		}
	}
	f.events = []starknet.EmittedEvent{
		stakingEvent(10, "NewStaker", []string{testFeatured}, "0xaa", "0xbb", wei(600)),
		// A pre-BTC pool has no token key and is always a STRK pool.
		stakingEvent(11, "NewDelegationPool", []string{testFeatured, testFeaturedPool}, "0x3e8"),
		stakingEvent(12, "NewStaker", []string{testOther}, "0xcc", "0xdd", wei(50)),
		stakingEvent(13, "NewDelegationPool", []string{testOther, testOtherPool, testBtc}, "0x1f4"),
		memberEvent(15, testFeaturedPool, "0x111", "0x0", wei(100)),
		memberEvent(16, testOtherPool, "0x222", "0x0", "0x5f5e100"),
		memberEvent(17, "0xdead", "0x999", "0x0", "0x5"),
		stakingEvent(20, "RemoveFromDelegationPoolIntent", []string{testFeatured, testFeaturedPool, "0x111"}, "0x0", wei(100)),
		stakingEvent(21, "RemoveFromDelegationPoolIntent", []string{testOther, testOtherPool, testBtc, "0x222"}, "0x0", "0x2faf080"),
		stakingEvent(30, "RemoveFromDelegationPoolAction", []string{testFeaturedPool, testStrk, "0x111"}, wei(100)),
		memberEvent(31, testFeaturedPool, "0x111", wei(100), "0x0"),
		memberEvent(4_400, testFeaturedPool, "0x333", "0x0", wei(40)),
		stakingEvent(4_400, "RemoveFromDelegationPoolIntent", []string{testFeatured, testFeaturedPool, "0x333"}, "0x0", wei(40)),
		stakingEvent(4_401, "ChangeDelegationPoolIntent", []string{testFeaturedPool, "0x333"}, wei(40), wei(30)),
		// 0x444 requests a full exit: no active balance, but still delegated.
		memberEvent(4_402, testFeaturedPool, "0x444", "0x0", wei(10)),
		memberEvent(4_403, testFeaturedPool, "0x444", wei(10), "0x0"),
		stakingEvent(4_403, "RemoveFromDelegationPoolIntent", []string{testFeatured, testFeaturedPool, "0x444"}, "0x0", wei(10)),
		stakingEvent(4_500, "StakerExitIntent", []string{testOther}, fmt.Sprintf("0x%x", testBase+400_000)),
	}
	sort.SliceStable(f.events, func(i, j int) bool { return f.events[i].BlockNumber < f.events[j].BlockNumber })
	return f
}

func newTestService(t *testing.T, chain Chain) *Service {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "staking.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	service, err := NewService(chain, NewStore(db, "SN_TEST"), Config{Network: "SN_TEST", FeaturedPool: testFeaturedPool})
	if err != nil {
		t.Fatal(err)
	}
	service.clock = func() time.Time { return time.Unix(int64(blockTimestamp(testHead)), 0) }
	return service
}

func TestReconcileBuildsTheNetworkSnapshot(t *testing.T) {
	service := newTestService(t, newFakeChain())
	ctx := context.Background()
	// The first pass indexes the staking stream; the second observes the
	// finished delegator stream in its snapshot.
	for pass := 0; pass < 2; pass++ {
		if err := service.Reconcile(ctx); err != nil {
			t.Fatalf("reconcile pass %d: %v", pass, err)
		}
	}
	snapshot, err := service.Current(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if !snapshot.Index.StakingSynced || !snapshot.Index.MembersSynced || !snapshot.Index.HistorySynced {
		t.Fatalf("expected a synced index: %+v", snapshot.Index)
	}
	if snapshot.Index.DeploymentBlock != 5 || snapshot.Contracts.MintingCurve != testMintingCurve {
		t.Fatalf("unexpected contract resolution: %+v %+v", snapshot.Index, snapshot.Contracts)
	}
	if snapshot.APR.MaxStrkPercent == nil || !near(*snapshot.APR.MaxStrkPercent, 7.5) || snapshot.APR.MaxBtcPercent != nil {
		t.Fatalf("unexpected APR: %+v", snapshot.APR)
	}
	if snapshot.Epoch.ID != 83 || snapshot.Epoch.StartBlock != 4_980 || snapshot.Epoch.BlocksElapsed != 20 {
		t.Fatalf("unexpected epoch: %+v", snapshot.Epoch)
	}

	featured := snapshot.Featured
	if featured == nil || featured.Address != testFeatured || featured.TotalStrk != big18(900) ||
		featured.Rank == nil || *featured.Rank != 1 || !near(featured.StakingPowerPercent, 100) {
		t.Fatalf("unexpected featured validator: %+v", featured)
	}
	if featured.AprStrkPercent == nil || !near(*featured.AprStrkPercent, 6.75) {
		t.Fatalf("unexpected featured APR: %v", featured.AprStrkPercent)
	}
	if featured.Delegators == nil || *featured.Delegators != 2 || featured.PendingStrk != big18(40) {
		t.Fatalf("unexpected featured delegation: %+v", featured)
	}
	if len(snapshot.Validators) != 2 || snapshot.Validators[1].Status != "exiting" ||
		snapshot.Validators[1].Rank != nil || snapshot.Validators[1].DelegatedBtc != big18(1) {
		t.Fatalf("unexpected validator list: %+v", snapshot.Validators)
	}

	totals := snapshot.Totals
	if totals.StrkStaked != big18(1_000) || totals.BtcStaked != big18(1) ||
		totals.StrkPendingDelegators != big18(40) || totals.StrkPendingValidators != big18(50) ||
		totals.StrkPending != big18(90) || totals.BtcPending != "500000000000000000" ||
		totals.ActiveValidators != 1 || totals.ExitingValidators != 1 ||
		totals.Delegators == nil || *totals.Delegators != 3 {
		t.Fatalf("unexpected totals: %+v", totals)
	}

	unstaking := snapshot.Unstaking
	if unstaking.PendingExits != 3 || len(unstaking.Schedule) != scheduleDays {
		t.Fatalf("unexpected unstaking: %+v", unstaking)
	}
	// The exiting validator unlocks tomorrow, the BTC exit in four days, and
	// the recent STRK exits fall in the final bucket.
	if unstaking.Schedule[1].Strk != big18(50) || unstaking.Schedule[4].Btc != "500000000000000000" ||
		unstaking.Schedule[7].Strk != big18(40) || unstaking.Schedule[7].Count != 2 {
		t.Fatalf("unexpected schedule: %+v", unstaking.Schedule)
	}
	if len(unstaking.Largest) != 2 || unstaking.Largest[0].Member != "0x333" || unstaking.Largest[0].Estimated {
		t.Fatalf("unexpected largest exits: %+v", unstaking.Largest)
	}
	if len(unstaking.ExitingValidators) != 1 || unstaking.ExitingValidators[0].Address != testOther {
		t.Fatalf("unexpected exiting validators: %+v", unstaking.ExitingValidators)
	}

	history, err := service.History(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(history.Points) != 4 || !history.Synced || !history.Points[3].Live {
		t.Fatalf("expected three daily samples and a live point, got %+v", history.Points)
	}
	for day, point := range history.Points[:3] {
		midnight := testBase + uint64(day+1)*daySeconds
		if point.Timestamp > int64(midnight) || int64(midnight)-point.Timestamp > sampleTolerance {
			t.Fatalf("sample %d at %d is not at midnight %d", day, point.Timestamp, midnight)
		}
		if point.StrkStaked != big18(900) || point.BtcStaked != big18(1) ||
			point.StrkPending != "0" || point.BtcPending != "500000000000000000" ||
			point.FeaturedStrk == nil || *point.FeaturedStrk != big18(900) {
			t.Fatalf("unexpected sample %d: %+v", day, point)
		}
	}
}

func TestSyncStreamRestartsAfterAnInvalidContinuationToken(t *testing.T) {
	chain := &tokenRejectingChain{fakeChain: newFakeChain()}
	service := newTestService(t, chain)
	ctx := context.Background()
	if err := service.resolveContracts(ctx); err != nil {
		t.Fatal(err)
	}
	if err := service.store.update(ctx, func(tx *storeTx) error {
		end := uint64(4_990)
		return tx.saveCursor(streamStaking, indexCursor{NextBlock: 5, WindowEnd: &end, ContinuationToken: "stale"})
	}); err != nil {
		t.Fatal(err)
	}
	synced, _, err := service.syncStream(ctx, streamStaking, 5, 4_990, testStaking,
		[][]string{stakingStreamSelectors}, service.applyStakingEvents, service.clock().Add(time.Minute))
	if err != nil || !synced {
		t.Fatalf("expected the window to restart and finish: synced=%t err=%v", synced, err)
	}
	stakers, err := service.store.activeStakers(ctx)
	if err != nil || len(stakers) != 2 || stakers[1].ExitTimestamp == nil {
		t.Fatalf("unexpected stakers after restart: %+v %v", stakers, err)
	}
}

type tokenRejectingChain struct{ *fakeChain }

func (c *tokenRejectingChain) Events(ctx context.Context, filter starknet.EventFilter) (starknet.EventPage, error) {
	if filter.ContinuationToken == "stale" {
		return starknet.EventPage{}, starknet.NewRPCError(starknet.RPCInvalidContinuationToken, "invalid token")
	}
	return c.fakeChain.Events(ctx, filter)
}

func near(value, expected float64) bool { return math.Abs(value-expected) < 1e-9 }

func big18(value int64) string {
	return new(big.Int).Mul(big.NewInt(value), pow10(18)).String()
}

func TestValidatorRefreshKeepsPreviousStateForFailedReads(t *testing.T) {
	chain := newFakeChain()
	service := newTestService(t, chain)
	ctx := context.Background()
	if err := service.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	// A throttled read on the next periodic refresh keeps the last good state.
	delete(chain.calls, callKey(testStaking, "staker_info_v1", []string{testOther}, "*"))
	now := service.clock().Add(validatorRefreshPeriod)
	service.clock = func() time.Time { return now }
	if err := service.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	snapshot, err := service.Current(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Validators) != 2 || snapshot.Validators[1].Address != testOther ||
		snapshot.Validators[1].SelfStake != big18(50) {
		t.Fatalf("expected the previous validator state, got %+v", snapshot.Validators)
	}
}
