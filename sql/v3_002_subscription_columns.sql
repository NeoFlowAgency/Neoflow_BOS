-- ============================================================
-- NeoFlow BOS V3 - Migration 002: Colonnes abonnement Stripe
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Ajouter colonnes Stripe et abonnement sur workspaces
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

-- 2. Ajouter contrainte CHECK sur subscription_status
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_subscription_status_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_subscription_status_check
  CHECK (subscription_status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'));

-- 3. Initialiser owner_user_id depuis workspace_users
UPDATE workspaces w
SET owner_user_id = wu.user_id
FROM workspace_users wu
WHERE wu.workspace_id = w.id AND wu.role = 'owner';

-- 4. Marquer les workspaces existants comme actifs
-- (ils utilisaient le systeme gratuit avant Stripe)
UPDATE workspaces
SET is_active = TRUE, subscription_status = 'active'
WHERE is_active = FALSE OR is_active IS NULL;

-- 5. Supprimer les colonnes obsoletes (ancien systeme mot de passe)
ALTER TABLE workspaces DROP COLUMN IF EXISTS password_hash;
ALTER TABLE workspaces DROP COLUMN IF EXISTS invitation_code;
