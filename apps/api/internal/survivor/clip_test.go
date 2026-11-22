package survivor

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

func TestDeathClipsAreStoredServedAndPruned(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "clips.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := NewStore(db, "SN_SEPOLIA")
	now := time.Unix(1000, 0)
	s.Now = func() time.Time { return now }
	var verified RunResult
	s.Verify = func(context.Context, uint32, []byte, int64) (RunResult, error) { return verified, nil }
	round, err := s.Open(ctx, now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	kind := func(context.Context, string) (string, error) { return "outis", nil }
	play := func(player string, destroyed int, clip []byte) (Ticket, Finished) {
		t.Helper()
		ticket, err := s.Start(ctx, round)
		if err != nil {
			t.Fatal(err)
		}
		verified = RunResult{Destroyed: destroyed, Upgrades: []Upgrade{}, Clip: clip}
		finished, err := s.Finish(ctx, ticket.Token, player, nil, kind)
		if err != nil {
			t.Fatal(err)
		}
		return ticket, finished
	}
	clipped := func(run int64) bool {
		t.Helper()
		_, err := s.Clip(ctx, run)
		if err != nil && !errors.Is(err, ErrNoClip) {
			t.Fatal(err)
		}
		return err == nil
	}

	_, first := play("0x2", 10, []byte("first"))
	if !first.Clip || first.Destroyed != 10 || first.Run == 0 {
		t.Fatalf("first run %+v", first)
	}
	if clip, err := s.Clip(ctx, first.Run); err != nil || !bytes.Equal(clip, []byte("first")) {
		t.Fatalf("stored clip %q %v", clip, err)
	}
	bestTicket, best := play("0x2", 30, []byte("best"))
	_, middle := play("0x2", 20, []byte("middle"))
	_, latest := play("0x2", 5, []byte("latest"))
	// Only the best and the latest run can still be watched.
	if clipped(first.Run) || clipped(middle.Run) || !clipped(best.Run) || !clipped(latest.Run) {
		t.Fatal("expected only the best and latest clips to remain")
	}
	// Another player's runs never prune these.
	play("0x3", 1, []byte("other"))
	if !clipped(best.Run) || !clipped(latest.Run) {
		t.Fatal("another player's run pruned these clips")
	}

	// A retried submission reports the stored run and clip.
	verified.Destroyed = 999
	again, err := s.Finish(ctx, bestTicket.Token, "0x2", nil, kind)
	if err != nil || again != best {
		t.Fatalf("retry %+v %v, want %+v", again, err, best)
	}

	board, err := s.Board(ctx, round)
	if err != nil || len(board.Entries) != 2 {
		t.Fatalf("board %+v %v", board, err)
	}
	if top := board.Entries[0]; top.Run != best.Run || !top.Clip {
		t.Fatalf("board entry %+v should link the best run's clip", top)
	}

	// Runs without a clip, or with an oversized one, are still recorded.
	_, none := play("0x4", 3, nil)
	_, huge := play("0x4", 4, make([]byte, maxClipBytes+1))
	if none.Clip || huge.Clip || clipped(none.Run) || clipped(huge.Run) {
		t.Fatal("stored a missing or oversized clip")
	}
	if _, err := NewStore(db, "SN_MAIN").Clip(ctx, best.Run); !errors.Is(err, ErrNoClip) {
		t.Fatal("served a clip from another network", err)
	}
}
