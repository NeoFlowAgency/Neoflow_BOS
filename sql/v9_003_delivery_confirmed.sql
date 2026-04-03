-- Migration v9_003_delivery_confirmed.sql
-- Ajoute la colonne delivery_confirmed sur orders
-- Une commande n'est "terminée" que si :
--   1. Elle est payée à 100%
--   2. ET le client a reçu ses produits (livraison confirmée, retrait confirmé, ou vente directe)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed_by UUID REFERENCES auth.users(id);
