package beacon

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"stakewars.com/api/internal/starknet"
)

const testAuctionAddress = "0xbeac0"

func TestServiceWithoutBeaconSystemServesPreservedControl(t *testing.T) {
	store, db := openStore(t)
	seedWhisperController(t, db, 6, "0x0666")
	seedArtwork(t, db, 6, "0x666", "art-6")
	service := NewService(store, nil, NewSettlementProjector(store, nil, "SN_SEPOLIA"), "SN_SEPOLIA", "")

	snapshot, err := service.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Phase != PhaseNone || snapshot.Round != nil {
		t.Fatalf("unexpected round: %+v", snapshot)
	}
	if snapshot.Controller == nil || snapshot.Controller.Address != "0x666" ||
		snapshot.Controller.RoundID != 6 || !snapshot.Controller.HasPublished {
		t.Fatalf("unexpected controller: %+v", snapshot.Controller)
	}
	if snapshot.Billboard == nil || snapshot.Billboard.ImageURL != "https://assets.test/art-6.webp" {
		t.Fatalf("unexpected billboard: %+v", snapshot.Billboard)
	}
}

func TestServiceReportsPendingRound(t *testing.T) {
	store, _ := openStore(t)
	reader := newFakeBeaconReader(7, 7, pendingAuction(7))
	snapshot, err := newTestService(store, reader).Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	round := snapshot.Round
	if snapshot.Phase != PhasePending || round == nil || round.ID != 7 ||
		round.AuctionAddress != testAuctionAddress || round.ReservePrice != "100" ||
		round.MinimumBid != "100" || round.MinRaiseBps != 1000 ||
		round.BiddingDurationSeconds != 259200 || round.ExtensionSeconds != 300 ||
		round.Leader != nil || round.StartedAt != nil || round.EndsAt != nil ||
		round.BidCount != 0 || snapshot.Controller != nil {
		t.Fatalf("unexpected pending snapshot: %+v %+v", snapshot, round)
	}
	if !snapshot.ObservedAt.Equal(time.Unix(1_000, 0).UTC()) {
		t.Fatalf("snapshot must use chain time, got %s", snapshot.ObservedAt)
	}
}

