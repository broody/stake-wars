package starknet

import (
	"context"
	"fmt"
	"math/big"
)

type WhisperStatus string
type WhisperFulfillmentKind string
type WhisperFulfillmentStatus string

const (
	WhisperStatusBidding WhisperStatus = "bidding"
	WhisperStatusSettled WhisperStatus = "settled"
	WhisperStatusAborted WhisperStatus = "aborted"
)

const (
	WhisperFulfillmentOffchain WhisperFulfillmentKind = "offchain"
	WhisperFulfillmentERC20    WhisperFulfillmentKind = "erc20"
	WhisperFulfillmentERC721   WhisperFulfillmentKind = "erc721"
	WhisperFulfillmentERC1155  WhisperFulfillmentKind = "erc1155"
)

const (
	WhisperFulfillmentStatusOffchain  WhisperFulfillmentStatus = "offchain"
	WhisperFulfillmentStatusEscrowed  WhisperFulfillmentStatus = "escrowed"
	WhisperFulfillmentStatusClaimed   WhisperFulfillmentStatus = "claimed"
	WhisperFulfillmentStatusReclaimed WhisperFulfillmentStatus = "reclaimed"
)

type WhisperAuction struct {
	ID                          uint64
	Creator                     string
	PaymentToken                string
	ProceedsRecipientCommitment string
	MetadataHash                string
	FulfillmentKind             WhisperFulfillmentKind
	AssetToken                  string
	AssetTokenID                string
	AssetAmount                 string
	FulfillmentStatus           WhisperFulfillmentStatus
	WinnerPayloadDomain         string
	ReservePrice                string
	MaxBids                     uint32
	BiddingDeadline             uint64
	ForceRevealAfter            uint64
	AbortAfter                  uint64
	VaultAddress                string
	VaultPublicKey              string
	RevealPublicKey             string
	OperatorIdentityCommitment  string
	AcceptedBidsHash            string
	SubmissionCount             uint32
	BidCount                    uint32
	Status                      WhisperStatus
	SettlementHash              string
	RecoveryHash                string
}

type WhisperResult struct {
	AuctionID        uint64
	HasWinner        bool
	WinnerBidHandle  string
	WinnerCommitment string
	WinningBid       string
	SecondHighestBid string
	ClearingPrice    string
	RevealsRoot      string
	OutputsRoot      string
	SettlementHash   string
	SettledAt        uint64
}

// WhisperReader is the read-only boundary for the sealed-bid contract.
type WhisperReader interface {
	Auction(ctx context.Context, address string, auctionID uint64) (WhisperAuction, error)
	Result(ctx context.Context, address string, auctionID uint64) (WhisperResult, error)
	ChainTimestamp(ctx context.Context) (uint64, error)
}

type RPCWhisperReader struct{ rpc *rpcClient }

func NewWhisperReader(rpcURL string) *RPCWhisperReader {
	return &RPCWhisperReader{rpc: newRPCClient(rpcURL)}
}

