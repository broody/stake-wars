package database

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func TestOpenConfiguresAndMigratesSQLite(t *testing.T) {
	db, err := Open(context.Background(), filepath.Join(t.TempDir(), "stakewars.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	assertPragma(t, db, "journal_mode", "wal")
	assertPragma(t, db, "foreign_keys", "1")
	assertPragma(t, db, "busy_timeout", "5000")

	var migrations int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrations); err != nil {
		t.Fatal(err)
	}
	if migrations != 12 {
		t.Fatalf("expected twelve migrations, got %d", migrations)
	}

	if _, err := db.Exec(`
		INSERT INTO image_reports(id, artwork_id, reason, created_at)
		VALUES ('report', 'missing', 'test', 1)
	`); err == nil {
		t.Fatal("expected foreign key constraint")
	}
	if _, err := db.Exec(`
		INSERT INTO beacon_artworks(
			id, network, controller_round_id, owner_address, image_url, object_key,
			thumbnail_url, thumbnail_object_key, content_hash, moderation_status,
			created_at, updated_at
		) VALUES ('art', 'SN_SEPOLIA', 7, '0x7', 'i', 'o', 't', 'to', 'h', 'approved', 1, 1)
	`); err == nil {
		t.Fatal("expected Beacon artwork to require a controller round")
	}
	if _, err := db.Exec(`
		INSERT INTO beacon_controllers(
			network, round_id, source, controller, winning_bid, bid_count, settled_at
		) VALUES ('SN_SEPOLIA', 7, 'open', '0x7', '100', 1, 100)
	`); err != nil {
		t.Fatalf("insert Beacon controller: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO beacon_controllers(
			network, round_id, source, controller, winning_bid, bid_count, settled_at
		) VALUES ('SN_SEPOLIA', 8, 'sealed', '0x8', '100', 1, 100)
	`); err == nil {
		t.Fatal("expected Beacon controller source constraint")
	}
}

func TestOpenAuctionMigrationPreservesWhisperWinners(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stakewars.db")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	legacy.SetMaxOpenConns(1)
	ctx := context.Background()
	if err := configure(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`
		CREATE TABLE schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at INTEGER NOT NULL DEFAULT (unixepoch())
		)
	`); err != nil {
		t.Fatal(err)
	}
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.Name() >= "012" {
			continue
		}
		if err := applyMigration(ctx, legacy, entry.Name()); err != nil {
			t.Fatal(err)
		}
	}
	// Mirrors Mainnet: resolved winners in rounds 5 and 6, artwork for round 5,
	// an unexpired upload for round 6, and a pending round 7 with no bids.
	if _, err := legacy.Exec(`
		INSERT INTO beacon_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address,
			claimed_controller, claimed_at, billboard_starts_at, active_artwork_id
		) VALUES
			('SN_MAIN', 5, '0x1', 5, '0x2', '0x3', '0x4', '0x5', '0x6', '0x55', 500, 500, 'art-5'),
			('SN_MAIN', 6, '0x1', 6, '0x2', '0x3', '0x4', '0x5', '0x6', '0x66', 600, 600, NULL),
			('SN_MAIN', 7, '0x1', 7, '0x2', '0x3', '0x4', '0x5', '0x6', NULL, NULL, NULL, NULL);
		INSERT INTO beacon_round_outcomes(
			network, round_id, whisper_address, auction_id, terminal_status,
			has_winner, winner_group_handle, winner_commitment, winning_bid,
			second_highest_bid, clearing_price, funded_bid_count,
			settlement_hash, settlement_transaction_hash, settled_at
		) VALUES
			('SN_MAIN', 5, '0x1', 5, 'settled', 1, '0x7', '0x8', '25000', '0', '25000', 5, '0x9', NULL, 499),
			('SN_MAIN', 6, '0x1', 6, 'settled', 1, '0x7', '0x8', '15000', '0', '15000', 2, '0x9', NULL, 599);
		INSERT INTO beacon_cycle_jobs(
			network, predecessor_round_id, predecessor_whisper_address,
			predecessor_auction_id, successor_round_id, expected_metadata_hash, state
		) VALUES ('SN_MAIN', 6, '0x1', 6, 7, '0xb', 'registered');
		INSERT INTO beacon_artworks(
			id, network, controller_round_id, owner_address, image_url, object_key,
			thumbnail_url, thumbnail_object_key, content_hash, moderation_status,
			created_at, updated_at, description, destination_url
		) VALUES (
			'art-5', 'SN_MAIN', 5, '0x55', 'https://assets/5.webp', 'beacon/5/detail',
			'https://assets/5-thumb.webp', 'beacon/5/thumbnail', 'hash', 'approved',
			450, 450, 'hello', 'https://example.com'
		);
		INSERT INTO beacon_image_uploads(
			id, network, controller_round_id, owner_address, content_type,
			detail_object_key, detail_size, thumbnail_object_key, thumbnail_size,
			created_at, expires_at
		) VALUES ('upload-6', 'SN_MAIN', 6, '0x66', 'image/webp', 'beacon/6/detail', 10, 'beacon/6/thumbnail', 5, 610, 910);
	`); err != nil {
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}

	db, err := Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, table := range []string{"beacon_rounds", "beacon_round_outcomes", "beacon_cycle_jobs"} {
		if tableExists(t, db, table) {
			t.Fatalf("expected %s to be removed", table)
		}
	}
	rows, err := db.Query(`
		SELECT round_id, source, controller, winning_bid, bid_count, settled_at,
			COALESCE(active_artwork_id, '')
		FROM beacon_controllers WHERE network = 'SN_MAIN' ORDER BY round_id
	`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type controller struct {
		round                int
		source, address, bid string
		bids                 int
		settledAt            int64
		artwork              string
	}
	var controllers []controller
	for rows.Next() {
		var row controller
		if err := rows.Scan(&row.round, &row.source, &row.address, &row.bid, &row.bids,
			&row.settledAt, &row.artwork); err != nil {
			t.Fatal(err)
		}
		controllers = append(controllers, row)
	}
	want := []controller{
		{5, "whisper", "0x55", "25000", 5, 499, "art-5"},
		{6, "whisper", "0x66", "15000", 2, 599, ""},
	}
	if len(controllers) != len(want) || controllers[0] != want[0] || controllers[1] != want[1] {
		t.Fatalf("unexpected migrated controllers: %+v", controllers)
	}
	var artworks, uploads int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM beacon_artworks
		WHERE id = 'art-5' AND controller_round_id = 5 AND description = 'hello'
			AND destination_url = 'https://example.com'
	`).Scan(&artworks); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM beacon_image_uploads WHERE id = 'upload-6' AND controller_round_id = 6
	`).Scan(&uploads); err != nil {
		t.Fatal(err)
	}
	if artworks != 1 || uploads != 1 {
		t.Fatalf("expected artwork and upload to survive, got %d and %d", artworks, uploads)
	}
	var violations int
	if err := db.QueryRow("SELECT COUNT(*) FROM pragma_foreign_key_check").Scan(&violations); err != nil {
		t.Fatal(err)
	}
	if violations != 0 {
		t.Fatalf("expected no foreign key violations, got %d", violations)
	}
}

func TestOpenDropsLegacyArbiterTables(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stakewars.db")
	legacy, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacy.Exec(`
		CREATE TABLE schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at INTEGER NOT NULL DEFAULT (unixepoch())
		);
		CREATE TABLE arbiter_rounds (id INTEGER);
		CREATE TABLE arbiter_round_outcomes (id INTEGER);
		CREATE TABLE arbiter_cycle_jobs (id INTEGER);
		CREATE TABLE arbiter_image_uploads (id INTEGER);
		CREATE TABLE arbiter_artworks (id INTEGER);
		INSERT INTO schema_migrations(version) VALUES
			('003_arbiter_rounds.sql'),
			('004_arbiter_history.sql'),
			('005_arbiter_artwork.sql'),
			('006_optional_arbiter_settlement_transaction.sql'),
			('007_arbiter_round_schedule.sql'),
			('008_arbiter_advertisements.sql');
	`); err != nil {
		_ = legacy.Close()
		t.Fatal(err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatal(err)
	}

	db, err := Open(context.Background(), path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	for _, table := range []string{
		"arbiter_artworks",
		"arbiter_image_uploads",
		"arbiter_cycle_jobs",
		"arbiter_round_outcomes",
		"arbiter_rounds",
	} {
		if tableExists(t, db, table) {
			t.Fatalf("expected legacy table %s to be removed", table)
		}
	}
	if !tableExists(t, db, "beacon_controllers") {
		t.Fatal("expected Beacon tables to be created")
	}

	var legacyMigrations int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM schema_migrations WHERE version LIKE '%_arbiter_%'
	`).Scan(&legacyMigrations); err != nil {
		t.Fatal(err)
	}
	if legacyMigrations != 0 {
		t.Fatalf("expected legacy migration entries to be removed, got %d", legacyMigrations)
	}
}

func tableExists(t *testing.T, db *sql.DB, table string) bool {
	t.Helper()
	var count int
	if err := db.QueryRow(
		"SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?",
		table,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count > 0
}

func assertPragma(t *testing.T, db interface {
	QueryRow(query string, args ...any) *sql.Row
}, name, want string) {
	t.Helper()
	var got string
	if err := db.QueryRow("PRAGMA " + name).Scan(&got); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("expected PRAGMA %s=%s, got %s", name, want, got)
	}
}
