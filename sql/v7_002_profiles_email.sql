-- Migration v7_002 : ajout email dans profiles pour identification des membres

-- 1. Ajouter la colonne email
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Remplir les emails existants depuis auth.users
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- 3. Mettre à jour le trigger pour stocker l'email à la création
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
