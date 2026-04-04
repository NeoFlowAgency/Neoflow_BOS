-- v9_011_neo_complete.sql
-- Neo IA — Employé digital complet
-- Tables : conversations, messages, mémoires, config, permissions outils, tâches planifiées, actions en attente

-- ============================================================
-- TABLE: neo_config
-- Configuration personnalisée de Neo par workspace / par utilisateur
-- user_id NULL = config workspace partagée (défaut)
-- user_id non-null = override personnel
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assistant_name VARCHAR(100) DEFAULT 'Neo',
  tone VARCHAR(20) DEFAULT 'professional' CHECK (tone IN ('formal', 'professional', 'casual')),
  language VARCHAR(10) DEFAULT 'fr',
  custom_instructions TEXT,
  business_context TEXT,
  avatar_emoji VARCHAR(10) DEFAULT '🤖',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

ALTER TABLE neo_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_config_select" ON neo_config;
DROP POLICY IF EXISTS "neo_config_insert" ON neo_config;
DROP POLICY IF EXISTS "neo_config_update" ON neo_config;
DROP POLICY IF EXISTS "neo_config_service" ON neo_config;

CREATE POLICY "neo_config_select" ON neo_config
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_config_insert" ON neo_config
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "neo_config_update" ON neo_config
  FOR UPDATE USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "neo_config_service" ON neo_config
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_config_workspace ON neo_config(workspace_id);
CREATE INDEX IF NOT EXISTS idx_neo_config_user ON neo_config(user_id);

-- ============================================================
-- TABLE: neo_memories
-- Mémoire persistante de Neo (workspace + personnelle)
-- user_id NULL = mémoire workspace partagée
-- user_id non-null = mémoire personnelle de l'utilisateur
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  -- Categories: business, customer, product, preference, procedure, contact, other
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neo_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_memories_select" ON neo_memories;
DROP POLICY IF EXISTS "neo_memories_insert" ON neo_memories;
DROP POLICY IF EXISTS "neo_memories_update" ON neo_memories;
DROP POLICY IF EXISTS "neo_memories_delete" ON neo_memories;
DROP POLICY IF EXISTS "neo_memories_service" ON neo_memories;

CREATE POLICY "neo_memories_select" ON neo_memories
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
    AND (user_id IS NULL OR user_id = auth.uid())
  );
CREATE POLICY "neo_memories_insert" ON neo_memories
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_memories_update" ON neo_memories
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_memories_delete" ON neo_memories
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_memories_service" ON neo_memories
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_memories_workspace ON neo_memories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_neo_memories_user ON neo_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_neo_memories_active ON neo_memories(workspace_id, is_active);

-- ============================================================
-- TABLE: neo_tool_permissions
-- Autorisations par outil, par workspace/utilisateur
-- permission: always_allow | always_ask | ask_warn | never
-- user_id NULL = config workspace (défaut pour tous)
-- user_id non-null = override personnel
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_tool_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  permission VARCHAR(20) NOT NULL CHECK (permission IN ('always_allow', 'always_ask', 'ask_warn', 'never')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id, tool_name)
);

ALTER TABLE neo_tool_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_tool_permissions_select" ON neo_tool_permissions;
DROP POLICY IF EXISTS "neo_tool_permissions_upsert" ON neo_tool_permissions;
DROP POLICY IF EXISTS "neo_tool_permissions_service" ON neo_tool_permissions;

CREATE POLICY "neo_tool_permissions_select" ON neo_tool_permissions
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_tool_permissions_upsert" ON neo_tool_permissions
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
CREATE POLICY "neo_tool_permissions_service" ON neo_tool_permissions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_permissions_workspace ON neo_tool_permissions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_neo_permissions_user ON neo_tool_permissions(user_id);

-- ============================================================
-- TABLE: neo_conversations
-- Historique des conversations (remplace localStorage)
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'Nouvelle conversation',
  is_pinned BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neo_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_conversations_select" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_insert" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_update" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_delete" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_service" ON neo_conversations;

