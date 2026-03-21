-- Migration v4_005_payments_fix.sql
-- Fix: relier payments.received_by → profiles(id) pour que PostgREST
-- puisse résoudre la jointure profiles!received_by

-- IMPORTANT : Vérifier d'abord qu'il n'y a pas de received_by orphelins :
-- SELECT received_by FROM payments WHERE received_by NOT IN (SELECT id FROM profiles);
-- Si des lignes apparaissent, mettre à NULL avant de continuer :
-- UPDATE payments SET received_by = NULL WHERE received_by NOT IN (SELECT id FROM profiles);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_received_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_received_by_profiles_fk
  FOREIGN KEY (received_by) REFERENCES profiles(id) ON DELETE SET NULL;
