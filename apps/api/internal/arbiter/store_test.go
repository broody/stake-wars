package arbiter

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

func TestStoreReturnsLatestRoundForNetwork(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for _, values := range []struct {
		network string
		roundID int
	}{
		{network: "SN_SEPOLIA", roundID: 1},
		{network: "SN_MAIN", roundID: 9},
		{network: "SN_SEPOLIA", roundID: 2},
	} {
		_, err := db.Exec(`
			INSERT INTO arbiter_rounds(
				network, round_id, whisper_address, auction_id, expected_creator,
				payment_token, metadata_hash, winner_payload_domain, vault_address
			) VALUES (?, ?, ?, ?, '0x2', '0x3', '0x4', '0x5', '0x6')
		`, values.network, values.roundID, "0x1", values.roundID)
		if err != nil {
			t.Fatal(err)
		}
	}

	store := NewStore(db)
	round, err := store.Current(context.Background(), "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if round.RoundID != 2 || round.AuctionID != 2 || round.Network != "SN_SEPOLIA" {
		t.Fatalf("unexpected current round: %+v", round)
	}
	if _, err := db.Exec(`
		UPDATE arbiter_rounds
		SET claimed_controller = '0x777', claimed_at = 200, billboard_starts_at = 201
		WHERE network = 'SN_SEPOLIA' AND round_id = 1
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`
		UPDATE arbiter_rounds
		SET claimed_controller = '0x888', claimed_at = 100, billboard_starts_at = 101
		WHERE network = 'SN_SEPOLIA' AND round_id = 2
	`); err != nil {
		t.Fatal(err)
	}
	controller, err := store.Controller(context.Background(), "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if controller.RoundID != 2 || controller.Address != "0x888" ||
		controller.ClaimedAt.Unix() != 100 ||
		controller.StartsAt == nil || controller.StartsAt.Unix() != 101 {
		t.Fatalf("unexpected current controller: %+v", controller)
	}

	_, err = store.Current(context.Background(), "SN_INTEGRATION")
	if !errors.Is(err, ErrNoRound) {
		t.Fatalf("expected ErrNoRound, got %v", err)
	}
	_, err = store.Controller(context.Background(), "SN_INTEGRATION")
	if !errors.Is(err, ErrNoController) {
		t.Fatalf("expected ErrNoController, got %v", err)
	}
}

func TestStoreProjectsImmutableWinnerHistory(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for roundID := 1; roundID <= 2; roundID++ {
		if _, err := db.Exec(`
			INSERT INTO arbiter_rounds(
				network, round_id, whisper_address, auction_id, expected_creator,
				payment_token, metadata_hash, winner_payload_domain, vault_address
			) VALUES ('SN_SEPOLIA', ?, '0x1', ?, '0x2', '0x3', '0x4', '0x5', '0x6')
		`, roundID, roundID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`
		UPDATE arbiter_rounds
		SET claimed_controller = '0x0777', claimed_at = 100
		WHERE network = 'SN_SEPOLIA' AND round_id = 1
	`); err != nil {
		t.Fatal(err)
	}

	store := NewStore(db)
	projection := SettlementProjection{
		RoundID: 1, WhisperAddress: "0x1", AuctionID: 1, HasWinner: true,
		WinnerGroupHandle: "0x7", WinnerCommitment: "0x8",
		WinningBid: "100", SecondHighestBid: "80", ClearingPrice: "80",
		FundedBidCount: 2, SettlementHash: "0x9",
		SettlementTransactionHash: "0xa", SettledAt: time.Unix(125, 0).UTC(),
	}
	if err := store.SaveSettlement(context.Background(), "SN_SEPOLIA", projection); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSettlement(context.Background(), "SN_SEPOLIA", projection); err != nil {
		t.Fatalf("idempotent projection failed: %v", err)
	}
	conflict := projection
	conflict.WinningBid = "101"
	if err := store.SaveSettlement(context.Background(), "SN_SEPOLIA", conflict); err == nil {
		t.Fatal("expected conflicting settlement to fail")
	}

	entries, err := store.History(context.Background(), "SN_SEPOLIA", 10, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].RoundID != 1 ||
		entries[0].WinnerAddress == nil || *entries[0].WinnerAddress != "0x0777" ||
		entries[0].BidCount != 2 || entries[0].WinningBid != "100" {
		t.Fatalf("unexpected history: %+v", entries)
	}

	rounds, err := store.UnprojectedRounds(context.Background(), "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if len(rounds) != 1 || rounds[0].RoundID != 2 {
		t.Fatalf("unexpected unprojected rounds: %+v", rounds)
	}
}
