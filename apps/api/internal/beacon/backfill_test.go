package beacon

import (
	"context"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

func TestHistoricalRoundBackfillerImportsVerifiedShortTestAuction(t *testing.T) {
	auction := whisperAuctionFixture(starknet.WhisperStatusSettled)
	auction.Schedule = starknet.WhisperSchedule{
		Kind:            starknet.WhisperScheduleStartOnBid,
		BiddingDuration: 300, AcceptanceDuration: 180, SettlementDuration: 1320,
	}
	auction.StartedAt = 100
	auction.BiddingDeadline = 400
	auction.ForceRevealAfter = 580
	auction.AbortAfter = 1900
	reader := &fakeWhisperReader{
		auction: auction,
		result: starknet.WhisperResult{
			AuctionID: auction.ID, HasWinner: true,
			WinnerBidHandle: "0xabc", WinnerCommitment: "0xdef",
			WinningBid: "200", SecondHighestBid: "150", ClearingPrice: "150",
			SettlementHash: auction.SettlementHash, SettledAt: 600,
		},
	}
	store := &fakeHistoricalRoundStore{}
	source := fakeSettlementSource{found: true, projection: SettlementProjection{
		AuctionID: auction.ID, HasWinner: true,
		WinnerGroupHandle: "0xabc", WinnerCommitment: "0xdef",
		WinningBid: "200", SecondHighestBid: "150", ClearingPrice: "150",
		FundedBidCount: auction.BidCount, SettlementHash: auction.SettlementHash,
		SettlementTransactionHash: "0xaaa", SettledAt: mustUnixTime(t, 600),
	}}
	backfiller, err := newHistoricalRoundBackfiller(
		store, reader, source, "SN_MAIN", "0x123",
	)
	if err != nil {
		t.Fatal(err)
	}

	if err := backfiller.Backfill(context.Background(), HistoricalRound{
		RoundID: 1, AuctionID: auction.ID,
	}); err != nil {
		t.Fatal(err)
	}
	if len(store.rounds) != 1 || len(store.settlements) != 1 {
		t.Fatalf("expected one historical round and outcome, got %+v %+v", store.rounds, store.settlements)
	}
	if store.rounds[0].MetadataHash != auction.MetadataHash ||
		store.settlements[0].SettlementTransactionHash != "0xaaa" {
		t.Fatalf("unexpected historical projection: %+v %+v", store.rounds[0], store.settlements[0])
	}
}

func TestHistoricalRoundBackfillerRejectsOpenAuctionBeforeWriting(t *testing.T) {
	store := &fakeHistoricalRoundStore{}
	backfiller, err := newHistoricalRoundBackfiller(
		store,
		&fakeWhisperReader{auction: whisperAuctionFixture(starknet.WhisperStatusPending)},
		fakeSettlementSource{},
		"SN_MAIN",
		"0x123",
	)
	if err != nil {
		t.Fatal(err)
	}

	err = backfiller.Backfill(context.Background(), HistoricalRound{RoundID: 1, AuctionID: 7})
	if err == nil || !strings.Contains(err.Error(), "not settled") {
		t.Fatalf("expected open auction rejection, got %v", err)
	}
	if len(store.rounds) != 0 || len(store.settlements) != 0 {
		t.Fatal("rejected historical auction must not be written")
	}
}

type fakeHistoricalRoundStore struct {
	rounds      []CanonicalRound
	settlements []SettlementProjection
}

func (s *fakeHistoricalRoundStore) RegisterRound(_ context.Context, round CanonicalRound) error {
	s.rounds = append(s.rounds, round)
	return nil
}

func (s *fakeHistoricalRoundStore) SaveSettlement(
	_ context.Context,
	_ string,
	projection SettlementProjection,
) error {
	s.settlements = append(s.settlements, projection)
	return nil
}

func mustUnixTime(t *testing.T, value uint64) time.Time {
	t.Helper()
	result, err := unixTime(value)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
