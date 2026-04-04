-- Migration v9_007_sav.sql
-- Module SAV (Service Après-Vente) : tickets, articles retournés, journal
--
-- IMPORTANT : À exécuter dans le SQL Editor Supabase après v9_006

-- ============================================================
-- PART 1 : Table sav_tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS sav_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Numéro lisible auto-généré (SAV-2026-001)
  ticket_number VARCHAR(50) UNIQUE,

  -- Liens
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Type et statut
  type VARCHAR(20) NOT NULL DEFAULT 'reclamation'
    CHECK (type IN ('retour', 'reclamation', 'garantie', 'avoir')),
  status VARCHAR(20) NOT NULL DEFAULT 'ouvert'
    CHECK (status IN ('ouvert', 'en_cours', 'resolu', 'clos')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normale'
    CHECK (priority IN ('faible', 'normale', 'urgente')),

  -- Contenu
  description TEXT NOT NULL,
  resolution TEXT,

  -- Assignation
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Montants (pour avoirs)
  refund_amount NUMERIC(12,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

-- Séquence pour les numéros de tickets
CREATE SEQUENCE IF NOT EXISTS sav_ticket_seq START 1;

-- Fonction de génération du numéro de ticket
CREATE OR REPLACE FUNCTION generate_sav_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT;
  v_seq  TEXT;
BEGIN
  v_year := to_char(NOW(), 'YYYY');
  v_seq  := lpad(nextval('sav_ticket_seq')::TEXT, 3, '0');
  NEW.ticket_number := 'SAV-' || v_year || '-' || v_seq;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sav_ticket_number ON sav_tickets;
CREATE TRIGGER trigger_sav_ticket_number
  BEFORE INSERT ON sav_tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL)
  EXECUTE FUNCTION generate_sav_ticket_number();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_sav_ticket_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Auto-set resolved_at / closed_at
  IF NEW.status = 'resolu' AND OLD.status != 'resolu' THEN
    NEW.resolved_at = NOW();
  END IF;
  IF NEW.status = 'clos' AND OLD.status != 'clos' THEN
    NEW.closed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sav_ticket_updated_at
  BEFORE UPDATE ON sav_tickets
  FOR EACH ROW EXECUTE FUNCTION update_sav_ticket_timestamp();

-- ============================================================
-- PART 2 : Table sav_items (articles retournés / concernés)
-- ============================================================

CREATE TABLE IF NOT EXISTS sav_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES sav_tickets(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Description libre si produit pas en catalogue
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  -- État du produit retourné
  condition VARCHAR(20) DEFAULT 'inconnu'
    CHECK (condition IN ('neuf', 'bon', 'abime', 'hors_service', 'inconnu')),

  -- Action décidée pour cet article
  action VARCHAR(20) DEFAULT 'en_attente'
    CHECK (action IN ('remboursement', 'echange', 'reparation', 'rejet', 'en_attente')),

  -- Remise en stock après retour
  restocked BOOLEAN DEFAULT FALSE,
  restocked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PART 3 : Table sav_history (journal d'activité du ticket)
-- ============================================================

CREATE TABLE IF NOT EXISTS sav_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES sav_tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  action VARCHAR(50) NOT NULL,
  -- ex: 'created', 'status_changed', 'comment', 'item_added', 'avoir_generated', 'restocked'
  comment TEXT,
  metadata JSONB, -- données supplémentaires (ex: {from: 'ouvert', to: 'en_cours'})

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PART 4 : RLS
-- ============================================================

ALTER TABLE sav_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sav_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sav_history  ENABLE ROW LEVEL SECURITY;

-- sav_tickets : accès par workspace
CREATE POLICY "sav_tickets_select" ON sav_tickets
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "sav_tickets_insert" ON sav_tickets
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "sav_tickets_update" ON sav_tickets
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

-- sav_items : accès via ticket
CREATE POLICY "sav_items_select" ON sav_items
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM sav_tickets
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "sav_items_insert" ON sav_items
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM sav_tickets
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "sav_items_update" ON sav_items
  FOR UPDATE USING (
    ticket_id IN (
      SELECT id FROM sav_tickets
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    )
  );

-- sav_history : accès via ticket
CREATE POLICY "sav_history_select" ON sav_history
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM sav_tickets
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "sav_history_insert" ON sav_history
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM sav_tickets
      WHERE workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- PART 5 : Index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sav_tickets_workspace    ON sav_tickets(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sav_tickets_status       ON sav_tickets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_sav_tickets_customer     ON sav_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_sav_tickets_order        ON sav_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_sav_items_ticket         ON sav_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sav_history_ticket       ON sav_history(ticket_id, created_at DESC);
