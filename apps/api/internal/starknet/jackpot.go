package starknet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/NethermindEth/juno/core/felt"
	"github.com/NethermindEth/starknet.go/account"
	"github.com/NethermindEth/starknet.go/curve"
	starknetrpc "github.com/NethermindEth/starknet.go/rpc"
	"github.com/NethermindEth/starknet.go/utils"
)

const jackpotCounterQuery = `
query StakeWarsJackpotCounter {
  stakewarsJackpotCounterModels(first: 1) {
    edges { node { active_id } }
  }
}`

var ErrNoActiveJackpot = errors.New("no active jackpot")

type JackpotState struct {
	ID              uint64
	Status          uint8
	EndsAt          uint64
	RandomnessBlock uint64
}

type ChainHead struct {
	BlockNumber uint64
	Timestamp   uint64
}

type JackpotReader interface {
	ActiveJackpot(ctx context.Context) (JackpotState, error)
	ChainHead(ctx context.Context) (ChainHead, error)
}

type RPCJackpotReader struct {
	jackpotSystem string
	toriiURL      string
	rpc           *rpcClient
	httpClient    *http.Client
}

func NewJackpotReader(rpcURL, toriiURL, jackpotSystem string) (*RPCJackpotReader, error) {
	address, err := normalizeAddress(jackpotSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid jackpot system address: %w", err)
	}
	toriiURL = strings.TrimRight(strings.TrimSpace(toriiURL), "/")
	if toriiURL == "" {
		return nil, fmt.Errorf("Torii URL is required for jackpot discovery")
	}
	if !strings.HasSuffix(toriiURL, "/graphql") {
		toriiURL += "/graphql"
	}
	return &RPCJackpotReader{
		jackpotSystem: address,
		toriiURL:      toriiURL,
		rpc:           newRPCClient(rpcURL),
		httpClient:    &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (r *RPCJackpotReader) ActiveJackpot(ctx context.Context) (JackpotState, error) {
	activeID, err := r.activeJackpotID(ctx)
	if err != nil {
		return JackpotState{}, err
	}
	if activeID == 0 {
		return JackpotState{}, ErrNoActiveJackpot
	}
	result, err := r.rpc.call(
		ctx,
		r.jackpotSystem,
		"get_jackpot",
		[]string{uintHex(activeID)},
	)
	if err != nil {
		return JackpotState{}, fmt.Errorf("read active jackpot %d: %w", activeID, err)
	}
	if len(result) != 23 {
		return JackpotState{}, fmt.Errorf("unexpected jackpot state length %d", len(result))
	}
	id, err := parseUint(result[0], 64)
	if err != nil || id != activeID {
		return JackpotState{}, fmt.Errorf("invalid active jackpot ID")
	}
	status, err := parseUint(result[1], 8)
	if err != nil {
		return JackpotState{}, fmt.Errorf("invalid jackpot status: %w", err)
	}
	endsAt, err := parseUint(result[13], 64)
	if err != nil {
		return JackpotState{}, fmt.Errorf("invalid jackpot end time: %w", err)
	}
	randomnessBlock, err := parseUint(result[14], 64)
	if err != nil {
		return JackpotState{}, fmt.Errorf("invalid jackpot randomness block: %w", err)
	}
	return JackpotState{
		ID: id, Status: uint8(status), EndsAt: endsAt, RandomnessBlock: randomnessBlock,
	}, nil
}

func (r *RPCJackpotReader) ChainHead(ctx context.Context) (ChainHead, error) {
	header, err := r.rpc.latestBlockHeader(ctx)
	if err != nil {
		return ChainHead{}, err
	}
	return ChainHead{BlockNumber: header.Number, Timestamp: header.Timestamp}, nil
}

func (r *RPCJackpotReader) activeJackpotID(ctx context.Context) (uint64, error) {
	body, err := json.Marshal(map[string]any{
		"query": jackpotCounterQuery, "variables": map[string]any{},
	})
	if err != nil {
		return 0, fmt.Errorf("encode jackpot counter query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.toriiURL, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("create jackpot counter query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return 0, fmt.Errorf("query jackpot counter: %w", err)
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
			} `json:"stakewarsJackpotCounterModels"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 1024*1024))
	if err := decoder.Decode(&payload); err != nil {
		return 0, fmt.Errorf("decode jackpot counter: %w", err)
	}
	if len(payload.Errors) > 0 {
		return 0, fmt.Errorf("Torii rejected jackpot counter query: %s", payload.Errors[0].Message)
	}
	if len(payload.Data.Models.Edges) == 0 || payload.Data.Models.Edges[0].Node == nil {
		return 0, nil
	}
	activeID, err := parseUint(payload.Data.Models.Edges[0].Node.ActiveID, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid indexed active jackpot ID: %w", err)
	}
	return activeID, nil
}

type JackpotSubmitter interface {
	LockJackpot(ctx context.Context, jackpotID uint64) (string, error)
	SettleJackpot(ctx context.Context, jackpotID uint64) (string, error)
}

type AccountJackpotSubmitter struct {
	account       *account.Account
	jackpotSystem *felt.Felt
	mu            sync.Mutex
}

func NewJackpotSubmitter(
	ctx context.Context,
	rpcURL, jackpotSystem, accountAddress, privateKey string,
) (*AccountJackpotSubmitter, error) {
	jackpotAddress, err := normalizeAddress(jackpotSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid jackpot system address: %w", err)
	}
	keeperAddress, err := normalizeAddress(accountAddress)
	if err != nil {
		return nil, fmt.Errorf("invalid jackpot keeper account: %w", err)
	}
	privateKeyNumber, ok := new(big.Int).SetString(strings.TrimSpace(privateKey), 0)
	if !ok || privateKeyNumber.Sign() <= 0 {
		return nil, fmt.Errorf("invalid jackpot keeper private key")
	}
	publicKeyNumber, _ := curve.PrivateKeyToPoint(privateKeyNumber)
	publicKey := fmt.Sprintf("0x%x", publicKeyNumber)

	rawRPC := newRPCClient(rpcURL)
	onchainKey, err := rawRPC.call(ctx, keeperAddress, "get_public_key", []string{})
	if err != nil {
		return nil, fmt.Errorf("read jackpot keeper public key: %w", err)
	}
	if len(onchainKey) != 1 {
		return nil, fmt.Errorf("unexpected jackpot keeper public key response")
	}
	normalizedOnchainKey, err := normalizeFelt(onchainKey[0])
	if err != nil {
		return nil, fmt.Errorf("invalid jackpot keeper public key response: %w", err)
	}
	normalizedDerivedKey, _ := normalizeFelt(publicKey)
	if normalizedOnchainKey != normalizedDerivedKey {
		return nil, fmt.Errorf("jackpot keeper private key does not control configured account")
	}

	provider, err := starknetrpc.NewProvider(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("initialize jackpot keeper RPC: %w", err)
	}
	accountAddressFelt, err := utils.HexToFelt(keeperAddress)
	if err != nil {
		return nil, fmt.Errorf("decode jackpot keeper account: %w", err)
	}
	jackpotAddressFelt, err := utils.HexToFelt(jackpotAddress)
	if err != nil {
		return nil, fmt.Errorf("decode jackpot system: %w", err)
	}
	keystore := &keeperKeystore{publicKey: publicKey, privateKey: privateKeyNumber}
	keeper, err := account.NewAccount(
		provider, accountAddressFelt, publicKey, keystore, account.CairoV2,
	)
	if err != nil {
		return nil, fmt.Errorf("initialize jackpot keeper account: %w", err)
	}
	return &AccountJackpotSubmitter{account: keeper, jackpotSystem: jackpotAddressFelt}, nil
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
		return nil, nil, fmt.Errorf("unknown jackpot keeper key")
	}
	select {
	case <-ctx.Done():
		return nil, nil, ctx.Err()
	default:
		return curve.Sign(messageHash, k.privateKey)
	}
}

func (s *AccountJackpotSubmitter) LockJackpot(
	ctx context.Context,
	jackpotID uint64,
) (string, error) {
	return s.invoke(ctx, "lock_jackpot", jackpotID)
}

func (s *AccountJackpotSubmitter) SettleJackpot(
	ctx context.Context,
	jackpotID uint64,
) (string, error) {
	return s.invoke(ctx, "settle_jackpot", jackpotID)
}

func (s *AccountJackpotSubmitter) invoke(
	ctx context.Context,
	entrypoint string,
	jackpotID uint64,
) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	response, err := s.account.BuildAndSendInvokeTxn(
		ctx,
		[]starknetrpc.InvokeFunctionCall{{
			ContractAddress: s.jackpotSystem,
			FunctionName:    entrypoint,
			CallData:        []*felt.Felt{new(felt.Felt).SetUint64(jackpotID)},
		}},
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("submit %s: %w", entrypoint, err)
	}
	receipt, err := s.account.WaitForTransactionReceipt(ctx, response.Hash, 2*time.Second)
	if err != nil {
		return response.Hash.String(), fmt.Errorf("wait for %s transaction: %w", entrypoint, err)
	}
	if receipt.ExecutionStatus != starknetrpc.TxnExecutionStatusSUCCEEDED {
		return response.Hash.String(), fmt.Errorf(
			"%s transaction reverted: %s", entrypoint, receipt.RevertReason,
		)
	}
	return response.Hash.String(), nil
}
