package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBeaconReaderDecodesStatusAndAuction(t *testing.T) {
	bidding := []string{
		"0x7", "0x2", "0x4718", "0x999", "0x64", "0x3e8", "0x3f480", "0x12c",
		"0x3e8", "0x7d0", "0xabc", "0x78", "0x2", "0x0",
	}
	responses := [][]string{
		append(append([]string{"0x1", "0x7"}, bidding...), "0x84"),
		{
			"0x6", "0x3", "0x4718", "0x999", "0x64", "0x3e8", "0x3f480", "0x12c",
			"0x3e8", "0x7d0", "0xdef", "0x96", "0x5", "0x7da",
		},
	}
	var entrypoints []string
	server := beaconRPCServer(t, responses, &entrypoints)
	reader, err := NewBeaconReader(server.URL, "0x0beac0")
	if err != nil {
		t.Fatal(err)
	}
	if reader.Address() != "0xbeac0" {
		t.Fatalf("expected normalized address, got %s", reader.Address())
	}

	status, err := reader.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	auction := status.Auction
	if !status.Initialized || status.FirstRoundID != 7 || status.MinimumBid != "132" ||
		auction.RoundID != 7 || auction.Status != BeaconAuctionBidding ||
		auction.PaymentToken != "0x4718" || auction.ProceedsRecipient != "0x999" ||
		auction.ReservePrice != "100" || auction.MinRaiseBps != 1000 ||
		auction.BiddingDurationSeconds != 259200 || auction.ExtensionSeconds != 300 ||
		auction.StartedAt != 1000 || auction.EndsAt != 2000 || auction.Leader != "0xabc" ||
		auction.LeadingBid != "120" || auction.BidCount != 2 || auction.SettledAt != 0 {
		t.Fatalf("unexpected status: %+v", status)
	}

	settled, err := reader.Auction(context.Background(), 6)
	if err != nil {
		t.Fatal(err)
	}
	if settled.RoundID != 6 || settled.Status != BeaconAuctionSettled || settled.Leader != "0xdef" ||
		settled.LeadingBid != "150" || settled.BidCount != 5 || settled.SettledAt != 2010 {
		t.Fatalf("unexpected settled auction: %+v", settled)
	}
	if len(entrypoints) != 2 {
		t.Fatalf("unexpected calls: %v", entrypoints)
	}
}

func TestBeaconReaderReportsUninitializedWorld(t *testing.T) {
	empty := make([]string, beaconAuctionFelts+3)
	for index := range empty {
		empty[index] = "0x0"
	}
	var entrypoints []string
	reader, err := NewBeaconReader(beaconRPCServer(t, [][]string{empty}, &entrypoints).URL, "0x1")
	if err != nil {
		t.Fatal(err)
	}
	status, err := reader.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if status.Initialized || status.Auction.RoundID != 0 {
		t.Fatalf("unexpected status: %+v", status)
	}
}

func TestBeaconReaderRejectsMalformedAuctions(t *testing.T) {
	valid := []string{
		"0x6", "0x3", "0x4718", "0x999", "0x64", "0x3e8", "0x3f480", "0x12c",
		"0x3e8", "0x7d0", "0xdef", "0x96", "0x5", "0x7da",
	}
	for name, mutate := range map[string]func([]string) []string{
		"short":          func(result []string) []string { return result[:13] },
		"unknown status": func(result []string) []string { result[1] = "0x4"; return result },
		"raise overflow": func(result []string) []string { result[5] = "0x10000"; return result },
	} {
		t.Run(name, func(t *testing.T) {
			response := mutate(append([]string(nil), valid...))
			var entrypoints []string
			reader, err := NewBeaconReader(beaconRPCServer(t, [][]string{response}, &entrypoints).URL, "0x1")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := reader.Auction(context.Background(), 6); err == nil {
				t.Fatal("expected malformed auction to fail")
			}
		})
	}
}

func beaconRPCServer(t *testing.T, responses [][]string, entrypoints *[]string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Params struct {
				Request struct {
					EntryPointSelector string `json:"entry_point_selector"`
				} `json:"request"`
			} `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&request)
		if len(*entrypoints) >= len(responses) {
			t.Error("unexpected extra RPC call")
			return
		}
		result := responses[len(*entrypoints)]
		*entrypoints = append(*entrypoints, request.Params.Request.EntryPointSelector)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	}))
	t.Cleanup(server.Close)
	return server
}
