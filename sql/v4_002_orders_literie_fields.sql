-- ============================================================
-- NeoFlow BOS V4 - Migration 002: Champs literie orders + order_payments
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Nouveaux champs sur orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wished_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS old_furniture_option VARCHAR(20) DEFAULT 'keep'
  CHECK (old_furniture_option IN ('keep', 'ess', 'dechetterie', 'reprise'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sms_partner_consent BOOLEAN DEFAULT FALSE;

-- 2. Table order_payments (acomptes / soldes multi-mode)
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'acompte'
    CHECK (payment_type IN ('acompte', 'solde', 'avoir')),
  mode VARCHAR(20) NOT NULL DEFAULT 'cb'
    CHECK (mode IN ('cash', 'cb', 'virement', 'cheque', 'financement', 'avoir')),
  amount DECIMAL(10,2) NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  notes VARCHAR(255),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS order_payments
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_payments_select" ON order_payments;
CREATE POLICY "order_payments_select" ON order_payments FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "order_payments_insert" ON order_payments;
CREATE POLICY "order_payments_insert" ON order_payments FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

DROP POLICY IF EXISTS "order_payments_update" ON order_payments;
CREATE POLICY "order_payments_update" ON order_payments FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

DROP POLICY IF EXISTS "order_payments_delete" ON order_payments;
CREATE POLICY "order_payments_delete" ON order_payments FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 4. Infos légales workspace
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ape_code VARCHAR(10);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS legal_capital VARCHAR(50);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_workspace_id ON order_payments(workspace_id);

-- 6. RPC is_order_ready_to_deliver
-- Retourne true si au moins un acompte a été encaissé sur cette commande
-- NOTE: les contremarques seront ajoutées en Phase 2 — pour l'instant la fonction
-- retourne true si au moins un acompte order_payments existe
CREATE OR REPLACE FUNCTION is_order_ready_to_deliver(order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM order_payments
    WHERE order_payments.order_id = is_order_ready_to_deliver.order_id
      AND payment_type = 'acompte'
  );
END;
$$;
