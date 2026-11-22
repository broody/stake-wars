package survivor

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"time"
)

const DailyPrize = "100000000000000000000" // 100 STRK in base units

// PayoutDelay is how long the keeper waits after a round's deadline before it
// pays the winner. A run that was verified just before the deadline can commit
// a moment after it, and a transfer cannot be taken back once it is sent.
const PayoutDelay = 2 * time.Minute

func prizeTarget(id int64) string { return "survivor-round:" + strconv.FormatInt(id, 10) }

type PrizeSender interface {
	PaySurvivor(context.Context, string, string, string) (string, error)
}

// PayoutDuty sends each closed round's prize to its winner. The winner does
// not need to claim it.
type PayoutDuty struct {
	Store  *Store
	Sender PrizeSender
}

// Reconcile pays the oldest closed round that has a winner and no payment yet.
// A payment that failed is retried after five minutes. A transfer whose outcome
// is still unknown stays with the signer's receipt reconciler, and the
// survivor_single_payment index refuses a second live or successful transfer
// for the same round.
func (d PayoutDuty) Reconcile(ctx context.Context) error {
	now := d.Store.Now()
	var round int64
	var wallet, amount string
	err := d.Store.DB.QueryRowContext(ctx, `SELECT r.id,r.leader_wallet,r.prize_amount FROM survivor_rounds r
        WHERE r.network=? AND r.deadline<=? AND r.leader_wallet IS NOT NULL AND r.prize_amount IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM transaction_attempts a WHERE a.network=r.network AND a.source='keeper' AND a.entrypoint='transfer' AND a.target_id='survivor-round:'||r.id
          AND (a.status IN ('preparing','broadcasting','submitted','unknown','succeeded') OR a.updated_at>?)
        ) ORDER BY r.id LIMIT 1`, d.Store.Network, now.Add(-PayoutDelay).Unix(), now.Add(-5*time.Minute).Unix()).Scan(&round, &wallet, &amount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = d.Sender.PaySurvivor(ctx, prizeTarget(round), wallet, amount)
	return err
}
