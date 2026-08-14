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

	"github.com/NethermindEth/juno/core/crypto"
)

type rpcClient struct {
	url    string
	client *http.Client
}

func newRPCClient(url string) *rpcClient {
	return &rpcClient{
		url:    strings.TrimSpace(url),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *rpcClient) call(
	ctx context.Context,
	contractAddress, entrypoint string,
	calldata []string,
) ([]string, error) {
	if c.url == "" {
		return nil, ErrUnavailable
	}
	selector := crypto.StarknetKeccak([]byte(entrypoint))
	requestBody := rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "starknet_call",
		Params: rpcCallParams{
			Request: rpcFunctionCall{
				ContractAddress:    contractAddress,
				EntryPointSelector: selector.String(),
				Calldata:           calldata,
			},
			BlockID: "latest",
		},
	}
	encoded, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("marshal Starknet call: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(encoded))
	if err != nil {
		return nil, fmt.Errorf("create Starknet call: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call Starknet RPC: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Starknet RPC returned HTTP %d", response.StatusCode)
	}

	var rpcResponse rpcResponse
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1024*1024))
	if err := decoder.Decode(&rpcResponse); err != nil {
		return nil, fmt.Errorf("decode Starknet response: %w", err)
	}
	if rpcResponse.Error != nil {
		return nil, fmt.Errorf("Starknet RPC error %d: %s", rpcResponse.Error.Code, rpcResponse.Error.Message)
	}
	return rpcResponse.Result, nil
}

type rpcRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  rpcCallParams `json:"params"`
}

type rpcCallParams struct {
	Request rpcFunctionCall `json:"request"`
	BlockID string          `json:"block_id"`
}

type rpcFunctionCall struct {
	ContractAddress    string   `json:"contract_address"`
	EntryPointSelector string   `json:"entry_point_selector"`
	Calldata           []string `json:"calldata"`
}

type rpcResponse struct {
	Result []string  `json:"result"`
	Error  *rpcError `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}
