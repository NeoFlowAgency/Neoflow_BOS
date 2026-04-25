-- sql/v11_001_modules_system.sql
-- Migration V11 Phase 1 : Système de modules activables par workspace

-- Ajouter colonne modules JSONB avec valeurs par défaut (tous actifs pour workspaces existants)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{
    "livraisons": true,
    "ventes_rapides": true,
    "devis": true,
    "stock": true,
    "fournisseurs": true,
    "sav": true,
    "commandes": true
  }'::jsonb;

-- Colonne toggle SMS livreur en route
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_driver_en_route_enabled BOOLEAN NOT NULL DEFAULT false;

-- Template SMS livreur en route
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_driver_en_route TEXT DEFAULT 'Bonjour {prenom}, votre livreur est en route depuis {magasin}. Arrivée estimée : {heure_estimee}.';

-- Template SMS rappel J-1 livraison
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_delivery_reminder TEXT
    DEFAULT 'Bonjour {prenom}, rappel : votre livraison {magasin} est prévue le {date} ({creneau}). À demain !';

-- Colonne pour éviter les doubles envois du SMS rappel J-1
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS sms_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- Cron J-1 à 9h (UTC+2 = 7h UTC) — à activer après déploiement de la RPC send_delivery_reminders()
-- SELECT cron.schedule('delivery-reminders', '0 7 * * *', $$SELECT send_delivery_reminders()$$);
