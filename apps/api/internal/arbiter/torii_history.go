package arbiter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"time"

	"stakewars.com/api/internal/starknet"
)

const (
	auctionSettledSelector = "0x3f42b4b11cd8189b957233ce219f20d0da8764ae09f6b78efa6392b5d18d362"
	maxToriiResponseBytes  = 2 * 1024 * 1024
)

type settlementProjectionStore interface {
	UnprojectedRounds(ctx context.Context, network string) ([]CanonicalRound, error)
	SaveSettlement(ctx context.Context, network string, projection SettlementProjection) error
}

type settlementSource interface {
	Settlement(
		ctx context.Context,
		round CanonicalRound,
	) (SettlementProjection, bool, error)
}

// SettlementProjector joins Torii's indexable event fields with the canonical
// direct-RPC result before persisting an immutable history row.
type SettlementProjector struct {
	store                  settlementProjectionStore
	source                 settlementSource
	reader                 starknet.WhisperReader
	network                string
	biddingDurationSeconds uint64
}

func NewSettlementProjector(
	store settlementProjectionStore,
	source settlementSource,
	reader starknet.WhisperReader,
	network string,
	biddingDurationSeconds uint64,
) *SettlementProjector {
	return &SettlementProjector{
		store: store, source: source, reader: reader, network: network,
		biddingDurationSeconds: biddingDurationSeconds,
	}
}

func (p *SettlementProjector) Reconcile(ctx context.Context) error {
	rounds, err := p.store.UnprojectedRounds(ctx, p.network)
	if err != nil {
		return err
	}
	for _, round := range rounds {
		projection, found, err := p.source.Settlement(ctx, round)
		if err != nil {
			return fmt.Errorf("read Torii settlement for round %d: %w", round.RoundID, err)
		}
		if !found {
			continue
		}
		if err := p.verifySettlement(ctx, round, projection); err != nil {
			return fmt.Errorf("verify Arbiter settlement for round %d: %w", round.RoundID, err)
		}
		projection.RoundID = round.RoundID
		projection.WhisperAddress = round.WhisperAddress
		if err := p.store.SaveSettlement(ctx, p.network, projection); err != nil {
			return err
		}
	}
	return nil
}

func (p *SettlementProjector) verifySettlement(
	ctx context.Context,
	round CanonicalRound,
	projection SettlementProjection,
) error {
	auction, err := p.reader.Auction(ctx, round.WhisperAddress, round.AuctionID)
	if err != nil {
		return fmt.Errorf("read Whisper auction: %w", err)
	}
	if err := validateCanonicalRound(round, auction, p.biddingDurationSeconds); err != nil {
		return err
	}
	if auction.Status != starknet.WhisperStatusSettled {
		return fmt.Errorf("Whisper auction is %s, not settled", auction.Status)
	}
	result, err := p.reader.Result(ctx, round.WhisperAddress, round.AuctionID)
	if err != nil {
		return fmt.Errorf("read Whisper result: %w", err)
	}
	if result.AuctionID != round.AuctionID || projection.AuctionID != round.AuctionID {
		return fmt.Errorf("auction ID mismatch")
	}
	checks := []struct {
		name     string
		expected string
		actual   string
		felt     bool
	}{
		{name: "winner group", expected: result.WinnerBidHandle, actual: projection.WinnerGroupHandle, felt: true},
		{name: "winner commitment", expected: result.WinnerCommitment, actual: projection.WinnerCommitment, felt: true},
		{name: "winning bid", expected: result.WinningBid, actual: projection.WinningBid},
		{name: "second-highest bid", expected: result.SecondHighestBid, actual: projection.SecondHighestBid},
		{name: "clearing price", expected: result.ClearingPrice, actual: projection.ClearingPrice},
		{name: "settlement hash", expected: result.SettlementHash, actual: projection.SettlementHash, felt: true},
		{name: "auction settlement hash", expected: auction.SettlementHash, actual: projection.SettlementHash, felt: true},
	}
	for _, check := range checks {
		expected, actual := check.expected, check.actual
		if check.felt {
			expected, err = starknet.NormalizeFelt(expected)
			if err != nil {
				return fmt.Errorf("invalid RPC %s: %w", check.name, err)
			}
			actual, err = starknet.NormalizeFelt(actual)
			if err != nil {
				return fmt.Errorf("invalid event %s: %w", check.name, err)
			}
		}
		if expected != actual {
			return fmt.Errorf("%s mismatch", check.name)
		}
	}
	if result.HasWinner != projection.HasWinner {
		return fmt.Errorf("winner status mismatch")
	}
	if result.SettledAt != uint64(projection.SettledAt.Unix()) {
		return fmt.Errorf("settlement time mismatch")
	}
	return nil
}

