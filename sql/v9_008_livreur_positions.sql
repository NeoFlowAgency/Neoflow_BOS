-- v9_008_livreur_positions.sql
-- Table de tracking GPS des livreurs (Phase 5 — Refonte livraisons)

-- ============================================================
-- TABLE: livreur_positions
-- Stocke la dernière position GPS de chaque livreur
-- Mise à jour toutes les 30s depuis l'app livreur
-- ============================================================
CREATE TABLE IF NOT EXISTS livreur_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy FLOAT,
  heading FLOAT,        -- direction de déplacement (degrés, 0=Nord)
  speed FLOAT,          -- vitesse en m/s
  is_tracking BOOLEAN DEFAULT TRUE,  -- livreur peut désactiver le tracking
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, workspace_id)     -- une seule position par livreur par workspace
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_livreur_positions_workspace ON livreur_positions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_livreur_positions_updated ON livreur_positions(updated_at);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE livreur_positions ENABLE ROW LEVEL SECURITY;

-- Le livreur peut voir/modifier sa propre position
CREATE POLICY "livreur_positions_own_select" ON livreur_positions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "livreur_positions_own_insert" ON livreur_positions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "livreur_positions_own_update" ON livreur_positions
  FOR UPDATE USING (auth.uid() = user_id);

-- Les managers/propriétaires voient les positions de leur workspace
CREATE POLICY "livreur_positions_managers_select" ON livreur_positions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workspace_users wu
      WHERE wu.workspace_id = livreur_positions.workspace_id
        AND wu.user_id = auth.uid()
        AND wu.role IN ('proprietaire', 'manager')
    )
  );

-- Service role pour les Edge Functions
CREATE POLICY "livreur_positions_service_role" ON livreur_positions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- FONCTION: upsert_livreur_position
-- Insère ou met à jour la position GPS du livreur
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_livreur_position(
  p_user_id UUID,
  p_workspace_id UUID,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy FLOAT DEFAULT NULL,
  p_heading FLOAT DEFAULT NULL,
  p_speed FLOAT DEFAULT NULL,
  p_is_tracking BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO livreur_positions (user_id, workspace_id, lat, lng, accuracy, heading, speed, is_tracking, updated_at)
  VALUES (p_user_id, p_workspace_id, p_lat, p_lng, p_accuracy, p_heading, p_speed, p_is_tracking, NOW())
  ON CONFLICT (user_id, workspace_id)
  DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    accuracy = EXCLUDED.accuracy,
    heading = EXCLUDED.heading,
    speed = EXCLUDED.speed,
    is_tracking = EXCLUDED.is_tracking,
    updated_at = NOW();
END;
$$;
