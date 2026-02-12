-- Update super admin email if already created
-- This migration ensures the super admin email is updated to admin@bot.com

BEGIN;

DO $$
BEGIN
  -- Update the super admin user email if it exists
  UPDATE users
  SET 
    email = 'admin@bot.com',
    updated_at = NOW()
  WHERE 
    username = 'superadmin' 
    AND is_super_admin = TRUE
    AND email != 'admin@bot.com';
    
  IF FOUND THEN
    RAISE NOTICE 'Super admin email updated to admin@bot.com';
  ELSE
    RAISE NOTICE 'Super admin email already set or user not found';
  END IF;
END$$;

COMMIT;
