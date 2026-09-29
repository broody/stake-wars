package stakingstats

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

// TestServiceIndexesLiveNetwork runs the full index against a live RPC. Set
// STAKEWARS_STAKING_DATABASE to resume a backfill across runs, and
// STAKEWARS_STAKING_DUMP_DIR to write each pass's API responses.
func TestServiceIndexesLiveNetwork(t *testing.T) {
	rpcURL := os.Getenv("STAKEWARS_STAKING_RPC_URL")
	pool := os.Getenv("STAKEWARS_STAKING_POOL")
	network := os.Getenv("STAKEWARS_STAKING_NETWORK")
	if rpcURL == "" || pool == "" || network == "" {
		t.Skip("set STAKEWARS_STAKING_RPC_URL, STAKEWARS_STAKING_POOL, and STAKEWARS_STAKING_NETWORK to run")
	}
	path := os.Getenv("STAKEWARS_STAKING_DATABASE")
	if path == "" {
		path = filepath.Join(t.TempDir(), "staking.db")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 55*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	service, err := NewService(starknet.NewChainClient(rpcURL), NewStore(db, network), Config{
		Network: network, FeaturedPool: pool,
	})
	if err != nil {
		t.Fatal(err)
	}
	for pass := 1; ; pass++ {
		started := time.Now()
		err := service.Reconcile(ctx)
		snapshot, snapshotErr := service.Current(ctx)
		if snapshotErr != nil {
			t.Fatalf("pass %d: %v (reconcile: %v)", pass, snapshotErr, err)
		}
		index := snapshot.Index
		t.Logf("pass %d in %s: head=%d staking=%d/%t members=%d/%t history=%v/%t validators=%d err=%v",
			pass, time.Since(started).Round(time.Second), index.HeadBlock, index.StakingBlock,
			index.StakingSynced, index.MembersBlock, index.MembersSynced, index.HistoryThrough,
			index.HistorySynced, len(snapshot.Validators), err)
		if err != nil {
			// The worker retries on its next tick; a live run does the same.
			t.Logf("pass %d reconcile error: %v", pass, err)
		}
		if directory := os.Getenv("STAKEWARS_STAKING_DUMP_DIR"); directory != "" {
			history, _ := service.History(ctx)
			writeJSON(t, filepath.Join(directory, "staking.json"), snapshot)
			writeJSON(t, filepath.Join(directory, "history.json"), history)
		}
		if index.StakingSynced && index.MembersSynced && index.HistorySynced {
			break
		}
		if ctx.Err() != nil {
			t.Fatal("index did not finish before the test deadline")
		}
	}
	snapshot, _ := service.Current(ctx)
	history, err := service.History(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("totals=%+v apr=%v/%v epoch=%+v prices=%+v", snapshot.Totals,
		deref(snapshot.APR.MaxStrkPercent), deref(snapshot.APR.MaxBtcPercent), snapshot.Epoch, snapshot.Prices)
	t.Logf("featured=%+v", snapshot.Featured)
	t.Logf("unstaking pending=%d withdrawable=%s schedule=%+v exiting=%d largest=%d",
		snapshot.Unstaking.PendingExits, snapshot.Unstaking.WithdrawableStrk, snapshot.Unstaking.Schedule,
		len(snapshot.Unstaking.ExitingValidators), len(snapshot.Unstaking.Largest))
	t.Logf("history points=%d first=%+v last=%+v", len(history.Points), history.Points[0], history.Points[len(history.Points)-1])
	if snapshot.Featured == nil {
		t.Fatal("featured validator missing from snapshot")
	}
}

func writeJSON(t *testing.T, path string, value any) {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".tmp", encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(path+".tmp", path); err != nil {
		t.Fatal(err)
	}
}

func deref(value *float64) float64 {
	if value == nil {
		return -1
	}
	return *value
}
