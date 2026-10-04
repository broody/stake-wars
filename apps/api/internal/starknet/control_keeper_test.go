package starknet

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/NethermindEth/juno/core/felt"
)

func TestOperatorListerReturnsPlayedUnretiredOperatorsAcrossPages(t *testing.T) {
	pages := map[string]string{
		"": `{"data":{"stakewarsOperatorStateModels":{
			"edges":[
				{"node":{"operator":"0x0A","generation":"0x1","retired":false}},
				{"node":{"operator":"0xb","generation":"0x2","retired":true}}
			],
			"pageInfo":{"hasNextPage":true,"endCursor":"next"}}}}`,
		"next": `{"data":{"stakewarsOperatorStateModels":{
			"edges":[
				{"node":{"operator":"0xc","generation":"0x0","retired":false}},
				{"node":{"operator":"0xd","generation":"0x3","retired":false}},
				{"node":{"operator":"0xa","generation":"0x1","retired":false}},
				{"node":null}
			],
			"pageInfo":{"hasNextPage":false,"endCursor":"end"}}}}`,
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/graphql" {
			t.Errorf("unexpected Torii path %s", r.URL.Path)
		}
		var request struct {
			Variables struct {
				After *string `json:"after"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
		}
		after := ""
		if request.Variables.After != nil {
			after = *request.Variables.After
		}
		_, _ = w.Write([]byte(pages[after]))
	}))
	defer server.Close()

	lister, err := NewOperatorLister(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	operators, err := lister.ActiveOperators(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []string{mustNormalizeAddress(t, "0xa"), mustNormalizeAddress(t, "0xd")}
	if !reflect.DeepEqual(operators, want) {
		t.Fatalf("unexpected active Operators: %v", operators)
	}
}

func TestOperatorListerRejectsToriiErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"errors":[{"message":"unknown model"}]}`))
	}))
	defer server.Close()

	lister, err := NewOperatorLister(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lister.ActiveOperators(context.Background()); err == nil ||
		!strings.Contains(err.Error(), "unknown model") {
		t.Fatalf("expected the Torii rejection: %v", err)
	}
	if _, err := NewOperatorLister(" "); err == nil {
		t.Fatal("expected a missing Torii URL to be rejected")
	}
}

func TestKeeperSubmitsOperatorSyncBatch(t *testing.T) {
	account := &fakeKeeperAccount{}
	keeper := &AccountSupplyDropSubmitter{account: account, supplyDropSystem: new(felt.Felt).SetUint64(111)}
	submitter, err := NewControlSubmitter(keeper, "0xde")
	if err != nil {
		t.Fatal(err)
	}
	hash, err := submitter.SyncOperators(context.Background(), []string{"0xa", "0xb"})
	if err != nil {
		t.Fatal(err)
	}
	if hash != "0x1" || len(account.calls) != 1 {
		t.Fatalf("unexpected submission: %s, %v", hash, account.calls)
	}
	call := account.calls[0]
	if call.FunctionName != "sync_operators" || call.ContractAddress.Uint64() != 0xde ||
		len(call.CallData) != 3 || call.CallData[0].Uint64() != 2 ||
		call.CallData[1].Uint64() != 0xa || call.CallData[2].Uint64() != 0xb {
		t.Fatalf("incorrect sync_operators call: %+v", call)
	}
}

func TestKeeperRejectsInvalidOperatorSyncBatches(t *testing.T) {
	account := &fakeKeeperAccount{}
	keeper := &AccountSupplyDropSubmitter{account: account, supplyDropSystem: new(felt.Felt).SetUint64(111)}
	submitter, err := NewControlSubmitter(keeper, "0xde")
	if err != nil {
		t.Fatal(err)
	}
	oversized := make([]string, MaxSyncBatch+1)
	for i := range oversized {
		oversized[i] = "0xa"
	}
	for name, operators := range map[string][]string{
		"empty": {}, "oversized": oversized, "zero operator": {"0x0"}, "malformed": {"operator"},
	} {
		if _, err := submitter.SyncOperators(context.Background(), operators); err == nil {
			t.Fatalf("expected the %s batch to be rejected", name)
		}
	}
	if len(account.calls) != 0 {
		t.Fatalf("keeper submitted an invalid batch: %v", account.calls)
	}
	if _, err := NewControlSubmitter(nil, "0xde"); err == nil {
		t.Fatal("expected a missing keeper signer to be rejected")
	}
}

func mustNormalizeAddress(t *testing.T, value string) string {
	t.Helper()
	address, err := normalizeAddress(value)
	if err != nil {
		t.Fatal(err)
	}
	return address
}
