CREATE TABLE transaction_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    network TEXT NOT NULL,
    source TEXT NOT NULL,
    account_address TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    entrypoint TEXT NOT NULL,
    target_id TEXT NOT NULL,
    correlation_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    transaction_hash TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX transaction_attempts_lookup ON transaction_attempts(network, source, account_address, status);
CREATE INDEX transaction_attempts_hash ON transaction_attempts(transaction_hash);

CREATE TABLE transaction_attempt_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES transaction_attempts(id),
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    transaction_hash TEXT NOT NULL DEFAULT '',
    block_number INTEGER,
    rpc_code INTEGER,
    error_message TEXT NOT NULL DEFAULT '',
    error_data TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX transaction_attempt_events_attempt ON transaction_attempt_events(attempt_id, id);
