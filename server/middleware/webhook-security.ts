/**
 * Webhook Security Middleware
 * Provides signature verification and rate limiting for webhook endpoints
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { storage } from '../storage';

interface WebhookSecurityOptions {
  signatureHeader?: string;
  secretKey?: string;
  algorithm?: string;
  encoding?: BufferEncoding;
  maxAge?: number; // Maximum age of webhook in seconds
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}


const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Verify webhook signature using HMAC
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex');
    

    const receivedSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Rate limiting for webhook endpoints
 */
function checkRateLimit(identifier: string, options: NonNullable<WebhookSecurityOptions['rateLimit']>): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + options.windowMs
    });
    return true;
  }
  
  if (record.count < options.maxRequests) {
    record.count++;
    return true;
  }
  
  return false;
}

/**
 * Generic webhook security middleware
 */
export function createWebhookSecurityMiddleware(options: WebhookSecurityOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        signatureHeader = 'x-hub-signature-256',
        algorithm = 'sha256',
        maxAge = 300, // 5 minutes
        rateLimit
      } = options;


      if (rateLimit) {
        const identifier = req.ip || 'unknown';
        if (!checkRateLimit(identifier, rateLimit)) {
          console.warn(`Webhook rate limit exceeded for IP: ${identifier}`);
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
      }


      const timestamp = req.headers['x-timestamp'] as string;
      if (timestamp) {
        const webhookTime = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (Math.abs(currentTime - webhookTime) > maxAge) {
          console.warn('Webhook timestamp too old or invalid');
          return res.status(400).json({ error: 'Webhook timestamp invalid' });
        }
      }


      if (options.secretKey) {
        const signature = req.headers[signatureHeader] as string;
        
        if (!signature) {
          console.warn('Missing webhook signature');
          return res.status(401).json({ error: 'Missing signature' });
        }

        const payload = req.body;
        const isValid = verifyWebhookSignature(payload, signature, options.secretKey, algorithm);
        
        if (!isValid) {
          console.warn('Invalid webhook signature');
          return res.status(403).json({ error: 'Invalid signature' });
        }
      }

      next();
    } catch (error) {
      console.error('Webhook security middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * TikTok specific webhook security middleware
 */
export function createTikTokWebhookSecurity() {
  return createWebhookSecurityMiddleware({
    signatureHeader: 'x-tiktok-signature',
    rateLimit: {
      windowMs: 1000, // 1 second
      maxRequests: 10 // 10 requests per second per IP (matches TikTok rate limit)
    }
  });
}

/**
 * WhatsApp Business API webhook security middleware
 */
export function createWhatsAppWebhookSecurity() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {

      const identifier = req.ip || 'unknown';
      if (!checkRateLimit(identifier, { windowMs: 60 * 1000, maxRequests: 200 })) {
        console.warn(`WhatsApp webhook rate limit exceeded for IP: ${identifier}`);
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }



      next();
    } catch (error) {
      console.error('WhatsApp webhook security middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Verify WhatsApp webhook signature with connection-specific secret
 */
export async function verifyWhatsAppWebhookSignature(
  req: Request,
  phoneNumberId: string
): Promise<{ isValid: boolean; connection?: any }> {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    
    if (!signature) {
      return { isValid: false };
    }


    const connections = await storage.getChannelConnections(null);
    const connection = connections.find((conn: any) => {
      const data = conn.connectionData as any;
      return data?.phoneNumberId === phoneNumberId || data?.phoneNumber === phoneNumberId;
    });

    if (!connection) {
      console.warn(`No connection found for phone number ID: ${phoneNumberId}`);
      return { isValid: false };
    }

    const connectionData = connection.connectionData as any;
    const appSecret = connectionData?.appSecret;

    if (!appSecret) {
      console.warn(`No app secret configured for connection: ${connection.id}`);
      return { isValid: true, connection }; // Allow if no secret configured
    }

    const payload = req.body;
    const isValid = verifyWebhookSignature(payload, signature, appSecret);

    return { isValid, connection };
  } catch (error) {
    console.error('Error verifying WhatsApp webhook signature:', error);
    return { isValid: false };
  }
}

/**
 * Enhanced logging for webhook security events
 */
export function logWebhookSecurityEvent(
  event: 'signature_verified' | 'signature_failed' | 'rate_limited' | 'timestamp_invalid' | 'verification_success' | 'verification_failed' | 'signature_verification_failed',
  details: {
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    connectionId?: number;
    error?: string;
    reason?: string;
  }
) {
  const logData = {
    timestamp: new Date().toISOString(),
    event,
    ...details
  };

  switch (event) {
    case 'signature_verified':

      break;
    case 'signature_failed':
      console.warn('❌ Webhook signature verification failed:', logData);
      break;
    case 'rate_limited':
      console.warn('⚠️ Webhook rate limited:', logData);
      break;
    case 'timestamp_invalid':
      console.warn('⏰ Webhook timestamp invalid:', logData);
      break;
  }
}

/**
 * Clean up old rate limit entries
 */
export function cleanupRateLimitStore() {
  const now = Date.now();
  const keysToDelete: string[] = [];

  rateLimitStore.forEach((record, key) => {
    if (now > record.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => {
    rateLimitStore.delete(key);
  });
}


setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
