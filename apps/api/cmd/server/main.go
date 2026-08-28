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
	"stakewars.com/api/internal/arbiter"
	"stakewars.com/api/internal/auth"
	"stakewars.com/api/internal/config"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/images"
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

	startupContext, cancelStartup := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelStartup()
	db, err := database.Open(startupContext, configuration.DatabasePath)
	if err != nil {
		return err
	}
	defer db.Close()

	verifier := starknet.NewVerifier(configuration.StarknetRPCURL, configuration.StarknetChainID)
	whisperReader := starknet.NewWhisperReader(configuration.StarknetRPCURL)
	arbiterStore := arbiter.NewStore(db)
	arbiterBiddingDurationSeconds := uint64(configuration.ArbiterBiddingDuration / time.Second)
	var arbiterWorker *arbiter.Worker
	arbiterDuties := make([]arbiter.Duty, 0, 3)
	if configuration.ToriiURL != "" {
		settlementSource, err := arbiter.NewToriiSettlementSource(configuration.ToriiURL)
		if err != nil {
			return err
		}
		arbiterDuties = append(arbiterDuties,
			arbiter.NewSettlementProjector(
				arbiterStore,
				settlementSource,
				whisperReader,
				configuration.StarknetChainID,
				arbiterBiddingDurationSeconds,
			),
		)
		if configuration.ArbiterCoordinatorEnabled() {
			arbiterDuties = append(arbiterDuties, arbiter.NewWinnerProjector(
				arbiterStore,
				arbiter.NewOperatorCoordinatorClient(
					configuration.ArbiterCoordinatorURL,
					configuration.ArbiterCoordinatorToken,
				),
				configuration.StarknetChainID,
			))
		}
	}
	if configuration.ArbiterCoordinatorEnabled() {
		restarter, err := newArbiterRestarter(configuration, arbiterStore, whisperReader)
		if err != nil {
			return err
		}
		arbiterDuties = append(arbiterDuties, arbiter.NewAuctionCycleDuty(
			arbiterStore, whisperReader, restarter, configuration.StarknetChainID,
		))
	}
	if len(arbiterDuties) > 0 {
		arbiterWorker = arbiter.NewWorker(20*time.Second, arbiterDuties...)
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
	var arbiterImageService *images.ArbiterService
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
		arbiterImageService = images.NewArbiterService(
			imageStore,
			objectStore,
			arbiterStore,
			configuration.StarknetChainID,
			configuration.MaxImageBytes,
		)
	} else {
		slog.Warn("image storage is not configured; Sector uploads are disabled")
	}
	server := &http.Server{
		Addr: ":" + configuration.Port,
		Handler: api.NewHandler(api.Dependencies{
			DB:            db,
			Auth:          authService,
			Torii:         toriiGateway,
			Images:        imageService,
			ArbiterImages: arbiterImageService,
			Arbiter: arbiter.NewService(
				arbiterStore,
				whisperReader,
				configuration.StarknetChainID,
				arbiterBiddingDurationSeconds,
			),
			ArbiterHistory: arbiter.NewHistoryService(
				arbiterStore,
				configuration.StarknetChainID,
			),
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
	if arbiterWorker != nil {
		go func() {
			if err := arbiterWorker.Run(ctx); err != nil {
				slog.ErrorContext(ctx, "Arbiter worker stopped", "error", err)
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

func newArbiterRestarter(
	configuration config.Config,
	store *arbiter.Store,
	reader starknet.WhisperReader,
) (*arbiter.OperatorRoundRestarter, error) {
	return arbiter.NewOperatorRoundRestarter(
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
}

func publicToriiURL(gateway *api.ToriiGateway) string {
	if gateway == nil {
		return ""
	}
	return "/torii"
}
