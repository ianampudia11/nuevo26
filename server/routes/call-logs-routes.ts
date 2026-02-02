/**
 * Call Logs API Routes
 * Handles HTTP endpoints for call logs management
 */

import { Router } from 'express';
import { callLogsService } from '../services/call-logs-service';
import { requirePermission, requireAnyPermission, ensureAuthenticated } from '../middleware';
import { PERMISSIONS } from '@shared/schema';
import * as XLSX from 'xlsx';
import { createObjectCsvWriter } from 'csv-writer';
import { tmpdir } from 'os';
import { join } from 'path';
import axios from 'axios';
import { storage } from '../storage';
import { db } from '../db';
import { calls } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * GET /api/call-logs
 * List call logs with filters and pagination
 */
router.get('/', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.query.status as string,
      direction: req.query.direction as 'inbound' | 'outbound',
      contactId: req.query.contactId ? parseInt(req.query.contactId as string) : undefined,
      flowId: req.query.flowId ? parseInt(req.query.flowId as string) : undefined,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      phoneNumber: req.query.phoneNumber as string,
      callType: req.query.callType as 'direct' | 'ai-powered'
    };

    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50
    };

    const result = await callLogsService.getCallLogs(
      companyId,
      filters,
      pagination,
      req.user?.id,
      req.user?.role ?? undefined
    );

    res.json({
      success: true,
      data: result.calls,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/stats
 * Get call log statistics
 */
router.get('/stats', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const dateRange = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const stats = await callLogsService.getCallLogStats(companyId, dateRange);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching call log stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/ai-metrics
 * Get AI-specific call metrics
 */
router.get('/ai-metrics', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const dateRange = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const metrics = await callLogsService.getAICallMetrics(companyId, dateRange);
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching AI metrics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/ai-performance
 * Get detailed AI performance analytics
 */
router.get('/ai-performance', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string
    };

    const analytics = await callLogsService.getAIPerformanceAnalytics(companyId, filters);
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching AI performance analytics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/:id
 * Get single call log details
 */
router.get('/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, data: call });
  } catch (error) {
    console.error('Error fetching call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * PUT /api/call-logs/:id
 * Update call log (notes, starred status)
 */
router.put('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const updates: { notes?: string; isStarred?: boolean } = {};
    if (req.body.notes !== undefined) {
      updates.notes = req.body.notes;
    }
    if (req.body.isStarred !== undefined) {
      updates.isStarred = req.body.isStarred;
    }

    const updatedCall = await callLogsService.updateCallLog(companyId, callId, updates);
    if (!updatedCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, data: updatedCall });
  } catch (error) {
    console.error('Error updating call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/call-logs/:id
 * Delete call log
 */
router.delete('/:id', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const deleted = await callLogsService.deleteCallLog(companyId, callId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, message: 'Call log deleted successfully' });
  } catch (error) {
    console.error('Error deleting call log:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/bulk-delete
 * Bulk delete call logs by IDs
 */
router.post('/bulk-delete', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { callIds } = req.body;
    if (!Array.isArray(callIds) || callIds.length === 0) {
      return res.status(400).json({ success: false, error: 'callIds array is required' });
    }

    const validCallIds = callIds
      .map(id => parseInt(String(id)))
      .filter(id => !isNaN(id));

    if (validCallIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid call IDs provided' });
    }

    const deletedCount = await callLogsService.deleteCallLogs(companyId, validCallIds);
    res.json({ success: true, deletedCount, message: `${deletedCount} call log(s) deleted successfully` });
  } catch (error) {
    console.error('Error bulk deleting call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/clear
 * Clear all call logs for the company (optionally with filters)
 */
router.post('/clear', ensureAuthenticated, requirePermission(PERMISSIONS.DELETE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.body.status as string,
      direction: req.body.direction as 'inbound' | 'outbound',
      startDate: req.body.startDate as string,
      endDate: req.body.endDate as string
    };

    const deletedCount = await callLogsService.clearCallLogs(companyId, filters);
    res.json({ success: true, deletedCount, message: `${deletedCount} call log(s) cleared successfully` });
  } catch (error) {
    console.error('Error clearing call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/:id/re-initiate
 * Re-initiate call to same number
 */
router.post('/:id/re-initiate', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }


    const originalCall = await callLogsService.getCallLogById(companyId, callId);
    if (!originalCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }


    const agentConfig = originalCall.agentConfig || req.body.agentConfig;
    if (!agentConfig) {
      return res.status(400).json({ success: false, error: 'Agent configuration required' });
    }


    const callAgentService = await import('../services/call-agent-service');
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                          process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                          'localhost:3000';


    const callResult = await callAgentService.initiateOutboundCall(
      {
        ...agentConfig,
        toNumber: originalCall.to || originalCall.from || '',
        executionMode: 'async'
      },
      webhookBaseUrl
    );

    res.json({ success: true, data: callResult });
  } catch (error) {
    console.error('Error re-initiating call:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/export
 * Export call logs to CSV/Excel
 */
router.get('/export', ensureAuthenticated, requirePermission(PERMISSIONS.EXPORT_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const format = (req.query.format as string) || 'csv';
    const filters = {
      status: req.query.status as string,
      direction: req.query.direction as 'inbound' | 'outbound',
      contactId: req.query.contactId ? parseInt(req.query.contactId as string) : undefined,
      flowId: req.query.flowId ? parseInt(req.query.flowId as string) : undefined,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string
    };


    const result = await callLogsService.getCallLogs(companyId, filters, { page: 1, limit: 10000 }, req.user?.id, req.user?.role ?? undefined);

    if (format === 'excel') {

      const worksheet = XLSX.utils.json_to_sheet(
        result.calls.map(call => ({
          'Call ID': call.id,
          'Status': call.status,
          'Direction': call.direction,
          'From': call.from,
          'To': call.to,
          'Duration (sec)': call.durationSec,
          'Started At': call.startedAt ? new Date(call.startedAt).toISOString() : '',
          'Ended At': call.endedAt ? new Date(call.endedAt).toISOString() : '',
          'Contact': call.contact?.name || '',
          'Flow': call.flow?.name || '',
          'Cost': call.cost || 0,
          'Currency': call.costCurrency || 'USD',
          'Transcript': call.transcript ? JSON.stringify(call.transcript) : '',
          'Notes': call.notes || ''
        }))
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Call Logs');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="call-logs-${Date.now()}.xlsx"`);
      res.send(buffer);
    } else {

      const csvWriter = createObjectCsvWriter({
        path: join(tmpdir(), `call-logs-${Date.now()}.csv`),
        header: [
          { id: 'id', title: 'Call ID' },
          { id: 'status', title: 'Status' },
          { id: 'direction', title: 'Direction' },
          { id: 'from', title: 'From' },
          { id: 'to', title: 'To' },
          { id: 'durationSec', title: 'Duration (sec)' },
          { id: 'startedAt', title: 'Started At' },
          { id: 'endedAt', title: 'Ended At' },
          { id: 'contact', title: 'Contact' },
          { id: 'flow', title: 'Flow' },
          { id: 'cost', title: 'Cost' },
          { id: 'currency', title: 'Currency' },
          { id: 'notes', title: 'Notes' }
        ]
      });

      await csvWriter.writeRecords(
        result.calls.map(call => ({
          id: call.id,
          status: call.status,
          direction: call.direction,
          from: call.from,
          to: call.to,
          durationSec: call.durationSec,
          startedAt: call.startedAt ? new Date(call.startedAt).toISOString() : '',
          endedAt: call.endedAt ? new Date(call.endedAt).toISOString() : '',
          contact: call.contact?.name || '',
          flow: call.flow?.name || '',
          cost: call.cost || 0,
          currency: call.costCurrency || 'USD',
          notes: call.notes || ''
        }))
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="call-logs-${Date.now()}.csv"`);
      res.sendFile(join(tmpdir(), `call-logs-${Date.now()}.csv`));
    }
  } catch (error) {
    console.error('Error exporting call logs:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * GET /api/call-logs/:id/recording
 * Proxy recording download from Twilio
 */
router.get('/:id/recording', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    if (!call.recordingUrl) {
      return res.status(404).json({ success: false, error: 'Recording not available' });
    }


    let accountSid: string | undefined;
    let authToken: string | undefined;

    if (call.channelId && call.channel) {

      const connection = await storage.getChannelConnection(call.channelId);
      if (connection && connection.connectionData) {
        const connectionData = connection.connectionData as any;
        accountSid = connectionData.accountSid;
        authToken = connectionData.authToken;
      }
    }


    if (!accountSid || !authToken) {
      console.error(`[Call Recording] Twilio credentials not available for call ${callId}, channelId: ${call.channelId}`);
      return res.status(500).json({ 
        success: false, 
        error: 'Twilio credentials not available for this call\'s channel connection.' 
      });
    }


    const response = await axios.get(call.recordingUrl, {
      responseType: 'stream',
      auth: {
        username: accountSid,
        password: authToken
      }
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="call-${callId}-recording.mp3"`);
    response.data.pipe(res);
  } catch (error) {
    console.error('Error fetching recording:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * DELETE /api/call-logs/:id/hangup
 * Hang up an active call
 */
router.delete('/:id/hangup', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }


    const call = await callLogsService.getCallLogById(companyId, callId);
    if (!call) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }


    if (!['queued', 'initiated', 'ringing', 'in-progress'].includes(call.status)) {
      return res.status(400).json({ success: false, error: 'Call cannot be terminated - it is already in a terminal state' });
    }


    let accountSid: string | undefined;
    let authToken: string | undefined;

    if (call.channelId && call.channel) {
      const connection = await storage.getChannelConnection(call.channelId);
      if (connection && connection.connectionData) {
        const connectionData = connection.connectionData as any;
        accountSid = connectionData.accountSid;
        authToken = connectionData.authToken;
      }
    }


    const twilioCallSid = call.twilioCallSid || call.callSid;
    

    if (!accountSid || !authToken) {
      console.error(`[Call Hangup] Twilio credentials not available for call ${callId}, channelId: ${call.channelId}`);
      return res.status(500).json({ 
        success: false, 
        error: 'Twilio credentials not available for this call\'s channel connection.' 
      });
    }
    
    if (!twilioCallSid) {
      return res.status(500).json({ success: false, error: 'Twilio call SID not available' });
    }


    try {
      const response = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${twilioCallSid}.json`,
        'Status=completed',
        {
          auth: {
            username: accountSid,
            password: authToken
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );


      await db
        .update(calls)
        .set({ 
          status: 'completed',
          endedAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)));


      const { CallLogsEventEmitter } = await import('../utils/websocket');
      CallLogsEventEmitter.emitCallCompleted(callId, companyId, {
        callSid: twilioCallSid,
        status: 'completed',
        endedAt: new Date()
      });

      res.json({ success: true, message: 'Call terminated successfully' });
    } catch (twilioError: any) {
      console.error('Twilio API error:', twilioError.response?.data || twilioError.message);
      

      if (twilioError.response?.status === 404) {
        await db
          .update(calls)
          .set({ 
            status: 'completed',
            updatedAt: new Date()
          })
          .where(and(eq(calls.id, callId), eq(calls.companyId, companyId)));
        res.json({ success: true, message: 'Call was already completed' });
      } else {
        res.status(500).json({ success: false, error: 'Failed to terminate call' });
      }
    }
  } catch (error) {
    console.error('Error hanging up call:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

/**
 * POST /api/call-logs/:id/link-contact
 * Link call to contact
 */
router.post('/:id/link-contact', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_CALL_LOGS), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const callId = parseInt(req.params.id);
    if (isNaN(callId)) {
      return res.status(400).json({ success: false, error: 'Invalid call ID' });
    }

    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ success: false, error: 'Contact ID required' });
    }

    const updatedCall = await callLogsService.linkCallToContact(companyId, callId, contactId);
    if (!updatedCall) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    res.json({ success: true, data: updatedCall });
  } catch (error) {
    console.error('Error linking call to contact:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
