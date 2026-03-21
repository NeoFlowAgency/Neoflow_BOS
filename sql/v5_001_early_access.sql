-- ============================================================
-- V5_001: Early Access - Ajout plan_type et payment_intent_id
-- ============================================================

-- 1. Ajouter colonne plan_type pour distinguer early-access vs standard
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'standard';

-- 2. Ajouter colonne pour stocker la reference du paiement unique Stripe
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- 3. Mettre a jour la contrainte CHECK sur subscription_status pour inclure 'early_access'
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_subscription_status_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_subscription_status_check
  CHECK (subscription_status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'early_access'));
