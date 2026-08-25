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
	if migrations != 3 {
		t.Fatalf("expected three migrations, got %d", migrations)
	}

	if _, err := db.Exec(`
		INSERT INTO arbiter_rounds(
			network, round_id, whisper_address, auction_id, expected_creator,
			payment_token, metadata_hash, winner_payload_domain, vault_address
		) VALUES ('SN_SEPOLIA', 1, '0x1', 7, '0x2', '0x3', '0x4', '0x5', '0x6')
	`); err != nil {
		t.Fatalf("insert Arbiter round: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO image_reports(id, artwork_id, reason, created_at)
		VALUES ('report', 'missing', 'test', 1)
	`); err == nil {
		t.Fatal("expected foreign key constraint")
	}
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
