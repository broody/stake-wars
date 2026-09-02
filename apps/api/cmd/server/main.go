package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"stakewars.com/api/internal/api"
	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/beacon"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/images"
	"stakewars.com/api/internal/jackpot"
	"stakewars.com/api/internal/networkstats"
	"stakewars.com/api/internal/objectstore"
	"stakewars.com/api/internal/starknet"
)

const shutdownPeriod = 10 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configuration, err := config.Load()
	if err != nil {
		return err
	}
	toriiGateway, err := api.NewToriiGateway(configuration.ToriiURL)
	if err != nil {
		return err
	}
	statsReader, err := networkstats.NewToriiReader(
		configuration.ToriiURL,
		configuration.ToriiStakingPoolAddress,
		configuration.StarknetChainID,
	)
	if err != nil {
		return err
	}

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelStartup()
	db, err := database.Open(startupContext, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()

	verifier := starknet.NewVerifier(configuration.StarknetRPCURL, configuration.StarknetChainID)
	whisperReader := starknet.NewWhisperReader(configuration.StarknetRPCURL)
	beaconStore := beacon.NewStore(db)
	beaconBiddingDurationSeconds := uint64(configuration.BeaconBiddingDuration / time.Second)
	var maintenanceWorker *beacon.Worker
	maintenanceDuties := make([]beacon.Duty, 0, 4)
	if configuration.StarknetRPCURL != "" {
		maintenanceDuties = append(maintenanceDuties,
			beacon.NewOnchainSettlementProjector(
				beaconStore,
				whisperReader,
				configuration.StarknetChainID,
				beaconBiddingDurationSeconds,
			),
		)
	}
	if configuration.BeaconCoordinatorEnabled() {
		maintenanceDuties = append(maintenanceDuties, beacon.NewWinnerProjector(
			beaconStore,
			beacon.NewOperatorCoordinatorClient(
				configuration.BeaconCoordinatorURL,
				configuration.BeaconCoordinatorToken,
			),
			configuration.StarknetChainID,
		))
	}
	if configuration.BeaconCoordinatorEnabled() {
		restarter, err := newBeaconRestarter(configuration, beaconStore, whisperReader)
		if err != nil {
			return err
		}
		maintenanceDuties = append(maintenanceDuties, beacon.NewAuctionCycleDuty(
			beaconStore, whisperReader, restarter, configuration.StarknetChainID,
		))
	}
	if configuration.JackpotKeeperEnabled() {
		slog.Info(
			"Jackpot keeper enabled",
			"account", configuration.JackpotKeeperAccount,
			"system", configuration.JackpotSystemAddress,
		)
		jackpotReader, err := starknet.NewJackpotReader(
			configuration.StarknetRPCURL,
			configuration.ToriiURL,
			configuration.JackpotSystemAddress,
		)
		if err != nil {
			return err
		}
		keeperStartupContext, cancelKeeperStartup := context.WithTimeout(
			context.Background(), 30*time.Second,
		)
		jackpotSubmitter, err := starknet.NewJackpotSubmitter(
			keeperStartupContext,
			configuration.StarknetRPCURL,
			configuration.JackpotSystemAddress,
			configuration.JackpotKeeperAccount,
			configuration.JackpotKeeperPrivateKey,
		)
		cancelKeeperStartup()
		if err != nil {
			return err
		}
		maintenanceDuties = append(
			maintenanceDuties,
			jackpot.NewDuty(jackpotReader, jackpotSubmitter),
		)
	}
	if len(maintenanceDuties) > 0 {
		maintenanceWorker = beacon.NewWorker(20*time.Second, maintenanceDuties...)
	}
	if configuration.StarknetRPCURL == "" {
		slog.Warn("STARKNET_RPC_URL is not configured; session creation is disabled")
	}
	authService := auth.NewService(
		auth.NewStore(db),
		verifier,
		auth.ServiceConfig{
			ChallengeTTL: configuration.ChallengeTTL,
			SessionTTL:   configuration.SessionTTL,
		},
	)
	var imageService *images.Service
	var beaconImageService *images.BeaconService
	if configuration.ImageStorageEnabled() {
		if configuration.StarknetRPCURL == "" || configuration.ControlSystemAddress == "" {
			return errors.New("STARKNET_RPC_URL and CONTROL_SYSTEM_ADDRESS are required when image storage is enabled")
		}
		objectStore, err := objectstore.NewS3Store(startupContext, objectstore.S3Config{
			Bucket:          configuration.ImageBucket,
			PublicURL:       configuration.ImagePublicURL,
			Endpoint:        configuration.S3Endpoint,
			Region:          configuration.S3Region,
			AccessKeyID:     configuration.S3AccessKeyID,
			SecretAccessKey: configuration.S3SecretAccessKey,
		})
		if err != nil {
			return err
		}
		controlReader, err := starknet.NewControlReader(
			configuration.StarknetRPCURL,
			configuration.ControlSystemAddress,
		)
		if err != nil {
			return err
		}
		imageStore := images.NewStore(db)
		imageService = images.NewService(
			imageStore, objectStore, controlReader,
			configuration.StarknetChainID, configuration.MaxImageBytes,
		)
		beaconImageService = images.NewBeaconService(
			imageStore,
			objectStore,
			beaconStore,
			configuration.StarknetChainID,
			configuration.MaxImageBytes,
		)
	} else {
		slog.Warn("image storage is not configured; Sector uploads are disabled")
	}
	server := &http.Server{
		Addr: ":" + configuration.Port,
		Handler: api.NewHandler(api.Dependencies{
			DB:           db,
			Auth:         authService,
			Torii:        toriiGateway,
			Images:       imageService,
			BeaconImages: beaconImageService,
			Beacon: beacon.NewService(
				beaconStore,
				whisperReader,
				configuration.StarknetChainID,
				beaconBiddingDurationSeconds,
			),
			BeaconHistory: beacon.NewHistoryService(
				beaconStore,
				configuration.StarknetChainID,
			),
			NetworkStats: statsReader,
			Config: api.PublicConfig{
				Network:             configuration.StarknetChainID,
				MaxImageBytes:       configuration.MaxImageBytes,
				AuthEnabled:         configuration.StarknetRPCURL != "",
				ToriiURL:            publicToriiURL(toriiGateway),
				ImageUploadsEnabled: imageService != nil,
			},
			AllowedOrigins: configuration.AllowedOrigins,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT,
		syscall.SIGTERM,
	)
	defer stop()
	if maintenanceWorker != nil {
		go func() {
			if err := maintenanceWorker.Run(ctx); err != nil {
				slog.ErrorContext(ctx, "Maintenance worker stopped", "error", err)
			}
		}()
	}
	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("API listening", "address", server.Addr)
		serverErrors <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownPeriod)
	defer cancel()

	return server.Shutdown(shutdownCtx)
}

func newBeaconRestarter(
	configuration config.Config,
	store *beacon.Store,
	reader starknet.WhisperReader,
) (*beacon.OperatorRoundRestarter, error) {
	return beacon.NewOperatorRoundRestarter(
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
}

func publicToriiURL(gateway *api.ToriiGateway) string {
	if gateway == nil {
		return ""
	}
	return "/torii"
}
