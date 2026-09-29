package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChainClientRetriesRateLimitsAndDecodesEvents(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if requests == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		var request struct {
			Method string `json:"method"`
			Params struct {
				Filter map[string]any `json:"filter"`
			} `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.Method != "starknet_getEvents" || request.Params.Filter["continuation_token"] != "7-1" {
			t.Fatalf("unexpected request %+v", request)
		}
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"events":[
			{"from_address":"0x5a","keys":["0x1"],"data":["0x2"],"block_number":9,"transaction_hash":"0xa","transaction_index":3,"event_index":4},
			{"from_address":"0x5a","keys":["0x1"],"data":[],"block_number":9,"transaction_hash":"0xb"},
			{"from_address":"0x5a","keys":["0x1"],"data":[],"block_number":9,"transaction_hash":"0xb"}
		],"continuation_token":"9-2"}}`))
	}))
	defer server.Close()

	page, err := NewChainClient(server.URL).Events(context.Background(), EventFilter{
		FromBlock: 1, ToBlock: 10, Keys: [][]string{{"0x1"}}, ChunkSize: 3, ContinuationToken: "7-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || page.ContinuationToken != "9-2" || len(page.Events) != 3 {
		t.Fatalf("unexpected page after %d requests: %+v", requests, page)
	}
	if first := page.Events[0]; first.TransactionIndex != 3 || first.EventIndex != 4 || first.BlockNumber != 9 {
		t.Fatalf("unexpected first event %+v", first)
	}
	// Without node indices, events are numbered within their transaction.
	if page.Events[1].EventIndex != 0 || page.Events[2].EventIndex != 1 {
		t.Fatalf("unexpected fallback event indices %+v", page.Events[1:])
	}
}

func TestChainClientReportsRPCErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":20,"message":"Contract not found"}}`))
	}))
	defer server.Close()

	deployed, err := NewChainClient(server.URL).Deployed(context.Background(), "0x5a", 12)
	if err != nil || deployed {
		t.Fatalf("expected an undeployed contract, got %t %v", deployed, err)
	}
	_, err = NewChainClient(server.URL).Call(context.Background(), "0x5a", "get_tokens", nil, nil)
	if !IsRPCError(err, RPCContractNotFound) {
		t.Fatalf("expected a contract-not-found RPC error, got %v", err)
	}
}