func (r *RPCWhisperReader) Auction(
	ctx context.Context,
	address string,
	auctionID uint64,
) (WhisperAuction, error) {
	address, err := normalizeAddress(address)
	if err != nil {
		return WhisperAuction{}, fmt.Errorf("invalid Whisper address: %w", err)
	}
	result, err := r.rpc.call(ctx, address, "get_auction", []string{uintHex(auctionID)})
	if err != nil {
		return WhisperAuction{}, err
	}
	if len(result) != 28 {
		return WhisperAuction{}, fmt.Errorf("unexpected Whisper auction length %d", len(result))
	}

	id, err := parseUint(result[0], 64)
	if err != nil {
		return WhisperAuction{}, fieldError("id", err)
	}
	creator, err := normalizeContractAddress(result[1])
	if err != nil {
		return WhisperAuction{}, fieldError("creator", err)
	}
	paymentToken, err := normalizeContractAddress(result[2])
	if err != nil {
		return WhisperAuction{}, fieldError("payment_token", err)
	}
	proceedsRecipientCommitment, err := normalizedResponseFelt(result[3], "proceeds_recipient_commitment")
	if err != nil {
		return WhisperAuction{}, err
	}
	metadataHash, err := normalizedResponseFelt(result[4], "metadata_hash")
	if err != nil {
		return WhisperAuction{}, err
	}
	fulfillmentKind, err := parseWhisperFulfillmentKind(result[5])
	if err != nil {
		return WhisperAuction{}, fieldError("fulfillment.kind", err)
	}
	assetToken, err := normalizeContractAddress(result[6])
	if err != nil {
		return WhisperAuction{}, fieldError("fulfillment.token", err)
	}
	assetTokenID, err := parseU256String(result[7], result[8])
	if err != nil {
		return WhisperAuction{}, fieldError("fulfillment.token_id", err)
	}
	assetAmount, err := parseU256String(result[9], result[10])
	if err != nil {
		return WhisperAuction{}, fieldError("fulfillment.amount", err)
	}
	fulfillmentStatus, err := parseWhisperFulfillmentStatus(result[11])
	if err != nil {
		return WhisperAuction{}, fieldError("fulfillment_status", err)
	}
	winnerPayloadDomain, err := normalizedResponseFelt(result[12], "winner_payload_domain")
	if err != nil {
		return WhisperAuction{}, err
	}
	reservePrice, err := parseUintString(result[13], 128)
	if err != nil {
		return WhisperAuction{}, fieldError("reserve_price", err)
	}
	maxBids, err := parseUint(result[14], 32)
	if err != nil {
		return WhisperAuction{}, fieldError("max_bids", err)
	}
	biddingDeadline, err := parseUint(result[15], 64)
	if err != nil {
		return WhisperAuction{}, fieldError("bidding_deadline", err)
	}
	forceRevealAfter, err := parseUint(result[16], 64)
	if err != nil {
		return WhisperAuction{}, fieldError("force_reveal_after", err)
	}
	abortAfter, err := parseUint(result[17], 64)
	if err != nil {
		return WhisperAuction{}, fieldError("abort_after", err)
	}
	vaultAddress, err := normalizeContractAddress(result[18])
	if err != nil {
		return WhisperAuction{}, fieldError("vault_address", err)
	}
	vaultPublicKey, err := normalizedResponseFelt(result[19], "vault_public_key")
	if err != nil {
		return WhisperAuction{}, err
	}
	revealPublicKey, err := normalizedResponseFelt(result[20], "reveal_public_key")
	if err != nil {
		return WhisperAuction{}, err
	}
	operatorIdentityCommitment, err := normalizedResponseFelt(result[21], "operator_identity_commitment")
	if err != nil {
		return WhisperAuction{}, err
	}
	acceptedBidsHash, err := normalizedResponseFelt(result[22], "accepted_bids_hash")
	if err != nil {
		return WhisperAuction{}, err
	}
	submissionCount, err := parseUint(result[23], 32)
	if err != nil {
		return WhisperAuction{}, fieldError("submission_count", err)
	}
	bidCount, err := parseUint(result[24], 32)
	if err != nil {
		return WhisperAuction{}, fieldError("bid_count", err)
	}
	status, err := parseWhisperStatus(result[25])
	if err != nil {
		return WhisperAuction{}, fieldError("status", err)
	}
	settlementHash, err := normalizedResponseFelt(result[26], "settlement_hash")
	if err != nil {
		return WhisperAuction{}, err
	}
	recoveryHash, err := normalizedResponseFelt(result[27], "recovery_hash")
	if err != nil {
		return WhisperAuction{}, err
	}

	return WhisperAuction{
		ID: id, Creator: creator, PaymentToken: paymentToken,
		ProceedsRecipientCommitment: proceedsRecipientCommitment,
		MetadataHash:                metadataHash,
		FulfillmentKind:             fulfillmentKind,
		AssetToken:                  assetToken,
		AssetTokenID:                assetTokenID,
		AssetAmount:                 assetAmount,
		FulfillmentStatus:           fulfillmentStatus,
		WinnerPayloadDomain:         winnerPayloadDomain,
		ReservePrice:                reservePrice, MaxBids: uint32(maxBids),
		BiddingDeadline: biddingDeadline, ForceRevealAfter: forceRevealAfter,
		AbortAfter: abortAfter, VaultAddress: vaultAddress,
		VaultPublicKey: vaultPublicKey, RevealPublicKey: revealPublicKey,
		OperatorIdentityCommitment: operatorIdentityCommitment,
		AcceptedBidsHash:           acceptedBidsHash, SubmissionCount: uint32(submissionCount),
		BidCount: uint32(bidCount), Status: status, SettlementHash: settlementHash,
		RecoveryHash: recoveryHash,
	}, nil
}

func parseU256String(lowValue, highValue string) (string, error) {
	low, err := parseUintBig(lowValue, 128)
	if err != nil {
		return "", fmt.Errorf("low limb: %w", err)
	}
	high, err := parseUintBig(highValue, 128)
	if err != nil {
		return "", fmt.Errorf("high limb: %w", err)
	}
	return new(big.Int).Add(low, new(big.Int).Lsh(high, 128)).String(), nil
}

