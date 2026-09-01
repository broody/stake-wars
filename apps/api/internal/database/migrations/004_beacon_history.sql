CREATE TABLE beacon_round_outcomes (
    network TEXT NOT NULL,
    round_id INTEGER NOT NULL,
    whisper_address TEXT NOT NULL,
    auction_id INTEGER NOT NULL,
    terminal_status TEXT NOT NULL,
    has_winner INTEGER,
    winner_group_handle TEXT,
    winner_commitment TEXT,
    winning_bid TEXT,
    second_highest_bid TEXT,
    clearing_price TEXT,
    funded_bid_count INTEGER,
    settlement_hash TEXT,
    settlement_transaction_hash TEXT,
    settled_at INTEGER,
    projected_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (network, round_id),
    UNIQUE (network, whisper_address, auction_id),
    FOREIGN KEY (network, round_id)
        REFERENCES beacon_rounds(network, round_id)
        ON DELETE CASCADE,
    CHECK (terminal_status IN ('settled', 'aborted')),
    CHECK (has_winner IS NULL OR has_winner IN (0, 1)),
    CHECK (funded_bid_count IS NULL OR funded_bid_count >= 0),
    CHECK (
        terminal_status != 'settled' OR
        (
            has_winner IS NOT NULL AND
            winner_group_handle IS NOT NULL AND
            winner_commitment IS NOT NULL AND
            winning_bid IS NOT NULL AND
            second_highest_bid IS NOT NULL AND
            clearing_price IS NOT NULL AND
            funded_bid_count IS NOT NULL AND
            settlement_hash IS NOT NULL AND
            settlement_transaction_hash IS NOT NULL AND
            settled_at IS NOT NULL
        )
    )
);

CREATE INDEX beacon_round_outcomes_history_idx
    ON beacon_round_outcomes (network, terminal_status, has_winner, round_id DESC);

CREATE TABLE beacon_cycle_jobs (
    network TEXT NOT NULL,
    predecessor_round_id INTEGER NOT NULL,
    predecessor_whisper_address TEXT NOT NULL,
    predecessor_auction_id INTEGER NOT NULL,
    successor_round_id INTEGER NOT NULL,
    expected_metadata_hash TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    transaction_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (network, predecessor_round_id),
    UNIQUE (
        network,
        predecessor_whisper_address,
        predecessor_auction_id
    ),
    FOREIGN KEY (network, predecessor_round_id)
        REFERENCES beacon_rounds(network, round_id)
        ON DELETE CASCADE,
    CHECK (successor_round_id > predecessor_round_id),
    CHECK (state IN ('pending', 'submitted', 'confirmed', 'registered', 'failed')),
    CHECK (attempts >= 0)
);

CREATE INDEX beacon_cycle_jobs_incomplete_idx
    ON beacon_cycle_jobs (network, state, predecessor_round_id);
