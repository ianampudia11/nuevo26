-- Migration to create initial super admin and company
-- WARNING: This migration needs the password hash to be generated first
-- Run: node scripts/create-super-admin.js
-- Then apply this migration

BEGIN;

-- Create the initial company
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

-- Get the company ID
DO $$
DECLARE
  v_company_id INTEGER;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'compania1';
  
  IF v_company_id IS NOT NULL THEN
    -- Create the super admin user
    -- Password will be: admin123
    INSERT INTO users (
      username,
      password,
      full_name,
      email,
      role,
      company_id,
      is_super_admin,
      active,
      language_preference
    ) VALUES (
      'superadmin',
      '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash for "admin123"
      'Super Administrator',
      'admin@ianampudia.com',
      'super_admin',
      v_company_id,
      TRUE,
      TRUE,
      'es'
    )
    ON CONFLICT (username) DO NOTHING;
    
    -- Create default role permissions
    INSERT INTO role_permissions (company_id, role, permissions)
    VALUES 
      (v_company_id, 'admin', '{}'::jsonb),
      (v_company_id, 'agent', '{}'::jsonb)
    ON CONFLICT (company_id, role) DO NOTHING;
    
    RAISE NOTICE '=== Super Admin Setup Complete ===';
    RAISE NOTICE 'Login URL: https://cr.ianampudia.com/admin';
    RAISE NOTICE 'Email: admin@ianampudia.com';
    RAISE NOTICE 'Username: superadmin';
    RAISE NOTICE 'Password: admin123';
    RAISE NOTICE 'Company: Compania1';
  END IF;
END$$;

COMMIT;
