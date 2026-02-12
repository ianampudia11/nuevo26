-- FORCE Recreate Super Admin
-- This migration deletes any conflicting user and recreates the super admin from scratch
-- to ensure it exists with the correct credentials.

BEGIN;

-- 1. Ensure Company Exists
INSERT INTO companies (
  name,
  slug,
  active,
  plan,
  max_users,
  primary_color,
  subscription_status,
  subscription_start_date
) VALUES (
  'Compania1',
  'compania1',
  TRUE,
  'free',
  50,
  '#363636',
  'active',
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Get Company ID
DO $$
DECLARE
  v_company_id INTEGER;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'compania1';

  -- 3. Delete existing super admin users to avoid conflicts/corruption
  DELETE FROM users WHERE username = 'superadmin';
  DELETE FROM users WHERE email = 'admin@bot.com';
  DELETE FROM users WHERE email = 'admin@ianampudia.com';

  -- 4. Re-create the User
  -- Password: admin123 (scrypt hash: 8172229941d7167cc321880bccf1349e4c7c076891c3ad1d11009ff05a90be83b93971cf7883cf3333ad7f8c0d75adb2cc8ba33034d98bbe863637c530f0d951.1c4961529d604fd3cc01e7ae68b1a30d)
  INSERT INTO users (
    username,
    password,
    full_name,
    email,
    role,
    company_id,
    is_super_admin,
    active,
    language_preference,
    created_at,
    updated_at
  ) VALUES (
    'superadmin',
    '8172229941d7167cc321880bccf1349e4c7c076891c3ad1d11009ff05a90be83b93971cf7883cf3333ad7f8c0d75adb2cc8ba33034d98bbe863637c530f0d951.1c4961529d604fd3cc01e7ae68b1a30d',
    'Super Administrator',
    'admin@bot.com',
    'super_admin',
    v_company_id,
    TRUE,
    TRUE,
    'es',
    NOW(),
    NOW()
  );

  RAISE NOTICE '✅ Super admin user forcefully recreated with admin@bot.com';
END$$;

COMMIT;
