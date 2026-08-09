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

CREATE TABLE control_point_images (
    id TEXT PRIMARY KEY,
    control_point_id INTEGER NOT NULL,
    network TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    ownership_generation INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    moderation_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    CHECK (control_point_id >= 0),
    CHECK (ownership_generation >= 0),
    CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'removed', 'superseded'))
);

CREATE INDEX control_point_images_lookup_idx
    ON control_point_images (network, control_point_id, ownership_generation, moderation_status);

CREATE TABLE image_reports (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL REFERENCES control_point_images(id) ON DELETE CASCADE,
    reporter_address TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    CHECK (status IN ('open', 'dismissed', 'actioned'))
);

CREATE INDEX image_reports_image_status_idx ON image_reports (image_id, status);
