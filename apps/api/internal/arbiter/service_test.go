package arbiter

import (
	"context"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

func TestServiceReturnsNoRoundWithoutReadingRPC(t *testing.T) {
	reader := &fakeWhisperReader{}
	service := NewService(fakeRoundStore{err: ErrNoRound}, reader, "SN_SEPOLIA")
	service.now = func() time.Time { return time.Unix(25, 0) }

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Phase != PhaseNone || snapshot.Round != nil ||
		snapshot.ObservedAt.Unix() != 25 {
		t.Fatalf("unexpected no-round snapshot: %+v", snapshot)
	}
	if reader.auctionCalls != 0 {
		t.Fatal("no-round response should not read Whisper")
	}
}

func TestServiceReturnsVerifiedSettledRound(t *testing.T) {
	round := canonicalRoundFixture()
	claimedAt := time.Unix(130, 0).UTC()
	round.ClaimedController = "0x777"
	round.ClaimedAt = &claimedAt
	reader := &fakeWhisperReader{
		auction: whisperAuctionFixture(starknet.WhisperStatusSettled),
		result: starknet.WhisperResult{
			AuctionID: 7, HasWinner: true, WinnerCommitment: "0xabc",
			WinningBid: "200", SecondHighestBid: "150", ClearingPrice: "150",
			SettlementHash: "0x999", SettledAt: 125,
		},
		chainTimestamp: 140,
	}
	service := NewService(fakeRoundStore{round: round}, reader, "SN_SEPOLIA")

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Phase != PhaseSettled || snapshot.Round == nil ||
		snapshot.Round.Result == nil || !snapshot.Round.Result.HasWinner ||
		snapshot.Controller == nil || snapshot.Controller.Address != "0x777" ||
		snapshot.ObservedAt.Unix() != 140 {
		t.Fatalf("unexpected settled snapshot: %+v", snapshot)
	}
}

func TestServiceRejectsCanonicalMismatch(t *testing.T) {
	round := canonicalRoundFixture()
	reader := &fakeWhisperReader{
		auction:        whisperAuctionFixture(starknet.WhisperStatusBidding),
		chainTimestamp: 50,
	}
	reader.auction.MetadataHash = "0xdead"
	service := NewService(fakeRoundStore{round: round}, reader, "SN_SEPOLIA")

	_, err := service.Current(context.Background())
	if err == nil || !strings.Contains(err.Error(), "metadata hash mismatch") {
		t.Fatalf("expected canonical mismatch, got %v", err)
	}
}

func TestLifecyclePhaseUsesChainTime(t *testing.T) {
	auction := whisperAuctionFixture(starknet.WhisperStatusBidding)
	tests := []struct {
		at   uint64
		want Phase
	}{
		{at: 99, want: PhaseBidding},
		{at: 100, want: PhaseAcceptance},
		{at: 109, want: PhaseAcceptance},
		{at: 110, want: PhaseSettling},
		{at: 119, want: PhaseSettling},
		{at: 120, want: PhaseRecovery},
	}
	for _, test := range tests {
		if got := lifecyclePhase(auction, test.at); got != test.want {
			t.Fatalf("at %d expected %s, got %s", test.at, test.want, got)
		}
	}
	auction.Status = starknet.WhisperStatusAborted
	if got := lifecyclePhase(auction, 50); got != PhaseAborted {
		t.Fatalf("expected aborted, got %s", got)
	}
}

type fakeRoundStore struct {
	round CanonicalRound
	err   error
}

func (s fakeRoundStore) Current(context.Context, string) (CanonicalRound, error) {
	return s.round, s.err
}

type fakeWhisperReader struct {
	auction        starknet.WhisperAuction
	result         starknet.WhisperResult
	chainTimestamp uint64
	err            error
	auctionCalls   int
}

func (r *fakeWhisperReader) Auction(
	context.Context,
	string,
	uint64,
) (starknet.WhisperAuction, error) {
	r.auctionCalls++
	return r.auction, r.err
}

func (r *fakeWhisperReader) Result(
	context.Context,
	string,
	uint64,
) (starknet.WhisperResult, error) {
	return r.result, r.err
}

func (r *fakeWhisperReader) ChainTimestamp(context.Context) (uint64, error) {
	return r.chainTimestamp, r.err
}

func canonicalRoundFixture() CanonicalRound {
	return CanonicalRound{
		Network: "SN_SEPOLIA", RoundID: 4, WhisperAddress: "0x123", AuctionID: 7,
		ExpectedCreator: "0x111", PaymentToken: "0x222", MetadataHash: "0x333",
		WinnerPayloadDomain: "0x444", VaultAddress: "0x555",
	}
}

func whisperAuctionFixture(status starknet.WhisperStatus) starknet.WhisperAuction {
	return starknet.WhisperAuction{
		ID: 7, Creator: "0x111", PaymentToken: "0x222", MetadataHash: "0x333",
		WinnerPayloadDomain: "0x444", ReservePrice: "100", MaxBids: 16,
		BiddingDeadline: 100, ForceRevealAfter: 110, AbortAfter: 120,
		VaultAddress: "0x555", SubmissionCount: 3, BidCount: 2,
		Status: status, SettlementHash: "0x999",
	}
}
