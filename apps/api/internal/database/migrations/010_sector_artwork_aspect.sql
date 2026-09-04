ALTER TABLE image_uploads
    ADD COLUMN image_aspect REAL NOT NULL DEFAULT 1
    CHECK (image_aspect > 0 AND image_aspect <= 512);

ALTER TABLE sector_artworks
    ADD COLUMN image_aspect REAL NOT NULL DEFAULT 1
    CHECK (image_aspect > 0 AND image_aspect <= 512);
