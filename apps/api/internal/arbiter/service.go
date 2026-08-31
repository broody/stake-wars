package arbiter

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"stakewars.com/api/internal/starknet"
)

const defaultBiddingDurationSeconds = 3 * 24 * 60 * 60

type Phase string

const (
	PhaseNone       Phase = "none"
	PhasePending    Phase = "pending"
	PhaseBidding    Phase = "bidding"
	PhaseAcceptance Phase = "acceptance"
	PhaseSettling   Phase = "settling"
	PhaseRecovery   Phase = "recovery"
	PhaseSettled    Phase = "settled"
	PhaseAborted    Phase = "aborted"
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
	ID                  uint64                 `json:"id"`
	WhisperAddress      string                 `json:"whisperAddress"`
	AuctionID           uint64                 `json:"auctionId"`
	PaymentToken        string                 `json:"paymentToken"`
	WinnerPayloadDomain string                 `json:"winnerPayloadDomain"`
	ReservePrice        string                 `json:"reservePrice"`
	MaxBids             uint32                 `json:"maxBids"`
	VaultAddress        string                 `json:"vaultAddress"`
	RevealPublicKey     string                 `json:"revealPublicKey"`
	Schedule            ScheduleView           `json:"schedule"`
	StartedAt           *time.Time             `json:"startedAt"`
	BiddingDeadline     *time.Time             `json:"biddingDeadline"`
	ForceRevealAfter    *time.Time             `json:"forceRevealAfter"`
	AbortAfter          *time.Time             `json:"abortAfter"`
	SubmissionCount     uint32                 `json:"submissionCount"`
	FundedTrancheCount  uint32                 `json:"fundedTrancheCount"`
	Status              starknet.WhisperStatus `json:"status"`
	Result              *ResultView            `json:"result"`
}

type ScheduleView struct {
	Kind                      starknet.WhisperScheduleKind `json:"kind"`
	BiddingDurationSeconds    uint64                       `json:"biddingDurationSeconds"`
	AcceptanceDurationSeconds uint64                       `json:"acceptanceDurationSeconds"`
	SettlementDurationSeconds uint64                       `json:"settlementDurationSeconds"`
}

type ResultView struct {
	HasWinner        bool      `json:"hasWinner"`
	WinnerCommitment string    `json:"winnerCommitment"`
	WinningBid       string    `json:"winningBid"`
	SecondHighestBid string    `json:"secondHighestBid"`
	ClearingPrice    string    `json:"clearingPrice"`
	SettledAt        time.Time `json:"settledAt"`
}

type ControllerView struct {
	Address   string     `json:"address"`
	ClaimedAt time.Time  `json:"claimedAt"`
	StartsAt  *time.Time `json:"startsAt"`
	ExpiresAt *time.Time `json:"expiresAt"`
}

