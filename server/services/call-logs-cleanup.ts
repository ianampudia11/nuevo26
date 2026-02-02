/**
 * Call Logs Cleanup Service
 * Handles automated cleanup of old call logs and conference data
 */

import { db } from '../db';
import { calls } from '@shared/schema';
import { eq, lt, sql, and } from 'drizzle-orm';

/**
 * Terminate any Twilio conferences associated with the given call logs before deletion.
 * Call this before deleting call logs that may have conferenceSid in metadata.
 */
export async function cleanupConferenceData(callLogs: Array<{ id: number; metadata: any }>): Promise<void> {
  const conferenceSids = new Set<string>();
  for (const log of callLogs) {
    const sid = log.metadata?.conferenceSid;
    if (sid && typeof sid === 'string') {
      conferenceSids.add(sid);
    }
  }
  if (conferenceSids.size === 0) return;
  try {
    const { conferenceCleanupScheduler } = await import('./conference-cleanup-scheduler');
    for (const conferenceSid of conferenceSids) {
      try {
        await conferenceCleanupScheduler.runStaleCleanup(conferenceSid);
      } catch (_) {

      }
    }
  } catch (_) {

  }
}

/**
 * Cleanup old call logs based on retention period.
 * Before deleting, terminates any active Twilio conferences associated with those calls
 * and removes conference metadata.
 * @param retentionDays - Number of days to retain calls (default: 90)
 * @param companyId - Optional company ID to limit cleanup to specific company
 */
export async function cleanupOldCallLogs(
  retentionDays: number = 90,
  companyId?: number
): Promise<{ deleted: number; archived: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const conditions = [lt(calls.startedAt, cutoffDate)];

  if (companyId) {
    conditions.push(eq(calls.companyId, companyId));
  }


  const callsWithConferences = await db
    .select({ id: calls.id, metadata: calls.metadata })
    .from(calls)
    .where(and(...conditions, sql`${calls.metadata}->>'conferenceSid' IS NOT NULL`));

  await cleanupConferenceData(callsWithConferences);

  const result = await db
    .delete(calls)
    .where(and(...conditions))
    .returning();

  const deleted = result.length;

  return {
    deleted,
    archived: 0
  };
}

/**
 * Get cleanup statistics
 */
export async function getCleanupStats(companyId?: number): Promise<{
  totalCalls: number;
  callsOlderThan90Days: number;
  callsOlderThan180Days: number;
}> {
  const conditions = companyId ? [eq(calls.companyId, companyId)] : [];

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...conditions));

  const totalCalls = Number(totalResult[0]?.count || 0);

  const date90DaysAgo = new Date();
  date90DaysAgo.setDate(date90DaysAgo.getDate() - 90);

  const date180DaysAgo = new Date();
  date180DaysAgo.setDate(date180DaysAgo.getDate() - 180);

  const conditions90 = [...conditions, lt(calls.startedAt, date90DaysAgo)];
  const conditions180 = [...conditions, lt(calls.startedAt, date180DaysAgo)];

  const result90 = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...conditions90));

  const result180 = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(...conditions180));

  return {
    totalCalls,
    callsOlderThan90Days: Number(result90[0]?.count || 0),
    callsOlderThan180Days: Number(result180[0]?.count || 0)
  };
}
