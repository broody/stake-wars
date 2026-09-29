package stakingstats

import (
	"math/big"
	"testing"
)

func TestDecodeStringReadsShortStringsAndByteArrays(t *testing.T) {
	if got, err := decodeString([]string{"0x57425443"}); err != nil || got != "WBTC" {
		t.Fatalf("short string: got %q, %v", got, err)
	}
	if got, err := decodeString([]string{"0x0", "0x5354524b", "0x4"}); err != nil || got != "STRK" {
		t.Fatalf("pending-only ByteArray: got %q, %v", got, err)
	}
	// 31 bytes fill one word; the remaining "!" is the pending word.
	full := "0x" + hexOf("Stake Wars validator dashboard.")
	if got, err := decodeString([]string{"0x1", full, "0x21", "0x1"}); err != nil ||
		got != "Stake Wars validator dashboard.!" {
		t.Fatalf("multi-word ByteArray: got %q, %v", got, err)
	}
	if _, err := decodeString([]string{"0x2", "0x1", "0x0", "0x0"}); err == nil {
		t.Fatal("expected a truncated ByteArray to fail")
	}
}

func TestDecodeStakerInfoV1HandlesOptionalFields(t *testing.T) {
	withPool, err := decodeStakerInfoV1([]string{
		"0xaa", "0xbb", "0x1", "0x64", "0x5", "0x0", "0xcc", "0xc8", "0x3e8",
	}, "0x57")
	if err != nil {
		t.Fatal(err)
	}
	if withPool.UnstakeTime != nil || withPool.AmountOwn.Int64() != 100 || withPool.UnclaimedOwn.Int64() != 5 {
		t.Fatalf("unexpected own fields: %+v", withPool)
	}
	if withPool.Pool == nil || withPool.Pool.Pool != "0xcc" || withPool.Pool.Token != "0x57" ||
		withPool.Pool.Amount.Int64() != 200 || *withPool.Commission != 1000 {
		t.Fatalf("unexpected pool: %+v", withPool.Pool)
	}

	exiting, err := decodeStakerInfoV1([]string{"0xaa", "0xbb", "0x0", "0x6553f100", "0x64", "0x0", "0x1"}, "0x57")
	if err != nil {
		t.Fatal(err)
	}
	if exiting.UnstakeTime == nil || *exiting.UnstakeTime != 0x6553f100 || exiting.Pool != nil {
		t.Fatalf("unexpected exiting staker: %+v", exiting)
	}
	if _, err := decodeStakerInfoV1([]string{"0xaa", "0xbb", "0x1", "0x64", "0x5", "0x0", "0xcc"}, "0x57"); err == nil {
		t.Fatal("expected truncated pool info to fail")
	}
}

func TestDecodeStakerPoolInfoReadsEveryPool(t *testing.T) {
	pools, err := decodeStakerPoolInfo([]string{
		"0x0", "0x3e8", "0x2",
		"0xa1", "0x57", "0x10",
		"0xb1", "0x42", "0x20",
	})
	if err != nil {
		t.Fatal(err)
	}
	if *pools.Commission != 1000 || len(pools.Pools) != 2 || pools.Pools[1].Token != "0x42" ||
		pools.Pools[1].Amount.Int64() != 32 {
		t.Fatalf("unexpected pools: %+v", pools)
	}
	withoutCommission, err := decodeStakerPoolInfo([]string{"0x1", "0x0"})
	if err != nil || withoutCommission.Commission != nil || len(withoutCommission.Pools) != 0 {
		t.Fatalf("unexpected empty pool info: %+v, %v", withoutCommission, err)
	}
	if _, err := decodeStakerPoolInfo([]string{"0x1", "0x2", "0xa1"}); err == nil {
		t.Fatal("expected a short pool list to fail")
	}
}

