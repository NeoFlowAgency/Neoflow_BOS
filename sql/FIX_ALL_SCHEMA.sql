-- ============================================================
-- NeoFlow BOS - FIX ALL SCHEMA
-- Execute this ONCE in Supabase Dashboard > SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ============================================================
-- PART 1: PROFILES TABLE (required for member names + RGPD)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (needed for member lists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
  END IF;
END $$;

-- Users can update their own profile
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_update' AND tablename = 'profiles') THEN
    CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill profiles for existing users
INSERT INTO profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PART 2: WORKSPACES TABLE - Add missing columns
-- ============================================================
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'France';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS siret TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS legal_form TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Stripe subscription columns
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS owner_user_id UUID;

-- Set existing workspaces as active
UPDATE workspaces SET is_active = TRUE WHERE is_active IS NULL;
UPDATE workspaces SET subscription_status = 'active' WHERE subscription_status IS NULL OR subscription_status = '';

-- Initialize owner_user_id from workspace_users
UPDATE workspaces w SET owner_user_id = wu.user_id
FROM workspace_users wu
WHERE wu.workspace_id = w.id AND wu.role = 'owner'
AND w.owner_user_id IS NULL;

-- Remove obsolete columns (ignore if they don't exist)
ALTER TABLE workspaces DROP COLUMN IF EXISTS password_hash;
ALTER TABLE workspaces DROP COLUMN IF EXISTS invitation_code;

-- ============================================================
-- PART 3: ROLES MIGRATION (owner/manager/member)
-- ============================================================
-- Drop old constraint first
ALTER TABLE workspace_users DROP CONSTRAINT IF EXISTS workspace_users_role_check;

-- Convert first member of each workspace to owner (if no owner exists)
UPDATE workspace_users wu
SET role = 'owner'
FROM (
  SELECT DISTINCT ON (workspace_id) workspace_id, user_id
  FROM workspace_users
  ORDER BY workspace_id, created_at ASC
) AS first_users
WHERE wu.workspace_id = first_users.workspace_id
  AND wu.user_id = first_users.user_id
  AND NOT EXISTS (
    SELECT 1 FROM workspace_users wu2
    WHERE wu2.workspace_id = wu.workspace_id AND wu2.role = 'owner'
  );

-- Convert remaining 'admin' to 'manager' (keep manager role)
UPDATE workspace_users SET role = 'manager' WHERE role = 'admin';

-- Add new constraint
ALTER TABLE workspace_users ADD CONSTRAINT workspace_users_role_check
  CHECK (role IN ('owner', 'manager', 'member'));

-- ============================================================
-- PART 4: WORKSPACE INVITATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member')),
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON workspace_invitations(token_hash);
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invitations_select' AND tablename = 'workspace_invitations') THEN
    CREATE POLICY "invitations_select" ON workspace_invitations FOR SELECT
      USING (workspace_id IN (
        SELECT workspace_id FROM workspace_users
        WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invitations_insert' AND tablename = 'workspace_invitations') THEN
    CREATE POLICY "invitations_insert" ON workspace_invitations FOR INSERT
      WITH CHECK (workspace_id IN (
        SELECT workspace_id FROM workspace_users
        WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'invitations_delete' AND tablename = 'workspace_invitations') THEN
    CREATE POLICY "invitations_delete" ON workspace_invitations FOR DELETE
      USING (workspace_id IN (
        SELECT workspace_id FROM workspace_users
        WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
      ));
  END IF;
END $$;

-- ============================================================
-- PART 5: MISSING COLUMNS ON EXISTING TABLES
-- ============================================================

-- Invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS has_delivery BOOLEAN DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'percent';

-- Quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_global NUMERIC DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_ref TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS validity_days INTEGER DEFAULT 30;

-- Make nullable columns that the code provides
DO $$ BEGIN ALTER TABLE quotes ALTER COLUMN quote_number DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE quotes ALTER COLUMN valid_until DROP NOT NULL; EXCEPTION WHEN others THEN NULL; END $$;

-- Customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;

-- Client interactions
ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE client_interactions ADD COLUMN IF NOT EXISTS content TEXT;
UPDATE client_interactions ci SET workspace_id = c.workspace_id
FROM customers c WHERE ci.customer_id = c.id AND ci.workspace_id IS NULL;

-- Deliveries
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- ============================================================
-- PART 6: CHECK CONSTRAINTS (French values)
-- ============================================================
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE client_interactions DROP CONSTRAINT IF EXISTS client_interactions_type_check;

-- Update existing data to French values
UPDATE invoices SET invoice_type = 'facture'
  WHERE invoice_type IS NOT NULL AND invoice_type NOT IN ('facture', 'avoir');
UPDATE invoices SET status = CASE
  WHEN status IN ('draft', 'brouillon') THEN 'brouillon'
  WHEN status IN ('sent', 'envoyee', 'envoyée') THEN 'envoyée'
  WHEN status IN ('paid', 'payee', 'payée') THEN 'payée'
  WHEN status IN ('cancelled', 'canceled', 'annulee', 'annulée') THEN 'annulée'
  ELSE 'brouillon'
END WHERE status NOT IN ('brouillon', 'envoyée', 'payée', 'annulée');

UPDATE deliveries SET status = CASE
  WHEN status IN ('in_progress', 'pending', 'en_cours') THEN 'en_cours'
  WHEN status IN ('completed', 'done', 'delivered', 'finalise') THEN 'finalise'
  WHEN status IN ('cancelled', 'canceled', 'annule') THEN 'annule'
  ELSE 'en_cours'
END WHERE status NOT IN ('en_cours', 'finalise', 'annule');

UPDATE client_interactions SET type = CASE
  WHEN type IN ('call', 'appel') THEN 'appel'
  WHEN type IN ('meeting', 'reunion') THEN 'reunion'
  WHEN type = 'email' THEN 'email'
  WHEN type = 'note' THEN 'note'
  ELSE 'note'
END WHERE type IS NOT NULL AND type NOT IN ('note', 'email', 'appel', 'reunion');

ALTER TABLE invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('facture', 'avoir'));
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('brouillon', 'envoyée', 'payée', 'annulée'));
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status IN ('en_cours', 'finalise', 'annule'));
ALTER TABLE client_interactions ADD CONSTRAINT client_interactions_type_check
  CHECK (type IN ('note', 'email', 'appel', 'reunion'));

-- ============================================================
-- PART 7: TRIGGERS
-- ============================================================

-- Enforce single owner per workspace
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

-- ============================================================
-- PART 8: RLS POLICY UPDATES
-- ============================================================
DROP POLICY IF EXISTS "workspaces_delete" ON workspaces;
CREATE POLICY "workspaces_delete" ON workspaces FOR DELETE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role = 'owner'
  ));

