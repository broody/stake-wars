-- The last moments before a verified run fell, as gzipped JSON from the verifier.
-- The API keeps only the clips a board or the player's latest run can show.
CREATE TABLE survivor_clips (
    run_id INTEGER PRIMARY KEY REFERENCES survivor_runs(id) ON DELETE CASCADE,
    clip BLOB NOT NULL
);
