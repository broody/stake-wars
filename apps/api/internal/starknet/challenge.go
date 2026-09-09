package starknet

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/NethermindEth/juno/core/felt"
)

const contestedSectorsQuery = `
query StakeWarsContestedSectors($after: Cursor) {
  stakewarsSectorModels(first: 100, after: $after, where: {active_challenge_idGT: "0x0"}) {
    edges { node { id active_challenge_id } }
    pageInfo { hasNextPage endCursor }
  }
}`

type ChallengeCandidate struct {
	SectorID    uint32
	ChallengeID uint64
}

type ChallengeReader interface {
	ContestedSectors(context.Context) ([]ChallengeCandidate, error)
	SectorStatus(context.Context, uint32) (SectorStatus, error)
	ChainHead(context.Context) (ChainHead, error)
}

// Torii supplies candidates only. All settlement decisions use the Control
// System's current state and the chain's timestamp, never the server's clock.
type RPCChallengeReader struct {
	*RPCControlReader
	toriiURL   string
	httpClient *http.Client
}

func NewChallengeReader(rpcURL, toriiURL, controlSystem string) (*RPCChallengeReader, error) {
	control, err := NewControlReader(rpcURL, controlSystem)
	if err != nil {
		return nil, err
	}
	endpoint, err := url.Parse(strings.TrimSpace(toriiURL))
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
		return nil, fmt.Errorf("challenge discovery requires an absolute HTTP(S) Torii URL")
	}
	endpoint.Path = strings.TrimRight(endpoint.Path, "/")
	if !strings.HasSuffix(endpoint.Path, "/graphql") {
		endpoint.Path += "/graphql"
	}
	endpoint.RawQuery, endpoint.Fragment = "", ""
	return &RPCChallengeReader{
		RPCControlReader: control, toriiURL: endpoint.String(),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (r *RPCChallengeReader) ChainHead(ctx context.Context) (ChainHead, error) {
	header, err := r.rpc.latestBlockHeader(ctx)
	return ChainHead{BlockNumber: header.Number, Timestamp: header.Timestamp}, err
}

type contestedSectorPage struct {
	Edges []struct {
		Node *struct {
			ID          *uint32 `json:"id"`
			ChallengeID string  `json:"active_challenge_id"`
		} `json:"node"`
	} `json:"edges"`
	PageInfo *struct {
		HasNextPage *bool   `json:"hasNextPage"`
		EndCursor   *string `json:"endCursor"`
	} `json:"pageInfo"`
}

func (r *RPCChallengeReader) ContestedSectors(ctx context.Context) ([]ChallengeCandidate, error) {
	var after *string
	seenCursors := make(map[string]bool)
	sectors := make(map[uint32]uint64)
	// Bound a broken or unexpectedly large index without silently omitting pages.
	for page := 0; page < 100; page++ {
		connection, err := r.contestedPage(ctx, after)
		if err != nil {
			return nil, err
		}
		for _, edge := range connection.Edges {
			if edge.Node == nil || edge.Node.ID == nil {
				return nil, fmt.Errorf("Torii omitted contested sector ID")
			}
			id, err := parseUint(edge.Node.ChallengeID, 64)
			if err != nil || id == 0 {
				return nil, fmt.Errorf("invalid indexed challenge ID")
			}
			if previous, exists := sectors[*edge.Node.ID]; exists && previous != id {
				return nil, fmt.Errorf("Torii returned conflicting challenges for sector %d", *edge.Node.ID)
			}
			sectors[*edge.Node.ID] = id
		}
		if !*connection.PageInfo.HasNextPage {
			result := make([]ChallengeCandidate, 0, len(sectors))
			for sectorID, challengeID := range sectors {
				result = append(result, ChallengeCandidate{SectorID: sectorID, ChallengeID: challengeID})
			}
			sort.Slice(result, func(i, j int) bool { return result[i].SectorID < result[j].SectorID })
			return result, nil
		}
		after = connection.PageInfo.EndCursor
		if after == nil || *after == "" || seenCursors[*after] {
			return nil, fmt.Errorf("Torii contested sector pagination did not advance")
		}
		seenCursors[*after] = true
	}
	return nil, fmt.Errorf("Torii contested sector pagination exceeded 100 pages")
}

func (r *RPCChallengeReader) contestedPage(ctx context.Context, after *string) (*contestedSectorPage, error) {
	body, err := json.Marshal(map[string]any{
		"query": contestedSectorsQuery, "variables": map[string]any{"after": after},
	})
	if err != nil {
		return nil, fmt.Errorf("encode contested sector query: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, r.toriiURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create contested sector query: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := r.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("query contested sectors: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Torii returned HTTP %d", response.StatusCode)
	}
	var payload struct {
		Data struct {
			Models *contestedSectorPage `json:"stakewarsSectorModels"`
		} `json:"data"`
		Errors []struct{ Message string } `json:"errors"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode contested sectors: %w", err)
	}
	if len(payload.Errors) > 0 {
		return nil, fmt.Errorf("Torii rejected contested sector query: %s", payload.Errors[0].Message)
	}
	if payload.Data.Models == nil || payload.Data.Models.Edges == nil ||
		payload.Data.Models.PageInfo == nil || payload.Data.Models.PageInfo.HasNextPage == nil {
		return nil, fmt.Errorf("Torii omitted contested sector collection or pagination")
	}
	return payload.Data.Models, nil
}

type ChallengeSubmitter interface {
	SettleChallenge(context.Context, uint32) (string, error)
}

type AccountChallengeSubmitter struct {
	keeper        *AccountSupplyDropSubmitter
	controlSystem *felt.Felt
}

// NewChallengeSubmitter shares the existing keeper account, nonce lock, and
// pending receipt with SupplyDrop maintenance. It does not create another signer.
func NewChallengeSubmitter(keeper *AccountSupplyDropSubmitter, controlSystem string) (*AccountChallengeSubmitter, error) {
	address, err := normalizeAddress(controlSystem)
	if err != nil {
		return nil, fmt.Errorf("invalid challenge control system: %w", err)
	}
	if keeper == nil {
		return nil, fmt.Errorf("challenge settlement requires the keeper signer")
	}
	control, _ := new(felt.Felt).SetString(address)
	return &AccountChallengeSubmitter{keeper: keeper, controlSystem: control}, nil
}

func (s *AccountChallengeSubmitter) SettleChallenge(ctx context.Context, sectorID uint32) (string, error) {
	return s.keeper.invoke(ctx, s.controlSystem, "settle_challenge", uint64(sectorID))
}
