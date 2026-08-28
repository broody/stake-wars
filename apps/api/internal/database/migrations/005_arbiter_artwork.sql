CREATE TABLE arbiter_image_uploads (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    controller_round_id INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    content_type TEXT NOT NULL,
    detail_object_key TEXT NOT NULL UNIQUE,
    detail_size INTEGER NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    thumbnail_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (network, controller_round_id)
        REFERENCES arbiter_rounds(network, round_id),
    CHECK (controller_round_id > 0),
    CHECK (detail_size > 0),
    CHECK (thumbnail_size > 0),
    CHECK (expires_at > created_at)
);

CREATE INDEX arbiter_image_uploads_owner_expires_idx
    ON arbiter_image_uploads (owner_address, expires_at);

CREATE TABLE arbiter_artworks (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    controller_round_id INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    image_url TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    thumbnail_url TEXT NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    moderation_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (network, controller_round_id)
        REFERENCES arbiter_rounds(network, round_id),
    CHECK (controller_round_id > 0),
    CHECK (moderation_status IN ('approved', 'removed', 'superseded'))
);

CREATE INDEX arbiter_artworks_controller_idx
    ON arbiter_artworks (network, controller_round_id, updated_at DESC);
