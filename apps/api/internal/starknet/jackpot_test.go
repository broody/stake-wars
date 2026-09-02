package starknet

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJackpotReaderUsesToriiForDiscoveryAndRPCForCanonicalState(t *testing.T) {
	server := jackpotReaderServer(t, "0x7", jackpotResult())
	defer server.Close()
	reader, err := NewJackpotReader(server.URL, server.URL, "0x123")
	if err != nil {
		t.Fatal(err)
	}

	jackpot, err := reader.ActiveJackpot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if jackpot.ID != 7 || jackpot.Status != 2 || jackpot.EndsAt != 100 || jackpot.RandomnessBlock != 0 {
		t.Fatalf("unexpected jackpot: %+v", jackpot)
	}
	head, err := reader.ChainHead(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if head.BlockNumber != 500 || head.Timestamp != 110 {
		t.Fatalf("unexpected chain head: %+v", head)
	}
}

func TestJackpotReaderReportsNoActiveJackpot(t *testing.T) {
	server := jackpotReaderServer(t, "0x0", nil)
	defer server.Close()
	reader, err := NewJackpotReader(server.URL, server.URL, "0x123")
	if err != nil {
		t.Fatal(err)
	}

	_, err = reader.ActiveJackpot(context.Background())
	if !errors.Is(err, ErrNoActiveJackpot) {
		t.Fatalf("expected no active jackpot, got %v", err)
	}
}

func TestJackpotSubmitterRejectsPrivateKeyMismatch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1, "result": []string{"0x123"},
		})
	}))
	defer server.Close()

	_, err := NewJackpotSubmitter(
		context.Background(), server.URL, "0x123", "0x456", "0x1",
	)
	if err == nil {
		t.Fatal("expected keeper key mismatch to fail")
	}
}

func jackpotReaderServer(
	t *testing.T,
	activeID string,
	jackpot []string,
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
					"stakewarsJackpotCounterModels": map[string]any{
						"edges": []any{map[string]any{
							"node": map[string]any{"active_id": activeID},
						}},
					},
				},
			})
		case "starknet_call":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1, "result": jackpot,
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

func jackpotResult() []string {
	return []string{
		"0x7", "0x2", "0xabc", "0x1", "0xdef",
		"0x0", "0x0", "0x64", "0x0", "0x111", "0x7d0",
		"0x258", "0x10", "0x64", "0x0", "0x0", "0x0", "0x0",
		"0x0", "0x0", "0x0", "0x0", "0x0",
	}
}
