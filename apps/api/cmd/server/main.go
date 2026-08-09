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

	server := &http.Server{
		Addr: ":" + configuration.Port,
		Handler: api.NewHandler(api.Dependencies{
			DB:   db,
			Auth: authService,
			Config: api.PublicConfig{
				Network:       configuration.StarknetChainID,
				MaxImageBytes: configuration.MaxImageBytes,
				AuthEnabled:   configuration.StarknetRPCURL != "",
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
