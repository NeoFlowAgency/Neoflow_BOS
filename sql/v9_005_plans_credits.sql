-- Migration v9_005_plans_credits.sql
-- Mise en place des plans tarifaires (basic/pro/enterprise) et du système NeoCredits
--
-- IMPORTANT : Les workspaces existants avec plan_type='standard' sont automatiquement
-- migrés vers 'pro' pour ne pas perdre leurs fonctionnalités.

-- ============================================================
-- PART 1 : Mise à jour plan_type sur workspaces
-- ============================================================

-- Ajouter les nouvelles valeurs au CHECK constraint plan_type
DO $$
BEGIN
  -- Supprimer l'ancienne contrainte si elle existe
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'workspaces' AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%plan_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE workspaces DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'workspaces' AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%plan_type%'
      LIMIT 1
    );
  END IF;
END$$;

ALTER TABLE workspaces ADD CONSTRAINT workspaces_plan_type_check
  CHECK (plan_type IN ('basic', 'pro', 'enterprise', 'standard', 'early-access'));

-- Migrer les workspaces 'standard' vers 'pro'
UPDATE workspaces SET plan_type = 'pro' WHERE plan_type = 'standard';

-- ============================================================
-- PART 2 : Table neo_credits
-- Stocke le solde NeoCredits de chaque workspace
-- 1 NeoCredit = 1 000 tokens (input + output combinés)
-- ============================================================

CREATE TABLE IF NOT EXISTS neo_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Solde courant
  credits_balance INTEGER NOT NULL DEFAULT 0,

  -- Allocation mensuelle selon le plan
  -- basic: 200 | pro: 2000 | enterprise: -1 (illimité)
  monthly_allowance INTEGER NOT NULL DEFAULT 200,

  -- Tracking mensuel
  credits_used_this_month INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),

  -- Crédits achetés en supplément (Stripe one-time)
  extra_credits INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id)
);

-- RLS
ALTER TABLE neo_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neo_credits_select" ON neo_credits;
DROP POLICY IF EXISTS "neo_credits_update_service" ON neo_credits;

CREATE POLICY "neo_credits_select" ON neo_credits
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "neo_credits_update_service" ON neo_credits
  FOR ALL USING (auth.role() = 'service_role');

-- Index
CREATE INDEX IF NOT EXISTS idx_neo_credits_workspace ON neo_credits(workspace_id);

-- ============================================================
-- PART 3 : Table credit_purchases
-- Historique des achats de crédits supplémentaires
-- ============================================================

CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  credits_purchased INTEGER NOT NULL,
  amount_eur NUMERIC(10,2),
  stripe_payment_intent VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credit_purchases_select" ON credit_purchases;

CREATE POLICY "credit_purchases_select" ON credit_purchases
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- PART 4 : Initialiser les crédits pour les workspaces existants
-- ============================================================

INSERT INTO neo_credits (workspace_id, credits_balance, monthly_allowance, credits_used_this_month)
SELECT
  w.id,
  CASE w.plan_type
    WHEN 'pro' THEN 2000
    WHEN 'enterprise' THEN -1
    WHEN 'early-access' THEN 2000
    ELSE 200
  END,
  CASE w.plan_type
    WHEN 'pro' THEN 2000
    WHEN 'enterprise' THEN -1
    WHEN 'early-access' THEN 2000
    ELSE 200
  END,
  0
FROM workspaces w
WHERE w.is_active = TRUE
  AND NOT EXISTS (SELECT 1 FROM neo_credits nc WHERE nc.workspace_id = w.id);

-- ============================================================
-- PART 5 : Fonction de reset mensuel des crédits
-- (à appeler via pg_cron le 1er de chaque mois)
-- ============================================================

CREATE OR REPLACE FUNCTION reset_monthly_neo_credits()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE neo_credits nc
  SET
    credits_balance = CASE nc.monthly_allowance
      WHEN -1 THEN -1  -- enterprise = illimité
      ELSE nc.monthly_allowance + nc.extra_credits
    END,
    credits_used_this_month = 0,
    extra_credits = 0,  -- les crédits achetés ne se cumulent pas d'un mois à l'autre
    last_reset_at = NOW(),
    updated_at = NOW()
  WHERE nc.monthly_allowance != -1 OR nc.credits_balance != -1;
END;
$$;

-- ============================================================
-- PART 6 : Fonction pour déduire des crédits (appelée par neo-chat)
-- Retourne true si la déduction a réussi, false si solde insuffisant
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_neo_credits(
  p_workspace_id UUID,
  p_tokens_used INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_credits_to_deduct INTEGER;
  v_current_balance INTEGER;
  v_allowance INTEGER;
BEGIN
  -- 1 NeoCredit = 1000 tokens, minimum 1 crédit
  v_credits_to_deduct := GREATEST(1, CEIL(p_tokens_used::NUMERIC / 1000));

  SELECT credits_balance, monthly_allowance INTO v_current_balance, v_allowance
  FROM neo_credits WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  -- Enterprise (illimité) : pas de déduction
  IF v_allowance = -1 OR v_current_balance = -1 THEN
    UPDATE neo_credits SET
      credits_used_this_month = credits_used_this_month + v_credits_to_deduct,
      updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    RETURN TRUE;
  END IF;

  -- Vérifier le solde
  IF v_current_balance < v_credits_to_deduct THEN
    RETURN FALSE;
  END IF;

  UPDATE neo_credits SET
    credits_balance = credits_balance - v_credits_to_deduct,
    credits_used_this_month = credits_used_this_month + v_credits_to_deduct,
    updated_at = NOW()
  WHERE workspace_id = p_workspace_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- PART 6b : Fonction pour ajouter des crédits achetés (Stripe one-time)
-- ============================================================

CREATE OR REPLACE FUNCTION add_neo_credits(
  p_workspace_id UUID,
  p_credits INTEGER
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE neo_credits SET
    credits_balance = CASE WHEN monthly_allowance = -1 THEN -1 ELSE credits_balance + p_credits END,
    extra_credits = extra_credits + p_credits,
    updated_at = NOW()
  WHERE workspace_id = p_workspace_id;
END;
$$;

-- ============================================================
-- PART 7 : pg_cron - reset mensuel le 1er à 3h du matin
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'reset-neo-credits-monthly',
      '0 3 1 * *',
      'SELECT reset_monthly_neo_credits()'
    );
  END IF;
END$$;

-- ============================================================
-- PART 8 : Trigger auto-init crédits lors de l'activation d'un workspace
-- ============================================================

CREATE OR REPLACE FUNCTION auto_init_neo_credits()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_allowance INTEGER;
BEGIN
  -- Seulement quand le workspace devient actif
  IF NEW.is_active = TRUE AND (OLD.is_active = FALSE OR OLD.is_active IS NULL) THEN
    v_allowance := CASE NEW.plan_type
      WHEN 'pro' THEN 2000
      WHEN 'enterprise' THEN -1
      WHEN 'early-access' THEN 2000
      ELSE 200  -- basic
    END;

    INSERT INTO neo_credits (workspace_id, credits_balance, monthly_allowance)
    VALUES (NEW.id, v_allowance, v_allowance)
    ON CONFLICT (workspace_id) DO UPDATE SET
      monthly_allowance = EXCLUDED.monthly_allowance,
      credits_balance = GREATEST(neo_credits.credits_balance, EXCLUDED.credits_balance),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_init_neo_credits ON workspaces;
CREATE TRIGGER trigger_auto_init_neo_credits
  AFTER UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION auto_init_neo_credits();
