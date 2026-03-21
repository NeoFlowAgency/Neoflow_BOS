-- ============================================================
-- NeoFlow BOS V3 - Migration 004: RLS updates + Triggers + Schema fixes
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Trigger unicite owner : un seul owner par workspace
CREATE OR REPLACE FUNCTION enforce_single_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    IF EXISTS (
      SELECT 1 FROM workspace_users
      WHERE workspace_id = NEW.workspace_id
        AND role = 'owner'
        AND user_id != NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Un workspace ne peut avoir qu''un seul proprietaire';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_single_owner ON workspace_users;
CREATE TRIGGER check_single_owner
  BEFORE INSERT OR UPDATE ON workspace_users
  FOR EACH ROW EXECUTE FUNCTION enforce_single_owner();

-- 2. Mettre a jour la politique DELETE workspaces : owner uniquement
DROP POLICY IF EXISTS "workspaces_delete" ON workspaces;
CREATE POLICY "workspaces_delete" ON workspaces FOR DELETE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role = 'owner'
  ));

-- 3. Mettre a jour la politique UPDATE workspaces : owner + manager
DROP POLICY IF EXISTS "workspaces_update" ON workspaces;
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

-- 4. Colonnes manquantes sur les tables existantes

-- Invoices: delivery_date + paid_at + other columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_delivery BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent';

-- Quotes: issue_date + expiry_date + quote_ref
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_global NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_ref TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;

-- Customers: is_priority
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;

-- Client interactions: workspace_id + content column
ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS content TEXT;
-- Populate workspace_id from the customer's workspace_id
UPDATE client_interactions ci
SET workspace_id = c.workspace_id
FROM customers c
WHERE ci.customer_id = c.id
  AND ci.workspace_id IS NULL;

-- Deliveries: ensure all columns exist
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Products: soft delete column
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- 4b. Fix CHECK constraints to match French values used by the application
-- ORDER: 1) DROP old constraints  2) UPDATE data  3) ADD new constraints
-- The old constraints may block UPDATE if values don't match, so DROP first.

-- === STEP 1: DROP ALL OLD CONSTRAINTS ===
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE client_interactions DROP CONSTRAINT IF EXISTS client_interactions_type_check;

-- === STEP 2: UPDATE EXISTING DATA TO FRENCH VALUES ===

-- Invoices: invoice_type
UPDATE invoices SET invoice_type = 'facture'
  WHERE invoice_type IS NOT NULL AND invoice_type NOT IN ('facture', 'avoir');

-- Invoices: status
UPDATE invoices SET status = CASE
  WHEN status IN ('draft', 'brouillon') THEN 'brouillon'
  WHEN status IN ('sent', 'envoyee', 'envoyée') THEN 'envoyée'
  WHEN status IN ('paid', 'payee', 'payée') THEN 'payée'
  WHEN status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN 'annulée'
  ELSE 'brouillon'
END
WHERE status NOT IN ('brouillon', 'envoyée', 'payée', 'annulée');

-- Deliveries: status
UPDATE deliveries SET status = CASE
  WHEN status IN ('in_progress', 'pending', 'en_cours') THEN 'en_cours'
  WHEN status IN ('completed', 'done', 'delivered', 'finalise') THEN 'finalise'
  WHEN status IN ('cancelled', 'canceled', 'annule') THEN 'annule'
  ELSE 'en_cours'
END
WHERE status NOT IN ('en_cours', 'finalise', 'annule');

-- Client interactions: type
UPDATE client_interactions SET type = CASE
  WHEN type IN ('call', 'appel') THEN 'appel'
  WHEN type IN ('meeting', 'reunion') THEN 'reunion'
  WHEN type = 'email' THEN 'email'
  WHEN type = 'note' THEN 'note'
  ELSE 'note'
END
WHERE type NOT IN ('note', 'email', 'appel', 'reunion');

-- === STEP 3: ADD NEW CONSTRAINTS (all rows now match) ===

ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('facture', 'avoir'));

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('brouillon', 'envoyée', 'payée', 'annulée'));

ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('en_cours', 'finalise', 'annule'));

ALTER TABLE client_interactions ADD CONSTRAINT client_interactions_type_check
  CHECK (type IN ('note', 'email', 'appel', 'reunion'));

-- 5. Soft-delete sur profiles (RGPD)
-- La table profiles est normalement creee via trigger Supabase auth
-- On ajoute la colonne deleted_at si la table existe
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    EXECUTE 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ';
  END IF;
END $$;

-- 6. Table bug_reports (si inexistante)
CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bug_reports_select' AND tablename = 'bug_reports') THEN
    CREATE POLICY "bug_reports_select" ON bug_reports FOR SELECT
      USING (workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bug_reports_insert' AND tablename = 'bug_reports') THEN
    CREATE POLICY "bug_reports_insert" ON bug_reports FOR INSERT
      WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()));
  END IF;
END $$;