func TestServiceSwitchesToSettlingAtTheChainDeadline(t *testing.T) {
	for _, test := range []struct {
		chainTime uint64
		phase     Phase
	}{
		{chainTime: 1_999, phase: PhaseBidding},
		{chainTime: 2_000, phase: PhaseSettling},
	} {
		store, _ := openStore(t)
		reader := newFakeBeaconReader(7, 7, biddingAuction(7, "0x0abc", "120", 1_000, 2_000))
		reader.timestamp = test.chainTime
		reader.status.MinimumBid = "132"
		snapshot, err := newTestService(store, reader).Current(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		round := snapshot.Round
		if snapshot.Phase != test.phase || round.Leader == nil || *round.Leader != "0xabc" ||
			round.LeadingBid != "120" || round.MinimumBid != "132" || round.BidCount != 2 ||
			round.StartedAt.Unix() != 1_000 || round.EndsAt.Unix() != 2_000 {
			t.Fatalf("unexpected snapshot at %d: %+v %+v", test.chainTime, snapshot, round)
		}
	}
}

func TestServiceProjectsSettlementsBeforeReportingControl(t *testing.T) {
	store, db := openStore(t)
	seedWhisperController(t, db, 6, "0x666")
	seedArtwork(t, db, 6, "0x666", "art-6")
	reader := newFakeBeaconReader(9, 7, pendingAuction(9))
	reader.auctions[7] = settledAuction(7, "0x777", "150")
	reader.auctions[8] = settledAuction(8, "0x888", "300")

	snapshot, err := newTestService(store, reader).Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Controller == nil || snapshot.Controller.Address != "0x888" ||
		snapshot.Controller.RoundID != 8 || snapshot.Controller.HasPublished ||
		!snapshot.Controller.ClaimedAt.Equal(time.Unix(8_500, 0).UTC()) {
		t.Fatalf("unexpected controller: %+v", snapshot.Controller)
	}
	if snapshot.Billboard == nil || snapshot.Billboard.ImageURL != "https://assets.test/art-6.webp" {
		t.Fatalf("prior transmission must stay active: %+v", snapshot.Billboard)
	}
	history, err := store.History(context.Background(), "SN_SEPOLIA", 10, nil)
	if err != nil || len(history) != 3 || history[0].WinningBid != "300" || history[1].RoundID != 7 {
		t.Fatalf("unexpected history: %+v %v", history, err)
	}
}

func TestServiceRejectsInconsistentChainState(t *testing.T) {
	for name, mutate := range map[string]func(*fakeBeaconReader){
		"pending round with a leader": func(reader *fakeBeaconReader) {
			reader.status.Auction.Leader = "0xabc"
		},
		"bidding round without a leader": func(reader *fakeBeaconReader) {
			reader.status.Auction = biddingAuction(7, "0x0", "120", 1_000, 2_000)
		},
		"settled current round": func(reader *fakeBeaconReader) {
			reader.status.Auction = settledAuction(7, "0xabc", "120")
		},
		"first round overlaps Whisper history": func(reader *fakeBeaconReader) {
			reader.status.FirstRoundID = 6
		},
		"unsettled predecessor": func(reader *fakeBeaconReader) {
			reader.status.Auction = pendingAuction(8)
			reader.auctions[7] = biddingAuction(7, "0xabc", "120", 1_000, 2_000)
		},
		"predecessor below reserve": func(reader *fakeBeaconReader) {
			reader.status.Auction = pendingAuction(8)
			reader.auctions[7] = settledAuction(7, "0xabc", "99")
		},
		"chain unavailable": func(reader *fakeBeaconReader) {
			reader.statusErr = errors.New("offline")
		},
	} {
		t.Run(name, func(t *testing.T) {
			store, db := openStore(t)
			seedWhisperController(t, db, 6, "0x666")
			reader := newFakeBeaconReader(7, 7, pendingAuction(7))
			mutate(reader)
			if _, err := newTestService(store, reader).Current(context.Background()); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestProjectorBoundsEachPass(t *testing.T) {
	store, _ := openStore(t)
	current := uint64(maxProjectedRoundsPerSync + 3)
	reader := newFakeBeaconReader(current, 1, pendingAuction(current))
	for roundID := uint64(1); roundID < current; roundID++ {
		reader.auctions[roundID] = settledAuction(roundID, "0xabc", "100")
	}
	projector := NewSettlementProjector(store, reader, "SN_SEPOLIA")
	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, projected, err := store.ProjectionCursor(context.Background(), "SN_SEPOLIA")
	if err != nil || projected != maxProjectedRoundsPerSync {
		t.Fatalf("projected %d rounds, err %v", projected, err)
	}
	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, projected, _ = store.ProjectionCursor(context.Background(), "SN_SEPOLIA")
	if projected != current-1 {
		t.Fatalf("expected catch-up to %d, got %d", current-1, projected)
	}
}

func TestControllerSourceFailsClosedWhenChainIsUnavailable(t *testing.T) {
	store, db := openStore(t)
	seedWhisperController(t, db, 6, "0x666")
	reader := newFakeBeaconReader(7, 7, pendingAuction(7))
	reader.statusErr = errors.New("offline")
	source := NewControllerSource(store, NewSettlementProjector(store, reader, "SN_SEPOLIA"))
	if _, _, _, err := source.CurrentController(context.Background(), "SN_SEPOLIA"); err == nil ||
		!strings.Contains(err.Error(), "offline") {
		t.Fatalf("expected chain failure, got %v", err)
	}
	reader.statusErr = nil
	roundID, address, _, err := source.CurrentController(context.Background(), "SN_SEPOLIA")
	if err != nil || roundID != 6 || address != "0x666" {
		t.Fatalf("unexpected controller %d %q %v", roundID, address, err)
	}
}

func newTestService(store *Store, reader *fakeBeaconReader) *Service {
	return NewService(
		store, reader, NewSettlementProjector(store, reader, "SN_SEPOLIA"),
		"SN_SEPOLIA", testAuctionAddress,
	)
}

type fakeBeaconReader struct {
	status    starknet.BeaconStatus
	auctions  map[uint64]starknet.BeaconAuction
	timestamp uint64
	statusErr error
}

func newFakeBeaconReader(
	currentRoundID, firstRoundID uint64,
	current starknet.BeaconAuction,
) *fakeBeaconReader {
	current.RoundID = currentRoundID
	return &fakeBeaconReader{
		status: starknet.BeaconStatus{
			Initialized: true, FirstRoundID: firstRoundID, Auction: current,
			MinimumBid: current.ReservePrice,
		},
		auctions:  make(map[uint64]starknet.BeaconAuction),
		timestamp: 1_000,
	}
}

func (r *fakeBeaconReader) Status(context.Context) (starknet.BeaconStatus, error) {
	return r.status, r.statusErr
}

func (r *fakeBeaconReader) Auction(_ context.Context, roundID uint64) (starknet.BeaconAuction, error) {
	auction, ok := r.auctions[roundID]
	if !ok {
		return starknet.BeaconAuction{}, errors.New("beacon round not found")
	}
	return auction, nil
}

func (r *fakeBeaconReader) ChainTimestamp(context.Context) (uint64, error) {
	return r.timestamp, nil
}

func pendingAuction(roundID uint64) starknet.BeaconAuction {
	return starknet.BeaconAuction{
		RoundID: roundID, Status: starknet.BeaconAuctionPending,
		PaymentToken: "0x4718", ProceedsRecipient: "0x999", ReservePrice: "100",
		MinRaiseBps: 1000, BiddingDurationSeconds: 259200, ExtensionSeconds: 300,
		Leader: "0x0", LeadingBid: "0",
	}
}

func biddingAuction(
	roundID uint64,
	leader, leadingBid string,
	startedAt, endsAt uint64,
) starknet.BeaconAuction {
	auction := pendingAuction(roundID)
	auction.Status = starknet.BeaconAuctionBidding
	auction.Leader, auction.LeadingBid = leader, leadingBid
	auction.StartedAt, auction.EndsAt, auction.BidCount = startedAt, endsAt, 2
	return auction
}

func settledAuction(roundID uint64, winner, winningBid string) starknet.BeaconAuction {
	auction := biddingAuction(roundID, winner, winningBid, roundID*1_000, roundID*1_000+400)
	auction.Status = starknet.BeaconAuctionSettled
	auction.SettledAt = roundID*1_000 + 500
	return auction
}