type BillboardView struct {
	ImageURL     string    `json:"imageUrl"`
	ThumbnailURL string    `json:"thumbnailUrl"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type roundStore interface {
	Current(ctx context.Context, network string) (CanonicalRound, error)
	Controller(ctx context.Context, network string) (ControllerRecord, error)
	Billboard(ctx context.Context, network string, artworkID string) (BillboardRecord, error)
}

type Service struct {
	store                  roundStore
	reader                 starknet.WhisperReader
	network                string
	biddingDurationSeconds uint64
	now                    func() time.Time
}

func NewService(
	store roundStore,
	reader starknet.WhisperReader,
	network string,
	biddingDurationSeconds uint64,
) *Service {
	return &Service{
		store: store, reader: reader, network: network,
		biddingDurationSeconds: biddingDurationSeconds, now: time.Now,
	}
}

func (s *Service) Current(ctx context.Context) (Snapshot, error) {
	round, err := s.store.Current(ctx, s.network)
	if errors.Is(err, ErrNoRound) {
		return Snapshot{
			Network: s.network, Phase: PhaseNone, ObservedAt: s.now().UTC(),
		}, nil
	}
	if err != nil {
		return Snapshot{}, err
	}
	whisperAddress, err := starknet.NormalizeAddress(round.WhisperAddress)
	if err != nil {
		return Snapshot{}, fmt.Errorf("validate canonical Arbiter round: invalid Whisper address: %w", err)
	}

	auction, err := s.reader.Auction(ctx, whisperAddress, round.AuctionID)
	if err != nil {
		return Snapshot{}, fmt.Errorf("read Whisper auction: %w", err)
	}
	if err := validateCanonicalRound(round, auction, s.biddingDurationSeconds); err != nil {
		return Snapshot{}, err
	}
	chainTimestamp, err := s.reader.ChainTimestamp(ctx)
	if err != nil {
		return Snapshot{}, fmt.Errorf("read Starknet chain time: %w", err)
	}
	startedAt, err := optionalUnixTime(auction.StartedAt)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode auction start: %w", err)
	}
	biddingDeadline, err := optionalUnixTime(auction.BiddingDeadline)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode bidding deadline: %w", err)
	}
	forceRevealAfter, err := optionalUnixTime(auction.ForceRevealAfter)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode force reveal deadline: %w", err)
	}
	abortAfter, err := optionalUnixTime(auction.AbortAfter)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode abort deadline: %w", err)
	}
	observedAt, err := unixTime(chainTimestamp)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode Starknet chain time: %w", err)
	}

	view := &RoundView{
		ID: round.RoundID, WhisperAddress: whisperAddress,
		AuctionID: round.AuctionID, PaymentToken: auction.PaymentToken,
		WinnerPayloadDomain: auction.WinnerPayloadDomain,
		ReservePrice:        auction.ReservePrice, MaxBids: auction.MaxBids,
		VaultAddress: auction.VaultAddress, RevealPublicKey: auction.RevealPublicKey,
		Schedule: ScheduleView{
			Kind:                      auction.Schedule.Kind,
			BiddingDurationSeconds:    auction.Schedule.BiddingDuration,
			AcceptanceDurationSeconds: auction.Schedule.AcceptanceDuration,
			SettlementDurationSeconds: auction.Schedule.SettlementDuration,
		},
		StartedAt:       startedAt,
		BiddingDeadline: biddingDeadline, ForceRevealAfter: forceRevealAfter,
		AbortAfter:         abortAfter,
		SubmissionCount:    auction.SubmissionCount,
		FundedTrancheCount: auction.BidCount, Status: auction.Status,
	}
	if auction.Status == starknet.WhisperStatusSettled {
		result, err := s.reader.Result(ctx, whisperAddress, round.AuctionID)
		if err != nil {
			return Snapshot{}, fmt.Errorf("read Whisper result: %w", err)
		}
		if result.AuctionID != round.AuctionID {
			return Snapshot{}, fmt.Errorf(
				"validate canonical Arbiter round: result auction id is %d, expected %d",
				result.AuctionID,
				round.AuctionID,
			)
		}
		if result.SettlementHash != auction.SettlementHash {
			return Snapshot{}, fmt.Errorf("validate canonical Arbiter round: settlement hash mismatch")
		}
		settledAt, err := unixTime(result.SettledAt)
		if err != nil {
			return Snapshot{}, fmt.Errorf("decode settlement time: %w", err)
		}
		view.Result = &ResultView{
			HasWinner: result.HasWinner, WinnerCommitment: result.WinnerCommitment,
			WinningBid: result.WinningBid, SecondHighestBid: result.SecondHighestBid,
			ClearingPrice: result.ClearingPrice,
			SettledAt:     settledAt,
		}
	}

	snapshot := Snapshot{
		Network:    s.network,
		Phase:      lifecyclePhase(auction, chainTimestamp),
		ObservedAt: observedAt,
		Round:      view,
	}
	controllerRecord, err := s.store.Controller(ctx, s.network)
	if err != nil && !errors.Is(err, ErrNoController) {
		return Snapshot{}, err
	}
	if err == nil {
		controller, err := starknet.NormalizeAddress(controllerRecord.Address)
		if err != nil {
			return Snapshot{}, fmt.Errorf("validate claimed Arbiter controller: %w", err)
		}
		snapshot.Controller = &ControllerView{
			Address: controller, ClaimedAt: controllerRecord.ClaimedAt,
			StartsAt: controllerRecord.StartsAt,
		}
		if controllerRecord.ActiveArtworkID != "" {
			billboard, err := s.store.Billboard(
				ctx,
				s.network,
				controllerRecord.ActiveArtworkID,
			)
			if err != nil {
				return Snapshot{}, fmt.Errorf("read current Arbiter billboard: %w", err)
			}
			snapshot.Billboard = &BillboardView{
				ImageURL: billboard.ImageURL, ThumbnailURL: billboard.ThumbnailURL,
				UpdatedAt: billboard.UpdatedAt,
			}
		}
	}
	return snapshot, nil
}

func lifecyclePhase(auction starknet.WhisperAuction, chainTimestamp uint64) Phase {
	switch auction.Status {
	case starknet.WhisperStatusPending:
		return PhasePending
	case starknet.WhisperStatusSettled:
		return PhaseSettled
	case starknet.WhisperStatusAborted:
		return PhaseAborted
	}
	if chainTimestamp < auction.BiddingDeadline {
		return PhaseBidding
	}
	if chainTimestamp < auction.ForceRevealAfter {
		return PhaseAcceptance
	}
	if chainTimestamp < auction.AbortAfter {
		return PhaseSettling
	}
	return PhaseRecovery
}

func validateCanonicalRound(
	round CanonicalRound,
	auction starknet.WhisperAuction,
	expectedBiddingDurationSeconds uint64,
) error {
	if round.BiddingDurationSeconds > 0 {
		expectedBiddingDurationSeconds = round.BiddingDurationSeconds
	}
	if auction.ID != round.AuctionID {
		return fmt.Errorf(
			"validate canonical Arbiter round: auction id is %d, expected %d",
			auction.ID,
			round.AuctionID,
		)
	}
	if auction.Status == starknet.WhisperStatusPending {
		if auction.Schedule.Kind != starknet.WhisperScheduleStartOnBid ||
			auction.StartedAt != 0 || auction.BiddingDeadline != 0 ||
			auction.ForceRevealAfter != 0 || auction.AbortAfter != 0 {
			return fmt.Errorf("validate canonical Arbiter round: invalid pending schedule")
		}
	} else if auction.BiddingDeadline >= auction.ForceRevealAfter ||
		auction.ForceRevealAfter >= auction.AbortAfter {
		return fmt.Errorf("validate canonical Arbiter round: invalid auction deadlines")
	}
	if auction.Schedule.Kind == starknet.WhisperScheduleStartOnBid &&
		(auction.Schedule.BiddingDuration == 0 ||
			auction.Schedule.AcceptanceDuration == 0 ||
			auction.Schedule.SettlementDuration == 0) {
		return fmt.Errorf("validate canonical Arbiter round: invalid start-on-bid durations")
	}
	if auction.Schedule.Kind == starknet.WhisperScheduleStartOnBid &&
		auction.Schedule.BiddingDuration != expectedBiddingDurationSeconds {
		return fmt.Errorf(
			"validate canonical Arbiter round: bidding window is %d seconds, expected %d",
			auction.Schedule.BiddingDuration,
			expectedBiddingDurationSeconds,
		)
	}
	if auction.Schedule.Kind != starknet.WhisperScheduleAbsolute &&
		auction.Schedule.Kind != starknet.WhisperScheduleStartOnBid {
		return fmt.Errorf("validate canonical Arbiter round: unsupported auction schedule")
	}
	if auction.Schedule.Kind == starknet.WhisperScheduleAbsolute &&
		(auction.Schedule.AbsoluteBiddingDeadline != auction.BiddingDeadline ||
			auction.Schedule.AbsoluteForceRevealAfter != auction.ForceRevealAfter ||
			auction.Schedule.AbsoluteAbortAfter != auction.AbortAfter) {
		return fmt.Errorf("validate canonical Arbiter round: absolute schedule mismatch")
	}
	if auction.Schedule.Kind == starknet.WhisperScheduleStartOnBid &&
		auction.Status != starknet.WhisperStatusPending &&
		(auction.StartedAt == 0 || auction.StartedAt >= auction.BiddingDeadline ||
			auction.BiddingDeadline-auction.StartedAt != auction.Schedule.BiddingDuration ||
			auction.ForceRevealAfter-auction.BiddingDeadline != auction.Schedule.AcceptanceDuration ||
			auction.AbortAfter-auction.ForceRevealAfter != auction.Schedule.SettlementDuration) {
		return fmt.Errorf("validate canonical Arbiter round: resolved schedule mismatch")
	}
	if auction.FulfillmentKind != starknet.WhisperFulfillmentOffchain ||
		auction.FulfillmentStatus != starknet.WhisperFulfillmentStatusOffchain ||
		auction.AssetToken != "0x0" || auction.AssetTokenID != "0" ||
		auction.AssetAmount != "0" {
		return fmt.Errorf("validate canonical Arbiter round: fulfillment must be offchain")
	}
	checks := []struct {
		name     string
		expected string
		actual   string
		address  bool
	}{
		{name: "creator", expected: round.ExpectedCreator, actual: auction.Creator, address: true},
		{name: "payment token", expected: round.PaymentToken, actual: auction.PaymentToken, address: true},
		{name: "metadata hash", expected: round.MetadataHash, actual: auction.MetadataHash},
		{name: "winner payload domain", expected: round.WinnerPayloadDomain, actual: auction.WinnerPayloadDomain},
		{name: "vault address", expected: round.VaultAddress, actual: auction.VaultAddress, address: true},
	}
	for _, check := range checks {
		normalize := starknet.NormalizeFelt
		if check.address {
			normalize = starknet.NormalizeAddress
		}
		expected, err := normalize(check.expected)
		if err != nil {
			return fmt.Errorf("validate canonical Arbiter round: invalid %s: %w", check.name, err)
		}
		actual, err := normalize(check.actual)
		if err != nil {
			return fmt.Errorf("validate canonical Arbiter round: invalid on-chain %s: %w", check.name, err)
		}
		if expected != actual {
			return fmt.Errorf("validate canonical Arbiter round: %s mismatch", check.name)
		}
	}
	return nil
}

func unixTime(value uint64) (time.Time, error) {
	if value > math.MaxInt64 {
		return time.Time{}, fmt.Errorf("timestamp exceeds signed Unix range")
	}
	return time.Unix(int64(value), 0).UTC(), nil
}

func optionalUnixTime(value uint64) (*time.Time, error) {
	if value == 0 {
		return nil, nil
	}
	decoded, err := unixTime(value)
	if err != nil {
		return nil, err
	}
	return &decoded, nil
}
