-- Anonymous starts are signed with a durable local key. Only submitted tickets occupy disk.
CREATE TABLE survivor_ticket_key (id INTEGER PRIMARY KEY CHECK(id=1), key BLOB NOT NULL);
INSERT INTO survivor_ticket_key VALUES (1, randomblob(32));

-- Preserve wallet-bound tickets issued by the previous API during a rolling release.
CREATE TABLE survivor_receipts (
    ticket_hash BLOB PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES survivor_rounds(id),
    wallet TEXT NOT NULL,
    destroyed INTEGER,
    seed INTEGER,
    started_ms INTEGER
);
INSERT INTO survivor_receipts SELECT ticket_hash,round_id,wallet,run_destroyed,seed,started_ms FROM survivor_players;

CREATE TABLE survivor_scores (
    round_id INTEGER NOT NULL REFERENCES survivor_rounds(id),
    wallet TEXT NOT NULL,
    best_destroyed INTEGER NOT NULL,
    best_duration_seconds INTEGER,
    best_upgrades TEXT CHECK(best_upgrades IS NULL OR json_type(best_upgrades)='array'),
    achieved_order INTEGER NOT NULL,
    outis INTEGER NOT NULL DEFAULT 0 CHECK(outis IN (0,1)),
    PRIMARY KEY(round_id,wallet)
);
INSERT INTO survivor_scores (round_id,wallet,best_destroyed,best_duration_seconds,best_upgrades,achieved_order)
SELECT round_id,wallet,best_destroyed,best_duration_seconds,best_upgrades,achieved_order
FROM survivor_players WHERE best_destroyed IS NOT NULL;
DROP TABLE survivor_players;
CREATE INDEX survivor_score_order ON survivor_scores(round_id,best_destroyed DESC,achieved_order,wallet);

-- Pre-existing rounds retain their historical leader and payout terms.
ALTER TABLE survivor_rounds ADD COLUMN prize_amount TEXT
    CHECK(prize_amount IS NULL OR prize_amount='500000000000000000000');
ALTER TABLE survivor_rounds ADD COLUMN leader_duration_seconds INTEGER;
ALTER TABLE survivor_rounds ADD COLUMN leader_upgrades TEXT;
UPDATE survivor_rounds SET (leader_duration_seconds,leader_upgrades)=(
    SELECT best_duration_seconds,best_upgrades FROM survivor_scores WHERE round_id=survivor_rounds.id AND wallet=leader_wallet
) WHERE leader_wallet IS NOT NULL;
ALTER TABLE survivor_rounds ADD COLUMN claimed_at INTEGER;

-- Any unconfirmed broadcast or successful payment excludes another payment for that round,
-- including after a crash between sending the transfer and observing its receipt.
CREATE UNIQUE INDEX survivor_single_payment ON transaction_attempts(network,target_id)
WHERE source='keeper' AND entrypoint='transfer' AND target_id GLOB 'survivor-round:*'
AND status IN ('preparing','broadcasting','submitted','unknown','succeeded');
