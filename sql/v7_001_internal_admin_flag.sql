-- v7_001: Set is_internal_admin flag in app_metadata for internal users
-- app_metadata is only settable server-side (not from client SDK), so it's secure
-- Run this in Supabase SQL Editor

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"is_internal_admin": true}'::jsonb
WHERE email IN ('neoflowagency05@gmail.com', 'gnoakim05@gmail.com');
