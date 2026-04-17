-- ============================================================
-- NeoFlow BOS V4 - Migration 003: Contremarques
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Table contremarques
CREATE TABLE IF NOT EXISTS contremarques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'commandee', 'recue', 'allouee', 'livree')),
  expected_date DATE,
  received_date DATE,
  notes VARCHAR(500),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS contremarques
ALTER TABLE contremarques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contremarques_select" ON contremarques;
CREATE POLICY "contremarques_select" ON contremarques FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "contremarques_insert" ON contremarques;
CREATE POLICY "contremarques_insert" ON contremarques FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

DROP POLICY IF EXISTS "contremarques_update" ON contremarques;
CREATE POLICY "contremarques_update" ON contremarques FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

DROP POLICY IF EXISTS "contremarques_delete" ON contremarques;
CREATE POLICY "contremarques_delete" ON contremarques FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_contremarques_order_id ON contremarques(order_id);
CREATE INDEX IF NOT EXISTS idx_contremarques_workspace_id ON contremarques(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contremarques_status ON contremarques(status);
CREATE INDEX IF NOT EXISTS idx_contremarques_supplier_id ON contremarques(supplier_id);

-- 4. Mise à jour RPC is_order_ready_to_deliver
-- NOTE: Cette fonction existe déjà (créée en Phase 1). CREATE OR REPLACE la met à jour.
-- Règle : au moins un acompte ET toutes les contremarques en statut recue/allouee/livree
-- (absence de contremarques = OK)
CREATE OR REPLACE FUNCTION is_order_ready_to_deliver(order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    -- Au moins un acompte encaissé
    EXISTS (
      SELECT 1 FROM order_payments
      WHERE order_payments.order_id = is_order_ready_to_deliver.order_id
        AND payment_type = 'acompte'
    )
    AND
    -- Aucune contremarque bloquante (en_attente ou commandee)
    NOT EXISTS (
      SELECT 1 FROM contremarques
      WHERE contremarques.order_id = is_order_ready_to_deliver.order_id
        AND status IN ('en_attente', 'commandee')
    )
  );
END;
$$;

-- 5. RPC batch : retourne les IDs de commandes prêtes à livrer pour un workspace
-- Utilisée par listOrdersReadyToDeliver() côté frontend (1 seul appel DB au lieu de N)
CREATE OR REPLACE FUNCTION list_orders_ready_to_deliver(p_workspace_id UUID)
RETURNS TABLE(order_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a member of this workspace
  IF NOT EXISTS (
    SELECT 1 FROM workspace_users
    WHERE workspace_users.workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.id
  FROM orders o
  WHERE o.workspace_id = p_workspace_id
    AND o.status NOT IN ('termine', 'annule', 'livre')
    AND EXISTS (
      SELECT 1 FROM order_payments op
      WHERE op.order_id = o.id AND op.payment_type = 'acompte'
    )
    AND NOT EXISTS (
      SELECT 1 FROM contremarques c
      WHERE c.order_id = o.id AND c.status IN ('en_attente', 'commandee')
    );
END;
$$;