CREATE POLICY "neo_conversations_select" ON neo_conversations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "neo_conversations_insert" ON neo_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "neo_conversations_update" ON neo_conversations
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "neo_conversations_delete" ON neo_conversations
  FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "neo_conversations_service" ON neo_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_conversations_user ON neo_conversations(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_neo_conversations_last ON neo_conversations(last_message_at DESC);

-- ============================================================
-- TABLE: neo_messages
-- Messages dans les conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES neo_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  tool_calls JSONB,
  metadata JSONB,
  -- metadata: { pending_action, credits_used, tokens_used, tool_results, scheduled_task_id }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neo_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_messages_select" ON neo_messages;
DROP POLICY IF EXISTS "neo_messages_insert" ON neo_messages;
DROP POLICY IF EXISTS "neo_messages_service" ON neo_messages;

CREATE POLICY "neo_messages_select" ON neo_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM neo_conversations WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "neo_messages_insert" ON neo_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM neo_conversations WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "neo_messages_service" ON neo_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_messages_conversation ON neo_messages(conversation_id, created_at);

-- ============================================================
-- TABLE: neo_pending_actions
-- Actions en attente d'approbation
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES neo_conversations(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  tool_args JSONB NOT NULL,
  action_label TEXT,
  action_details TEXT,
  risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE neo_pending_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_pending_actions_select" ON neo_pending_actions;
DROP POLICY IF EXISTS "neo_pending_actions_update" ON neo_pending_actions;
DROP POLICY IF EXISTS "neo_pending_actions_service" ON neo_pending_actions;

CREATE POLICY "neo_pending_actions_select" ON neo_pending_actions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "neo_pending_actions_update" ON neo_pending_actions
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "neo_pending_actions_service" ON neo_pending_actions
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_pending_workspace ON neo_pending_actions(workspace_id, status);

-- ============================================================
-- TABLE: neo_scheduled_tasks
-- Tâches planifiées (one-time ou récurrentes)
-- ============================================================
CREATE TABLE IF NOT EXISTS neo_scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES neo_conversations(id),
  title VARCHAR(255) NOT NULL,
  task_prompt TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  cron_expression VARCHAR(100),
  -- Exemples: '0 8 * * 1' (lundi 8h), '0 16 * * *' (tous les jours 16h)
  timezone VARCHAR(50) DEFAULT 'Europe/Paris',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'running', 'completed', 'failed', 'cancelled')),
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE neo_scheduled_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "neo_scheduled_tasks_select" ON neo_scheduled_tasks;
DROP POLICY IF EXISTS "neo_scheduled_tasks_insert" ON neo_scheduled_tasks;
DROP POLICY IF EXISTS "neo_scheduled_tasks_update" ON neo_scheduled_tasks;
DROP POLICY IF EXISTS "neo_scheduled_tasks_service" ON neo_scheduled_tasks;

CREATE POLICY "neo_scheduled_tasks_select" ON neo_scheduled_tasks
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "neo_scheduled_tasks_insert" ON neo_scheduled_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "neo_scheduled_tasks_update" ON neo_scheduled_tasks
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "neo_scheduled_tasks_service" ON neo_scheduled_tasks
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_neo_tasks_next_run ON neo_scheduled_tasks(next_run_at, status);
CREATE INDEX IF NOT EXISTS idx_neo_tasks_user ON neo_scheduled_tasks(user_id, workspace_id);

