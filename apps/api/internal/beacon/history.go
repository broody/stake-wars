package beacon

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"stakewars.com/api/internal/starknet"
)

const (
	defaultHistoryLimit = 20
	maxHistoryLimit     = 100
)

var ErrInvalidHistoryQuery = errors.New("invalid Beacon history query")

type HistoryEntry struct {
	RoundID       uint64  `json:"roundId"`
	WinnerAddress *string `json:"winnerAddress"`
	BidCount      uint32  `json:"bidCount"`
	WinningBid    string  `json:"winningBid"`
}

type HistoryPage struct {
	Entries    []HistoryEntry `json:"entries"`
	NextCursor *string        `json:"nextCursor"`
}

type historyStore interface {
	History(
		ctx context.Context,
		network string,
		limit int,
		beforeRoundID *uint64,
	) ([]HistoryEntry, error)
}

type HistoryService struct {
	store   historyStore
	network string
}

func NewHistoryService(store historyStore, network string) *HistoryService {
	return &HistoryService{store: store, network: network}
}

func (s *HistoryService) List(
	ctx context.Context,
	limit int,
	cursor string,
) (HistoryPage, error) {
	if limit == 0 {
		limit = defaultHistoryLimit
	}
	if limit < 1 || limit > maxHistoryLimit {
		return HistoryPage{}, fmt.Errorf(
			"%w: limit must be between 1 and %d",
			ErrInvalidHistoryQuery,
			maxHistoryLimit,
		)
	}
	beforeRoundID, err := decodeHistoryCursor(cursor)
	if err != nil {
		return HistoryPage{}, err
	}
	entries, err := s.store.History(ctx, s.network, limit+1, beforeRoundID)
	if err != nil {
		return HistoryPage{}, err
	}
	for index := range entries {
		if entries[index].WinnerAddress == nil {
			continue
		}
		normalized, err := starknet.NormalizeAddress(*entries[index].WinnerAddress)
		if err != nil {
			return HistoryPage{}, fmt.Errorf("validate Beacon history winner: %w", err)
		}
		entries[index].WinnerAddress = &normalized
	}

	page := HistoryPage{Entries: entries}
	if len(entries) > limit {
		page.Entries = entries[:limit]
		next := encodeHistoryCursor(page.Entries[len(page.Entries)-1].RoundID)
		page.NextCursor = &next
	}
	return page, nil
}

func encodeHistoryCursor(roundID uint64) string {
	value := "v1:" + strconv.FormatUint(roundID, 10)
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodeHistoryCursor(cursor string) (*uint64, error) {
	if strings.TrimSpace(cursor) == "" {
		return nil, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return nil, fmt.Errorf("%w: malformed cursor", ErrInvalidHistoryQuery)
	}
	version, value, found := strings.Cut(string(decoded), ":")
	if !found || version != "v1" {
		return nil, fmt.Errorf("%w: unsupported cursor", ErrInvalidHistoryQuery)
	}
	roundID, err := strconv.ParseUint(value, 10, 64)
	if err != nil || roundID == 0 {
		return nil, fmt.Errorf("%w: malformed cursor", ErrInvalidHistoryQuery)
	}
	return &roundID, nil
}
