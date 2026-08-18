CREATE TABLE auth_challenges (
    id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    nonce TEXT NOT NULL UNIQUE,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    CHECK (expires_at > issued_at)
);

CREATE INDEX auth_challenges_wallet_expires_idx
    ON auth_challenges (wallet_address, expires_at);

CREATE TABLE auth_sessions (
    token_hash BLOB PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_wallet_expires_idx
    ON auth_sessions (wallet_address, expires_at);

CREATE TABLE sector_artworks (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    image_url TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    thumbnail_url TEXT NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    projector_matrix TEXT NOT NULL,
    placement_center_x REAL NOT NULL,
    placement_center_y REAL NOT NULL,
    placement_scale REAL NOT NULL,
    placement_rotation REAL NOT NULL,
    viewport_aspect REAL NOT NULL,
    moderation_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (placement_scale > 0),
    CHECK (viewport_aspect > 0),
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'removed', 'superseded'))
);

CREATE TABLE sector_artwork_targets (
    artwork_id TEXT NOT NULL REFERENCES sector_artworks(id) ON DELETE CASCADE,
    sector_id INTEGER NOT NULL,
    ownership_generation INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (artwork_id, sector_id),
    CHECK (sector_id >= 0),
    CHECK (ownership_generation >= 0),
    CHECK (active IN (0, 1))
);

CREATE INDEX sector_artwork_targets_lookup_idx
    ON sector_artwork_targets (sector_id, ownership_generation, active);

CREATE TABLE image_reports (
    id TEXT PRIMARY KEY,
    artwork_id TEXT NOT NULL REFERENCES sector_artworks(id) ON DELETE CASCADE,
    reporter_address TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    CHECK (status IN ('open', 'dismissed', 'actioned'))
);

CREATE INDEX image_reports_artwork_status_idx ON image_reports (artwork_id, status);