func TestEpochBoundsSpanConfigurationChanges(t *testing.T) {
	info := epochInfo{
		DurationSeconds: 3600, Length: 2118, StartingBlock: 15_598_524, StartingEpoch: 13_260,
		PreviousLength: 2130, PreviousDurationSeconds: 1800,
	}
	start, length, duration := info.bounds(13_267)
	if start != 15_598_524+7*2118 || length != 2118 || duration != 3600 {
		t.Fatalf("unexpected current bounds %d %d %d", start, length, duration)
	}
	start, length, duration = info.bounds(13_259)
	if start != 15_598_524-2130 || length != 2130 || duration != 1800 {
		t.Fatalf("unexpected previous bounds %d %d %d", start, length, duration)
	}
}

func TestNormalizeAmountRescalesToEighteenDecimals(t *testing.T) {
	if got := normalizeAmount(big.NewInt(2_891_634), 8); got.String() != "28916340000000000" {
		t.Fatalf("unexpected 8-decimal normalization %s", got)
	}
	if got := normalizeAmount(big.NewInt(5_000_000), 24); got.String() != "5" {
		t.Fatalf("unexpected 24-decimal normalization %s", got)
	}
}

func TestInterpolateBlockTimeBracketsAndExtrapolates(t *testing.T) {
	points := []blockTime{{Block: 100, Timestamp: 1_000}, {Block: 200, Timestamp: 2_000}, {Block: 400, Timestamp: 2_400}}
	if got := interpolateBlockTime(points, 150); got != 1_500 {
		t.Fatalf("expected 1500, got %d", got)
	}
	if got := interpolateBlockTime(points, 300); got != 2_200 {
		t.Fatalf("expected 2200, got %d", got)
	}
	if got := interpolateBlockTime(points, 500); got != 2_600 {
		t.Fatalf("expected extrapolated 2600, got %d", got)
	}
	if got := interpolateBlockTime(points, 50); got != 500 {
		t.Fatalf("expected extrapolated 500, got %d", got)
	}
}

func TestPendingBookFoldsIntentsInChainOrder(t *testing.T) {
	book := newPendingBook()
	amount := func(value int64) *big.Int { return big.NewInt(value) }
	book.apply(exitIntentRow{Position: position{Block: 10}, Pool: "0xa", Identifier: "0x1", Token: "0x57", Staker: "0xs", Amount: amount(100), ResetsClock: true})
	book.apply(exitIntentRow{Position: position{Block: 12}, Pool: "0xa", Identifier: "0x1", Token: "0x57", Amount: amount(60)})
	book.apply(exitIntentRow{Position: position{Block: 20}, Pool: "0xb", Identifier: "0x2", Token: "0x42", Staker: "0xt", Amount: amount(3), ResetsClock: true})
	// A replayed row at or before the watermark is ignored.
	book.apply(exitIntentRow{Position: position{Block: 12}, Pool: "0xa", Identifier: "0x1", Token: "0x57", Amount: amount(999)})

	intents := book.intents
	if len(intents) != 2 || intents["0xa|0x1"].Amount.Int64() != 60 || intents["0xa|0x1"].IntentBlock != 10 ||
		intents["0xa|0x1"].Staker != "0xs" {
		t.Fatalf("unexpected folded intents: %+v", intents["0xa|0x1"])
	}
	strk, btc := book.totals("0x57", func(token string) (uint8, bool) { return 8, token == "0x42" })
	if strk.Int64() != 60 || btc.String() != "30000000000" {
		t.Fatalf("unexpected totals %s %s", strk, btc)
	}
	book.apply(exitIntentRow{Position: position{Block: 30}, Pool: "0xa", Identifier: "0x1", Token: "0x57", Amount: amount(0)})
	if len(book.intents) != 1 {
		t.Fatal("expected a withdrawal to clear the intent")
	}
}

func TestMidnightAfterSampleSkipsTheSampledDay(t *testing.T) {
	const midnight = 1_790_640_000
	if got := midnightAfterSample(midnight - 120); got != midnight+daySeconds {
		t.Fatalf("expected the following midnight, got %d", got)
	}
	if got := midnightAfterSample(midnight); got != midnight+daySeconds {
		t.Fatalf("expected the following midnight, got %d", got)
	}
}

func hexOf(value string) string {
	return new(big.Int).SetBytes([]byte(value)).Text(16)
}
