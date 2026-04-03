-- Migration v9_002_fix_orders_status.sql
-- Corrige la contrainte CHECK sur orders.status
-- Problème : v6_001_orders_foundation.sql définit orders avec la contrainte originale
-- sans 'en_preparation' et 'en_livraison' (ajoutés en v4_003 mais potentiellement absents)

-- Supprimer toutes les contraintes CHECK existantes liées au status sur orders
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'orders'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END$$;

-- Recréer la contrainte complète avec tous les statuts
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'brouillon',
    'confirme',
    'en_preparation',
    'en_livraison',
    'en_cours',
    'livre',
    'termine',
    'annule'
  ));

-- S'assurer que les colonnes pickup et delivery_fees existent (v4_003)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_available_from TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fees NUMERIC(12,2) DEFAULT 0;
