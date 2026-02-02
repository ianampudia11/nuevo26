import crypto from 'crypto';

/**
 * Generate a secure webhook verify token
 * @param length - Length of the token (default: 32)
 * @returns Alphanumeric string token
 */
export function generateWebhookVerifyToken(length: number = 32): string {
  const bytes = crypto.randomBytes(length);

  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let token = '';
  
  for (let i = 0; i < bytes.length; i++) {
    token += chars[bytes[i] % chars.length];
  }
  
  return token;
}

/**
 * Generate a secure webhook secret for signature verification
 * @param length - Length of the secret (default: 64)
 * @returns Hexadecimal string secret
 */
export function generateWebhookSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate token format and strength
 * @param token - Token to validate
 * @param minLength - Minimum length required (default: 16)
 * @returns Validation result with isValid flag and error message if invalid
 */
export function validateWebhookToken(token: string, minLength: number = 16): { isValid: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Token must be a non-empty string' };
  }
  
  if (token.length < minLength) {
    return { isValid: false, error: `Token must be at least ${minLength} characters long` };
  }
  

  const hasLower = /[a-z]/.test(token);
  const hasUpper = /[A-Z]/.test(token);
  const hasNumber = /[0-9]/.test(token);
  const hasSpecial = /[^a-zA-Z0-9]/.test(token);
  
  const charTypes = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
  
  if (charTypes < 2) {
    return { isValid: false, error: 'Token should contain at least 2 different character types (lowercase, uppercase, numbers, special)' };
  }
  
  return { isValid: true };
}

