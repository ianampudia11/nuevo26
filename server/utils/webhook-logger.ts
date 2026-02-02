/**
 * Webhook Event Logger
 * Provides structured logging for webhook events with retention and querying
 */

import { logger } from './logger';

interface WebhookLogEntry {
  timestamp: Date;
  provider: 'whatsapp' | 'messenger' | 'instagram' | 'tiktok';
  eventType: string;
  status: 'received' | 'processing' | 'success' | 'error';
  connectionId?: number;
  companyId?: number;
  payload?: any;
  error?: string;
  processingTimeMs?: number;
  metadata?: Record<string, any>;
}


const webhookLogs: WebhookLogEntry[] = [];
const MAX_LOG_ENTRIES = 1000;

/**
 * Log a webhook event
 */
export function logWebhookEvent(entry: WebhookLogEntry): void {

  webhookLogs.unshift(entry);
  

  if (webhookLogs.length > MAX_LOG_ENTRIES) {
    webhookLogs.pop();
  }


  const logLevel = entry.status === 'error' ? 'error' : 'info';
  logger[logLevel](entry.provider, `Webhook ${entry.eventType} - ${entry.status}`, {
    connectionId: entry.connectionId,
    companyId: entry.companyId,
    processingTimeMs: entry.processingTimeMs,
    error: entry.error,
    metadata: entry.metadata
  });
}

/**
 * Get recent webhook logs
 */
export function getRecentWebhookLogs(
  limit: number = 100,
  filters?: {
    provider?: string;
    status?: string;
    connectionId?: number;
    companyId?: number;
  }
): WebhookLogEntry[] {
  let filtered = webhookLogs;

  if (filters) {
    filtered = webhookLogs.filter(log => {
      if (filters.provider && log.provider !== filters.provider) return false;
      if (filters.status && log.status !== filters.status) return false;
      if (filters.connectionId && log.connectionId !== filters.connectionId) return false;
      if (filters.companyId && log.companyId !== filters.companyId) return false;
      return true;
    });
  }

  return filtered.slice(0, limit);
}

/**
 * Get webhook statistics
 */
export function getWebhookStats(provider?: string): {
  total: number;
  byStatus: Record<string, number>;
  byEventType: Record<string, number>;
  avgProcessingTimeMs: number;
  errorRate: number;
} {
  const logs = provider 
    ? webhookLogs.filter(log => log.provider === provider)
    : webhookLogs;

  const byStatus: Record<string, number> = {};
  const byEventType: Record<string, number> = {};
  let totalProcessingTime = 0;
  let processedCount = 0;

  logs.forEach(log => {

    byStatus[log.status] = (byStatus[log.status] || 0) + 1;
    

    byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;
    

    if (log.processingTimeMs) {
      totalProcessingTime += log.processingTimeMs;
      processedCount++;
    }
  });

  const errorCount = byStatus['error'] || 0;
  const errorRate = logs.length > 0 ? (errorCount / logs.length) * 100 : 0;
  const avgProcessingTimeMs = processedCount > 0 ? totalProcessingTime / processedCount : 0;

  return {
    total: logs.length,
    byStatus,
    byEventType,
    avgProcessingTimeMs,
    errorRate
  };
}

/**
 * Clear old webhook logs
 */
export function clearWebhookLogs(olderThanMs?: number): number {
  if (!olderThanMs) {
    const count = webhookLogs.length;
    webhookLogs.length = 0;
    return count;
  }

  const cutoffTime = Date.now() - olderThanMs;
  const originalLength = webhookLogs.length;
  
  for (let i = webhookLogs.length - 1; i >= 0; i--) {
    if (webhookLogs[i].timestamp.getTime() < cutoffTime) {
      webhookLogs.splice(i, 1);
    }
  }

  return originalLength - webhookLogs.length;
}

/**
 * TikTok-specific webhook event logger
 */
export function logTikTokWebhookEvent(
  eventType: string,
  status: 'received' | 'processing' | 'success' | 'error',
  options?: {
    connectionId?: number;
    companyId?: number;
    payload?: any;
    error?: string;
    processingTimeMs?: number;
    metadata?: Record<string, any>;
  }
): void {
  logWebhookEvent({
    timestamp: new Date(),
    provider: 'tiktok',
    eventType,
    status,
    ...options
  });
}

/**
 * Export for use in webhook routes
 */
export default {
  logWebhookEvent,
  logTikTokWebhookEvent,
  getRecentWebhookLogs,
  getWebhookStats,
  clearWebhookLogs
};

