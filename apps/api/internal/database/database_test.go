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
	if migrations != 10 {
		t.Fatalf("expected ten migrations, got %d", migrations)
	}

	if _, err := db.Exec(`
		INSERT INTO beacon_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address
		) VALUES ('SN_SEPOLIA', 1, '0x1', 7, '0x2', '0x3', '0x4', '0x5', '0x6')
	`); err != nil {
		t.Fatalf("insert Beacon round: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO image_reports(id, artwork_id, reason, created_at)
		VALUES ('report', 'missing', 'test', 1)
	`); err == nil {
		t.Fatal("expected foreign key constraint")
	}

	if _, err := db.Exec(`
		INSERT INTO beacon_round_outcomes(
			network, round_id, whisper_address, auction_id, terminal_status,
			has_winner, winner_group_handle, winner_commitment, winning_bid,
			second_highest_bid, clearing_price, funded_bid_count,
			settlement_hash, settlement_transaction_hash, settled_at
		) VALUES (
			'SN_SEPOLIA', 1, '0x1', 7, 'settled', 1, '0x7', '0x8',
			'100', '80', '80', 2, '0x9', '0xa', 100
		)
	`); err != nil {
		t.Fatalf("insert Beacon outcome: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO beacon_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address
		) VALUES ('SN_SEPOLIA', 2, '0x1', 8, '0x2', '0x3', '0x4', '0x5', '0x6');
		INSERT INTO beacon_round_outcomes(
			network, round_id, whisper_address, auction_id, terminal_status,
			has_winner, winner_group_handle, winner_commitment, winning_bid,
			second_highest_bid, clearing_price, funded_bid_count,
			settlement_hash, settlement_transaction_hash, settled_at
		) VALUES (
			'SN_SEPOLIA', 2, '0x1', 8, 'settled', 1, '0x7', '0x8',
			'100', '80', '80', 2, '0x9', NULL, 100
		)
	`); err != nil {
		t.Fatalf("insert direct-RPC Beacon outcome without transaction hash: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO beacon_cycle_jobs(
			network, predecessor_round_id, predecessor_whisper_address,
			predecessor_auction_id, successor_round_id, expected_metadata_hash
		) VALUES ('SN_SEPOLIA', 1, '0x1', 7, 2, '0xb')
	`); err != nil {
		t.Fatalf("insert Beacon cycle job: %v", err)
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
	if !tableExists(t, db, "beacon_rounds") {
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
