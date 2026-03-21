-- Migration v4_004_deliveries_timeslots.sql
-- Créneaux multiples (JSONB) sur les livraisons

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS time_slots JSONB DEFAULT '[]';
