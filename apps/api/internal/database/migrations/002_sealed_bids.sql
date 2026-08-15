CREATE TABLE sealed_bid_envelopes (
    commitment TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    control_point_id INTEGER NOT NULL,
    operator_address TEXT NOT NULL,
    key_id TEXT NOT NULL,
    ciphertext BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    CHECK (control_point_id >= 0),
    CHECK (length(ciphertext) > 0)
);

CREATE INDEX sealed_bid_envelopes_lookup_idx
    ON sealed_bid_envelopes (network, control_point_id, operator_address);
