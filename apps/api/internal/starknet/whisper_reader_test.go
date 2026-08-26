package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWhisperReaderDecodesAuctionResultAndChainTime(t *testing.T) {
	auctionResponse := []string{
		"0x7", "0x111", "0x222", "0x333", "0x444",
		"0x0", "0x0", "0x0", "0x0", "0x0", "0x0", "0x0",
		"0x555", "0xde0b6b3a7640000", "0x20", "0x64", "0x6e", "0x78",
		"0x666", "0x777", "0x888", "0x999", "0xaaa", "0x3",
		"0x2", "0x2", "0xabc", "0x0",
	}
	resultResponse := []string{
		"0x7", "0x1", "0xbbb", "0xccc", "0x1bc16d674ec80000",
		"0x16345785d8a0000", "0x16345785d8a0000", "0xddd", "0xeee",
		"0xabc", "0x7a",
	}
	call := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		switch call {
		case 0:
			if request.Method != "starknet_call" {
				t.Fatalf("unexpected method %q", request.Method)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1, "result": auctionResponse,
			})
		case 1:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1, "result": resultResponse,
			})
		case 2:
			if request.Method != "starknet_getBlockWithTxHashes" {
				t.Fatalf("unexpected method %q", request.Method)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]any{"timestamp": 123},
			})
		default:
			t.Fatal("unexpected extra RPC call")
		}
		call++
	}))
	t.Cleanup(server.Close)

	reader := NewWhisperReader(server.URL)
	auction, err := reader.Auction(context.Background(), "0x123", 7)
	if err != nil {
		t.Fatal(err)
	}
	if auction.ID != 7 || auction.Creator != "0x111" ||
		auction.Schedule.Kind != WhisperScheduleAbsolute ||
		auction.FulfillmentKind != WhisperFulfillmentOffchain ||
		auction.FulfillmentStatus != WhisperFulfillmentStatusOffchain ||
		auction.AssetToken != "0x0" || auction.AssetTokenID != "0" ||
		auction.AssetAmount != "0" ||
		auction.ReservePrice != "1000000000000000000" || auction.MaxBids != 32 ||
		auction.SubmissionCount != 3 || auction.BidCount != 2 ||
		auction.Status != WhisperStatusSettled {
		t.Fatalf("unexpected auction: %+v", auction)
	}

	result, err := reader.Result(context.Background(), "0x123", 7)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasWinner || result.WinningBid != "2000000000000000000" ||
		result.ClearingPrice != "100000000000000000" || result.SettledAt != 122 {
		t.Fatalf("unexpected result: %+v", result)
	}

	timestamp, err := reader.ChainTimestamp(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if timestamp != 123 {
		t.Fatalf("expected chain timestamp 123, got %d", timestamp)
	}
}

func TestWhisperReaderDecodesPendingStartOnBidAuction(t *testing.T) {
	response := []string{
		"0x8", "0x111", "0x222", "0x333", "0x444",
		"0x0", "0x0", "0x0", "0x0", "0x0", "0x0", "0x0",
		"0x555", "0xde0b6b3a7640000", "0x20",
		"0x1", "0x3f480", "0x258", "0x708",
		"0x0", "0x0", "0x0", "0x0",
		"0x666", "0x777", "0x888", "0x999", "0xaaa",
		"0x0", "0x0", "0x1", "0x0", "0x0",
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": response,
		})
	}))
	t.Cleanup(server.Close)

	auction, err := NewWhisperReader(server.URL).Auction(context.Background(), "0x123", 8)
	if err != nil {
		t.Fatal(err)
	}
	if auction.Status != WhisperStatusPending ||
		auction.Schedule.Kind != WhisperScheduleStartOnBid ||
		auction.Schedule.BiddingDuration != 259200 ||
		auction.Schedule.AcceptanceDuration != 600 ||
		auction.Schedule.SettlementDuration != 1800 ||
		auction.StartedAt != 0 || auction.BiddingDeadline != 0 {
		t.Fatalf("unexpected pending auction: %+v", auction)
	}
}

func TestWhisperReaderRejectsUnsetAuction(t *testing.T) {
	response := []string{
		"0x7", "0x111", "0x222", "0x333", "0x444",
		"0x0", "0x0", "0x0", "0x0", "0x0", "0x0", "0x0",
		"0x555", "0x1", "0x2", "0x64", "0x6e", "0x78", "0x666", "0x777",
		"0x888", "0x999", "0xaaa", "0x0", "0x0", "0x0", "0x0", "0x0",
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": response,
		})
	}))
	t.Cleanup(server.Close)

	reader := NewWhisperReader(server.URL)
	if _, err := reader.Auction(context.Background(), "0x123", 7); err == nil {
		t.Fatal("expected unset status to be rejected")
	}
}
