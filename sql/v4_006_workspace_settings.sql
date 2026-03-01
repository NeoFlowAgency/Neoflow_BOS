-- Migration v4_006_workspace_settings.sql
-- Settings JSON + infos situation magasin (step 4 onboarding)

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_settings JSONB DEFAULT '{}';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS nb_employes INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ca_annuel_estime NUMERIC(12,2);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS surface_magasin INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS specialite TEXT;
