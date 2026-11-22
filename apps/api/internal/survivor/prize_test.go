package survivor

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"stakewars.com/api/internal/database"
)

type recordedPayment struct{ target, wallet, amount string }

type recordingSender struct{ paid []recordedPayment }

func (r *recordingSender) PaySurvivor(_ context.Context, target, wallet, amount string) (string, error) {
	r.paid = append(r.paid, recordedPayment{target, wallet, amount})
	return "0x1", nil
}

func TestPayoutDutyPaysClosedRoundsWithoutAClaim(t *testing.T) {
	ctx := t.Context()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "payout.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	now := time.Date(2026, 11, 22, 3, 30, 0, 0, time.UTC)
	store := NewStore(db, "SN_SEPOLIA")
	store.Now = func() time.Time { return now }
	// Deadlines are unique per network, so each closed round ends a second apart.
	closed := func(id int64) int64 { return now.Add(-time.Hour).Unix() - id }
	rows := []struct {
		id       int64
		network  string
		deadline int64
		wallet   any
		prize    any
	}{
		{1, "SN_SEPOLIA", closed(1), "0xpaid", DailyPrize},
		{2, "SN_SEPOLIA", closed(2), "0xfailed-recently", DailyPrize},
		{3, "SN_SEPOLIA", closed(3), nil, DailyPrize},
		{4, "SN_SEPOLIA", closed(4), "0xunprized", nil},
		{5, "SN_MAIN", closed(5), "0xother-network", DailyPrize},
		{6, "SN_SEPOLIA", now.Add(-PayoutDelay + time.Second).Unix(), "0xtoo-soon", DailyPrize},
		{7, "SN_SEPOLIA", now.Add(time.Hour).Unix(), "0xopen", DailyPrize},
		{8, "SN_SEPOLIA", closed(8), "0xwinner", DailyPrize},
	}
	for _, r := range rows {
		if _, err = db.Exec(`INSERT INTO survivor_rounds (id,network,deadline,leader_wallet,leading_destroyed,prize_amount) VALUES (?,?,?,?,1,?)`,
			r.id, r.network, r.deadline, r.wallet, r.prize); err != nil {
			t.Fatal(err)
		}
	}
	attempt := func(round, status string, updated int64) {
		t.Helper()
		if _, err := db.Exec(`INSERT INTO transaction_attempts (network,source,account_address,contract_address,entrypoint,target_id,status,updated_at)
            VALUES ('SN_SEPOLIA','keeper','0xkeeper','0xstrk','transfer',?,?,?)`, "survivor-round:"+round, status, updated); err != nil {
			t.Fatal(err)
		}
	}
	attempt("1", "succeeded", closed(1))
	attempt("2", "failed", now.Add(-time.Minute).Unix())

	sender := &recordingSender{}
	duty := PayoutDuty{Store: store, Sender: sender}
	if err = duty.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	want := recordedPayment{"survivor-round:8", "0xwinner", DailyPrize}
	if len(sender.paid) != 1 || sender.paid[0] != want {
		t.Fatalf("paid %v, want only %v", sender.paid, want)
	}

	// Once the transfer is in flight, nothing else is due until the failed
	// payment's backoff ends.
	attempt("8", "submitted", now.Unix())
	if err = duty.Reconcile(ctx); err != nil || len(sender.paid) != 1 {
		t.Fatal(sender.paid, err)
	}
	now = now.Add(5 * time.Minute)
	if err = duty.Reconcile(ctx); err != nil {
		t.Fatal(err)
	}
	retry := recordedPayment{"survivor-round:2", "0xfailed-recently", DailyPrize}
	if len(sender.paid) != 2 || sender.paid[1] != retry {
		t.Fatalf("paid %v, want a retry of %v", sender.paid, retry)
	}
}
