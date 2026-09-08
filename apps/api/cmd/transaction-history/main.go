// transaction-history is a read-only report of backend transaction attempts.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
	"stakewars.com/api/internal/txjournal"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	defaultPath := os.Getenv("DATABASE_PATH")
	if defaultPath == "" {
		defaultPath = "/data/stakewars.db"
	}
	path := flag.String("db", defaultPath, "existing application SQLite database")
	limit := flag.Int("limit", 20, "maximum attempts (1-100); includes up to 100 recent events each")
	attempt := flag.Int64("attempt", 0, "specific attempt ID")
	network := flag.String("network", "", "network filter, e.g. SN_MAIN")
	target := flag.String("target", "", "target ID, e.g. Sector 527")
	flag.Parse()
	absolute, err := filepath.Abs(*path)
	if err != nil {
		return err
	}
	uri := url.URL{Scheme: "file", Path: absolute, RawQuery: "mode=ro"}
	db, err := sql.Open("sqlite", uri.String())
	if err != nil {
		return err
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	history, err := txjournal.NewStore(db).History(ctx, txjournal.Filter{Limit: *limit, AttemptID: *attempt, Network: *network, TargetID: *target})
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(history)
}
