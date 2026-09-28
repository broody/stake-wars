package beacon

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"stakewars.com/api/internal/starknet"
)

type Phase string

const (
	PhaseNone     Phase = "none"
	PhasePending  Phase = "pending"
	PhaseBidding  Phase = "bidding"
	PhaseSettling Phase = "settling"
)

type Snapshot struct {
	Network    string          `json:"network"`
	Phase      Phase           `json:"phase"`
	ObservedAt time.Time       `json:"observedAt"`
	Round      *RoundView      `json:"round"`
	Controller *ControllerView `json:"controller"`
	Billboard  *BillboardView  `json:"billboard"`
}

type RoundView struct {
	ID                     uint64     `json:"id"`
	AuctionAddress         string     `json:"auctionAddress"`
	PaymentToken           string     `json:"paymentToken"`
	ReservePrice           string     `json:"reservePrice"`
	MinRaiseBps            uint16     `json:"minRaiseBps"`
	BiddingDurationSeconds uint64     `json:"biddingDurationSeconds"`
	ExtensionSeconds       uint64     `json:"extensionSeconds"`
	StartedAt              *time.Time `json:"startedAt"`
	EndsAt                 *time.Time `json:"endsAt"`
	Leader                 *string    `json:"leader"`
	LeadingBid             string     `json:"leadingBid"`
	MinimumBid             string     `json:"minimumBid"`
	BidCount               uint32     `json:"bidCount"`
}

type ControllerView struct {
	Address      string    `json:"address"`
	RoundID      uint64    `json:"roundId"`
	ClaimedAt    time.Time `json:"claimedAt"`
	HasPublished bool      `json:"hasPublished"`
}

type BillboardView struct {
	ImageURL       string    `json:"imageUrl"`
	ThumbnailURL   string    `json:"thumbnailUrl"`
	Description    string    `json:"description"`
	DestinationURL string    `json:"destinationUrl"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type controllerStore interface {
	Controller(ctx context.Context, network string) (ControllerRecord, error)
	CurrentBillboard(ctx context.Context, network string) (BillboardRecord, error)
}

type Service struct {
	store          controllerStore
	reader         starknet.BeaconReader
	projector      *SettlementProjector
	network        string
	auctionAddress string
	now            func() time.Time
}

// NewService serves the Beacon aggregate. A nil reader means the Beacon System
// is not configured yet; the preserved controller and billboard still render.
func NewService(
	store controllerStore,
	reader starknet.BeaconReader,
	projector *SettlementProjector,
	network string,
	auctionAddress string,
) *Service {
	return &Service{
		store: store, reader: reader, projector: projector, network: network,
		auctionAddress: auctionAddress, now: time.Now,
	}
}

func (s *Service) Current(ctx context.Context) (Snapshot, error) {
	snapshot := Snapshot{Network: s.network, Phase: PhaseNone, ObservedAt: s.now().UTC()}
	if s.reader != nil {
		status, err := s.reader.Status(ctx)
		if err != nil {
			return Snapshot{}, fmt.Errorf("read Beacon auction: %w", err)
		}
		if status.Initialized {
			chainTimestamp, err := s.reader.ChainTimestamp(ctx)
			if err != nil {
				return Snapshot{}, fmt.Errorf("read Starknet chain time: %w", err)
			}
			observedAt, err := unixTime(chainTimestamp)
			if err != nil {
				return Snapshot{}, fmt.Errorf("decode Starknet chain time: %w", err)
			}
			// Project any settlement first so the controller matches the round.
			if err := s.projector.Sync(ctx, status); err != nil {
				return Snapshot{}, err
			}
			round, phase, err := roundView(s.auctionAddress, status, chainTimestamp)
			if err != nil {
				return Snapshot{}, fmt.Errorf("validate current Beacon round: %w", err)
			}
			snapshot.Round, snapshot.Phase, snapshot.ObservedAt = round, phase, observedAt
		}
	}

	controller, err := s.store.Controller(ctx, s.network)
	if err != nil && !errors.Is(err, ErrNoController) {
		return Snapshot{}, err
	}
	if err == nil {
		address, err := starknet.NormalizeAddress(controller.Address)
		if err != nil {
			return Snapshot{}, fmt.Errorf("validate Beacon controller: %w", err)
		}
		snapshot.Controller = &ControllerView{
			Address: address, RoundID: controller.RoundID, ClaimedAt: controller.ClaimedAt,
			HasPublished: controller.ActiveArtworkID != "",
		}
	}
	billboard, err := s.store.CurrentBillboard(ctx, s.network)
	if err != nil && !errors.Is(err, ErrNoBillboard) {
		return Snapshot{}, fmt.Errorf("read active Beacon billboard: %w", err)
	}
	if err == nil {
		snapshot.Billboard = &BillboardView{
			ImageURL: billboard.ImageURL, ThumbnailURL: billboard.ThumbnailURL,
			Description: billboard.Description, DestinationURL: billboard.DestinationURL,
			UpdatedAt: billboard.UpdatedAt,
		}
	}
	return snapshot, nil
}

func roundView(
	auctionAddress string,
	status starknet.BeaconStatus,
	chainTimestamp uint64,
) (*RoundView, Phase, error) {
	auction := status.Auction
	if auction.RoundID == 0 || auction.RoundID < status.FirstRoundID {
		return nil, "", fmt.Errorf("invalid round ID %d", auction.RoundID)
	}
	view := &RoundView{
		ID: auction.RoundID, AuctionAddress: auctionAddress,
		PaymentToken: auction.PaymentToken, ReservePrice: auction.ReservePrice,
		MinRaiseBps:            auction.MinRaiseBps,
		BiddingDurationSeconds: auction.BiddingDurationSeconds,
		ExtensionSeconds:       auction.ExtensionSeconds,
		LeadingBid:             auction.LeadingBid, MinimumBid: status.MinimumBid,
		BidCount: auction.BidCount,
	}
	switch auction.Status {
	case starknet.BeaconAuctionPending:
		if auction.StartedAt != 0 || auction.EndsAt != 0 || auction.Leader != "0x0" ||
			auction.LeadingBid != "0" || auction.BidCount != 0 {
			return nil, "", fmt.Errorf("pending round has bids")
		}
		return view, PhasePending, nil
	case starknet.BeaconAuctionBidding:
		leader, err := starknet.NormalizeAddress(auction.Leader)
		if err != nil || auction.BidCount == 0 || auction.StartedAt == 0 ||
			auction.EndsAt <= auction.StartedAt {
			return nil, "", fmt.Errorf("bidding round has no valid leader or schedule")
		}
		startedAt, err := unixTime(auction.StartedAt)
		if err != nil {
			return nil, "", fmt.Errorf("decode auction start: %w", err)
		}
		endsAt, err := unixTime(auction.EndsAt)
		if err != nil {
			return nil, "", fmt.Errorf("decode auction deadline: %w", err)
		}
		view.Leader, view.StartedAt, view.EndsAt = &leader, &startedAt, &endsAt
		if chainTimestamp < auction.EndsAt {
			return view, PhaseBidding, nil
		}
		return view, PhaseSettling, nil
	default:
		return nil, "", fmt.Errorf("current round is %s", auction.Status)
	}
}

func unixTime(value uint64) (time.Time, error) {
	if value > math.MaxInt64 {
		return time.Time{}, fmt.Errorf("timestamp exceeds signed Unix range")
	}
	return time.Unix(int64(value), 0).UTC(), nil
}
