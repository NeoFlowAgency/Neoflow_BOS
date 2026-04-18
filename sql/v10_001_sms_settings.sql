-- ============================================================
-- NeoFlow BOS V10 - Migration 001: Paramètres SMS Brevo
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Champs SMS + Google Reviews sur la table workspaces
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_api_key        TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_name    VARCHAR(11) DEFAULT 'NeoFlow',
  ADD COLUMN IF NOT EXISTS google_review_link TEXT;

-- 2. Champ template SMS confirmation commande
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_order_confirm TEXT
    DEFAULT 'Bonjour {prenom}, votre commande {numero} a bien été enregistrée. Nous vous contacterons pour planifier la livraison. — {magasin}';

-- 3. Champ template SMS rappel livraison J-1
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_delivery_reminder TEXT
    DEFAULT 'Bonjour {prenom}, votre livraison est prévue demain {date} entre {creneau}. — {magasin}';

-- 4. Champ template SMS post-livraison avec lien avis
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_post_delivery TEXT
    DEFAULT 'Bonjour {prenom}, merci pour votre confiance ! Votre avis nous aide : {lien_avis} — {magasin}';
