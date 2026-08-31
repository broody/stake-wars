package arbiter

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	"stakewars.com/api/internal/starknet"
)

const coordinatorResponseLimit = 64 * 1024

type CoordinatorConfig struct {
	Network                   string
	PaymentToken              string
	ReservePrice              string
	MaxBids                   uint32
	WinnerPayloadDomain       string
	BiddingDurationSeconds    uint64
	AcceptanceDurationSeconds uint64
	SettlementDurationSeconds uint64
}

type operatorPublicConfig struct {
	WhisperAddress string `json:"whisperAddress"`
	VaultAddress   string `json:"vaultAddress"`
}

type createAuctionRequest struct {
	RequestID           string `json:"requestId"`
	PaymentToken        string `json:"paymentToken"`
	MetadataHash        string `json:"metadataHash"`
	WinnerPayloadDomain string `json:"winnerPayloadDomain"`
	ReservePrice        string `json:"reservePrice"`
	MaxBids             uint32 `json:"maxBids"`
	BiddingDuration     uint64 `json:"biddingDuration"`
	AcceptanceDuration  uint64 `json:"acceptanceDuration"`
	SettlementDuration  uint64 `json:"settlementDuration"`
}

type createAuctionResponse struct {
	AuctionID       string `json:"auctionId"`
	TransactionHash string `json:"transactionHash"`
	Creator         string `json:"creator"`
}

type OperatorCoordinatorClient struct {
	url    string
	token  string
	client *http.Client
}

func NewOperatorCoordinatorClient(url, token string) *OperatorCoordinatorClient {
	return &OperatorCoordinatorClient{url: strings.TrimRight(url, "/"), token: token, client: http.DefaultClient}
}

func (c *OperatorCoordinatorClient) publicConfig(ctx context.Context) (operatorPublicConfig, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url+"/v1/config", nil)
	if err != nil {
		return operatorPublicConfig{}, err
	}
	response, err := c.client.Do(request)
	if err != nil {
		return operatorPublicConfig{}, fmt.Errorf("read Whisper operator config: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return operatorPublicConfig{}, fmt.Errorf("read Whisper operator config: unexpected status %d", response.StatusCode)
	}
	var result operatorPublicConfig
	if err := decodeCoordinatorJSON(response.Body, &result); err != nil {
		return operatorPublicConfig{}, err
	}
	result.WhisperAddress, err = starknet.NormalizeAddress(result.WhisperAddress)
	if err != nil {
		return operatorPublicConfig{}, fmt.Errorf("invalid operator Whisper address: %w", err)
	}
	result.VaultAddress, err = starknet.NormalizeAddress(result.VaultAddress)
	if err != nil {
		return operatorPublicConfig{}, fmt.Errorf("invalid operator vault address: %w", err)
	}
	return result, nil
}

