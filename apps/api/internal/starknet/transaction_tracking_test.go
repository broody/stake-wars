package starknet

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/account"
	"github.com/NethermindEth/starknet.go/hash"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
	"stakewars.com/api/internal/database"
	"stakewars.com/api/internal/txjournal"
)

type trackingProvider struct {
	starknetrpc.RPCProvider
	add func(context.Context, *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error)
}

func (p *trackingProvider) AddInvokeTransaction(ctx context.Context, txn *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error) {
	return p.add(ctx, txn)
}

type trackedKeeperAccount struct {
	fakeKeeperAccount
	provider   *journalProvider
	txn        *starknetrpc.BroadcastInvokeTxnV3
	prepareErr error
}

func (a *trackedKeeperAccount) BuildAndSendInvokeTxn(ctx context.Context, calls []starknetrpc.InvokeFunctionCall, _ *account.TxnOptions) (starknetrpc.AddInvokeTransactionResponse, error) {
	a.calls = append(a.calls, calls...)
	if a.prepareErr != nil {
		return starknetrpc.AddInvokeTransactionResponse{}, a.prepareErr
	}
	return a.provider.AddInvokeTransaction(ctx, a.txn)
}

func fixtureInvoke() *starknetrpc.BroadcastInvokeTxnV3 {
	bounds := starknetrpc.ResourceBounds{MaxAmount: "0x1", MaxPricePerUnit: "0x1"}
	return &starknetrpc.BroadcastInvokeTxnV3{
		Type: starknetrpc.TransactionType("INVOKE"), Version: "0x3", SenderAddress: new(felt.Felt).SetUint64(1),
		Nonce: new(felt.Felt), Calldata: []*felt.Felt{new(felt.Felt).SetUint64(527)},
		Signature: []*felt.Felt{new(felt.Felt).SetUint64(999)},
		Tip:       "0x0", ResourceBounds: &starknetrpc.ResourceBoundsMapping{L1Gas: bounds, L2Gas: bounds, L1DataGas: bounds},
		PayMasterData: []*felt.Felt{}, AccountDeploymentData: []*felt.Felt{},
		NonceDataMode: starknetrpc.DAModeL1, FeeMode: starknetrpc.DAModeL1,
	}
}

func trackingDB(t *testing.T) (*sql.DB, *txjournal.Store) {
	t.Helper()
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "history.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db, txjournal.NewStore(db)
}

