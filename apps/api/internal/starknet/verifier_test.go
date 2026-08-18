package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestTypedDataCanBeHashed(t *testing.T) {
	verifier := NewVerifier("", "SN_MAIN")
	wallet, err := verifier.NormalizeWallet("0x000123")
	if err != nil {
		t.Fatal(err)
	}
	if wallet != "0x123" {
		t.Fatalf("expected canonical wallet, got %s", wallet)
	}

	issuedAt := time.Unix(1_700_000_000, 0)
	typedData, err := verifier.TypedData(wallet, "0xabc", issuedAt, issuedAt.Add(5*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	hash, err := messageHash(typedData, wallet)
	if err != nil {
		t.Fatal(err)
	}
	if want := "0x5686adf6296ebb3f46449496c364b0c86337a28d837d3983575e2a931680443"; hash != want {
		t.Fatalf("expected SNIP-12 hash %s, got %s", want, hash)
	}

	var decoded map[string]any
	if err := json.Unmarshal(typedData, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["primaryType"] != primaryType {
		t.Fatalf("unexpected primary type %v", decoded["primaryType"])
	}
}

func TestVerifyCallsAccountContract(t *testing.T) {
	var received rpcRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":["0x56414c4944"]}`))
	}))
	t.Cleanup(server.Close)

	verifier := NewVerifier(server.URL, "SN_MAIN")
	wallet := "0x123"
	issuedAt := time.Unix(1_700_000_000, 0)
	typedData, err := verifier.TypedData(wallet, "0xabc", issuedAt, issuedAt.Add(5*time.Minute))
	if err != nil {
		t.Fatal(err)
	}

	valid, err := verifier.Verify(context.Background(), wallet, typedData, []string{"0x1", "0x2"})
	if err != nil {
		t.Fatal(err)
	}
	if !valid {
		t.Fatal("expected signature to be valid")
	}
	if received.Method != "starknet_call" {
		t.Fatalf("unexpected RPC method %s", received.Method)
	}
	if received.Params.Request.ContractAddress != wallet {
		t.Fatalf("unexpected account %s", received.Params.Request.ContractAddress)
	}
	if got := len(received.Params.Request.Calldata); got != 4 {
		t.Fatalf("expected hash, length and two signature felts, got %d items", got)
	}
}

func TestVerifyAcceptsDecimalSignatureFelts(t *testing.T) {
	var received rpcRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":["0x56414c4944"]}`))
	}))
	t.Cleanup(server.Close)

	verifier := NewVerifier(server.URL, "SN_MAIN")
	wallet := "0x123"
	issuedAt := time.Unix(1_700_000_000, 0)
	typedData, err := verifier.TypedData(wallet, "0xabc", issuedAt, issuedAt.Add(5*time.Minute))
	if err != nil {
		t.Fatal(err)
	}

	valid, err := verifier.Verify(context.Background(), wallet, typedData, []string{"15", "32"})
	if err != nil {
		t.Fatal(err)
	}
	if !valid {
		t.Fatal("expected decimal signature felts to be valid")
	}
	if got, want := received.Params.Request.Calldata[2:], []string{"0xf", "0x20"}; len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("expected normalized signature %v, got %v", want, got)
	}
}

func TestVerifyRequiresRPC(t *testing.T) {
	verifier := NewVerifier("", "SN_MAIN")
	valid, err := verifier.Verify(context.Background(), "0x123", json.RawMessage(`{}`), []string{"0x1"})
	if valid || err == nil {
		t.Fatal("expected unavailable verifier")
	}
}

func TestNormalizeWalletRejectsZero(t *testing.T) {
	verifier := NewVerifier("", "SN_MAIN")
	if _, err := verifier.NormalizeWallet("0x0"); err == nil {
		t.Fatal("expected zero address rejection")
	}
}
