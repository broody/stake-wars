-- Scores recorded before replay details were kept have NULL in both columns.
ALTER TABLE survivor_players ADD COLUMN best_duration_seconds INTEGER
    CHECK (best_duration_seconds >= 0);
ALTER TABLE survivor_players ADD COLUMN best_upgrades TEXT
    CHECK (best_upgrades IS NULL OR json_type(best_upgrades) = 'array');
