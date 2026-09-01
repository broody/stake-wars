package beacon

import (
	"context"
	"strings"
	"testing"

	"stakewars.com/api/internal/starknet"
)

func TestOnchainSettlementProjectorDoesNotWaitForTorii(t *testing.T) {
	round := canonicalRoundFixture()
	store := &fakeSettlementProjectionStore{rounds: []CanonicalRound{round}}
	reader := &fakeWhisperReader{
		auction: whisperAuctionFixture(starknet.WhisperStatusSettled),
		result: starknet.WhisperResult{
			AuctionID: round.AuctionID, HasWinner: true,
			WinnerBidHandle: "0xabc", WinnerCommitment: "0xdef",
			WinningBid: "200", SecondHighestBid: "150", ClearingPrice: "150",
			SettlementHash: "0x999", SettledAt: 125,
		},
	}
	projector := NewOnchainSettlementProjector(
		store,
		reader,
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)

	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.saved) != 1 {
		t.Fatalf("expected one direct-RPC settlement, got %+v", store.saved)
	}
	projection := store.saved[0]
	if projection.RoundID != round.RoundID || projection.AuctionID != round.AuctionID ||
		projection.WhisperAddress != round.WhisperAddress || !projection.HasWinner ||
		projection.WinnerGroupHandle != "0xabc" || projection.WinnerCommitment != "0xdef" ||
		projection.WinningBid != "200" || projection.FundedBidCount != 2 ||
		projection.SettlementHash != "0x999" || projection.SettlementTransactionHash != "" ||
		projection.SettledAt.Unix() != 125 {
		t.Fatalf("unexpected direct-RPC settlement: %+v", projection)
	}
}

func TestOnchainSettlementProjectorLeavesOpenRoundUnprojected(t *testing.T) {
	store := &fakeSettlementProjectionStore{rounds: []CanonicalRound{canonicalRoundFixture()}}
	projector := NewOnchainSettlementProjector(
		store,
		&fakeWhisperReader{auction: whisperAuctionFixture(starknet.WhisperStatusBidding)},
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)

	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.saved) != 0 {
		t.Fatalf("open round must not be projected: %+v", store.saved)
	}
}

func TestOnchainSettlementProjectorRejectsMismatchedResult(t *testing.T) {
	auction := whisperAuctionFixture(starknet.WhisperStatusSettled)
	store := &fakeSettlementProjectionStore{rounds: []CanonicalRound{canonicalRoundFixture()}}
	projector := NewOnchainSettlementProjector(
		store,
		&fakeWhisperReader{
			auction: auction,
			result: starknet.WhisperResult{
				AuctionID: 7, HasWinner: true,
				WinnerBidHandle: "0xabc", WinnerCommitment: "0xdef",
				WinningBid: "200", SecondHighestBid: "150", ClearingPrice: "150",
				SettlementHash: "0x998", SettledAt: 125,
			},
		},
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)

	err := projector.Reconcile(context.Background())
	if err == nil || !strings.Contains(err.Error(), "settlement hash mismatch") {
		t.Fatalf("expected result mismatch rejection, got %v", err)
	}
	if len(store.saved) != 0 {
		t.Fatalf("mismatched result must not be saved: %+v", store.saved)
	}
}
