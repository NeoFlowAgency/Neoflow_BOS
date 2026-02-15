-- ============================================================
-- NeoFlow BOS V3 - Migration 003: Table invitations
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Creer la table workspace_invitations
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

-- 2. Index pour lookup rapide par token_hash
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
  ON workspace_invitations(token_hash);

-- 3. Activer RLS
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- 4. Policies : seuls owner/manager peuvent voir/creer/supprimer les invitations
DROP POLICY IF EXISTS "invitations_select" ON workspace_invitations;
CREATE POLICY "invitations_select" ON workspace_invitations FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "invitations_insert" ON workspace_invitations;
CREATE POLICY "invitations_insert" ON workspace_invitations FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));

DROP POLICY IF EXISTS "invitations_delete" ON workspace_invitations;
CREATE POLICY "invitations_delete" ON workspace_invitations FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users
    WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
  ));
