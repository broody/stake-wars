-- Bramble joins the wallets a Survivor score can record. SQLite cannot change
-- a CHECK constraint in place, so this replaces the wallet_kind column with one
-- that also allows 'bramble' and keeps every recorded value.
ALTER TABLE survivor_runs ADD COLUMN wallet_kind_next TEXT
    CHECK (wallet_kind_next IS NULL OR wallet_kind_next IN ('outis', 'argentX', 'braavos', 'bramble', 'xverse'));
UPDATE survivor_runs SET wallet_kind_next = wallet_kind;
ALTER TABLE survivor_runs DROP COLUMN wallet_kind;
ALTER TABLE survivor_runs RENAME COLUMN wallet_kind_next TO wallet_kind;
