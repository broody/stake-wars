CREATE TABLE arbiter_rounds (
    network TEXT NOT NULL,
    round_id INTEGER NOT NULL,
    whisper_address TEXT NOT NULL,
    auction_id INTEGER NOT NULL,
    expected_creator TEXT NOT NULL,
    payment_token TEXT NOT NULL,
    metadata_hash TEXT NOT NULL,
    winner_payload_domain TEXT NOT NULL,
    vault_address TEXT NOT NULL,
    billboard_starts_at INTEGER,
    billboard_expires_at INTEGER,
    claimed_controller TEXT,
    claimed_at INTEGER,
    active_artwork_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (network, round_id),
    UNIQUE (network, whisper_address, auction_id),
    CHECK (round_id > 0),
    CHECK (auction_id > 0),
    CHECK (
        billboard_starts_at IS NULL OR
        billboard_expires_at IS NULL OR
        billboard_expires_at > billboard_starts_at
    ),
    CHECK (
        (claimed_controller IS NULL AND claimed_at IS NULL) OR
        (claimed_controller IS NOT NULL AND claimed_at IS NOT NULL)
    )
);

CREATE INDEX arbiter_rounds_current_idx
    ON arbiter_rounds (network, round_id DESC);
