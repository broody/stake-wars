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
	"stakewars.com/api/internal/networkstats"
	"stakewars.com/api/internal/objectstore"
	"stakewars.com/api/internal/stakingstats"
	"stakewars.com/api/internal/starknet"
	"stakewars.com/api/internal/supplydrop"
	"stakewars.com/api/internal/txjournal"
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
	beaconStore := beacon.NewStore(db)
	// Without a Beacon System the API still serves the preserved controller,
	// transmission, and history, and reports that no round is open.
	var beaconReader starknet.BeaconReader
	beaconAddress := ""
	if configuration.BeaconSystemAddress != "" {
		reader, err := starknet.NewBeaconReader(
			configuration.StarknetRPCURL,
			configuration.BeaconSystemAddress,
		)
		if err != nil {
			return err
		}
		beaconReader, beaconAddress = reader, reader.Address()
	}
	beaconProjector := beacon.NewSettlementProjector(
		beaconStore,
		beaconReader,
		configuration.StarknetChainID,
	)
	var maintenanceWorker *beacon.Worker
	maintenanceDuties := make([]beacon.Duty, 0, 5)
	if beaconReader != nil {
		maintenanceDuties = append(maintenanceDuties, beaconProjector)
	}
	if configuration.SupplyDropKeeperEnabled() {
		slog.Info(
			"SupplyDrop keeper enabled",
			"account", configuration.SupplyDropKeeperAccount,
			"system", configuration.SupplyDropSystemAddress,
		)
		supplyDropReader, err := starknet.NewSupplyDropReader(
			configuration.StarknetRPCURL,
			configuration.ToriiURL,
			configuration.SupplyDropSystemAddress,
		)
		if err != nil {
			return err
		}
		keeperStartupContext, cancelKeeperStartup := context.WithTimeout(
			context.Background(), 30*time.Second,
		)
		supplyDropSubmitter, err := starknet.NewSupplyDropSubmitter(
			keeperStartupContext,
			configuration.StarknetRPCURL,
			configuration.SupplyDropSystemAddress,
			configuration.SupplyDropKeeperAccount,
			configuration.SupplyDropKeeperPrivateKey,
			starknet.KeeperTracking{Store: txjournal.NewStore(db), Network: configuration.StarknetChainID},
		)
		cancelKeeperStartup()
		if err != nil {
			return err
		}
		maintenanceDuties = append(
			maintenanceDuties,
			supplyDropSubmitter,
			supplydrop.NewDuty(supplyDropReader, supplyDropSubmitter),
		)
		if configuration.BeaconKeeper {
			beaconSubmitter, err := starknet.NewBeaconSubmitter(
				supplyDropSubmitter, configuration.BeaconSystemAddress,
			)
			if err != nil {
				return err
			}
			maintenanceDuties = append(
				maintenanceDuties, beacon.NewSettlementDuty(beaconReader, beaconSubmitter),
			)
			slog.Info("Beacon keeper enabled", "account", configuration.SupplyDropKeeperAccount,
				"system", configuration.BeaconSystemAddress)
		}
	}
	if len(maintenanceDuties) > 0 {
		maintenanceWorker = beacon.NewWorker(20*time.Second, maintenanceDuties...)
	}
	// The staking index gets its own worker so a long backfill never delays
	// keeper duties.
	var stakingService *stakingstats.Service
	var stakingWorker *beacon.Worker
	if configuration.StarknetRPCURL != "" && configuration.ToriiStakingPoolAddress != "" {
		stakingService, err = stakingstats.NewService(
			starknet.NewChainClient(configuration.StarknetRPCURL),
			stakingstats.NewStore(db, configuration.StarknetChainID),
			stakingstats.Config{
				Network:      configuration.StarknetChainID,
				FeaturedPool: configuration.ToriiStakingPoolAddress,
			},
		)
		if err != nil {
			return err
		}
		stakingWorker = beacon.NewWorker(time.Minute, stakingService)
	} else {
		slog.Warn("STARKNET_RPC_URL or TORII_STAKING_POOL_ADDRESS is not configured; staking statistics are disabled")
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
			beacon.NewControllerSource(beaconStore, beaconProjector),
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
				beaconReader,
				beaconProjector,
				configuration.StarknetChainID,
				beaconAddress,
			),
			BeaconHistory: beacon.NewHistoryService(
				beaconStore,
				configuration.StarknetChainID,
			),
			NetworkStats: statsReader,
			Staking:      stakingDependency(stakingService),
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
	for _, worker := range []struct {
		name   string
		worker *beacon.Worker
	}{
		{name: "Maintenance", worker: maintenanceWorker},
		{name: "Staking statistics", worker: stakingWorker},
	} {
		if worker.worker == nil {
			continue
		}
		workerDone := make(chan struct{})
		defer func() {
			stop()
			select {
			case <-workerDone:
			case <-time.After(shutdownPeriod):
				slog.Error(worker.name + " worker shutdown timed out")
			}
		}()
		go func() {
			defer close(workerDone)
			if err := worker.worker.Run(ctx); err != nil {
				slog.ErrorContext(ctx, worker.name+" worker stopped", "error", err)
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

// stakingDependency keeps a disabled service as a nil interface.
func stakingDependency(service *stakingstats.Service) api.StakingReader {
	if service == nil {
		return nil
	}
	return service
}

func publicToriiURL(gateway *api.ToriiGateway) string {
	if gateway == nil {
		return ""
	}
	return "/torii"
}
