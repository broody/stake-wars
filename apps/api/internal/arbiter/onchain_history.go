package arbiter

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"stakewars.com/api/internal/starknet"
)

// OnchainSettlementProjector reads canonical Whisper state directly from
// Starknet RPC. Torii may still index the same events for queries, but its head
// is not allowed to gate winner disclosure or controller activation.
type OnchainSettlementProjector struct {
	store                  settlementProjectionStore
	reader                 starknet.WhisperReader
	network                string
	biddingDurationSeconds uint64
}

func NewOnchainSettlementProjector(
	store settlementProjectionStore,
	reader starknet.WhisperReader,
	network string,
	biddingDurationSeconds uint64,
) *OnchainSettlementProjector {
	return &OnchainSettlementProjector{
		store:                  store,
		reader:                 reader,
		network:                network,
		biddingDurationSeconds: biddingDurationSeconds,
	}
}

func (p *OnchainSettlementProjector) Reconcile(ctx context.Context) error {
	rounds, err := p.store.UnprojectedRounds(ctx, p.network)
	if err != nil {
		return err
	}
	for _, round := range rounds {
		auction, err := p.reader.Auction(ctx, round.WhisperAddress, round.AuctionID)
		if err != nil {
			return fmt.Errorf("read Whisper auction for round %d: %w", round.RoundID, err)
		}
		if err := validateCanonicalRound(round, auction, p.biddingDurationSeconds); err != nil {
			return fmt.Errorf("verify Arbiter settlement for round %d: %w", round.RoundID, err)
		}
		if auction.Status != starknet.WhisperStatusSettled {
			continue
		}
		result, err := p.reader.Result(ctx, round.WhisperAddress, round.AuctionID)
		if err != nil {
			return fmt.Errorf("read Whisper result for round %d: %w", round.RoundID, err)
		}
		projection, err := directSettlementProjection(round, auction, result)
		if err != nil {
			return fmt.Errorf("verify Arbiter settlement for round %d: %w", round.RoundID, err)
		}
		if err := p.store.SaveSettlement(ctx, p.network, projection); err != nil {
			return err
		}
	}
	return nil
}

func directSettlementProjection(
	round CanonicalRound,
	auction starknet.WhisperAuction,
	result starknet.WhisperResult,
) (SettlementProjection, error) {
	if result.AuctionID != round.AuctionID {
		return SettlementProjection{}, fmt.Errorf("result auction ID mismatch")
	}
	settlementHash, err := starknet.NormalizeFelt(result.SettlementHash)
	if err != nil || settlementHash == "0x0" {
		return SettlementProjection{}, fmt.Errorf("invalid result settlement hash")
	}
	auctionSettlementHash, err := starknet.NormalizeFelt(auction.SettlementHash)
	if err != nil || auctionSettlementHash != settlementHash {
		return SettlementProjection{}, fmt.Errorf("auction settlement hash mismatch")
	}
	winnerGroup, err := starknet.NormalizeFelt(result.WinnerBidHandle)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid winner group: %w", err)
	}
	winnerCommitment, err := starknet.NormalizeFelt(result.WinnerCommitment)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid winner commitment: %w", err)
	}
	winningBid, ok := new(big.Int).SetString(result.WinningBid, 10)
	if !ok || winningBid.Sign() < 0 {
		return SettlementProjection{}, fmt.Errorf("invalid winning bid")
	}
	secondHighestBid, ok := new(big.Int).SetString(result.SecondHighestBid, 10)
	if !ok || secondHighestBid.Sign() < 0 {
		return SettlementProjection{}, fmt.Errorf("invalid second-highest bid")
	}
	clearingPrice, ok := new(big.Int).SetString(result.ClearingPrice, 10)
	if !ok || clearingPrice.Sign() < 0 {
		return SettlementProjection{}, fmt.Errorf("invalid clearing price")
	}
	if clearingPrice.Cmp(winningBid) > 0 {
		return SettlementProjection{}, fmt.Errorf("clearing price exceeds winning bid")
	}
	if result.HasWinner {
		if winnerGroup == "0x0" || winnerCommitment == "0x0" || winningBid.Sign() == 0 {
			return SettlementProjection{}, fmt.Errorf("winning settlement has an empty winner")
		}
	} else if winnerGroup != "0x0" || winnerCommitment != "0x0" ||
		winningBid.Sign() != 0 || secondHighestBid.Sign() != 0 || clearingPrice.Sign() != 0 {
		return SettlementProjection{}, fmt.Errorf("no-winner settlement contains winner data")
	}
	settledAt, err := unixTime(result.SettledAt)
	if err != nil || settledAt.Equal(time.Unix(0, 0).UTC()) {
		return SettlementProjection{}, fmt.Errorf("invalid settlement time")
	}

	return SettlementProjection{
		RoundID:           round.RoundID,
		WhisperAddress:    round.WhisperAddress,
		AuctionID:         round.AuctionID,
		HasWinner:         result.HasWinner,
		WinnerGroupHandle: winnerGroup,
		WinnerCommitment:  winnerCommitment,
		WinningBid:        winningBid.String(),
		SecondHighestBid:  secondHighestBid.String(),
		ClearingPrice:     clearingPrice.String(),
		FundedBidCount:    auction.BidCount,
		SettlementHash:    settlementHash,
		SettledAt:         settledAt,
	}, nil
}
