ALTER TABLE beacon_image_uploads
    ADD COLUMN description TEXT NOT NULL DEFAULT ''
    CHECK (length(description) <= 280);

ALTER TABLE beacon_image_uploads
    ADD COLUMN destination_url TEXT NOT NULL DEFAULT ''
    CHECK (length(destination_url) <= 2048);

ALTER TABLE beacon_artworks
    ADD COLUMN description TEXT NOT NULL DEFAULT ''
    CHECK (length(description) <= 280);

ALTER TABLE beacon_artworks
    ADD COLUMN destination_url TEXT NOT NULL DEFAULT ''
    CHECK (length(destination_url) <= 2048);
