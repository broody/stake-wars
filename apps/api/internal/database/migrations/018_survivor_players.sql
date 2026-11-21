CREATE TABLE survivor_profiles (
    network TEXT NOT NULL,
    player TEXT NOT NULL,
    name TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(network, player)
);

-- A null round marks a verified run that only counts towards all-time standings.
CREATE TABLE survivor_runs (
    id INTEGER PRIMARY KEY,
    ticket_hash BLOB UNIQUE,
    network TEXT NOT NULL,
    round_id INTEGER REFERENCES survivor_rounds(id),
    player TEXT NOT NULL,
    destroyed INTEGER,
    duration_seconds INTEGER,
    upgrades TEXT CHECK(upgrades IS NULL OR json_type(upgrades)='array'),
    outis INTEGER NOT NULL DEFAULT 0 CHECK(outis IN (0,1)),
    seed INTEGER,
    started_ms INTEGER
);

-- Import bests first in original tie order, including older bests whose ticket was replaced.
CREATE INDEX survivor_receipt_import ON survivor_receipts(round_id,wallet,destroyed);
INSERT INTO survivor_runs(ticket_hash,network,round_id,player,destroyed,duration_seconds,upgrades,outis)
SELECT (SELECT ticket_hash FROM survivor_receipts t WHERE t.round_id=s.round_id
        AND t.wallet=s.wallet AND t.destroyed=s.best_destroyed ORDER BY t.rowid LIMIT 1),
       r.network,s.round_id,s.wallet,s.best_destroyed,s.best_duration_seconds,s.best_upgrades,s.outis
FROM survivor_scores s JOIN survivor_rounds r ON r.id=s.round_id
ORDER BY s.round_id,s.achieved_order,s.wallet;
INSERT INTO survivor_runs(ticket_hash,network,round_id,player,destroyed,seed,started_ms)
SELECT t.ticket_hash,r.network,t.round_id,t.wallet,t.destroyed,t.seed,t.started_ms
FROM survivor_receipts t JOIN survivor_rounds r ON r.id=t.round_id
WHERE NOT EXISTS (SELECT 1 FROM survivor_runs n WHERE n.ticket_hash=t.ticket_hash)
ORDER BY t.rowid;
DROP TABLE survivor_receipts;
DROP TABLE survivor_scores;
CREATE INDEX survivor_round_ranking ON survivor_runs(network,round_id,player,destroyed DESC,id) WHERE destroyed IS NOT NULL;
CREATE INDEX survivor_all_ranking ON survivor_runs(network,player,destroyed DESC,id) WHERE destroyed IS NOT NULL;
