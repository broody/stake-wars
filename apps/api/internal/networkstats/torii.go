package networkstats

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"stakewars.com/api/internal/starknet"
)

const (
	poolMemberBalanceChangedSelector = "0x03b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7"
	maxStatsPages                    = 1000
	maxToriiStatsBodyBytes           = 8 * 1024 * 1024
	defaultCacheTTL                  = 30 * time.Second
	defaultMaxStale                  = 5 * time.Minute
)

const poolBalancesQuery = `
query StakeWarsPoolBalances($after: Cursor) {
  events(
    first: 1000
    after: $after
    keys: ["0x03b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7"]
  ) {
    edges {
      cursor
      node { id keys data executedAt }
    }
    pageInfo { hasNextPage endCursor }
  }
}`

const occupiedSectorsQuery = `
query StakeWarsOccupiedSectors {
  stakewarsSectorModels(first: 2000) {
    edges {
      node { controller controller_generation }
    }
  }
  stakewarsOperatorStateModels(first: 2000) {
    edges {
      node { operator generation }
    }
  }
}`

// Snapshot is a cached, indexed view of the active Stake Wars delegation pool.
// TotalStaked is denominated in FRI (10^-18 STRK) and remains a decimal string
// so JSON consumers never lose integer precision.
type Snapshot struct {
	Network         string    `json:"network"`
	TotalStaked     string    `json:"totalStaked"`
	ActiveOperators int       `json:"activeOperators"`
	OccupiedSectors int       `json:"occupiedSectors"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// Reader supplies public staking statistics.
type Reader interface {
	Current(ctx context.Context) (Snapshot, error)
}

// ToriiReader derives current pool balances from indexed
// PoolMemberBalanceChanged events and caches the aggregate in-process.
type ToriiReader struct {
	endpoint    string
	poolAddress string
	network     string
	httpClient  *http.Client
	cacheTTL    time.Duration
	maxStale    time.Duration

	mu       sync.Mutex
	cached   *Snapshot
	cachedAt time.Time
	clock    func() time.Time
}

// NewToriiReader returns nil when both Torii and the indexed staking pool are
// unconfigured. Supplying only one is an invalid partial configuration.
func NewToriiReader(rawURL, poolAddress, network string) (*ToriiReader, error) {
	rawURL = strings.TrimSpace(rawURL)
	poolAddress = strings.TrimSpace(poolAddress)
	if rawURL == "" && poolAddress == "" {
		return nil, nil
	}
	if rawURL == "" || poolAddress == "" {
		return nil, fmt.Errorf("TORII_URL and TORII_STAKING_POOL_ADDRESS must be configured together")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, fmt.Errorf("invalid Torii URL")
	}
	if !strings.HasSuffix(strings.TrimRight(parsed.Path, "/"), "/graphql") {
		parsed.Path = strings.TrimRight(parsed.Path, "/") + "/graphql"
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""

	normalizedPool, err := starknet.NormalizeAddress(poolAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid Torii staking pool address: %w", err)
	}

	return &ToriiReader{
		endpoint:    parsed.String(),
		poolAddress: normalizedPool,
		network:     strings.TrimSpace(network),
		httpClient:  &http.Client{Timeout: 10 * time.Second},
		cacheTTL:    defaultCacheTTL,
		maxStale:    defaultMaxStale,
		clock:       time.Now,
	}, nil
}

// Current returns the latest cached snapshot, refreshing it from Torii at
// most once per cache interval. A recent snapshot remains usable during a
// short Torii interruption.
func (r *ToriiReader) Current(ctx context.Context) (Snapshot, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := r.clock().UTC()
	if r.cached != nil && now.Sub(r.cachedAt) < r.cacheTTL {
		return *r.cached, nil
	}

	snapshot, err := r.read(ctx, now)
	if err != nil {
		if r.cached != nil && now.Sub(r.cachedAt) < r.maxStale {
			return *r.cached, nil
		}
		return Snapshot{}, err
	}
	r.cached = &snapshot
	r.cachedAt = now
	return snapshot, nil
}

func (r *ToriiReader) read(ctx context.Context, now time.Time) (Snapshot, error) {
	balances := make(map[string]operatorBalanceEvents)
	var after *string
	var newestEvent time.Time
	sequence := 0

	for page := 0; page < maxStatsPages; page++ {
		connection, err := r.readPage(ctx, after)
		if err != nil {
			return Snapshot{}, err
		}
		for _, edge := range connection.Edges {
			block, contractAddress, err := eventMetadata(edge.Node.ID)
			if err != nil {
				return Snapshot{}, fmt.Errorf("parse pool balance event id: %w", err)
			}
			if contractAddress != r.poolAddress {
				continue
			}
			if len(edge.Node.Keys) < 2 || !equalHex(edge.Node.Keys[0], poolMemberBalanceChangedSelector) {
				return Snapshot{}, fmt.Errorf("Torii returned a malformed pool balance event")
			}
			if len(edge.Node.Data) != 2 {
				return Snapshot{}, fmt.Errorf("Torii omitted a pool member balance")
			}

			operator, err := starknet.NormalizeAddress(edge.Node.Keys[1])
			if err != nil {
				return Snapshot{}, fmt.Errorf("parse pool member address: %w", err)
			}
			oldAmount, err := parseUint128(edge.Node.Data[0])
			if err != nil {
				return Snapshot{}, fmt.Errorf("parse previous pool member balance: %w", err)
			}
			newAmount, err := parseUint128(edge.Node.Data[1])
			if err != nil {
				return Snapshot{}, fmt.Errorf("parse new pool member balance: %w", err)
			}
			current, ok := balances[operator]
			switch {
			case !ok || block.Cmp(current.block) > 0:
				balances[operator] = operatorBalanceEvents{
					block: block,
					events: []balanceEvent{{
						oldAmount: oldAmount,
						newAmount: newAmount,
						sequence:  sequence,
					}},
				}
			case block.Cmp(current.block) == 0:
				current.events = append(current.events, balanceEvent{
					oldAmount: oldAmount,
					newAmount: newAmount,
					sequence:  sequence,
				})
				balances[operator] = current
			}
			sequence++
			if eventTime, err := time.Parse(time.RFC3339, edge.Node.ExecutedAt); err == nil && eventTime.After(newestEvent) {
				newestEvent = eventTime.UTC()
			}
		}

		if !connection.PageInfo.HasNextPage {
			total := new(big.Int)
			active := 0
			for _, events := range balances {
				balance := latestBalance(events.events)
				if balance.Sign() == 0 {
					continue
				}
				total.Add(total, balance)
				active++
			}
			if newestEvent.IsZero() {
				newestEvent = now
			}
			occupied, err := r.readOccupiedSectors(ctx)
			if err != nil {
				return Snapshot{}, err
			}
			return Snapshot{
				Network:         r.network,
				TotalStaked:     total.String(),
				ActiveOperators: active,
				OccupiedSectors: occupied,
				UpdatedAt:       newestEvent,
			}, nil
		}

		if connection.PageInfo.EndCursor == "" || (after != nil && connection.PageInfo.EndCursor == *after) {
			return Snapshot{}, fmt.Errorf("Torii returned an invalid pool event cursor")
		}
		after = &connection.PageInfo.EndCursor
	}

	return Snapshot{}, fmt.Errorf("pool balance history exceeded %d pages", maxStatsPages)
}

type toriiEventsConnection struct {
	Edges []struct {
		Cursor string `json:"cursor"`
		Node   struct {
			ID         string   `json:"id"`
			Keys       []string `json:"keys"`
			Data       []string `json:"data"`
			ExecutedAt string   `json:"executedAt"`
		} `json:"node"`
	} `json:"edges"`
	PageInfo struct {
		HasNextPage bool   `json:"hasNextPage"`
		EndCursor   string `json:"endCursor"`
	} `json:"pageInfo"`
}

func (r *ToriiReader) readPage(ctx context.Context, after *string) (toriiEventsConnection, error) {
	body, err := json.Marshal(map[string]any{
		"query":     poolBalancesQuery,
		"variables": map[string]any{"after": after},
	})
	if err != nil {
		return toriiEventsConnection{}, fmt.Errorf("encode Torii stats query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return toriiEventsConnection{}, fmt.Errorf("create Torii stats query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return toriiEventsConnection{}, fmt.Errorf("query Torii stats: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxToriiStatsBodyBytes))
		return toriiEventsConnection{}, fmt.Errorf("Torii stats returned HTTP %d", response.StatusCode)
	}

	var payload struct {
		Data struct {
			Events *toriiEventsConnection `json:"events"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxToriiStatsBodyBytes))
	if err := decoder.Decode(&payload); err != nil {
		return toriiEventsConnection{}, fmt.Errorf("decode Torii stats: %w", err)
	}
	if len(payload.Errors) > 0 {
		return toriiEventsConnection{}, fmt.Errorf("Torii rejected stats query: %s", payload.Errors[0].Message)
	}
	if payload.Data.Events == nil {
		return toriiEventsConnection{}, fmt.Errorf("Torii omitted the pool event collection")
	}
	return *payload.Data.Events, nil
}

