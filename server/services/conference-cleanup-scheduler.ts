/**
 * Conference Cleanup Scheduler
 * Handles scheduled stale conference cleanup and metrics aggregation
 */

import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import axios from 'axios';
import { storage } from '../storage';
import { callLogsService } from './call-logs-service';
import { logger } from '../utils/logger';

export interface ConferenceCleanupConfig {
  enabled: boolean;
  staleTimeoutMinutes?: number;
  maxConferenceDurationHours?: number;
  cleanupIntervalMinutes?: number;
  metricsIntervalMinutes?: number;
  costThresholdUSD?: number;
  notifyOnCleanup?: boolean;
}

interface CleanupStats {
  lastCleanup: string | null;
  totalCleaned: number;
  errors: number;
}

interface ScheduledCleanupHandle {
  timeoutId: NodeJS.Timeout;
  conferenceSid: string;
  scheduledAt: Date;
}

const DEFAULT_STALE_TIMEOUT_MINUTES = 30;
const DEFAULT_MAX_CONFERENCE_DURATION_HOURS = 4;
const DEFAULT_CLEANUP_INTERVAL_CRON = '*/15 * * * *';
const DEFAULT_METRICS_CRON = '0 * * * *';
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

export class ConferenceCleanupScheduler extends EventEmitter {
  private staleCleanupTask: cron.ScheduledTask | null = null;
  private metricsTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  private cleanupStats: CleanupStats = {
    lastCleanup: null,
    totalCleaned: 0,
    errors: 0
  };
  private scheduledCleanups = new Map<string, ScheduledCleanupHandle>();
  private metricsCache: {
    data: any;
    timestamp: number;
  } | null = null;
  private metricsCacheTtlMs = 60000;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('conference-cleanup', 'Conference cleanup scheduler already running');
      return;
    }

    const config = await this.getConfig();
    if (!config?.enabled) {
      logger.info('conference-cleanup', 'Conference cleanup is disabled in config');
      return;
    }

    this.isRunning = true;
    logger.info('conference-cleanup', 'Starting conference cleanup scheduler');

    try {
      this.scheduleStaleCleanupJob();
      this.scheduleMetricsJob();
      this.emit('started');
      logger.info('conference-cleanup', 'Conference cleanup scheduler started successfully');
    } catch (error) {
      logger.error('conference-cleanup', 'Failed to start conference cleanup scheduler:', error);
      this.isRunning = false;
      throw error;
    }
  }

  stop(): void {
    if (!this.isRunning) {
      logger.info('conference-cleanup', 'Conference cleanup scheduler not running');
      return;
    }

    this.isRunning = false;
    logger.info('conference-cleanup', 'Stopping conference cleanup scheduler');

    if (this.staleCleanupTask) {
      this.staleCleanupTask.stop();
      this.staleCleanupTask = null;
    }
    if (this.metricsTask) {
      this.metricsTask.stop();
      this.metricsTask = null;
    }

    for (const [, handle] of this.scheduledCleanups) {
      clearTimeout(handle.timeoutId);
    }
    this.scheduledCleanups.clear();
    this.metricsCache = null;

    this.emit('stopped');
    logger.info('conference-cleanup', 'Conference cleanup scheduler stopped');
  }

  async reload(): Promise<void> {
    logger.info('conference-cleanup', 'Reloading conference cleanup scheduler');
    this.stop();
    await this.start();
  }

  /**
   * Schedule a single conference to be terminated after timeout (e.g. 4 hours)
   */
  scheduleConferenceCleanup(conferenceSid: string, timeoutMs: number): void {
    this.cancelConferenceCleanup(conferenceSid);

    const timeoutId = setTimeout(async () => {
      this.scheduledCleanups.delete(conferenceSid);
      try {
        await this.terminateConference(conferenceSid);
        this.emit('conference-terminated', { conferenceSid, reason: 'max_duration' });
      } catch (err) {
        logger.error('conference-cleanup', `Scheduled cleanup failed for conference ${conferenceSid}:`, err);
        this.emit('cleanup-failed', { conferenceSid, error: err });
      }
    }, timeoutMs);

    this.scheduledCleanups.set(conferenceSid, {
      timeoutId,
      conferenceSid,
      scheduledAt: new Date()
    });
    logger.info('conference-cleanup', `Scheduled cleanup for conference ${conferenceSid} in ${timeoutMs}ms`);
  }

  cancelConferenceCleanup(conferenceSid: string): void {
    const handle = this.scheduledCleanups.get(conferenceSid);
    if (handle) {
      clearTimeout(handle.timeoutId);
      this.scheduledCleanups.delete(conferenceSid);
    }
  }

  /**
   * Get configured max conference duration in hours (for per-conference scheduling).
   * Used by webhook conference-start to schedule cleanup with configured limit.
   */
  async getMaxConferenceDurationHours(): Promise<number> {
    const config = await this.getConfig();
    return config?.maxConferenceDurationHours ?? DEFAULT_MAX_CONFERENCE_DURATION_HOURS;
  }

  getCleanupStats(): CleanupStats {
    return { ...this.cleanupStats };
  }

  getStatus(): { isRunning: boolean; scheduledCleanupsCount: number } {
    return {
      isRunning: this.isRunning,
      scheduledCleanupsCount: this.scheduledCleanups.size
    };
  }

  /**
   * Fetch active conferences from Twilio (for admin listing)
   */
  async getActiveConferences(): Promise<any[]> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return [];
    return this.fetchActiveConferences(accountSid, authToken);
  }

  /**
   * Run stale conference cleanup (can be called by admin endpoint)
   */
  async runStaleCleanup(conferenceSid?: string): Promise<{
    totalConferences: number;
    cleanedConferences: number;
    activeConferences: number;
    errors: Array<{ conferenceSid: string; error: string }>;
    details: Array<{ conferenceSid: string; conferenceName: string; duration: number; action: 'terminated' | 'skipped' | 'error' }>;
  }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const result = {
      totalConferences: 0,
      cleanedConferences: 0,
      activeConferences: 0,
      errors: [] as Array<{ conferenceSid: string; error: string }>,
      details: [] as Array<{ conferenceSid: string; conferenceName: string; duration: number; action: 'terminated' | 'skipped' | 'error' }>
    };

    if (!accountSid || !authToken) {
      logger.warn('conference-cleanup', 'Twilio credentials not configured, skipping cleanup');
      return result;
    }

    const config = await this.getConfig();
    const staleTimeoutMinutes = config?.staleTimeoutMinutes ?? DEFAULT_STALE_TIMEOUT_MINUTES;
    const staleCutoffMs = staleTimeoutMinutes * 60 * 1000;

    if (conferenceSid) {
      try {
        await this.terminateConference(conferenceSid);
        result.cleanedConferences = 1;
        result.details.push({ conferenceSid, conferenceName: conferenceSid, duration: 0, action: 'terminated' });
        this.cleanupStats.totalCleaned += 1;
        this.cleanupStats.lastCleanup = new Date().toISOString();
        this.emit('cleanup-completed', { cleaned: 1, errors: [] });
        this.emit('conference-terminated', { conferenceSid, reason: 'manual' });
      } catch (err: any) {
        result.errors.push({ conferenceSid, error: err?.message || String(err) });
        result.details.push({ conferenceSid, conferenceName: conferenceSid, duration: 0, action: 'error' });
        this.cleanupStats.errors += 1;
        this.emit('cleanup-failed', { conferenceSid, error: err });
      }
      return result;
    }

    const startTime = Date.now();
    try {
      const activeConferences = await this.fetchActiveConferences(accountSid, authToken);
      result.totalConferences = activeConferences.length;
      result.activeConferences = activeConferences.length;

      for (const conf of activeConferences) {
        const friendlyName = conf.friendly_name || conf.sid;
        const dateCreated = conf.date_created ? new Date(conf.date_created).getTime() : Date.now();
        const durationMs = Date.now() - dateCreated;

        let callLogs: any[] = [];
        try {
          callLogs = await callLogsService.getCallLogsByConferenceName(friendlyName);
        } catch (_) {

        }

        const hasMatchingCallLog = callLogs.length > 0;
        const callCompletedLongAgo = callLogs.some((c: any) => {
          const ended = c.endedAt ? new Date(c.endedAt).getTime() : 0;
          return ended > 0 && Date.now() - ended > staleCutoffMs;
        });
        const isOrphaned = !hasMatchingCallLog || callCompletedLongAgo;

        if (!isOrphaned) {
          result.details.push({ conferenceSid: conf.sid, conferenceName: friendlyName, duration: Math.floor(durationMs / 1000), action: 'skipped' });
          continue;
        }

        try {
          await this.terminateConference(conf.sid);
          result.cleanedConferences += 1;
          result.activeConferences -= 1;
          result.details.push({ conferenceSid: conf.sid, conferenceName: friendlyName, duration: Math.floor(durationMs / 1000), action: 'terminated' });
          this.cleanupStats.totalCleaned += 1;
          this.emit('conference-terminated', { conferenceSid: conf.sid, reason: 'stale' });

          if (callLogs.length > 0) {
            const metadata = callLogs[0].metadata || {};
            metadata.conferenceEndTime = new Date().toISOString();
            metadata.cleanupTerminated = true;
            await callLogsService.updateCallLog(callLogs[0].companyId, callLogs[0].id, { metadata });
          }
        } catch (err: any) {
          result.errors.push({ conferenceSid: conf.sid, error: err?.message || String(err) });
          result.details.push({ conferenceSid: conf.sid, conferenceName: friendlyName, duration: Math.floor(durationMs / 1000), action: 'error' });
          this.cleanupStats.errors += 1;
        }
      }

      this.cleanupStats.lastCleanup = new Date().toISOString();
      this.emit('cleanup-completed', { cleaned: result.cleanedConferences, errors: result.errors, executionTime: Date.now() - startTime });
    } catch (error: any) {
      logger.error('conference-cleanup', 'Stale conference cleanup failed:', error);
      this.cleanupStats.errors += 1;
      this.emit('cleanup-failed', { error: error?.message || String(error) });
    }

    return result;
  }

  /**
   * Get conference metrics (cached 60s)
   */
  async getConferenceMetrics(): Promise<{
    activeCount: number;
    totalToday: number;
    averageDuration: number;
    longestRunning: { conferenceSid: string; duration: number; participantCount: number } | null;
    staleCount: number;
    cleanupStats: CleanupStats;
  }> {
    if (this.metricsCache && Date.now() - this.metricsCache.timestamp < this.metricsCacheTtlMs) {
      return this.metricsCache.data;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const defaultResult = {
      activeCount: 0,
      totalToday: 0,
      averageDuration: 0,
      longestRunning: null as { conferenceSid: string; duration: number; participantCount: number } | null,
      staleCount: 0,
      cleanupStats: this.getCleanupStats()
    };

    try {
      const [activeConferences, todayStats] = await Promise.all([
        accountSid && authToken ? this.fetchActiveConferences(accountSid, authToken) : Promise.resolve([]),
        this.aggregateTodayConferenceMetrics()
      ]);

      let longestRunning: { conferenceSid: string; duration: number; participantCount: number } | null = null;
      for (const c of activeConferences) {
        const dateCreated = c.date_created ? new Date(c.date_created).getTime() : Date.now();
        const duration = Math.floor((Date.now() - dateCreated) / 1000);
        const participantCount = Number((c as any).participants_count) || 0;
        if (!longestRunning || duration > longestRunning.duration) {
          longestRunning = { conferenceSid: c.sid, duration, participantCount };
        }
      }

      const staleTimeoutMinutes = (await this.getConfig())?.staleTimeoutMinutes ?? DEFAULT_STALE_TIMEOUT_MINUTES;
      let staleCount = 0;
      for (const conf of activeConferences) {
        const friendlyName = conf.friendly_name || conf.sid;
        const callLogs = await callLogsService.getCallLogsByConferenceName(friendlyName).catch(() => []);
        const hasRecent = callLogs.some((c: any) => {
          const ended = c.endedAt ? new Date(c.endedAt).getTime() : 0;
          return ended === 0 || Date.now() - ended <= staleTimeoutMinutes * 60 * 1000;
        });
        if (!hasRecent && callLogs.length > 0) staleCount += 1;
        else if (callLogs.length === 0) staleCount += 1;
      }

      const data = {
        activeCount: activeConferences.length,
        totalToday: todayStats.totalToday,
        averageDuration: todayStats.averageDuration,
        longestRunning,
        staleCount,
        cleanupStats: this.getCleanupStats()
      };
      this.metricsCache = { data, timestamp: Date.now() };
      return data;
    } catch (err) {
      logger.error('conference-cleanup', 'Error aggregating conference metrics:', err);
      return { ...defaultResult, cleanupStats: this.getCleanupStats() };
    }
  }

  invalidateMetricsCache(): void {
    this.metricsCache = null;
  }

  private async getConfig(): Promise<ConferenceCleanupConfig | null> {
    const enabledEnv = process.env.CONFERENCE_CLEANUP_ENABLED;
    if (enabledEnv === 'false' || enabledEnv === '0') {
      return { enabled: false };
    }
    try {
      const setting = await storage.getAppSetting('conference_cleanup_config');
      if (setting?.value) {
        const config = setting.value as ConferenceCleanupConfig;
        return {
          enabled: config.enabled !== false,
          staleTimeoutMinutes: config.staleTimeoutMinutes ?? DEFAULT_STALE_TIMEOUT_MINUTES,
          maxConferenceDurationHours: config.maxConferenceDurationHours ?? DEFAULT_MAX_CONFERENCE_DURATION_HOURS,
          cleanupIntervalMinutes: config.cleanupIntervalMinutes ?? 15,
          metricsIntervalMinutes: config.metricsIntervalMinutes ?? 60,
          costThresholdUSD: config.costThresholdUSD ?? 10,
          notifyOnCleanup: config.notifyOnCleanup
        };
      }
    } catch (_) {}
    return {
      enabled: process.env.CONFERENCE_CLEANUP_ENABLED !== 'false',
      staleTimeoutMinutes: parseInt(process.env.CONFERENCE_STALE_TIMEOUT || '', 10) || DEFAULT_STALE_TIMEOUT_MINUTES,
      maxConferenceDurationHours: parseInt(process.env.CONFERENCE_MAX_DURATION || '', 10) || DEFAULT_MAX_CONFERENCE_DURATION_HOURS
    };
  }

  private scheduleStaleCleanupJob(): void {
    this.staleCleanupTask = cron.schedule(DEFAULT_CLEANUP_INTERVAL_CRON, () => {
      this.runStaleCleanup().catch(err => {
        logger.error('conference-cleanup', 'Scheduled stale cleanup error:', err);
        this.emit('cleanup-failed', { error: err?.message || String(err) });
      });
    }, { timezone: 'UTC' });
    this.staleCleanupTask.start();
    logger.info('conference-cleanup', 'Scheduled stale conference cleanup every 15 minutes');
  }

  private scheduleMetricsJob(): void {
    this.metricsTask = cron.schedule(DEFAULT_METRICS_CRON, async () => {
      try {
        await this.aggregateConferenceMetricsAndEmit();
      } catch (err) {
        logger.error('conference-cleanup', 'Metrics aggregation error:', err);
      }
    }, { timezone: 'UTC' });
    this.metricsTask.start();
    logger.info('conference-cleanup', 'Scheduled conference metrics aggregation hourly');
  }

  private async aggregateConferenceMetricsAndEmit(): Promise<void> {
    const metrics = await this.getConferenceMetrics();
    this.emit('metrics-aggregated', metrics);
  }

  private async fetchActiveConferences(accountSid: string, authToken: string): Promise<any[]> {
    const conferences: any[] = [];
    let nextPageUri: string | null = `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences.json?Status=in-progress`;

    const request = async (url: string, retries = 0): Promise<any> => {
      try {
        const res = await axios.get(url, {
          auth: { username: accountSid, password: authToken },
          timeout: 10000
        });
        return res.data;
      } catch (err: any) {
        if (retries < MAX_RETRIES && err?.response?.status >= 500) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries);
          await new Promise(r => setTimeout(r, delay));
          return request(url, retries + 1);
        }
        throw err;
      }
    };

    while (nextPageUri) {
      const data = await request(nextPageUri);
      const list = data.conferences || [];
      conferences.push(...list);
      nextPageUri = data.next_page_uri ? `${TWILIO_API_BASE}${data.next_page_uri}` : null;
    }

    return conferences;
  }

  private async terminateConference(conferenceSid: string): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    const request = async (retries = 0): Promise<void> => {
      try {
        await axios.post(
          `${TWILIO_API_BASE}/Accounts/${accountSid}/Conferences/${conferenceSid}.json`,
          new URLSearchParams({ Status: 'completed' }),
          {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
          }
        );
      } catch (err: any) {
        if (retries < MAX_RETRIES && err?.response?.status >= 500) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retries);
          await new Promise(r => setTimeout(r, delay));
          return request(retries + 1);
        }
        throw err;
      }
    };

    await request();
  }

  private async aggregateTodayConferenceMetrics(): Promise<{ totalToday: number; averageDuration: number }> {
    const { db } = await import('../db');
    const { calls } = await import('../../shared/schema');
    const { sql, gte, and } = await import('drizzle-orm');

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalDuration: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${calls.endedAt} - ${calls.startedAt}))), 0)::float`
      })
      .from(calls)
      .where(and(gte(calls.startedAt, startOfToday), sql`${calls.metadata}->>'conferenceName' IS NOT NULL`));

    const count = Number(rows[0]?.count || 0);
    const totalDuration = Number(rows[0]?.totalDuration || 0);
    const averageDuration = count > 0 ? Math.round(totalDuration / count) : 0;

    return { totalToday: count, averageDuration };
  }
}

export const conferenceCleanupScheduler = new ConferenceCleanupScheduler();