func TestKeeperPersistsHashBeforeBroadcastAndRecoversLostResponse(t *testing.T) {
	ctx := context.Background()
	db, journal := trackingDB(t)
	txn := fixtureInvoke()
	chainID := new(felt.Felt).SetBytes([]byte("SN_SEPOLIA"))
	expected, err := hash.TransactionHashInvokeV3(txn, chainID)
	if err != nil {
		t.Fatal(err)
	}
	sends := 0
	provider := &journalProvider{chainID: chainID, RPCProvider: &trackingProvider{add: func(ctx context.Context, received *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error) {
		sends++
		if received != txn {
			t.Fatal("signed transaction changed")
		}
		var status, storedHash string
		if err := db.QueryRow(`SELECT status,transaction_hash FROM transaction_attempts`).Scan(&status, &storedHash); err != nil {
			t.Fatal(err)
		}
		if status != "broadcasting" || storedHash != expected.String() {
			t.Fatalf("transmitted before durable hash: %s %s", status, storedHash)
		}
		return starknetrpc.AddInvokeTransactionResponse{}, context.DeadlineExceeded
	}}}
	account := &trackedKeeperAccount{provider: provider, txn: txn}
	keeper := &AccountSupplyDropSubmitter{account: account, journal: journal, network: "SN_SEPOLIA", keeperAddress: "0x1", supplyDropSystem: new(felt.Felt).SetUint64(2)}
	got, err := keeper.LockSupplyDrop(ctx, 7)
	if got != expected.String() || !errors.Is(err, ErrKeeperTransactionPending) {
		t.Fatalf("uncertain broadcast lost: %s %v", got, err)
	}
	// Rebuild the submitter as on API startup, without its old in-memory hash.
	restartedAccount := &fakeKeeperAccount{waitErrors: []error{context.DeadlineExceeded, nil}}
	restarted := &AccountSupplyDropSubmitter{account: restartedAccount, journal: journal, network: "SN_SEPOLIA", keeperAddress: "0x1", supplyDropSystem: new(felt.Felt).SetUint64(2)}
	if err := restarted.restorePending(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := restarted.LockSupplyDrop(ctx, 8); !errors.Is(err, ErrKeeperTransactionPending) {
		t.Fatalf("resent unresolved transaction: %v", err)
	}
	if err := restarted.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	if sends != 1 || len(restartedAccount.calls) != 0 || restarted.pending != nil {
		t.Fatal("recovery resent or lost transaction")
	}
	var status string
	var events int
	if err := db.QueryRow(`SELECT status FROM transaction_attempts`).Scan(&status); err != nil || status != "succeeded" {
		t.Fatalf("receipt not durable: %s %v", status, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM transaction_attempt_events WHERE status='unknown'`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("old errors overwritten: %d %v", events, err)
	}
}

func TestKeeperJournalFailureBlocksBroadcast(t *testing.T) {
	ctx := context.Background()
	db, journal := trackingDB(t)
	id, err := journal.Begin(ctx, txjournal.Metadata{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER fail_broadcast BEFORE INSERT ON transaction_attempt_events WHEN NEW.stage='broadcast' BEGIN SELECT RAISE(FAIL,'disk unavailable'); END`); err != nil {
		t.Fatal(err)
	}
	provider := &journalProvider{chainID: new(felt.Felt).SetUint64(1), RPCProvider: &trackingProvider{add: func(context.Context, *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error) {
		t.Fatal("broadcast despite journal failure")
		return starknetrpc.AddInvokeTransactionResponse{}, nil
	}}}
	attempt := &broadcastAttempt{store: journal, id: id}
	_, err = provider.AddInvokeTransaction(context.WithValue(ctx, attemptContextKey{}, attempt), fixtureInvoke())
	if err == nil || attempt.hash != nil {
		t.Fatal("broadcast failure was not fail-closed")
	}
	pending, err := journal.Pending(ctx, "", "", "")
	if err != nil || len(pending) != 1 || pending[0].Status != "preparing" {
		t.Fatalf("partial journal update: %v %v", pending, err)
	}
}

func TestKeeperPreparationErrorRecordsRPCDataAndRetryHistory(t *testing.T) {
	ctx := context.Background()
	db, journal := trackingDB(t)
	rpcErr := &starknetrpc.RPCError{Code: 41, Message: "Transaction execution error", Data: &starknetrpc.TransactionExecErrData{TransactionIndex: 0, ExecutionError: starknetrpc.ContractExecutionError{Message: "challenge already settled"}}}
	account := &trackedKeeperAccount{prepareErr: rpcErr}
	keeper := &AccountSupplyDropSubmitter{account: account, journal: journal, network: "SN_SEPOLIA", keeperAddress: "0x1", supplyDropSystem: new(felt.Felt).SetUint64(2)}
	for i := 0; i < 2; i++ {
		if _, err := keeper.LockSupplyDrop(ctx, 7); err == nil {
			t.Fatal("expected failure")
		}
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM transaction_attempts WHERE status='failed' AND transaction_hash=''`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("retry history lost: %d %v", count, err)
	}
	var code int
	var data string
	if err := db.QueryRow(`SELECT rpc_code,error_data FROM transaction_attempt_events WHERE status='failed' LIMIT 1`).Scan(&code, &data); err != nil || code != 41 || !strings.Contains(data, "challenge already settled") || !strings.Contains(data, "transaction_index") {
		t.Fatalf("RPC details lost: %d %s %v", code, data, err)
	}
}

func TestKeeperRecoveryInterruptsOnlyPreBroadcastAttempts(t *testing.T) {
	ctx := context.Background()
	db, journal := trackingDB(t)
	if _, err := journal.Begin(ctx, txjournal.Metadata{Network: "SN_SEPOLIA", Source: "keeper", Account: "0x1"}); err != nil {
		t.Fatal(err)
	}
	keeper := &AccountSupplyDropSubmitter{journal: journal, network: "SN_SEPOLIA", keeperAddress: "0x1"}
	if err := keeper.restorePending(ctx); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := db.QueryRow(`SELECT status FROM transaction_attempts`).Scan(&status); err != nil || status != "interrupted" || keeper.pending != nil {
		t.Fatalf("unsafe recovery: %s %v", status, err)
	}
}
