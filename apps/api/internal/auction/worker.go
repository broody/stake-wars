package auction

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/NethermindEth/juno/core/felt"
	starkaccount "github.com/NethermindEth/starknet.go/account"
	starkrpc "github.com/NethermindEth/starknet.go/rpc"
	"github.com/NethermindEth/starknet.go/utils"
	gamestarknet "stakewars.com/api/internal/starknet"
)

const (
	settlementPollInterval = 30 * time.Second
	maxSyncBatch           = 50
)

type WorkerConfig struct {
	ToriiURL          string
	RPCURL            string
	ControlSystem     string
	AccountAddress    string
	AccountPublicKey  string
	AccountPrivateKey string
}

type Worker struct {
	service       *Service
	toriiURL      string
	controlSystem *felt.Felt
	account       *starkaccount.Account
	controlReader gamestarknet.ControlReader
	httpClient    *http.Client
	now           func() time.Time
}

func NewWorker(service *Service, config WorkerConfig) (*Worker, error) {
	if service == nil || strings.TrimSpace(config.ToriiURL) == "" || strings.TrimSpace(config.RPCURL) == "" || strings.TrimSpace(config.ControlSystem) == "" || strings.TrimSpace(config.AccountAddress) == "" || strings.TrimSpace(config.AccountPublicKey) == "" || strings.TrimSpace(config.AccountPrivateKey) == "" {
		return nil, nil
	}
	provider, err := starkrpc.NewProvider(context.Background(), config.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("create settlement RPC provider: %w", err)
	}
	privateKey, ok := new(big.Int).SetString(config.AccountPrivateKey, 0)
	if !ok || privateKey.Sign() <= 0 {
		return nil, fmt.Errorf("parse AUCTION_SETTLEMENT_PRIVATE_KEY")
	}
	keystore := starkaccount.NewMemKeystore()
	keystore.Put(config.AccountPublicKey, privateKey)
	accountAddress, err := utils.HexToFelt(config.AccountAddress)
	if err != nil {
		return nil, fmt.Errorf("parse AUCTION_SETTLEMENT_ACCOUNT_ADDRESS: %w", err)
	}
	account, err := starkaccount.NewAccount(
		provider,
		accountAddress,
		config.AccountPublicKey,
		keystore,
		starkaccount.CairoV2,
	)
	if err != nil {
		return nil, fmt.Errorf("create settlement account: %w", err)
	}
	controlSystem, err := utils.HexToFelt(config.ControlSystem)
	if err != nil {
		return nil, fmt.Errorf("parse CONTROL_SYSTEM_ADDRESS: %w", err)
	}
	controlReader, err := gamestarknet.NewControlReader(config.RPCURL, config.ControlSystem)
	if err != nil {
		return nil, fmt.Errorf("create live control reader: %w", err)
	}
	return &Worker{
		service:       service,
		toriiURL:      strings.TrimRight(config.ToriiURL, "/") + "/graphql",
		controlSystem: controlSystem,
		account:       account,
		controlReader: controlReader,
		httpClient:    &http.Client{Timeout: 15 * time.Second},
		now:           time.Now,
	}, nil
}

func (w *Worker) Run(ctx context.Context) {
	w.process(ctx)
	ticker := time.NewTicker(settlementPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.process(ctx)
		}
	}
}

func (w *Worker) process(ctx context.Context) {
	snapshot, err := w.snapshot(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "read sealed auctions", "error", err)
		return
	}
	for _, challenge := range snapshot.Challenges {
		if challenge.Settled || challenge.Deadline > w.now().Unix() {
			continue
		}
		if err := w.settle(ctx, snapshot, challenge); err != nil {
			slog.ErrorContext(ctx, "settle sealed auction", "challenge", challenge.ID, "error", err)
		}
	}
}

