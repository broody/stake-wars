package survivor

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// NextDailyDeadline returns the next 22:00 EST (03:00 UTC year-round).
func NextDailyDeadline(now time.Time) time.Time {
	year, month, day := now.UTC().Date()
	cutoff := time.Date(year, month, day, 3, 0, 0, 0, time.UTC)
	if !now.Before(cutoff) {
		return cutoff.AddDate(0, 0, 1)
	}
	return cutoff
}

// Reconcile opens the next daily prize round when the latest one's deadline
// passes. It does this whether or not the closed round had a winner.
func (s *Store) Reconcile(ctx context.Context) error {
	return s.rollOver(ctx, s.Now())
}

func (s *Store) rollOver(ctx context.Context, now time.Time) error {
	// Keep the usual open-round poll read-only. The indexed deadline also
	// identifies the predecessor when this process races another round opener.
	var previous int64
	err := s.DB.QueryRowContext(ctx, `SELECT deadline FROM (
        SELECT deadline,prize_amount FROM survivor_rounds
        WHERE network=? ORDER BY deadline DESC LIMIT 1
    ) WHERE deadline<=? AND prize_amount=?`, s.Network, now.Unix(), DailyPrize).Scan(&previous)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	next := NextDailyDeadline(now)
	if next.Sub(time.Unix(previous, 0)) < 24*time.Hour {
		// An operator may have used an off-schedule deadline for the first round.
		next = next.AddDate(0, 0, 1)
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO survivor_rounds(network,deadline,prize_amount)
        SELECT network,?,prize_amount FROM survivor_rounds AS previous
        WHERE network=? AND deadline=? AND prize_amount=?
          AND NOT EXISTS (SELECT 1 FROM survivor_rounds WHERE network=previous.network AND deadline>previous.deadline)`,
		next.Unix(), s.Network, previous, DailyPrize)
	return err
}
