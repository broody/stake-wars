package challenge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"

	"stakewars.com/api/internal/starknet"
)

const maxSettlementsPerPass = 5

// Duty settles expired contests permissionlessly; the contract selects winners.
// It is called serially by the API's maintenance worker.
type Duty struct {
	reader     starknet.ChallengeReader
	submitter  starknet.ChallengeSubmitter
	nextSector uint64
}

func NewDuty(reader starknet.ChallengeReader, submitter starknet.ChallengeSubmitter) *Duty {
	return &Duty{reader: reader, submitter: submitter}
}

func (d *Duty) Reconcile(ctx context.Context) error {
	candidates, err := d.reader.ContestedSectors(ctx)
	if err != nil {
		return fmt.Errorf("discover contested sectors: %w", err)
	}
	if len(candidates) == 0 {
		return nil
	}
	head, err := d.reader.ChainHead(ctx)
	if err != nil {
		return fmt.Errorf("read Starknet head for challenges: %w", err)
	}
	// Rotate across passes so a backlog or a failing Sector cannot starve others.
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].SectorID < candidates[j].SectorID })
	start := sort.Search(len(candidates), func(i int) bool { return uint64(candidates[i].SectorID) >= d.nextSector })
	var result error
	attempts := 0
	for offset := 0; offset < len(candidates) && attempts < maxSettlementsPerPass; offset++ {
		if err := ctx.Err(); err != nil {
			return errors.Join(result, err)
		}
		candidate := candidates[(start+offset)%len(candidates)]
		d.nextSector = uint64(candidate.SectorID) + 1
		sector, err := d.reader.SectorStatus(ctx, candidate.SectorID)
		if err != nil {
			result = errors.Join(result, fmt.Errorf("read challenged sector %d: %w", candidate.SectorID, err))
			continue
		}
		if sector.ID != candidate.SectorID {
			result = errors.Join(result, fmt.Errorf("Control returned the wrong sector for %d", candidate.SectorID))
			continue
		}
		if !ready(sector, candidate, head.Timestamp) {
			continue
		}
		attempts++
		hash, err := d.submitter.SettleChallenge(ctx, candidate.SectorID)
		if errors.Is(err, starknet.ErrKeeperRecheckRequired) {
			return result
		}
		if errors.Is(err, starknet.ErrKeeperTransactionPending) {
			return errors.Join(result, err)
		}
		if err != nil {
			// A manual settlement or last-moment escalation can win the race
			// after our read. Treat that as idle once canonical state proves it.
			fresh, readErr := d.reader.SectorStatus(ctx, candidate.SectorID)
			if readErr == nil && fresh.ID == candidate.SectorID && !ready(fresh, candidate, head.Timestamp) {
				continue
			}
			result = errors.Join(result, fmt.Errorf("settle sector %d challenge %d (transaction %s): %w",
				candidate.SectorID, candidate.ChallengeID, hash, err))
			if hash != "" {
				// The shared signer must resolve this receipt before another send.
				return result
			}
			continue
		}
		slog.InfoContext(ctx, "Challenge settled", "sector_id", candidate.SectorID,
			"challenge_id", candidate.ChallengeID, "transaction_hash", hash)
	}
	return result
}

func ready(sector starknet.SectorStatus, candidate starknet.ChallengeCandidate, timestamp uint64) bool {
	return candidate.ChallengeID != 0 && sector.ActiveChallengeID == candidate.ChallengeID &&
		sector.ChallengeDeadline > 0 && sector.ChallengeDeadline <= timestamp
}
