import { Router, Request, Response } from 'express';
import {
  initiateOutboundCall,
  sanitizeCredential,
  validateTwilioCredentials,
  validateTwilioCredentialsWithAPI,
  configureElevenLabsAgent,
  getCircuitBreakerState,
  getTwilioAuthHeader
} from '../services/call-agent-service';
import { storage } from '../storage';

const router = Router();

/**
 * POST /api/call-agent/test
 * Test call agent configuration by initiating a test call
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const {
      twilioAccountSid,
      twilioAuthToken,
      twilioFromNumber,
      elevenLabsApiKey,
      elevenLabsAgentId,
      customAgentPrompt,
      voiceId,
      voiceSettings,
      audioFormat,
      toPhoneNumber,
      timeout,
      maxCallDuration,
      retryAttempts,
      retryDelay,
      executionMode,
      recordCall,
      transcribeCall
    } = req.body;


    if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials are required (Account SID, Auth Token, From Number)'
      });
    }

    if (!elevenLabsApiKey) {
      return res.status(400).json({
        success: false,
        error: 'ElevenLabs API key is required'
      });
    }

    if (!elevenLabsAgentId && !customAgentPrompt) {
      return res.status(400).json({
        success: false,
        error: 'Either ElevenLabs Agent ID or Custom Agent Prompt is required'
      });
    }

    if (!toPhoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'To phone number is required'
      });
    }


    const originalAccountSid = twilioAccountSid;
    const originalAuthToken = twilioAuthToken;
    const sanitizedAccountSid = sanitizeCredential(twilioAccountSid);
    const sanitizedAuthToken = sanitizeCredential(twilioAuthToken);
    

    if (originalAccountSid !== sanitizedAccountSid || originalAuthToken !== sanitizedAuthToken) {



    }
    

    const validation = validateTwilioCredentials(sanitizedAccountSid, sanitizedAuthToken);
    if (!validation.isValid) {
      console.error('❌ [CallAgent] Route - Credential validation failed:', validation.errors);
      return res.status(400).json({
        success: false,
        error: 'Invalid Twilio credentials format',
        credentialIssues: validation.errors,
        debugInfo: {
          accountSidLength: sanitizedAccountSid.length,
          authTokenLength: sanitizedAuthToken.length,
          wasSanitized: originalAccountSid !== sanitizedAccountSid || originalAuthToken !== sanitizedAuthToken
        }
      });
    }


    const config = {
      twilioAccountSid: sanitizedAccountSid,
      twilioAuthToken: sanitizedAuthToken,
      twilioFromNumber,
      elevenLabsApiKey,
      elevenLabsAgentId,
      elevenLabsPrompt: customAgentPrompt,
      elevenLabsVoiceId: voiceId,
      elevenLabsVoiceSettings: voiceSettings,
      audioFormat: audioFormat || 'ulaw_8000',
      toNumber: toPhoneNumber,
      timeout: timeout || 30,
      maxDuration: maxCallDuration || 600,
      recordCall: recordCall || false,
      transcribeCall: transcribeCall || false,
      retryAttempts: retryAttempts || 0,
      retryDelay: retryDelay || 60,
      executionMode: executionMode || 'blocking'
    };


    const protocol = req.protocol;
    const host = req.get('host');
    const webhookBaseUrl = `${protocol}://${host}`;


    const validationReport: { twilio?: any; elevenLabs?: any; circuitBreaker?: any } = {};
    const twilioValidation = await validateTwilioCredentialsWithAPI(sanitizedAccountSid, sanitizedAuthToken);
    validationReport.twilio = {
      valid: twilioValidation.valid,
      ...(twilioValidation.accountInfo && { accountInfo: twilioValidation.accountInfo }),
      ...(twilioValidation.error && { error: twilioValidation.error })
    };
    if (!twilioValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Twilio credentials validation failed',
        validationReport,
        suggestions: twilioValidation.suggestions
      });
    }
    if (elevenLabsApiKey && (elevenLabsAgentId || customAgentPrompt)) {
      try {
        await configureElevenLabsAgent(config);
        validationReport.elevenLabs = { valid: true };
      } catch (elErr: any) {
        validationReport.elevenLabs = { valid: false, error: elErr.message };
        return res.status(400).json({
          success: false,
          error: 'ElevenLabs configuration validation failed',
          validationReport
        });
      }
    }
    const circuitState = getCircuitBreakerState();
    if (circuitState.isOpen) {
      validationReport.circuitBreaker = { open: true, nextAttemptTime: circuitState.nextAttemptTime };
      return res.status(503).json({
        success: false,
        error: 'Circuit breaker is open - try again after recovery',
        validationReport
      });
    }


    const callResult = await initiateOutboundCall(config, webhookBaseUrl);


    let transcript;
    if (transcribeCall) {


      transcript = undefined;
    }


    res.json({
      success: true,
      callSid: callResult.callSid,
      duration: 0, // Will be updated when call completes
      transcript: transcript,
      validationReport: { twilio: validationReport.twilio, elevenLabs: validationReport.elevenLabs }
    });

  } catch (error: any) {
    console.error('[CallAgent] Test call error:', error);
    

    let credentialIssues = [];
    let debugInfo = {};
    

    if (error.message && error.message.includes('Invalid Twilio credentials')) {
      credentialIssues = error.message.split(',').map((e: string) => e.trim());
    }
    

    if (error.message && error.message.includes('20003')) {
      credentialIssues.push('Twilio authentication failed (Error 20003)');
      debugInfo = {
        errorType: 'twilio_auth_error',
        errorCode: 20003,
        documentation: 'https://www.twilio.com/docs/errors/20003'
      };
    }
    

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate test call',
      ...(credentialIssues.length > 0 && { credentialIssues }),
      ...(Object.keys(debugInfo).length > 0 && { debugInfo })
    });
  }
});

/**
 * POST /api/call-agent/validate-credentials
 * Validate Twilio credentials without initiating calls
 */
