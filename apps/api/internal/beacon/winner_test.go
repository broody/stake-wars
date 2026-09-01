package beacon

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOperatorClientReadsWinnerDisclosure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/v1/auctions/7/winner" {
			t.Fatalf("unexpected winner request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatalf("winner request was not authenticated")
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status": "winner", "auctionId": "0x7", "winnerGroupHandle": "0xabc",
			"winnerCommitment": "0xdef", "address": "0x0777",
		})
	}))
	defer server.Close()

	disclosure, err := NewOperatorCoordinatorClient(server.URL, "secret").winnerDisclosure(
		context.Background(),
		7,
	)
	if err != nil {
		t.Fatal(err)
	}
	if disclosure.Status != "winner" || disclosure.Address != "0x0777" {
		t.Fatalf("unexpected disclosure: %+v", disclosure)
	}
}

func TestWinnerProjectorVerifiesAndActivatesWinner(t *testing.T) {
	winner := UnresolvedWinner{
		RoundID: 2, AuctionID: 7, WinnerGroupHandle: "0xabc",
		WinnerCommitment: "0xdef", SettledAt: time.Unix(125, 0).UTC(),
	}
	store := &fakeWinnerProjectionStore{winners: []UnresolvedWinner{winner}}
	projector := NewWinnerProjector(
		store,
		fakeWinnerDisclosureSource{disclosure: winnerDisclosure{
			Status: "winner", AuctionID: "0x7", WinnerGroupHandle: "0x0abc",
			WinnerCommitment: "0x0def", Address: "0x0777",
		}},
		"SN_SEPOLIA",
	)

	if err := projector.Reconcile(context.Background()); err != nil {
		t.Fatal(err)
	}
	if store.network != "SN_SEPOLIA" || store.resolved == nil ||
		store.resolved.RoundID != 2 || store.address != "0x777" {
		t.Fatalf("unexpected winner projection: %+v", store)
	}
}

type fakeWinnerProjectionStore struct {
	winners  []UnresolvedWinner
	network  string
	resolved *UnresolvedWinner
	address  string
}

func (s *fakeWinnerProjectionStore) UnresolvedWinners(
	_ context.Context,
	network string,
) ([]UnresolvedWinner, error) {
	s.network = network
	return append([]UnresolvedWinner(nil), s.winners...), nil
}

func (s *fakeWinnerProjectionStore) ResolveWinner(
	_ context.Context,
	_ string,
	winner UnresolvedWinner,
	address string,
) error {
	s.resolved = &winner
	s.address = address
	return nil
}

type fakeWinnerDisclosureSource struct{ disclosure winnerDisclosure }

func (s fakeWinnerDisclosureSource) winnerDisclosure(
	context.Context,
	uint64,
) (winnerDisclosure, error) {
	return s.disclosure, nil
}
