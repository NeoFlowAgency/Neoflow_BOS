-- Migration v9_012_sav_avoir.sql
-- Ajoute les champs pour le suivi de la génération d'avoir sur les tickets SAV

ALTER TABLE sav_tickets
  ADD COLUMN IF NOT EXISTS avoir_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS avoir_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
