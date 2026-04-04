-- v9_010_enterprise.sql
-- Phase 8 — Multi-workspace Enterprise

-- ============================================================
-- TABLE: enterprise_accounts
-- Compte chapeau pour les clients Enterprise (multi-magasins)
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprise_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  max_workspaces INTEGER DEFAULT 10,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: enterprise_workspace_links
-- Workspaces rattachés à un compte Enterprise
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprise_workspace_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enterprise_account_id UUID NOT NULL REFERENCES enterprise_accounts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (enterprise_account_id, workspace_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_enterprise_accounts_owner ON enterprise_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_links_account ON enterprise_workspace_links(enterprise_account_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_links_workspace ON enterprise_workspace_links(workspace_id);

-- ============================================================
-- RLS enterprise_accounts
-- ============================================================
ALTER TABLE enterprise_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enterprise_accounts_owner_select" ON enterprise_accounts;
DROP POLICY IF EXISTS "enterprise_accounts_owner_insert" ON enterprise_accounts;
DROP POLICY IF EXISTS "enterprise_accounts_owner_update" ON enterprise_accounts;
DROP POLICY IF EXISTS "enterprise_accounts_service_role" ON enterprise_accounts;

CREATE POLICY "enterprise_accounts_owner_select" ON enterprise_accounts
  FOR SELECT USING (auth.uid() = owner_user_id);

CREATE POLICY "enterprise_accounts_owner_insert" ON enterprise_accounts
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "enterprise_accounts_owner_update" ON enterprise_accounts
  FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY "enterprise_accounts_service_role" ON enterprise_accounts
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS enterprise_workspace_links
-- ============================================================
ALTER TABLE enterprise_workspace_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enterprise_links_owner_select" ON enterprise_workspace_links;
DROP POLICY IF EXISTS "enterprise_links_service_role" ON enterprise_workspace_links;

CREATE POLICY "enterprise_links_owner_select" ON enterprise_workspace_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM enterprise_accounts ea
      WHERE ea.id = enterprise_workspace_links.enterprise_account_id
        AND ea.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "enterprise_links_service_role" ON enterprise_workspace_links
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- TABLE: enterprise_contact_requests
-- Formulaire de contact page publique /entreprise
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprise_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  phone VARCHAR(50),
  nb_stores INTEGER,
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'converted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accès service_role uniquement (formulaire public → Edge Function)
ALTER TABLE enterprise_contact_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise_contacts_service_role" ON enterprise_contact_requests
  FOR ALL USING (auth.role() = 'service_role');
