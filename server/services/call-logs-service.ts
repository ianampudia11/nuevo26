/**
 * Call Logs Service
 * Handles call log data retrieval, filtering, analytics, and management
 */

import { db } from '../db';
import { calls, contacts, flows, conversations, channelConnections, messages } from '@shared/schema';
import { eq, and, or, desc, asc, gte, lte, like, sql, inArray } from 'drizzle-orm';
import type { Call, InsertCall } from '@shared/schema';
import axios from 'axios';

export interface CallLogFilters {
  status?: string;
  direction?: 'inbound' | 'outbound';
  contactId?: number;
  flowId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
  phoneNumber?: string;
  callType?: 'direct' | 'ai-powered';
}

export interface CallLogPagination {
  page?: number;
  limit?: number;
}

export interface CallLogStats {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  avgDuration: number;
  successRate: number;
  totalCost: number;
  callsByFlow: Array<{ flowId: number | null; flowName: string | null; count: number }>;
  peakCallingHours: Array<{ hour: number; count: number }>;
  mostCalledNumbers: Array<{ phoneNumber: string; count: number }>;
  aiPoweredCalls: number;
  directCalls: number;
  avgAIResponseTime?: number;
  aiSuccessRate?: number;
}

export class CallLogsService {
  /**
   * Get call logs with filtering and pagination
   */
  async getCallLogs(
    companyId: number,
    filters: CallLogFilters = {},
    pagination: CallLogPagination = {},
    userId?: number,
    userRole?: string
  ): Promise<{ calls: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 50;
    const offset = (page - 1) * limit;


    const conditions = [eq(calls.companyId, companyId)];




    if (userRole === 'agent' && userId) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${conversations} 
          WHERE ${conversations.id} = ${calls.conversationId} 
          AND ${conversations.assignedToUserId} = ${userId}
        )`
      );
    }

    if (filters.status) {
      conditions.push(eq(calls.status, filters.status));
    }

    if (filters.direction) {
      conditions.push(eq(calls.direction, filters.direction));
    }

    if (filters.contactId) {
      conditions.push(eq(calls.contactId, filters.contactId));
    }

    if (filters.flowId) {
      conditions.push(eq(calls.flowId, filters.flowId));
    }

    if (filters.startDate) {
      conditions.push(gte(calls.startedAt, new Date(filters.startDate)));
    }

    if (filters.endDate) {
      conditions.push(lte(calls.startedAt, new Date(filters.endDate)));
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(calls.from, searchTerm),
          like(calls.to, searchTerm),
          sql`EXISTS (
            SELECT 1 FROM ${contacts} 
            WHERE ${contacts.id} = ${calls.contactId} 
            AND (${contacts.name} ILIKE ${searchTerm} OR ${contacts.phone} ILIKE ${searchTerm})
          )`
        )!
      );
    }

    if (filters.phoneNumber) {
      conditions.push(
        or(
          like(calls.from, `%${filters.phoneNumber}%`),
          like(calls.to, `%${filters.phoneNumber}%`)
        )!
      );
    }

    if (filters.callType) {
      conditions.push(
        sql`${calls.metadata}->>'callType' = ${filters.callType}`
      );
    }


    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions));

    const total = Number(totalResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);


    const callLogs = await db
      .select({
        id: calls.id,
        companyId: calls.companyId,
        channelId: calls.channelId,
        contactId: calls.contactId,
        conversationId: calls.conversationId,
        flowId: calls.flowId,
        nodeId: calls.nodeId,
        direction: calls.direction,
        status: calls.status,
        from: calls.from,
        to: calls.to,
        durationSec: calls.durationSec,
        startedAt: calls.startedAt,
        endedAt: calls.endedAt,
        recordingUrl: calls.recordingUrl,
        recordingSid: calls.recordingSid,
        twilioCallSid: calls.twilioCallSid,
        transcript: calls.transcript,
        conversationData: calls.conversationData,
        agentConfig: calls.agentConfig,
        cost: calls.cost,
        costCurrency: calls.costCurrency,
        metadata: calls.metadata,
        notes: calls.notes,
        isStarred: calls.isStarred,
        createdAt: calls.createdAt,
        updatedAt: calls.updatedAt,
        contact: {
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          email: contacts.email
        },
        flow: {
          id: flows.id,
          name: flows.name
        },
        conversation: {
          id: conversations.id
        }
      })
      .from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(flows, eq(calls.flowId, flows.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .where(and(...conditions))
      .orderBy(desc(calls.startedAt))
      .limit(limit)
      .offset(offset);

    return {
      calls: callLogs,
      total,
      page,
      limit,
      totalPages
    };
  }

  /**
   * Get single call log by ID
   */
  async getCallLogById(companyId: number, callId: number): Promise<any | null> {
    const result = await db
      .select({
        id: calls.id,
        companyId: calls.companyId,
        channelId: calls.channelId,
        contactId: calls.contactId,
        conversationId: calls.conversationId,
        flowId: calls.flowId,
        nodeId: calls.nodeId,
        direction: calls.direction,
        status: calls.status,
        from: calls.from,
        to: calls.to,
        durationSec: calls.durationSec,
        startedAt: calls.startedAt,
        endedAt: calls.endedAt,
        recordingUrl: calls.recordingUrl,
        recordingSid: calls.recordingSid,
        twilioCallSid: calls.twilioCallSid,
        transcript: calls.transcript,
        conversationData: calls.conversationData,
        agentConfig: calls.agentConfig,
        cost: calls.cost,
        costCurrency: calls.costCurrency,
        metadata: calls.metadata,
        notes: calls.notes,
        isStarred: calls.isStarred,
        createdAt: calls.createdAt,
        updatedAt: calls.updatedAt,
        contact: {
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          email: contacts.email,
          avatarUrl: contacts.avatarUrl
        },
        flow: {
          id: flows.id,
          name: flows.name
        },
        conversation: {
          id: conversations.id
        },
        channel: {
          id: channelConnections.id,
          accountName: channelConnections.accountName,
          channelType: channelConnections.channelType
        }
      })
      .from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(flows, eq(calls.flowId, flows.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .leftJoin(channelConnections, eq(calls.channelId, channelConnections.id))
      .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get call log statistics
   */
  async getCallLogStats(companyId: number, dateRange?: { startDate?: string; endDate?: string }): Promise<CallLogStats> {
    const conditions = [eq(calls.companyId, companyId)];

    if (dateRange?.startDate) {
      conditions.push(gte(calls.startedAt, new Date(dateRange.startDate)));
    }

    if (dateRange?.endDate) {
      conditions.push(lte(calls.startedAt, new Date(dateRange.endDate)));
    }


    const totalCallsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions));

    const totalCalls = Number(totalCallsResult[0]?.count || 0);


    const inboundResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, eq(calls.direction, 'inbound')));

    const inboundCalls = Number(inboundResult[0]?.count || 0);
    const outboundCalls = totalCalls - inboundCalls;


    const avgDurationResult = await db
      .select({ avg: sql<number>`COALESCE(AVG(${calls.durationSec}), 0)` })
      .from(calls)
      .where(and(...conditions, sql`${calls.durationSec} IS NOT NULL`));

    const avgDuration = Number(avgDurationResult[0]?.avg || 0);


    const completedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, eq(calls.status, 'completed')));

    const completedCalls = Number(completedResult[0]?.count || 0);
    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;


    const totalCostResult = await db
      .select({ sum: sql<number>`COALESCE(SUM(${calls.cost}), 0)` })
      .from(calls)
      .where(and(...conditions, sql`${calls.cost} IS NOT NULL`));

    const totalCost = Number(totalCostResult[0]?.sum || 0);


    const callsByFlowResult = await db
      .select({
        flowId: calls.flowId,
        flowName: flows.name,
        count: sql<number>`count(*)`
      })
      .from(calls)
      .leftJoin(flows, eq(calls.flowId, flows.id))
      .where(and(...conditions))
      .groupBy(calls.flowId, flows.name)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(10);


    const peakHoursResult = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${calls.startedAt})`,
        count: sql<number>`count(*)`
      })
      .from(calls)
      .where(and(...conditions, sql`${calls.startedAt} IS NOT NULL`))
      .groupBy(sql`EXTRACT(HOUR FROM ${calls.startedAt})`)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(24);


    const mostCalledResult = await db
      .select({
        phoneNumber: calls.to,
        count: sql<number>`count(*)`
      })
      .from(calls)
      .where(and(...conditions, sql`${calls.to} IS NOT NULL`))
      .groupBy(calls.to)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(10);


    const aiPoweredResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, sql`${calls.metadata}->>'callType' = 'ai-powered'`));
    
    const aiPoweredCalls = Number(aiPoweredResult[0]?.count || 0);
    const directCalls = totalCalls - aiPoweredCalls;



    const avgResponseTimeResult = await db.execute<{ avgResponseTime: number }>(sql`
      SELECT COALESCE(AVG((elem->>'responseTime')::decimal), 0) as "avgResponseTime"
      FROM ${calls}
      CROSS JOIN LATERAL jsonb_array_elements(${calls.conversationData}) AS elem
      WHERE ${calls.companyId} = ${companyId}
        ${dateRange?.startDate ? sql`AND ${calls.startedAt} >= ${new Date(dateRange.startDate)}` : sql``}
        ${dateRange?.endDate ? sql`AND ${calls.startedAt} <= ${new Date(dateRange.endDate)}` : sql``}
        AND ${calls.metadata}->>'callType' = 'ai-powered'
        AND ${calls.conversationData} IS NOT NULL
    `);

    const avgAIResponseTime = Number(avgResponseTimeResult.rows[0]?.avgResponseTime || 0);


    const aiCompletedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, 
        eq(calls.status, 'completed'),
        sql`${calls.metadata}->>'callType' = 'ai-powered'`
      ));
    
    const aiCompletedCalls = Number(aiCompletedResult[0]?.count || 0);
    const aiSuccessRate = aiPoweredCalls > 0 ? (aiCompletedCalls / aiPoweredCalls) * 100 : 0;

    return {
      totalCalls,
      inboundCalls,
      outboundCalls,
      avgDuration: Math.round(avgDuration),
      successRate: Math.round(successRate * 100) / 100,
      totalCost,
      callsByFlow: callsByFlowResult.map(r => ({
        flowId: r.flowId,
        flowName: r.flowName,
        count: Number(r.count)
      })),
      peakCallingHours: peakHoursResult.map(r => ({
        hour: Number(r.hour),
        count: Number(r.count)
      })),
      mostCalledNumbers: mostCalledResult.map(r => ({
        phoneNumber: r.phoneNumber || '',
        count: Number(r.count)
      })),
      aiPoweredCalls,
      directCalls,
      avgAIResponseTime: Math.round(avgAIResponseTime),
      aiSuccessRate: Math.round(aiSuccessRate * 100) / 100
    };
  }

  /**
   * Get AI-specific call metrics
   */
  async getAICallMetrics(
    companyId: number, 
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<{
    totalAICalls: number;
    avgResponseTime: number;
    avgTurnsPerCall: number;
    aiSuccessRate: number;
    totalDirectCalls: number;
    avgConfidence?: number;
  }> {
    const conditions = [eq(calls.companyId, companyId)];

    if (dateRange?.startDate) {
      conditions.push(gte(calls.startedAt, new Date(dateRange.startDate)));
    }

    if (dateRange?.endDate) {
      conditions.push(lte(calls.startedAt, new Date(dateRange.endDate)));
    }


    const aiCallsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, sql`${calls.metadata}->>'callType' = 'ai-powered'`));
    
    const totalAICalls = Number(aiCallsResult[0]?.count || 0);


    const directCallsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, sql`${calls.metadata}->>'callType' = 'direct'`));
    
    const totalDirectCalls = Number(directCallsResult[0]?.count || 0);


    const responseTimeResult = await db
      .select({
        avg: sql<number>`
          COALESCE(
            AVG(
              (jsonb_array_elements(${calls.conversationData})->>'responseTime')::decimal
            ), 0
          )
        `
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`
      ));

    const avgResponseTime = Number(responseTimeResult[0]?.avg || 0);


    const turnsResult = await db
      .select({
        avgTurns: sql<number>`
          COALESCE(
            AVG(
              jsonb_array_length(${calls.conversationData})
            ), 0
          )
        `
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`
      ));

    const avgTurnsPerCall = Number(turnsResult[0]?.avgTurns || 0);


    const aiCompletedResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(and(...conditions, 
        eq(calls.status, 'completed'),
        sql`${calls.metadata}->>'callType' = 'ai-powered'`
      ));
    
    const aiCompletedCalls = Number(aiCompletedResult[0]?.count || 0);
    const aiSuccessRate = totalAICalls > 0 ? (aiCompletedCalls / totalAICalls) * 100 : 0;


    const confidenceResult = await db
      .select({
        avgConfidence: sql<number>`
          COALESCE(
            AVG(
              (jsonb_array_elements(${calls.conversationData})->>'confidence')::decimal
            ), 0
          )
        `
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`,
        sql`jsonb_array_elements(${calls.conversationData})->>'confidence' IS NOT NULL`
      ));

    const avgConfidence = Number(confidenceResult[0]?.avgConfidence || 0);

    return {
      totalAICalls,
      avgResponseTime: Math.round(avgResponseTime),
      avgTurnsPerCall: Math.round(avgTurnsPerCall * 100) / 100,
      aiSuccessRate: Math.round(aiSuccessRate * 100) / 100,
      totalDirectCalls,
      avgConfidence: avgConfidence > 0 ? Math.round(avgConfidence * 10000) / 100 : undefined
    };
  }

  /**
   * Get detailed AI performance analytics
   */
  async getAIPerformanceAnalytics(
    companyId: number,
    filters?: {
      startDate?: string;
      endDate?: string;
    }
  ): Promise<{
    responseTimeDistribution: {
      min: number;
      max: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
    };
    conversationQuality: {
      avgTurns: number;
      avgDurationPerTurn: number;
      totalConversations: number;
    };
    aiVsDirectComparison: {
      aiSuccessRate: number;
      directSuccessRate: number;
      aiAvgDuration: number;
      directAvgDuration: number;
      aiAvgCost: number;
      directAvgCost: number;
    };
    timeSeriesData: Array<{
      date: string;
      aiCalls: number;
      directCalls: number;
      avgResponseTime: number;
    }>;
  }> {
    const conditions = [eq(calls.companyId, companyId)];

    if (filters?.startDate) {
      conditions.push(gte(calls.startedAt, new Date(filters.startDate)));
    }

    if (filters?.endDate) {
      conditions.push(lte(calls.startedAt, new Date(filters.endDate)));
    }


    const responseTimeStats = await db
      .select({
        min: sql<number>`MIN((jsonb_array_elements(${calls.conversationData})->>'responseTime')::decimal)`,
        max: sql<number>`MAX((jsonb_array_elements(${calls.conversationData})->>'responseTime')::decimal)`,
        avg: sql<number>`AVG((jsonb_array_elements(${calls.conversationData})->>'responseTime')::decimal)`
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`
      ));


    const allResponseTimes = await db
      .select({
        responseTime: sql<number>`(jsonb_array_elements(${calls.conversationData})->>'responseTime')::decimal`
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`
      ));

    const responseTimes = allResponseTimes
      .map(r => r.responseTime)
      .filter(rt => rt !== null && rt !== undefined)
      .sort((a, b) => a - b);

    const p50 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.5)] : 0;
    const p95 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.95)] : 0;
    const p99 = responseTimes.length > 0 ? responseTimes[Math.floor(responseTimes.length * 0.99)] : 0;


    const qualityMetrics = await db
      .select({
        totalConversations: sql<number>`COUNT(*)`,
        avgTurns: sql<number>`AVG(jsonb_array_length(${calls.conversationData}))`,
        avgDuration: sql<number>`AVG(${calls.durationSec})`
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`,
        sql`${calls.conversationData} IS NOT NULL`,
        sql`${calls.durationSec} IS NOT NULL`
      ));

    const avgTurns = Number(qualityMetrics[0]?.avgTurns || 0);
    const avgDuration = Number(qualityMetrics[0]?.avgDuration || 0);
    const avgDurationPerTurn = avgTurns > 0 ? avgDuration / avgTurns : 0;


    const aiMetrics = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`,
        completedCalls: sql<number>`SUM(CASE WHEN ${calls.status} = 'completed' THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${calls.durationSec})`,
        avgCost: sql<number>`AVG(${calls.cost})`
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'ai-powered'`
      ));

    const directMetrics = await db
      .select({
        totalCalls: sql<number>`COUNT(*)`,
        completedCalls: sql<number>`SUM(CASE WHEN ${calls.status} = 'completed' THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`AVG(${calls.durationSec})`,
        avgCost: sql<number>`AVG(${calls.cost})`
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.metadata}->>'callType' = 'direct'`
      ));

    const aiTotalCalls = Number(aiMetrics[0]?.totalCalls || 0);
    const aiCompletedCalls = Number(aiMetrics[0]?.completedCalls || 0);
    const directTotalCalls = Number(directMetrics[0]?.totalCalls || 0);
    const directCompletedCalls = Number(directMetrics[0]?.completedCalls || 0);


    const timeSeriesData = await db
      .select({
        date: sql<string>`DATE(${calls.startedAt})`,
        aiCalls: sql<number>`SUM(CASE WHEN ${calls.metadata}->>'callType' = 'ai-powered' THEN 1 ELSE 0 END)`,
        directCalls: sql<number>`SUM(CASE WHEN ${calls.metadata}->>'callType' = 'direct' THEN 1 ELSE 0 END)`,
        avgResponseTime: sql<number>`
          COALESCE(
            (
              SELECT AVG((elem->>'responseTime')::decimal)
              FROM jsonb_array_elements(${calls.conversationData}) elem
              WHERE ${calls.metadata}->>'callType' = 'ai-powered'
            ), 0
          )
        `
      })
      .from(calls)
      .where(and(...conditions, 
        sql`${calls.startedAt} >= CURRENT_DATE - INTERVAL '30 days'`
      ))
      .groupBy(sql`DATE(${calls.startedAt})`)
      .orderBy(sql`DATE(${calls.startedAt})`);

    return {
      responseTimeDistribution: {
        min: Number(responseTimeStats[0]?.min || 0),
        max: Number(responseTimeStats[0]?.max || 0),
        avg: Math.round(Number(responseTimeStats[0]?.avg || 0)),
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99)
      },
      conversationQuality: {
        avgTurns: Math.round(avgTurns * 100) / 100,
        avgDurationPerTurn: Math.round(avgDurationPerTurn * 100) / 100,
        totalConversations: Number(qualityMetrics[0]?.totalConversations || 0)
      },
      aiVsDirectComparison: {
        aiSuccessRate: aiTotalCalls > 0 ? Math.round((aiCompletedCalls / aiTotalCalls) * 10000) / 100 : 0,
        directSuccessRate: directTotalCalls > 0 ? Math.round((directCompletedCalls / directTotalCalls) * 10000) / 100 : 0,
        aiAvgDuration: Math.round(Number(aiMetrics[0]?.avgDuration || 0)),
        directAvgDuration: Math.round(Number(directMetrics[0]?.avgDuration || 0)),
        aiAvgCost: Math.round((Number(aiMetrics[0]?.avgCost || 0) * 100)) / 100,
        directAvgCost: Math.round((Number(directMetrics[0]?.avgCost || 0) * 100)) / 100
      },
      timeSeriesData: timeSeriesData.map(d => ({
        date: d.date,
        aiCalls: Number(d.aiCalls),
        directCalls: Number(d.directCalls),
        avgResponseTime: Math.round(Number(d.avgResponseTime || 0))
      }))
    };
  }

  /**
   * Update call log
   */
  async updateCallLog(companyId: number, callId: number, updates: { notes?: string; isStarred?: boolean; metadata?: any }): Promise<Call | null> {
    const updateData: any = {
      updatedAt: new Date()
    };

    if (updates.notes !== undefined) {
      updateData.notes = updates.notes;
    }

    if (updates.isStarred !== undefined) {
      updateData.isStarred = updates.isStarred;
    }

    if (updates.metadata !== undefined) {

      const existingCall = await this.getCallLogById(companyId, callId);
      if (existingCall && existingCall.metadata) {
        updateData.metadata = { ...existingCall.metadata, ...updates.metadata };
      } else {
        updateData.metadata = updates.metadata;
      }
    }

    const result = await db
      .update(calls)
      .set(updateData)
      .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)))
      .returning();

    return result[0] || null;
  }

  /**
   * Delete call log
   */
  async deleteCallLog(companyId: number, callId: number): Promise<boolean> {

    const callLog = await this.getCallLogById(companyId, callId);
    if (!callLog) {
      return false;
    }


    if (callLog.conversationId && callLog.twilioCallSid) {
      await db
        .delete(messages)
        .where(
          and(
            eq(messages.conversationId, callLog.conversationId),
            sql`${messages.metadata}->>'callSid' = ${callLog.twilioCallSid}`
          )
        );
    }


    if (callLog.recordingSid || callLog.recordingUrl) {
      try {
        await this.deleteTwilioRecording(callLog);
      } catch (error) {
        console.error(`Error deleting Twilio recording for call ${callId}:`, error);

      }
    }

    const result = await db
      .delete(calls)
      .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)))
      .returning();

    return result.length > 0;
  }

  /**
   * Delete multiple call logs by IDs
   */
  async deleteCallLogs(companyId: number, callIds: number[]): Promise<number> {
    if (callIds.length === 0) {
      return 0;
    }


    const callLogs = await db
      .select({
        id: calls.id,
        conversationId: calls.conversationId,
        twilioCallSid: calls.twilioCallSid,
        recordingSid: calls.recordingSid,
        recordingUrl: calls.recordingUrl,
        channelId: calls.channelId
      })
      .from(calls)
      .where(and(eq(calls.companyId, companyId), inArray(calls.id, callIds)));


    const conversationIds = new Set<number>();
    const callSids = new Set<string>();
    const recordingsToDelete: Array<{ recordingSid?: string; recordingUrl?: string; channelId?: number | null }> = [];

    for (const callLog of callLogs) {
      if (callLog.conversationId) {
        conversationIds.add(callLog.conversationId);
      }
      if (callLog.twilioCallSid) {
        callSids.add(callLog.twilioCallSid);
      }
      if (callLog.recordingSid || callLog.recordingUrl) {
        recordingsToDelete.push({
          recordingSid: callLog.recordingSid || undefined,
          recordingUrl: callLog.recordingUrl || undefined,
          channelId: callLog.channelId || undefined
        });
      }
    }


    if (conversationIds.size > 0 && callSids.size > 0) {
      const callSidsArray = Array.from(callSids);

      for (const callSid of callSidsArray) {
        await db
          .delete(messages)
          .where(
            and(
              inArray(messages.conversationId, Array.from(conversationIds)),
              sql`${messages.metadata}->>'callSid' = ${callSid}`
            )
          );
      }
    }


    for (const recording of recordingsToDelete) {
      try {
        await this.deleteTwilioRecording(recording as any);
      } catch (error) {
        console.error('Error deleting Twilio recording:', error);

      }
    }


    const result = await db
      .delete(calls)
      .where(and(eq(calls.companyId, companyId), inArray(calls.id, callIds)))
      .returning();

    return result.length;
  }

  /**
   * Clear all call logs for a company (optionally with filters)
   */
  async clearCallLogs(companyId: number, filters?: CallLogFilters): Promise<number> {

    const conditions = [eq(calls.companyId, companyId)];

    if (filters?.status) {
      conditions.push(eq(calls.status, filters.status));
    }

    if (filters?.direction) {
      conditions.push(eq(calls.direction, filters.direction));
    }

    if (filters?.startDate) {
      conditions.push(gte(calls.startedAt, new Date(filters.startDate)));
    }

    if (filters?.endDate) {
      conditions.push(lte(calls.startedAt, new Date(filters.endDate)));
    }


    const callLogs = await db
      .select({
        id: calls.id,
        conversationId: calls.conversationId,
        twilioCallSid: calls.twilioCallSid,
        recordingSid: calls.recordingSid,
        recordingUrl: calls.recordingUrl,
        channelId: calls.channelId
      })
      .from(calls)
      .where(and(...conditions));


    const conversationIds = new Set<number>();
    const callSids = new Set<string>();
    const recordingsToDelete: Array<{ recordingSid?: string; recordingUrl?: string; channelId?: number | null }> = [];

    for (const callLog of callLogs) {
      if (callLog.conversationId) {
        conversationIds.add(callLog.conversationId);
      }
      if (callLog.twilioCallSid) {
        callSids.add(callLog.twilioCallSid);
      }
      if (callLog.recordingSid || callLog.recordingUrl) {
        recordingsToDelete.push({
          recordingSid: callLog.recordingSid || undefined,
          recordingUrl: callLog.recordingUrl || undefined,
          channelId: callLog.channelId || undefined
        });
      }
    }


    if (conversationIds.size > 0 && callSids.size > 0) {
      const callSidsArray = Array.from(callSids);

      for (const callSid of callSidsArray) {
        await db
          .delete(messages)
          .where(
            and(
              inArray(messages.conversationId, Array.from(conversationIds)),
              sql`${messages.metadata}->>'callSid' = ${callSid}`
            )
          );
      }
    }


    for (const recording of recordingsToDelete) {
      try {
        await this.deleteTwilioRecording(recording as any);
      } catch (error) {
        console.error('Error deleting Twilio recording:', error);

      }
    }


    const result = await db
      .delete(calls)
      .where(and(...conditions))
      .returning();

    return result.length;
  }

  /**
   * Delete Twilio recording
   */
  private async deleteTwilioRecording(callLog: { recordingSid?: string; recordingUrl?: string; channelId?: number | null }): Promise<void> {
    if (!callLog.recordingSid && !callLog.recordingUrl) {
      return;
    }


    let accountSid: string | undefined;
    let authToken: string | undefined;

    if (callLog.channelId) {
      const { storage } = await import('../storage');
      const connection = await storage.getChannelConnection(callLog.channelId);
      if (connection && connection.connectionData) {
        const connectionData = connection.connectionData as any;
        accountSid = connectionData.accountSid;
        authToken = connectionData.authToken;
      }
    }


    if (!accountSid || !authToken) {
      accountSid = process.env.TWILIO_ACCOUNT_SID || '';
      authToken = process.env.TWILIO_AUTH_TOKEN || '';
    }

    if (!accountSid || !authToken) {
      console.warn('Twilio credentials not available for recording deletion');
      return;
    }


    let recordingSid = callLog.recordingSid;
    if (!recordingSid && callLog.recordingUrl) {

      const match = callLog.recordingUrl.match(/\/Recordings\/([^\/\?]+)/);
      if (match) {
        recordingSid = match[1];
      }
    }

    if (!recordingSid) {
      console.warn('Recording SID not available for deletion');
      return;
    }

    try {

      await axios.delete(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.json`,
        {
          auth: {
            username: accountSid,
            password: authToken
          }
        }
      );
    } catch (error: any) {

      if (error.response?.status === 404) {
        return;
      }
      throw error;
    }
  }

  /**
   * Link call to contact
   */
  async linkCallToContact(companyId: number, callId: number, contactId: number): Promise<Call | null> {
    const result = await db
      .update(calls)
      .set({
        contactId,
        updatedAt: new Date()
      })
      .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)))
      .returning();

    return result[0] || null;
  }

  /**
   * Create or update call log
   */
  async upsertCallLog(callData: Partial<InsertCall>): Promise<Call> {
    if (callData.twilioCallSid) {

      const existing = await db
        .select()
        .from(calls)
        .where(eq(calls.twilioCallSid, callData.twilioCallSid))
        .limit(1);

      if (existing[0]) {

        const result = await db
          .update(calls)
          .set({
            ...callData,
            updatedAt: new Date()
          })
          .where(eq(calls.id, existing[0].id))
          .returning();

        return result[0];
      }
    }


    const result = await db
      .insert(calls)
      .values({
        ...callData,
        createdAt: new Date(),
        updatedAt: new Date()
      } as InsertCall)
      .returning();

    return result[0];
  }

  /**
   * Get call logs by conference name (stored in metadata)
   */
  async getCallLogsByConferenceName(conferenceName: string): Promise<Call[]> {
    const result = await db
      .select()
      .from(calls)
      .where(sql`${calls.metadata}->>'conferenceName' = ${conferenceName}`);

    return result;
  }

  /**
   * Update call log status by ID
   */
  async updateCallLogStatus(callId: number, status: string): Promise<Call | null> {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };


    if (status === 'completed' || status === 'failed' || status === 'no-answer' || status === 'busy') {
      updateData.endedAt = new Date();
    }

    const result = await db
      .update(calls)
      .set(updateData)
      .where(eq(calls.id, callId))
      .returning();

    return result[0] || null;
  }
}

export const callLogsService = new CallLogsService();
