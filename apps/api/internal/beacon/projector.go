package beacon

import (
	"context"
	"fmt"
	"math/big"
	"sync"

	"stakewars.com/api/internal/starknet"
)

// Bound one pass so a long outage cannot turn a request into an unbounded scan.
const maxProjectedRoundsPerSync = 50

type projectionStore interface {
	ProjectionCursor(ctx context.Context, network string) (uint64, uint64, error)
	SaveSettlement(ctx context.Context, network string, settlement Settlement) error
}

// SettlementProjector copies settled onchain rounds into the controller table.
// The Beacon System settles a round and opens its successor atomically, so
// every round below the current one is settled and has a winner.
type SettlementProjector struct {
	store   projectionStore
	reader  starknet.BeaconReader
	network string
	mu      sync.Mutex
}

func NewSettlementProjector(
	store projectionStore,
	reader starknet.BeaconReader,
	network string,
) *SettlementProjector {
	return &SettlementProjector{store: store, reader: reader, network: network}
}

func (p *SettlementProjector) Reconcile(ctx context.Context) error {
	if p == nil || p.reader == nil {
		return nil
	}
	status, err := p.reader.Status(ctx)
	if err != nil {
		return fmt.Errorf("read Beacon status: %w", err)
	}
	return p.Sync(ctx, status)
}

// Sync projects every settled round below the supplied current round.
func (p *SettlementProjector) Sync(ctx context.Context, status starknet.BeaconStatus) error {
	if p == nil || p.reader == nil || !status.Initialized {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	legacyRoundID, openRoundID, err := p.store.ProjectionCursor(ctx, p.network)
	if err != nil {
		return err
	}
	if status.FirstRoundID <= legacyRoundID {
		return fmt.Errorf(
			"Beacon first round %d overlaps Whisper-era round %d",
			status.FirstRoundID,
			legacyRoundID,
		)
	}
	current := status.Auction.RoundID
	if current < status.FirstRoundID {
		return fmt.Errorf("Beacon current round %d precedes first round %d", current, status.FirstRoundID)
	}
	next := max(openRoundID+1, status.FirstRoundID)
	last := min(current, next+maxProjectedRoundsPerSync)
	for roundID := next; roundID < last; roundID++ {
		auction, err := p.reader.Auction(ctx, roundID)
		if err != nil {
			return fmt.Errorf("read Beacon round %d: %w", roundID, err)
		}
		settlement, err := verifiedSettlement(roundID, auction)
		if err != nil {
			return fmt.Errorf("verify Beacon round %d: %w", roundID, err)
		}
		if err := p.store.SaveSettlement(ctx, p.network, settlement); err != nil {
			return err
		}
	}
	return nil
}

func verifiedSettlement(roundID uint64, auction starknet.BeaconAuction) (Settlement, error) {
	if auction.RoundID != roundID {
		return Settlement{}, fmt.Errorf("round ID is %d", auction.RoundID)
	}
	if auction.Status != starknet.BeaconAuctionSettled {
		return Settlement{}, fmt.Errorf("round is %s, not settled", auction.Status)
	}
	winner, err := starknet.NormalizeAddress(auction.Leader)
	if err != nil {
		return Settlement{}, fmt.Errorf("invalid winner: %w", err)
	}
	winningBid, ok := new(big.Int).SetString(auction.LeadingBid, 10)
	if !ok || winningBid.Sign() <= 0 {
		return Settlement{}, fmt.Errorf("invalid winning bid")
	}
	reserve, ok := new(big.Int).SetString(auction.ReservePrice, 10)
	if !ok || winningBid.Cmp(reserve) < 0 {
		return Settlement{}, fmt.Errorf("winning bid is below the reserve")
	}
	if auction.BidCount == 0 || auction.StartedAt == 0 ||
		auction.SettledAt < auction.EndsAt || auction.EndsAt <= auction.StartedAt {
		return Settlement{}, fmt.Errorf("invalid settled schedule")
	}
	settledAt, err := unixTime(auction.SettledAt)
	if err != nil {
		return Settlement{}, fmt.Errorf("invalid settlement time: %w", err)
	}
	return Settlement{
		RoundID: roundID, Controller: winner, WinningBid: winningBid.String(),
		BidCount: auction.BidCount, SettledAt: settledAt,
	}, nil
}

// ControllerSource re-projects onchain settlements before answering, so image
// authorization never trusts a controller that a newer settlement replaced.
type ControllerSource struct {
	store     *Store
	projector *SettlementProjector
}

func NewControllerSource(store *Store, projector *SettlementProjector) *ControllerSource {
	return &ControllerSource{store: store, projector: projector}
}

func (c *ControllerSource) CurrentController(
	ctx context.Context,
	network string,
) (uint64, string, string, error) {
	if err := c.projector.Reconcile(ctx); err != nil {
		return 0, "", "", err
	}
	controller, err := c.store.Controller(ctx, network)
	if err != nil {
		return 0, "", "", err
	}
	return controller.RoundID, controller.Address, controller.ActiveArtworkID, nil
}
