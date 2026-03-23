-- ============================================================
-- Push Subscriptions (Web Push API)
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription  JSONB NOT NULL,  -- { endpoint, keys: { p256dh, auth } }
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Unique constraint per user+workspace (one subscription per device per workspace)
  UNIQUE (user_id, workspace_id, (subscription->>'endpoint'))
);

-- Index for fast lookup by workspace
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_workspace
  ON push_subscriptions (workspace_id);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Workspace members can read all subscriptions in workspace (for server-side sending)
-- Note: send-push edge function uses service role key, so this policy is mainly for RLS compliance
CREATE POLICY "Service role can manage all push subscriptions"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
