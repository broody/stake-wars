package survivor

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

func TestNextDailyDeadline(t *testing.T) {
	for _, tc := range []struct{ now, want string }{
		{"2026-11-21T21:59:59.999-05:00", "2026-11-22T03:00:00Z"},
		{"2026-11-21T22:00:00-05:00", "2026-11-23T03:00:00Z"},
		{"2026-07-01T22:15:00-04:00", "2026-07-02T03:00:00Z"},
		{"2026-12-31T23:30:00Z", "2027-01-01T03:00:00Z"},
	} {
		t.Run(tc.now, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339Nano, tc.now)
			if err != nil {
				t.Fatal(err)
			}
			if got := NextDailyDeadline(now).Format(time.RFC3339); got != tc.want {
				t.Fatalf("next cutoff = %s, want %s", got, tc.want)
			}
		})
	}
}

func TestRolloverOnDailyCutoff(t *testing.T) {
	for _, tc := range []struct {
		name   string
		player string
		outis  bool
	}{
		{name: "empty"},
		{name: "guest", player: "guest-test"},
		{name: "other wallet", player: "0xabc"},
		{name: "eligible wallet", player: "0xdef", outis: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := t.Context()
			db, err := database.Open(ctx, filepath.Join(t.TempDir(), "rounds.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			store := NewStore(db, "SN_SEPOLIA")
			cutoff := time.Date(2026, 11, 22, 3, 0, 0, 0, time.UTC)
			now := cutoff.Add(-time.Minute)
			store.Now = func() time.Time { return now }
			id, err := store.Open(ctx, cutoff)
			if err != nil {
				t.Fatal(err)
			}
			if tc.player != "" {
				ticket, err := store.Start(ctx, id)
				if err != nil {
					t.Fatal(err)
				}
				store.Verify = func(context.Context, uint32, []byte, int64) (RunResult, error) {
					return RunResult{Destroyed: 0, Upgrades: []Upgrade{}}, nil
				}
				_, err = store.Finish(ctx, ticket.Token, tc.player, nil, func(context.Context, string) (bool, error) { return tc.outis, nil })
				if err != nil {
					t.Fatal(err)
				}
			}
			now = cutoff
			// The very first run at cutoff must get a ticket for the successor
			// even when the periodic worker has not ticked yet.
			ticket, err := store.Start(ctx, 0)
			if err != nil {
				t.Fatal(err)
			}
			if err = store.Reconcile(ctx); err != nil {
				t.Fatal(err)
			}
			current, err := store.Board(ctx, 0)
			if err != nil {
				t.Fatal(err)
			}
			history, err := store.Board(ctx, id)
			if err != nil {
				t.Fatal(err)
			}
			if !history.Round.Closed || (tc.player != "" && len(history.Entries) != 1) {
				t.Fatal(history)
			}
			// The closed round keeps its winner, and the next round opens either way.
			if tc.outis != (history.Round.Winner != nil) || (tc.outis && history.Round.Winner.Wallet != tc.player) {
				t.Fatal(history.Round)
			}
			next := current.Round
			if next == nil || next.ID != id+1 || next.PreviousID == nil || *next.PreviousID != id || next.Closed || next.Winner != nil || next.PrizeAmount == nil || *next.PrizeAmount != DailyPrize || len(current.Entries) != 0 || !next.Deadline.Equal(cutoff.Add(24*time.Hour)) {
				t.Fatal(current)
			}
			payload, err := hex.DecodeString(ticket.Token)
			if err != nil || int64(binary.BigEndian.Uint64(payload[:8])) != next.ID {
				t.Fatal("first ticket missed new round", err)
			}
			now = cutoff.AddDate(0, 0, 5).Add(time.Hour)
			// Simultaneous checks after several days offline open one current
			// successor, without creating prizes for the missed days.
			group := new(sync.WaitGroup)
			for range 6 {
				group.Go(func() {
					if err := store.Reconcile(ctx); err != nil {
						t.Error(err)
					}
				})
			}
			group.Wait()
			current, err = store.Board(ctx, 0)
			if err != nil || current.Round.ID != next.ID+1 || !current.Round.Deadline.Equal(cutoff.AddDate(0, 0, 6)) || *current.Round.PrizeAmount != DailyPrize {
				t.Fatal(current, err)
			}
		})
	}
}
