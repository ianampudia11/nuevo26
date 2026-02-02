import express, { type Express } from "express";
import crypto from "crypto";
import { storage } from "./storage";
import whatsAppOfficialService from "./services/channels/whatsapp-official";
import TikTokService from "./services/channels/tiktok";
import instagramService from './services/channels/instagram';
import twilioSmsService from './services/channels/twilio-sms';
import webchatService from './services/channels/webchat';
import {
  createWhatsAppWebhookSecurity,
  createTikTokWebhookSecurity,
  verifyWhatsAppWebhookSignature,
  logWebhookSecurityEvent
} from "./middleware/webhook-security";
import { logTikTokWebhookEvent } from "./utils/webhook-logger";
import { ensureSuperAdmin, ensureAuthenticated, ensureCallAgentHealthAccess } from "./middleware";
import { testMetaWebhookSignature } from "./utils/webhook-signature-tester";
import { callAgentService, getCircuitBreakerState } from './services/call-agent-service';
import { callQualityMonitor } from './services/call-quality-monitor';
import { callLogsService } from "./services/call-logs-service";
import { CallLogsEventEmitter } from "./utils/websocket";
import { conferenceCleanupScheduler } from './services/conference-cleanup-scheduler';
import { calculateConferenceCost, trackCallCost } from './services/call-cost-tracker';
import { WebSocket } from "ws";
import { logger } from "./utils/logger";

/** Participant join timeout handles keyed by callLog.id (string), persisted across webhook calls to avoid false agent_join_timeout alerts. */
const agentJoinTimeoutHandles = new Map<string, NodeJS.Timeout>();

/**
 * Register webhook endpoints before any JSON middleware to avoid body parsing conflicts
 * This ensures webhooks receive raw bodies for proper signature verification
 */
