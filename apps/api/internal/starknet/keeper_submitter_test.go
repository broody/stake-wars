package starknet

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/account"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
)

func TestChallengeSubmitterUsesControlSystemAndSectorID(t *testing.T) {
	account := &fakeKeeperAccount{}
	keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
	submitter, err := NewChallengeSubmitter(keeper, "0xabc")
	if err != nil {
		t.Fatal(err)
	}
	hash, err := submitter.SettleChallenge(context.Background(), 527)
	if err != nil {
		t.Fatal(err)
	}
	if hash != "0x1" || len(account.calls) != 1 {
		t.Fatalf("unexpected submission: %s, %v", hash, account.calls)
	}
	call := account.calls[0]
	if call.FunctionName != "settle_challenge" || call.ContractAddress.String() != "0xabc" || len(call.CallData) != 1 || call.CallData[0].Uint64() != 527 {
		t.Fatalf("incorrect settlement call: %+v", call)
	}
}

func TestKeeperResolvesTimedOutReceiptBeforeEitherDutySends(t *testing.T) {
	for _, nextIsJackpot := range []bool{false, true} {
		account := &fakeKeeperAccount{waitErrors: []error{context.DeadlineExceeded, nil, nil}}
		keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
		submitter, err := NewChallengeSubmitter(keeper, "0xabc")
		if err != nil {
			t.Fatal(err)
		}
		hash, err := submitter.SettleChallenge(context.Background(), 527)
		if !errors.Is(err, context.DeadlineExceeded) || hash != "0x1" {
			t.Fatalf("lost submitted hash: %s %v", hash, err)
		}
		if nextIsJackpot {
			_, err = keeper.LockJackpot(context.Background(), 7)
		} else {
			_, err = submitter.SettleChallenge(context.Background(), 528)
		}
		if !errors.Is(err, ErrKeeperRecheckRequired) {
			t.Fatalf("expected state recheck: %v", err)
		}
		if len(account.calls) != 1 || account.waits != 2 {
			t.Fatalf("resent before resolving pending receipt: %+v", account)
		}
		if _, err = submitter.SettleChallenge(context.Background(), 528); err != nil {
			t.Fatal(err)
		}
		if len(account.calls) != 2 {
			t.Fatal("new work did not resume")
		}
	}
}

func TestKeeperRetainsPendingHashOnRepeatedReceiptFailure(t *testing.T) {
	account := &fakeKeeperAccount{waitErrors: []error{context.DeadlineExceeded, errors.New("RPC offline")}}
	keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
	submitter, _ := NewChallengeSubmitter(keeper, "0xabc")
	_, _ = submitter.SettleChallenge(context.Background(), 527)
	if _, err := keeper.SettleJackpot(context.Background(), 7); err == nil {
		t.Fatal("expected pending error")
	}
	if len(account.calls) != 1 || keeper.pending == nil {
		t.Fatal("lost or replaced pending transaction")
	}
}

func TestKeeperWaitsForAcceptedReceipt(t *testing.T) {
	account := &fakeKeeperAccount{finalities: []starknetrpc.TxnFinalityStatus{
		starknetrpc.TxnFinalityStatus("PRE_CONFIRMED"), starknetrpc.TxnFinalityStatusAcceptedOnL2,
	}}
	keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
	if _, err := keeper.LockJackpot(context.Background(), 7); err != nil {
		t.Fatal(err)
	}
	if account.waits != 2 || keeper.pending != nil {
		t.Fatal("accepted a preconfirmed receipt")
	}
}

func TestKeeperReportsRevertAndAllowsLaterRetry(t *testing.T) {
	account := &fakeKeeperAccount{revert: true}
	keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
	submitter, _ := NewChallengeSubmitter(keeper, "0xabc")
	hash, err := submitter.SettleChallenge(context.Background(), 527)
	if err == nil || !strings.Contains(err.Error(), "reverted") || hash != "0x1" || keeper.pending != nil {
		t.Fatalf("incorrect revert handling: %s %v", hash, err)
	}
	account.revert = false
	if _, err = submitter.SettleChallenge(context.Background(), 528); err != nil {
		t.Fatal(err)
	}
}

func TestKeeperSerializesChallengeAndJackpotTransactions(t *testing.T) {
	account := &fakeKeeperAccount{}
	keeper := &AccountJackpotSubmitter{account: account, jackpotSystem: new(felt.Felt).SetUint64(111)}
	submitter, _ := NewChallengeSubmitter(keeper, "0xabc")
	var group sync.WaitGroup
	for i := 0; i < 10; i++ {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			var err error
			if i%2 == 0 {
				_, err = submitter.SettleChallenge(context.Background(), uint32(i))
			} else {
				_, err = keeper.LockJackpot(context.Background(), uint64(i))
			}
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	group.Wait()
	if len(account.calls) != 10 || account.overlapped {
		t.Fatal("keeper transaction lifecycles overlapped")
	}
}

type fakeKeeperAccount struct {
	calls                        []starknetrpc.InvokeFunctionCall
	waits                        int
	waitErrors                   []error
	finalities                   []starknetrpc.TxnFinalityStatus
	revert, inFlight, overlapped bool
}

func (a *fakeKeeperAccount) BuildAndSendInvokeTxn(_ context.Context, calls []starknetrpc.InvokeFunctionCall, _ *account.TxnOptions) (starknetrpc.AddInvokeTransactionResponse, error) {
	if a.inFlight {
		a.overlapped = true
	}
	a.inFlight = true
	a.calls = append(a.calls, calls...)
	return starknetrpc.AddInvokeTransactionResponse{Hash: new(felt.Felt).SetUint64(uint64(len(a.calls)))}, nil
}
func (a *fakeKeeperAccount) WaitForTransactionReceipt(_ context.Context, hash *felt.Felt, _ time.Duration) (*starknetrpc.TransactionReceiptWithBlockInfo, error) {
	index := a.waits
	a.waits++
	if index < len(a.waitErrors) && a.waitErrors[index] != nil {
		return nil, a.waitErrors[index]
	}
	finality := starknetrpc.TxnFinalityStatusAcceptedOnL2
	if index < len(a.finalities) {
		finality = a.finalities[index]
	}
	status := starknetrpc.TxnExecutionStatusSUCCEEDED
	if a.revert {
		status = starknetrpc.TxnExecutionStatusREVERTED
	}
	if finality == starknetrpc.TxnFinalityStatusAcceptedOnL2 {
		a.inFlight = false
	}
	return &starknetrpc.TransactionReceiptWithBlockInfo{TransactionReceipt: starknetrpc.TransactionReceipt{
		Hash: hash, FinalityStatus: finality, ExecutionStatus: status, RevertReason: "challenge already settled",
	}}, nil
}
