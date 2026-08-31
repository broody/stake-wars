ALTER TABLE arbiter_rounds
    ADD COLUMN bidding_duration_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (bidding_duration_seconds >= 0);
