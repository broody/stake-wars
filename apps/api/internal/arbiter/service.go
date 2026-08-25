package arbiter

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
	PhaseNone       Phase = "none"
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
	ID                 uint64                 `json:"id"`
	WhisperAddress     string                 `json:"whisperAddress"`
	AuctionID          uint64                 `json:"auctionId"`
	PaymentToken       string                 `json:"paymentToken"`
	ReservePrice       string                 `json:"reservePrice"`
	MaxBids            uint32                 `json:"maxBids"`
	BiddingDeadline    time.Time              `json:"biddingDeadline"`
	ForceRevealAfter   time.Time              `json:"forceRevealAfter"`
	AbortAfter         time.Time              `json:"abortAfter"`
	SubmissionCount    uint32                 `json:"submissionCount"`
	FundedTrancheCount uint32                 `json:"fundedTrancheCount"`
	Status             starknet.WhisperStatus `json:"status"`
	Result             *ResultView            `json:"result"`
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
}

type Service struct {
	store   roundStore
	reader  starknet.WhisperReader
	network string
	now     func() time.Time
}

func NewService(store roundStore, reader starknet.WhisperReader, network string) *Service {
	return &Service{store: store, reader: reader, network: network, now: time.Now}
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
	if err := validateCanonicalRound(round, auction); err != nil {
		return Snapshot{}, err
	}
	chainTimestamp, err := s.reader.ChainTimestamp(ctx)
	if err != nil {
		return Snapshot{}, fmt.Errorf("read Starknet chain time: %w", err)
	}
	biddingDeadline, err := unixTime(auction.BiddingDeadline)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode bidding deadline: %w", err)
	}
	forceRevealAfter, err := unixTime(auction.ForceRevealAfter)
	if err != nil {
		return Snapshot{}, fmt.Errorf("decode force reveal deadline: %w", err)
	}
	abortAfter, err := unixTime(auction.AbortAfter)
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
		ReservePrice: auction.ReservePrice, MaxBids: auction.MaxBids,
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
	if round.ClaimedController != "" && round.ClaimedAt != nil {
		controller, err := starknet.NormalizeAddress(round.ClaimedController)
		if err != nil {
			return Snapshot{}, fmt.Errorf("validate claimed Arbiter controller: %w", err)
		}
		snapshot.Controller = &ControllerView{
			Address: controller, ClaimedAt: *round.ClaimedAt,
			StartsAt: round.BillboardStartsAt, ExpiresAt: round.BillboardExpiresAt,
		}
	}
	return snapshot, nil
}

func lifecyclePhase(auction starknet.WhisperAuction, chainTimestamp uint64) Phase {
	switch auction.Status {
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

func validateCanonicalRound(round CanonicalRound, auction starknet.WhisperAuction) error {
	if auction.ID != round.AuctionID {
		return fmt.Errorf(
			"validate canonical Arbiter round: auction id is %d, expected %d",
			auction.ID,
			round.AuctionID,
		)
	}
	if auction.BiddingDeadline >= auction.ForceRevealAfter ||
		auction.ForceRevealAfter >= auction.AbortAfter {
		return fmt.Errorf("validate canonical Arbiter round: invalid auction deadlines")
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
