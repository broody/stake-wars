package starknet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/NethermindEth/juno/core/crypto"
)

// Starknet JSON-RPC error codes the staking index distinguishes.
const (
	RPCContractNotFound         = 20
	RPCEntrypointNotFound       = 21
	RPCInvalidContinuationToken = 33
	RPCContractError            = 40
	maxChainCallResponseBytes   = 1024 * 1024
	maxChainEventsResponseBytes = 16 * 1024 * 1024
	defaultChainRequestTimeout  = 30 * time.Second
	maxChainRequestRetries      = 3
	chainRetryDelay             = time.Second
)

// ChainBlockHeader is the part of a block header the staking index reads.
type ChainBlockHeader struct {
	Number    uint64
	Timestamp uint64
}

// EventFilter is one starknet_getEvents page request. Address is optional; an
// empty Address matches events from every contract.
type EventFilter struct {
	FromBlock         uint64
	ToBlock           uint64
	Address           string
	Keys              [][]string
	ChunkSize         int
	ContinuationToken string
}

// EmittedEvent is an event from an accepted block. EventIndex falls back to the
// event's position within its transaction on this page when the node omits it.
type EmittedEvent struct {
	FromAddress      string
	Keys             []string
	Data             []string
	BlockNumber      uint64
	TransactionHash  string
	TransactionIndex uint64
	EventIndex       uint64
}

type EventPage struct {
	Events            []EmittedEvent
	ContinuationToken string
}

// ChainClient performs read-only Starknet JSON-RPC requests pinned to an
// explicit block when one is supplied.
type ChainClient struct {
	rpc *rpcClient
}

func NewChainClient(rpcURL string) *ChainClient {
	client := newRPCClient(rpcURL)
	client.client.Timeout = defaultChainRequestTimeout
	return &ChainClient{rpc: client}
}

// Selector returns the Starknet selector for an entrypoint or event name.
func Selector(name string) string {
	selector := crypto.StarknetKeccak([]byte(name))
	return selector.String()
}

// NewRPCError builds a Starknet JSON-RPC error, for fakes standing in for a node.
func NewRPCError(code int, message string) error {
	return &rpcError{Code: code, Message: message}
}

// IsRPCError reports whether err is a Starknet JSON-RPC error with code.
func IsRPCError(err error, code int) bool {
	var rpcErr *rpcError
	return errors.As(err, &rpcErr) && rpcErr.Code == code
}

func (c *ChainClient) BlockNumber(ctx context.Context) (uint64, error) {
	var result uint64
	err := c.rpc.request(ctx, "starknet_blockNumber", []any{}, &result, maxChainCallResponseBytes)
	return result, err
}

// Call invokes a view entrypoint at block, or at the latest block when block is nil.
func (c *ChainClient) Call(
	ctx context.Context,
	contract, entrypoint string,
	calldata []string,
	block *uint64,
) ([]string, error) {
	if calldata == nil {
		calldata = []string{}
	}
	params := map[string]any{
		"request": rpcFunctionCall{
			ContractAddress:    contract,
			EntryPointSelector: Selector(entrypoint),
			Calldata:           calldata,
		},
		"block_id": blockID(block),
	}
	var result []string
	if err := c.rpc.request(ctx, "starknet_call", params, &result, maxChainCallResponseBytes); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *ChainClient) StorageAt(ctx context.Context, contract, key string) (string, error) {
	params := map[string]any{
		"contract_address": contract,
		"key":              key,
		"block_id":         "latest",
	}
	var result string
	err := c.rpc.request(ctx, "starknet_getStorageAt", params, &result, maxChainCallResponseBytes)
	return result, err
}

// Deployed reports whether contract exists at block.
func (c *ChainClient) Deployed(ctx context.Context, contract string, block uint64) (bool, error) {
	params := map[string]any{"block_id": blockID(&block), "contract_address": contract}
	var result string
	err := c.rpc.request(ctx, "starknet_getClassHashAt", params, &result, maxChainCallResponseBytes)
	if IsRPCError(err, RPCContractNotFound) {
		return false, nil
	}
	return err == nil, err
}

func (c *ChainClient) BlockHeader(ctx context.Context, block *uint64) (ChainBlockHeader, error) {
	var result struct {
		BlockNumber *uint64 `json:"block_number"`
		Timestamp   uint64  `json:"timestamp"`
	}
	params := map[string]any{"block_id": blockID(block)}
	if err := c.rpc.request(ctx, "starknet_getBlockWithTxHashes", params, &result, maxChainEventsResponseBytes); err != nil {
		return ChainBlockHeader{}, err
	}
	if result.BlockNumber == nil || result.Timestamp == 0 {
		return ChainBlockHeader{}, fmt.Errorf("Starknet block header is incomplete")
	}
	return ChainBlockHeader{Number: *result.BlockNumber, Timestamp: result.Timestamp}, nil
}

