-- Migration v9_006_neo_conversations.sql
-- Tables pour Neo IA : conversations persistantes + pending actions
--
-- IMPORTANT : À exécuter dans le SQL Editor Supabase après v9_005

-- ============================================================
-- PART 1 : Conversations Neo (remplace localStorage)
-- ============================================================

CREATE TABLE IF NOT EXISTS neo_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Nouvelle conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id)
);

-- ============================================================
-- PART 2 : Messages Neo (historique persistant)
-- ============================================================

CREATE TABLE IF NOT EXISTS neo_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES neo_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT,
  tool_calls JSONB,        -- appels d'outils demandés par l'assistant
  tool_call_id VARCHAR(100), -- ID de l'appel d'outil (pour les messages role=tool)
  tool_name VARCHAR(100),    -- nom de l'outil (pour les messages role=tool)
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PART 3 : Pending Actions (système d'approbation)
-- L'utilisateur doit approuver/refuser avant exécution
-- ============================================================

CREATE TABLE IF NOT EXISTS neo_pending_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES neo_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES neo_messages(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Outil demandé par l'agent
  tool_name VARCHAR(100) NOT NULL,
  tool_args JSONB NOT NULL DEFAULT '{}',

  -- Description lisible pour l'UI d'approbation
  action_label VARCHAR(255),   -- ex: "Passer la commande CMD-2026-042 en livraison"
  action_details TEXT,          -- détails supplémentaires pour l'utilisateur

  -- Statut du cycle de vie
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),

  -- Résultat de l'exécution (une fois executed)
  result JSONB,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

-- ============================================================
-- PART 4 : RLS
-- ============================================================

ALTER TABLE neo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE neo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE neo_pending_actions ENABLE ROW LEVEL SECURITY;

-- Conversations : accès par workspace
DROP POLICY IF EXISTS "neo_conversations_select" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_insert" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_update" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_delete" ON neo_conversations;
DROP POLICY IF EXISTS "neo_conversations_service" ON neo_conversations;
DROP POLICY IF EXISTS "neo_messages_select" ON neo_messages;
DROP POLICY IF EXISTS "neo_messages_insert" ON neo_messages;
DROP POLICY IF EXISTS "neo_messages_service" ON neo_messages;
DROP POLICY IF EXISTS "neo_pending_actions_select" ON neo_pending_actions;
DROP POLICY IF EXISTS "neo_pending_actions_update" ON neo_pending_actions;
DROP POLICY IF EXISTS "neo_pending_actions_service" ON neo_pending_actions;

CREATE POLICY "neo_conversations_select" ON neo_conversations
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "neo_conversations_insert" ON neo_conversations
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "neo_conversations_update" ON neo_conversations
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "neo_conversations_delete" ON neo_conversations
  FOR DELETE USING (user_id = auth.uid());

-- Messages : accès via conversation
CREATE POLICY "neo_messages_select" ON neo_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM neo_conversations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "neo_messages_insert" ON neo_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM neo_conversations WHERE user_id = auth.uid()
    )
  );

-- Pending actions : accès par workspace + créateur
CREATE POLICY "neo_pending_actions_select" ON neo_pending_actions
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "neo_pending_actions_update" ON neo_pending_actions
  FOR UPDATE USING (user_id = auth.uid());

-- Service role : accès complet (Edge Functions)
CREATE POLICY "neo_conversations_service" ON neo_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "neo_messages_service" ON neo_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "neo_pending_actions_service" ON neo_pending_actions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- PART 5 : Index
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_neo_conversations_workspace_user
  ON neo_conversations(workspace_id, user_id);

CREATE INDEX IF NOT EXISTS idx_neo_messages_conversation
  ON neo_messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_neo_pending_actions_workspace_status
  ON neo_pending_actions(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_neo_pending_actions_conversation
  ON neo_pending_actions(conversation_id);

-- ============================================================
-- PART 6 : Trigger updated_at sur neo_conversations
-- ============================================================

CREATE OR REPLACE FUNCTION update_neo_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE neo_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_neo_message_updates_conversation
  AFTER INSERT ON neo_messages
  FOR EACH ROW EXECUTE FUNCTION update_neo_conversation_timestamp();
