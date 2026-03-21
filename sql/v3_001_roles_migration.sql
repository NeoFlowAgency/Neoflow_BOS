-- ============================================================
-- NeoFlow BOS V3 - Migration 001: Roles (owner/manager/member)
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. D'abord supprimer la contrainte existante pour pouvoir modifier les roles
ALTER TABLE workspace_users DROP CONSTRAINT IF EXISTS workspace_users_role_check;

-- 2. Convertir le premier membre de chaque workspace en 'owner'
-- Le createur est l'utilisateur avec le created_at le plus ancien
UPDATE workspace_users wu
SET role = 'owner'
FROM (
  SELECT DISTINCT ON (workspace_id) workspace_id, user_id
  FROM workspace_users
  ORDER BY workspace_id, created_at ASC
) AS first_users
WHERE wu.workspace_id = first_users.workspace_id
  AND wu.user_id = first_users.user_id;

-- 3. Convertir les 'admin' restants en 'manager'
UPDATE workspace_users SET role = 'manager' WHERE role = 'admin';

-- 4. Ajouter la nouvelle contrainte CHECK : owner/manager/member
ALTER TABLE workspace_users ADD CONSTRAINT workspace_users_role_check
  CHECK (role IN ('owner', 'manager', 'member'));
