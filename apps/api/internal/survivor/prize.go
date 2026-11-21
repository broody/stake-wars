package survivor

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"time"
)

const DailyPrize = "100000000000000000000" // 100 STRK in base units

func prizeTarget(id int64) string { return "survivor-round:" + strconv.FormatInt(id, 10) }

type Prize struct {
	Round          int64
	Wallet, Amount string
}

func (s *Store) Prize(ctx context.Context, id int64) (p Prize, err error) {
	err = s.DB.QueryRowContext(ctx, `SELECT id,leader_wallet,prize_amount FROM survivor_rounds
    WHERE network=? AND id=? AND deadline<=? AND prize_amount IS NOT NULL AND leader_wallet IS NOT NULL`, s.Network, id, s.Now().Unix()).Scan(&p.Round, &p.Wallet, &p.Amount)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrClaim
	}
	return p, err
}

// Authorize a payout to the frozen winner. Repeat signatures refer to the same payout.
func (s *Store) Claim(ctx context.Context, p Prize) error {
	result, err := s.DB.ExecContext(ctx, `UPDATE survivor_rounds SET claimed_at=coalesce(claimed_at,?) WHERE network=? AND id=? AND leader_wallet=? AND prize_amount=? AND deadline<=?`, s.Now().Unix(), s.Network, p.Round, p.Wallet, p.Amount, s.Now().Unix())
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n != 1 {
		return ErrClaim
	}
	return err
}

type PrizeSender interface {
	PaySurvivor(context.Context, string, string, string) (string, error)
}

type PayoutDuty struct {
	Store  *Store
	Sender PrizeSender
}

func (d PayoutDuty) Reconcile(ctx context.Context) error {
	var p Prize
	// Terminal failures may be retried after a backoff. Ambiguous broadcasts
	// stay with the signer's receipt reconciler until the outcome is known.
	err := d.Store.DB.QueryRowContext(ctx, `SELECT r.id,r.leader_wallet,r.prize_amount FROM survivor_rounds r
        WHERE network=? AND claimed_at IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM transaction_attempts a WHERE a.network=r.network AND a.source='keeper' AND a.entrypoint='transfer' AND a.target_id='survivor-round:'||r.id
          AND (a.status IN ('preparing','broadcasting','submitted','unknown','succeeded') OR a.updated_at>?)
        ) ORDER BY r.id LIMIT 1`, d.Store.Network, d.Store.Now().Add(-5*time.Minute).Unix()).Scan(&p.Round, &p.Wallet, &p.Amount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = d.Sender.PaySurvivor(ctx, prizeTarget(p.Round), p.Wallet, p.Amount)
	return err
}
