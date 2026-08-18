package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestControlReaderDecodesAuthoritativeViews(t *testing.T) {
	responses := [][]string{
		{"0xc", "0x123", "0x64", "0x2", "0x3e8", "0x6e", "0x1", "0x3", "0x4e20", "0x0", "0x1"},
		{"0x123", "0x3e8", "0x64", "0xc8", "0x12c", "0x190", "0x2", "0x1", "0x2", "0x0", "0x0", "0x0"},
		{"0x1"},
	}
	callIndex := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if callIndex >= len(responses) {
			t.Fatal("unexpected extra RPC call")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  responses[callIndex],
		})
		callIndex++
	}))
	t.Cleanup(server.Close)

	reader, err := NewControlReader(server.URL, "0x999")
	if err != nil {
		t.Fatal(err)
	}

	sector, err := reader.SectorStatus(context.Background(), 12)
	if err != nil {
		t.Fatal(err)
	}
	if sector.ID != 12 || sector.Controller != "0x123" || sector.CaptureForce != "100" ||
		sector.ControlledSince != 1000 || sector.RequiredStake != "110" || !sector.NeedsSync {
		t.Fatalf("unexpected sector status: %+v", sector)
	}

	operator, err := reader.OperatorStatus(context.Background(), "0x123")
	if err != nil {
		t.Fatal(err)
	}
	if operator.LiveDelegatedAmount != "1000" || operator.SectorForce != "100" ||
		operator.ChallengeForce != "200" || operator.SpentForce != "300" ||
		operator.AvailableForce != "400" ||
		operator.ActiveChallengeCount != 2 ||
		operator.Generation != 2 || operator.NeedsSync {
		t.Fatalf("unexpected operator status: %+v", operator)
	}

	canManage, err := reader.CanManageImage(context.Background(), 12, "0x123", 2)
	if err != nil {
		t.Fatal(err)
	}
	if !canManage {
		t.Fatal("expected image authorization")
	}
}

func TestControlReaderRejectsMalformedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":["0x2"]}`))
	}))
	t.Cleanup(server.Close)

	reader, err := NewControlReader(server.URL, "0x999")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := reader.CanManageImage(context.Background(), 12, "0x123", 2); err == nil {
		t.Fatal("expected invalid boolean response")
	}
}