router.post('/validate-credentials', async (req: Request, res: Response) => {
  try {
    const { twilioAccountSid, twilioAuthToken } = req.body;


    if (!twilioAccountSid || !twilioAuthToken) {
      return res.status(400).json({
        success: false,
        error: 'Both Twilio Account SID and Auth Token are required'
      });
    }


    const validationResult = await validateTwilioCredentialsWithAPI(twilioAccountSid, twilioAuthToken);


    res.json(validationResult);

  } catch (error: any) {
    console.error('[CallAgent] Credential validation error:', error);
    

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to validate credentials'
    });
  }
});

/**
 * POST /api/call-agent/validate-integration
 * Comprehensive integration validation: Twilio, ElevenLabs, audio format, circuit breaker
 */
router.post('/validate-integration', async (req: Request, res: Response) => {
  try {
    const {
      twilioAccountSid,
      twilioAuthToken,
      elevenLabsApiKey,
      elevenLabsAgentId,
      customAgentPrompt,
      audioFormat
    } = req.body;

    const report: {
      success: boolean;
      twilio: { valid: boolean; accountInfo?: any; error?: string; suggestions?: string[] };
      elevenLabs: { valid: boolean; agentValid?: boolean; formatCompatible?: boolean; error?: string };
      circuitBreaker: { state: string; isOpen: boolean; failureCount: number };
      recommendations: string[];
    } = {
      success: true,
      twilio: { valid: false },
      elevenLabs: { valid: false },
      circuitBreaker: { state: 'unknown', isOpen: false, failureCount: 0 },
      recommendations: []
    };

    if (twilioAccountSid && twilioAuthToken) {
      const sanitizedSid = sanitizeCredential(twilioAccountSid);
      const sanitizedToken = sanitizeCredential(twilioAuthToken);
      const formatOk = validateTwilioCredentials(sanitizedSid, sanitizedToken).isValid;
      if (!formatOk) {
        report.twilio = { valid: false, error: 'Invalid credential format' };
        report.recommendations.push('Fix Twilio Account SID (34 chars, starts with AC) and Auth Token (32 chars)');
      } else {
        const apiResult = await validateTwilioCredentialsWithAPI(sanitizedSid, sanitizedToken);
        report.twilio = {
          valid: apiResult.valid,
          ...(apiResult.accountInfo && { accountInfo: apiResult.accountInfo }),
          ...(apiResult.error && { error: apiResult.error }),
          ...(apiResult.suggestions && { suggestions: apiResult.suggestions })
        };
        if (!apiResult.valid) report.success = false;
      }
    } else {
      report.twilio = { valid: false, error: 'Twilio credentials not provided' };
    }

    if (elevenLabsApiKey && (elevenLabsAgentId || customAgentPrompt)) {
      const config = {
        twilioAccountSid: twilioAccountSid || '',
        twilioAuthToken: twilioAuthToken || '',
        twilioFromNumber: '',
        elevenLabsApiKey,
        elevenLabsAgentId,
        elevenLabsPrompt: customAgentPrompt,
        audioFormat: audioFormat || 'ulaw_8000',
        toNumber: '',
        executionMode: 'blocking' as const
      };
      try {
        await configureElevenLabsAgent(config);
        report.elevenLabs = { valid: true, agentValid: true, formatCompatible: true };
      } catch (err: any) {
        report.elevenLabs = { valid: false, error: err.message };
        report.success = false;
        report.recommendations.push(err.message);
      }
    } else {
      report.elevenLabs = { valid: false, error: 'ElevenLabs API key and Agent ID or Prompt not provided' };
    }

    const cb = getCircuitBreakerState();
    report.circuitBreaker = {
      state: (cb as any).state ?? (cb.isOpen ? 'open' : 'closed'),
      isOpen: cb.isOpen,
      failureCount: cb.failureCount
    };
    if (cb.isOpen) {
      report.recommendations.push('Circuit breaker is open - wait before placing calls');
    }

    res.json(report);
  } catch (error: any) {
    console.error('[CallAgent] validate-integration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Validation failed',
      twilio: { valid: false },
      elevenLabs: { valid: false },
      circuitBreaker: { state: 'unknown', isOpen: false, failureCount: 0 },
      recommendations: []
    });
  }
});

