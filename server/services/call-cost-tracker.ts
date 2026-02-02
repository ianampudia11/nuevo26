/**
 * Call Cost Tracker Service
 * Handles call cost calculation and tracking
 */

import { db } from '../db';
import { calls, companies } from '@shared/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export interface CallCost {
  duration: number; // in seconds
  direction: 'inbound' | 'outbound';
  fromCountry?: string;
  toCountry?: string;
}

/**
 * Calculate call cost based on Twilio pricing
 * This is a simplified calculation - in production, you'd use Twilio's pricing API
 * or maintain a pricing table
 */
export function calculateCallCost(callCost: CallCost): { cost: number; currency: string } {


  const baseRatePerMinute = 0.013; // $0.013 per minute for US calls
  const minutes = callCost.duration / 60;
  

  let cost = minutes * baseRatePerMinute;
  

  if (callCost.direction === 'outbound') {
    cost += 0.01; // $0.01 connection fee
  }

  return {
    cost: Math.round(cost * 10000) / 10000, // Round to 4 decimal places
    currency: 'USD'
  };
}

/** Twilio conference pricing: ~$0.0025 per participant per minute */
const CONFERENCE_RATE_PER_PARTICIPANT_PER_MINUTE = 0.0025;

export interface ConferenceMetadata {
  conferenceName?: string;
  conferenceSid?: string;
  conferenceStartTime?: string;
  conferenceEndTime?: string;
  participantJoinTimes?: Record<string, string>;
  participantLeaveTimes?: Record<string, string>;
  participantLabels?: string[];
  maxParticipants?: number;
  totalDurationSeconds?: number;
}

export interface ConferenceCostBreakdown {
  conferenceCost: number;
  participantCosts: Array<{ label: string; duration: number; cost: number }>;
  totalCost: number;
  currency: string;
}

/**
 * Calculate conference cost from call metadata.
 * Uses Twilio conference pricing: ~$0.0025 per participant per minute.
 */
export function calculateConferenceCost(metadata: ConferenceMetadata | null | undefined): ConferenceCostBreakdown {
  const result: ConferenceCostBreakdown = {
    conferenceCost: 0,
    participantCosts: [],
    totalCost: 0,
    currency: 'USD'
  };

  if (!metadata) return result;

  const joinTimes = metadata.participantJoinTimes || {};
  const leaveTimes = metadata.participantLeaveTimes || {};
  const labels = metadata.participantLabels || [];
  const endTime = metadata.conferenceEndTime ? new Date(metadata.conferenceEndTime).getTime() : Date.now();
  const startTime = metadata.conferenceStartTime ? new Date(metadata.conferenceStartTime).getTime() : endTime;

  let totalParticipantMinutes = 0;

  for (const label of labels) {
    const joinStr = joinTimes[label];
    const leaveStr = leaveTimes[label];
    const joinMs = joinStr ? new Date(joinStr).getTime() : startTime;
    const leaveMs = leaveStr ? new Date(leaveStr).getTime() : endTime;
    const durationSeconds = Math.max(0, (leaveMs - joinMs) / 1000);
    const durationMinutes = durationSeconds / 60;
    const cost = Math.round(durationMinutes * CONFERENCE_RATE_PER_PARTICIPANT_PER_MINUTE * 10000) / 10000;
    totalParticipantMinutes += durationMinutes;
    result.participantCosts.push({ label, duration: Math.round(durationSeconds), cost });
  }


  if (result.participantCosts.length === 0 && metadata.totalDurationSeconds != null) {
    const participantCount = Math.max(1, metadata.maxParticipants || 1);
    const minutes = metadata.totalDurationSeconds / 60;
    const cost = Math.round(minutes * participantCount * CONFERENCE_RATE_PER_PARTICIPANT_PER_MINUTE * 10000) / 10000;
    result.conferenceCost = cost;
    result.totalCost = cost;
    return result;
  }

  result.conferenceCost = Math.round(totalParticipantMinutes * CONFERENCE_RATE_PER_PARTICIPANT_PER_MINUTE * 10000) / 10000;
  result.totalCost = result.conferenceCost;
  return result;
}

/**
 * Track call cost in database
 */
export async function trackCallCost(
  callId: number,
  cost: number,
  currency: string = 'USD'
): Promise<void> {
  await db
    .update(calls)
    .set({
      cost: cost.toString(),
      costCurrency: currency,
      updatedAt: new Date()
    })
    .where(eq(calls.id, callId));
}

/**
 * Get company call costs for a date range
 */
export async function getCompanyCosts(
  companyId: number,
  dateRange?: { startDate?: Date; endDate?: Date }
): Promise<{ totalCost: number; currency: string; callCount: number }> {
  const conditions = [eq(calls.companyId, companyId), sql`${calls.cost} IS NOT NULL`];

  if (dateRange?.startDate) {
    conditions.push(gte(calls.startedAt, dateRange.startDate));
  }

  if (dateRange?.endDate) {
    conditions.push(lte(calls.startedAt, dateRange.endDate));
  }

  const result = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${calls.cost}), 0)`,
      callCount: sql<number>`COUNT(*)`,
      currency: calls.costCurrency
    })
    .from(calls)
    .where(and(...conditions))
    .groupBy(calls.costCurrency)
    .limit(1);

  if (result[0]) {
    return {
      totalCost: Number(result[0].totalCost),
      currency: result[0].currency || 'USD',
      callCount: Number(result[0].callCount)
    };
  }

  return { totalCost: 0, currency: 'USD', callCount: 0 };
}

/**
 * Check if budget alert should be sent
 */
export async function checkBudgetAlert(companyId: number, currentCost: number): Promise<boolean> {


  return false;
}

/**
 * Send budget alert notification
 */
export async function sendBudgetAlert(
  companyId: number,
  cost: number,
  budget: number
): Promise<void> {


}
