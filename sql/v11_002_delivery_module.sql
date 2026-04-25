-- sql/v11_002_delivery_module.sql
-- Migration V11 Phase 2 : Tables du module livraison

-- ── Véhicules ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity_items  INT DEFAULT 10,
  available       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE delivery_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_vehicles: workspace members"
  ON delivery_vehicles FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

-- ── Positions GPS livreurs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_driver_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  driver_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  heading      FLOAT DEFAULT 0,
  is_moving    BOOLEAN DEFAULT false,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_time
  ON delivery_driver_locations (driver_id, recorded_at DESC);

ALTER TABLE delivery_driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_locations: workspace members"
  ON delivery_driver_locations FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

-- Activer Realtime sur cette table
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_driver_locations;

-- ── Enrichissement table deliveries ──────────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS execution_type       TEXT NOT NULL DEFAULT 'internal'
                                                  CHECK (execution_type IN ('internal', 'provider')),
  ADD COLUMN IF NOT EXISTS vehicle_id           UUID REFERENCES delivery_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_location      TEXT DEFAULT 'store'
                                                  CHECK (pickup_location IN ('store', 'depot')),
  ADD COLUMN IF NOT EXISTS driver_notes         TEXT,
  ADD COLUMN IF NOT EXISTS proof_photo_url      TEXT,
  ADD COLUMN IF NOT EXISTS signature_url        TEXT,
  ADD COLUMN IF NOT EXISTS signature_obtained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS problem_type         TEXT
                                                  CHECK (problem_type IN ('absent', 'damaged', 'refused', 'other')),
  ADD COLUMN IF NOT EXISTS problem_description  TEXT,
  ADD COLUMN IF NOT EXISTS problem_reported_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at_client_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_review_sent      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_en_route_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_lat         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng         DOUBLE PRECISION;

-- Normaliser les valeurs de status existantes
-- Valeurs valides : a_planifier, planifiee, en_route, chez_client, livree, probleme
UPDATE deliveries SET status = 'en_route'    WHERE status = 'en_cours';
UPDATE deliveries SET status = 'a_planifier' WHERE status IS NULL;
