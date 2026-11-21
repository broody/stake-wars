-- Keep each existing round's claim amount, including a pending transfer.
ALTER TABLE survivor_rounds RENAME COLUMN prize_amount TO prior_prize_amount;
ALTER TABLE survivor_rounds ADD COLUMN prize_amount TEXT
    CHECK (prize_amount IN ('100000000000000000000', '500000000000000000000'));
UPDATE survivor_rounds SET prize_amount = prior_prize_amount WHERE prior_prize_amount IS NOT NULL;
ALTER TABLE survivor_rounds DROP COLUMN prior_prize_amount;