/**
 * GET /api/call-agent/troubleshoot/:connectionId
 * Run comprehensive diagnostics for a Twilio Voice connection (accessible to company admins)
 */
router.get('/troubleshoot/:connectionId', async (req: Request, res: Response) => {
  try {
    const connectionId = parseInt(req.params.connectionId, 10);
    if (isNaN(connectionId)) {
      return res.status(400).json({ success: false, error: 'Invalid connection ID' });
    }
    const user = (req as any).user;
    if (!user?.companyId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection not found' });
    }
    if (connection.channelType !== 'twilio_voice') {
      return res.status(400).json({ success: false, error: 'Not a Twilio Voice connection' });
    }
    if (connection.companyId !== user.companyId) {
      return res.status(403).json({ success: false, error: 'Access denied: connection does not belong to your company' });
    }

    const data = connection.connectionData as any;
    const accountSid = data?.accountSid ? sanitizeCredential(data.accountSid) : '';
    const authToken = data?.authToken ? sanitizeCredential(data.authToken) : '';
    const apiKey = data?.apiKey ?? '';
    const apiSecret = data?.apiSecret ?? '';
    const twimlAppSid = data?.twimlAppSid ?? '';
    const elevenLabsApiKey = data?.elevenLabsApiKey ?? '';
    const elevenLabsAgentId = data?.elevenLabsAgentId ?? '';
    const statusCallbackUrl = data?.statusCallbackUrl ?? '';

    const report: {
      success: boolean;
      connectionId: number;
      issues: Array<{ severity: 'critical' | 'warning' | 'info'; section: string; message: string; suggestion?: string; documentation?: string }>;
      twilioAccount: { status: string; friendlyName?: string; error?: string };
      phoneNumber: { voiceEnabled?: boolean; error?: string };
      twimlApp: { status: string; appName?: string; error?: string };
      webhook: { accessible?: boolean; error?: string };
      elevenLabs: { status: string; error?: string };
      recentFailures: { count?: number; sample?: string };
      circuitBreaker: { state: string; isOpen: boolean; failureCount: number };
      conferenceCleanup: { status?: string };
    } = {
      success: true,
      connectionId,
      issues: [],
      twilioAccount: { status: 'unknown' },
      phoneNumber: {},
      twimlApp: { status: 'unknown' },
      webhook: {},
      elevenLabs: { status: 'not_configured' },
      recentFailures: {},
      circuitBreaker: { state: 'unknown', isOpen: false, failureCount: 0 },
      conferenceCleanup: {}
    };

    const cb = getCircuitBreakerState();
    report.circuitBreaker = {
      state: (cb as any).state ?? (cb.isOpen ? 'open' : 'closed'),
      isOpen: cb.isOpen,
      failureCount: cb.failureCount
    };
    if (cb.isOpen) {
      report.issues.push({
        severity: 'warning',
        section: 'Circuit Breaker',
        message: 'Circuit breaker is open - calls may be temporarily blocked',
        suggestion: 'Wait for recovery or contact support',
        documentation: 'https://www.twilio.com/docs/voice'
      });
    }

    if (!accountSid || !authToken) {
      report.twilioAccount = { status: 'error', error: 'Credentials not configured' };
      report.issues.push({ severity: 'critical', section: 'Twilio', message: 'Account SID or Auth Token missing', suggestion: 'Add credentials in connection settings' });
    } else {
      try {
        const twilioResult = await validateTwilioCredentialsWithAPI(accountSid, authToken);
        report.twilioAccount = {
          status: twilioResult.valid ? 'valid' : 'error',
          friendlyName: twilioResult.accountInfo?.friendlyName,
          error: twilioResult.error
        };
        if (!twilioResult.valid) {
          report.success = false;
          report.issues.push({
            severity: 'critical',
            section: 'Twilio Account',
            message: twilioResult.error || 'Invalid credentials',
            suggestion: 'Verify Account SID and Auth Token in Twilio Console',
            documentation: 'https://www.twilio.com/docs/errors/20003'
          });
        }
      } catch (err: any) {
        report.twilioAccount = { status: 'error', error: err.message };
        report.issues.push({ severity: 'critical', section: 'Twilio Account', message: err.message, suggestion: 'Verify webhook URL is HTTPS' });
      }
    }

    if (twimlAppSid && accountSid && authToken && report.twilioAccount.status === 'valid') {
      try {
        const axios = (await import('axios')).default;
        const appRes = await axios.get(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`,
          { headers: { Authorization: getTwilioAuthHeader(accountSid, authToken) }, timeout: 5000 }
        );
        report.twimlApp = { status: 'valid', appName: appRes.data?.friendly_name };
      } catch (err: any) {
        report.twimlApp = { status: 'error', error: err.response?.data?.message || err.message };
        report.issues.push({
          severity: 'warning',
          section: 'TwiML App',
          message: 'TwiML App not found or inaccessible',
          suggestion: 'Verify TwiML App SID in Twilio Console → Voice → TwiML Apps'
        });
      }
    }

    if (statusCallbackUrl && (statusCallbackUrl.startsWith('http://') || statusCallbackUrl.startsWith('https://'))) {
      try {
        const axios = (await import('axios')).default;
        const headRes = await axios.head(statusCallbackUrl, { timeout: 5000, validateStatus: () => true });
        report.webhook = { accessible: headRes.status < 500 };
        if (headRes.status >= 400) {
          report.issues.push({
            severity: 'warning',
            section: 'Webhook',
            message: `Status callback URL returned ${headRes.status}`,
            suggestion: 'Verify webhook URL is publicly accessible via HTTPS'
          });
        }
      } catch (err: any) {
        report.webhook = { accessible: false, error: (err as Error).message };
        report.issues.push({
          severity: 'warning',
          section: 'Webhook',
          message: 'Webhook URL not reachable',
          suggestion: 'Verify webhook URL is publicly accessible (HTTPS recommended)'
        });
      }
    }

    if (elevenLabsApiKey) {
      try {
        const axios = (await import('axios')).default;
        const userRes = await axios.get('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': elevenLabsApiKey },
          timeout: 5000
        });
        report.elevenLabs = { status: userRes.status === 200 ? 'valid' : 'error' };
        if (elevenLabsAgentId) {
          try {
            const agentRes = await axios.get(
              `https://api.elevenlabs.io/v1/convai/agents/${elevenLabsAgentId}`,
              { headers: { 'xi-api-key': elevenLabsApiKey }, timeout: 3000 }
            );
            if (!agentRes.data) report.elevenLabs = { ...report.elevenLabs, status: 'error', error: 'Agent not found' };
          } catch (agentErr: any) {
            report.elevenLabs = { status: 'error', error: agentErr.response?.data?.detail || agentErr.message };
          }
        }
      } catch (err: any) {
        report.elevenLabs = { status: 'error', error: (err as Error).message };
        report.issues.push({
          severity: 'warning',
          section: 'ElevenLabs',
          message: 'ElevenLabs API unreachable or invalid key',
          suggestion: 'Verify API key and agent ID in ElevenLabs dashboard'
        });
      }
    }

    try {
      const { callLogsService } = await import('../services/call-logs-service');
      const { calls: recentCalls } = await callLogsService.getCallLogs(
        user.companyId,
        { status: 'failed' },
        { page: 1, limit: 50 },
        undefined,
        undefined
      );
      const byChannel = (recentCalls as any[])?.filter((c: any) => c.channelId === connectionId) ?? [];
      report.recentFailures = { count: byChannel.length, sample: byChannel[0]?.failureReason };
    } catch {
      report.recentFailures = {};
    }

    try {
      const { conferenceCleanupScheduler } = await import('../services/conference-cleanup-scheduler');
      const stats = conferenceCleanupScheduler.getCleanupStats?.() ?? {};
      report.conferenceCleanup = { status: typeof stats === 'object' ? 'active' : 'unknown' };
    } catch {
      report.conferenceCleanup = { status: 'unknown' };
    }

    return res.json(report);
  } catch (error: any) {
    console.error('[CallAgent] troubleshoot error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Troubleshooting failed',
      issues: []
    });
  }
});

export default router;