type ToriiSettlementSource struct {
	endpoint string
	client   *http.Client
}

func NewToriiSettlementSource(rawURL string) (*ToriiSettlementSource, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("invalid Torii URL")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/graphql"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return &ToriiSettlementSource{
		endpoint: parsed.String(),
		client:   &http.Client{Timeout: 5 * time.Second},
	}, nil
}

func (s *ToriiSettlementSource) Settlement(
	ctx context.Context,
	round CanonicalRound,
) (SettlementProjection, bool, error) {
	body, err := json.Marshal(map[string]any{
		"query": `
			query StakeWarsArbiterSettlement($keys: [String]) {
				events(first: 2, keys: $keys) {
					edges {
						node { id keys data transactionHash executedAt }
					}
					pageInfo { hasNextPage endCursor }
				}
			}
		`,
		"variables": map[string]any{
			"keys": []string{auctionSettledSelector, fmt.Sprintf("0x%x", round.AuctionID)},
		},
	})
	if err != nil {
		return SettlementProjection{}, false, fmt.Errorf("encode Torii settlement query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return SettlementProjection{}, false, fmt.Errorf("create Torii settlement query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(request)
	if err != nil {
		return SettlementProjection{}, false, fmt.Errorf("query Torii settlement: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return SettlementProjection{}, false, fmt.Errorf("Torii returned HTTP %d", response.StatusCode)
	}

	var payload toriiSettlementResponse
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxToriiResponseBytes))
	if err := decoder.Decode(&payload); err != nil {
		return SettlementProjection{}, false, fmt.Errorf("decode Torii settlement: %w", err)
	}
	if len(payload.Errors) > 0 {
		return SettlementProjection{}, false, fmt.Errorf("Torii rejected settlement query: %s", payload.Errors[0].Message)
	}
	events := payload.Data.Events
	if events == nil || events.Edges == nil || events.PageInfo == nil {
		return SettlementProjection{}, false, fmt.Errorf("Torii omitted settlement collection")
	}
	if events.PageInfo.HasNextPage || len(events.Edges) > 1 {
		return SettlementProjection{}, false, fmt.Errorf("Torii returned duplicate settlement events")
	}
	if len(events.Edges) == 0 {
		return SettlementProjection{}, false, nil
	}
	if events.Edges[0].Node == nil {
		return SettlementProjection{}, false, fmt.Errorf("Torii returned an empty settlement event")
	}
	projection, err := parseToriiSettlement(*events.Edges[0].Node, round)
	if err != nil {
		return SettlementProjection{}, false, err
	}
	return projection, true, nil
}

type toriiSettlementResponse struct {
	Data struct {
		Events *struct {
			Edges []struct {
				Node *toriiRawEvent `json:"node"`
			} `json:"edges"`
			PageInfo *struct {
				HasNextPage bool `json:"hasNextPage"`
			} `json:"pageInfo"`
		} `json:"events"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type toriiRawEvent struct {
	ID              string   `json:"id"`
	Keys            []string `json:"keys"`
	Data            []string `json:"data"`
	TransactionHash string   `json:"transactionHash"`
	ExecutedAt      string   `json:"executedAt"`
}

func parseToriiSettlement(
	event toriiRawEvent,
	round CanonicalRound,
) (SettlementProjection, error) {
	parts := strings.Split(event.ID, ":")
	if len(parts) != 4 {
		return SettlementProjection{}, fmt.Errorf("Torii returned an invalid raw event ID")
	}
	if _, err := parseEventUint(parts[0], 64); err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid event block: %w", err)
	}
	if _, err := parseEventUint(parts[3], 64); err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid event index: %w", err)
	}
	contractAddress, err := starknet.NormalizeAddress(parts[2])
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid event contract: %w", err)
	}
	expectedAddress, err := starknet.NormalizeAddress(round.WhisperAddress)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid canonical Whisper address: %w", err)
	}
	if contractAddress != expectedAddress {
		return SettlementProjection{}, fmt.Errorf("Torii returned a settlement from an unexpected contract")
	}
	idTransaction, err := starknet.NormalizeFelt(parts[1])
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid event transaction: %w", err)
	}
	nodeTransaction, err := starknet.NormalizeFelt(event.TransactionHash)
	if err != nil || nodeTransaction != idTransaction {
		return SettlementProjection{}, fmt.Errorf("Torii returned an invalid event transaction hash")
	}
	if _, err := time.Parse(time.RFC3339, event.ExecutedAt); err != nil {
		return SettlementProjection{}, fmt.Errorf("Torii returned an invalid event execution time")
	}
	if len(event.Keys) != 3 || len(event.Data) != 14 {
		return SettlementProjection{}, fmt.Errorf("Torii returned a malformed AuctionSettled event")
	}
	selector, err := starknet.NormalizeFelt(event.Keys[0])
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid settlement selector: %w", err)
	}
	expectedSelector, _ := starknet.NormalizeFelt(auctionSettledSelector)
	if selector != expectedSelector {
		return SettlementProjection{}, fmt.Errorf("Torii returned an unexpected event selector")
	}
	auctionID, err := parseEventUint(event.Keys[1], 64)
	if err != nil || auctionID != round.AuctionID {
		return SettlementProjection{}, fmt.Errorf("Torii returned an invalid settlement auction ID")
	}
	winnerGroup, err := starknet.NormalizeFelt(event.Keys[2])
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid winner group: %w", err)
	}
	hasWinnerValue, err := parseEventUint(event.Data[0], 1)
	if err != nil || hasWinnerValue > 1 {
		return SettlementProjection{}, fmt.Errorf("invalid winner status")
	}
	hasWinner := hasWinnerValue == 1
	winnerCommitment, err := starknet.NormalizeFelt(event.Data[1])
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid winner commitment: %w", err)
	}
	winningBid, err := parseEventAmount(event.Data[2], 128)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid winning bid: %w", err)
	}
	secondHighestBid, err := parseEventAmount(event.Data[3], 128)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid second-highest bid: %w", err)
	}
	clearingPrice, err := parseEventAmount(event.Data[4], 128)
	if err != nil {
		return SettlementProjection{}, fmt.Errorf("invalid clearing price: %w", err)
	}
	for index, name := range []string{
		"submission count", "funded tranche count", "funded bid count", "eligible bid count",
	} {
		if _, err := parseEventUint(event.Data[5+index], 32); err != nil {
			return SettlementProjection{}, fmt.Errorf("invalid %s: %w", name, err)
		}
	}
	fundedBidCount, _ := parseEventUint(event.Data[7], 32)
	for index, name := range []string{
		"accepted bids hash", "reveals root", "outputs root", "settlement hash",
	} {
		if _, err := starknet.NormalizeFelt(event.Data[9+index]); err != nil {
			return SettlementProjection{}, fmt.Errorf("invalid %s: %w", name, err)
		}
	}
	settlementHash, _ := starknet.NormalizeFelt(event.Data[12])
	settledAtValue, err := parseEventUint(event.Data[13], 64)
	if err != nil || settledAtValue == 0 || settledAtValue > math.MaxInt64 {
		return SettlementProjection{}, fmt.Errorf("invalid settlement time")
	}
	if hasWinner {
		if winnerGroup == "0x0" || winnerCommitment == "0x0" || winningBid == "0" {
			return SettlementProjection{}, fmt.Errorf("winning settlement has an empty winner")
		}
	} else if winnerGroup != "0x0" || winnerCommitment != "0x0" ||
		winningBid != "0" || secondHighestBid != "0" || clearingPrice != "0" {
		return SettlementProjection{}, fmt.Errorf("no-winner settlement contains winner data")
	}
	winningValue, _ := new(big.Int).SetString(winningBid, 10)
	clearingValue, _ := new(big.Int).SetString(clearingPrice, 10)
	if clearingValue.Cmp(winningValue) > 0 {
		return SettlementProjection{}, fmt.Errorf("clearing price exceeds winning bid")
	}

	return SettlementProjection{
		AuctionID:                 auctionID,
		HasWinner:                 hasWinner,
		WinnerGroupHandle:         winnerGroup,
		WinnerCommitment:          winnerCommitment,
		WinningBid:                winningBid,
		SecondHighestBid:          secondHighestBid,
		ClearingPrice:             clearingPrice,
		FundedBidCount:            uint32(fundedBidCount),
		SettlementHash:            settlementHash,
		SettlementTransactionHash: nodeTransaction,
		SettledAt:                 time.Unix(int64(settledAtValue), 0).UTC(),
	}, nil
}

func parseEventUint(value string, bits int) (uint64, error) {
	number, err := parseEventBig(value, bits)
	if err != nil {
		return 0, err
	}
	return number.Uint64(), nil
}

func parseEventAmount(value string, bits int) (string, error) {
	number, err := parseEventBig(value, bits)
	if err != nil {
		return "", err
	}
	return number.String(), nil
}

func parseEventBig(value string, bits int) (*big.Int, error) {
	value = strings.TrimSpace(value)
	if len(value) < 3 || !strings.HasPrefix(value, "0x") {
		return nil, fmt.Errorf("value is not hexadecimal")
	}
	number, ok := new(big.Int).SetString(value[2:], 16)
	if !ok || number.Sign() < 0 || number.BitLen() > bits {
		return nil, fmt.Errorf("value exceeds u%d", bits)
	}
	return number, nil
}
