package starknet

import (
	"context"
	"fmt"

	"github.com/NethermindEth/juno/core/felt"
)

type BeaconAuctionStatus string

const (
	BeaconAuctionPending BeaconAuctionStatus = "pending"
	BeaconAuctionBidding BeaconAuctionStatus = "bidding"
	BeaconAuctionSettled BeaconAuctionStatus = "settled"
)

const beaconAuctionFelts = 14

// BeaconAuction mirrors the Beacon System's `BeaconAuction` model.
type BeaconAuction struct {
	RoundID                uint64
	Status                 BeaconAuctionStatus
	PaymentToken           string
	ProceedsRecipient      string
	ReservePrice           string
	MinRaiseBps            uint16
	BiddingDurationSeconds uint64
	ExtensionSeconds       uint64
	StartedAt              uint64
	EndsAt                 uint64
	Leader                 string
	LeadingBid             string
	BidCount               uint32
	SettledAt              uint64
}

// BeaconStatus is the current round and the exact minimum for its next bid.
type BeaconStatus struct {
	Initialized  bool
	FirstRoundID uint64
	Auction      BeaconAuction
	MinimumBid   string
}

// BeaconReader is the read-only boundary for the open Beacon auction.
type BeaconReader interface {
	Status(ctx context.Context) (BeaconStatus, error)
	Auction(ctx context.Context, roundID uint64) (BeaconAuction, error)
	ChainTimestamp(ctx context.Context) (uint64, error)
}

type RPCBeaconReader struct {
	rpc          *rpcClient
	beaconSystem string
}

func NewBeaconReader(rpcURL, beaconSystem string) (*RPCBeaconReader, error) {
	address, err := normalizeAddress(beaconSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid Beacon system address: %w", err)
	}
	return &RPCBeaconReader{rpc: newRPCClient(rpcURL), beaconSystem: address}, nil
}

func (r *RPCBeaconReader) Address() string { return r.beaconSystem }

func (r *RPCBeaconReader) Status(ctx context.Context) (BeaconStatus, error) {
	result, err := r.rpc.call(ctx, r.beaconSystem, "get_beacon_status", []string{})
	if err != nil {
		return BeaconStatus{}, err
	}
	return decodeBeaconStatus(result)
}

func (r *RPCBeaconReader) Auction(ctx context.Context, roundID uint64) (BeaconAuction, error) {
	result, err := r.rpc.call(ctx, r.beaconSystem, "get_beacon_auction", []string{uintHex(roundID)})
	if err != nil {
		return BeaconAuction{}, err
	}
	if len(result) != beaconAuctionFelts {
		return BeaconAuction{}, fmt.Errorf("unexpected Beacon auction length %d", len(result))
	}
	return decodeBeaconAuction(result)
}

func (r *RPCBeaconReader) ChainTimestamp(ctx context.Context) (uint64, error) {
	return r.rpc.latestBlockTimestamp(ctx)
}

func decodeBeaconStatus(result []string) (BeaconStatus, error) {
	if len(result) != beaconAuctionFelts+3 {
		return BeaconStatus{}, fmt.Errorf("unexpected Beacon status length %d", len(result))
	}
	initialized, err := parseBool(result[0])
	if err != nil {
		return BeaconStatus{}, fieldError("initialized", err)
	}
	firstRoundID, err := parseUint(result[1], 64)
	if err != nil {
		return BeaconStatus{}, fieldError("first_round_id", err)
	}
	status := BeaconStatus{Initialized: initialized, FirstRoundID: firstRoundID}
	if !initialized {
		return status, nil
	}
	if status.Auction, err = decodeBeaconAuction(result[2 : 2+beaconAuctionFelts]); err != nil {
		return BeaconStatus{}, err
	}
	if status.MinimumBid, err = parseUintString(result[2+beaconAuctionFelts], 128); err != nil {
		return BeaconStatus{}, fieldError("minimum_bid", err)
	}
	return status, nil
}

