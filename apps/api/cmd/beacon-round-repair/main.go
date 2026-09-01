package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"stakewars.com/api/internal/beacon"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Beacon round label repair failed")
		os.Exit(1)
	}
	fmt.Println("Beacon round labels are repaired")
}

func run() error {
	whisperAddress := flag.String(
		"whisper",
		strings.TrimSpace(os.Getenv("TORII_WHISPER_ADDRESS")),
		"canonical Whisper contract address",
	)
	existingRound := flag.Uint64("existing-round", 0, "incorrect current round label")
	existingAuction := flag.Uint64("existing-auction", 0, "auction currently using that label")
	correctedRound := flag.Uint64("corrected-round", 0, "correct label for the existing auction")
	missingAuction := flag.Uint64("missing-auction", 0, "auction that belongs at the vacated label")
	flag.Parse()

	configuration, err := config.Load()
	if err != nil {
		return err
	}
	if configuration.StarknetRPCURL == "" || strings.TrimSpace(*whisperAddress) == "" {
		return fmt.Errorf("STARKNET_RPC_URL and Whisper address are required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	repairer, err := beacon.NewRoundLabelRepairer(
		beacon.NewStore(db),
		starknet.NewWhisperReader(configuration.StarknetRPCURL),
		configuration.StarknetChainID,
		*whisperAddress,
	)
	if err != nil {
		return err
	}
	return repairer.Repair(ctx, beacon.RoundLabelRepair{
		ExistingRoundID: *existingRound, ExistingAuctionID: *existingAuction,
		CorrectedRoundID: *correctedRound, MissingAuctionID: *missingAuction,
	})
}