func (r *RPCWhisperReader) Result(
	ctx context.Context,
	address string,
	auctionID uint64,
) (WhisperResult, error) {
	address, err := normalizeAddress(address)
	if err != nil {
		return WhisperResult{}, fmt.Errorf("invalid Whisper address: %w", err)
	}
	result, err := r.rpc.call(ctx, address, "get_result", []string{uintHex(auctionID)})
	if err != nil {
		return WhisperResult{}, err
	}
	if len(result) != 11 {
		return WhisperResult{}, fmt.Errorf("unexpected Whisper result length %d", len(result))
	}

	decoded := WhisperResult{}
	if decoded.AuctionID, err = parseUint(result[0], 64); err != nil {
		return WhisperResult{}, fieldError("auction_id", err)
	}
	if decoded.HasWinner, err = parseBool(result[1]); err != nil {
		return WhisperResult{}, fieldError("has_winner", err)
	}
	if decoded.WinnerBidHandle, err = normalizedResponseFelt(result[2], "winner_bid_handle"); err != nil {
		return WhisperResult{}, err
	}
	if decoded.WinnerCommitment, err = normalizedResponseFelt(result[3], "winner_commitment"); err != nil {
		return WhisperResult{}, err
	}
	if decoded.WinningBid, err = parseUintString(result[4], 128); err != nil {
		return WhisperResult{}, fieldError("winning_bid", err)
	}
	if decoded.SecondHighestBid, err = parseUintString(result[5], 128); err != nil {
		return WhisperResult{}, fieldError("second_highest_bid", err)
	}
	if decoded.ClearingPrice, err = parseUintString(result[6], 128); err != nil {
		return WhisperResult{}, fieldError("clearing_price", err)
	}
	if decoded.RevealsRoot, err = normalizedResponseFelt(result[7], "reveals_root"); err != nil {
		return WhisperResult{}, err
	}
	if decoded.OutputsRoot, err = normalizedResponseFelt(result[8], "outputs_root"); err != nil {
		return WhisperResult{}, err
	}
	if decoded.SettlementHash, err = normalizedResponseFelt(result[9], "settlement_hash"); err != nil {
		return WhisperResult{}, err
	}
	if decoded.SettledAt, err = parseUint(result[10], 64); err != nil {
		return WhisperResult{}, fieldError("settled_at", err)
	}
	return decoded, nil
}

func (r *RPCWhisperReader) ChainTimestamp(ctx context.Context) (uint64, error) {
	return r.rpc.latestBlockTimestamp(ctx)
}

func normalizedResponseFelt(value, field string) (string, error) {
	normalized, err := normalizeFelt(value)
	if err != nil {
		return "", fieldError(field, err)
	}
	return normalized, nil
}

func parseWhisperStatus(value string) (WhisperStatus, error) {
	status, err := parseUint(value, 8)
	if err != nil {
		return "", err
	}
	switch status {
	case 1:
		return WhisperStatusBidding, nil
	case 2:
		return WhisperStatusSettled, nil
	case 3:
		return WhisperStatusAborted, nil
	default:
		return "", fmt.Errorf("unexpected AuctionStatus variant %d", status)
	}
}

func parseWhisperFulfillmentKind(value string) (WhisperFulfillmentKind, error) {
	kind, err := parseUint(value, 8)
	if err != nil {
		return "", err
	}
	switch kind {
	case 0:
		return WhisperFulfillmentOffchain, nil
	case 1:
		return WhisperFulfillmentERC20, nil
	case 2:
		return WhisperFulfillmentERC721, nil
	case 3:
		return WhisperFulfillmentERC1155, nil
	default:
		return "", fmt.Errorf("unknown fulfillment kind %d", kind)
	}
}

func parseWhisperFulfillmentStatus(value string) (WhisperFulfillmentStatus, error) {
	status, err := parseUint(value, 8)
	if err != nil {
		return "", err
	}
	switch status {
	case 0:
		return WhisperFulfillmentStatusOffchain, nil
	case 1:
		return WhisperFulfillmentStatusEscrowed, nil
	case 2:
		return WhisperFulfillmentStatusClaimed, nil
	case 3:
		return WhisperFulfillmentStatusReclaimed, nil
	default:
		return "", fmt.Errorf("unknown fulfillment status %d", status)
	}
}
