-- Rebuildable index of the official Starknet staking contracts. Every row is
-- derived from public chain data and can be dropped and re-indexed.
CREATE TABLE staking_index_cursors (
    network TEXT NOT NULL,
    stream TEXT NOT NULL,
    next_block INTEGER NOT NULL,
    window_end INTEGER,
    continuation_token TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (network, stream)
);

CREATE TABLE staking_stakers (
    network TEXT NOT NULL,
    staker_address TEXT NOT NULL,
    registered_block INTEGER NOT NULL,
    exit_intent_block INTEGER,
    exit_timestamp INTEGER,
    deleted_block INTEGER,
    PRIMARY KEY (network, staker_address)
);

CREATE TABLE staking_pools (
    network TEXT NOT NULL,
    pool_address TEXT NOT NULL,
    staker_address TEXT NOT NULL,
    token_address TEXT NOT NULL,
    created_block INTEGER NOT NULL,
    PRIMARY KEY (network, pool_address)
);

-- Append-only log of delegation-pool exit intents. amount is the pending
-- amount for (pool_address, identifier) after the event; resets_clock marks a
-- new intent, which restarts the exit window.
CREATE TABLE staking_exit_intents (
    network TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    transaction_index INTEGER NOT NULL,
    event_index INTEGER NOT NULL,
    pool_address TEXT NOT NULL,
    identifier TEXT NOT NULL,
    token_address TEXT NOT NULL,
    staker_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    resets_clock INTEGER NOT NULL,
    PRIMARY KEY (network, block_number, transaction_index, event_index)
);

CREATE TABLE staking_pool_members (
    network TEXT NOT NULL,
    pool_address TEXT NOT NULL,
    member_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    updated_block INTEGER NOT NULL,
    PRIMARY KEY (network, pool_address, member_address)
);
CREATE INDEX staking_pool_members_active
    ON staking_pool_members(network, pool_address) WHERE amount <> '0';

CREATE TABLE staking_block_times (
    network TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    PRIMARY KEY (network, block_number)
);

-- Daily network totals. BTC amounts are normalized to 18 decimals.
CREATE TABLE staking_samples (
    network TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    strk_staked TEXT NOT NULL,
    btc_staked TEXT NOT NULL,
    strk_pending TEXT NOT NULL,
    btc_pending TEXT NOT NULL,
    featured_strk TEXT,
    featured_btc TEXT,
    PRIMARY KEY (network, block_number)
);
CREATE INDEX staking_samples_time ON staking_samples(network, timestamp);
