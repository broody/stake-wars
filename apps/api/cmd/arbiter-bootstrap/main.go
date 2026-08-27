package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Arbiter bootstrap failed")
		os.Exit(1)
	}
	fmt.Println("Arbiter bootstrap is registered")
}

func run() error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	if !configuration.ArbiterCoordinatorEnabled() {
		return fmt.Errorf("Arbiter coordinator is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()
	store := arbiter.NewStore(db)
	reader := starknet.NewWhisperReader(configuration.StarknetRPCURL)
	restarter, err := arbiter.NewOperatorRoundRestarter(
		store,
		reader,
		arbiter.NewOperatorCoordinatorClient(
			configuration.ArbiterCoordinatorURL,
			configuration.ArbiterCoordinatorToken,
		),
		arbiter.CoordinatorConfig{
			Network:                   configuration.StarknetChainID,
			PaymentToken:              configuration.ArbiterPaymentToken,
			ReservePrice:              configuration.ArbiterReservePrice,
			MaxBids:                   configuration.ArbiterMaxBids,
			WinnerPayloadDomain:       configuration.ArbiterWinnerPayloadDomain,
			BiddingDurationSeconds:    uint64(configuration.ArbiterBiddingDuration / time.Second),
			AcceptanceDurationSeconds: uint64(configuration.ArbiterAcceptanceDuration / time.Second),
			SettlementDurationSeconds: uint64(configuration.ArbiterSettlementDuration / time.Second),
		},
	)
	if err != nil {
		return err
	}
	return restarter.Bootstrap(ctx)
}
