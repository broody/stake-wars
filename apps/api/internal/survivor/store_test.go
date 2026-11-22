package survivor

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

func TestRoundRanksBestDestroyedAndFreezesWinner(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "scores.db")
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := NewStore(db, "SN_SEPOLIA")
	now := time.Unix(1000, 0)
	s.Now = func() time.Time { return now }
	// Distinct scores stand in for results from verified runs.
	verified := RunResult{DurationSeconds: 70, Upgrades: []Upgrade{{Kind: "system", Name: "Aegis", Level: 1}, {Kind: "system", Name: "Aegis", Level: 2}}}
	s.Verify = func(context.Context, uint32, []byte, int64) (RunResult, error) { return verified, nil }
	board, err := s.Board(ctx, 0)
	if err != nil || board.Round != nil || len(board.Entries) != 0 {
		t.Fatalf("empty board %+v, %v", board, err)
	}
	end := now.Add(time.Hour)
	id, err := s.Open(ctx, end)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Open(ctx, end.Add(time.Hour)); !errors.Is(err, ErrOverlap) {
		t.Fatal(err)
	}
	start := func() Ticket {
		t.Helper()
		ticket, err := s.Start(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return ticket
	}
	// Any signed wallet can lead the prize round. 0x3 uses Braavos.
	kinds := func(_ context.Context, wallet string) (string, error) {
		if wallet == "0x3" {
			return "braavos", nil
		}
		return "outis", nil
	}
	finish := func(ticket Ticket, wallet string, score int) {
		t.Helper()
		verified.Destroyed = score
		n, err := s.Finish(ctx, ticket.Token, wallet, nil, kinds)
		if err != nil || n.Destroyed != score {
			t.Fatalf("finish %d: %d %v", score, n.Destroyed, err)
		}
	}
	// An earlier start does not break a tie. The first recorded best does.
	long := start()
	now = now.Add(time.Minute)
	first := start()
	finish(first, "0x2", 51)
	duration := verified.DurationSeconds
	wantTie := Entry{Run: 1, WalletKind: "outis", Wallet: "0x2", Destroyed: 51, DurationSeconds: &duration, Upgrades: verified.Upgrades}
	verified.DurationSeconds = 180
	verified.Upgrades = []Upgrade{{Kind: "weapon", Name: "Bolt Caster", Level: 1}}
	// The two tied scores even share a clock timestamp.
	finish(long, "0x1", 51)
	late := start()
	finish(late, "0x3", 25)
	late = start()
	verified.DurationSeconds = 7
	verified.Upgrades = []Upgrade{}
	finish(late, "0x3", 150)
	verified.Destroyed = 999
	if n, err := s.Finish(ctx, late.Token, "0x3", nil, kinds); err != nil || n.Destroyed != 150 {
		t.Fatalf("retry: %d %v", n.Destroyed, err)
	}
	finish(start(), "0x2", 51)
	if _, err := s.Finish(ctx, first.Token, "0x4", nil, kinds); !errors.Is(err, ErrTicket) {
		t.Fatal("claimed a spent ticket for another wallet", err)
	}
	bad := first.Token[:126] + "ff"
	if bad == first.Token {
		bad = first.Token[:126] + "00"
	}
	if _, err := s.Finish(ctx, bad, "0x4", nil, kinds); !errors.Is(err, ErrTicket) {
		t.Fatal("tampered ticket", err)
	}
	finish(start(), "0x2", 0)
	board, err = s.Board(ctx, id)
	if err != nil || len(board.Entries) != 3 || !reflect.DeepEqual(board.Entries[1], wantTie) || board.Round.Winner != nil {
		t.Fatalf("live board %+v, %v", board, err)
	}
	if board.Round.PrizeAmount == nil || *board.Round.PrizeAmount != "100000000000000000000" {
		t.Fatalf("expected a 100 STRK daily round, got %+v", board.Round)
	}
	if last := board.Entries[0]; last.WalletKind != "braavos" || last.Destroyed != 150 || last.DurationSeconds == nil || *last.DurationSeconds != 7 || last.Upgrades == nil || len(last.Upgrades) != 0 {
		t.Fatalf("new best did not replace earlier run details: %+v", last)
	}
	wantWinner := board.Entries[0]
	unfinished := start()
	now = end
	if _, err = s.Finish(ctx, unfinished.Token, "0x3", nil, kinds); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Start(ctx, id); !errors.Is(err, ErrClosed) {
		t.Fatal(err)
	}
	// The deadline opened the next daily round even though this one has a winner.
	board, err = s.Board(ctx, 0)
	if err != nil || board.Round == nil || board.Round.ID != id+1 || board.Round.Closed || board.Round.PreviousID == nil || *board.Round.PreviousID != id {
		t.Fatalf("next round %+v, %v", board.Round, err)
	}
	next, nextDeadline := board.Round.ID, board.Round.Deadline
	if nextDeadline.Sub(end) < 24*time.Hour {
		t.Fatalf("next deadline %s is less than a day after %s", nextDeadline, end)
	}
	if _, err := s.Open(ctx, nextDeadline.Add(time.Hour)); !errors.Is(err, ErrOverlap) {
		t.Fatal(err)
	}
	// A fresh process can retrieve the exact payout record for either round.
	reopened, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	reader := NewStore(reopened, s.Network)
	reader.Now = s.Now
	board, err = reader.Board(ctx, id)
	if err != nil || !board.Round.Closed || board.Round.Winner == nil || !reflect.DeepEqual(*board.Round.Winner, wantWinner) {
		t.Fatalf("closed board %+v, %v", board, err)
	}
	reader.Now = func() time.Time { return nextDeadline }
	board, err = reader.Board(ctx, next)
	if err != nil || board.Round.ID != next || !board.Round.Closed || board.Round.Winner != nil || len(board.Entries) != 0 {
		t.Fatalf("closed empty round %+v, %v", board, err)
	}
	other := NewStore(db, "SN_MAIN")
	if b, err := other.Board(ctx, 0); err != nil || b.Round != nil {
		t.Fatalf("network isolation: %+v %v", b, err)
	}
}

