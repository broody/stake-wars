package starknet

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/NethermindEth/juno/core/felt"
)

// MaxSyncBatch mirrors the Control System's MAX_SYNC_BATCH.
const MaxSyncBatch = 50

const (
	operatorStatesPageSize = 1000
	operatorStatesMaxPages = 100
)

const operatorStatesQuery = `
query StakeWarsOperatorStates($first: Int, $after: Cursor) {
  stakewarsOperatorStateModels(first: $first, after: $after) {
    edges { node { operator generation retired } }
    pageInfo { hasNextPage endCursor }
  }
}`

// OperatorLister discovers the Operators that can still hold Sectors. Torii is
// discovery only: the Control System decides who needs synchronization.
type OperatorLister interface {
	ActiveOperators(ctx context.Context) ([]string, error)
}

type ToriiOperatorLister struct {
	toriiURL   string
	httpClient *http.Client
}

func NewOperatorLister(toriiURL string) (*ToriiOperatorLister, error) {
	toriiURL = strings.TrimRight(strings.TrimSpace(toriiURL), "/")
	if toriiURL == "" {
		return nil, fmt.Errorf("Torii URL is required for Operator discovery")
	}
	if !strings.HasSuffix(toriiURL, "/graphql") {
		toriiURL += "/graphql"
	}
	return &ToriiOperatorLister{
		toriiURL:   toriiURL,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// ActiveOperators returns every indexed Operator that has played and is not
// retired. A retired Operator never needs another synchronization.
func (l *ToriiOperatorLister) ActiveOperators(ctx context.Context) ([]string, error) {
	operators := make([]string, 0)
	seen := make(map[string]struct{})
	var after *string
	for page := 0; page < operatorStatesMaxPages; page++ {
		connection, err := l.readPage(ctx, after)
		if err != nil {
			return nil, err
		}
		for _, edge := range connection.Edges {
			if edge.Node == nil || edge.Node.Retired {
				continue
			}
			generation, err := parseUint(edge.Node.Generation, 64)
			if err != nil {
				return nil, fmt.Errorf("invalid indexed Operator generation: %w", err)
			}
			if generation == 0 {
				continue
			}
			operator, err := normalizeAddress(edge.Node.Operator)
			if err != nil {
				return nil, fmt.Errorf("invalid indexed Operator address: %w", err)
			}
			if _, exists := seen[operator]; exists {
				continue
			}
			seen[operator] = struct{}{}
			operators = append(operators, operator)
		}
		if !connection.PageInfo.HasNextPage || connection.PageInfo.EndCursor == "" {
			return operators, nil
		}
		cursor := connection.PageInfo.EndCursor
		after = &cursor
	}
	return nil, fmt.Errorf("indexed Operators exceed %d pages", operatorStatesMaxPages)
}

type operatorStatesConnection struct {
	Edges []struct {
		Node *struct {
			Operator   string `json:"operator"`
			Generation string `json:"generation"`
			Retired    bool   `json:"retired"`
		} `json:"node"`
	} `json:"edges"`
	PageInfo struct {
		HasNextPage bool   `json:"hasNextPage"`
		EndCursor   string `json:"endCursor"`
	} `json:"pageInfo"`
}

func (l *ToriiOperatorLister) readPage(
	ctx context.Context,
	after *string,
) (operatorStatesConnection, error) {
	body, err := json.Marshal(map[string]any{
		"query":     operatorStatesQuery,
		"variables": map[string]any{"first": operatorStatesPageSize, "after": after},
	})
	if err != nil {
		return operatorStatesConnection{}, fmt.Errorf("encode Operator query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, l.toriiURL, bytes.NewReader(body))
	if err != nil {
		return operatorStatesConnection{}, fmt.Errorf("create Operator query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := l.httpClient.Do(request)
	if err != nil {
		return operatorStatesConnection{}, fmt.Errorf("query Operators: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return operatorStatesConnection{}, fmt.Errorf("Torii returned HTTP %d", response.StatusCode)
	}
	var payload struct {
		Data struct {
			Models *operatorStatesConnection `json:"stakewarsOperatorStateModels"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 8*1024*1024))
	if err := decoder.Decode(&payload); err != nil {
		return operatorStatesConnection{}, fmt.Errorf("decode Operators: %w", err)
	}
	if len(payload.Errors) > 0 {
		return operatorStatesConnection{}, fmt.Errorf("Torii rejected Operator query: %s", payload.Errors[0].Message)
	}
	if payload.Data.Models == nil {
		return operatorStatesConnection{}, fmt.Errorf("Torii omitted the Operator collection")
	}
	return *payload.Data.Models, nil
}

type ControlSubmitter interface {
	SyncOperators(ctx context.Context, operators []string) (string, error)
}

type AccountControlSubmitter struct {
	keeper        *AccountSupplyDropSubmitter
	controlSystem *felt.Felt
}

// NewControlSubmitter shares the existing keeper account, nonce lock, and
// pending receipt with SupplyDrop maintenance. It does not create another signer.
func NewControlSubmitter(
	keeper *AccountSupplyDropSubmitter,
	controlSystem string,
) (*AccountControlSubmitter, error) {
	address, err := normalizeAddress(controlSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid control system address: %w", err)
	}
	if keeper == nil {
		return nil, fmt.Errorf("Operator synchronization requires the keeper signer")
	}
	system, _ := new(felt.Felt).SetString(address)
	return &AccountControlSubmitter{keeper: keeper, controlSystem: system}, nil
}

// SyncOperators submits the permissionless sync_operators call for one batch.
func (s *AccountControlSubmitter) SyncOperators(
	ctx context.Context,
	operators []string,
) (string, error) {
	if len(operators) == 0 || len(operators) > MaxSyncBatch {
		return "", fmt.Errorf("sync batch must hold 1 to %d Operators", MaxSyncBatch)
	}
	addresses := make([]string, 0, len(operators))
	calldata := make([]*felt.Felt, 0, len(operators)+1)
	calldata = append(calldata, new(felt.Felt).SetUint64(uint64(len(operators))))
	for _, operator := range operators {
		address, err := normalizeAddress(operator)
		if err != nil {
			return "", fmt.Errorf("invalid operator: %w", err)
		}
		value, err := new(felt.Felt).SetString(address)
		if err != nil {
			return "", fmt.Errorf("encode operator %s: %w", address, err)
		}
		addresses = append(addresses, address)
		calldata = append(calldata, value)
	}
	return s.keeper.invokeCall(
		ctx, s.controlSystem, "sync_operators", strings.Join(addresses, ","), calldata,
	)
}