func (c *ChainClient) Events(ctx context.Context, filter EventFilter) (EventPage, error) {
	query := map[string]any{
		"from_block": map[string]uint64{"block_number": filter.FromBlock},
		"to_block":   map[string]uint64{"block_number": filter.ToBlock},
		"chunk_size": filter.ChunkSize,
	}
	if filter.Address != "" {
		query["address"] = filter.Address
	}
	if len(filter.Keys) > 0 {
		query["keys"] = filter.Keys
	}
	if filter.ContinuationToken != "" {
		query["continuation_token"] = filter.ContinuationToken
	}
	var result struct {
		Events []struct {
			FromAddress      string   `json:"from_address"`
			Keys             []string `json:"keys"`
			Data             []string `json:"data"`
			BlockNumber      *uint64  `json:"block_number"`
			TransactionHash  string   `json:"transaction_hash"`
			TransactionIndex *uint64  `json:"transaction_index"`
			EventIndex       *uint64  `json:"event_index"`
		} `json:"events"`
		ContinuationToken string `json:"continuation_token"`
	}
	params := map[string]any{"filter": query}
	if err := c.rpc.request(ctx, "starknet_getEvents", params, &result, maxChainEventsResponseBytes); err != nil {
		return EventPage{}, err
	}

	page := EventPage{
		Events:            make([]EmittedEvent, 0, len(result.Events)),
		ContinuationToken: result.ContinuationToken,
	}
	positions := make(map[string]uint64)
	for _, event := range result.Events {
		if event.BlockNumber == nil {
			return EventPage{}, fmt.Errorf("Starknet returned an event without a block number")
		}
		position := positions[event.TransactionHash]
		positions[event.TransactionHash] = position + 1
		emitted := EmittedEvent{
			FromAddress:     event.FromAddress,
			Keys:            event.Keys,
			Data:            event.Data,
			BlockNumber:     *event.BlockNumber,
			TransactionHash: event.TransactionHash,
			EventIndex:      position,
		}
		if event.TransactionIndex != nil {
			emitted.TransactionIndex = *event.TransactionIndex
		}
		if event.EventIndex != nil {
			emitted.EventIndex = *event.EventIndex
		}
		page.Events = append(page.Events, emitted)
	}
	return page, nil
}

func blockID(block *uint64) any {
	if block == nil {
		return "latest"
	}
	return map[string]uint64{"block_number": *block}
}

func (c *rpcClient) request(
	ctx context.Context,
	method string,
	params any,
	result any,
	maxResponseBytes int64,
) error {
	if strings.TrimSpace(c.url) == "" {
		return ErrUnavailable
	}
	encoded, err := json.Marshal(struct {
		JSONRPC string `json:"jsonrpc"`
		ID      int    `json:"id"`
		Method  string `json:"method"`
		Params  any    `json:"params"`
	}{JSONRPC: "2.0", ID: 1, Method: method, Params: params})
	if err != nil {
		return fmt.Errorf("marshal %s: %w", method, err)
	}
	response, err := c.post(ctx, method, encoded)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	var envelope struct {
		Result json.RawMessage `json:"result"`
		Error  *rpcError       `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxResponseBytes)).Decode(&envelope); err != nil {
		return fmt.Errorf("decode %s: %w", method, err)
	}
	if envelope.Error != nil {
		return envelope.Error
	}
	if len(envelope.Result) == 0 {
		return fmt.Errorf("%s returned no result", method)
	}
	if err := json.Unmarshal(envelope.Result, result); err != nil {
		return fmt.Errorf("decode %s result: %w", method, err)
	}
	return nil
}

// post sends one JSON-RPC request, backing off briefly when the node is rate
// limiting or temporarily unavailable.
func (c *rpcClient) post(ctx context.Context, method string, body []byte) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("create %s: %w", method, err)
		}
		request.Header.Set("Content-Type", "application/json")
		response, err := c.client.Do(request)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", method, err)
		}
		if response.StatusCode == http.StatusOK {
			return response, nil
		}
		_ = response.Body.Close()
		retryable := response.StatusCode == http.StatusTooManyRequests ||
			response.StatusCode == http.StatusServiceUnavailable
		if !retryable || attempt == maxChainRequestRetries {
			return nil, fmt.Errorf("%s returned HTTP %d", method, response.StatusCode)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(attempt+1) * chainRetryDelay):
		}
	}
}
