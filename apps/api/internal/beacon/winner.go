package beacon

import (
	"context"
	"fmt"
	"net/http"

	"stakewars.com/api/internal/starknet"
)

type winnerDisclosure struct {
	Status            string `json:"status"`
	AuctionID         string `json:"auctionId"`
	WinnerGroupHandle string `json:"winnerGroupHandle"`
	WinnerCommitment  string `json:"winnerCommitment"`
	Address           string `json:"address"`
}

func (c *OperatorCoordinatorClient) winnerDisclosure(
	ctx context.Context,
	auctionID uint64,
) (winnerDisclosure, error) {
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		fmt.Sprintf("%s/v1/auctions/%d/winner", c.url, auctionID),
		nil,
	)
	if err != nil {
		return winnerDisclosure{}, err
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	response, err := c.client.Do(request)
	if err != nil {
		return winnerDisclosure{}, fmt.Errorf("read Whisper winner disclosure: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return winnerDisclosure{}, fmt.Errorf(
			"read Whisper winner disclosure: unexpected status %d",
			response.StatusCode,
		)
	}
	var result winnerDisclosure
	if err := decodeCoordinatorJSON(response.Body, &result); err != nil {
		return winnerDisclosure{}, err
	}
	return result, nil
}

type winnerProjectionStore interface {
	UnresolvedWinners(ctx context.Context, network string) ([]UnresolvedWinner, error)
	ResolveWinner(
		ctx context.Context,
		network string,
		winner UnresolvedWinner,
		address string,
	) error
}

type winnerDisclosureSource interface {
	winnerDisclosure(ctx context.Context, auctionID uint64) (winnerDisclosure, error)
}

type WinnerProjector struct {
	store   winnerProjectionStore
	source  winnerDisclosureSource
	network string
}

func NewWinnerProjector(
	store winnerProjectionStore,
	source winnerDisclosureSource,
	network string,
) *WinnerProjector {
	return &WinnerProjector{store: store, source: source, network: network}
}

func (p *WinnerProjector) Reconcile(ctx context.Context) error {
	winners, err := p.store.UnresolvedWinners(ctx, p.network)
	if err != nil {
		return err
	}
	for _, winner := range winners {
		disclosure, err := p.source.winnerDisclosure(ctx, winner.AuctionID)
		if err != nil {
			return fmt.Errorf("resolve Beacon winner for round %d: %w", winner.RoundID, err)
		}
		if disclosure.Status != "winner" {
			return fmt.Errorf(
				"resolve Beacon winner for round %d: operator returned %q",
				winner.RoundID,
				disclosure.Status,
			)
		}
		auctionID, err := parseHexUint64(disclosure.AuctionID)
		if err != nil || auctionID != winner.AuctionID {
			return fmt.Errorf("resolve Beacon winner for round %d: auction ID mismatch", winner.RoundID)
		}
		winnerGroup, err := starknet.NormalizeFelt(disclosure.WinnerGroupHandle)
		if err != nil || winnerGroup != winner.WinnerGroupHandle {
			return fmt.Errorf("resolve Beacon winner for round %d: winner group mismatch", winner.RoundID)
		}
		winnerCommitment, err := starknet.NormalizeFelt(disclosure.WinnerCommitment)
		if err != nil || winnerCommitment != winner.WinnerCommitment {
			return fmt.Errorf("resolve Beacon winner for round %d: winner commitment mismatch", winner.RoundID)
		}
		address, err := starknet.NormalizeAddress(disclosure.Address)
		if err != nil {
			return fmt.Errorf("resolve Beacon winner for round %d: invalid address: %w", winner.RoundID, err)
		}
		if err := p.store.ResolveWinner(ctx, p.network, winner, address); err != nil {
			return err
		}
	}
	return nil
}
