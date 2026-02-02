import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import crypto from 'crypto';
import { ApiKey } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiKeyId?: number;
      companyId?: number;
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Generate a secure API key
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = crypto.randomBytes(32).toString('hex');
  
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  
  const prefix = key.substring(0, 8);
  
  return { key: `pcp_${key}`, hash, prefix };
}

/**
 * Hash an API key for comparison
 */
export function hashApiKey(key: string): string {
  const cleanKey = key.startsWith('pcp_') ? key.substring(4) : key;
  return crypto.createHash('sha256').update(cleanKey).digest('hex');
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^pcp_[a-f0-9]{64}$/.test(key);
}

/**
 * API Authentication Middleware
 */
export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    req.requestId = crypto.randomUUID();
    req.startTime = Date.now();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'API_KEY_MISSING',
        message: 'API key is required. Include it in the Authorization header as "Bearer YOUR_API_KEY"'
      });
    }

    const apiKey = authHeader.substring(7);

    if (!isValidApiKeyFormat(apiKey)) {
      return res.status(401).json({
        error: 'API_KEY_INVALID_FORMAT',
        message: 'Invalid API key format'
      });
    }

    const keyHash = hashApiKey(apiKey);

    const apiKeyRecord = await storage.getApiKeyByHash(keyHash);
    if (!apiKeyRecord) {
      return res.status(401).json({
        error: 'API_KEY_NOT_FOUND',
        message: 'Invalid API key'
      });
    }

    if (!apiKeyRecord.isActive) {
      return res.status(401).json({
        error: 'API_KEY_INACTIVE',
        message: 'API key is inactive'
      });
    }

    if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
      return res.status(401).json({
        error: 'API_KEY_EXPIRED',
        message: 'API key has expired'
      });
    }

    if (apiKeyRecord.allowedIps && Array.isArray(apiKeyRecord.allowedIps) && apiKeyRecord.allowedIps.length > 0) {
      const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] as string;
      const allowedIps = apiKeyRecord.allowedIps as string[];
      
      if (!allowedIps.includes(clientIp)) {
        return res.status(403).json({
          error: 'IP_NOT_ALLOWED',
          message: 'Your IP address is not allowed to use this API key'
        });
      }
    }

    req.apiKey = apiKeyRecord;
    req.apiKeyId = apiKeyRecord.id;
    req.companyId = apiKeyRecord.companyId;

    storage.updateApiKeyLastUsed(apiKeyRecord.id).catch(error => {
      console.error('Error updating API key last used:', error);
    });

    next();
  } catch (error) {
    console.error('Error in API authentication middleware:', error);
    res.status(500).json({
      error: 'AUTHENTICATION_ERROR',
      message: 'Internal authentication error'
    });
  }
}

/**
 * Check API permissions with hierarchical support
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required'
      });
    }

    const permissions = req.apiKey.permissions as string[] || [];
    

    if (permissions.includes('*')) {
      return next();
    }
    

    if (permissions.includes(permission)) {
      return next();
    }
    

    const permissionParts = permission.split(':');
    if (permissionParts.length >= 2) {
      const wildcardPermission = `${permissionParts[0]}:*`;
      if (permissions.includes(wildcardPermission)) {
        return next();
      }
    }
    

    const permissionMappings: Record<string, string[]> = {
      'messages:send:batch': ['messages:send', 'messages:*'],
      'messages:send:template': ['messages:send', 'messages:*'],
      'messages:send:interactive': ['messages:send', 'messages:*'],
      'conversations:read': ['conversations:*'],
      'contacts:read': ['contacts:*']
    };
    
    const allowedAlternatives = permissionMappings[permission] || [];
    if (allowedAlternatives.some(alt => permissions.includes(alt))) {
      return next();
    }
    
    return res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: `Permission '${permission}' is required for this operation`
    });
  };
}

/**
 * Rate limiting middleware
 */
