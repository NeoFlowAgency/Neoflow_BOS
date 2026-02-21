-- ============================================================
-- NeoFlow BOS V4 - Migration combinee
-- Roles hierarchiques + Personnalisation workspace + Onboarding
-- Executer dans Supabase SQL Editor
-- ============================================================

-- ========================================
-- PARTIE 1 : NOUVEAUX ROLES HIERARCHIQUES
-- ========================================

-- 1a. Supprimer le trigger single-owner (proprietaire peut etre multiple)
DROP TRIGGER IF EXISTS check_single_owner ON workspace_users;
DROP FUNCTION IF EXISTS enforce_single_owner();

-- 1b. Supprimer l'ancien constraint
ALTER TABLE workspace_users DROP CONSTRAINT IF EXISTS workspace_users_role_check;

-- 1c. Migrer les donnees existantes
UPDATE workspace_users SET role = 'proprietaire' WHERE role = 'owner';
UPDATE workspace_users SET role = 'vendeur' WHERE role = 'member';
-- manager reste manager

-- 1d. Ajouter le nouveau constraint
ALTER TABLE workspace_users ADD CONSTRAINT workspace_users_role_check
  CHECK (role IN ('proprietaire', 'manager', 'vendeur', 'livreur'));

-- 1e. Migrer les roles d'invitation
ALTER TABLE workspace_invitations DROP CONSTRAINT IF EXISTS workspace_invitations_role_check;
UPDATE workspace_invitations SET role = 'proprietaire' WHERE role = 'owner';
UPDATE workspace_invitations SET role = 'vendeur' WHERE role = 'member';
ALTER TABLE workspace_invitations ADD CONSTRAINT workspace_invitations_role_check
  CHECK (role IN ('proprietaire', 'manager', 'vendeur', 'livreur'));

-- 1f. Mettre a jour les RLS policies

-- workspace delete : proprietaire uniquement
DROP POLICY IF EXISTS "workspaces_delete" ON workspaces;
CREATE POLICY "workspaces_delete" ON workspaces FOR DELETE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role = 'proprietaire'
  ));

-- workspace update : proprietaire + manager
DROP POLICY IF EXISTS "workspaces_update" ON workspaces;
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE
  USING (id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- invitations : proprietaire + manager
DROP POLICY IF EXISTS "invitations_select" ON workspace_invitations;
DROP POLICY IF EXISTS "invitations_insert" ON workspace_invitations;
DROP POLICY IF EXISTS "invitations_delete" ON workspace_invitations;

CREATE POLICY "invitations_select" ON workspace_invitations FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "invitations_insert" ON workspace_invitations FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "invitations_delete" ON workspace_invitations FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('proprietaire', 'manager')
  ));

-- =============================================
-- PARTIE 2 : PERSONNALISATION WORKSPACE
-- =============================================

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bank_iban TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bank_bic TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS quote_footer TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS website TEXT;

-- =============================================
-- PARTIE 3 : ONBOARDING TRACKING
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    EXECUTE 'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE';
  END IF;
END $$;
