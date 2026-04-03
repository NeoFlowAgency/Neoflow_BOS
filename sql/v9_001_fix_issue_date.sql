-- Migration v9_001_fix_issue_date.sql
-- Ajoute la colonne issue_date manquante sur la table invoices
-- La RPC generate_invoice_from_order (v6_001) tente d'écrire dans cette colonne
-- mais elle n'est pas ajoutée à invoices dans FIX_ALL_SCHEMA (seulement sur quotes)

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_category VARCHAR(20);

-- S'assurer que invoice_category a la bonne contrainte
DO $$
BEGIN
  -- Supprimer l'ancienne contrainte si elle existe avec un autre nom
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%invoice_category%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE invoices DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'invoices'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%invoice_category%'
      LIMIT 1
    );
  END IF;
END$$;

ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_category_check
  CHECK (invoice_category IN ('standard', 'deposit', 'balance', 'quick_sale'))
  NOT VALID;

-- Mettre à jour les factures existantes sans issue_date
UPDATE invoices SET issue_date = created_at::DATE WHERE issue_date IS NULL;