export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {

    if (req.path.startsWith('/api/webchat/')) {
      return next();
    }

    if (!req.apiKey || !req.apiKeyId) {
      return next();
    }

    const now = new Date();
    const apiKey = req.apiKey;

    const checks = [
      { 
        window: 'minute', 
        limit: apiKey.rateLimitPerMinute || 60,
        windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
      },
      { 
        window: 'hour', 
        limit: apiKey.rateLimitPerHour || 1000,
        windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
      },
      { 
        window: 'day', 
        limit: apiKey.rateLimitPerDay || 10000,
        windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate())
      }
    ];

    for (const check of checks) {
      const rateLimit = await storage.getRateLimit(req.apiKeyId, check.window, check.windowStart);
      
      if (rateLimit && rateLimit.requestCount >= check.limit) {
        const resetTime = new Date(check.windowStart);
        if (check.window === 'minute') resetTime.setMinutes(resetTime.getMinutes() + 1);
        else if (check.window === 'hour') resetTime.setHours(resetTime.getHours() + 1);
        else if (check.window === 'day') resetTime.setDate(resetTime.getDate() + 1);


        res.setHeader('X-RateLimit-Limit', check.limit.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());
        
        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded for ${check.window}. Limit: ${check.limit} requests per ${check.window}`,
          retryAfter: Math.ceil((resetTime.getTime() - now.getTime()) / 1000),
          limit: check.limit,
          window: check.window,
          resetTime: resetTime.toISOString()
        });
      }
    }

    for (const check of checks) {
      await storage.createOrUpdateRateLimit({
        apiKeyId: req.apiKeyId,
        windowType: check.window,
        windowStart: check.windowStart,
        requestCount: 0
      });
    }


    const currentRateLimit = await storage.getRateLimit(req.apiKeyId, 'minute', checks[0].windowStart);
    const remaining = currentRateLimit ? Math.max(0, checks[0].limit - currentRateLimit.requestCount) : checks[0].limit;
    const resetTime = new Date(checks[0].windowStart);
    resetTime.setMinutes(resetTime.getMinutes() + 1);
    
    res.setHeader('X-RateLimit-Limit', checks[0].limit.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime.getTime() / 1000).toString());

    next();
  } catch (error) {
    console.error('Error in rate limiting middleware:', error);
    next();
  }
}

/**
 * API usage logging middleware
 */
export function logApiUsage(req: Request, res: Response, next: NextFunction) {
  if (!req.apiKeyId || !req.companyId || !req.requestId || !req.startTime) {
    return next();
  }

  const originalEnd = res.end;
  let responseSize = 0;

  const originalWrite = res.write;
  res.write = function(chunk: any, encoding?: BufferEncoding | ((error: Error | null | undefined) => void), cb?: (error: Error | null | undefined) => void) {
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }
    return originalWrite.call(this, chunk, encoding as any, cb);
  };

  res.end = function(...args: any[]) {
    const [chunk] = args;
    if (chunk) {
      responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    }

    const duration = Date.now() - req.startTime!;
    const requestSize = parseInt(req.headers['content-length'] as string) || 0;

    storage.createApiUsage({
      apiKeyId: req.apiKeyId!,
      companyId: req.companyId!,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      requestSize,
      responseSize,
      duration,
      ipAddress: req.ip || req.socket.remoteAddress as string,
      userAgent: req.headers['user-agent'] || '',
      requestId: req.requestId!,
      errorMessage: res.statusCode >= 400 ? res.statusMessage : undefined,
      metadata: {
        query: req.query,
        params: req.params
      }
    }).catch(error => {
      console.error('Error logging API usage:', error);
    });


    const apiKey = req.apiKey;
    if (apiKey && apiKey.webhookUrl && 
        (req.path.includes('/messages/send') || req.path.includes('/messages/send-media') || 
         req.path.includes('/messages/send-batch') || req.path.includes('/messages/send-template') ||
         req.path.includes('/messages/send-interactive'))) {

      import('../services/webhook-notifier').then(webhookNotifier => {
        webhookNotifier.default.queueNotification(
          req.apiKeyId!,
          apiKey.webhookUrl as string,
          {
            event: 'message.sent',
            messageId: res.locals.messageId,
            status: res.statusCode >= 200 && res.statusCode < 300 ? 'sent' : 'failed',
            timestamp: new Date().toISOString(),
            endpoint: req.path,
            error: res.statusCode >= 400 ? res.statusMessage : undefined
          }
        ).catch(error => {
          console.error('Error queueing webhook notification:', error);
        });
      }).catch(error => {
        console.error('Error importing webhook notifier:', error);
      });
    }

    return (originalEnd as any).apply(this, args);
  };

  next();
}

/**
 * Generate webhook signature using HMAC-SHA256
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