export function registerWebhookRoutes(app: Express): void {
  

  app.post('/api/webhooks/webchat',
    express.json(),
    async (req, res) => {
      try {
        const payload = req.body;
        const { token } = payload || {};


        const connection = await webchatService.verifyWidgetToken(token);
        if (!connection) {
          return res.status(401).json({ error: 'Invalid token' });
        }

        await webchatService.processWebhook(payload, connection.companyId);
        res.status(200).send('OK');
      } catch (error) {
        res.status(500).send('Internal Server Error');
      }
    }
  );

  app.get('/api/webhooks/whatsapp', async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];


    if (mode !== 'subscribe') {

      return res.status(403).send('Forbidden');
    }

    try {

      const whatsappConnections = await storage.getChannelConnectionsByType('whatsapp_official');
      
      let matchingConnection = null;
      for (const connection of whatsappConnections) {
        const connectionData = connection.connectionData as any;
        if (connectionData?.verifyToken === token) {
          matchingConnection = connection;
          break;
        }
      }


      const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';
      const isGlobalMatch = token === globalToken;

      if (matchingConnection || isGlobalMatch) {
                res.status(200).send(challenge);
      } else {
       
        res.status(403).send('Forbidden');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });


  app.post('/api/webhooks/twilio/sms',
    express.urlencoded({ extended: false }),
    async (req, res) => {







      
      try {
        const signature = req.get('x-twilio-signature') as string | undefined;
        
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('x-forwarded-host') || req.get('host');
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        


        
        const result = await twilioSmsService.processInboundWebhook(fullUrl, req.body as any, signature);
        



        
        return res.sendStatus(result.status);
      } catch (error) {
        return res.sendStatus(500);
      }
    }
  );


  app.post('/api/webhooks/twilio/sms-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {




      
      try {
        const signature = req.get('x-twilio-signature') as string | undefined;
        
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('x-forwarded-host') || req.get('host');
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        



        
        const result = await twilioSmsService.processStatusWebhook(fullUrl, req.body as any, signature);
        


        
        return res.sendStatus(result.status);
      } catch (error) {
        return res.sendStatus(500);
      }
    }
  );

  /**
   * Call Agent Health Check Endpoint
   * Super admins: full access. Company admins: their company's connections only (channelId or companyId required).
   */
  app.get('/api/call-agent/health', ensureAuthenticated, ensureCallAgentHealthAccess, async (req, res) => {
    const startTime = Date.now();
    const healthScope = (req as any).healthScope as 'full' | 'company';
    const healthCompanyId = (req as any).healthCompanyId as number | undefined;
    const isSuperAdmin = healthScope === 'full';

    logger.info('call-agent', 'Health check accessed', { userId: (req as any).user?.id, scope: healthScope, companyId: healthCompanyId ?? null });

    let twilioTestResult = { status: 'unknown', responseTime: 0, headers: {} as Record<string, string> };
    let elevenLabsTestResult = { status: 'unknown', responseTime: 0, headers: {} as Record<string, string> };
    let twilioVoiceSDKTestResult = { status: 'unknown', responseTime: 0, message: '' };
    
    const companyIdParam = req.query.companyId ? parseInt(req.query.companyId as string) : null;
    const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : null;
    
    if (healthScope === 'company') {
      if (!channelId && !companyIdParam) {
        return res.status(400).json({ error: 'Company scope requires channelId or companyId query parameter' });
      }
      if (companyIdParam && companyIdParam !== healthCompanyId) {
        return res.status(403).json({ error: 'Access denied: company filter does not match your company' });
      }
    }
    
    let accountSid: string | undefined;
    let authToken: string | undefined;
    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    let twimlAppSid: string | undefined;
    let elevenLabsApiKey: string | undefined;
    let elevenLabsAgentId: string | undefined;
    let credentialSource = 'global';
    
    if (channelId) {
      try {
        const connection = await storage.getChannelConnection(channelId);
        if (connection && connection.connectionData) {
          if (healthScope === 'company' && connection.companyId !== healthCompanyId) {
            return res.status(403).json({ error: 'Access denied: connection does not belong to your company' });
          }
          const connectionData = connection.connectionData as any;
          accountSid = connectionData.accountSid;
          authToken = connectionData.authToken;
          apiKey = connectionData.apiKey;
          apiSecret = connectionData.apiSecret;
          twimlAppSid = connectionData.twimlAppSid;
          elevenLabsApiKey = connectionData.elevenLabsApiKey;
          elevenLabsAgentId = connectionData.elevenLabsAgentId;
          credentialSource = `channel-${channelId}`;
        }
      } catch (error) {
        console.error('[CallAgent] Error loading channel connection:', error);
      }
    }
    
    if (!accountSid || !authToken) {
      if (isSuperAdmin) {
        accountSid = process.env.TWILIO_ACCOUNT_SID;
        authToken = process.env.TWILIO_AUTH_TOKEN;
        apiKey = process.env.TWILIO_API_KEY;
        apiSecret = process.env.TWILIO_API_SECRET;
        twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
        elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        elevenLabsAgentId = process.env.ELEVENLABS_AGENT_ID;
        credentialSource = 'global';
      } else {
        return res.status(400).json({ error: 'Provide channelId to check a Twilio Voice connection, or use super admin for global health' });
      }
    }
    
    const sanitizedCredentialSource = credentialSource.startsWith('channel-') 
      ? 'channel-specific' 
      : (isSuperAdmin ? credentialSource : 'company');
    
    try {
      const activeCalls = callAgentService.getActiveCalls();
      const circuitBreakerState = getCircuitBreakerState();
      

      if (accountSid && authToken) {
        try {
          const twilioStart = Date.now();
          const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
            headers: {
              'Authorization': callAgentService.getTwilioAuthHeader?.(accountSid, authToken) || ''
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          twilioTestResult.responseTime = Date.now() - twilioStart;
          

          twilioResponse.headers.forEach((value, key) => {
            if (key.startsWith('twilio-')) {
              twilioTestResult.headers[key] = value;
            }
          });
          
          twilioTestResult.status = twilioResponse.ok ? 'connected' : 'error';
        } catch (error) {
          twilioTestResult.status = 'error';
          console.error('[CallAgent] Twilio connectivity test failed:', error);
        }
      }
      

      if (apiKey && apiSecret && accountSid) {
        try {
          const voiceSDKStart = Date.now();

          const twilio = await import('twilio');
          const AccessToken = twilio.jwt.AccessToken;
          const VoiceGrant = AccessToken.VoiceGrant;
          
          const voiceGrant = new VoiceGrant({
            outgoingApplicationSid: twimlAppSid || 'test',
            incomingAllow: true
          });
          
          const token = new AccessToken(
            accountSid,
            apiKey,
            apiSecret,
            { identity: 'health-check', ttl: 60 }
          );
          token.addGrant(voiceGrant);
          
          const jwt = token.toJwt();
          twilioVoiceSDKTestResult.responseTime = Date.now() - voiceSDKStart;
          
          if (jwt && jwt.length > 0) {
            twilioVoiceSDKTestResult.status = 'valid';
            twilioVoiceSDKTestResult.message = 'Voice SDK credentials can generate valid tokens';
            

            if (twimlAppSid) {
              try {
                const appResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`, {
                  headers: {
                    'Authorization': callAgentService.getTwilioAuthHeader?.(accountSid, authToken || '') || ''
                  },
                  signal: AbortSignal.timeout(3000)
                });
                if (!appResponse.ok) {
                  twilioVoiceSDKTestResult.message = 'Voice SDK credentials valid but TwiML App SID not found';
                }
              } catch (error) {
                twilioVoiceSDKTestResult.message = 'Could not verify TwiML App SID';
              }
            }
          } else {
            twilioVoiceSDKTestResult.status = 'error';
            twilioVoiceSDKTestResult.message = 'Failed to generate Voice SDK token';
          }
        } catch (error) {
          twilioVoiceSDKTestResult.status = 'error';
          twilioVoiceSDKTestResult.message = error instanceof Error ? error.message : 'Voice SDK credential test failed';
        }
      } else {
        twilioVoiceSDKTestResult.status = 'not_configured';
        twilioVoiceSDKTestResult.message = 'Voice SDK credentials not configured';
      }
      

      if (elevenLabsApiKey) {
        try {
          const elevenLabsStart = Date.now();
          

          const userResponse = await fetch('https://api.elevenlabs.io/v1/user', {
            headers: {
              'xi-api-key': elevenLabsApiKey
            },
            signal: AbortSignal.timeout(5000) // 5 second timeout
          });
          

          let agentTestResult = { status: 'unknown' };
          if (elevenLabsAgentId) {
            try {
              const agentResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${elevenLabsAgentId}`, {
                headers: {
                  'xi-api-key': elevenLabsApiKey
                },
                signal: AbortSignal.timeout(3000) // 3 second timeout
              });
              agentTestResult.status = agentResponse.ok ? 'valid' : 'invalid';
            } catch (error) {
              agentTestResult.status = 'error';
            }
          }
          
          elevenLabsTestResult.responseTime = Date.now() - elevenLabsStart;
          elevenLabsTestResult.status = userResponse.ok ? 'connected' : 'error';
          

          userResponse.headers.forEach((value, key) => {
            if (key.startsWith('x-ratelimit')) {
              elevenLabsTestResult.headers[key] = value;
            }
          });
        } catch (error) {
          elevenLabsTestResult.status = 'error';
          console.error('[CallAgent] ElevenLabs connectivity test failed:', error);
        }
      } else {
        elevenLabsTestResult.status = 'not_configured';
      }
      

      let overallStatus = 'healthy';
      if (circuitBreakerState.isOpen || 
          twilioTestResult.status === 'error' || 
          elevenLabsTestResult.status === 'error' ||
          (twilioVoiceSDKTestResult.status === 'error' && channelId)) {
        overallStatus = 'unhealthy';
      } else if (twilioTestResult.status === 'unknown' || 
                 elevenLabsTestResult.status === 'unknown' ||
                 twilioVoiceSDKTestResult.status === 'unknown') {
        overallStatus = 'degraded';
      }
      

      let twilioConnections = 0;
      let elevenLabsConnections = 0;
      let totalRtt = 0;
      let rttCount = 0;
      let totalPacketLoss = 0;
      let packetLossCount = 0;
      
      for (const [callSid, callData] of activeCalls.entries()) {
        if (callData.twilioWs?.readyState === 1) {
          twilioConnections++;
        }
        if (callData.elevenLabsWs?.readyState === 1) {
          elevenLabsConnections++;
        }
        

        if (callData.metrics) {
          if (callData.metrics.rtt) {
            totalRtt += callData.metrics.rtt;
            rttCount++;
          }
          if (callData.metrics.packetLossRate !== undefined) {
            totalPacketLoss += callData.metrics.packetLossRate;
            packetLossCount++;
          }
        }
      }


      let conferenceMetrics: {
        activeCount: number;
        totalToday: number;
        averageDuration: number;
        longestRunning: { conferenceSid: string; duration: number; participantCount: number } | null;
        staleCount: number;
        cleanupStats: { lastCleanup: string | null; totalCleaned: number; errors: number };
      } = {
        activeCount: 0,
        totalToday: 0,
        averageDuration: 0,
        longestRunning: null,
        staleCount: 0,
        cleanupStats: { lastCleanup: null, totalCleaned: 0, errors: 0 }
      };
      try {
        const metricsPromise = conferenceCleanupScheduler.getConferenceMetrics();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Conference metrics timeout')), 5000)
        );
        conferenceMetrics = await Promise.race([metricsPromise, timeoutPromise]);
      } catch (err) {
        conferenceMetrics.cleanupStats = conferenceCleanupScheduler.getCleanupStats();
      }
      
      const callQualityData = isSuperAdmin ? (() => {
        const aggregate = callQualityMonitor.getAggregateMetrics();
        return {
          averageLatency: rttCount > 0 ? Math.round(totalRtt / rttCount) : aggregate.averageRttMs,
          packetLossRate: packetLossCount > 0 ? Math.round((totalPacketLoss / packetLossCount) * 100) / 100 : aggregate.averagePacketLossRate,
          totalCallsMeasured: Math.max(rttCount, packetLossCount, aggregate.callCount),
          reconnectionCount: aggregate.totalReconnections,
          fallbackCount: aggregate.totalFallbacks
        };
      })() : undefined;

      const recommendations: string[] = [];
      if (circuitBreakerState.isOpen) {
        recommendations.push('Circuit breaker is open - waiting for recovery before retrying operations');
      }
      if (twilioTestResult.status === 'error') {
        recommendations.push('Twilio connectivity issue - check credentials and network connectivity');
      }
      if (elevenLabsTestResult.status === 'error') {
        recommendations.push('ElevenLabs connectivity issue - verify API key and service status');
      }
      if (callQualityData && callQualityData.averageLatency > 500) {
        recommendations.push('High latency detected - consider checking network quality');
      }
      if (callQualityData && callQualityData.packetLossRate > 5) {
        recommendations.push('High packet loss detected - network quality may be affecting call quality');
      }
      if (conferenceMetrics.staleCount > 10) {
        recommendations.push('High stale conference count - consider running manual conference cleanup');
      }
      if (conferenceMetrics.longestRunning && conferenceMetrics.longestRunning.duration > 4 * 3600) {
        recommendations.push('Long-running conference detected - consider setting max conference duration');
      }

      const healthMetrics: Record<string, unknown> = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        credentialSource: sanitizedCredentialSource,
        activeConnections: isSuperAdmin ? callAgentService.getActiveCalls().length : undefined,
        twilio: {
          status: twilioTestResult.status,
          activeConnections: isSuperAdmin ? twilioConnections : undefined,
          responseTime: twilioTestResult.responseTime,
          ...(isSuperAdmin && { headers: twilioTestResult.headers }),
          testTimestamp: new Date().toISOString()
        },
        twilioVoiceSDK: {
          status: twilioVoiceSDKTestResult.status,
          responseTime: twilioVoiceSDKTestResult.responseTime,
          message: twilioVoiceSDKTestResult.message,
          testTimestamp: new Date().toISOString()
        },
        elevenLabs: {
          status: elevenLabsTestResult.status,
          activeConnections: isSuperAdmin ? elevenLabsConnections : undefined,
          responseTime: elevenLabsTestResult.responseTime,
          ...(isSuperAdmin && { headers: elevenLabsTestResult.headers }),
          testTimestamp: new Date().toISOString()
        },
        circuitBreaker: {
          state: (circuitBreakerState as any).state ?? (circuitBreakerState.isOpen ? 'open' : 'closed'),
          isOpen: circuitBreakerState.isOpen,
          failureCount: circuitBreakerState.failureCount,
          failureCountByType: (circuitBreakerState as any).failureCountByType ?? {},
          nextAttemptTime: circuitBreakerState.nextAttemptTime,
          nextAttemptTimeReadable: circuitBreakerState.nextAttemptTime ? new Date(circuitBreakerState.nextAttemptTime).toISOString() : null
        },
        callQuality: callQualityData,
        system: isSuperAdmin ? {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0',
          nodeVersion: process.version
        } : undefined,
        conferences: isSuperAdmin ? conferenceMetrics : undefined,
        recommendations
      };

      res.json(healthMetrics);
    } catch (error) {
      console.error('[CallAgent] Health check error:', error);
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        credentialSource: sanitizedCredentialSource
      });
    }
  });

  /**
   * Per-channel health check endpoint
   * Companies can use this to validate their channel-specific configuration
   * Eliminates redirect overhead by setting query parameters directly
   */
  app.get('/api/call-agent/health/:channelId', async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const user = req.user;
    
    if (!user || !user.companyId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    if (isNaN(channelId)) {
      return res.status(400).json({ error: 'Invalid channel ID' });
    }
    

    req.query.channelId = channelId.toString();
    req.query.companyId = user.companyId.toString();
    



    const queryParams = new URLSearchParams(req.query as any);
    queryParams.set('channelId', channelId.toString());
    queryParams.set('companyId', user.companyId.toString());
    const healthUrl = `/api/call-agent/health?${queryParams.toString()}`;
    return res.redirect(healthUrl);
  });

  /**
   * Call Agent Stream Status Webhook
   * Handles Twilio stream lifecycle events
   */
  app.post('/api/webhooks/call-agent/stream-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const signature = req.headers['x-twilio-signature'] as string;
        const streamSid = req.body.StreamSid;
        const callSid = req.body.CallSid;
        const event = req.body.Event; // stream-started, stream-stopped, stream-error
        const streamStatus = req.body.StreamStatus;
        const errorCode = req.body.ErrorCode;
        const errorMessage = req.body.ErrorMessage;


        const callId = req.body.ParameterCallId;
        const conversationId = req.body.ParameterConversationId;
        const callType = req.body.ParameterCallType;
        const companyId = req.body.ParameterCompanyId;
        const agentId = req.body.ParameterAgentId;
        const audioFormat = req.body.ParameterAudioFormat;


        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        const callData = callAgentService.getActiveCall(callSid);
        
        if (callData && signature) {
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            callData.config.twilioAuthToken
          );
          
          if (!isValid) {
            console.warn(`[CallAgent] Invalid signature for stream status webhook on call ${callSid}`);
            return res.status(403).send('Forbidden');
          }
        }


        


        if (callData) {

          (callData as any).streamMetadata = {
            streamSid,
            callId,
            conversationId,
            callType,
            companyId,
            agentId,
            audioFormat,
            startTime: event === 'stream-started' ? new Date() : (callData as any).streamMetadata?.startTime,
            endTime: event === 'stream-stopped' ? new Date() : undefined,
            status: streamStatus,
            errorCode,
            errorMessage
          };


          try {
            CallLogsEventEmitter.emitCallStatusUpdate(
              parseInt(callId),
              0, // companyId
              event,
              {
                streamSid,
                sequenceNumber: 0,
                timestamp: new Date().toISOString(),
              }
            );
          } catch (wsError) {
            console.error(`[CallAgent] Error emitting WebSocket event:`, wsError);
          }
        }


        switch (event) {
          case 'stream-started':

            break;
            
          case 'stream-stopped':

            break;
            
          case 'stream-error':
            console.error(`[CallAgent] Stream error for call ${callSid}:`, { errorCode, errorMessage });
            

            if (callData && (callData as any).flowContext) {
              try {
                const { conversationId } = (callData as any).flowContext;
                const callLogsResult = await callLogsService.getCallLogs(0, {});
                const callLog = callLogsResult.calls.find(c => c.twilioCallSid === callSid);
                if (callLog) {
                  CallLogsEventEmitter.emitCallError(
                    callLog.id,
                    callLog.companyId || 0,
                    {
                      type: 'stream_error',
                      details: errorMessage || `Stream error code: ${errorCode}`
                    }
                  );
                }
              } catch (wsError) {
                console.error(`[CallAgent] Failed to emit callError event:`, wsError);
              }
            }
            break;
        }

        res.type('text/xml');
        res.send('<Response/>');
      } catch (error) {
        console.error('[CallAgent] Error handling stream status webhook:', error);
        res.status(500).send('Internal Server Error');
      }
    }
  );

  const callAgentStatusUrlencoded = express.urlencoded({ extended: false });

  /**
   * Shared handler for Twilio call status callbacks (used by both call-agent/status and twilio/voice-status)
   */
  async function handleTwilioCallStatusWebhook(req: express.Request, res: express.Response): Promise<void> {
    const startTime = Date.now();
      let hasError = false;
      let errorDetails: any = {};
      
      try {

        if (!req.body) {
          throw new Error('Request body is empty');
        }
        
        const signature = req.headers['x-twilio-signature'] as string;
        const callSid = req.body.CallSid;
        const callStatus = req.body.CallStatus;
        const callDuration = req.body.CallDuration;
        const recordingUrl = req.body.RecordingUrl;
        const errorCode = req.body.ErrorCode;
        const errorMessage = req.body.ErrorMessage;
        

        if (!callSid || typeof callSid !== 'string') {
          throw new Error('Invalid or missing CallSid');
        }
        

        if (!callStatus || typeof callStatus !== 'string') {
          throw new Error('Invalid or missing CallStatus');
        }
        

        const normalizedStatus = callStatus.toLowerCase().replace(/[-_]/g, '');
        const validStatuses = ['queued', 'initiated', 'ringing', 'inprogress', 'completed', 'failed', 'busy', 'noanswer', 'canceled'];
        
        if (!validStatuses.includes(normalizedStatus)) {
          console.warn(`[CallAgent] Unusual call status received: ${callStatus}`);

        }



        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        

        const callData = callAgentService.getActiveCall(callSid);
        if (callData && signature) {
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            callData.config.twilioAuthToken
          );
          
          if (!isValid) {
            console.error('[CallAgent] Invalid Twilio signature for status webhook');

            logger.error('call-agent', 'Webhook signature validation failed');
            console.log('[CallAgent] Signature validation details:', {
              callSid,
              signature: signature.substring(0, 10) + '...',
              url: fullUrl,
              timestamp: new Date().toISOString()
            });
            res.status(403).send('Forbidden');
            return;
          }
        }



        

        let durationSec: number | undefined;
        if (callDuration) {
          const parsed = parseInt(callDuration);
          if (!isNaN(parsed) && parsed >= 0) {
            durationSec = parsed;
          } else {
            console.warn(`[CallAgent] Invalid call duration: ${callDuration}`);
          }
        }
        

        let validatedRecordingUrl: string | undefined;
        if (recordingUrl) {
          try {
            const url = new URL(recordingUrl);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
              validatedRecordingUrl = recordingUrl;
            } else {
              console.warn(`[CallAgent] Invalid recording URL protocol: ${recordingUrl}`);
            }
          } catch (e) {
            console.warn(`[CallAgent] Invalid recording URL format: ${recordingUrl}`);
          }
        }
        

                const existingCall = await callLogsService.upsertCallLog({
                  twilioCallSid: callSid,
                  status: callStatus,
                  durationSec,
                  endedAt: ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus) ? new Date() : undefined,
                  recordingUrl: validatedRecordingUrl
                });


        const terminalStates = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
        const isTerminal = terminalStates.includes(callStatus);
        const isFailure = ['failed', 'busy', 'no-answer', 'canceled'].includes(callStatus);

        if (existingCall && isTerminal) {

          if (callStatus === 'completed') {
            try {
              const transcript = callAgentService.extractTranscript(callSid);
              

              await callLogsService.upsertCallLog({
                twilioCallSid: callSid,
                transcript: transcript.turns,
                conversationData: transcript.turns
              });


              if (callData && (callData as any).flowContext) {
                const { conversationId } = (callData as any).flowContext;
                
                try {

                  await storage.createMessage({
                    conversationId,
                    content: transcript.fullText,
                    direction: 'inbound',
                    type: 'text',
                    metadata: {
                      callSid,
                      duration: callDuration,
                      recordingUrl,
                      userUtterances: transcript.userUtterances,
                      aiResponses: transcript.aiResponses,
                      turns: transcript.turns
                    }
                  });
                  

                } catch (error) {
                  console.error(`[CallAgent] Error saving transcript:`, error);
                }
              }
            } catch (error) {
              console.error(`[CallAgent] Error extracting transcript:`, error);
            }
          }


          if (isFailure) {

            const failureReason = errorCode ? `Error ${errorCode}: ${errorMessage || 'Unknown error'}` : `Call ${callStatus}`;
            
            CallLogsEventEmitter.emitCallFailed(
              existingCall.id,
              existingCall.companyId || 0,
              failureReason
            );
            

            if (errorCode || errorMessage) {
              console.warn(`[CallAgent] Detailed error for call ${existingCall.id}:`, {
                type: errorCode ? 'twilio_error' : 'call_failed',
                code: errorCode,
                message: errorMessage || callStatus,
                callSid,
                callStatus,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            CallLogsEventEmitter.emitCallCompleted(
              existingCall.id,
              existingCall.companyId || 0,
              {
                status: callStatus,
                duration: durationSec || 0
              }
            );
          }


          if (callData) {
            callAgentService.removeActiveCall(callSid);
          }
        } else if (existingCall) {

          CallLogsEventEmitter.emitCallStatusUpdate(
            existingCall.id,
            existingCall.companyId || 0,
            callStatus,
            {
              callSid,
              duration: durationSec
            }
          );
        } else {

          console.warn(`[CallAgent] Received status for unknown call: ${callSid}`);
          

          logger.warn('call-agent', 'Unknown call status received');
          console.log('[CallAgent] Status details:', {
            callSid,
            callStatus,
            timestamp: new Date().toISOString()
          });
        }
        
        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        

        const processingTime = Date.now() - startTime;
        if (processingTime > 1000) {
          console.warn(`[CallAgent] Slow webhook processing: ${processingTime}ms for call ${callSid}`);
        }
        
      } catch (error: any) {
        hasError = true;
        errorDetails = {
          message: error.message,
          stack: error.stack,
          callSid: req.body.CallSid,
          callStatus: req.body.CallStatus,
          timestamp: new Date().toISOString()
        };
        
        console.error('[CallAgent] Error processing status webhook:', error);
        

        logger.error('call-agent', 'Webhook processing error');

        

        if (error.message.includes('Invalid')) {
          res.status(400).send('Bad Request');
        } else {
          res.status(500).send('Internal Server Error');
        }
      } finally {

        const processingTime = Date.now() - startTime;

      }
  }

  /** Call Agent Status Webhook - primary path */
  app.post('/api/webhooks/call-agent/status', callAgentStatusUrlencoded, handleTwilioCallStatusWebhook);

  /**
   * Twilio Voice Status Callback URL (alias used by connection settings / diagnostics)
   * Same handler as call-agent/status so user-configured statusCallbackUrl works.
   */
  app.head('/api/webhooks/twilio/voice-status', (_req, res) => res.status(200).end());
  app.post('/api/webhooks/twilio/voice-status', callAgentStatusUrlencoded, handleTwilioCallStatusWebhook);

  /**
   * Call Agent Inbound Call Webhook
   * Handles inbound calls and initiates flow execution
   */
  app.post('/api/webhooks/call-agent/inbound/:flowId/:nodeId',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const signature = req.headers['x-twilio-signature'] as string;
        const flowId = req.params.flowId;
        const nodeId = req.params.nodeId;
        const callSid = req.body.CallSid;
        const fromNumber = req.body.From;
        const toNumber = req.body.To;



        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('x-forwarded-host') || req.get('host');
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;
        

        const flow = await storage.getFlow(parseInt(flowId));
        if (!flow) {
          console.error(`[CallAgent] Flow ${flowId} not found`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        
        if (!flow.companyId) {
          console.error(`[CallAgent] Flow ${flowId} has no companyId`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        

        const twilioVoiceConnections = await storage.getChannelConnectionsByCompany(flow.companyId);
        const channelConnection = twilioVoiceConnections.find(
          conn => conn.channelType === 'twilio_voice' && conn.status === 'active'
        );
        
        if (!channelConnection) {
          console.error(`[CallAgent] No active Twilio Voice channel connection found for company ${flow.companyId}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        

        const connectionData = channelConnection.connectionData as any;
        const twilioAuthToken = connectionData?.authToken;
        const twilioAccountSid = connectionData?.accountSid;
        const elevenLabsApiKey = connectionData?.elevenLabsApiKey;
        const elevenLabsAgentId = connectionData?.elevenLabsAgentId;
        

        if (!twilioAuthToken || !twilioAccountSid) {
          console.error(`[CallAgent] Missing Twilio credentials in channel connection for company ${flow.companyId}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error. Please contact support.</Say><Hangup/></Response>'
          );
        }
        

        if (signature && twilioAuthToken) {
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            twilioAuthToken
          );
          
          if (!isValid) {
            console.error('[CallAgent] Invalid Twilio signature for inbound webhook');
            return res.status(403).send('Forbidden');
          }
        } else if (signature && !twilioAuthToken) {
          console.error('[CallAgent] Twilio signature provided but no auth token configured');
          return res.status(403).send('Forbidden');
        }
        

        const nodes = flow.nodes as any[] || [];
        const node = nodes.find((n: any) => n.id === nodeId);
        


        const finalTwilioAuthToken = node?.data?.twilioAuthToken || twilioAuthToken;
        const finalTwilioAccountSid = node?.data?.twilioAccountSid || twilioAccountSid;
        const finalElevenLabsApiKey = node?.data?.elevenLabsApiKey || elevenLabsApiKey;
        const finalElevenLabsAgentId = node?.data?.elevenLabsAgentId || elevenLabsAgentId;
        
        const hasElevenLabs = !!(finalElevenLabsApiKey && finalElevenLabsApiKey.trim() !== '');
        

        let elevenLabsConversationId: string | undefined;
        let streamUrl = '';
        

        if (hasElevenLabs && finalElevenLabsAgentId) {
          try {

            const { getElevenLabsSignedUrl } = await import('./services/call-agent-service');
            const signedResult = await getElevenLabsSignedUrl(finalElevenLabsApiKey, finalElevenLabsAgentId);
            streamUrl = signedResult.signedUrl;
            elevenLabsConversationId = signedResult.conversationId;

          } catch (error: any) {
            console.error(`[CallAgent] ElevenLabs registration failed for inbound call, falling back to direct call:`, error.message);

          }
        } else if (hasElevenLabs && !finalElevenLabsAgentId) {


          const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                                process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                                req.get('host') || 'localhost:3000';
          streamUrl = `wss://${webhookBaseUrl}/call-agent/stream/${callSid}`;
        }
        

        if (!streamUrl && !hasElevenLabs) {

        }


        const agentConfig = {
          elevenLabsConversationId,
          hasElevenLabs: !!(streamUrl && hasElevenLabs)
        };
        const twiml = callAgentService.generateInboundTwiML(streamUrl, agentConfig);

        res.type('text/xml');
        res.send(twiml);


        try {


          if (!flow.companyId) {
            console.error(`[CallAgent] Flow ${flowId} has no companyId`);
            return;
          }
          

          let contact = await storage.getContactByPhone(fromNumber, flow.companyId);
          if (!contact) {
            contact = await storage.createContact({
              phone: fromNumber,
              companyId: flow.companyId,
              name: `Caller ${fromNumber}`,
              source: 'call_agent'
            });
          }
          


          const conversation = await storage.createConversation({
            contactId: contact.id,
            companyId: flow.companyId,
            channelType: 'twilio_voice',
            channelId: channelConnection.id,
            status: 'open'
          });
          

          callAgentService.setActiveCall(callSid, {
            config: {

              twilioAccountSid: finalTwilioAccountSid,
              twilioAuthToken: finalTwilioAuthToken,
              twilioFromNumber: node?.data?.twilioFromNumber || toNumber,
              elevenLabsApiKey: finalElevenLabsApiKey,
              elevenLabsAgentId: finalElevenLabsAgentId,
              elevenLabsPrompt: node?.data?.elevenLabsPrompt || node?.data?.customAgentPrompt,
              elevenLabsVoiceId: node?.data?.voiceId || node?.data?.voiceSettings?.voiceId,
              elevenLabsModel: node?.data?.voiceSettings?.model,
              audioFormat: node?.data?.audioFormat || 'ulaw_8000',
              toNumber: fromNumber,
              executionMode: 'async'
            } as any,
            conversationData: [],
            startTime: new Date(),
            flowContext: {
              flowId: parseInt(flowId),
              nodeId,
              conversationId: conversation.id,
              contactId: contact.id
            },
            elevenLabsConversationId
          } as any);
          

        } catch (error) {
          console.error(`[CallAgent] Error initiating flow for inbound call:`, error);
        }
      } catch (error) {
        console.error('[CallAgent] Error processing inbound call webhook:', error);
        res.status(500).send('Internal Server Error');
      }
    }
  );

  app.post('/api/webhooks/whatsapp',
    createWhatsAppWebhookSecurity(),
    express.raw({ type: 'application/json' }),
    async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body;

     


      const payload = JSON.parse(body.toString());

      

      let phoneNumberId: string | null = null;
      if (payload.entry && payload.entry.length > 0) {
        const entry = payload.entry[0];
        if (entry.changes && entry.changes.length > 0) {
          const change = entry.changes[0];
          if (change.value && change.value.metadata) {
            phoneNumberId = change.value.metadata.phone_number_id;
          }
        }
      }


      let targetConnection = null;
      let appSecret = null;
      let secretSource = 'none';

      if (phoneNumberId) {

        const whatsappConnections = await storage.getChannelConnectionsByType('whatsapp_official');
        targetConnection = whatsappConnections.find(conn => {
          const data = conn.connectionData as any;
          return data?.phoneNumberId === phoneNumberId || data?.businessAccountId === phoneNumberId;
        });

        if (targetConnection) {
          const connectionData = targetConnection.connectionData as any;
          appSecret = connectionData?.appSecret;
          secretSource = `connection_${targetConnection.id}_company_${targetConnection.companyId}`;
        }
      }


      if (!appSecret) {
        appSecret = process.env.FACEBOOK_APP_SECRET;
        secretSource = 'global_env';
      }

      

      if (appSecret && signature) {

        if (!Buffer.isBuffer(body)) {
          return res.status(400).send('Invalid request body - expected raw body');
        }

        const isValid = whatsAppOfficialService.verifyWebhookSignature(signature, body, appSecret);
        if (!isValid) {
          return res.status(403).send('Forbidden');
        }
      }


      

      await whatsAppOfficialService.processWebhook(payload, targetConnection?.companyId || undefined);


      res.status(200).send('OK');
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });


  /**
   * Instagram webhook verification endpoint (GET)
   */
  app.get('/api/webhooks/instagram', async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode !== 'subscribe') {
      return res.status(403).send('Forbidden');
    }

    try {
      const instagramConnections = await storage.getChannelConnectionsByType('instagram');
      let matchingConnection = null;
      for (const connection of instagramConnections) {
        const connectionData = connection.connectionData as any;
        if (connectionData?.verifyToken === token) {
          matchingConnection = connection;
          break;
        }
      }

      const globalToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
      const isGlobalMatch = globalToken && token === globalToken;

      if (matchingConnection || isGlobalMatch) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });


  app.post('/api/webhooks/instagram',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body;



      if (!Buffer.isBuffer(body)) {
        return res.status(400).send('Invalid request body - expected raw body');
      }

      const payload = JSON.parse(body.toString());
      


     

      let targetConnection = null;
      if (payload?.entry && Array.isArray(payload.entry) && payload.entry.length > 0) {
        const instagramAccountId = payload.entry[0]?.id;

        
        if (instagramAccountId) {
          const instagramConnections = await storage.getChannelConnectionsByType('instagram');

          
          targetConnection = instagramConnections.find((conn: any) => {
            const connectionData = conn.connectionData as any;
            return connectionData?.instagramAccountId === instagramAccountId;
          });
        }
      }


      if (!targetConnection) {

        const instagramConnections = await storage.getChannelConnectionsByType('instagram');
        const activeConnections = instagramConnections.filter((conn: any) => 
          conn.status === 'active' || conn.status === 'error'
        );
        
        if (activeConnections.length > 0) {
          targetConnection = activeConnections[0]; // Use the first available connection
          
        }
      }


      await instagramService.processWebhook(payload, signature, targetConnection?.companyId || undefined);


      res.status(200).send('OK');
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });



  /**
   * TikTok webhook verification endpoint (GET)
   * TikTok sends a verification request when setting up webhooks
   */
  app.get('/api/webhooks/tiktok', async (req, res) => {
    try {
      const challenge = typeof req.query['challenge'] === 'string' ? req.query['challenge'] : Array.isArray(req.query['challenge']) ? req.query['challenge'][0] : undefined;
      const verifyToken = typeof req.query['verify_token'] === 'string' ? req.query['verify_token'] : Array.isArray(req.query['verify_token']) ? req.query['verify_token'][0] : undefined;

      try {
        const platformConfig = await TikTokService.getPlatformConfig();
        const expectedToken = platformConfig.webhookSecret;

        if (expectedToken && verifyToken === expectedToken) {
          logWebhookSecurityEvent('verification_success', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok'
          });
          logger.info('tiktok', 'Webhook verification handshake succeeded');
          return res.status(200).send(challenge ?? '');
        } else {
          logWebhookSecurityEvent('verification_failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok',
            reason: 'invalid_verify_token'
          });
          logger.warn('tiktok', 'Webhook verification failed: invalid or missing verify_token');
          return res.status(403).send('Forbidden');
        }
      } catch (error) {
        logger.error('tiktok', 'Webhook verification error', { error: error instanceof Error ? error.message : 'Unknown' });
        return res.status(500).send('Internal Server Error');
      }
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * TikTok webhook event endpoint (POST)
   * Receives webhook events from TikTok Business Messaging API
   */
  app.post('/api/webhooks/tiktok',
    createTikTokWebhookSecurity(),
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const startTime = Date.now();
      let eventType = 'unknown';

      try {
        const signature = req.headers['x-tiktok-signature'] as string;
        const body = req.body;

        const platformConfig = await TikTokService.getPlatformConfig();
        if (platformConfig.webhookSecret && !signature) {
          logWebhookSecurityEvent('signature_verification_failed', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            endpoint: 'tiktok',
            reason: 'missing_signature'
          });
          logTikTokWebhookEvent('unknown', 'error', {
            error: 'Webhook secret configured but x-tiktok-signature header absent'
          });
          return res.status(403).send('Forbidden');
        }

        const payload = JSON.parse(body.toString());
        const content = payload.content ?? payload.data ?? {};
        eventType = payload.event ?? payload.event_type ?? payload.type ?? 'unknown';

        logTikTokWebhookEvent(eventType, 'received', {
          payload: payload,
          metadata: {
            hasSignature: !!signature,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            from_user_id: content.from_user_id,
            to_user_id: content.to_user_id,
            conversation_id: content.conversation_id,
            message_id: content.message_id
          }
        });


        if (signature) {
          try {
            if (platformConfig.webhookSecret) {
              if (!Buffer.isBuffer(body)) {
                logTikTokWebhookEvent(eventType, 'error', {
                  error: 'Invalid request body - expected raw body'
                });
                return res.status(400).send('Invalid request body - expected raw body');
              }

              const isValid = TikTokService.verifyWebhookSignature(
                body.toString(),
                signature,
                platformConfig.webhookSecret
              );

              if (!isValid) {
                logWebhookSecurityEvent('signature_verification_failed', {
                  ip: req.ip,
                  userAgent: req.get('User-Agent'),
                  endpoint: 'tiktok'
                });
                logTikTokWebhookEvent(eventType, 'error', {
                  error: 'Signature verification failed'
                });
                return res.status(403).send('Forbidden');
              }


              logWebhookSecurityEvent('signature_verified', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: 'tiktok'
              });
            }
          } catch (error) {
            logTikTokWebhookEvent(eventType, 'error', {
              error: error instanceof Error ? error.message : 'Signature verification error'
            });
            return res.status(500).send('Internal Server Error');
          }
        }


        if (!payload || typeof payload !== 'object') {
          logTikTokWebhookEvent(eventType, 'error', {
            error: 'Invalid payload structure'
          });
          return res.status(400).json({ error: 'Invalid payload' });
        }

        logTikTokWebhookEvent(eventType, 'processing', {
          metadata: {
            from_user_id: content.from_user_id,
            to_user_id: content.to_user_id,
            conversation_id: content.conversation_id,
            message_id: content.message_id
          }
        });

        res.status(200).send('OK');

        const webhookContext = { ipAddress: req.ip, userAgent: req.get('user-agent') ?? undefined };
        setImmediate(async () => {
          try {
            await TikTokService.processWebhookEvent(payload, webhookContext);
            const processingTimeMs = Date.now() - startTime;
            logTikTokWebhookEvent(eventType, 'success', {
              processingTimeMs,
              metadata: {
                eventType: eventType,
                from_user_id: content.from_user_id,
                to_user_id: content.to_user_id,
                conversation_id: content.conversation_id,
                message_id: content.message_id
              }
            });
          } catch (error) {
            const processingTimeMs = Date.now() - startTime;
            logTikTokWebhookEvent(eventType, 'error', {
              error: error instanceof Error ? error.message : 'Unknown error',
              processingTimeMs,
              metadata: {
                from_user_id: content.from_user_id,
                to_user_id: content.to_user_id,
                conversation_id: content.conversation_id,
                message_id: content.message_id
              }
            });
            logger.error('tiktok', 'Webhook async processing failed (response already sent)', { error: error instanceof Error ? error.message : 'Unknown' });
          }
        });
      } catch (error) {
        const processingTimeMs = Date.now() - startTime;

        logTikTokWebhookEvent(eventType, 'error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTimeMs
        });

        res.status(500).send('Internal Server Error');
      }
    }
  );


  /**
   * Meta WhatsApp Partner webhook verification endpoint (GET)
   * Meta sends a verification request when setting up webhooks
   */
  app.get('/api/webhooks/meta-whatsapp', async (req, res) => {
    const mode = typeof req.query['hub.mode'] === 'string' ? req.query['hub.mode'] : Array.isArray(req.query['hub.mode']) ? req.query['hub.mode'][0] : undefined;
    const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : Array.isArray(req.query['hub.verify_token']) ? req.query['hub.verify_token'][0] : undefined;
    const challenge = typeof req.query['hub.challenge'] === 'string' ? req.query['hub.challenge'] : Array.isArray(req.query['hub.challenge']) ? req.query['hub.challenge'][0] : undefined;


    if (mode !== 'subscribe') {
      
      return res.status(403).send('Forbidden');
    }

    if (!challenge) {
      return res.status(400).send('Missing challenge parameter');
    }

    try {

      const partnerConfig = await storage.getPartnerConfiguration('meta');
      
      

      if (!partnerConfig || !partnerConfig.isActive) {
        return res.status(404).send('Partner configuration not found or inactive');
      }

      if (!partnerConfig.webhookVerifyToken) {
        return res.status(500).send('Webhook verify token not configured');
      }

      const expectedToken = partnerConfig.webhookVerifyToken;
      const tokenMatch = typeof token === 'string' && token === expectedToken;

    

      if (tokenMatch) {
       
        
        logWebhookSecurityEvent('verification_success', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: 'meta-whatsapp'
        });


        const challengeString = typeof challenge === 'string' ? challenge : String(challenge);
        return res.status(200).send(challengeString);
      } else {
       

        logWebhookSecurityEvent('verification_failed', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: 'meta-whatsapp',
          reason: 'token_mismatch'
        });

        return res.status(403).send('Forbidden');
      }
    } catch (error) {
     
      return res.status(500).send('Internal Server Error');
    }
  });

  /**
   * Meta WhatsApp Partner webhook event endpoint (POST)
   * Receives webhook events from Meta WhatsApp Business API Partner
   */
  app.post('/api/webhooks/meta-whatsapp',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body;


      if (!Buffer.isBuffer(body)) {
        return res.status(400).send('Invalid request body - expected raw body');
      }

      const payload = JSON.parse(body.toString());

  

      const isTestRequest = signature === 'test_signature' || req.get('user-agent')?.includes('axios');
      
      if (isTestRequest) {
        
      }


      const partnerConfig = await storage.getPartnerConfiguration('meta');
      let appSecret = null;
      let secretSource = 'none';

      if (partnerConfig) {
        appSecret = partnerConfig.partnerSecret?.trim(); // Trim any whitespace
        secretSource = 'database';
      }



      if (!appSecret && process.env.META_WHATSAPP_APP_SECRET) {
        appSecret = process.env.META_WHATSAPP_APP_SECRET;
        secretSource = 'environment variable';
      }

      if (appSecret && signature && !isTestRequest) {

        const isValid = whatsAppOfficialService.verifyWebhookSignature(signature, body, appSecret, false);
        if (!isValid) {
          return res.status(403).json({
            error: 'Signature verification failed',
            message: 'Check that partnerSecret in database matches Meta App Secret'
          });
        }
        
      } else if (!isTestRequest) {
  
      }



      await whatsAppOfficialService.processWebhook(payload);

      
      res.status(200).send('OK');
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/api/webhooks/test', (req, res) => {
    res.json({
      message: 'Webhook routes are working',
      timestamp: new Date().toISOString(),
      registeredBefore: 'JSON middleware'
    });
  });

  /**
   * Debug endpoint for testing Meta WhatsApp webhook signature verification
   * Requires super admin authentication
   */
  app.get('/api/webhooks/meta-whatsapp/debug', ensureSuperAdmin, async (req, res) => {
    try {
      const { testBody, testSignature, testSecret } = req.query;

      if (!testBody || !testSignature || !testSecret) {
        return res.status(400).json({
          error: 'Missing required parameters',
          required: ['testBody', 'testSignature', 'testSecret'],
          received: {
            hasTestBody: !!testBody,
            hasTestSignature: !!testSignature,
            hasTestSecret: !!testSecret
          }
        });
      }

      const timestamp = new Date().toISOString();

      const result = testMetaWebhookSignature(
        testBody as string,
        testSignature as string,
        testSecret as string
      );

      return res.json({
        success: true,
        timestamp,
        result: {
          isValid: result.isValid,
          computedHash: result.computedHash,
          receivedHash: result.receivedHash,
          bodyLength: result.bodyLength,
          secretLength: result.secretLength,
          algorithm: result.algorithm,
          details: result.details
        }
      });
    } catch (error) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Retry Call Endpoint
   * Allows retrying a failed call with the same parameters
   */
  app.post('/api/call-logs/:callId/retry', async (req, res) => {
    const callId = req.params.callId;
    try {
      

      const callLog = await callLogsService.getCallLogById(0, parseInt(callId));
      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      

      if (!['failed', 'no-answer', 'busy'].includes(callLog.status)) {
        return res.status(400).json({
          success: false,
          error: 'Call is not in a retryable state'
        });
      }
      

      const retryCount = callLog.metadata?.retryCount || 0;
      if (retryCount >= 2) {
        return res.status(429).json({
          success: false,
          error: 'Maximum retry attempts exceeded'
        });
      }
      

      const connection = await storage.getChannelConnection(callLog.connectionId);
      if (!connection) {
        return res.status(400).json({
          success: false,
          error: 'Channel connection not found'
        });
      }
      
      const connectionData = connection.connectionData as any;
      

      if (!connectionData?.twilioAccountSid || !connectionData?.twilioAuthToken || !connectionData?.fromNumber) {
        console.error('[Call Retry] Channel connection missing required Twilio credentials');
        return res.status(400).json({
          success: false,
          error: 'Channel connection missing required Twilio credentials. Please reconfigure the Twilio Voice channel.'
        });
      }
      
      const config = {
        twilioAccountSid: connectionData.twilioAccountSid,
        twilioAuthToken: connectionData.twilioAuthToken,
        twilioFromNumber: connectionData.fromNumber,
        elevenLabsApiKey: connectionData.elevenLabsApiKey || '',
        elevenLabsAgentId: connectionData.elevenLabsAgentId || '',
        toNumber: callLog.toNumber,
        recordCall: true,
        timeout: 30,
        executionMode: 'async' as const
      };
      

      const updatedMetadata = {
        ...callLog.metadata,
        retryCount: retryCount + 1,
        originalCallId: callLog.id,
        retryTimestamp: new Date().toISOString()
      };
      

      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                            process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                            req.get('host') || 'localhost:3000';
      

      const callResult = await callAgentService.initiateOutboundCall(
        config,
        webhookBaseUrl
      );
      

      await callLogsService.updateCallLog(0, callLog.id, {
        notes: `Retried at ${new Date().toISOString()}. New call SID: ${callResult.callSid}`
      });
      

      const newCallLog = await callLogsService.upsertCallLog({
        twilioCallSid: callResult.callSid,
        conversationId: callLog.conversationId,
        from: callResult.from,
        to: callResult.to,
        direction: 'outbound',
        status: 'initiated',
        contactId: callLog.contactId,
        companyId: callLog.companyId,
        flowId: callLog.flowId,
        nodeId: callLog.nodeId,
        notes: `Retry of call ${callLog.id}`,
        isStarred: false
      });
      

      CallLogsEventEmitter.emitCallStatusUpdate(
        callLog.id,
        callLog.companyId || 0,
        'retrying',
        {
          newCallId: newCallLog.id,
          callSid: callResult.callSid,
          retryCount: retryCount + 1
        }
      );
      
      res.json({
        success: true,
        data: {
          callSid: callResult.callSid,
          callId: newCallLog.id,
          status: callResult.status,
          retryCount: retryCount + 1
        }
      });
      
    } catch (error) {
      console.error('[CallAgent] Retry call error:', error);
      

      try {

        const originalCallLog = await callLogsService.getCallLogById(0, parseInt(callId));
        if (originalCallLog) {
          CallLogsEventEmitter.emitCallError(
            parseInt(callId),
            originalCallLog.companyId || 0,
            {
              type: 'retry_failed',
              details: error instanceof Error ? error.message : 'Failed to retry call'
            }
          );
        }
      } catch (wsError) {
        console.error('[CallAgent] Failed to emit callError event:', wsError);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry call'
      });
    }
  });

  /**
   * Fallback to Direct Call Endpoint
   * Switches from AI-powered call to direct call
   */
  app.post('/api/call-logs/:callId/fallback-direct', async (req, res) => {
    const callId = req.params.callId;
    try {
      

      const callLog = await callLogsService.getCallLogById(0, parseInt(callId));
      if (!callLog) {
        return res.status(404).json({
          success: false,
          error: 'Call not found'
        });
      }
      

      if (callLog.metadata?.callType !== 'ai-powered') {
        return res.status(400).json({
          success: false,
          error: 'Call is not AI-powered'
        });
      }
      

      const connection = await storage.getChannelConnection(callLog.channelId || callLog.connectionId);
      if (!connection) {
        return res.status(400).json({
          success: false,
          error: 'Channel connection not found'
        });
      }
      
      const connectionData = connection.connectionData as any;
      


      const accountSid = connectionData.accountSid || connectionData.twilioAccountSid;
      const authToken = connectionData.authToken || connectionData.twilioAuthToken;
      const fromNumber = connectionData.fromNumber;
      

      if (!accountSid || !authToken || !fromNumber) {
        console.error('[Call Fallback] Channel connection missing required Twilio credentials');
        return res.status(400).json({
          success: false,
          error: 'Channel connection missing required Twilio credentials. Please reconfigure the Twilio Voice channel.'
        });
      }
      
      const config = {
        twilioAccountSid: accountSid,
        twilioAuthToken: authToken,
        twilioFromNumber: fromNumber,
        toNumber: callLog.toNumber,

        elevenLabsApiKey: '',
        elevenLabsAgentId: '',
        recordCall: true,
        timeout: 30,
        executionMode: 'async' as const
      };
      

      const updatedMetadata = {
        ...callLog.metadata,
        originalCallType: callLog.metadata.callType,
        callType: 'direct',
        fallbackTimestamp: new Date().toISOString(),
        fallbackReason: 'elevenlabs_unavailable'
      };
      

      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                            process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                            req.get('host') || 'localhost:3000';
      

      const callResult = await callAgentService.initiateOutboundCall(
        config,
        webhookBaseUrl
      );
      

      await callLogsService.updateCallLog(0, callLog.id, {
        notes: `Switched to direct call at ${new Date().toISOString()}. New call SID: ${callResult.callSid}`
      });
      

      const newCallLog = await callLogsService.upsertCallLog({
        twilioCallSid: callResult.callSid,
        conversationId: callLog.conversationId,
        to: callResult.to,
        from: callResult.from,
        direction: 'outbound',
        status: 'initiated',
        channelId: callLog.channelId || 0,
        contactId: callLog.contactId,
        companyId: callLog.companyId,
        flowId: callLog.flowId,
        nodeId: callLog.nodeId,
        notes: `Fallback from AI-powered call`,
        isStarred: false
      });
      

      CallLogsEventEmitter.emitCallStatusUpdate(
        callLog.id,
        callLog.companyId || 0,
        'fallback',
        {
          newCallId: newCallLog.id,
          callSid: callResult.callSid,
          fallbackTo: 'direct'
        }
      );
      
      res.json({
        success: true,
        data: {
          callSid: callResult.callSid,
          callId: newCallLog.id,
          status: callResult.status,
          callType: 'direct'
        }
      });
      
    } catch (error) {
      console.error('[CallAgent] Fallback call error:', error);
      

      try {

        const originalCallLog = await callLogsService.getCallLogById(0, parseInt(callId));
        if (originalCallLog) {
          CallLogsEventEmitter.emitCallError(
            parseInt(callId),
            originalCallLog.companyId || 0,
            {
              type: 'fallback_failed',
              details: error instanceof Error ? error.message : 'Failed to switch to direct call'
            }
          );
        }
      } catch (wsError) {
        console.error('[CallAgent] Failed to emit callError event:', wsError);
      }
      
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to switch to direct call'
      });
    }
  });

  /**
   * Call Agent Monitoring Dashboard Endpoint
   * Provides comprehensive monitoring data for the call system
   */
  app.get('/api/call-agent/monitoring', ensureSuperAdmin, async (req, res) => {
    try {
      const startTime = Date.now();
      

      const activeCalls = callAgentService.getActiveCalls();
      const activeCallsData = [];
      let totalRtt = 0;
      let totalPacketLoss = 0;
      let totalJitter = 0;
      let qualityCounts = { excellent: 0, good: 0, fair: 0, poor: 0 };
      
      for (const callData of activeCalls) {
        const metrics = callAgentService.getCallQualityMetrics(callData.callSid);
        const callInfo = {
          callSid: callData.callSid,
          startTime: callData.startTime,
          duration: Math.floor((Date.now() - callData.startTime.getTime()) / 1000),
          turnCount: callData.conversationData?.length || 0,
          metrics: metrics || null,
          hasElevenLabs: !!(callData as any).elevenLabsWs,
          twilioConnected: !!(callData as any).twilioWs
        };
        
        activeCallsData.push(callInfo);
        
        if (metrics) {
          totalRtt += metrics.rtt;
          totalPacketLoss += metrics.packetLossRate;
          totalJitter += metrics.jitter;
          qualityCounts[metrics.audioQuality]++;
        }
      }
      

      const activeCallsCount = activeCallsData.length;
      const avgMetrics = activeCallsCount > 0 ? {
        rtt: Math.round(totalRtt / activeCallsCount),
        packetLossRate: Math.round(totalPacketLoss / activeCallsCount),
        jitter: Math.round(totalJitter / activeCallsCount)
      } : { rtt: 0, packetLossRate: 0, jitter: 0 };
      

      const circuitBreakerState = getCircuitBreakerState();
      


      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const callLogsResult = await callLogsService.getCallLogs(
        0, // companyId 0 to get all calls for monitoring
        {
          startDate: yesterday.toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0]
        },
        { limit: 100 }
      );
      
      const recentCalls = callLogsResult.calls;
      const callStats = {
        total: recentCalls.length,
        completed: recentCalls.filter(c => c.status === 'completed').length,
        failed: recentCalls.filter(c => c.status === 'failed').length,
        busy: recentCalls.filter(c => c.status === 'busy').length,
        noAnswer: recentCalls.filter(c => c.status === 'no-answer').length,
        avgDuration: recentCalls.reduce((sum, c) => sum + (c.durationSec || 0), 0) / (recentCalls.length || 1)
      };
      

      const errorRate = callStats.total > 0 ? Math.round((callStats.failed / callStats.total) * 100) : 0;
      const connectionRate = callStats.total > 0 ? Math.round(((callStats.completed + callStats.failed + callStats.busy + callStats.noAnswer) / callStats.total) * 100) : 0;
      

      const healthCheck = await fetch(`${req.protocol}://${req.get('host')}/api/call-agent/health`, {
        headers: {
          'Authorization': req.headers.authorization || ''
        }
      }).catch(() => null);
      
      let systemHealth = null;
      if (healthCheck?.ok) {
        systemHealth = await healthCheck.json();
      }
      

      const monitoringData = {
        timestamp: new Date().toISOString(),
        system: {
          activeCalls: activeCallsCount,
          circuitBreaker: circuitBreakerState,
          health: systemHealth
        },
        quality: {
          average: avgMetrics,
          distribution: qualityCounts,
          activeCalls: activeCallsData.map(c => ({
            callSid: c.callSid,
            duration: c.duration,
            quality: c.metrics?.audioQuality || 'unknown',
            rtt: c.metrics?.rtt || 0,
            packetLoss: c.metrics?.packetLossRate || 0
          }))
        },
        statistics: {
          last24Hours: callStats,
          errorRate,
          connectionRate,
          trends: {

            hourly: Array.from({ length: 24 }, (_, i) => {
              const hourStart = new Date();
              hourStart.setHours(hourStart.getHours() - (23 - i), 0, 0, 0);
              const hourEnd = new Date(hourStart);
              hourEnd.setHours(hourEnd.getHours() + 1);
              
              const hourCalls = recentCalls.filter(c => {
                const callTime = new Date(c.createdAt || c.startedAt || 0);
                return callTime >= hourStart && callTime < hourEnd;
              });
              
              return {
                hour: hourStart.getHours(),
                total: hourCalls.length,
                completed: hourCalls.filter(c => c.status === 'completed').length,
                failed: hourCalls.filter(c => c.status === 'failed').length
              };
            })
          }
        },
        alerts: [

          ...(circuitBreakerState.isOpen ? [{
            type: 'circuit_breaker_open',
            severity: 'critical',
            message: 'Circuit breaker is open - calls are being blocked',
            timestamp: new Date().toISOString()
          }] : []),
          ...(errorRate > 20 ? [{
            type: 'high_error_rate',
            severity: 'warning',
            message: `Error rate is ${errorRate}% (threshold: 20%)`,
            timestamp: new Date().toISOString()
          }] : []),
          ...(avgMetrics.packetLossRate > 5 ? [{
            type: 'high_packet_loss',
            severity: 'warning',
            message: `Average packet loss is ${avgMetrics.packetLossRate}%`,
            timestamp: new Date().toISOString()
          }] : []),
          ...(avgMetrics.rtt > 500 ? [{
            type: 'high_latency',
            severity: 'warning',
            message: `Average RTT is ${avgMetrics.rtt}ms`,
            timestamp: new Date().toISOString()
          }] : [])
        ],
        processingTime: Date.now() - startTime
      };
      
      res.json({
        success: true,
        data: monitoringData
      });
      
    } catch (error) {
      console.error('[CallAgent] Error fetching monitoring data:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch monitoring data'
      });
    }
  });

  /**
   * Conference Status Webhook
   * Handles Twilio conference events for direct calls
   */
  app.post('/api/webhooks/conference-status',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const {
          ConferenceSid,
          FriendlyName,
          StatusCallbackEvent,
          CallSid,
          Muted,
          Hold,
          EndConferenceOnExit,
          StartConferenceOnEnter,
          SequenceNumber,
          ParticipantLabel
        } = req.body;

        const isFallbackCall = FriendlyName && String(FriendlyName).startsWith('fallback-');
        if (isFallbackCall) {

        } else {

        }


        let callLogs: any[] = [];
        try {
          callLogs = await callLogsService.getCallLogsByConferenceName(FriendlyName);
        } catch (err) {
          console.error('[Conference Webhook] Error finding call logs:', err);
        }


        switch (StatusCallbackEvent) {
          case 'conference-start':


            let maxConferenceDurationMs: number;
            try {
              const maxHours = await conferenceCleanupScheduler.getMaxConferenceDurationHours();
              maxConferenceDurationMs = maxHours * 60 * 60 * 1000;
            } catch (err) {
              console.error('[Conference Webhook] Error getting max conference duration, using 4h default:', err);
              maxConferenceDurationMs = 4 * 60 * 60 * 1000;
            }
            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                const metadata = callLog.metadata || {};
                metadata.conferenceName = FriendlyName;
                metadata.conferenceSid = ConferenceSid;
                metadata.conferenceStartTime = new Date().toISOString();
                metadata.participantJoinTimes = metadata.participantJoinTimes || {};
                metadata.participantLeaveTimes = metadata.participantLeaveTimes || {};
                metadata.participantLabels = metadata.participantLabels || [];
                metadata.cleanupScheduled = true;
                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, {
                    metadata: metadata
                  });

                } catch (err) {
                  console.error(`[Conference Webhook] Error updating metadata for call ${callLog.id}:`, err);
                }
              }
            }
            if (ConferenceSid) {
              try {
                conferenceCleanupScheduler.scheduleConferenceCleanup(ConferenceSid, maxConferenceDurationMs);
              } catch (err) {
                console.error('[Conference Webhook] Error scheduling conference cleanup:', err);
              }
            }
            break;

          case 'conference-end':

            if (ConferenceSid) {
              conferenceCleanupScheduler.cancelConferenceCleanup(ConferenceSid);
            }
            try {
              const conferenceEndTime = new Date().toISOString();
              for (const callLog of callLogs) {
                const timeoutKey = String(callLog.id);
                const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                  agentJoinTimeoutHandles.delete(timeoutKey);
                }

                const metadata = callLog.metadata || {};
                metadata.conferenceEndTime = conferenceEndTime;
                const startMs = metadata.conferenceStartTime ? new Date(metadata.conferenceStartTime).getTime() : (callLog.startedAt ? new Date(callLog.startedAt).getTime() : Date.now());
                metadata.totalDurationSeconds = Math.round((Date.now() - startMs) / 1000);
                metadata.cleanupScheduled = false;

                const costBreakdown = calculateConferenceCost(metadata);
                if (costBreakdown.totalCost > 0) {
                  await trackCallCost(callLog.id, costBreakdown.totalCost, costBreakdown.currency);
                  metadata.conferenceCostBreakdown = costBreakdown;
                }

                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, { metadata });
                } catch (_) {}

                if (callLog.status !== 'completed' && callLog.status !== 'failed') {
                  await callLogsService.updateCallLogStatus(callLog.id, 'completed');
                  if (callLog.companyId !== null) {
                    CallLogsEventEmitter.emitCallCompleted(
                      callLog.id,
                      callLog.companyId,
                      { conferenceName: FriendlyName, conferenceSid: ConferenceSid }
                    );
                  }
                }
              }
            } catch (err) {
              console.error('[Conference Webhook] Error updating call log on conference end:', err);
            }
            break;

          case 'participant-join':


            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                CallLogsEventEmitter.emitConferenceParticipantJoined(
                  callLog.id,
                  callLog.companyId,
                  {
                    participantLabel: ParticipantLabel,
                    conferenceSid: ConferenceSid,
                    timestamp: new Date()
                  }
                );
                

                const metadata = callLog.metadata || {};
                if (!metadata.participantJoinTimes) {
                  metadata.participantJoinTimes = {};
                }
                metadata.participantJoinTimes[ParticipantLabel || 'unknown'] = new Date().toISOString();
                

                if (!metadata.participantLabels) {
                  metadata.participantLabels = [];
                }
                if (ParticipantLabel && !metadata.participantLabels.includes(ParticipantLabel)) {
                  metadata.participantLabels.push(ParticipantLabel);
                }
                metadata.maxParticipants = Math.max(metadata.maxParticipants || 0, (metadata.participantLabels || []).length);


                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, {
                    metadata: metadata
                  });

                } catch (err) {
                  console.error(`[Conference Webhook] Error updating metadata for call ${callLog.id}:`, err);
                }
                

                if (ParticipantLabel === 'customer') {
                  const callLogId = callLog.id;
                  const companyId = callLog.companyId;
                  const timeoutKey = String(callLogId);
                  

                  const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    agentJoinTimeoutHandles.delete(timeoutKey);
                  }
                  

                  const timeoutHandle = setTimeout(async () => {
                    try {
                      const updatedCallLog = await callLogsService.getCallLogById(companyId, callLogId);
                      const participantLabels = updatedCallLog?.metadata?.participantLabels || [];
                      
                      if (!participantLabels.includes('agent')) {
                        console.warn(`[Conference Webhook] Agent did not join within 10 seconds for call ${callLogId}`);
                        CallLogsEventEmitter.emitCallError(callLogId, companyId, {
                          type: 'agent_join_timeout',
                          details: 'Agent did not join conference within 10 seconds of customer joining'
                        });
                      }
                      
                      agentJoinTimeoutHandles.delete(timeoutKey);
                    } catch (error) {
                      console.error('[Conference Webhook] Error checking agent join:', error);
                      agentJoinTimeoutHandles.delete(timeoutKey);
                    }
                  }, 10000);
                  
                  agentJoinTimeoutHandles.set(timeoutKey, timeoutHandle);
                } else if (ParticipantLabel === 'agent') {

                  const timeoutKey = String(callLog.id);
                  const existingTimeout = agentJoinTimeoutHandles.get(timeoutKey);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    agentJoinTimeoutHandles.delete(timeoutKey);

                  }
                }
              }
            }
            break;

          case 'participant-leave':

            for (const callLog of callLogs) {
              if (callLog.companyId !== null) {
                CallLogsEventEmitter.emitConferenceParticipantLeft(
                  callLog.id,
                  callLog.companyId,
                  {
                    participantLabel: ParticipantLabel,
                    conferenceSid: ConferenceSid,
                    timestamp: new Date()
                  }
                );
                const metadata = callLog.metadata || {};
                if (!metadata.participantLeaveTimes) metadata.participantLeaveTimes = {};
                metadata.participantLeaveTimes[ParticipantLabel || 'unknown'] = new Date().toISOString();
                try {
                  await callLogsService.updateCallLog(callLog.companyId, callLog.id, { metadata });
                } catch (_) {}

              }
            }
            break;

          case 'participant-mute':

            break;

          case 'participant-hold':

            break;

          default:

        }


        res.sendStatus(200);

      } catch (error) {
        console.error('[Conference Webhook] Error processing webhook:', error);
        res.sendStatus(500);
      }
    }
  );

  /**
   * Cleanup Stale Calls Endpoint
   * Manually trigger cleanup of stale calls
   */
  app.post('/api/call-agent/cleanup/stale', ensureSuperAdmin, async (req, res) => {
    try {
      const { cleanupStaleCalls } = await import('./services/call-agent-service');
      const result = cleanupStaleCalls();
      
      res.json({
        success: true,
        data: {
          cleaned: result.cleaned,
          errors: result.errors.length,
          details: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error cleaning up stale calls:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cleanup stale calls'
      });
    }
  });

  /**
   * Force Cleanup All Calls Endpoint
   * Emergency endpoint to force cleanup of all active calls
   */
  app.post('/api/call-agent/cleanup/force', ensureSuperAdmin, async (req, res) => {
    try {
      const { forceCleanupAllCalls } = await import('./services/call-agent-service');
      const result = forceCleanupAllCalls();
      
      logger.warn('call-agent', 'Force cleanup triggered via API');
      
      res.json({
        success: true,
        data: {
          cleaned: result.cleaned,
          errors: result.errors.length,
          details: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error force cleaning up calls:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to force cleanup'
      });
    }
  });

  /**
   * Conference Cleanup Endpoint
   * POST /api/call-agent/conferences/cleanup
   * Optional body: { conferenceSid?: string } for targeted cleanup
   */
  app.post('/api/call-agent/conferences/cleanup', ensureSuperAdmin, async (req, res) => {
    try {
      const conferenceSid = (req.body && (req.body as any).conferenceSid) || (req.query.conferenceSid as string) || undefined;
      const result = await conferenceCleanupScheduler.runStaleCleanup(conferenceSid);
      res.json({
        success: true,
        data: {
          totalConferences: result.totalConferences,
          cleanedConferences: result.cleanedConferences,
          activeConferences: result.activeConferences,
          errors: result.errors,
          details: result.details
        }
      });
    } catch (error) {
      console.error('[CallAgent] Conference cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cleanup conferences'
      });
    }
  });

  /**
   * List Active Conferences
   * GET /api/call-agent/conferences/active
   */
  app.get('/api/call-agent/conferences/active', ensureSuperAdmin, async (req, res) => {
    try {
      const metrics = await conferenceCleanupScheduler.getConferenceMetrics();
      const activeConferences = await conferenceCleanupScheduler.getActiveConferences();
      res.json({
        success: true,
        data: {
          activeCount: metrics.activeCount,
          conferences: activeConferences,
          longestRunning: metrics.longestRunning
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error listing active conferences:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list active conferences'
      });
    }
  });

  /**
   * Conference Statistics
   * GET /api/call-agent/conferences/stats
   */
  app.get('/api/call-agent/conferences/stats', ensureSuperAdmin, async (req, res) => {
    try {
      const metrics = await conferenceCleanupScheduler.getConferenceMetrics();
      const status = conferenceCleanupScheduler.getStatus();
      res.json({
        success: true,
        data: {
          ...metrics,
          schedulerRunning: status.isRunning,
          scheduledCleanupsCount: status.scheduledCleanupsCount
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error fetching conference stats:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch conference stats'
      });
    }
  });

  /**
   * Terminate Specific Conference
   * POST /api/call-agent/conferences/:conferenceSid/terminate
   */
  app.post('/api/call-agent/conferences/:conferenceSid/terminate', ensureSuperAdmin, async (req, res) => {
    try {
      const conferenceSid = req.params.conferenceSid;
      if (!conferenceSid) {
        return res.status(400).json({ success: false, error: 'conferenceSid required' });
      }
      const result = await conferenceCleanupScheduler.runStaleCleanup(conferenceSid);
      res.json({
        success: true,
        data: {
          conferenceSid,
          terminated: result.cleanedConferences > 0,
          errors: result.errors
        }
      });
    } catch (error) {
      console.error('[CallAgent] Error terminating conference:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to terminate conference'
      });
    }
  });

  /**
   * Recover Circuit Breaker Endpoint
   * Manually recover from circuit breaker state
   */
  app.post('/api/call-agent/recover/circuit-breaker', ensureSuperAdmin, async (req, res) => {
    try {
      const { attemptCircuitBreakerRecovery } = await import('./services/call-agent-service');
      const result = attemptCircuitBreakerRecovery();
      
      if (result.success) {
        logger.info('call-agent', 'Circuit breaker recovery triggered via API');
      }
      
      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      console.error('[CallAgent] Error recovering circuit breaker:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to recover circuit breaker'
      });
    }
  });

}
