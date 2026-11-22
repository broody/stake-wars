package starknet

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/hash"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
	"github.com/NethermindEth/starknet.go/typeddata"
	"net/http"
	"net/http/httptest"
	"stakewars.com/api/internal/survivor"
	"testing"
)

func TestSurvivorMessageMatchesWalletHashAndOutisClass(t *testing.T) {
	// Hash generated independently with the frontend's starknet.js typedData.getMessageHash.
	const browserHash = "0x12415970df68f8467453e51ca869c98d5cd1987f8f62d08e0e108b641e8f40c"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string
			Params json.RawMessage
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
			return
		}
		switch req.Method {
		case "starknet_getClassHashAt":
			var p map[string]string
			if err := json.Unmarshal(req.Params, &p); err != nil || p["block_id"] != "latest" {
				t.Error(err, p)
			}
			class := "0x123"
			if p["contract_address"] == "0x123" {
				class = "0x00" + outisWalletClass[2:]
			}
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":1,"result":%q}`, class)
		case "starknet_call":
			var p rpcCallParams
			if err := json.Unmarshal(req.Params, &p); err != nil {
				t.Error(err)
				return
			}
			result := "0x0"
			if p.Request.ContractAddress == "0x123" && len(p.Request.Calldata) == 3 && p.Request.Calldata[0] == browserHash {
				result = validatedResponse
			}
			fmt.Fprintf(w, `{"jsonrpc":"2.0","id":1,"result":[%q]}`, result)
		default:
			t.Error(req.Method)
		}
	}))
	defer server.Close()
	chain := NewChainClient(server.URL)
	for _, wallet := range []string{"0x123", "0x456"} {
		outis, err := chain.IsOutis(t.Context(), wallet)
		if err != nil || outis != (wallet == "0x123") {
			t.Fatal(wallet, outis, err)
		}
	}
	v := NewVerifier(server.URL, "SN_SEPOLIA")
	for _, name := range []string{"Signal", "Orbit"} {
		message, err := SurvivorNameData("SN_SEPOLIA", "0x123", name, 1)
		if err != nil {
			t.Fatal(err)
		}
		ok, err := v.VerifySurvivorMessage(t.Context(), "0x123", message, []string{"0x1"})
		if err != nil || ok != (name == "Signal") {
			t.Fatal(name, ok, err)
		}
	}
}
func TestSurvivorPayoutRecoverySendsOnce(t *testing.T) {
	ctx := t.Context()
	db, journal := trackingDB(t)
	const network = "SN_SEPOLIA"
	store := survivor.NewStore(db, network)
	// The round closed a moment ago, so the keeper still waits before paying.
	_, err := db.Exec(`INSERT INTO survivor_rounds (id,network,deadline,leader_wallet,leading_destroyed,prize_amount) VALUES (1,?,unixepoch()-1,'0x123',7,?)`, network, survivor.DailyPrize)
	if err != nil {
		t.Fatal(err)
	}
	chainID := new(felt.Felt).SetBytes([]byte(network))
	txn := fixtureInvoke()
	txHash, err := hash.TransactionHashInvokeV3(txn, chainID)
	if err != nil {
		t.Fatal(err)
	}
	sends := 0
	a := &trackedKeeperAccount{txn: txn, provider: &journalProvider{chainID: chainID, RPCProvider: &trackingProvider{add: func(context.Context, *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error) {
		sends++
		return starknetrpc.AddInvokeTransactionResponse{}, context.DeadlineExceeded
	}}}}
	signer := &AccountSupplyDropSubmitter{account: a, journal: journal, network: network, keeperAddress: "0x1"}
	duty := survivor.PayoutDuty{Store: store, Sender: signer}
	if err = duty.Reconcile(ctx); err != nil || sends != 0 {
		t.Fatal("paid before the payout delay", err)
	}
	if _, err = db.Exec("UPDATE survivor_rounds SET deadline=1 WHERE id=1"); err != nil {
		t.Fatal(err)
	}
	if err = duty.Reconcile(ctx); !errors.Is(err, ErrKeeperTransactionPending) || sends != 1 {
		t.Fatal(sends, err)
	}
	call := a.calls[0]
	token, _ := feltFromHex(STRKToken)
	amount, _ := new(felt.Felt).SetString(survivor.DailyPrize)
	if call.FunctionName != "transfer" || !call.ContractAddress.Equal(token) || len(call.CallData) != 3 || call.CallData[0].String() != "0x123" || !call.CallData[1].Equal(amount) || !call.CallData[2].IsZero() {
		t.Fatal(call)
	}

	restarted := &AccountSupplyDropSubmitter{account: &fakeKeeperAccount{}, journal: journal, network: network, keeperAddress: "0x1"}
	if err = restarted.restorePending(ctx); err != nil {
		t.Fatal(err)
	}
	duty.Sender = restarted
	if err = duty.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if err = restarted.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if err = duty.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = restarted.PaySurvivor(ctx, "survivor-round:1", "0x123", survivor.DailyPrize); err == nil {
		t.Fatal("journal admitted a duplicate payment")
	}
	b, err := store.Board(ctx, 1)
	if err != nil || b.Round.PaymentStatus != "succeeded" || b.Round.TransactionHash != txHash.String() || len(restarted.account.(*fakeKeeperAccount).calls) != 0 {
		t.Fatal(b, err)
	}
}

// Hashes were generated independently with the web client's starknet.js.
func TestSurvivorWalletNameHash(t *testing.T) {
	for name, want := range map[string]string{"Signal": "0x12415970df68f8467453e51ca869c98d5cd1987f8f62d08e0e108b641e8f40c", "月光✨": "0x699b61e77d0a1f95e343db64662613b59cef33142242e696e9b22244db39f89", "000123": "0x1e2bcf75150b13ba95a1b6aa89aea6a3ca6389928654f907b1dfde57e0e1219"} {
		data, err := SurvivorNameData("SN_SEPOLIA", "0x123", name, 1)
		if err != nil {
			t.Fatal(err)
		}
		var message typeddata.TypedData
		if err = json.Unmarshal(data, &message); err != nil {
			t.Fatal(err)
		}
		h, err := message.GetMessageHash("0x123")
		if err != nil || h.String() != want {
			t.Fatalf("%s: %v %v", name, h, err)
		}
	}
}
