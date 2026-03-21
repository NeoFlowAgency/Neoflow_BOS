-- Migration v4_001_onboarding.sql
-- Colonnes tutorial et survey sur profiles

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutorial_shown_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_survey JSONB DEFAULT '{}';
