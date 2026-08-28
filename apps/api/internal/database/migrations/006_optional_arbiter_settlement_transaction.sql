ALTER TABLE arbiter_round_outcomes RENAME TO arbiter_round_outcomes_legacy;

CREATE TABLE arbiter_round_outcomes (
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
        REFERENCES arbiter_rounds(network, round_id)
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
            settled_at IS NOT NULL
        )
    )
);

INSERT INTO arbiter_round_outcomes(
    network, round_id, whisper_address, auction_id, terminal_status,
    has_winner, winner_group_handle, winner_commitment, winning_bid,
    second_highest_bid, clearing_price, funded_bid_count, settlement_hash,
    settlement_transaction_hash, settled_at, projected_at
)
SELECT
    network, round_id, whisper_address, auction_id, terminal_status,
    has_winner, winner_group_handle, winner_commitment, winning_bid,
    second_highest_bid, clearing_price, funded_bid_count, settlement_hash,
    settlement_transaction_hash, settled_at, projected_at
FROM arbiter_round_outcomes_legacy;

DROP TABLE arbiter_round_outcomes_legacy;

CREATE INDEX arbiter_round_outcomes_history_idx
    ON arbiter_round_outcomes (network, terminal_status, has_winner, round_id DESC);