func TestRejectsPrematureReplayBeforeSimulation(t *testing.T) {
	if _, err := verifyReplay(context.Background(), 1, make([]byte, 1000), 0); !errors.Is(err, ErrReplay) {
		t.Fatal(err)
	}
}

func TestBoardReadsOlderScoresWithoutDetails(t *testing.T) {
	ctx := t.Context()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "legacy.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO survivor_rounds (id,network,deadline,leader_wallet,leading_destroyed) VALUES (1,'SN_MAIN',1,'0x5',25);
      INSERT INTO survivor_runs (round_id,network,player,destroyed) VALUES (1,'SN_MAIN','0x5',25)`)
	if err != nil {
		t.Fatal(err)
	}
	board, err := NewStore(db, "SN_MAIN").Board(ctx, 1)
	if err != nil {
		t.Fatal(err)
	}
	expected := Entry{Run: 1, Wallet: "0x5", Destroyed: 25}
	if len(board.Entries) != 1 || !reflect.DeepEqual(board.Entries[0], expected) || !reflect.DeepEqual(board.Round.Winner, &expected) {
		t.Fatalf("expected original score with unrecorded details: %+v", board)
	}
}

func TestGuestAndWalletShareStandings(t *testing.T) {
	ctx := t.Context()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "players.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := NewStore(db, "SN_MAIN")
	now := time.Unix(1000, 0)
	s.Now = func() time.Time { return now }
	result := RunResult{Destroyed: 17, DurationSeconds: 9, Upgrades: []Upgrade{}}
	s.Verify = func(context.Context, uint32, []byte, int64) (RunResult, error) { return result, nil }
	player, err := GuestPlayer("a77b8820-5f75-4d5b-8558-538d404a9511")
	if err != nil {
		t.Fatal(err)
	}
	other, _ := GuestPlayer("a77b8820-5f75-4d5b-8558-538d404a9512")
	finish := func() Ticket {
		t.Helper()
		ticket, err := s.Start(ctx, 0)
		if err != nil {
			t.Fatal(err)
		}
		_, err = s.Finish(ctx, ticket.Token, player, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		return ticket
	}
	noRound := finish()
	mainBoard, err := s.Board(ctx, 0)
	if err != nil || mainBoard.Round != nil || len(mainBoard.Entries) != 1 || mainBoard.Entries[0].Guest != player || mainBoard.Entries[0].Wallet != "" || mainBoard.Entries[0].Name != "" {
		t.Fatal(mainBoard, err)
	}
	otherNetwork := NewStore(db, "SN_SEPOLIA")
	if _, err := otherNetwork.Finish(ctx, noRound.Token, player, nil, nil); !errors.Is(err, ErrTicket) {
		t.Fatal("wrong network", err)
	}
	deadline := now.Add(time.Hour)
	id, err := s.Open(ctx, deadline)
	if err != nil {
		t.Fatal(err)
	}
	nickname := "Orbit"
	if _, err = s.SetGuestName(ctx, player, nickname); err != nil {
		t.Fatal(err)
	}
	result.Destroyed = 50
	linked := finish()
	result.Destroyed = 90
	bestGuest := finish()
	check := func(_ context.Context, wallet string) (string, error) {
		if wallet == "0x1" {
			return "outis", nil
		}
		return "argentX", nil
	}
	if err = s.Attach(ctx, linked.Token, other, "0x1", check); !errors.Is(err, ErrTicket) {
		t.Fatal(err)
	}
	for range 2 {
		if err = s.Attach(ctx, linked.Token, player, "0x1", check); err != nil {
			t.Fatal(err)
		}
	}
	if err = s.Attach(ctx, linked.Token, player, "0x2", check); !errors.Is(err, ErrTicket) {
		t.Fatal(err)
	}
	result.Destroyed = 80
	ready := finish()
	if err = s.Attach(ctx, ready.Token, player, "0x2", check); err != nil {
		t.Fatal(err)
	}
	if err = s.SetWalletName(ctx, "0x1", nickname, 1); err != nil {
		t.Fatal(err)
	}
	now = deadline
	if err = s.Attach(ctx, bestGuest.Token, player, "0x1", check); !errors.Is(err, ErrClosed) {
		t.Fatal(err)
	}
	board, err := s.Board(ctx, id)
	if err != nil || len(board.Entries) != 3 || board.Entries[0].Name != "Orbit" || board.Entries[0].WalletKind != "" || board.Entries[0].Guest != player || board.Entries[1].WalletKind != "argentX" || board.Round.Winner.Wallet != "0x2" || board.Round.Winner.WalletKind != "argentX" || board.Round.Winner.Destroyed != 80 {
		t.Fatal(board, err)
	}
	var count int
	if err = db.QueryRow("SELECT count(*) FROM survivor_runs").Scan(&count); err != nil || count != 4 {
		t.Fatal(count, err)
	}
	result.Destroyed = 150
	finish()
	all, err := s.AllTime(ctx)
	if err != nil || len(all.Entries) != 3 || all.Entries[0].Destroyed != 150 {
		t.Fatal(all, err)
	}
}