func (w *Worker) settle(ctx context.Context, snapshot chainSnapshot, challenge chainChallenge) error {
	incumbentPower := big.NewInt(0)
	incumbentGeneration := uint64(0)
	candidates := make([]Candidate, 0)
	liveOperators := make(map[string]gamestarknet.OperatorStatus)
	for _, participant := range snapshot.Participants {
		if participant.ChallengeID != challenge.ID || participant.Resolved {
			continue
		}
		status, ok := liveOperators[participant.Operator]
		if !ok {
			var err error
			status, err = w.controlReader.OperatorStatus(ctx, participant.Operator)
			if err != nil {
				return fmt.Errorf("read live operator %s: %w", participant.Operator, err)
			}
			liveOperators[participant.Operator] = status
		}
		if participant.Operator == challenge.Incumbent {
			incumbentPower = cloneBig(participant.PointPowerIncluded)
			incumbentGeneration = participant.OperatorGeneration
		}
		if !participant.BidSubmitted || !eligibleOperator(status, challenge.ID, participant.OperatorGeneration) {
			continue
		}
		candidates = append(candidates, Candidate{
			Operator:       participant.Operator,
			Commitment:     participant.BidCommitment,
			LockedPower:    participant.LockedPower,
			SubmissionRank: uint64(participant.SubmissionIndex),
			Incumbent:      participant.Operator == challenge.Incumbent,
		})
	}
	if incumbentPower.Sign() <= 0 {
		return fmt.Errorf("missing incumbent collateral")
	}
	reserve := minimumChallenge(incumbentPower, snapshot.PremiumBPS)
	incumbentState, incumbentFound := liveOperators[challenge.Incumbent]
	settlement, err := w.service.Resolve(ctx, Rules{
		ControlPointID:   challenge.ControlPointID,
		Incumbent:        challenge.Incumbent,
		IncumbentPower:   incumbentPower,
		ReservePower:     reserve,
		IncumbentInvalid: !incumbentFound || !eligibleOperator(incumbentState, challenge.ID, incumbentGeneration),
	}, candidates)
	if err != nil {
		return err
	}
	winner, err := utils.HexToFelt(settlement.Winner)
	if err != nil {
		return fmt.Errorf("encode settlement winner: %w", err)
	}
	calls, err := w.settlementCalls(challenge, snapshot.Participants, winner, settlement)
	if err != nil {
		return err
	}
	response, err := w.account.BuildAndSendInvokeTxn(ctx, calls, nil)
	if err != nil {
		return fmt.Errorf("submit settlement transaction: %w", err)
	}
	slog.InfoContext(ctx, "submitted sealed auction settlement", "challenge", challenge.ID, "transaction", response.Hash.String())
	return nil
}

func (w *Worker) settlementCalls(
	challenge chainChallenge,
	participants []chainParticipant,
	winner *felt.Felt,
	settlement Settlement,
) ([]starkrpc.InvokeFunctionCall, error) {
	operators := make([]*felt.Felt, 0)
	seen := make(map[string]struct{})
	for _, participant := range participants {
		if participant.ChallengeID != challenge.ID {
			continue
		}
		if _, ok := seen[participant.Operator]; ok {
			continue
		}
		operator, err := utils.HexToFelt(participant.Operator)
		if err != nil {
			return nil, fmt.Errorf("encode participant %s: %w", participant.Operator, err)
		}
		seen[participant.Operator] = struct{}{}
		operators = append(operators, operator)
	}
	calls := make([]starkrpc.InvokeFunctionCall, 0, (len(operators)+maxSyncBatch-1)/maxSyncBatch+1)
	for start := 0; start < len(operators); start += maxSyncBatch {
		end := start + maxSyncBatch
		if end > len(operators) {
			end = len(operators)
		}
		calldata := make([]*felt.Felt, 0, end-start+1)
		calldata = append(calldata, new(felt.Felt).SetUint64(uint64(end-start)))
		calldata = append(calldata, operators[start:end]...)
		calls = append(calls, starkrpc.InvokeFunctionCall{
			ContractAddress: w.controlSystem,
			FunctionName:    "sync_operators",
			CallData:        calldata,
		})
	}
	calls = append(calls, starkrpc.InvokeFunctionCall{
		ContractAddress: w.controlSystem,
		FunctionName:    "settle_challenge",
		CallData: []*felt.Felt{
			new(felt.Felt).SetUint64(uint64(challenge.ControlPointID)),
			winner,
			new(felt.Felt).SetBigInt(settlement.RunnerUpBid),
			new(felt.Felt).SetBigInt(settlement.ClearingPower),
		},
	})
	return calls, nil
}

func eligibleOperator(status gamestarknet.OperatorStatus, challengeID, generation uint64) bool {
	return !status.Retired && !status.Exiting && !status.NeedsSync &&
		status.Generation == generation && status.ActiveChallengeID == challengeID
}

type chainSnapshot struct {
	PremiumBPS   uint16
	Challenges   []chainChallenge
	Participants []chainParticipant
}

type chainChallenge struct {
	ID             uint64
	ControlPointID int
	Incumbent      string
	Deadline       int64
	Settled        bool
}

type chainParticipant struct {
	ChallengeID        uint64
	Operator           string
	LockedPower        *big.Int
	PointPowerIncluded *big.Int
	BidCommitment      string
	SubmissionIndex    uint32
	OperatorGeneration uint64
	BidSubmitted       bool
	Resolved           bool
}

