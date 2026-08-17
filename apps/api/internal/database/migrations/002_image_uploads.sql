CREATE TABLE image_uploads (
    id TEXT PRIMARY KEY,
    network TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    content_type TEXT NOT NULL,
    detail_object_key TEXT NOT NULL UNIQUE,
    detail_size INTEGER NOT NULL,
    thumbnail_object_key TEXT NOT NULL UNIQUE,
    thumbnail_size INTEGER NOT NULL,
    projector_matrix TEXT NOT NULL,
    placement_center_x REAL NOT NULL,
    placement_center_y REAL NOT NULL,
    placement_scale REAL NOT NULL,
    placement_rotation REAL NOT NULL,
    viewport_aspect REAL NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    completed_at INTEGER,
    CHECK (detail_size > 0),
    CHECK (thumbnail_size > 0),
    CHECK (placement_scale > 0),
    CHECK (viewport_aspect > 0),
    CHECK (expires_at > created_at)
);

CREATE TABLE image_upload_targets (
    upload_id TEXT NOT NULL REFERENCES image_uploads(id) ON DELETE CASCADE,
    control_point_id INTEGER NOT NULL,
    ownership_generation INTEGER NOT NULL,
    PRIMARY KEY (upload_id, control_point_id),
    CHECK (control_point_id >= 0),
    CHECK (ownership_generation > 0)
);

CREATE INDEX image_uploads_owner_expires_idx
    ON image_uploads (owner_address, expires_at);
