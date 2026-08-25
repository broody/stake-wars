package arbiter

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

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

	_, err = store.Current(context.Background(), "SN_INTEGRATION")
	if !errors.Is(err, ErrNoRound) {
		t.Fatalf("expected ErrNoRound, got %v", err)
	}
}
