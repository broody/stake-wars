package starknet

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSupplyDropReaderUsesToriiForDiscoveryAndRPCForCanonicalState(t *testing.T) {
	server := supplyDropReaderServer(t, "0x7", supplyDropResult())
	defer server.Close()
	reader, err := NewSupplyDropReader(server.URL, server.URL, "0x123")
	if err != nil {
		t.Fatal(err)
	}

	supply_drop, err := reader.ActiveSupplyDrop(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if supply_drop.ID != 7 || supply_drop.Status != 2 || supply_drop.EndsAt != 100 || supply_drop.RandomnessBlock != 0 {
		t.Fatalf("unexpected supply_drop: %+v", supply_drop)
	}
	head, err := reader.ChainHead(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if head.BlockNumber != 500 || head.Timestamp != 110 {
		t.Fatalf("unexpected chain head: %+v", head)
	}
}

func TestSupplyDropReaderReportsNoActiveSupplyDrop(t *testing.T) {
	server := supplyDropReaderServer(t, "0x0", nil)
	defer server.Close()
	reader, err := NewSupplyDropReader(server.URL, server.URL, "0x123")
	if err != nil {
		t.Fatal(err)
	}

	_, err = reader.ActiveSupplyDrop(context.Background())
	if !errors.Is(err, ErrNoActiveSupplyDrop) {
		t.Fatalf("expected no active supply_drop, got %v", err)
	}
}

func TestSupplyDropSubmitterRejectsPrivateKeyMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": []string{"0x123"},
		})
	}))
	defer server.Close()

	_, err := NewSupplyDropSubmitter(
		context.Background(), server.URL, "0x123", "0x456", "0x1",
	)
	if err == nil {
		t.Fatal("expected keeper key mismatch to fail")
	}
}

func TestKeeperReadyOwnerKey(t *testing.T) {
	for _, test := range []struct {
		name, class       string
		owners, guardians []string
		wantKey           bool
	}{
		{"single Stark owner", readyAccountV050, []string{"0x1", "0x0", "0x123", "0xabc"}, []string{"0x0"}, true},
		{"unknown class", "0x1", nil, nil, false},
		{"two owners", readyAccountV050, []string{"0x2", "0x0", "0x123", "0xabc", "0x0", "0x234", "0xdef"}, []string{"0x0"}, false},
		{"different signer type", readyAccountV050, []string{"0x1", "0x1", "0x123", "0xabc"}, []string{"0x0"}, false},
		{"guardian", readyAccountV050, []string{"0x1", "0x0", "0x123", "0xabc"}, []string{"0x1", "0x0", "0x234", "0xdef"}, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Method string
					Params struct{ Request rpcFunctionCall }
				}
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
					return
				}
				reply := map[string]any{"jsonrpc": "2.0", "id": 1}
				switch {
				case request.Method == "starknet_getClassHashAt":
					reply["result"] = test.class
				case request.Params.Request.EntryPointSelector == Selector("get_public_key"):
					reply["error"] = map[string]any{"code": RPCEntrypointNotFound, "message": "Entry point not found"}
				case request.Params.Request.EntryPointSelector == Selector("get_owners_info"):
					reply["result"] = test.owners
				case request.Params.Request.EntryPointSelector == Selector("get_guardians_info"):
					reply["result"] = test.guardians
				default:
					t.Errorf("unexpected RPC request %v", request)
				}
				_ = json.NewEncoder(w).Encode(reply)
			}))
			defer server.Close()
			key, err := keeperPublicKey(context.Background(), NewChainClient(server.URL), "0x456")
			if test.wantKey != (err == nil) || test.wantKey && (len(key) != 1 || key[0] != "0xabc") {
				t.Fatalf("unexpected key %v, error %v", key, err)
			}
		})
	}
}

func supplyDropReaderServer(
	t *testing.T,
	activeID string,
	supply_drop []string,
) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		var payload struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Error(err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch payload.Method {
		case "":
			if request.URL.Path != "/graphql" {
				t.Errorf("unexpected Torii path %q", request.URL.Path)
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": map[string]any{
					"stakewarsSupplyDropCounterModels": map[string]any{
						"edges": []any{map[string]any{
							"node": map[string]any{"active_id": activeID},
						}},
					},
				},
			})
		case "starknet_call":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1, "result": supply_drop,
			})
		case "starknet_getBlockWithTxHashes":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1,
				"result": map[string]any{"block_number": 500, "timestamp": 110},
			})
		default:
			t.Errorf("unexpected RPC method %q", payload.Method)
			w.WriteHeader(http.StatusBadRequest)
		}
	}))
}

func supplyDropResult() []string {
	return []string{
		"0x7", "0x2", "0xabc", "0x1", "0xdef",
		"0x0", "0x0", "0x64", "0x0", "0x111", "0x7d0",
		"0x258", "0x10", "0x64", "0x0", "0x0", "0x0", "0x0",
		"0x0", "0x0", "0x0", "0x0", "0x0",
	}
}
