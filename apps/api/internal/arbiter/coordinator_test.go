package arbiter

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/starknet"
)

func TestOperatorRoundRestarterBootstrapsOnceAfterReadback(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "arbiter.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	createCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/v1/config":
			_ = json.NewEncoder(response).Encode(map[string]string{
				"chainId": "0x1", "poolAddress": "0x2", "whisperAddress": "0x123",
				"vaultAddress": "0x555", "vaultPublicKey": "0x6", "revealPublicKey": "0x7",
			})
		case "/v1/coordinator/auctions":
			if request.Header.Get("Authorization") != "Bearer "+"a-string-that-is-at-least-32-bytes" {
				response.WriteHeader(http.StatusUnauthorized)
				return
			}
			createCalls++
			response.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(response).Encode(map[string]string{
				"requestId": "stakewars:SN_SEPOLIA:round:1", "auctionId": "0x2",
				"transactionHash": "0x999", "creator": "0xabc",
			})
		default:
			response.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	reader := &fakeWhisperReader{auction: starknet.WhisperAuction{
		ID: 2, Creator: "0xabc", PaymentToken: "0x222",
		MetadataHash:      roundMetadataHash("SN_SEPOLIA", 1, 0),
		FulfillmentKind:   starknet.WhisperFulfillmentOffchain,
		FulfillmentStatus: starknet.WhisperFulfillmentStatusOffchain,
		AssetToken:        "0x0", AssetTokenID: "0", AssetAmount: "0",
		WinnerPayloadDomain: "0x444", ReservePrice: "100", MaxBids: 16,
		Schedule: starknet.WhisperSchedule{
			Kind: starknet.WhisperScheduleStartOnBid, BiddingDuration: 300,
			AcceptanceDuration: 180, SettlementDuration: 1320,
		},
		VaultAddress: "0x555", Status: starknet.WhisperStatusPending,
	}}
	store := NewStore(db)
	restarter, err := NewOperatorRoundRestarter(
		store, reader, NewOperatorCoordinatorClient(server.URL, "a-string-that-is-at-least-32-bytes"),
		CoordinatorConfig{
			Network: "SN_SEPOLIA", PaymentToken: "0x222", ReservePrice: "100",
			MaxBids: 16, WinnerPayloadDomain: "0x444", BiddingDurationSeconds: 300,
			AcceptanceDurationSeconds: 180, SettlementDurationSeconds: 1320,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if err := restarter.Bootstrap(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := restarter.Bootstrap(context.Background()); err != nil {
		t.Fatal(err)
	}
	if createCalls != 1 {
		t.Fatalf("expected one create call, got %d", createCalls)
	}
	round, err := store.Current(context.Background(), "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	if round.RoundID != 1 || round.AuctionID != 2 || round.ExpectedCreator != "0xabc" {
		t.Fatalf("unexpected registered round: %+v", round)
	}
}
