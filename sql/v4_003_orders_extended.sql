-- Migration v4_003_orders_extended.sql
-- Retrait en magasin + frais de livraison + nouveaux statuts

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_available_from TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fees NUMERIC(12,2) DEFAULT 0;

-- Nouveaux statuts : en_preparation, en_livraison
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'brouillon','confirme','en_preparation','en_livraison',
    'livre','termine','annule'
  ));
