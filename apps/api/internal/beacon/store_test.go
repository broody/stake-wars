package beacon

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

func TestStoreKeepsControllerAndBillboardContinuous(t *testing.T) {
	store, db := openStore(t)
	ctx := context.Background()
	if _, err := store.Controller(ctx, "SN_SEPOLIA"); !errors.Is(err, ErrNoController) {
		t.Fatalf("expected ErrNoController, got %v", err)
	}
	if _, err := store.CurrentBillboard(ctx, "SN_SEPOLIA"); !errors.Is(err, ErrNoBillboard) {
		t.Fatalf("expected ErrNoBillboard, got %v", err)
	}

	seedWhisperController(t, db, 5, "0x555")
	seedArtwork(t, db, 5, "0x555", "art-5")
	seedWhisperController(t, db, 6, "0x666")
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", Settlement{
		RoundID: 7, Controller: "0x777", WinningBid: "150", BidCount: 3,
		SettledAt: time.Unix(700, 0).UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	controller, err := store.Controller(ctx, "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if controller.RoundID != 7 || controller.Address != "0x777" ||
		controller.ClaimedAt.Unix() != 700 || controller.ActiveArtworkID != "" {
		t.Fatalf("unexpected controller: %+v", controller)
	}
	// Newer winners inherit the last published signal until they publish.
	billboard, err := store.CurrentBillboard(ctx, "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if billboard.ImageURL != "https://assets.test/art-5.webp" {
		t.Fatalf("unexpected billboard: %+v", billboard)
	}
	if _, err := store.Controller(ctx, "SN_MAIN"); !errors.Is(err, ErrNoController) {
		t.Fatalf("expected network isolation, got %v", err)
	}
}

func TestSaveSettlementIsIdempotentAndImmutable(t *testing.T) {
	store, db := openStore(t)
	ctx := context.Background()
	settlement := Settlement{
		RoundID: 7, Controller: "0x777", WinningBid: "150", BidCount: 3,
		SettledAt: time.Unix(700, 0).UTC(),
	}
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", settlement); err != nil {
		t.Fatal(err)
	}
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", settlement); err != nil {
		t.Fatalf("replay should be a no-op: %v", err)
	}
	changed := settlement
	changed.Controller = "0x888"
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", changed); err == nil {
		t.Fatal("accepted a conflicting settlement")
	}
	seedWhisperController(t, db, 6, "0x666")
	legacy := settlement
	legacy.RoundID = 6
	legacy.Controller = "0x666"
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", legacy); err == nil {
		t.Fatal("overwrote a Whisper-era round")
	}

	legacyRound, openRound, err := store.ProjectionCursor(ctx, "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if legacyRound != 6 || openRound != 7 {
		t.Fatalf("unexpected cursor %d/%d", legacyRound, openRound)
	}
}

func TestHistoryListsWhisperAndOpenRoundsNewestFirst(t *testing.T) {
	store, db := openStore(t)
	ctx := context.Background()
	seedWhisperController(t, db, 4, "0x444")
	seedWhisperController(t, db, 6, "0x666")
	if err := store.SaveSettlement(ctx, "SN_SEPOLIA", Settlement{
		RoundID: 7, Controller: "0x777", WinningBid: "150", BidCount: 3,
		SettledAt: time.Unix(700, 0).UTC(),
	}); err != nil {
		t.Fatal(err)
	}

	entries, err := store.History(ctx, "SN_SEPOLIA", 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].RoundID != 7 || entries[0].WinnerAddress != "0x777" ||
		entries[0].BidCount != 3 || entries[0].WinningBid != "150" || entries[1].RoundID != 6 {
		t.Fatalf("unexpected first page: %+v", entries)
	}
	before := uint64(6)
	entries, err = store.History(ctx, "SN_SEPOLIA", 2, &before)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].RoundID != 4 {
		t.Fatalf("unexpected second page: %+v", entries)
	}
}

func openStore(t *testing.T) (*Store, *sql.DB) {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "beacon.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return NewStore(db), db
}

func seedWhisperController(t *testing.T, db *sql.DB, roundID uint64, controller string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO beacon_controllers(
			network, round_id, source, controller, winning_bid, bid_count, settled_at
		) VALUES ('SN_SEPOLIA', ?, 'whisper', ?, '100', 2, ?)
	`, roundID, controller, roundID*100); err != nil {
		t.Fatal(err)
	}
}

func seedArtwork(t *testing.T, db *sql.DB, roundID uint64, owner, id string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO beacon_artworks(
			id, network, controller_round_id, owner_address, image_url, object_key,
			thumbnail_url, thumbnail_object_key, content_hash, moderation_status,
			created_at, updated_at
		) VALUES (?, 'SN_SEPOLIA', ?, ?, ?, ?, ?, ?, 'hash', 'approved', 1, 1)
	`, id, roundID, owner, "https://assets.test/"+id+".webp", id+"/detail",
		"https://assets.test/"+id+"-thumb.webp", id+"/thumbnail"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`
		UPDATE beacon_controllers SET active_artwork_id = ?
		WHERE network = 'SN_SEPOLIA' AND round_id = ?
	`, id, roundID); err != nil {
		t.Fatal(err)
	}
}
