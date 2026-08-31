package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Arbiter history backfill failed")
		os.Exit(1)
	}
	fmt.Println("Arbiter history backfill is complete")
}

func run() error {
	whisperAddress := flag.String(
		"whisper",
		strings.TrimSpace(os.Getenv("TORII_WHISPER_ADDRESS")),
		"canonical Whisper contract address",
	)
	rawRounds := flag.String("rounds", "", "comma-separated round:auction pairs")
	flag.Parse()

	rounds, err := parseRounds(*rawRounds)
	if err != nil {
		return err
	}
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	if configuration.StarknetRPCURL == "" || configuration.ToriiURL == "" {
		return fmt.Errorf("STARKNET_RPC_URL and TORII_URL are required")
	}
	if strings.TrimSpace(*whisperAddress) == "" {
		return fmt.Errorf("Whisper address is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	backfiller, err := arbiter.NewHistoricalRoundBackfiller(
		arbiter.NewStore(db),
		starknet.NewWhisperReader(configuration.StarknetRPCURL),
		configuration.StarknetChainID,
		*whisperAddress,
		configuration.ToriiURL,
	)
	if err != nil {
		return err
	}
	for _, round := range rounds {
		if err := backfiller.Backfill(ctx, round); err != nil {
			return err
		}
	}
	return nil
}

func parseRounds(value string) ([]arbiter.HistoricalRound, error) {
	parts := strings.Split(strings.TrimSpace(value), ",")
	if len(parts) == 1 && strings.TrimSpace(parts[0]) == "" {
		return nil, fmt.Errorf("at least one round:auction pair is required")
	}
	rounds := make([]arbiter.HistoricalRound, 0, len(parts))
	seenRounds := make(map[uint64]struct{}, len(parts))
	seenAuctions := make(map[uint64]struct{}, len(parts))
	for _, part := range parts {
		roundValue, auctionValue, found := strings.Cut(strings.TrimSpace(part), ":")
		if !found {
			return nil, fmt.Errorf("invalid round:auction pair")
		}
		roundID, err := strconv.ParseUint(roundValue, 10, 64)
		if err != nil || roundID == 0 {
			return nil, fmt.Errorf("invalid historical round ID")
		}
		auctionID, err := strconv.ParseUint(auctionValue, 10, 64)
		if err != nil || auctionID == 0 {
			return nil, fmt.Errorf("invalid historical auction ID")
		}
		if _, exists := seenRounds[roundID]; exists {
			return nil, fmt.Errorf("duplicate historical round ID")
		}
		if _, exists := seenAuctions[auctionID]; exists {
			return nil, fmt.Errorf("duplicate historical auction ID")
		}
		seenRounds[roundID] = struct{}{}
		seenAuctions[auctionID] = struct{}{}
		rounds = append(rounds, arbiter.HistoricalRound{RoundID: roundID, AuctionID: auctionID})
	}
	return rounds, nil
}
