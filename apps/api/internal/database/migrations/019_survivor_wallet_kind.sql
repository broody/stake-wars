-- Any signed wallet can now win the daily prize. Each run records which wallet
-- submitted it so the leaderboard can show that wallet's icon. The API sets
-- 'outis' only after checking the account class onchain. The other values come
-- from the submitting client.
ALTER TABLE survivor_runs ADD COLUMN wallet_kind TEXT
    CHECK (wallet_kind IS NULL OR wallet_kind IN ('outis', 'argentX', 'braavos', 'xverse'));
UPDATE survivor_runs SET wallet_kind = 'outis' WHERE outis = 1;

ALTER TABLE survivor_rounds ADD COLUMN leader_wallet_kind TEXT;
-- Until now only Outis wallets could lead a prize round.
UPDATE survivor_rounds SET leader_wallet_kind = 'outis'
WHERE leader_wallet IS NOT NULL AND prize_amount IS NOT NULL;

-- Rank every signed wallet in prize rounds that are still open. Ties go to the
-- earlier run, the same order the leaderboard uses. Closed rounds keep their
-- winner.
UPDATE survivor_rounds AS r SET
    (leader_wallet, leading_destroyed, leader_duration_seconds, leader_upgrades, leader_wallet_kind) = (
        SELECT t.player, t.destroyed, t.duration_seconds, t.upgrades, t.wallet_kind
        FROM survivor_runs t
        WHERE t.round_id = r.id AND t.destroyed IS NOT NULL AND t.player NOT LIKE 'guest-%'
        ORDER BY t.destroyed DESC, t.id LIMIT 1
    )
WHERE r.prize_amount IS NOT NULL AND r.deadline > unixepoch() AND EXISTS (
    SELECT 1 FROM survivor_runs t
    WHERE t.round_id = r.id AND t.destroyed IS NOT NULL AND t.player NOT LIKE 'guest-%'
);
