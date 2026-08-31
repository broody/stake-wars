package arbiter

import (
	"context"
	"fmt"
	"strings"

	"stakewars.com/api/internal/starknet"
)

// HistoricalRound identifies one already-settled Whisper auction that should
// be projected into Arbiter history. Callers must enumerate rounds explicitly;
// the backfiller never discovers or imports auctions on its own.
type HistoricalRound struct {
	RoundID   uint64
	AuctionID uint64
}

type historicalRoundStore interface {
	RegisterRound(ctx context.Context, round CanonicalRound) error
	SaveSettlement(ctx context.Context, network string, projection SettlementProjection) error
}

// HistoricalRoundBackfiller verifies explicit auctions against both Starknet
// RPC and Torii before writing their immutable round and settlement records.
type HistoricalRoundBackfiller struct {
	store          historicalRoundStore
	reader         starknet.WhisperReader
	source         settlementSource
	network        string
	whisperAddress string
}

func NewHistoricalRoundBackfiller(
	store *Store,
	reader starknet.WhisperReader,
	network string,
	whisperAddress string,
	toriiURL string,
) (*HistoricalRoundBackfiller, error) {
	source, err := NewToriiSettlementSource(toriiURL)
	if err != nil {
		return nil, err
	}
	return newHistoricalRoundBackfiller(store, reader, source, network, whisperAddress)
}

func newHistoricalRoundBackfiller(
	store historicalRoundStore,
	reader starknet.WhisperReader,
	source settlementSource,
	network string,
	whisperAddress string,
) (*HistoricalRoundBackfiller, error) {
	if store == nil || reader == nil || source == nil {
		return nil, fmt.Errorf("historical Arbiter backfill dependencies are required")
	}
	network = strings.TrimSpace(network)
	if network == "" {
		return nil, fmt.Errorf("historical Arbiter backfill network is required")
	}
	whisperAddress, err := starknet.NormalizeAddress(whisperAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid historical Whisper address: %w", err)
	}
	return &HistoricalRoundBackfiller{
		store: store, reader: reader, source: source,
		network: network, whisperAddress: whisperAddress,
	}, nil
}

func (b *HistoricalRoundBackfiller) Backfill(
	ctx context.Context,
	spec HistoricalRound,
) error {
	if spec.RoundID == 0 || spec.AuctionID == 0 {
		return fmt.Errorf("historical Arbiter round and auction IDs must be positive")
	}
	auction, err := b.reader.Auction(ctx, b.whisperAddress, spec.AuctionID)
	if err != nil {
		return fmt.Errorf("read historical Whisper auction %d: %w", spec.AuctionID, err)
	}
	if auction.Status != starknet.WhisperStatusSettled {
		return fmt.Errorf("historical Whisper auction %d is %s, not settled", spec.AuctionID, auction.Status)
	}

	round := CanonicalRound{
		Network: b.network, RoundID: spec.RoundID,
		WhisperAddress: b.whisperAddress, AuctionID: spec.AuctionID,
		ExpectedCreator: auction.Creator, PaymentToken: auction.PaymentToken,
		MetadataHash: auction.MetadataHash, WinnerPayloadDomain: auction.WinnerPayloadDomain,
		VaultAddress:           auction.VaultAddress,
		BiddingDurationSeconds: auction.Schedule.BiddingDuration,
	}
	expectedBiddingDuration := auction.Schedule.BiddingDuration
	if err := validateCanonicalRound(round, auction, expectedBiddingDuration); err != nil {
		return fmt.Errorf("verify historical Arbiter round %d: %w", spec.RoundID, err)
	}

	projection, found, err := b.source.Settlement(ctx, round)
	if err != nil {
		return fmt.Errorf("read historical Torii settlement for round %d: %w", spec.RoundID, err)
	}
	if !found {
		return fmt.Errorf("historical Torii settlement for round %d was not found", spec.RoundID)
	}
	verifier := SettlementProjector{
		reader: b.reader, network: b.network,
		biddingDurationSeconds: expectedBiddingDuration,
	}
	if err := verifier.verifySettlement(ctx, round, projection); err != nil {
		return fmt.Errorf("verify historical Arbiter settlement for round %d: %w", spec.RoundID, err)
	}
	projection.RoundID = spec.RoundID
	projection.WhisperAddress = b.whisperAddress

	// All external evidence is verified before either idempotent write occurs.
	if err := b.store.RegisterRound(ctx, round); err != nil {
		return err
	}
	if err := b.store.SaveSettlement(ctx, b.network, projection); err != nil {
		return err
	}
	return nil
}