type toriiSectorOccupancyNode struct {
	Controller           string `json:"controller"`
	ControllerGeneration string `json:"controller_generation"`
}

type toriiOperatorGenerationNode struct {
	Operator   string `json:"operator"`
	Generation string `json:"generation"`
}

func (r *ToriiReader) readOccupiedSectors(ctx context.Context) (int, error) {
	body, err := json.Marshal(map[string]any{
		"query":     occupiedSectorsQuery,
		"variables": map[string]any{},
	})
	if err != nil {
		return 0, fmt.Errorf("encode Torii occupancy query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("create Torii occupancy query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return 0, fmt.Errorf("query Torii occupancy: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxToriiStatsBodyBytes))
		return 0, fmt.Errorf("Torii occupancy returned HTTP %d", response.StatusCode)
	}

	var payload struct {
		Data struct {
			Sectors *struct {
				Edges []struct {
					Node *toriiSectorOccupancyNode `json:"node"`
				} `json:"edges"`
			} `json:"stakewarsSectorModels"`
			Operators *struct {
				Edges []struct {
					Node *toriiOperatorGenerationNode `json:"node"`
				} `json:"edges"`
			} `json:"stakewarsOperatorStateModels"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, maxToriiStatsBodyBytes))
	if err := decoder.Decode(&payload); err != nil {
		return 0, fmt.Errorf("decode Torii occupancy: %w", err)
	}
	if len(payload.Errors) > 0 {
		return 0, fmt.Errorf("Torii rejected occupancy query: %s", payload.Errors[0].Message)
	}
	if payload.Data.Sectors == nil || payload.Data.Operators == nil {
		return 0, fmt.Errorf("Torii omitted an occupancy model collection")
	}

	generations := make(map[string]*big.Int, len(payload.Data.Operators.Edges))
	for _, edge := range payload.Data.Operators.Edges {
		if edge.Node == nil {
			continue
		}
		operator, nonZero, err := normalizeNonZeroAddress(edge.Node.Operator)
		if err != nil {
			return 0, fmt.Errorf("parse indexed operator address: %w", err)
		}
		if !nonZero {
			continue
		}
		generation, err := parseUint64(edge.Node.Generation)
		if err != nil {
			return 0, fmt.Errorf("parse indexed operator generation: %w", err)
		}
		generations[operator] = generation
	}

	occupied := 0
	for _, edge := range payload.Data.Sectors.Edges {
		if edge.Node == nil {
			continue
		}
		controller, nonZero, err := normalizeNonZeroAddress(edge.Node.Controller)
		if err != nil {
			return 0, fmt.Errorf("parse indexed sector controller: %w", err)
		}
		if !nonZero {
			continue
		}
		controllerGeneration, err := parseUint64(edge.Node.ControllerGeneration)
		if err != nil {
			return 0, fmt.Errorf("parse indexed sector generation: %w", err)
		}
		operatorGeneration, ok := generations[controller]
		if ok && operatorGeneration.Cmp(controllerGeneration) == 0 {
			occupied++
		}
	}
	return occupied, nil
}

type balanceEvent struct {
	oldAmount *big.Int
	newAmount *big.Int
	sequence  int
}

type operatorBalanceEvents struct {
	block  *big.Int
	events []balanceEvent
}

func latestBalance(events []balanceEvent) *big.Int {
	if len(events) == 1 {
		return events[0].newAmount
	}

	var terminal *balanceEvent
	for index := range events {
		feedsAnotherEvent := false
		for otherIndex := range events {
			if index != otherIndex && events[index].newAmount.Cmp(events[otherIndex].oldAmount) == 0 {
				feedsAnotherEvent = true
				break
			}
		}
		if !feedsAnotherEvent {
			if terminal == nil {
				terminal = &events[index]
			} else {
				terminal = nil
				break
			}
		}
	}
	if terminal != nil {
		return terminal.newAmount
	}

	// Torii returns raw events newest-first. This fallback is only needed when
	// same-block transitions form a cycle or more than one terminal balance.
	latest := events[0]
	for _, event := range events[1:] {
		if event.sequence < latest.sequence {
			latest = event
		}
	}
	return latest.newAmount
}

func eventMetadata(value string) (*big.Int, string, error) {
	parts := strings.Split(value, ":")
	if len(parts) != 4 {
		return nil, "", fmt.Errorf("expected four event id segments")
	}
	block, err := parseHex(parts[0])
	if err != nil {
		return nil, "", err
	}
	contractAddress, err := starknet.NormalizeAddress(parts[2])
	if err != nil {
		return nil, "", err
	}
	return block, contractAddress, nil
}

func parseUint128(value string) (*big.Int, error) {
	parsed, err := parseHex(value)
	if err != nil {
		return nil, err
	}
	if parsed.BitLen() > 128 {
		return nil, fmt.Errorf("value exceeds u128")
	}
	return parsed, nil
}

func parseUint64(value string) (*big.Int, error) {
	parsed, err := parseHex(value)
	if err != nil {
		return nil, err
	}
	if parsed.BitLen() > 64 {
		return nil, fmt.Errorf("value exceeds u64")
	}
	return parsed, nil
}

func normalizeNonZeroAddress(value string) (string, bool, error) {
	parsed, err := parseHex(value)
	if err != nil {
		return "", false, err
	}
	if parsed.Sign() == 0 {
		return "", false, nil
	}
	normalized, err := starknet.NormalizeAddress(value)
	if err != nil {
		return "", false, err
	}
	return normalized, true, nil
}

func parseHex(value string) (*big.Int, error) {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(strings.TrimPrefix(value, "0x"), "0X")
	if value == "" {
		return nil, fmt.Errorf("empty hexadecimal value")
	}
	parsed, ok := new(big.Int).SetString(value, 16)
	if !ok {
		return nil, fmt.Errorf("invalid hexadecimal value")
	}
	return parsed, nil
}

func equalHex(left, right string) bool {
	leftValue, leftErr := parseHex(left)
	rightValue, rightErr := parseHex(right)
	return leftErr == nil && rightErr == nil && leftValue.Cmp(rightValue) == 0
}