DROP POLICY IF EXISTS "workspaces_update" ON workspaces;
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

-- ============================================================
-- PART 9: SQL FUNCTIONS FOR NUMBERING
-- ============================================================

-- Invoice numbering: SLUG-FACT-YEAR-NNN
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_workspace_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_slug TEXT;
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN v_slug := 'WS'; END IF;
  v_slug := UPPER(v_slug);

  SELECT COUNT(*) INTO v_count
  FROM invoices
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  v_number := v_slug || '-FACT-' || p_year::TEXT || '-' || LPAD((v_count + 1)::TEXT, 3, '0');

  RETURN jsonb_build_object('invoice_number', v_number);
END;
$$;

-- Quote numbering: SLUG-DEV-YEAR-NNN
CREATE OR REPLACE FUNCTION get_next_quote_number(p_workspace_id UUID, p_year INT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_slug TEXT;
  v_count INT;
  v_number TEXT;
BEGIN
  SELECT slug INTO v_slug FROM workspaces WHERE id = p_workspace_id;
  IF v_slug IS NULL THEN v_slug := 'WS'; END IF;
  v_slug := UPPER(v_slug);

  SELECT COUNT(*) INTO v_count
  FROM quotes
  WHERE workspace_id = p_workspace_id
    AND EXTRACT(YEAR FROM created_at) = p_year;

  v_number := v_slug || '-DEV-' || p_year::TEXT || '-' || LPAD((v_count + 1)::TEXT, 3, '0');

  RETURN jsonb_build_object('quote_number', v_number);
END;
$$;

-- Convert quote to invoice (atomic)
CREATE OR REPLACE FUNCTION convert_quote_to_invoice(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_quote RECORD;
  v_invoice_number TEXT;
  v_invoice_id UUID;
BEGIN
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Devis introuvable';
  END IF;
  IF v_quote.status = 'converted' THEN
    RAISE EXCEPTION 'Ce devis a deja ete converti';
  END IF;

  SELECT (get_next_invoice_number(v_quote.workspace_id, EXTRACT(YEAR FROM NOW())::INT))->>'invoice_number'
  INTO v_invoice_number;

  INSERT INTO invoices (
    workspace_id, customer_id, created_by, invoice_number, invoice_type,
    status, subtotal_ht, total_tva, total_ttc, discount_global, notes
  ) VALUES (
    v_quote.workspace_id, v_quote.customer_id, v_quote.created_by,
    v_invoice_number, 'facture', 'brouillon',
    v_quote.subtotal_ht, v_quote.total_tva, v_quote.total_ttc,
    COALESCE(v_quote.discount_global, 0), v_quote.notes
  ) RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position)
  SELECT v_invoice_id, product_id, description, quantity, unit_price_ht, tax_rate, total_ht, position
  FROM quote_items WHERE quote_id = p_quote_id;

  UPDATE quotes SET status = 'converted', converted_to_invoice_id = v_invoice_id, converted_at = NOW()
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$;

-- ============================================================
-- PART 10: BUG REPORTS TABLE
-- ============================================================
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bug_reports_select' AND tablename = 'bug_reports') THEN
    CREATE POLICY "bug_reports_select" ON bug_reports FOR SELECT
      USING (workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bug_reports_insert' AND tablename = 'bug_reports') THEN
    CREATE POLICY "bug_reports_insert" ON bug_reports FOR INSERT
      WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ============================================================
-- DONE! All schema fixes applied.
-- ============================================================
