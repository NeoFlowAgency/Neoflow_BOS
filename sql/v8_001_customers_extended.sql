-- =============================================================
-- v8_001 - Ajout colonnes manquantes sur la table customers
-- Corrige l'erreur : "Could not find the 'customer_type' column of 'customers' in the schema cache"
-- À exécuter dans Supabase Dashboard > SQL Editor
-- =============================================================

-- Ajout du type de client (particulier / pro)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'particulier'
    CHECK (customer_type IN ('particulier', 'pro'));

-- Ajout du nom de société (clients professionnels)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Ajout du SIRET (clients professionnels)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS siret TEXT;

-- Rafraîchir le cache du schéma PostgREST pour prendre en compte les nouvelles colonnes
NOTIFY pgrst, 'reload schema';