-- ============================================================
-- INITIALISATIONS : permissions par défaut
-- Insert des permissions workspace par défaut au format service_role
-- (appelé lors de la création d'un workspace via trigger)
-- ============================================================

CREATE OR REPLACE FUNCTION init_neo_defaults(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Config Neo par défaut pour le workspace
  INSERT INTO neo_config (workspace_id, user_id, assistant_name, tone, language)
  VALUES (p_workspace_id, NULL, 'Neo', 'professional', 'fr')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Permissions par défaut (workspace-wide)
  -- Outils lecture = always_allow
  INSERT INTO neo_tool_permissions (workspace_id, user_id, tool_name, permission)
  VALUES
    (p_workspace_id, NULL, 'search_orders', 'always_allow'),
    (p_workspace_id, NULL, 'get_order_details', 'always_allow'),
    (p_workspace_id, NULL, 'search_customers', 'always_allow'),
    (p_workspace_id, NULL, 'get_customer_info', 'always_allow'),
    (p_workspace_id, NULL, 'search_products', 'always_allow'),
    (p_workspace_id, NULL, 'get_stock_alerts', 'always_allow'),
    (p_workspace_id, NULL, 'get_stock_levels', 'always_allow'),
    (p_workspace_id, NULL, 'get_deliveries', 'always_allow'),
    (p_workspace_id, NULL, 'get_dashboard_kpis', 'always_allow'),
    (p_workspace_id, NULL, 'get_financial_stats', 'always_allow'),
    (p_workspace_id, NULL, 'get_quotes', 'always_allow'),
    (p_workspace_id, NULL, 'get_invoices', 'always_allow'),
    (p_workspace_id, NULL, 'get_sav_tickets', 'always_allow'),
    (p_workspace_id, NULL, 'get_team_stats', 'always_allow'),
    (p_workspace_id, NULL, 'get_payments', 'always_allow'),
    (p_workspace_id, NULL, 'remember_fact', 'always_allow'),
    -- Outils écriture = always_ask
    (p_workspace_id, NULL, 'update_order_status', 'always_ask'),
    (p_workspace_id, NULL, 'create_delivery', 'always_ask'),
    (p_workspace_id, NULL, 'record_payment', 'always_ask'),
    (p_workspace_id, NULL, 'create_customer', 'always_ask'),
    (p_workspace_id, NULL, 'update_customer', 'always_ask'),
    (p_workspace_id, NULL, 'add_customer_note', 'always_ask'),
    (p_workspace_id, NULL, 'assign_delivery_driver', 'always_ask'),
    (p_workspace_id, NULL, 'send_quote_email', 'always_ask'),
    (p_workspace_id, NULL, 'convert_quote_to_order', 'always_ask'),
    (p_workspace_id, NULL, 'create_sav_ticket', 'always_ask'),
    (p_workspace_id, NULL, 'update_delivery_date', 'always_ask'),
    (p_workspace_id, NULL, 'schedule_task', 'always_allow'),
    -- Outils risque élevé = ask_warn
    (p_workspace_id, NULL, 'cancel_order', 'ask_warn'),
    (p_workspace_id, NULL, 'cancel_delivery', 'ask_warn'),
    (p_workspace_id, NULL, 'create_credit_note', 'ask_warn'),
    (p_workspace_id, NULL, 'update_product_price', 'ask_warn')
  ON CONFLICT (workspace_id, user_id, tool_name) DO NOTHING;
END;
$$;

-- Trigger: init Neo quand un workspace devient actif
CREATE OR REPLACE FUNCTION trigger_init_neo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_active = TRUE AND (OLD.is_active = FALSE OR OLD.is_active IS NULL) THEN
    PERFORM init_neo_defaults(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_neo_init ON workspaces;
CREATE TRIGGER trigger_neo_init
  AFTER UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION trigger_init_neo();

-- Initialiser pour les workspaces existants
DO $$
DECLARE ws RECORD;
BEGIN
  FOR ws IN SELECT id FROM workspaces WHERE is_active = TRUE LOOP
    PERFORM init_neo_defaults(ws.id);
  END LOOP;
END$$;

-- ============================================================
-- Fonction pg_cron : vérifier les tâches planifiées toutes les minutes
-- ============================================================
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'neo-scheduled-tasks-check',
      '* * * * *',
      $cron$
      UPDATE neo_scheduled_tasks
      SET status = 'running', updated_at = NOW()
      WHERE status = 'active'
        AND next_run_at <= NOW()
        AND next_run_at IS NOT NULL
      $cron$
    );
  END IF;
END$outer$;
