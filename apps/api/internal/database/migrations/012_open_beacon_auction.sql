-- The Beacon moved from Whisper sealed bids to the open ascending auction in
-- the Stake Wars World. Preserve every resolved Whisper-era winner as history
-- and controller continuity, keep their transmissions, and drop the
-- operator-coupled round, outcome, and successor-job tables.
CREATE TABLE beacon_controllers (
    network TEXT NOT NULL,
    round_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    controller TEXT NOT NULL,
    winning_bid TEXT NOT NULL,
    bid_count INTEGER NOT NULL,
    settled_at INTEGER NOT NULL,
    active_artwork_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (network, round_id),
    CHECK (round_id > 0),
    CHECK (source IN ('whisper', 'open')),
    CHECK (bid_count >= 0)
);

INSERT INTO beacon_controllers(
    network, round_id, source, controller, winning_bid, bid_count, settled_at,
    active_artwork_id
)
SELECT
    r.network, r.round_id, 'whisper', r.claimed_controller, o.winning_bid,
    o.funded_bid_count, COALESCE(o.settled_at, r.claimed_at), r.active_artwork_id
FROM beacon_rounds r
JOIN beacon_round_outcomes o
    ON o.network = r.network AND o.round_id = r.round_id
WHERE o.terminal_status = 'settled' AND o.has_winner = 1
    AND r.claimed_controller IS NOT NULL;

CREATE TABLE beacon_image_uploads_next (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    controller_round_id INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 280),
    destination_url TEXT NOT NULL DEFAULT '' CHECK (length(destination_url) <= 2048),
    content_type TEXT NOT NULL,
    detail_object_key TEXT NOT NULL UNIQUE,
    detail_size INTEGER NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    thumbnail_size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER,
    FOREIGN KEY (network, controller_round_id)
        REFERENCES beacon_controllers(network, round_id),
    CHECK (controller_round_id > 0),
    CHECK (detail_size > 0),
    CHECK (thumbnail_size > 0),
    CHECK (expires_at > created_at)
);

INSERT INTO beacon_image_uploads_next(
    id, network, controller_round_id, owner_address, description,
    destination_url, content_type, detail_object_key, detail_size,
    thumbnail_object_key, thumbnail_size, created_at, expires_at, completed_at
)
SELECT
    u.id, u.network, u.controller_round_id, u.owner_address, u.description,
    u.destination_url, u.content_type, u.detail_object_key, u.detail_size,
    u.thumbnail_object_key, u.thumbnail_size, u.created_at, u.expires_at,
    u.completed_at
FROM beacon_image_uploads u
WHERE EXISTS (
    SELECT 1 FROM beacon_controllers c
    WHERE c.network = u.network AND c.round_id = u.controller_round_id
);

CREATE TABLE beacon_artworks_next (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    controller_round_id INTEGER NOT NULL,
    owner_address TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 280),
    destination_url TEXT NOT NULL DEFAULT '' CHECK (length(destination_url) <= 2048),
    image_url TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    thumbnail_url TEXT NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    content_hash TEXT NOT NULL,
    moderation_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (network, controller_round_id)
        REFERENCES beacon_controllers(network, round_id),
    CHECK (controller_round_id > 0),
    CHECK (moderation_status IN ('approved', 'removed', 'superseded'))
);

INSERT INTO beacon_artworks_next(
    id, network, controller_round_id, owner_address, description,
    destination_url, image_url, object_key, thumbnail_url, thumbnail_object_key,
    content_hash, moderation_status, created_at, updated_at
)
SELECT
    a.id, a.network, a.controller_round_id, a.owner_address, a.description,
    a.destination_url, a.image_url, a.object_key, a.thumbnail_url,
    a.thumbnail_object_key, a.content_hash, a.moderation_status, a.created_at,
    a.updated_at
FROM beacon_artworks a
WHERE EXISTS (
    SELECT 1 FROM beacon_controllers c
    WHERE c.network = a.network AND c.round_id = a.controller_round_id
);

DROP TABLE beacon_image_uploads;
DROP TABLE beacon_artworks;
ALTER TABLE beacon_image_uploads_next RENAME TO beacon_image_uploads;
ALTER TABLE beacon_artworks_next RENAME TO beacon_artworks;

CREATE INDEX beacon_image_uploads_owner_expires_idx
    ON beacon_image_uploads (owner_address, expires_at);
CREATE INDEX beacon_artworks_controller_idx
    ON beacon_artworks (network, controller_round_id, updated_at DESC);

DROP TABLE beacon_cycle_jobs;
DROP TABLE beacon_round_outcomes;
DROP TABLE beacon_rounds;
