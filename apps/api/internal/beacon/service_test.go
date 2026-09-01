package beacon

import (
	"context"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

func TestServiceReturnsNoRoundWithoutReadingRPC(t *testing.T) {
	reader := &fakeWhisperReader{}
	service := NewService(
		fakeRoundStore{err: ErrNoRound}, reader, "SN_SEPOLIA", defaultBiddingDurationSeconds,
	)
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
	service := NewService(
		fakeRoundStore{round: round}, reader, "SN_SEPOLIA", defaultBiddingDurationSeconds,
	)

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

func TestServiceReturnsCurrentControllerBillboard(t *testing.T) {
	round := canonicalRoundFixture()
	claimedAt := time.Unix(130, 0).UTC()
	round.ClaimedController = "0x777"
	round.ClaimedAt = &claimedAt
	round.ActiveArtworkID = "artwork-1"
	updatedAt := time.Unix(135, 0).UTC()
	auction := whisperAuctionFixture(starknet.WhisperStatusPending)
	auction.Schedule = starknet.WhisperSchedule{
		Kind:               starknet.WhisperScheduleStartOnBid,
		BiddingDuration:    defaultBiddingDurationSeconds,
		AcceptanceDuration: 10 * 60,
		SettlementDuration: 30 * 60,
	}
	auction.BiddingDeadline = 0
	auction.ForceRevealAfter = 0
	auction.AbortAfter = 0
	reader := &fakeWhisperReader{
		auction:        auction,
		chainTimestamp: 140,
	}
	service := NewService(
		fakeRoundStore{
			round: round,
			billboard: &BillboardRecord{
				ImageURL:       "https://images.example/beacon.webp",
				ThumbnailURL:   "https://images.example/beacon-thumb.webp",
				Description:    "A public campaign message.",
				DestinationURL: "https://example.com/campaign",
				UpdatedAt:      updatedAt,
			},
		},
		reader,
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Billboard == nil ||
		snapshot.Billboard.ImageURL != "https://images.example/beacon.webp" ||
		snapshot.Billboard.ThumbnailURL != "https://images.example/beacon-thumb.webp" ||
		snapshot.Billboard.Description != "A public campaign message." ||
		snapshot.Billboard.DestinationURL != "https://example.com/campaign" ||
		!snapshot.Billboard.UpdatedAt.Equal(updatedAt) {
		t.Fatalf("unexpected billboard snapshot: %+v", snapshot.Billboard)
	}
}

func TestServiceRejectsCanonicalMismatch(t *testing.T) {
	round := canonicalRoundFixture()
	reader := &fakeWhisperReader{
		auction:        whisperAuctionFixture(starknet.WhisperStatusBidding),
		chainTimestamp: 50,
	}
	reader.auction.MetadataHash = "0xdead"
	service := NewService(
		fakeRoundStore{round: round}, reader, "SN_SEPOLIA", defaultBiddingDurationSeconds,
	)

	_, err := service.Current(context.Background())
	if err == nil || !strings.Contains(err.Error(), "metadata hash mismatch") {
		t.Fatalf("expected canonical mismatch, got %v", err)
	}
}

func TestServiceReturnsPendingRoundWithContinuousController(t *testing.T) {
	round := canonicalRoundFixture()
	claimedAt := time.Unix(80, 0).UTC()
	round.ClaimedController = "0x777"
	round.ClaimedAt = &claimedAt
	auction := whisperAuctionFixture(starknet.WhisperStatusPending)
	auction.Schedule = starknet.WhisperSchedule{
		Kind:               starknet.WhisperScheduleStartOnBid,
		BiddingDuration:    3 * 24 * 60 * 60,
		AcceptanceDuration: 10 * 60,
		SettlementDuration: 30 * 60,
	}
	auction.BiddingDeadline = 0
	auction.ForceRevealAfter = 0
	auction.AbortAfter = 0
	service := NewService(
		fakeRoundStore{round: round},
		&fakeWhisperReader{auction: auction, chainTimestamp: 100},
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Phase != PhasePending || snapshot.Round == nil ||
		snapshot.Round.StartedAt != nil || snapshot.Round.BiddingDeadline != nil ||
		snapshot.Round.Schedule.BiddingDurationSeconds != 259200 ||
		snapshot.Round.WinnerPayloadDomain != "0x444" ||
		snapshot.Round.VaultAddress != "0x555" ||
		snapshot.Round.RevealPublicKey != "0x777" ||
		snapshot.Controller == nil || snapshot.Controller.Address != "0x777" {
		t.Fatalf("unexpected pending snapshot: %+v", snapshot)
	}
}

func TestServiceRejectsOnchainFulfillment(t *testing.T) {
	round := canonicalRoundFixture()
	reader := &fakeWhisperReader{
		auction:        whisperAuctionFixture(starknet.WhisperStatusBidding),
		chainTimestamp: 50,
	}
	reader.auction.FulfillmentKind = starknet.WhisperFulfillmentERC721
	reader.auction.FulfillmentStatus = starknet.WhisperFulfillmentStatusEscrowed
	reader.auction.AssetToken = "0x999"
	reader.auction.AssetTokenID = "7"
	reader.auction.AssetAmount = "1"
	service := NewService(
		fakeRoundStore{round: round}, reader, "SN_SEPOLIA", defaultBiddingDurationSeconds,
	)

	_, err := service.Current(context.Background())
	if err == nil || !strings.Contains(err.Error(), "fulfillment must be offchain") {
		t.Fatalf("expected offchain fulfillment rejection, got %v", err)
	}
}

func TestServiceAcceptsConfiguredFiveMinuteBiddingWindow(t *testing.T) {
	round := canonicalRoundFixture()
	auction := whisperAuctionFixture(starknet.WhisperStatusPending)
	auction.Schedule = starknet.WhisperSchedule{
		Kind:               starknet.WhisperScheduleStartOnBid,
		BiddingDuration:    5 * 60,
		AcceptanceDuration: 10 * 60,
		SettlementDuration: 30 * 60,
	}
	auction.BiddingDeadline = 0
	auction.ForceRevealAfter = 0
	auction.AbortAfter = 0
	service := NewService(
		fakeRoundStore{round: round},
		&fakeWhisperReader{auction: auction, chainTimestamp: 100},
		"SN_SEPOLIA",
		5*60,
	)

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Round == nil || snapshot.Round.Schedule.BiddingDurationSeconds != 5*60 {
		t.Fatalf("unexpected five-minute snapshot: %+v", snapshot)
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
	round     CanonicalRound
	billboard *BillboardRecord
	err       error
}

func (s fakeRoundStore) Current(context.Context, string) (CanonicalRound, error) {
	return s.round, s.err
}

func (s fakeRoundStore) Controller(context.Context, string) (ControllerRecord, error) {
	if s.round.ClaimedController == "" || s.round.ClaimedAt == nil {
		return ControllerRecord{}, ErrNoController
	}
	return ControllerRecord{
		Address: s.round.ClaimedController, ClaimedAt: *s.round.ClaimedAt,
		StartsAt: s.round.BillboardStartsAt, ActiveArtworkID: s.round.ActiveArtworkID,
	}, nil
}

func (s fakeRoundStore) Billboard(
	context.Context,
	string,
	string,
) (BillboardRecord, error) {
	if s.billboard == nil {
		return BillboardRecord{}, ErrNoBillboard
	}
	return *s.billboard, nil
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
		FulfillmentKind:     starknet.WhisperFulfillmentOffchain,
		FulfillmentStatus:   starknet.WhisperFulfillmentStatusOffchain,
		AssetToken:          "0x0",
		AssetTokenID:        "0",
		AssetAmount:         "0",
		WinnerPayloadDomain: "0x444", ReservePrice: "100", MaxBids: 16,
		Schedule: starknet.WhisperSchedule{
			Kind:                    starknet.WhisperScheduleAbsolute,
			AbsoluteBiddingDeadline: 100, AbsoluteForceRevealAfter: 110,
			AbsoluteAbortAfter: 120,
		},
		BiddingDeadline: 100, ForceRevealAfter: 110, AbortAfter: 120,
		VaultAddress: "0x555", RevealPublicKey: "0x777",
		SubmissionCount: 3, BidCount: 2,
		Status: status, SettlementHash: "0x999",
	}
}