func decodeBeaconAuction(result []string) (BeaconAuction, error) {
	var (
		auction BeaconAuction
		err     error
		value   uint64
	)
	if auction.RoundID, err = parseUint(result[0], 64); err != nil {
		return BeaconAuction{}, fieldError("round_id", err)
	}
	if value, err = parseUint(result[1], 8); err != nil {
		return BeaconAuction{}, fieldError("status", err)
	}
	switch value {
	case 1:
		auction.Status = BeaconAuctionPending
	case 2:
		auction.Status = BeaconAuctionBidding
	case 3:
		auction.Status = BeaconAuctionSettled
	default:
		return BeaconAuction{}, fmt.Errorf("unknown Beacon auction status %d", value)
	}
	if auction.PaymentToken, err = normalizeContractAddress(result[2]); err != nil {
		return BeaconAuction{}, fieldError("payment_token", err)
	}
	if auction.ProceedsRecipient, err = normalizeContractAddress(result[3]); err != nil {
		return BeaconAuction{}, fieldError("proceeds_recipient", err)
	}
	if auction.ReservePrice, err = parseUintString(result[4], 128); err != nil {
		return BeaconAuction{}, fieldError("reserve_price", err)
	}
	if value, err = parseUint(result[5], 16); err != nil {
		return BeaconAuction{}, fieldError("min_raise_bps", err)
	}
	auction.MinRaiseBps = uint16(value)
	if auction.BiddingDurationSeconds, err = parseUint(result[6], 64); err != nil {
		return BeaconAuction{}, fieldError("bidding_duration_seconds", err)
	}
	if auction.ExtensionSeconds, err = parseUint(result[7], 64); err != nil {
		return BeaconAuction{}, fieldError("extension_seconds", err)
	}
	if auction.StartedAt, err = parseUint(result[8], 64); err != nil {
		return BeaconAuction{}, fieldError("started_at", err)
	}
	if auction.EndsAt, err = parseUint(result[9], 64); err != nil {
		return BeaconAuction{}, fieldError("ends_at", err)
	}
	if auction.Leader, err = normalizeContractAddress(result[10]); err != nil {
		return BeaconAuction{}, fieldError("leader", err)
	}
	if auction.LeadingBid, err = parseUintString(result[11], 128); err != nil {
		return BeaconAuction{}, fieldError("leading_bid", err)
	}
	if value, err = parseUint(result[12], 32); err != nil {
		return BeaconAuction{}, fieldError("bid_count", err)
	}
	auction.BidCount = uint32(value)
	if auction.SettledAt, err = parseUint(result[13], 64); err != nil {
		return BeaconAuction{}, fieldError("settled_at", err)
	}
	return auction, nil
}

type BeaconSubmitter interface {
	SettleBeaconAuction(ctx context.Context, roundID uint64) (string, error)
}

type AccountBeaconSubmitter struct {
	keeper       *AccountSupplyDropSubmitter
	beaconSystem *felt.Felt
}

// NewBeaconSubmitter shares the existing keeper account, nonce lock, and
// pending receipt with SupplyDrop maintenance. It does not create another signer.
func NewBeaconSubmitter(
	keeper *AccountSupplyDropSubmitter,
	beaconSystem string,
) (*AccountBeaconSubmitter, error) {
	address, err := normalizeAddress(beaconSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid Beacon system address: %w", err)
	}
	if keeper == nil {
		return nil, fmt.Errorf("Beacon settlement requires the keeper signer")
	}
	system, _ := new(felt.Felt).SetString(address)
	return &AccountBeaconSubmitter{keeper: keeper, beaconSystem: system}, nil
}

func (s *AccountBeaconSubmitter) SettleBeaconAuction(
	ctx context.Context,
	roundID uint64,
) (string, error) {
	return s.keeper.invoke(ctx, s.beaconSystem, "settle_beacon_auction", roundID)
}
