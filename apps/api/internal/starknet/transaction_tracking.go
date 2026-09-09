package starknet

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/hash"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
	"stakewars.com/api/internal/txjournal"
)

type KeeperTracking struct {
	Store   *txjournal.Store
	Network string
}
type attemptContextKey struct{}
type broadcastAttempt struct {
	store *txjournal.Store
	id    int64
	hash  *felt.Felt
}

// Intercept the SDK immediately before transmission. Persist the locally
// computed hash first, without persisting the signed transaction or calldata.
type journalProvider struct {
	starknetrpc.RPCProvider
	chainID *felt.Felt
}

func (p *journalProvider) AddInvokeTransaction(ctx context.Context, txn *starknetrpc.BroadcastInvokeTxnV3) (starknetrpc.AddInvokeTransactionResponse, error) {
	attempt, _ := ctx.Value(attemptContextKey{}).(*broadcastAttempt)
	if attempt == nil {
		return starknetrpc.AddInvokeTransactionResponse{}, fmt.Errorf("transaction journal context is required")
	}
	txHash, err := hash.TransactionHashInvokeV3(txn, p.chainID)
	if err != nil {
		return starknetrpc.AddInvokeTransactionResponse{}, err
	}
	if err = attempt.store.Record(ctx, attempt.id, txjournal.Event{Stage: "broadcast", Status: "broadcasting", Hash: txHash.String()}); err != nil {
		return starknetrpc.AddInvokeTransactionResponse{}, err
	}
	attempt.hash = txHash
	return p.RPCProvider.AddInvokeTransaction(ctx, txn)
}

func transactionError(stage, status, hash string, err error) txjournal.Event {
	e := txjournal.Event{Stage: stage, Status: status, Hash: hash}
	var rpcErr *starknetrpc.RPCError
	if errors.As(err, &rpcErr) {
		e.Code = &rpcErr.Code
		e.Message = rpcErr.Message
		if rpcErr.Data != nil {
			data, marshalErr := json.Marshal(rpcErr.Data)
			if marshalErr == nil {
				e.Data = string(data)
			} else {
				e.Data = rpcErr.Data.ErrorMessage()
			}
		}
	} else if err != nil {
		e.Message = err.Error()
	}
	return e
}

func (s *AccountSupplyDropSubmitter) uncertain(ctx context.Context, stage string, err error) (string, error) {
	txHash := ""
	if s.pending != nil {
		txHash = s.pending.String()
		err = errors.Join(ErrKeeperTransactionPending, err)
	}
	if s.journal != nil {
		err = errors.Join(err, s.journal.Record(ctx, s.attemptID, transactionError(stage, "unknown", txHash, err)))
	}
	return txHash, err
}

func rejectedBroadcast(err error) bool {
	var rpcErr *starknetrpc.RPCError
	if !errors.As(err, &rpcErr) {
		return false
	}
	// These explicit rejection responses prove no transaction was admitted.
	switch rpcErr.Code {
	case starknetrpc.ErrInvalidTransactionNonce.Code,
		starknetrpc.ErrInsufficientResourcesForValidate.Code,
		starknetrpc.ErrInsufficientAccountBalance.Code,
		starknetrpc.ErrValidationFailure.Code:
		return true
	}
	return false
}

func (s *AccountSupplyDropSubmitter) restorePending(ctx context.Context) error {
	if s.journal == nil {
		return nil
	}
	attempts, err := s.journal.Pending(ctx, s.network, "keeper", s.keeperAddress)
	if err != nil {
		return err
	}
	for _, attempt := range attempts {
		if attempt.Hash == "" && attempt.Status == "preparing" {
			if err := s.journal.Record(ctx, attempt.ID, txjournal.Event{Stage: "recovery", Status: "interrupted", Message: "process stopped before broadcast intent was persisted"}); err != nil {
				return err
			}
			continue
		}
		if s.pending != nil {
			return fmt.Errorf("multiple pending keeper transactions require reconciliation")
		}
		pending, err := new(felt.Felt).SetString(attempt.Hash)
		if err != nil || pending.IsZero() {
			return fmt.Errorf("pending keeper attempt %d has no valid hash", attempt.ID)
		}
		s.pending = pending
		s.attemptID = attempt.ID
	}
	return nil
}

// Reconcile checks durable pending receipts even when no game action is due.
func (s *AccountSupplyDropSubmitter) Reconcile(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pending == nil {
		return nil
	}
	return s.waitPending(ctx)
}

// Keep the raw read RPC error data for internal diagnostics as well. Public
// response handlers still choose their own generic messages.
func (e *rpcError) Error() string {
	return fmt.Sprintf("Starknet RPC error %d: %s", e.Code, e.Message)
}

func RPCDiagnostic(err error) (code *int, message, data string) {
	var readErr *rpcError
	if errors.As(err, &readErr) {
		return &readErr.Code, txjournal.SafeText(readErr.Message), txjournal.SafeData(string(readErr.Data))
	}
	e := transactionError("", "", "", err)
	return e.Code, txjournal.SafeText(e.Message), txjournal.SafeData(e.Data)
}
