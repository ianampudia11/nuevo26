import { Request, Response } from 'express';
import { storage } from '../storage';

const EMERGENCY_SECRET = 'ianampudia11';
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>();

/**
 * Rate limiting for emergency reset attempts
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record) {
    rateLimitStore.set(ip, { attempts: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (now > record.resetTime) {
    rateLimitStore.set(ip, { attempts: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.attempts < MAX_ATTEMPTS) {
    record.attempts++;
    return true;
  }

  return false;
}

/**
 * Get remaining time for rate limit
 */
function getRateLimitReset(ip: string): number {
  const record = rateLimitStore.get(ip);
  if (!record) return 0;
  
  const now = Date.now();
  return Math.max(0, Math.ceil((record.resetTime - now) / 1000 / 60));
}

/**
 * Generate HTML for the secret password form
 */
function generateSecretForm(error?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Emergency Admin Access</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            margin: 0 0 10px 0;
            font-size: 24px;
        }
        .header p {
            color: #666;
            margin: 0;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .btn:hover {
            background: #5a6fd8;
        }
        .error {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #fcc;
        }
        .warning {
            background: #fff3cd;
            color: #856404;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #ffeaa7;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 Emergency Admin Access</h1>
            <p>This is a secure emergency recovery system</p>
        </div>
        
        <div class="warning">
            ⚠️ This endpoint is for emergency use only when normal password reset is unavailable.
        </div>
        
        ${error ? `<div class="error">${error}</div>` : ''}
        
        <form method="POST">
            <div class="form-group">
                <label for="secret">Emergency Access Code</label>
                <input type="password" id="secret" name="secret" required 
                       placeholder="Enter emergency access code" autocomplete="off">
            </div>
            <button type="submit" class="btn">Verify Access</button>
        </form>
    </div>
</body>
</html>`;
}

/**
 * Generate HTML for the password reset form
 */
function generateResetForm(error?: string, success?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Emergency Password Reset</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            margin: 0 0 10px 0;
            font-size: 24px;
        }
        .header p {
            color: #666;
            margin: 0;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e5e9;
            border-radius: 6px;
            font-size: 16px;
            transition: border-color 0.3s;
            box-sizing: border-box;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .btn:hover {
            background: #5a6fd8;
        }
        .btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .error {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #fcc;
        }
        .success {
            background: #d4edda;
            color: #155724;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #c3e6cb;
        }
        .info {
            background: #d1ecf1;
            color: #0c5460;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid #bee5eb;
            font-size: 14px;
        }
        .password-requirements {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Reset Superadmin Password</h1>
            <p>Set a new password for the superadmin account</p>
        </div>
        
        <div class="info">
            ℹ️ This will reset the password for the first superadmin user found in the system.
        </div>
        
        ${error ? `<div class="error">${error}</div>` : ''}
        ${success ? `<div class="success">${success}</div>` : ''}
        
        <form method="POST" onsubmit="return validateForm()">
            <input type="hidden" name="action" value="reset">
            
            <div class="form-group">
                <label for="newPassword">New Password</label>
                <input type="password" id="newPassword" name="newPassword" required 
                       placeholder="Enter new password" minlength="6">
                <div class="password-requirements">
                    Minimum 6 characters required
                </div>
            </div>
            
            <div class="form-group">
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" name="confirmPassword" required 
                       placeholder="Confirm new password" minlength="6">
            </div>
            
            <button type="submit" class="btn" id="submitBtn">Reset Password</button>
        </form>
    </div>
    
    <script>
        function validateForm() {
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const submitBtn = document.getElementById('submitBtn');
            
            if (newPassword.length < 6) {
                alert('Password must be at least 6 characters long');
                return false;
            }
            
            if (newPassword !== confirmPassword) {
                alert('Passwords do not match');
                return false;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Resetting...';
            return true;
        }
    </script>
</body>
</html>`;
}

/**
 * Handle emergency admin reset requests
 */
export async function handleEmergencyReset(req: Request, res: Response): Promise<void> {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  try {
    if (req.method === 'GET') {
      const html = generateSecretForm();
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
      return;
    }

    if (req.method === 'POST') {
      if (!checkRateLimit(clientIp)) {
        const resetMinutes = getRateLimitReset(clientIp);
        const html = generateSecretForm(
          `Too many attempts. Please wait ${resetMinutes} minutes before trying again.`
        );
        res.status(429).setHeader('Content-Type', 'text/html').send(html);
        return;
      }

      const { secret, action, newPassword, confirmPassword } = req.body;

      if (!action) {
        if (secret !== EMERGENCY_SECRET) {
          const html = generateSecretForm('Invalid emergency access code. Please try again.');
          res.status(401).setHeader('Content-Type', 'text/html').send(html);
          return;
        }

        const html = generateResetForm();
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }

      if (action === 'reset') {
        if (!newPassword || !confirmPassword) {
          const html = generateResetForm('Please fill in all fields.');
          res.status(400).setHeader('Content-Type', 'text/html').send(html);
          return;
        }

        if (newPassword.length < 6) {
          const html = generateResetForm('Password must be at least 6 characters long.');
          res.status(400).setHeader('Content-Type', 'text/html').send(html);
          return;
        }

        if (newPassword !== confirmPassword) {
          const html = generateResetForm('Passwords do not match.');
          res.status(400).setHeader('Content-Type', 'text/html').send(html);
          return;
        }

        const superAdmins = await storage.getAllUsers();
        const superAdmin = superAdmins.find(user => user.isSuperAdmin);

        if (!superAdmin) {
          const html = generateResetForm('No superadmin user found in the system.');
          res.status(404).setHeader('Content-Type', 'text/html').send(html);
          return;
        }

        const success = await storage.updateUserPassword(superAdmin.id, newPassword);

        if (!success) {
          const html = generateResetForm('Failed to update password. Please try again.');
          res.status(500).setHeader('Content-Type', 'text/html').send(html);
          return;
        }


        const html = generateResetForm(
          undefined,
          `Password successfully reset for superadmin: ${superAdmin.email}. You can now log in with your new password.`
        );
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Emergency reset error:', error);
    const html = generateResetForm('An internal error occurred. Please try again.');
    res.status(500).setHeader('Content-Type', 'text/html').send(html);
  }
}
