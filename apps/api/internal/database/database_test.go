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
	if migrations != 20 {
		t.Fatalf("expected 20 migrations, got %d", migrations)
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

func databaseBeforeMigration(t *testing.T, path, version string) *sql.DB {
	t.Helper()
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
		if entry.Name() >= version {
			continue
		}
		if err := applyMigration(ctx, legacy, entry.Name()); err != nil {
			t.Fatal(err)
		}
	}
	return legacy
}

func TestDailyPrizeMigrationPreservesExistingPrize(t *testing.T) {
	ctx := t.Context()
	path := filepath.Join(t.TempDir(), "survivor.db")
	db := databaseBeforeMigration(t, path, "017")
	defer db.Close()
	const weekly = "500000000000000000000"
	const daily = "100000000000000000000"
	_, err := db.Exec(`INSERT INTO survivor_rounds(id, network, deadline, leader_wallet, prize_amount, claimed_at) VALUES
		(1, 'SN_MAIN', 1, '0x123', ?, 2), (2, 'SN_MAIN', 3, '0x456', ?, NULL),
		(3, 'SN_MAIN', 4, NULL, NULL, NULL)`, weekly, weekly)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	var matched int
	err = db.QueryRow(`SELECT COUNT(*) FROM survivor_rounds WHERE
		(id=1 AND leader_wallet='0x123' AND prize_amount=? AND claimed_at=2) OR
		(id=2 AND leader_wallet='0x456' AND prize_amount=? AND claimed_at IS NULL) OR
		(id=3 AND prize_amount IS NULL)`, weekly, weekly).Scan(&matched)
	if err != nil || matched != 3 {
		t.Fatalf("preserved %d of 3 existing rounds: %v", matched, err)
	}
	if _, err := db.Exec("INSERT INTO survivor_rounds(network, deadline, prize_amount) VALUES ('SN_MAIN', 86404, ?)", daily); err != nil {
		t.Fatal(err)
	}
}

func TestOpenAuctionMigrationPreservesWhisperWinners(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "stakewars.db")
	legacy := databaseBeforeMigration(t, path, "012")
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

func TestSurvivorRunMigrationPreservesTicketsAndBests(t *testing.T) {
	db := databaseBeforeMigration(t, filepath.Join(t.TempDir(), "runs.db"), "018")
	defer db.Close()
	_, err := db.Exec(`INSERT INTO survivor_rounds(id,network,deadline) VALUES(1,'SN_MAIN',1);
    INSERT INTO survivor_scores VALUES(1,'0x2',7,30,'[]',1,1),(1,'0x1',7,NULL,NULL,2,0);
    INSERT INTO survivor_receipts VALUES(x'01',1,'0x2',7,NULL,NULL),(x'02',1,'0x2',2,NULL,NULL),(x'03',1,'0x1',NULL,123,456)`)
	if err != nil {
		t.Fatal(err)
	}
	if err = migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	var count int
	err = db.QueryRow(`SELECT count(*) FROM survivor_runs WHERE (id=1 AND player='0x2' AND ticket_hash=x'01' AND duration_seconds=30 AND outis=1)
    OR (id=2 AND player='0x1' AND destroyed=7 AND upgrades IS NULL) OR (ticket_hash=x'02' AND destroyed=2)
    OR (ticket_hash=x'03' AND destroyed IS NULL AND seed=123 AND started_ms=456)`).Scan(&count)
	if err != nil || count != 4 {
		t.Fatal(count, err)
	}
}

func TestSurvivorWalletKindMigrationOpensPrizeToEveryWallet(t *testing.T) {
	db := databaseBeforeMigration(t, filepath.Join(t.TempDir(), "wallets.db"), "019")
	defer db.Close()
	// Round 1 closed with an Outis winner. Round 2 is open, and a Ready wallet
	// leads it once every signed wallet counts. Guests never lead.
	_, err := db.Exec(`INSERT INTO survivor_rounds(id,network,deadline,leader_wallet,leading_destroyed,prize_amount) VALUES
        (1,'SN_MAIN',unixepoch()-60,'0xa',10,'100000000000000000000'),
        (2,'SN_MAIN',unixepoch()+3600,'0xb',20,'100000000000000000000');
    INSERT INTO survivor_runs(network,round_id,player,destroyed,duration_seconds,upgrades,outis) VALUES
        ('SN_MAIN',1,'0xa',10,5,'[]',1),
        ('SN_MAIN',1,'0xc',99,5,'[]',0),
        ('SN_MAIN',2,'0xb',20,5,'[]',1),
        ('SN_MAIN',2,'guest-1',500,5,'[]',0),
        ('SN_MAIN',2,'0xd',30,9,'[]',0),
        ('SN_MAIN',2,'0xe',30,8,'[]',0)`)
	if err != nil {
		t.Fatal(err)
	}
	if err = migrate(t.Context(), db); err != nil {
		t.Fatal(err)
	}
	var count int
	err = db.QueryRow(`SELECT count(*) FROM survivor_rounds WHERE
        (id=1 AND leader_wallet='0xa' AND leading_destroyed=10 AND leader_wallet_kind='outis') OR
        (id=2 AND leader_wallet='0xd' AND leading_destroyed=30 AND leader_duration_seconds=9 AND leader_wallet_kind IS NULL)`).Scan(&count)
	if err != nil || count != 2 {
		t.Fatal("round leaders", count, err)
	}
	err = db.QueryRow(`SELECT count(*) FROM survivor_runs WHERE (outis=1) = (wallet_kind IS 'outis')`).Scan(&count)
	if err != nil || count != 6 {
		t.Fatal("wallet kinds", count, err)
	}
}
