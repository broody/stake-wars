package networkstats

import (
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testPoolAddress = "0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6"

func TestToriiReaderAggregatesLatestPoolBalancesAndCaches(t *testing.T) {
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/graphql" || r.Method != http.MethodPost {
			t.Fatalf("unexpected Torii request %s %s", r.Method, r.URL.Path)
		}
		var request struct {
			Query     string `json:"query"`
			Variables struct {
				After *string `json:"after"`
			} `json:"variables"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(request.Query, "StakeWarsOccupiedSectors") {
			_, _ = w.Write([]byte(`{"data":{
          "stakewarsSectorModels":{"edges":[
            {"node":{"controller":"0x111","controller_generation":"0x2"}},
            {"node":{"controller":"0x222","controller_generation":"0x1"}},
            {"node":{"controller":"0x333","controller_generation":"0x3"}},
            {"node":{"controller":"0x0","controller_generation":"0x0"}}
          ]},
          "stakewarsOperatorStateModels":{"edges":[
            {"node":{"operator":"0x111","generation":"0x2"}},
            {"node":{"operator":"0x222","generation":"0x2"}},
            {"node":{"operator":"0x333","generation":"0x3"}}
          ]}
        }}`))
			return
		}
		if !strings.Contains(request.Query, poolMemberBalanceChangedSelector) {
			t.Fatal("stats query omitted the pool balance selector")
		}

		if request.Variables.After == nil {
			_, _ = w.Write([]byte(`{"data":{"events":{"edges":[
          {"cursor":"one","node":{"id":"0x20:0xaaa:0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6:0x1","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x111"],"data":["0xa","0xc"],"executedAt":"2026-08-30T12:00:00Z"}},
          {"cursor":"two","node":{"id":"0x1f:0xbbb:0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6:0x2","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x222"],"data":["0x5","0x0"],"executedAt":"2026-08-30T11:00:00Z"}},
          {"cursor":"other","node":{"id":"0x30:0xccc:0x333:0x1","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x999"],"data":["0x0","0xffff"],"executedAt":"2026-08-30T13:00:00Z"}}
        ],"pageInfo":{"hasNextPage":true,"endCursor":"page-2"}}}}`))
			return
		}
		if *request.Variables.After != "page-2" {
			t.Fatalf("unexpected cursor %q", *request.Variables.After)
		}
		_, _ = w.Write([]byte(`{"data":{"events":{"edges":[
        {"cursor":"old-one","node":{"id":"0x10:0xddd:0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6:0x1","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x111"],"data":["0x0","0xa"],"executedAt":"2026-08-29T12:00:00Z"}},
        {"cursor":"old-two","node":{"id":"0x11:0xeee:0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6:0x1","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x222"],"data":["0x0","0x5"],"executedAt":"2026-08-29T13:00:00Z"}},
        {"cursor":"three","node":{"id":"0x12:0xfff:0x755e4fbfd6ca9a17e532a0eb3027dd3202957d5bcc2912cbc5a7fb199cc78c6:0x1","keys":["0x3b0fee275c2f63e42b158a5cc9b25763eae5e381838169c0d71894c17dd28f7","0x333"],"data":["0x0","0x14"],"executedAt":"2026-08-29T14:00:00Z"}}
      ],"pageInfo":{"hasNextPage":false,"endCursor":"done"}}}}`))
	}))
	defer upstream.Close()

	reader, err := NewToriiReader(upstream.URL, testPoolAddress, "SN_SEPOLIA")
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := reader.Current(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.TotalStaked != "32" || snapshot.ActiveOperators != 2 || snapshot.OccupiedSectors != 2 {
		t.Fatalf("unexpected aggregate: %+v", snapshot)
	}
	if snapshot.Network != "SN_SEPOLIA" || snapshot.UpdatedAt.Format("2006-01-02T15:04:05Z") != "2026-08-30T12:00:00Z" {
		t.Fatalf("unexpected snapshot metadata: %+v", snapshot)
	}

	if _, err := reader.Current(context.Background()); err != nil {
		t.Fatal(err)
	}
	if requests != 3 {
		t.Fatalf("expected two event pages, one occupancy query, and a cache hit; got %d requests", requests)
	}
}

func TestNewToriiReaderRequiresCompleteConfiguration(t *testing.T) {
	reader, err := NewToriiReader("", "", "SN_MAIN")
	if err != nil || reader != nil {
		t.Fatalf("expected disabled reader, got reader=%v err=%v", reader, err)
	}
	if _, err := NewToriiReader("http://127.0.0.1:8081", "", "SN_MAIN"); err == nil {
		t.Fatal("expected partial configuration to fail")
	}
}

func TestLatestBalanceChainsSameBlockTransitions(t *testing.T) {
	events := []balanceEvent{
		{oldAmount: bigInt("20"), newAmount: bigInt("30"), sequence: 1},
		{oldAmount: bigInt("10"), newAmount: bigInt("20"), sequence: 0},
	}
	if got := latestBalance(events).String(); got != "30" {
		t.Fatalf("expected terminal same-block balance 30, got %s", got)
	}
}

func bigInt(value string) *big.Int {
	parsed, ok := new(big.Int).SetString(value, 10)
	if !ok {
		panic("invalid test integer")
	}
	return parsed
}
