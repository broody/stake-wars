package arbiter

import (
	"context"
	"errors"
	"testing"
)

func TestHistoryServicePaginatesAndNormalizesWinners(t *testing.T) {
	store := &fakeHistoryStore{entries: []HistoryEntry{
		{RoundID: 4, WinnerAddress: stringPointer("0x0777"), BidCount: 3, WinningBid: "100"},
		{RoundID: 3, WinnerAddress: nil, BidCount: 2, WinningBid: "90"},
	}}
	service := NewHistoryService(store, "SN_SEPOLIA")

	page, err := service.List(context.Background(), 1, "")
	if err != nil {
		t.Fatal(err)
	}
	if store.limit != 2 || store.network != "SN_SEPOLIA" ||
		len(page.Entries) != 1 || page.NextCursor == nil ||
		page.Entries[0].WinnerAddress == nil || *page.Entries[0].WinnerAddress != "0x777" {
		t.Fatalf("unexpected first history page: %+v", page)
	}

	store.entries = []HistoryEntry{{RoundID: 3, BidCount: 2, WinningBid: "90"}}
	page, err = service.List(context.Background(), 1, *page.NextCursor)
	if err != nil {
		t.Fatal(err)
	}
	if store.before == nil || *store.before != 4 || len(page.Entries) != 1 ||
		page.NextCursor != nil {
		t.Fatalf("unexpected second history page: %+v", page)
	}
}

func TestHistoryServiceRejectsInvalidQueries(t *testing.T) {
	service := NewHistoryService(&fakeHistoryStore{}, "SN_SEPOLIA")
	for _, test := range []struct {
		limit  int
		cursor string
	}{
		{limit: -1},
		{limit: 101},
		{limit: 10, cursor: "not-a-cursor"},
	} {
		_, err := service.List(context.Background(), test.limit, test.cursor)
		if !errors.Is(err, ErrInvalidHistoryQuery) {
			t.Fatalf("expected invalid query for %+v, got %v", test, err)
		}
	}
}

type fakeHistoryStore struct {
	entries []HistoryEntry
	network string
	limit   int
	before  *uint64
}

func (s *fakeHistoryStore) History(
	_ context.Context,
	network string,
	limit int,
	beforeRoundID *uint64,
) ([]HistoryEntry, error) {
	s.network = network
	s.limit = limit
	s.before = beforeRoundID
	return append([]HistoryEntry(nil), s.entries...), nil
}

func stringPointer(value string) *string { return &value }
