-- Emergency fix: Update super admin email and verify credentials
-- Run this migration to fix login issue

BEGIN;

-- Show current super admin details
DO $$
DECLARE
  v_email TEXT;
  v_username TEXT;
  v_company_id INTEGER;
BEGIN
  SELECT email, username, company_id 
  INTO v_email, v_username, v_company_id
  FROM users 
  WHERE is_super_admin = TRUE 
  LIMIT 1;
  
  IF FOUND THEN
    RAISE NOTICE 'Current super admin found:';
    RAISE NOTICE '  Email: %', v_email;
    RAISE NOTICE '  Username: %', v_username;
    RAISE NOTICE '  Company ID: %', v_company_id;
  ELSE
    RAISE NOTICE 'No super admin user found!';
  END IF;
END$$;

-- Update email to admin@bot.com
UPDATE users
SET 
  email = 'admin@bot.com',
  updated_at = NOW()
WHERE 
  is_super_admin = TRUE;

-- Verify the update
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM users 
  WHERE is_super_admin = TRUE AND email = 'admin@bot.com';
  
  IF v_count > 0 THEN
    RAISE NOTICE '✅ Super admin email updated successfully to admin@bot.com';
  ELSE
    RAISE WARNING '⚠️  Failed to update super admin email';
  END IF;
END$$;

COMMIT;

-- Display final credentials
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════';
  RAISE NOTICE 'Super Admin Login Credentials:';
  RAISE NOTICE '  URL: https://cr.ianampudia.com/admin';
  RAISE NOTICE '  Email: admin@bot.com';
  RAISE NOTICE '  Username: superadmin';
  RAISE NOTICE '  Password: admin123';
  RAISE NOTICE '═══════════════════════════════════════';
END$$;
