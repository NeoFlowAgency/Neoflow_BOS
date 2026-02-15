-- ============================================================
-- V3 Migration 005: Cron Jobs (pg_cron)
-- ============================================================
-- PREREQUIS: Activer l'extension pg_cron dans Supabase Dashboard
-- Database > Extensions > pg_cron > Enable
--
-- IMPORTANT: N'executez ce script QU'APRES avoir active pg_cron.
-- Si pg_cron n'est pas disponible sur votre plan Supabase,
-- ces taches peuvent etre executees manuellement ou via
-- un cron externe (n8n, GitHub Actions, etc.)
-- ============================================================

-- Verifier si pg_cron est disponible avant d'executer
-- NOTE: On utilise $body$ pour le bloc DO et $$ pour les requetes cron
-- afin d'eviter les conflits de delimiteurs
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- 1. Suspension auto des workspaces en retard de paiement
    PERFORM cron.schedule(
      'check-grace-periods',
      '0 */6 * * *',
      $$UPDATE workspaces SET is_active = false, subscription_status = 'unpaid' WHERE subscription_status = 'past_due' AND grace_period_until IS NOT NULL AND grace_period_until < NOW() AND is_active = true$$
    );

    -- 2. Nettoyage des workspaces incomplets (checkout abandonne)
    PERFORM cron.schedule(
      'cleanup-incomplete-workspaces',
      '0 4 * * *',
      $$DELETE FROM workspace_users WHERE workspace_id IN (SELECT id FROM workspaces WHERE subscription_status = 'incomplete' AND created_at < NOW() - INTERVAL '24 hours'); DELETE FROM workspaces WHERE subscription_status = 'incomplete' AND created_at < NOW() - INTERVAL '24 hours'$$
    );

    -- 3. Nettoyage des invitations expirees
    PERFORM cron.schedule(
      'cleanup-expired-invitations',
      '0 3 * * *',
      $$DELETE FROM workspace_invitations WHERE used_at IS NULL AND expires_at < NOW() - INTERVAL '30 days'$$
    );

    RAISE NOTICE 'pg_cron jobs programmes avec succes';
  ELSE
    RAISE NOTICE 'pg_cron non disponible - les jobs cron n''ont pas ete programmes. Activez pg_cron dans Database > Extensions ou utilisez un cron externe.';
  END IF;
END $body$;

-- ============================================================
-- Pour verifier les jobs programmes :
-- SELECT * FROM cron.job;
--
-- Pour desactiver un job :
-- SELECT cron.unschedule('check-grace-periods');
--
-- ALTERNATIVE SANS pg_cron :
-- Executez manuellement ces requetes ou configurez un cron
-- externe (n8n, GitHub Actions) qui appelle ces SQL via
-- l'API Supabase ou une Edge Function dediee.
--
-- Requete suspension :
-- UPDATE workspaces SET is_active = false, subscription_status = 'unpaid'
-- WHERE subscription_status = 'past_due' AND grace_period_until IS NOT NULL
--   AND grace_period_until < NOW() AND is_active = true;
--
-- Requete cleanup incomplete :
-- DELETE FROM workspace_users WHERE workspace_id IN (
--   SELECT id FROM workspaces WHERE subscription_status = 'incomplete'
--     AND created_at < NOW() - INTERVAL '24 hours');
-- DELETE FROM workspaces WHERE subscription_status = 'incomplete'
--   AND created_at < NOW() - INTERVAL '24 hours';
--
-- Requete cleanup invitations :
-- DELETE FROM workspace_invitations WHERE used_at IS NULL
--   AND expires_at < NOW() - INTERVAL '30 days';
-- ============================================================