func (c *OperatorCoordinatorClient) createAuction(
	ctx context.Context,
	requestBody createAuctionRequest,
) (createAuctionResponse, error) {
	body, err := json.Marshal(requestBody)
	if err != nil {
		return createAuctionResponse{}, err
	}
	request, err := http.NewRequestWithContext(
		ctx, http.MethodPost, c.url+"/v1/coordinator/auctions", bytes.NewReader(body),
	)
	if err != nil {
		return createAuctionResponse{}, err
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("Content-Type", "application/json")
	response, err := c.client.Do(request)
	if err != nil {
		return createAuctionResponse{}, fmt.Errorf("create Whisper auction: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return createAuctionResponse{}, fmt.Errorf("create Whisper auction: unexpected status %d", response.StatusCode)
	}
	var result createAuctionResponse
	if err := decodeCoordinatorJSON(response.Body, &result); err != nil {
		return createAuctionResponse{}, err
	}
	return result, nil
}

func decodeCoordinatorJSON(reader io.Reader, target any) error {
	decoder := json.NewDecoder(io.LimitReader(reader, coordinatorResponseLimit))
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode Whisper coordinator response: %w", err)
	}
	return nil
}

// OperatorRoundRestarter keeps signing inside the Whisper operator and only
// registers a round after independently verifying the confirmed on-chain state.
type OperatorRoundRestarter struct {
	store  *Store
	reader starknet.WhisperReader
	client *OperatorCoordinatorClient
	config CoordinatorConfig
}

func NewOperatorRoundRestarter(
	store *Store,
	reader starknet.WhisperReader,
	client *OperatorCoordinatorClient,
	config CoordinatorConfig,
) (*OperatorRoundRestarter, error) {
	paymentToken, err := starknet.NormalizeAddress(config.PaymentToken)
	if err != nil {
		return nil, fmt.Errorf("invalid Arbiter payment token: %w", err)
	}
	winnerDomain, err := starknet.NormalizeFelt(config.WinnerPayloadDomain)
	if err != nil {
		return nil, fmt.Errorf("invalid Arbiter winner payload domain: %w", err)
	}
	reservePrice, ok := new(big.Int).SetString(config.ReservePrice, 10)
	if !ok || reservePrice.Sign() < 0 || reservePrice.BitLen() > 128 {
		return nil, fmt.Errorf("invalid Arbiter reserve price")
	}
	if config.MaxBids == 0 || config.MaxBids > 256 {
		return nil, fmt.Errorf("invalid Arbiter max bids")
	}
	config.PaymentToken = paymentToken
	config.WinnerPayloadDomain = winnerDomain
	return &OperatorRoundRestarter{store: store, reader: reader, client: client, config: config}, nil
}

func (r *OperatorRoundRestarter) Bootstrap(ctx context.Context) error {
	_, err := r.store.Current(ctx, r.config.Network)
	if err == nil {
		return nil
	}
	if !errors.Is(err, ErrNoRound) {
		return err
	}
	return r.createAndRegister(ctx, 1, 0, nil)
}

func (r *OperatorRoundRestarter) EnsureNextRound(ctx context.Context, outcome CycleOutcome) error {
	nextRoundID := outcome.Round.RoundID + 1
	metadataHash := roundMetadataHash(r.config.Network, nextRoundID, outcome.Round.AuctionID)
	registered, err := r.store.PrepareCycle(ctx, outcome.Round, nextRoundID, metadataHash)
	if err != nil {
		return err
	}
	if registered {
		return nil
	}
	return r.createAndRegister(ctx, nextRoundID, outcome.Round.AuctionID, &outcome.Round)
}

func (r *OperatorRoundRestarter) createAndRegister(
	ctx context.Context,
	roundID uint64,
	predecessorAuctionID uint64,
	predecessor *CanonicalRound,
) error {
	publicConfig, err := r.client.publicConfig(ctx)
	if err != nil {
		return err
	}
	metadataHash := roundMetadataHash(r.config.Network, roundID, predecessorAuctionID)
	result, err := r.client.createAuction(ctx, createAuctionRequest{
		RequestID:           fmt.Sprintf("stakewars:%s:round:%d", r.config.Network, roundID),
		PaymentToken:        r.config.PaymentToken,
		MetadataHash:        metadataHash,
		WinnerPayloadDomain: r.config.WinnerPayloadDomain,
		ReservePrice:        r.config.ReservePrice,
		MaxBids:             r.config.MaxBids,
		BiddingDuration:     r.config.BiddingDurationSeconds,
		AcceptanceDuration:  r.config.AcceptanceDurationSeconds,
		SettlementDuration:  r.config.SettlementDurationSeconds,
	})
	if err != nil {
		return err
	}
	auctionID, err := parseHexUint64(result.AuctionID)
	if err != nil {
		return fmt.Errorf("invalid created auction id: %w", err)
	}
	creator, err := starknet.NormalizeAddress(result.Creator)
	if err != nil {
		return fmt.Errorf("invalid created auction creator: %w", err)
	}
	transactionHash, err := starknet.NormalizeFelt(result.TransactionHash)
	if err != nil {
		return fmt.Errorf("invalid created auction transaction hash: %w", err)
	}
	if predecessor != nil {
		if err := r.store.MarkCycleSubmitted(ctx, r.config.Network, predecessor.RoundID, transactionHash); err != nil {
			return err
		}
	}
	round := CanonicalRound{
		Network: r.config.Network, RoundID: roundID,
		WhisperAddress: publicConfig.WhisperAddress, AuctionID: auctionID,
		ExpectedCreator: creator, PaymentToken: r.config.PaymentToken,
		MetadataHash: metadataHash, WinnerPayloadDomain: r.config.WinnerPayloadDomain,
		VaultAddress:           publicConfig.VaultAddress,
		BiddingDurationSeconds: r.config.BiddingDurationSeconds,
	}
	auction, err := r.reader.Auction(ctx, round.WhisperAddress, round.AuctionID)
	if err != nil {
		return fmt.Errorf("verify created Whisper auction: %w", err)
	}
	if err := validateCanonicalRound(round, auction, r.config.BiddingDurationSeconds); err != nil {
		return err
	}
	if auction.ReservePrice != r.config.ReservePrice || auction.MaxBids != r.config.MaxBids ||
		auction.Schedule.AcceptanceDuration != r.config.AcceptanceDurationSeconds ||
		auction.Schedule.SettlementDuration != r.config.SettlementDurationSeconds {
		return fmt.Errorf("validate canonical Arbiter round: coordinator configuration mismatch")
	}
	if err := r.store.RegisterRound(ctx, round); err != nil {
		return err
	}
	if predecessor != nil {
		return r.store.MarkCycleRegistered(ctx, r.config.Network, predecessor.RoundID)
	}
	return nil
}

func roundMetadataHash(network string, roundID, predecessorAuctionID uint64) string {
	digest := sha256.Sum256([]byte(network + ":" + strconv.FormatUint(roundID, 10) + ":" + strconv.FormatUint(predecessorAuctionID, 10)))
	return "0x" + hex.EncodeToString(digest[1:])
}

func parseHexUint64(value string) (uint64, error) {
	value = strings.TrimPrefix(value, "0x")
	return strconv.ParseUint(value, 16, 64)
}
