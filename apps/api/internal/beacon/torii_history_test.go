package beacon

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"stakewars.com/api/internal/starknet"
)

func TestParseToriiSettlementValidatesIndexedEvent(t *testing.T) {
	projection, err := parseToriiSettlement(settlementEventFixture(), canonicalRoundFixture())
	if err != nil {
		t.Fatal(err)
	}
	if projection.AuctionID != 7 || !projection.HasWinner ||
		projection.WinnerGroupHandle != "0xabc" ||
		projection.WinnerCommitment != "0xdef" ||
		projection.WinningBid != "200" || projection.SecondHighestBid != "150" ||
		projection.ClearingPrice != "150" || projection.FundedBidCount != 2 ||
		projection.SettlementHash != "0x999" ||
		projection.SettlementTransactionHash != "0xaaa" ||
		projection.SettledAt.Unix() != 125 {
		t.Fatalf("unexpected settlement projection: %+v", projection)
	}

	malformed := settlementEventFixture()
	malformed.Data = malformed.Data[:13]
	if _, err := parseToriiSettlement(malformed, canonicalRoundFixture()); err == nil ||
		!strings.Contains(err.Error(), "malformed") {
		t.Fatalf("expected malformed event rejection, got %v", err)
	}

	wrongContract := settlementEventFixture()
	wrongContract.ID = strings.Replace(wrongContract.ID, ":0x0123:", ":0x456:", 1)
	if _, err := parseToriiSettlement(wrongContract, canonicalRoundFixture()); err == nil ||
		!strings.Contains(err.Error(), "unexpected contract") {
		t.Fatalf("expected contract rejection, got %v", err)
	}
}

func TestToriiSettlementSourceRejectsDuplicateEvents(t *testing.T) {
	event := settlementEventFixture()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/graphql" {
			t.Fatalf("unexpected Torii path %q", r.URL.Path)
		}
		var request struct {
			Variables struct {
				Keys []string `json:"keys"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if len(request.Variables.Keys) != 2 || request.Variables.Keys[1] != "0x7" {
			t.Fatalf("unexpected Torii keys: %+v", request.Variables.Keys)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"events": map[string]any{
					"edges": []any{
						map[string]any{"node": event},
						map[string]any{"node": event},
					},
					"pageInfo": map[string]any{"hasNextPage": false},
				},
			},
		})
	}))
	defer upstream.Close()

	source, err := NewToriiSettlementSource(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = source.Settlement(context.Background(), canonicalRoundFixture())
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("expected duplicate rejection, got %v", err)
	}
}

func TestSettlementProjectorConfirmsRPCBeforePersisting(t *testing.T) {
	round := canonicalRoundFixture()
	store := &fakeSettlementProjectionStore{rounds: []CanonicalRound{round}}
	projection, err := parseToriiSettlement(settlementEventFixture(), round)
	if err != nil {
		t.Fatal(err)
	}
	reader := &fakeWhisperReader{
		auction: whisperAuctionFixture(starknet.WhisperStatusSettled),
		result: starknet.WhisperResult{
			AuctionID: 7, HasWinner: true, WinnerBidHandle: "0xabc",
			WinnerCommitment: "0xdef", WinningBid: "200",
			SecondHighestBid: "150", ClearingPrice: "150",
			SettlementHash: "0x999", SettledAt: 125,
		},
	}
	projector := NewSettlementProjector(
		store,
		fakeSettlementSource{projection: projection, found: true},
		reader,
		"SN_SEPOLIA",
		defaultBiddingDurationSeconds,
	)
	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.saved) != 1 || store.saved[0].RoundID != round.RoundID ||
		store.saved[0].WhisperAddress != round.WhisperAddress {
		t.Fatalf("unexpected saved settlement: %+v", store.saved)
	}

	reader.result.WinningBid = "201"
	store.saved = nil
	if err := projector.Reconcile(context.Background()); err == nil ||
		!strings.Contains(err.Error(), "winning bid mismatch") {
		t.Fatalf("expected RPC mismatch rejection, got %v", err)
	}
}

type fakeSettlementProjectionStore struct {
	rounds []CanonicalRound
	saved  []SettlementProjection
}

func (s *fakeSettlementProjectionStore) UnprojectedRounds(
	context.Context,
	string,
) ([]CanonicalRound, error) {
	return append([]CanonicalRound(nil), s.rounds...), nil
}

func (s *fakeSettlementProjectionStore) SaveSettlement(
	_ context.Context,
	_ string,
	projection SettlementProjection,
) error {
	s.saved = append(s.saved, projection)
	return nil
}

type fakeSettlementSource struct {
	projection SettlementProjection
	found      bool
}

func (s fakeSettlementSource) Settlement(
	context.Context,
	CanonicalRound,
) (SettlementProjection, bool, error) {
	return s.projection, s.found, nil
}

func settlementEventFixture() toriiRawEvent {
	return toriiRawEvent{
		ID:              "0x20:0x0aaa:0x0123:0x1",
		Keys:            []string{auctionSettledSelector, "0x7", "0x0abc"},
		TransactionHash: "0xaaa",
		ExecutedAt:      "2026-08-27T15:39:48Z",
		Data: []string{
			"0x1",
			"0xdef",
			"0xc8",
			"0x96",
			"0x96",
			"0x3",
			"0x2",
			"0x2",
			"0x2",
			"0x111",
			"0x222",
			"0x333",
			"0x999",
			"0x7d",
		},
	}
}
