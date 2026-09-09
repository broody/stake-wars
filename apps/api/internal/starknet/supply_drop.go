package starknet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"stakewars.com/api/internal/txjournal"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/account"
	"github.com/NethermindEth/starknet.go/curve"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
	"github.com/NethermindEth/starknet.go/utils"
)

const supplyDropCounterQuery = `
query StakeWarsSupplyDropCounter {
  stakewarsSupplyDropCounterModels(first: 1) {
    edges { node { active_id } }
  }
}`

var ErrNoActiveSupplyDrop = errors.New("no active supply drop")

type SupplyDropState struct {
	ID              uint64
	Status          uint8
	EndsAt          uint64
	RandomnessBlock uint64
}

type ChainHead struct {
	BlockNumber uint64
	Timestamp   uint64
}

type SupplyDropReader interface {
	ActiveSupplyDrop(ctx context.Context) (SupplyDropState, error)
	ChainHead(ctx context.Context) (ChainHead, error)
}

type RPCSupplyDropReader struct {
	supplyDropSystem string
	toriiURL         string
	rpc              *rpcClient
	httpClient       *http.Client
}

func NewSupplyDropReader(rpcURL, toriiURL, supplyDropSystem string) (*RPCSupplyDropReader, error) {
	address, err := normalizeAddress(supplyDropSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid supply_drop system address: %w", err)
	}
	toriiURL = strings.TrimRight(strings.TrimSpace(toriiURL), "/")
	if toriiURL == "" {
		return nil, fmt.Errorf("Torii URL is required for supply_drop discovery")
	}
	if !strings.HasSuffix(toriiURL, "/graphql") {
		toriiURL += "/graphql"
	}
	return &RPCSupplyDropReader{
		supplyDropSystem: address,
		toriiURL:         toriiURL,
		rpc:              newRPCClient(rpcURL),
		httpClient:       &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (r *RPCSupplyDropReader) ActiveSupplyDrop(ctx context.Context) (SupplyDropState, error) {
	activeID, err := r.activeSupplyDropID(ctx)
	if err != nil {
		return SupplyDropState{}, err
	}
	if activeID == 0 {
		return SupplyDropState{}, ErrNoActiveSupplyDrop
	}
	result, err := r.rpc.call(
		ctx,
		r.supplyDropSystem,
		"get_supply_drop",
		[]string{uintHex(activeID)},
	)
	if err != nil {
		return SupplyDropState{}, fmt.Errorf("read active supply_drop %d: %w", activeID, err)
	}
	if len(result) != 23 {
		return SupplyDropState{}, fmt.Errorf("unexpected supply_drop state length %d", len(result))
	}
	id, err := parseUint(result[0], 64)
	if err != nil || id != activeID {
		return SupplyDropState{}, fmt.Errorf("invalid active supply_drop ID")
	}
	status, err := parseUint(result[1], 8)
	if err != nil {
		return SupplyDropState{}, fmt.Errorf("invalid supply_drop status: %w", err)
	}
	endsAt, err := parseUint(result[13], 64)
	if err != nil {
		return SupplyDropState{}, fmt.Errorf("invalid supply_drop end time: %w", err)
	}
	randomnessBlock, err := parseUint(result[14], 64)
	if err != nil {
		return SupplyDropState{}, fmt.Errorf("invalid supply_drop randomness block: %w", err)
	}
	return SupplyDropState{
		ID: id, Status: uint8(status), EndsAt: endsAt, RandomnessBlock: randomnessBlock,
	}, nil
}

func (r *RPCSupplyDropReader) ChainHead(ctx context.Context) (ChainHead, error) {
	header, err := r.rpc.latestBlockHeader(ctx)
	if err != nil {
		return ChainHead{}, err
	}
	return ChainHead{BlockNumber: header.Number, Timestamp: header.Timestamp}, nil
}

func (r *RPCSupplyDropReader) activeSupplyDropID(ctx context.Context) (uint64, error) {
	body, err := json.Marshal(map[string]any{
		"query": supplyDropCounterQuery, "variables": map[string]any{},
	})
	if err != nil {
		return 0, fmt.Errorf("encode supply_drop counter query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.toriiURL, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("create supply_drop counter query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return 0, fmt.Errorf("query supply_drop counter: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("Torii returned HTTP %d", response.StatusCode)
	}
	var payload struct {
		Data struct {
			Models struct {
				Edges []struct {
					Node *struct {
						ActiveID string `json:"active_id"`
					} `json:"node"`
				} `json:"edges"`
			} `json:"stakewarsSupplyDropCounterModels"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1024*1024))
	if err := decoder.Decode(&payload); err != nil {
		return 0, fmt.Errorf("decode supply_drop counter: %w", err)
	}
	if len(payload.Errors) > 0 {
		return 0, fmt.Errorf("Torii rejected supply_drop counter query: %s", payload.Errors[0].Message)
	}
	if len(payload.Data.Models.Edges) == 0 || payload.Data.Models.Edges[0].Node == nil {
		return 0, nil
	}
	activeID, err := parseUint(payload.Data.Models.Edges[0].Node.ActiveID, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid indexed active supply_drop ID: %w", err)
	}
	return activeID, nil
}

type SupplyDropSubmitter interface {
	LockSupplyDrop(ctx context.Context, supplyDropID uint64) (string, error)
	SettleSupplyDrop(ctx context.Context, supplyDropID uint64) (string, error)
}

type AccountSupplyDropSubmitter struct {
	account                keeperAccount
	supplyDropSystem       *felt.Felt
	mu                     sync.Mutex
	pending                *felt.Felt
	journal                *txjournal.Store
	network, keeperAddress string
	attemptID              int64
}

type keeperAccount interface {
	BuildAndSendInvokeTxn(context.Context, []starknetrpc.InvokeFunctionCall, *account.TxnOptions) (starknetrpc.AddInvokeTransactionResponse, error)
	WaitForTransactionReceipt(context.Context, *felt.Felt, time.Duration) (*starknetrpc.TransactionReceiptWithBlockInfo, error)
}

// A previously submitted transaction completed while this action was waiting.
// Re-read game state on the next pass before deciding whether to send again.
var ErrKeeperRecheckRequired = errors.New("keeper transaction completed; recheck onchain state")

var ErrKeeperTransactionPending = errors.New("keeper transaction receipt is pending")

func NewSupplyDropSubmitter(
	ctx context.Context,
	rpcURL, supplyDropSystem, accountAddress, privateKey string,
	tracking ...KeeperTracking,
) (*AccountSupplyDropSubmitter, error) {
	supplyDropAddress, err := normalizeAddress(supplyDropSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid supply_drop system address: %w", err)
	}
	keeperAddress, err := normalizeAddress(accountAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid supply_drop keeper account: %w", err)
	}
	privateKeyNumber, ok := new(big.Int).SetString(strings.TrimSpace(privateKey), 0)
	if !ok || privateKeyNumber.Sign() <= 0 {
		return nil, fmt.Errorf("invalid supply_drop keeper private key")
	}
	publicKeyNumber, _ := curve.PrivateKeyToPoint(privateKeyNumber)
	publicKey := fmt.Sprintf("0x%x", publicKeyNumber)

	rawRPC := newRPCClient(rpcURL)
	onchainKey, err := rawRPC.call(ctx, keeperAddress, "get_public_key", []string{})
	if err != nil {
		return nil, fmt.Errorf("read supply_drop keeper public key: %w", err)
	}
	if len(onchainKey) != 1 {
		return nil, fmt.Errorf("unexpected supply_drop keeper public key response")
	}
	normalizedOnchainKey, err := normalizeFelt(onchainKey[0])
	if err != nil {
		return nil, fmt.Errorf("invalid supply_drop keeper public key response: %w", err)
	}
	normalizedDerivedKey, _ := normalizeFelt(publicKey)
	if normalizedOnchainKey != normalizedDerivedKey {
		return nil, fmt.Errorf("supply_drop keeper private key does not control configured account")
	}

	provider, err := starknetrpc.NewProvider(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("initialize supply_drop keeper RPC: %w", err)
	}
	accountAddressFelt, err := utils.HexToFelt(keeperAddress)
	if err != nil {
		return nil, fmt.Errorf("decode supply_drop keeper account: %w", err)
	}
	supplyDropAddressFelt, err := utils.HexToFelt(supplyDropAddress)
	if err != nil {
		return nil, fmt.Errorf("decode supply_drop system: %w", err)
	}
	keystore := &keeperKeystore{publicKey: publicKey, privateKey: privateKeyNumber}
	keeper, err := account.NewAccount(
		provider, accountAddressFelt, publicKey, keystore, account.CairoV2,
	)
	if err != nil {
		return nil, fmt.Errorf("initialize supply_drop keeper account: %w", err)
	}
	submitter := &AccountSupplyDropSubmitter{account: keeper, supplyDropSystem: supplyDropAddressFelt, keeperAddress: keeperAddress}
	if len(tracking) > 0 {
		if tracking[0].Store == nil || tracking[0].Network == "" {
			return nil, fmt.Errorf("keeper journal and network are required")
		}
		expectedChain := new(felt.Felt).SetBytes([]byte(tracking[0].Network))
		if strings.HasPrefix(tracking[0].Network, "0x") {
			expectedChain, err = new(felt.Felt).SetString(tracking[0].Network)
			if err != nil {
				return nil, err
			}
		}
		if !keeper.ChainID.Equal(expectedChain) {
			return nil, fmt.Errorf("keeper RPC chain does not match journal network")
		}
		submitter.journal = tracking[0].Store
		submitter.network = tracking[0].Network
		keeper.Provider = &journalProvider{RPCProvider: provider, chainID: keeper.ChainID}
		if err := submitter.restorePending(ctx); err != nil {
			return nil, err
		}
	}
	return submitter, nil
}

type keeperKeystore struct {
	publicKey  string
	privateKey *big.Int
}

func (k *keeperKeystore) Sign(
	ctx context.Context,
	id string,
	messageHash *big.Int,
) (*big.Int, *big.Int, error) {
	if id != k.publicKey {
		return nil, nil, fmt.Errorf("unknown supply_drop keeper key")
	}
	select {
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	default:
		return curve.Sign(messageHash, k.privateKey)
	}
}

func (s *AccountSupplyDropSubmitter) LockSupplyDrop(
	ctx context.Context,
	supplyDropID uint64,
) (string, error) {
	return s.invoke(ctx, s.supplyDropSystem, "lock_supply_drop", supplyDropID)
}

func (s *AccountSupplyDropSubmitter) SettleSupplyDrop(
	ctx context.Context,
	supplyDropID uint64,
) (string, error) {
	return s.invoke(ctx, s.supplyDropSystem, "settle_supply_drop", supplyDropID)
}

func (s *AccountSupplyDropSubmitter) invoke(
	ctx context.Context,
	system *felt.Felt,
	entrypoint string,
	id uint64,
) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if s.pending != nil {
		// A timeout is not a rejected transaction. Resolve the earlier receipt
		// before using the same account for either kind of maintenance.
		if err := s.waitPending(ctx); err != nil {
			if s.pending != nil {
				return "", errors.Join(ErrKeeperTransactionPending, err)
			}
			return "", err
		}
		return "", ErrKeeperRecheckRequired
	}
	var attempt *broadcastAttempt
	if s.journal != nil {
		attemptID, err := s.journal.Begin(ctx, txjournal.Metadata{Network: s.network, Source: "keeper", Account: s.keeperAddress, Contract: system.String(), Entrypoint: entrypoint, TargetID: fmt.Sprint(id)})
		if err != nil {
			return "", err
		}
		s.attemptID = attemptID
		attempt = &broadcastAttempt{store: s.journal, id: attemptID}
		ctx = context.WithValue(ctx, attemptContextKey{}, attempt)
	}
	response, err := s.account.BuildAndSendInvokeTxn(
		ctx,
		[]starknetrpc.InvokeFunctionCall{{
			ContractAddress: system,
			FunctionName:    entrypoint,
			CallData:        []*felt.Felt{new(felt.Felt).SetUint64(id)},
		}},
		nil,
	)
	if err != nil {
		if attempt != nil {
			stage, status, txHash := "prepare", "failed", ""
			if attempt.hash != nil {
				stage, txHash = "broadcast", attempt.hash.String()
				if !rejectedBroadcast(err) {
					status = "unknown"
					s.pending = attempt.hash
				}
			}
			recordErr := s.journal.Record(ctx, s.attemptID, transactionError(stage, status, txHash, err))
			if s.pending != nil {
				return txHash, errors.Join(ErrKeeperTransactionPending, err, recordErr)
			}
			return txHash, errors.Join(fmt.Errorf("submit %s: %w", entrypoint, err), recordErr)
		}
		return "", fmt.Errorf("submit %s: %w", entrypoint, err)
	}
	if attempt != nil && attempt.hash != nil {
		s.pending = attempt.hash
	}
	if response.Hash == nil || response.Hash.IsZero() {
		return s.uncertain(ctx, "broadcast", fmt.Errorf("submit %s returned no transaction hash", entrypoint))
	}
	if attempt != nil && (attempt.hash == nil || !attempt.hash.Equal(response.Hash)) {
		err := fmt.Errorf("RPC returned a different transaction hash than the persisted intent")
		return s.uncertain(ctx, "broadcast", err)
	}
	s.pending = response.Hash
	if s.journal != nil {
		if err := s.journal.Record(ctx, s.attemptID, txjournal.Event{Stage: "broadcast", Status: "submitted", Hash: s.pending.String()}); err != nil {
			return s.pending.String(), errors.Join(ErrKeeperTransactionPending, err)
		}
	}
	slog.InfoContext(ctx, "Keeper transaction submitted", "entrypoint", entrypoint,
		"target_id", id, "transaction_hash", response.Hash.String())
	if err := s.waitPending(ctx); err != nil {
		if s.pending != nil {
			return response.Hash.String(), errors.Join(ErrKeeperTransactionPending, err)
		}
		return response.Hash.String(), err
	}
	return response.Hash.String(), nil
}

func (s *AccountSupplyDropSubmitter) waitPending(ctx context.Context) error {
	for {
		receipt, err := s.account.WaitForTransactionReceipt(ctx, s.pending, 2*time.Second)
		if err != nil {
			_, err = s.uncertain(ctx, "receipt", err)
			return fmt.Errorf("wait for keeper transaction %s: %w", s.pending.String(), err)
		}
		if receipt == nil {
			_, err = s.uncertain(ctx, "receipt", fmt.Errorf("missing keeper transaction receipt"))
			return err
		}
		if receipt.Hash == nil || !receipt.Hash.Equal(s.pending) {
			_, err = s.uncertain(ctx, "receipt", fmt.Errorf("receipt hash does not match pending keeper transaction"))
			return err
		}
		if receipt.FinalityStatus != starknetrpc.TxnFinalityStatusAcceptedOnL2 &&
			receipt.FinalityStatus != starknetrpc.TxnFinalityStatusAcceptedOnL1 {
			if err := ctx.Err(); err != nil {
				_, err = s.uncertain(ctx, "receipt", err)
				return err
			}
			continue
		}
		txHash := s.pending.String()
		status := "succeeded"
		var executionErr error
		if receipt.ExecutionStatus != starknetrpc.TxnExecutionStatusSUCCEEDED {
			status = "reverted"
			executionErr = fmt.Errorf("keeper transaction %s reverted: %s", txHash, txjournal.SafeText(receipt.RevertReason))
		}
		if s.journal != nil {
			event := transactionError("receipt", status, txHash, executionErr)
			block := uint64(receipt.BlockNumber)
			event.Block = &block
			if err := s.journal.Record(ctx, s.attemptID, event); err != nil {
				return err
			}
		}
		s.pending = nil
		s.attemptID = 0
		return executionErr
	}
}
