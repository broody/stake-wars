package beacon

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func TestRoundLabelRepairerPreservesMissingAuctionAndCorrectsCurrentLabel(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "stakewars.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	store := NewStore(db)
	whisperAddress := "0x123"
	auction2 := pendingRepairAuction(2, 300, "0x202")
	auction3 := pendingRepairAuction(3, 300, "0x303")
	auction4 := pendingRepairAuction(4, 259200, "0x404")
	round2 := canonicalRoundFromAuction("SN_MAIN", 2, whisperAddress, auction2)
	if err := store.RegisterRound(ctx, round2); err != nil {
		t.Fatal(err)
	}
	if err := store.RegisterRound(
		ctx,
		canonicalRoundFromAuction("SN_MAIN", 3, whisperAddress, auction4),
	); err != nil {
		t.Fatal(err)
	}
	if _, err := store.PrepareCycle(ctx, round2, 3, auction3.MetadataHash); err != nil {
		t.Fatal(err)
	}
	if err := store.MarkCycleRegistered(ctx, "SN_MAIN", 2); err != nil {
		t.Fatal(err)
	}

	reader := &repairWhisperReader{auctions: map[uint64]starknet.WhisperAuction{
		3: auction3,
		4: auction4,
	}}
	repairer, err := NewRoundLabelRepairer(store, reader, "SN_MAIN", whisperAddress)
	if err != nil {
		t.Fatal(err)
	}
	spec := RoundLabelRepair{
		ExistingRoundID: 3, ExistingAuctionID: 4,
		CorrectedRoundID: 4, MissingAuctionID: 3,
	}
	if err := repairer.Repair(ctx, spec); err != nil {
		t.Fatal(err)
	}
	// The repair must be safe to retry after an interrupted operational run.
	if err := repairer.Repair(ctx, spec); err != nil {
		t.Fatalf("idempotent repair failed: %v", err)
	}

	round3, err := store.round(ctx, "SN_MAIN", 3)
	if err != nil {
		t.Fatal(err)
	}
	round4, err := store.round(ctx, "SN_MAIN", 4)
	if err != nil {
		t.Fatal(err)
	}
	if round3.AuctionID != 3 || round3.BiddingDurationSeconds != 300 {
		t.Fatalf("round 3 was not restored: %+v", round3)
	}
	if round4.AuctionID != 4 || round4.BiddingDurationSeconds != 259200 {
		t.Fatalf("round 4 was not corrected: %+v", round4)
	}
	current, err := store.Current(ctx, "SN_MAIN")
	if err != nil {
		t.Fatal(err)
	}
	if current.RoundID != 4 || current.AuctionID != 4 {
		t.Fatalf("unexpected current round after repair: %+v", current)
	}
	var successor uint64
	var state string
	if err := db.QueryRowContext(ctx, `
		SELECT successor_round_id, state FROM beacon_cycle_jobs
		WHERE network = 'SN_MAIN' AND predecessor_round_id = 2
	`).Scan(&successor, &state); err != nil {
		t.Fatal(err)
	}
	if successor != 3 || state != "registered" {
		t.Fatalf("historical cycle intent changed: successor=%d state=%s", successor, state)
	}
}

func pendingRepairAuction(
	id uint64,
	biddingDuration uint64,
	metadataHash string,
) starknet.WhisperAuction {
	return starknet.WhisperAuction{
		ID: id, Creator: "0x111", PaymentToken: "0x222", MetadataHash: metadataHash,
		FulfillmentKind:     starknet.WhisperFulfillmentOffchain,
		FulfillmentStatus:   starknet.WhisperFulfillmentStatusOffchain,
		AssetToken:          "0x0",
		AssetTokenID:        "0",
		AssetAmount:         "0",
		WinnerPayloadDomain: "0x444", ReservePrice: "100", MaxBids: 16,
		Schedule: starknet.WhisperSchedule{
			Kind:            starknet.WhisperScheduleStartOnBid,
			BiddingDuration: biddingDuration, AcceptanceDuration: 180,
			SettlementDuration: 1320,
		},
		VaultAddress: "0x555", RevealPublicKey: "0x777",
		Status: starknet.WhisperStatusPending, SettlementHash: "0x0",
	}
}

type repairWhisperReader struct {
	auctions map[uint64]starknet.WhisperAuction
}

func (r *repairWhisperReader) Auction(
	_ context.Context,
	_ string,
	auctionID uint64,
) (starknet.WhisperAuction, error) {
	auction, ok := r.auctions[auctionID]
	if !ok {
		return starknet.WhisperAuction{}, fmt.Errorf("auction %d not found", auctionID)
	}
	return auction, nil
}

func (r *repairWhisperReader) Result(
	context.Context,
	string,
	uint64,
) (starknet.WhisperResult, error) {
	return starknet.WhisperResult{}, fmt.Errorf("result is unavailable")
}

func (r *repairWhisperReader) ChainTimestamp(context.Context) (uint64, error) {
	return 0, nil
}
