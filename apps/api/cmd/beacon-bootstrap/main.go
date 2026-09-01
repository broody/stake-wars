package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"stakewars.com/api/internal/beacon"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Beacon bootstrap failed")
		os.Exit(1)
	}
	fmt.Println("Beacon bootstrap is registered")
}

func run() error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	if !configuration.BeaconCoordinatorEnabled() {
		return fmt.Errorf("Beacon coordinator is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	store := beacon.NewStore(db)
	reader := starknet.NewWhisperReader(configuration.StarknetRPCURL)
	restarter, err := beacon.NewOperatorRoundRestarter(
		store,
		reader,
		beacon.NewOperatorCoordinatorClient(
			configuration.BeaconCoordinatorURL,
			configuration.BeaconCoordinatorToken,
		),
		beacon.CoordinatorConfig{
			Network:                   configuration.StarknetChainID,
			PaymentToken:              configuration.BeaconPaymentToken,
			ReservePrice:              configuration.BeaconReservePrice,
			MaxBids:                   configuration.BeaconMaxBids,
			WinnerPayloadDomain:       configuration.BeaconWinnerPayloadDomain,
			BiddingDurationSeconds:    uint64(configuration.BeaconBiddingDuration / time.Second),
			AcceptanceDurationSeconds: uint64(configuration.BeaconAcceptanceDuration / time.Second),
			SettlementDurationSeconds: uint64(configuration.BeaconSettlementDuration / time.Second),
		},
	)
	if err != nil {
		return err
	}
	return restarter.Bootstrap(ctx)
}
