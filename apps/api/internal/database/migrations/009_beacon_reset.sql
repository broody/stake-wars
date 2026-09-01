-- The Arbiter-to-Beacon rename is intentionally destructive for this domain.
-- Preserve unrelated application tables while discarding obsolete auction,
-- controller, and sponsored-transmission metadata.
DROP TABLE IF EXISTS arbiter_artworks;
DROP TABLE IF EXISTS arbiter_image_uploads;
DROP TABLE IF EXISTS arbiter_cycle_jobs;
DROP TABLE IF EXISTS arbiter_round_outcomes;
DROP TABLE IF EXISTS arbiter_rounds;

DELETE FROM schema_migrations
WHERE version IN (
    '003_arbiter_rounds.sql',
    '004_arbiter_history.sql',
    '005_arbiter_artwork.sql',
    '006_optional_arbiter_settlement_transaction.sql',
    '007_arbiter_round_schedule.sql',
    '008_arbiter_advertisements.sql'
);
