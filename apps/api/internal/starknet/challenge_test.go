package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestChallengeReaderPaginatesAndDeduplicatesCandidates(t *testing.T) {
	var cursors []*string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		var payload struct {
			Query     string
			Variables struct{ After *string }
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		if req.URL.Path != "/torii/graphql" || payload.Query != contestedSectorsQuery {
			t.Errorf("unexpected discovery request")
		}
		cursors = append(cursors, payload.Variables.After)
		edges := []any{map[string]any{"node": map[string]any{"id": 527, "active_challenge_id": "0x2"}}}
		if len(cursors) == 2 {
			edges = append(edges, map[string]any{"node": map[string]any{"id": 0, "active_challenge_id": "0x3"}})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"stakewarsSectorModels": map[string]any{
			"edges": edges, "pageInfo": map[string]any{"hasNextPage": len(cursors) == 1, "endCursor": "page-1"},
		}}})
	}))
	defer server.Close()
	reader, err := NewChallengeReader(server.URL, server.URL+"/torii/", "0x123")
	if err != nil {
		t.Fatal(err)
	}
	got, err := reader.ContestedSectors(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []ChallengeCandidate{{SectorID: 0, ChallengeID: 3}, {SectorID: 527, ChallengeID: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	if len(cursors) != 2 || cursors[0] != nil || cursors[1] == nil || *cursors[1] != "page-1" {
		t.Fatalf("incorrect cursors: %v", cursors)
	}
}

func TestChallengeReaderRejectsIncompleteOrMalformedIndex(t *testing.T) {
	for name, body := range map[string]string{
		"missing collection":     `{"data":{}}`,
		"missing pagination":     `{"data":{"stakewarsSectorModels":{"edges":[]}}}`,
		"missing next-page flag": `{"data":{"stakewarsSectorModels":{"edges":[],"pageInfo":{}}}}`,
		"missing cursor":         `{"data":{"stakewarsSectorModels":{"edges":[],"pageInfo":{"hasNextPage":true}}}}`,
		"repeated cursor":        `{"data":{"stakewarsSectorModels":{"edges":[],"pageInfo":{"hasNextPage":true,"endCursor":"loop"}}}}`,
		"invalid ID":             `{"data":{"stakewarsSectorModels":{"edges":[{"node":{"id":-1,"active_challenge_id":"0x2"}}],"pageInfo":{}}}}`,
		"missing ID":             `{"data":{"stakewarsSectorModels":{"edges":[{"node":{"active_challenge_id":"0x2"}}],"pageInfo":{}}}}`,
		"invalid challenge":      `{"data":{"stakewarsSectorModels":{"edges":[{"node":{"id":527,"active_challenge_id":"0x10000000000000000"}}],"pageInfo":{}}}}`,
		"zero challenge":         `{"data":{"stakewarsSectorModels":{"edges":[{"node":{"id":527,"active_challenge_id":"0x0"}}],"pageInfo":{}}}}`,
		"GraphQL error":          `{"data":{"stakewarsSectorModels":{"edges":[],"pageInfo":{}}},"errors":[{"message":"index unavailable"}]}`,
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
			defer server.Close()
			reader, err := NewChallengeReader(server.URL, server.URL, "0x123")
			if err != nil {
				t.Fatal(err)
			}
			if _, err := reader.ContestedSectors(context.Background()); err == nil {
				t.Fatal("accepted invalid index response")
			}
		})
	}
}

func TestChallengeReaderReadsCanonicalSectorAndTimestamp(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		var payload struct {
			Method string
			Params json.RawMessage
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil {
			t.Error(err)
			return
		}
		var result any
		switch payload.Method {
		case "starknet_call":
			var params rpcCallParams
			if err := json.Unmarshal(payload.Params, &params); err != nil {
				t.Error(err)
				return
			}
			if params.BlockID != "latest" || params.Request.ContractAddress != "0x123" || !reflect.DeepEqual(params.Request.Calldata, []string{"0x20f"}) {
				t.Errorf("incorrect Control call: %+v", params)
			}
			result = []string{"0x20f", "0x456", "0xa", "0x1", "0x1", "0xb", "0x2", "0x1", "0x64", "0x0", "0x0"}
		case "starknet_getBlockWithTxHashes":
			result = map[string]any{"block_number": 200, "timestamp": 100}
		default:
			t.Errorf("unexpected method: %s", payload.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": result})
	}))
	defer server.Close()
	reader, err := NewChallengeReader(server.URL, server.URL, "0x123")
	if err != nil {
		t.Fatal(err)
	}
	sector, err := reader.SectorStatus(context.Background(), 527)
	if err != nil || sector.ActiveChallengeID != 2 || sector.ChallengeDeadline != 100 {
		t.Fatalf("unexpected sector: %+v, %v", sector, err)
	}
	head, err := reader.ChainHead(context.Background())
	if err != nil || head.Timestamp != 100 || head.BlockNumber != 200 {
		t.Fatalf("unexpected head: %+v, %v", head, err)
	}
}
