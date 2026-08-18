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
		imageService = images.NewService(
			images.NewStore(db), objectStore, controlReader,
			configuration.StarknetChainID, configuration.MaxImageBytes,
		)
	} else {
		slog.Warn("image storage is not configured; Sector uploads are disabled")
	}
	server := &http.Server{
		Addr: ":" + configuration.Port,
		Handler: api.NewHandler(api.Dependencies{
			DB:     db,
			Auth:   authService,
			Torii:  toriiGateway,
			Images: imageService,
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

func publicToriiURL(gateway *api.ToriiGateway) string {
	if gateway == nil {
		return ""
	}
	return "/torii"
}
