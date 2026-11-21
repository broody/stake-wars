ALTER TABLE auth_challenges ADD COLUMN scope TEXT NOT NULL DEFAULT 'artwork'
    CHECK (scope IN ('artwork', 'survivor'));
ALTER TABLE auth_sessions ADD COLUMN scope TEXT NOT NULL DEFAULT 'artwork'
    CHECK (scope IN ('artwork', 'survivor'));

CREATE TABLE survivor_rounds (
    id INTEGER PRIMARY KEY,
    network TEXT NOT NULL,
    deadline INTEGER NOT NULL,
    submissions INTEGER NOT NULL DEFAULT 0,
    leader_wallet TEXT,
    leading_destroyed INTEGER,
    UNIQUE (network, deadline)
);

-- One best score and one current ticket per wallet per round.
CREATE TABLE survivor_players (
    round_id INTEGER NOT NULL REFERENCES survivor_rounds(id),
    wallet TEXT NOT NULL,
    ticket_hash BLOB NOT NULL UNIQUE,
    seed INTEGER NOT NULL,
    started_ms INTEGER NOT NULL,
    run_destroyed INTEGER,
    best_destroyed INTEGER,
    achieved_order INTEGER,
    PRIMARY KEY (round_id, wallet)
);

CREATE INDEX survivor_ranking ON survivor_players
    (round_id, best_destroyed DESC, achieved_order, wallet)
    WHERE best_destroyed IS NOT NULL;