func (w *Worker) snapshot(ctx context.Context) (chainSnapshot, error) {
	requestBody, err := json.Marshal(map[string]any{"query": settlementSnapshotQuery})
	if err != nil {
		return chainSnapshot{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, w.toriiURL, bytes.NewReader(requestBody))
	if err != nil {
		return chainSnapshot{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := w.httpClient.Do(request)
	if err != nil {
		return chainSnapshot{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return chainSnapshot{}, fmt.Errorf("Torii returned HTTP %d", response.StatusCode)
	}
	var payload snapshotResponse
	decoder := json.NewDecoder(response.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return chainSnapshot{}, err
	}
	if len(payload.Errors) > 0 {
		return chainSnapshot{}, fmt.Errorf("Torii rejected settlement query: %s", payload.Errors[0].Message)
	}
	return payload.snapshot()
}

const settlementSnapshotQuery = `
query StakeWarsSettlementSnapshot {
  stakewarsGameConfigModels(first: 1) { edges { node { challenge_premium_bps } } }
  stakewarsChallengeModels(first: 2000) {
    edges { node { id control_point_id incumbent deadline settled } }
  }
  stakewarsChallengeParticipantModels(first: 4000) {
    edges { node {
      challenge_id operator locked_power point_power_included bid_commitment
      submission_index operator_generation bid_submitted resolved
    } }
  }
}`

type snapshotResponse struct {
	Data struct {
		Configs      snapshotConnection `json:"stakewarsGameConfigModels"`
		Challenges   snapshotConnection `json:"stakewarsChallengeModels"`
		Participants snapshotConnection `json:"stakewarsChallengeParticipantModels"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type snapshotConnection struct {
	Edges []struct {
		Node map[string]any `json:"node"`
	} `json:"edges"`
}

func (p snapshotResponse) snapshot() (chainSnapshot, error) {
	if len(p.Data.Configs.Edges) != 1 {
		return chainSnapshot{}, fmt.Errorf("Torii omitted game config")
	}
	premium, err := uintValue(p.Data.Configs.Edges[0].Node["challenge_premium_bps"], 16)
	if err != nil {
		return chainSnapshot{}, err
	}
	result := chainSnapshot{PremiumBPS: uint16(premium)}
	for _, edge := range p.Data.Challenges.Edges {
		id, err := uintValue(edge.Node["id"], 64)
		if err != nil {
			return chainSnapshot{}, err
		}
		pointID, err := uintValue(edge.Node["control_point_id"], 32)
		if err != nil {
			return chainSnapshot{}, err
		}
		deadline, err := uintValue(edge.Node["deadline"], 64)
		if err != nil {
			return chainSnapshot{}, err
		}
		result.Challenges = append(result.Challenges, chainChallenge{
			ID: id, ControlPointID: int(pointID), Incumbent: normalizeAddress(stringValue(edge.Node["incumbent"])), Deadline: int64(deadline), Settled: boolValue(edge.Node["settled"]),
		})
	}
	for _, edge := range p.Data.Participants.Edges {
		challengeID, err := uintValue(edge.Node["challenge_id"], 64)
		if err != nil {
			return chainSnapshot{}, err
		}
		locked, err := bigValue(edge.Node["locked_power"])
		if err != nil {
			return chainSnapshot{}, err
		}
		included, err := bigValue(edge.Node["point_power_included"])
		if err != nil {
			return chainSnapshot{}, err
		}
		index, err := uintValue(edge.Node["submission_index"], 32)
		if err != nil {
			return chainSnapshot{}, err
		}
		generation, err := uintValue(edge.Node["operator_generation"], 64)
		if err != nil {
			return chainSnapshot{}, err
		}
		result.Participants = append(result.Participants, chainParticipant{
			ChallengeID: challengeID, Operator: normalizeAddress(stringValue(edge.Node["operator"])), LockedPower: locked, PointPowerIncluded: included, BidCommitment: stringValue(edge.Node["bid_commitment"]), SubmissionIndex: uint32(index), OperatorGeneration: generation, BidSubmitted: boolValue(edge.Node["bid_submitted"]), Resolved: boolValue(edge.Node["resolved"]),
		})
	}
	return result, nil
}

func minimumChallenge(power *big.Int, premiumBPS uint16) *big.Int {
	numerator := new(big.Int).Mul(power, big.NewInt(int64(10_000+premiumBPS)))
	numerator.Add(numerator, big.NewInt(9_999))
	return numerator.Div(numerator, big.NewInt(10_000))
}

func uintValue(value any, bits int) (uint64, error) {
	number, err := bigValue(value)
	if err != nil || number.Sign() < 0 || number.BitLen() > bits {
		return 0, fmt.Errorf("invalid uint%d value", bits)
	}
	return number.Uint64(), nil
}

func bigValue(value any) (*big.Int, error) {
	text := stringValue(value)
	base := 10
	if strings.HasPrefix(text, "0x") {
		base = 16
		text = strings.TrimPrefix(text, "0x")
	}
	number, ok := new(big.Int).SetString(text, base)
	if !ok {
		return nil, fmt.Errorf("invalid numeric value")
	}
	return number, nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return fmt.Sprintf("%.0f", typed)
	default:
		return ""
	}
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case json.Number:
		return typed.String() != "0"
	case string:
		return typed == "true" || typed == "1" || typed == "0x1"
	default:
		return false
	}
}
