// survivor-round opens a prize round directly on the API's SQLite volume.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/survivor"
)

func main() {
	end := flag.String("deadline", survivor.NextDailyDeadline(time.Now()).Format(time.RFC3339), "round deadline in RFC3339 (defaults to the next 22:00 EST)")
	flag.Parse()
	deadline, err := time.Parse(time.RFC3339, *end)
	if err != nil {
		log.Fatal("supply a valid RFC3339 -deadline")
	}
	path, network := os.Getenv("DATABASE_PATH"), os.Getenv("STARKNET_CHAIN_ID")
	if path == "" || network == "" {
		log.Fatal("DATABASE_PATH and STARKNET_CHAIN_ID are required")
	}
	if _, err := os.Stat(path); err != nil {
		log.Fatal("open the existing API database: ", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	db, err := database.Open(ctx, path)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	id, err := survivor.NewStore(db, network).Open(ctx, deadline)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Opened %s Survivor round %d through %s\n", network, id, deadline.UTC().Format(time.RFC3339))
}
