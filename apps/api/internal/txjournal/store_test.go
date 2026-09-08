package txjournal

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"stakewars.com/api/internal/database"
)

func TestHistorySurvivesCancellationRetryAndReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "history.db")
	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	store := NewStore(db)
	metadata := Metadata{Network: "SN_SEPOLIA", Source: "keeper", Account: "0x1", Contract: "0x2", Entrypoint: "settle_challenge", TargetID: "527"}
	first, err := store.Begin(ctx, metadata)
	if err != nil {
		t.Fatal(err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	code := 41
	if err := store.Record(cancelled, first, Event{Stage: "prepare", Status: "failed", Code: &code, Message: "Transaction execution error", Data: `{"transaction_index":0,"execution_error":{"contract_address":"0x2","error":"challenge not expired"},"request":{"calldata":["DO_NOT_STORE"]}}`}); err != nil {
		t.Fatal(err)
	}
	second, err := store.Begin(ctx, metadata)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Record(ctx, second, Event{Stage: "broadcast", Status: "submitted", Hash: "0xabc"}); err != nil {
		t.Fatal(err)
	}
	if err := store.Record(ctx, second, Event{Stage: "receipt", Status: "succeeded", Hash: "0xabc"}); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM transaction_attempts`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("attempts lost: %d %v", count, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM transaction_attempt_events`).Scan(&count); err != nil || count != 5 {
		t.Fatalf("events lost: %d %v", count, err)
	}
	var status, message, data string
	var savedCode int
	if err := db.QueryRow(`SELECT a.status,e.rpc_code,e.error_message,e.error_data FROM transaction_attempts a JOIN transaction_attempt_events e ON a.id=e.attempt_id WHERE a.id=? AND e.stage='prepare' AND e.status='failed'`, first).Scan(&status, &savedCode, &message, &data); err != nil {
		t.Fatal(err)
	}
	if status != "failed" || savedCode != 41 || !strings.Contains(data, "challenge not expired") || strings.Contains(data, "DO_NOT_STORE") {
		t.Fatalf("diagnostics lost or leaked: %s %d %s %s", status, savedCode, message, data)
	}
	if pending, err := NewStore(db).Pending(ctx, "SN_SEPOLIA", "keeper", "0x1"); err != nil || len(pending) != 0 {
		t.Fatalf("terminal attempts pending: %v %v", pending, err)
	}
	history, err := NewStore(db).History(ctx, Filter{Limit: 1, TargetID: "527"})
	if err != nil || len(history) != 1 || history[0].ID != second || history[0].EventCount != 3 || len(history[0].Events) != 3 {
		t.Fatalf("incorrect history report: %+v %v", history, err)
	}
	history, err = NewStore(db).History(ctx, Filter{Limit: 20, AttemptID: first})
	if err != nil || len(history) != 1 || history[0].Events[1].Code == nil || *history[0].Events[1].Code != 41 {
		t.Fatalf("missing prior attempt diagnostic: %+v %v", history, err)
	}
}

func TestSafeDiagnosticsRetainOnlyBoundedPublicErrors(t *testing.T) {
	for _, input := range []string{
		`RPC request payload {"calldata":["DO_NOT_STORE"]}`,
		`private_key=DO_NOT_STORE`,
		`Bearer DO_NOT_STORE`,
		`proof: DO_NOT_STORE`,
	} {
		if got := SafeText(input); strings.Contains(got, "DO_NOT_STORE") {
			t.Fatalf("sensitive message persisted: %s", got)
		}
	}
	if got := SafeText("POST https://rpc.example/DO_NOT_STORE failed: timeout"); strings.Contains(got, "DO_NOT_STORE") || !strings.Contains(got, "timeout") {
		t.Fatalf("unsafe endpoint: %s", got)
	}
	if got := SafeData(`{"execution_error":{"error":"expired","calldata":["DO_NOT_STORE"],"proof":"DO_NOT_STORE"},"secret":"DO_NOT_STORE"}`); strings.Contains(got, "DO_NOT_STORE") || !strings.Contains(got, "expired") {
		t.Fatalf("unsafe data: %s", got)
	}
	if got := SafeData(strings.Repeat("x", 70*1024)); len(got) > 8192 {
		t.Fatal("unbounded data")
	}
}
