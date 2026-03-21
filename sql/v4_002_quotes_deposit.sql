-- Migration v4_002_quotes_deposit.sql
-- Acompte sur les devis

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(10) DEFAULT 'percent'
  CHECK (deposit_type IN ('percent', 'euro'));
