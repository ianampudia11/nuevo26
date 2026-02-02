/**
 * CallAgent Service
 * Handles Twilio Voice API integration with ElevenLabs conversational AI
 * Manages outbound calls, inbound call webhooks, and WebSocket audio streaming
 */

import axios from 'axios';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import { CALL_AGENT_CONFIG } from '../config/call-agent-config';
import type { CircuitBreakerMetrics } from '../config/call-agent-config';
import { WebSocketConnectionManager } from './websocket-connection-manager';
import { AudioMessageQueue } from './audio-message-queue';
import { callQualityMonitor } from './call-quality-monitor';


export interface CallAgentConfig {

  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  

  elevenLabsApiKey: string;
  elevenLabsAgentId?: string;  // Use existing agent
  elevenLabsPrompt?: string;    // Or custom prompt
  elevenLabsVoiceId?: string;
  elevenLabsModel?: string;
  elevenLabsVoiceSettings?: {
    stability?: number;
    similarity_boost?: number;
  };


  audioFormat?: 'ulaw_8000' | 'pcm_8000' | 'pcm_16000';
  

  toNumber: string;
  timeout?: number;
  maxDuration?: number;
  /** Conference inactivity timeout in seconds (10-300), default 30. Used for direct (non-ElevenLabs) calls. */
  conferenceTimeoutSeconds?: number;
  recordCall?: boolean;
  transcribeCall?: boolean;
  

  retryAttempts?: number;
  retryDelay?: number;
  

  executionMode: 'blocking' | 'async';
}

export interface CallResult {
  callSid: string;
  status: string;
  from: string;
  to: string;
  startTime: Date;
  metadata: Record<string, any>;
}

export interface CallStatus {
  status: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer';
  duration?: number;
  startTime?: Date;
  endTime?: Date;
  recordingUrl?: string;
}

export interface Transcript {
  turns: ConversationTurn[];
  fullText: string;
  userUtterances: string[];
  aiResponses: string[];
}

export interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: Date;
  confidence?: number;
}

export interface AgentConfig {
  agentId?: string;
  prompt?: string;
  voiceId: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  voiceSettings?: {
    stability?: number;
    similarity_boost?: number;
  };
}

export type CallAgentErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'CONFIG_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVICE_ERROR';

export interface CallAgentErrorResponse {
  errorCode: CallAgentErrorCode;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  suggestedAction: string;
}

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

const AGENT_VALIDATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const agentValidationCache = new Map<string, { format: string; timestamp: number; validated: boolean }>();


const activeCalls = new Map<string, {
  config: CallAgentConfig;
  conversationData: ConversationTurn[];
  twilioWs?: WebSocket;
  elevenLabsWs?: WebSocket;
  startTime: Date;
  streamSid?: string;
  conferenceName?: string;
  actualCallSid?: string;
  callType?: 'ai-powered' | 'fallback' | 'direct';
  fallbackReason?: string;
  metrics?: {
    rtt: number;
    packetLossRate: number;
    jitter: number;
    bufferHealth: number;
    lastQualityUpdate: Date;
    audioQuality: 'excellent' | 'good' | 'fair' | 'poor';
    rttMs?: number;
  };
  conversationBuffer?: ConversationTurn[];
  currentUserUtterance?: string;
  currentAIResponse?: string;
  audioChunksSent?: number;
  audioChunksReceived?: number;
  lastActivityTime?: number;
  webhookBaseUrl?: string;
}>();

const ERROR_RECOVERY: Record<CallAgentErrorCode, { suggestedAction: string; retryable: boolean; retryAfter?: number }> = {
  NETWORK_ERROR: { suggestedAction: 'Check internet connection, retry in 30 seconds', retryable: true, retryAfter: 30 },
  AUTH_ERROR: { suggestedAction: 'Verify API credentials in settings', retryable: false },
  CONFIG_ERROR: { suggestedAction: 'Update agent audio format to ulaw 8000 Hz in ElevenLabs dashboard', retryable: false },
  RATE_LIMIT_ERROR: { suggestedAction: 'Rate limit exceeded, retry after {retryAfter} seconds', retryable: true },
  SERVICE_ERROR: { suggestedAction: 'Service temporarily unavailable, falling back to basic call', retryable: true }
};

export function categorizeError(error: any): CallAgentErrorResponse {
  const message = error?.message || String(error);
  let code: CallAgentErrorCode = 'SERVICE_ERROR';
  let retryAfter: number | undefined;
  if (message.includes('timeout') || message.includes('ECONNRESET') || message.includes('ENOTFOUND') || message.includes('network')) {
    code = 'NETWORK_ERROR';
  } else if (message.includes('401') || message.includes('Invalid') && message.includes('API key') || message.includes('credentials')) {
    code = 'AUTH_ERROR';
  } else if (message.includes('format mismatch') || message.includes('audio format') || message.includes('agent not found')) {
    code = 'CONFIG_ERROR';
  } else if (message.includes('429') || message.includes('rate limit')) {
    code = 'RATE_LIMIT_ERROR';
    const match = message.match(/retry.?after.?(\d+)/i) || (error?.response?.headers?.['retry-after'] && [null, error.response.headers['retry-after']]);
    retryAfter = match ? parseInt(match[1], 10) : 60;
  }
  const meta = ERROR_RECOVERY[code];
  let suggestedAction = meta.suggestedAction;
  if (code === 'RATE_LIMIT_ERROR' && retryAfter != null) {
    suggestedAction = suggestedAction.replace('{retryAfter}', String(retryAfter));
  }
  return {
    errorCode: code,
    message,
    retryable: meta.retryable,
    retryAfter: retryAfter ?? meta.retryAfter,
    suggestedAction
  };
}

/**
 * Normalize phone number to E.164 format
 */
function normalizeE164(num: string): string {
  let n = num.trim();
  n = n.replace(/[^\d+]/g, '');
  if (!n.startsWith('+')) n = `+${n}`;
  return n;
}

/**
 * Get Twilio Basic Auth header
 */
export function getTwilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

/**
 * Sanitize credential by removing all problematic characters
 * Removes Unicode zero-width characters, control characters, and all whitespace variants
 */
export function sanitizeCredential(credential: string): string {
  if (!credential) return credential;

  return credential.replace(/[\u200B-\u200D\uFEFF\u180E\u0000-\u001F\u007F-\u009F\s]/g, '');
}

/**
 * Validate Twilio credentials format
 */
export function validateTwilioCredentials(accountSid: string, authToken: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  

  if (!accountSid) {
    errors.push('Account SID is required');
  } else {
    if (accountSid.length !== 34) {
      errors.push(`Account SID must be exactly 34 characters, got ${accountSid.length}`);
    }
    if (!accountSid.startsWith('AC')) {
      errors.push('Account SID must start with "AC"');
    }
    if (!/^[A-Za-z0-9]+$/.test(accountSid)) {
      errors.push('Account SID must contain only alphanumeric characters');
    }
  }
  

  if (!authToken) {
    errors.push('Auth Token is required');
  } 
 
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate Twilio credentials with API call
 * Makes a lightweight GET request to Twilio Account API to validate credentials without initiating calls
 */
export async function validateTwilioCredentialsWithAPI(accountSid: string, authToken: string): Promise<{
  success: boolean;
  valid: boolean;
  accountInfo?: {
    friendlyName: string;
    status: string;
    type: string;
  };
  formatIssues?: string[];
  error?: string;
  errorCode?: number;
  suggestions?: string[];
  documentation?: string;
}> {

  const sanitizedAccountSid = sanitizeCredential(accountSid);
  const sanitizedAuthToken = sanitizeCredential(authToken);
  

  const formatValidation = validateTwilioCredentials(sanitizedAccountSid, sanitizedAuthToken);
  if (!formatValidation.isValid) {
    return {
      success: true,
      valid: false,
      formatIssues: formatValidation.errors,
      error: 'Invalid credential format',
      suggestions: [
        'Account SID must be 34 characters starting with "AC"',
        'Auth Token must be 32 alphanumeric characters',
        'Check for extra spaces or characters when copying'
      ],
      documentation: 'https://www.twilio.com/docs/usage/api/account'
    };
  }
  

  if (process.env.DEBUG_TWILIO_CREDENTIALS === 'true') {
    logCredentialDebugInfoMasked(sanitizedAccountSid, sanitizedAuthToken);
  }
  
  try {

    const response = await axios.get(
      `https://api.twilio.com/2010-04-01/Accounts/${sanitizedAccountSid}.json`,
      {
        headers: {
          'Authorization': getTwilioAuthHeader(sanitizedAccountSid, sanitizedAuthToken)
        }
      }
    );
    

    return {
      success: true,
      valid: true,
      accountInfo: {
        friendlyName: response.data.friendly_name,
        status: response.data.status,
        type: response.data.type
      }
    };
  } catch (error: any) {
    console.error('❌ [CallAgent] Credential validation error:', error.response?.data || error.message);
    

    if (error.response?.status === 401) {
      const twilioError = error.response.data;
      
      if (twilioError.code === 20003) {
        return {
          success: true,
          valid: false,
          error: 'Authentication failed - Invalid credentials',
          errorCode: 20003,
          suggestions: [
            'Verify credentials in Twilio Console',
            'Check for test vs live account mismatch',
            'Ensure Auth Token hasn\'t been regenerated',
            'Confirm account is active and funded'
          ],
          documentation: 'https://www.twilio.com/docs/errors/20003'
        };
      }
    }
    

    const statusCode = error.response?.status;
    const errorCode = error.response?.data?.code;
    
    switch (statusCode) {
      case 403:
        return {
          success: true,
          valid: false,
          error: 'Access forbidden - Insufficient permissions',
          errorCode: errorCode || statusCode,
          suggestions: [
            'Check account permissions',
            'Verify API access is enabled'
          ],
          documentation: 'https://www.twilio.com/docs/errors/403'
        };
        
      case 404:
        return {
          success: true,
          valid: false,
          error: 'Account not found',
          errorCode: errorCode || statusCode,
          suggestions: [
            'Verify Account SID is correct',
            'Check if account has been deleted'
          ],
          documentation: 'https://www.twilio.com/docs/errors/20404'
        };
        
      case 429:
        return {
          success: true,
          valid: false,
          error: 'Too many requests - Rate limit exceeded',
          errorCode: errorCode || statusCode,
          suggestions: [
            'Wait before retrying',
            'Implement exponential backoff'
          ],
          documentation: 'https://www.twilio.com/docs/errors/20429'
        };
        
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          success: true,
          valid: false,
          error: 'Twilio service error - Please try again later',
          errorCode: errorCode || statusCode,
          suggestions: [
            'Twilio is experiencing issues',
            'Retry after a few minutes'
          ],
          documentation: 'https://status.twilio.com/'
        };
        
      default:
        return {
          success: false,
          valid: false,
          error: error.response?.data?.message || error.message || 'Unknown error occurred'
        };
    }
  }
}

/**
 * Log detailed debug information about credentials
 */
export function logCredentialDebugInfo(accountSid: string, authToken: string): void {
  const maskedSid = accountSid ? accountSid.substring(0, 8) + '...' : 'undefined';
  const tokenLength = authToken ? authToken.length : 0;
  



  
  if (accountSid) {


    



    

    const hasZeroWidth = /\u200B/.test(accountSid);
    const hasBOM = /\uFEFF/.test(accountSid);
    const hasNonBreakingSpace = /\u00A0/.test(accountSid);
    const hasTab = /\t/.test(accountSid);
    const hasNewline = /\n|\r/.test(accountSid);
    

  }
  
  if (authToken) {


    

    const tokenPrefix = authToken.substring(0, 4);


  }
}

/**
 * Log masked debug information about credentials (safe for production)
 * Only shows first 3 and last 3 characters of sensitive data
 */
export function logCredentialDebugInfoMasked(accountSid: string, authToken: string): void {
  const maskCredential = (cred: string, showChars: number = 3): string => {
    if (!cred || cred.length <= showChars * 2) {
      return cred ? '***' : 'undefined';
    }
    const start = cred.substring(0, showChars);
    const end = cred.substring(cred.length - showChars);
    const middle = '*'.repeat(cred.length - (showChars * 2));
    return start + middle + end;
  };
  





  

  if (accountSid) {


  }
  
  if (authToken) {

  }
}

/** Conference timeout bounds (seconds) for TwiML validation */
const CONFERENCE_TIMEOUT_MIN = 10;
const CONFERENCE_TIMEOUT_MAX = 300;

/**
 * Generate TwiML for outbound call with Media Stream or conference-based direct call
 * @param timeoutSeconds - Conference timeout in seconds (10-300), default 30. End conference after this many seconds of inactivity.
 */
function generateOutboundTwiML(
  streamUrl: string,
  hasElevenLabs: boolean,
  conferenceName?: string,
  statusCallbackUrl?: string,
  timeoutSeconds: number = 30
): string {
  if (hasElevenLabs) {

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
  } else {


    const conferenceStatusCallback = statusCallbackUrl
      ? `statusCallback="${statusCallbackUrl}" statusCallbackEvent="start end join leave" statusCallbackMethod="POST"`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference 
      startConferenceOnEnter="true" 
      endConferenceOnExit="false"
      beep="false"
      maxParticipants="10"
      waitUrl="http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical"
      waitMethod="GET"
      record="do-not-record"
      trim="trim-silence"
      ${conferenceStatusCallback}>
      ${conferenceName || 'default-conference'}
    </Conference>
  </Dial>
</Response>`;
  }
}

/**
 * Get ElevenLabs signed URL for WebSocket connection
 */
export async function getElevenLabsSignedUrl(apiKey: string, agentId: string): Promise<{ signedUrl: string; conversationId?: string }> {
  try {
    const response = await axios.get(
      `${ELEVENLABS_API_BASE}/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey
        }
      }
    );
    
    return {
      signedUrl: response.data.signed_url,
      conversationId: response.data.conversation_id
    };
  } catch (error: any) {
    console.error('[CallAgent] Error getting ElevenLabs signed URL:', error.response?.data || error.message);
    throw new Error(`Failed to get ElevenLabs signed URL: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Generate TwiML for inbound call
 */
export function generateInboundTwiML(streamUrl: string, agentConfig: any): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;
}

/**
 * Verify Twilio webhook signature
 */
export function verifyTwilioCallSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
  authToken: string
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const hmac = crypto.createHmac('sha1', authToken).update(data).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ''));
}

/**
 * Configure ElevenLabs agent
 * Validates agent exists and logs audio format configuration
 */
export async function configureElevenLabsAgent(config: CallAgentConfig): Promise<AgentConfig> {
  const audioFormat = config.audioFormat || 'ulaw_8000';

  
  if (config.elevenLabsAgentId) {
    const agentId = config.elevenLabsAgentId;
    const cached = agentValidationCache.get(agentId);
    if (cached && Date.now() - cached.timestamp < AGENT_VALIDATION_CACHE_TTL_MS && cached.validated) {

      return {
        agentId,
        voiceId: config.elevenLabsVoiceId || 'default',
        model: config.elevenLabsModel || 'eleven_turbo_v2_5',
        temperature: undefined,
        maxTokens: undefined,
        voiceSettings: config.elevenLabsVoiceSettings
      };
    }

    try {

      const response = await axios.get(
        `${ELEVENLABS_API_BASE}/convai/agents/${config.elevenLabsAgentId}`,
        {
          headers: {
            'xi-api-key': config.elevenLabsApiKey
          }
        }
      );
      

      


      const convConfig = response.data.conversation_config;
      const rawFormat = convConfig?.asr?.user_input_audio_format ||
                        convConfig?.tts?.agent_output_audio_format ||
                        convConfig?.audio_format ||
                        response.data.audio_format ||
                        convConfig?.audio?.format;

      const normalizeFormat = (s: string): string => {
        if (!s || typeof s !== 'string') return '';
        const lower = s.toLowerCase().replace(/\s+/g, '_');
        if (lower.includes('ulaw') && (lower.includes('8000') || lower.includes('8k'))) return 'ulaw_8000';
        if (lower.includes('pcm') && (lower.includes('16000') || lower.includes('16k'))) return 'pcm_16000';
        if (lower.includes('pcm') && (lower.includes('8000') || lower.includes('8k'))) return 'pcm_8000';
        if (['ulaw_8000', 'pcm_8000', 'pcm_16000'].includes(lower)) return lower;
        return s;
      };
      const agentFormat = rawFormat ? normalizeFormat(rawFormat) : '';


      if (agentFormat && agentFormat !== audioFormat) {
        const formatMapping: Record<string, string> = {
          'ulaw_8000': 'ulaw 8000 Hz',
          'pcm_8000': 'PCM 8000 Hz',
          'pcm_16000': 'PCM 16000 Hz'
        };
        const agentUrl = config.elevenLabsAgentId 
          ? `https://elevenlabs.io/app/conversational-ai/agents/${config.elevenLabsAgentId}`
          : 'ElevenLabs dashboard';
        throw new Error(
          `Audio format mismatch for agent ${config.elevenLabsAgentId || 'unknown'}: ` +
          `Agent configured with ${agentFormat} but system expects ${audioFormat}. ` +
          `Please update the agent's audio format in ElevenLabs dashboard to match ${formatMapping[audioFormat] || audioFormat}. ` +
          `Agent URL: ${agentUrl}`
        );
      }
      

      if (agentFormat) {

      } else {
        console.warn(`[CallAgent] Could not determine agent audio format from API response - validation skipped`);
      }
      agentValidationCache.set(agentId, { format: agentFormat || audioFormat, timestamp: Date.now(), validated: true });
      const ttsConfig = convConfig?.tts;
      return {
        agentId: config.elevenLabsAgentId,
        voiceId: response.data.voice_id || ttsConfig?.voice_id || config.elevenLabsVoiceId || 'default',
        model: response.data.model || ttsConfig?.model_id || config.elevenLabsModel || 'eleven_turbo_v2_5',
        temperature: response.data.temperature ?? convConfig?.agent?.prompt?.temperature,
        maxTokens: response.data.max_tokens ?? convConfig?.agent?.prompt?.max_tokens,
        voiceSettings: config.elevenLabsVoiceSettings
      };
    } catch (error: any) {
      console.error('[CallAgent] Error fetching ElevenLabs agent:', error.response?.data || error.message);
      

      if (error.response?.status === 401) {
        throw new Error('Invalid ElevenLabs API key. Please verify your API key in settings.');
      } else if (error.response?.status === 404) {
        throw new Error(`ElevenLabs agent not found: ${config.elevenLabsAgentId}. Please verify the agent ID.`);
      } else if (error.response?.status === 403) {
        throw new Error('Access denied to ElevenLabs agent. Please check your API key permissions.');
      }
      
      throw new Error(`Failed to fetch ElevenLabs agent: ${error.response?.data?.detail || error.message}`);
    }
  } else if (config.elevenLabsPrompt) {


    return {
      prompt: config.elevenLabsPrompt,
      voiceId: config.elevenLabsVoiceId || 'default',
      model: config.elevenLabsModel || 'eleven_turbo_v2_5',
      temperature: 0.7,
      maxTokens: 500,
      voiceSettings: config.elevenLabsVoiceSettings
    };
  } else {
    throw new Error('Either elevenLabsAgentId or elevenLabsPrompt must be provided');
  }
}

/**
 * Convert Twilio mulaw audio to PCM format for ElevenLabs
 */
function convertMulawToPCM(mulawBuffer: Buffer): Buffer {



  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {

    const mulawByte = mulawBuffer[i];
    const sign = mulawByte & 0x80;
    const exponent = (mulawByte & 0x70) >> 4;
    const mantissa = mulawByte & 0x0F;
    
    let sample = mantissa << (exponent + 3);
    if (exponent !== 0) {
      sample = (sample | 0x84) << (exponent - 1);
    } else {
      sample = (sample | 0x04) << 1;
    }
    
    if (sign !== 0) sample = -sample;
    

    const pcmValue = Math.max(-32768, Math.min(32767, sample * 8));
    pcmBuffer.writeInt16LE(pcmValue, i * 2);
  }
  

  const resampled = Buffer.alloc(pcmBuffer.length * 2);
  for (let i = 0; i < pcmBuffer.length / 2; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    resampled.writeInt16LE(sample, i * 4);
    resampled.writeInt16LE(sample, i * 4 + 2);
  }
  
  return resampled;
}

export interface HandleAudioStreamElevenLabsOptions {
  url: string;
  headers: Record<string, string>;
  agentConfig: AgentConfig;
}

/**
 * Handle bidirectional audio streaming between Twilio and ElevenLabs
 * Supports ulaw_8000 (recommended), pcm_8000, and pcm_16000 audio formats.
 * When elevenLabsOptions is provided, uses WebSocketConnectionManager with reconnection and message queue.
 */
export async function handleAudioStream(
  twilioWs: WebSocket,
  callSidOrWs: string | WebSocket,
  elevenLabsOptionsOrCallSid?: HandleAudioStreamElevenLabsOptions | string
): Promise<void> {
  let callSid: string;
  let elevenLabsWs: WebSocket;
  let useManager = false;
  let manager: WebSocketConnectionManager | null = null;
  let queue: AudioMessageQueue | null = null;

  if (typeof callSidOrWs === 'string' && elevenLabsOptionsOrCallSid && typeof elevenLabsOptionsOrCallSid === 'object') {
    callSid = callSidOrWs;
    useManager = true;
    elevenLabsWs = null as any; // will be set after manager.connect()
  } else {
    callSid = elevenLabsOptionsOrCallSid as string;
    elevenLabsWs = callSidOrWs as WebSocket;
  }

  const callData = activeCalls.get(callSid);
  if (!callData) {
    throw new Error(`Call data not found for ${callSid}`);
  }

  const audioFormat = callData.config.audioFormat || 'ulaw_8000';
  const debugEnabled = process.env.DEBUG_ELEVENLABS_WS === 'true';
  const pingIntervalMs = CALL_AGENT_CONFIG.connection.pingIntervalMs;
  const connectionTimeoutMs = CALL_AGENT_CONFIG.connection.connectionTimeoutMs;
  const activityTimeoutMs = CALL_AGENT_CONFIG.connection.activityTimeoutMs;



  let conversationBuffer: ConversationTurn[] = [];
  let currentUserUtterance = '';
  let currentAIResponse = '';
  let lastUserTimestamp = new Date();
  let lastAITimestamp = new Date();
  let streamSid: string | null = null;
  let audioChunksSent = 0;
  let audioChunksReceived = 0;
  let elevenLabsConnected = false;
  let connectionTimeoutHandle: NodeJS.Timeout | null = null;
  let activityTimeoutHandle: NodeJS.Timeout | null = null;
  let pingIntervalHandle: NodeJS.Timeout | null = null;
  let lastMediaEventTime = Date.now();
  let missedPongs = 0;
  let lastPingSentTime = 0;
  let reconnectionCount = 0;
  const MAX_RECOVERY_MS = 30000;
  let recoveryTimeoutHandle: NodeJS.Timeout | null = null;

  const getElWs = (): WebSocket | null => {
    if (useManager && manager) return manager.getSocket();
    return elevenLabsWs || null;
  };

  const sendToElevenLabs = (payload: string | object) => {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (useManager && manager) {
      const state = manager.getState();
      if (state === 'connected' && manager.sendWithRetry(str)) return;
      if (state === 'reconnecting' || state === 'degraded') {
        queue!.enqueue(payload, 0);
        return;
      }
      return;
    }
    const ws = getElWs();
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(str);
  };

  const sendInitMessage = (agentConfig: AgentConfig) => {
    const initMessage: any = { type: 'conversation_initiation_client_data' };
    if (agentConfig.prompt) {
      initMessage.conversation_config_override = {
        agent: { prompt: { prompt: agentConfig.prompt }, language: 'en' },
        tts: { voice_id: agentConfig.voiceId }
      };
    }
    sendToElevenLabs(initMessage);
  };

  const cleanup = (reason: string) => {

    if (connectionTimeoutHandle) {
      clearTimeout(connectionTimeoutHandle);
      connectionTimeoutHandle = null;
    }
    if (activityTimeoutHandle) {
      clearTimeout(activityTimeoutHandle);
      activityTimeoutHandle = null;
    }
    if (pingIntervalHandle) {
      clearInterval(pingIntervalHandle);
      pingIntervalHandle = null;
    }
    if (recoveryTimeoutHandle) {
      clearTimeout(recoveryTimeoutHandle);
      recoveryTimeoutHandle = null;
    }
    if (manager) {
      manager.close(true);
      manager = null;
    }
    const ws = getElWs();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
  };

  const resetActivityTimeout = () => {
    if (activityTimeoutHandle) clearTimeout(activityTimeoutHandle);
    lastMediaEventTime = Date.now();
    activityTimeoutHandle = setTimeout(() => {
      console.warn(`[CallAgent] No audio activity for ${activityTimeoutMs / 1000}s on call ${callSid}, cleaning up`);
      cleanup('Inactivity timeout');
    }, activityTimeoutMs);
  };

  if (useManager && elevenLabsOptionsOrCallSid && typeof elevenLabsOptionsOrCallSid === 'object') {
    const opts = elevenLabsOptionsOrCallSid;
    manager = new WebSocketConnectionManager({ url: opts.url, headers: opts.headers });
    queue = new AudioMessageQueue();
    manager.onReconnecting(() => {
      const state = getActiveCall(callSid);
      if (state) {
        setActiveCall(callSid, {
          ...state,
          conversationBuffer: conversationBuffer,
          currentUserUtterance,
          currentAIResponse,
          streamSid: streamSid ?? undefined,
          audioChunksSent: audioChunksSent,
          audioChunksReceived: audioChunksReceived,
          lastActivityTime: Date.now()
        } as any);
      }
      if (recoveryTimeoutHandle) clearTimeout(recoveryTimeoutHandle);
      recoveryTimeoutHandle = setTimeout(async () => {
        recoveryTimeoutHandle = null;
        console.warn(`[CallAgent] Recovery timeout (${MAX_RECOVERY_MS / 1000}s) exceeded for call ${callSid}, triggering fallback`);
        const fallbackEnabled = (CALL_AGENT_CONFIG as any).fallback?.enableAutoFallback !== false;
        if (fallbackEnabled) await fallbackToBasicCall(callSid, 'Recovery timeout exceeded');
        cleanup('Recovery timeout');
      }, MAX_RECOVERY_MS);
    });
    manager.onFailed(async () => {
      recordCircuitBreakerFailure('websocket_error');
      const fallbackEnabled = (CALL_AGENT_CONFIG as any).fallback?.enableAutoFallback !== false;
      if (fallbackEnabled) {
        await fallbackToBasicCall(callSid, 'ElevenLabs connection failed after max retries');
      }
      cleanup('ElevenLabs connection failed');
    });
    manager.onReconnected(() => {
      if (recoveryTimeoutHandle) {
        clearTimeout(recoveryTimeoutHandle);
        recoveryTimeoutHandle = null;
      }
      reconnectionCount++;
      callQualityMonitor.trackMetric(callSid, 'reconnectionCount', reconnectionCount);
      const agentConfig = opts.agentConfig;
      sendInitMessage(agentConfig);
      const newSocket = manager!.getSocket();
      if (newSocket) attachElevenLabsHandlers(newSocket);
      if (queue && newSocket && newSocket.readyState === WebSocket.OPEN) {
        queue.flush((msg) => newSocket.send(typeof msg === 'string' ? msg : JSON.stringify(msg)));
      }
    });
    try {
      elevenLabsWs = await manager.connect();
    } catch (err) {
      console.error(`[CallAgent] ElevenLabs connection failed for call ${callSid}:`, err);
      recordCircuitBreakerFailure('websocket_error');
      cleanup('Connection failed');
      return;
    }
    sendInitMessage(opts.agentConfig);
    setActiveCall(callSid, { ...callData, elevenLabsWs: manager.getSocket()! } as any);
  }

  connectionTimeoutHandle = setTimeout(() => {
    if (!elevenLabsConnected) {
      console.error(`[CallAgent] ElevenLabs connection timeout for call ${callSid}`);
      if (useManager) recordCircuitBreakerFailure('timeout_error');
      cleanup('ElevenLabs connection timeout');
    }
  }, connectionTimeoutMs);

  if (useManager && manager) {
    const pongTimeoutMs = 5000;
    pingIntervalHandle = setInterval(() => {
      const ws = manager!.getSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      lastPingSentTime = Date.now();
      ws.send(JSON.stringify({ type: 'ping' }));
      setTimeout(() => {

        if (lastPingSentTime !== 0 && Date.now() - lastPingSentTime >= pongTimeoutMs) {
          missedPongs++;
          if (missedPongs >= 3) {
            missedPongs = 0;
            lastPingSentTime = 0;
            manager!.reconnect();
          }
        }
      }, pongTimeoutMs);
    }, pingIntervalMs);
  }

  twilioWs.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      if (debugEnabled) {

      }
      if (message.event === 'connected') {

      } else if (message.event === 'start') {
        streamSid = message.start?.streamSid || message.streamSid || null;

      } else if (message.event === 'media') {
        const payload = message.media?.payload;
        if (payload) {
          audioChunksReceived++;
          resetActivityTimeout();
          if (audioFormat === 'ulaw_8000') {
            sendToElevenLabs({ type: 'user_audio_chunk', audio: payload });
          } else {
            const pcmAudio = convertMulawToPCM(Buffer.from(payload, 'base64'));
            sendToElevenLabs({ type: 'user_audio_chunk', audio: pcmAudio.toString('base64') });
          }
          if (debugEnabled && audioChunksReceived % 100 === 0) {

          }
        }
      } else if (message.event === 'stop') {

        twilioWs.close();
      }
    } catch (error: any) {
      console.error(`[CallAgent] Error processing Twilio message:`, error);
    }
  });

  const attachElevenLabsHandlers = (elWs: WebSocket) => {
    elWs.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (debugEnabled) {

        }
        if (message.type === 'audio') {
          const audioBase64 = message.audio_event?.audio_base_64 || message.audio;
          if (audioBase64 && twilioWs.readyState === WebSocket.OPEN) {
            audioChunksSent++;
            const audioPayload = audioFormat === 'ulaw_8000'
              ? audioBase64
              : convertPCMToMulaw(Buffer.from(audioBase64, 'base64')).toString('base64');
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid: streamSid || callSid,
              media: { payload: audioPayload }
            }));
            if (debugEnabled && audioChunksSent % 100 === 0) {

            }
          }
        } else if (message.type === 'conversation_initiation_metadata') {
          elevenLabsConnected = true;
          if (connectionTimeoutHandle) {
            clearTimeout(connectionTimeoutHandle);
            connectionTimeoutHandle = null;
          }
          resetActivityTimeout();

        } else if (message.type === 'conversation_end') {
          if (currentUserUtterance.trim()) {
            conversationBuffer.push({ speaker: 'user', text: currentUserUtterance.trim(), timestamp: lastUserTimestamp });
          }
          if (currentAIResponse.trim()) {
            conversationBuffer.push({ speaker: 'ai', text: currentAIResponse.trim(), timestamp: lastAITimestamp });
          }
          callData.conversationData = conversationBuffer;
          resetCircuitBreakerOnSuccess();
          cleanup('Conversation ended normally');
        } else if (message.type === 'user_transcript') {
          const transcriptText = message.user_transcription_event?.user_transcript || message.text || '';
          if (transcriptText) {
            currentUserUtterance += transcriptText + ' ';
            lastUserTimestamp = new Date();
          }
        } else if (message.type === 'agent_response') {
          const responseText = message.agent_response_event?.agent_response || message.text || '';
          if (responseText) {
            currentAIResponse += responseText + ' ';
            lastAITimestamp = new Date();
          }
        } else if (message.type === 'ping') {

          if (elWs.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({ type: 'pong' }));
          }
        } else if (message.type === 'pong') {

          if (useManager && lastPingSentTime) {
            missedPongs = 0;
            const rttMs = Date.now() - lastPingSentTime;
            callQualityMonitor.trackMetric(callSid, 'rttMs', rttMs);
            if (callData.metrics) {
              callData.metrics.rttMs = rttMs;
              callData.metrics.audioQuality = rttMs < 100 ? 'excellent' : rttMs < 250 ? 'good' : rttMs < 500 ? 'fair' : 'poor';
            }
            lastPingSentTime = 0;
          }
        } else if (message.type === 'error') {
          console.error(`[CallAgent] ElevenLabs error for call ${callSid}:`, message.error || message);
          if (currentUserUtterance.trim() || currentAIResponse.trim()) {
            if (currentUserUtterance.trim()) conversationBuffer.push({ speaker: 'user', text: currentUserUtterance.trim(), timestamp: lastUserTimestamp });
            if (currentAIResponse.trim()) conversationBuffer.push({ speaker: 'ai', text: currentAIResponse.trim(), timestamp: lastAITimestamp });
            callData.conversationData = conversationBuffer;
          }
        }
      } catch (error: any) {
        console.error(`[CallAgent] Error processing ElevenLabs message:`, error);
      }
    });
  };

  attachElevenLabsHandlers(getElWs()!);

  twilioWs.on('close', (code, reason) => {

    if (currentUserUtterance.trim() || currentAIResponse.trim()) {
      if (currentUserUtterance.trim()) {
        conversationBuffer.push({ speaker: 'user', text: currentUserUtterance.trim(), timestamp: lastUserTimestamp });
        currentUserUtterance = '';
      }
      if (currentAIResponse.trim()) {
        conversationBuffer.push({ speaker: 'ai', text: currentAIResponse.trim(), timestamp: lastAITimestamp });
        currentAIResponse = '';
      }
      callData.conversationData = conversationBuffer;
    }
    if (connectionTimeoutHandle) { clearTimeout(connectionTimeoutHandle); connectionTimeoutHandle = null; }
    if (activityTimeoutHandle) { clearTimeout(activityTimeoutHandle); activityTimeoutHandle = null; }
    if (pingIntervalHandle) { clearInterval(pingIntervalHandle); pingIntervalHandle = null; }
    if (manager) manager.close(true);
    else if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) elevenLabsWs.close();
  });

  const elWsForClose = getElWs();
  if (elWsForClose) {
    elWsForClose.on('close', (code, reason) => {

      if (!useManager) {
        if (connectionTimeoutHandle) { clearTimeout(connectionTimeoutHandle); connectionTimeoutHandle = null; }
        if (activityTimeoutHandle) { clearTimeout(activityTimeoutHandle); activityTimeoutHandle = null; }
        if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
      }
    });
  }

  twilioWs.on('error', (error) => {
    console.error(`[CallAgent] Twilio WebSocket error for call ${callSid}:`, error);
    recordCircuitBreakerFailure('twilio_error');
    cleanup('Twilio WebSocket error');
  });

  const elWsForError = getElWs();
  if (elWsForError) {
    elWsForError.on('error', async (error) => {
      console.error(`[CallAgent] ElevenLabs WebSocket error for call ${callSid}:`, error);
      recordCircuitBreakerFailure('elevenlabs_error');
      const fallbackEnabled = (CALL_AGENT_CONFIG as any).fallback?.enableAutoFallback !== false;
      if (fallbackEnabled) {
        await fallbackToBasicCall(callSid, 'ElevenLabs WebSocket error');
      }
      cleanup('ElevenLabs WebSocket error');
    });
  }
}

/**
 * Convert PCM audio to mu-law format for Twilio
 */
function convertPCMToMulaw(pcmBuffer: Buffer): Buffer {

  const mulawBuffer = Buffer.alloc(pcmBuffer.length / 2);
  
  for (let i = 0; i < pcmBuffer.length / 2; i++) {
    const pcmSample = pcmBuffer.readInt16LE(i * 2);
    const sign = pcmSample < 0 ? 0x80 : 0x00;
    const magnitude = Math.abs(pcmSample);
    
    let exponent = 0;
    let mantissa = magnitude;
    
    if (magnitude > 0) {
      exponent = Math.floor(Math.log2(magnitude / 33)) + 1;
      if (exponent > 7) exponent = 7;
      mantissa = (magnitude >> (exponent + 3)) & 0x0F;
    }
    
    mulawBuffer[i] = sign | (exponent << 4) | mantissa;
  }
  

  const downsampled = Buffer.alloc(mulawBuffer.length / 2);
  for (let i = 0; i < downsampled.length; i++) {
    downsampled[i] = mulawBuffer[i * 2];
  }
  
  return downsampled;
}

/**
 * Initiate outbound call via Twilio
 */
export async function initiateOutboundCall(
  config: CallAgentConfig,
  webhookBaseUrl: string
): Promise<CallResult> {

  const originalAccountSid = config.twilioAccountSid;
  const originalAuthToken = config.twilioAuthToken;
  const sanitizedAccountSid = sanitizeCredential(config.twilioAccountSid);
  const sanitizedAuthToken = sanitizeCredential(config.twilioAuthToken);
  

  if (originalAccountSid !== sanitizedAccountSid || originalAuthToken !== sanitizedAuthToken) {



    

    if (originalAccountSid !== sanitizedAccountSid) {
      const removedIndices = [];
      let removedCount = 0;
      for (let i = 0; i < originalAccountSid.length; i++) {
        if (!sanitizedAccountSid.includes(originalAccountSid[i]) || 
            (sanitizedAccountSid.indexOf(originalAccountSid[i]) === -1 && 
             (i === 0 || originalAccountSid[i] !== sanitizedAccountSid[i - removedCount]))) {
          removedIndices.push(i);
          removedCount++;
        }
      }

    }
    
    if (originalAuthToken !== sanitizedAuthToken) {
      const removedIndices = [];
      let removedCount = 0;
      for (let i = 0; i < originalAuthToken.length; i++) {
        if (!sanitizedAuthToken.includes(originalAuthToken[i]) || 
            (sanitizedAuthToken.indexOf(originalAuthToken[i]) === -1 && 
             (i === 0 || originalAuthToken[i] !== sanitizedAuthToken[i - removedCount]))) {
          removedIndices.push(i);
          removedCount++;
        }
      }

    }
  }
  

  const validation = validateTwilioCredentials(sanitizedAccountSid, sanitizedAuthToken);
  if (!validation.isValid) {
    console.error('❌ [CallAgent] Credential validation failed:', validation.errors);
    throw new Error(`Invalid Twilio credentials: ${validation.errors.join(', ')}`);
  }
  

  if (process.env.DEBUG_TWILIO_CREDENTIALS === 'true') {
    logCredentialDebugInfoMasked(sanitizedAccountSid, sanitizedAuthToken);
  }
  

  const accountSid = sanitizedAccountSid;
  const authToken = sanitizedAuthToken;
  const fromNumber = normalizeE164(config.twilioFromNumber);
  const toNumber = normalizeE164(config.toNumber);
  





  

  let normalizedBaseUrl = webhookBaseUrl.replace(/^https?:\/\//, '');
  

  const hasElevenLabs = !!(config.elevenLabsApiKey && config.elevenLabsApiKey.trim() !== '');

  



  const tempCallId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const streamUrl = hasElevenLabs ? `wss://${normalizedBaseUrl}/call-agent/stream/${tempCallId}` : '';
  

  const conferenceName = !hasElevenLabs ? `conference-${tempCallId}` : undefined;
  

  const statusCallbackUrl = `https://${normalizedBaseUrl}/api/webhooks/call-agent/status`;
  

  const conferenceStatusCallbackUrl = !hasElevenLabs ? `https://${normalizedBaseUrl}/api/webhooks/conference-status` : undefined;
  

  if (hasElevenLabs) {
    try {
      await configureElevenLabsAgent(config);
    } catch (err: any) {
      console.error('[CallAgent] Pre-call validation failed:', err.message);
      throw err;
    }
  }


  const conferenceTimeout = config.conferenceTimeoutSeconds ?? 30;
  const twiml = generateOutboundTwiML(streamUrl, hasElevenLabs, conferenceName, conferenceStatusCallbackUrl, conferenceTimeout);
  
  try {




    
    const response = await axios.post(
      `${TWILIO_API_BASE}/${accountSid}/Calls.json`,
      new URLSearchParams({
        To: toNumber,
        From: fromNumber,
        Twiml: twiml,
        StatusCallback: statusCallbackUrl,
        StatusCallbackEvent: 'initiated,ringing,answered,completed',
        Timeout: String(config.timeout || 30),
        Record: config.recordCall ? 'true' : 'false'
      }),
      {
        headers: {
          'Authorization': getTwilioAuthHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const callSid = response.data.sid;
    const normalizedWebhookBase = `https://${normalizedBaseUrl}`;


    activeCalls.set(callSid, {
      config,
      conversationData: [],
      startTime: new Date(),
      conferenceName: conferenceName,
      webhookBaseUrl: normalizedWebhookBase,
      callType: hasElevenLabs ? 'ai-powered' : 'direct'
    } as any);



    activeCalls.set(tempCallId, {
      config,
      conversationData: [],
      startTime: new Date(),
      actualCallSid: callSid,
      conferenceName: conferenceName,
      webhookBaseUrl: normalizedWebhookBase,
      callType: hasElevenLabs ? 'ai-powered' : 'direct'
    } as any);
    
    return {
      callSid,
      status: response.data.status,
      from: fromNumber,
      to: toNumber,
      startTime: new Date(),
      metadata: {
        direction: response.data.direction,
        price: response.data.price,
        priceUnit: response.data.price_unit,
        callType: hasElevenLabs ? 'ai-powered' : 'direct',
        conferenceName: conferenceName
      }
    };
  } catch (error: any) {
    console.error('❌ [CallAgent] Error initiating call:', error.response?.data || error.message);
    

    if (error.response?.headers) {
      console.error('❌ [CallAgent] Error response headers:', error.response.headers);
    }
    

    console.error('❌ [CallAgent] Request details:');
    console.error('   URL:', `${TWILIO_API_BASE}/${accountSid}/Calls.json`);
    console.error('   Method: POST');
    console.error('   Authorization header format: Basic <base64-encoded>');
    

    console.error('   Sanitized Account SID length:', accountSid.length);
    console.error('   Sanitized Auth Token length:', authToken.length);
    

    if (error.response?.data) {
      const twilioError = error.response.data;
      let errorMessage = 'Failed to initiate call';
      
      if (twilioError.code === 20003) {
        errorMessage = `Authentication failed - Error 20003. This can be caused by:
1. Invalid Account SID or Auth Token
2. Using test credentials for a live account (or vice versa)
3. Auth Token has been regenerated in Twilio Console
4. Account is suspended or inactive
5. Regional API endpoint mismatch
6. Extra characters or spaces in credentials

Checks performed:
- Account SID length: ${accountSid.length} (should be 34)
- Auth Token length: ${authToken.length} (should be 32)
- Account SID starts with "AC": ${accountSid.startsWith('AC')}
- Credentials sanitized: ${originalAccountSid !== sanitizedAccountSid || originalAuthToken !== sanitizedAuthToken}

Please verify your credentials in the Twilio Console: https://www.twilio.com/console
For more details: https://www.twilio.com/docs/errors/20003`;
      } else if (twilioError.code === 21211) {
        errorMessage = 'Invalid "To" phone number. Please ensure the number is in E.164 format (e.g., +1234567890).';
      } else if (twilioError.code === 21602) {
        errorMessage = 'Invalid "From" phone number. Please verify your Twilio number is active and correctly formatted.';
      } else if (twilioError.message) {
        errorMessage = `Twilio Error (${twilioError.code}): ${twilioError.message}`;
        

        if (twilioError.code) {
          errorMessage += `\nFor more details: https://www.twilio.com/docs/errors/${twilioError.code}`;
        }
      }
      
      throw new Error(errorMessage);
    }
    
    throw new Error(`Failed to initiate call: ${error.message}`);
  }
}

/**
 * Track call status from Twilio API
 */
export async function trackCallStatus(callSid: string, config: CallAgentConfig): Promise<CallStatus> {
  const accountSid = config.twilioAccountSid;
  const authToken = config.twilioAuthToken;
  
  try {
    const response = await axios.get(
      `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}.json`,
      {
        headers: {
          'Authorization': getTwilioAuthHeader(accountSid, authToken)
        }
      }
    );
    
    const call = response.data;
    
    return {
      status: call.status as CallStatus['status'],
      duration: call.duration ? parseInt(call.duration) : undefined,
      startTime: call.start_time ? new Date(call.start_time) : undefined,
      endTime: call.end_time ? new Date(call.end_time) : undefined,
      recordingUrl: call.subresource_uris?.recordings ? 
        `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}/Recordings.json` : undefined
    };
  } catch (error: any) {
    console.error('[CallAgent] Error tracking call status:', error.response?.data || error.message);
    throw new Error(`Failed to track call status: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Generate TwiML for fallback to basic conference call
 */
function generateFallbackConferenceTwiML(conferenceName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${conferenceName}</Conference>
  </Dial>
</Response>`;
}

/**
 * Fallback to basic call when ElevenLabs fails mid-conversation
 */
export async function fallbackToBasicCall(callSid: string, reason: string): Promise<void> {
  const callData = activeCalls.get(callSid);
  if (!callData) {
    console.warn(`[CallAgent] fallbackToBasicCall: no call data for ${callSid}`);
    return;
  }

  if (callData.elevenLabsWs && callData.elevenLabsWs.readyState === WebSocket.OPEN) {
    try {
      callData.elevenLabsWs.removeAllListeners();
      callData.elevenLabsWs.close(1000, 'Fallback to basic call');
    } catch (_) {}
    callData.elevenLabsWs = undefined;
  }
  const conferenceName = (callData as any).conferenceName || `fallback-${callSid}`;
  const twiml = generateFallbackConferenceTwiML(conferenceName);
  const accountSid = sanitizeCredential(callData.config.twilioAccountSid);
  const authToken = sanitizeCredential(callData.config.twilioAuthToken);
  try {
    await axios.post(
      `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}.json`,
      new URLSearchParams({ Twiml: twiml }),
      {
        headers: {
          'Authorization': getTwilioAuthHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    (callData as any).callType = 'fallback';
    (callData as any).fallbackReason = reason;
    callQualityMonitor.trackMetric(callSid, 'fallbackCount', (callData as any).fallbackCount ?? 1);
  } catch (err: any) {
    console.error(`[CallAgent] Failed to redirect call ${callSid} to conference:`, err.response?.data || err.message);
  }
}

/**
 * Extract transcript from conversation data
 */
export function extractTranscript(callSid: string): Transcript {
  let callData = activeCalls.get(callSid);
  let actualCallSid = callSid;
  

  if (callData && (callData as any)?.actualCallSid) {
    actualCallSid = (callData as any).actualCallSid;
    const realCallData = activeCalls.get(actualCallSid);
    if (realCallData) {
      callData = realCallData;
    }
  }
  
  if (!callData) {
    return {
      turns: [],
      fullText: '',
      userUtterances: [],
      aiResponses: []
    };
  }
  
  const turns = callData.conversationData || [];
  const userUtterances = turns
    .filter(t => t.speaker === 'user')
    .map(t => t.text);
  const aiResponses = turns
    .filter(t => t.speaker === 'ai')
    .map(t => t.text);
  const fullText = turns
    .map(t => `${t.speaker === 'user' ? 'User' : 'AI'}: ${t.text}`)
    .join('\n');
  
  return {
    turns,
    fullText,
    userUtterances,
    aiResponses
  };
}

/**
 * Get active call data
 * If the callSid is a temp ID, returns the real call data
 */
export function getActiveCall(callSid: string) {
  const callData = activeCalls.get(callSid);
  

  if (callData && (callData as any)?.actualCallSid) {
    const actualCallSid = (callData as any).actualCallSid;
    return activeCalls.get(actualCallSid) || callData;
  }
  
  return callData;
}

/**
 * Set active call data
 */
export function setActiveCall(callSid: string, data: {
  config: CallAgentConfig;
  conversationData: ConversationTurn[];
  twilioWs?: WebSocket;
  elevenLabsWs?: WebSocket;
  startTime: Date;
}) {
  activeCalls.set(callSid, data);
}

/**
 * Remove active call data
 */
export function removeActiveCall(callSid: string) {

  activeCalls.delete(callSid);
  

  for (const [key, value] of activeCalls.entries()) {
    if ((value as any)?.actualCallSid === callSid) {
      activeCalls.delete(key);
    }
  }
}

/**
 * Get all active calls
 */
export function getActiveCalls() {
  return Array.from(activeCalls.entries()).map(([callSid, data]) => ({
    callSid,
    ...data
  }));
}

/**
 * Clean up stale calls (older than 1 hour)
 */
export function cleanupStaleCalls() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let cleaned = 0;
  const errors: string[] = [];
  
  for (const [callSid, callData] of activeCalls.entries()) {
    try {
      if (callData.startTime.getTime() < oneHourAgo) {
        activeCalls.delete(callSid);
        cleaned++;
        

        if (callData.twilioWs && callData.twilioWs.readyState === WebSocket.OPEN) {
          callData.twilioWs.close();
        }
        if (callData.elevenLabsWs && callData.elevenLabsWs.readyState === WebSocket.OPEN) {
          callData.elevenLabsWs.close();
        }
      }
    } catch (error) {
      errors.push(`Failed to cleanup call ${callSid}: ${error}`);
    }
  }
  
  return { cleaned, errors };
}

/**
 * Force cleanup all active calls
 */
export function forceCleanupAllCalls(): { cleaned: number; errors: string[] } {
  let cleaned = 0;
  const errors: string[] = [];
  
  for (const [callSid, callData] of activeCalls.entries()) {
    try {

      if (callData.twilioWs && callData.twilioWs.readyState === WebSocket.OPEN) {
        callData.twilioWs.close();
      }
      if (callData.elevenLabsWs && callData.elevenLabsWs.readyState === WebSocket.OPEN) {
        callData.elevenLabsWs.close();
      }
      cleaned++;
    } catch (error) {
      errors.push(`Failed to cleanup call ${callSid}: ${error}`);
      console.error(`[CallAgent] Error cleaning up call ${callSid}:`, error);
    }
  }
  
  activeCalls.clear();
  return { cleaned, errors };
}


type CircuitState = 'closed' | 'open' | 'half-open';
let circuitBreakerState: CircuitBreakerMetrics & { isOpen: boolean } = {
  state: 'closed',
  isOpen: false,
  failureCount: 0,
  failureCountByType: {
    websocket_error: 0,
    elevenlabs_error: 0,
    twilio_error: 0,
    timeout_error: 0
  },
  nextAttemptTime: null,
  lastFailureTime: null
};

const circuitBreakerThreshold = CALL_AGENT_CONFIG.errorHandling.circuitBreakerThreshold;
const circuitBreakerTimeoutMs = CALL_AGENT_CONFIG.errorHandling.circuitBreakerTimeoutMs;

export function recordCircuitBreakerFailure(errorType: 'websocket_error' | 'elevenlabs_error' | 'twilio_error' | 'timeout_error'): void {
  circuitBreakerState.failureCount++;
  circuitBreakerState.failureCountByType[errorType] = (circuitBreakerState.failureCountByType[errorType] || 0) + 1;
  circuitBreakerState.lastFailureTime = Date.now();
  if (circuitBreakerState.failureCount >= circuitBreakerThreshold) {
    circuitBreakerState.state = 'open';
    circuitBreakerState.isOpen = true;
    circuitBreakerState.nextAttemptTime = Date.now() + circuitBreakerTimeoutMs;

  }
}

export function resetCircuitBreakerOnSuccess(): void {
  circuitBreakerState.failureCount = 0;
  circuitBreakerState.failureCountByType = {
    websocket_error: 0,
    elevenlabs_error: 0,
    twilio_error: 0,
    timeout_error: 0
  };
  circuitBreakerState.state = 'closed';
  circuitBreakerState.isOpen = false;
  circuitBreakerState.nextAttemptTime = null;
}

/**
 * Get circuit breaker state
 */
export function getCircuitBreakerState() {
  if (circuitBreakerState.state === 'open' && circuitBreakerState.nextAttemptTime && Date.now() >= circuitBreakerState.nextAttemptTime) {
    circuitBreakerState.state = 'half-open';
    circuitBreakerState.isOpen = false;

  }
  return circuitBreakerState;
}

/**
 * Attempt circuit breaker recovery
 */
export function attemptCircuitBreakerRecovery(): { success: boolean; message: string } {

  const state = getCircuitBreakerState();
  if (state.state === 'open') {
    if (state.nextAttemptTime && Date.now() < state.nextAttemptTime) {
      return {
        success: false,
        message: `Circuit breaker open. Retry after ${new Date(state.nextAttemptTime).toISOString()}`
      };
    }
    circuitBreakerState.state = 'half-open';
    circuitBreakerState.isOpen = false;
    return { success: true, message: 'Circuit breaker entering half-open state - next call will be a test' };
  }
  if (state.state === 'half-open') {
    circuitBreakerState.state = 'closed';
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.nextAttemptTime = null;
    circuitBreakerState.failureCountByType = {
      websocket_error: 0,
      elevenlabs_error: 0,
      twilio_error: 0,
      timeout_error: 0
    };
    return { success: true, message: 'Circuit breaker recovered' };
  }
  return { success: true, message: 'Circuit breaker was not open' };
}

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic cleanup tasks
 */
export function startPeriodicCleanup() {
  if (cleanupInterval) return;
  
  cleanupInterval = setInterval(() => {
    const result = cleanupStaleCalls();
    if (result.cleaned > 0) {

    }
    if (result.errors.length > 0) {
      console.error(`[CallAgent] Cleanup errors: ${result.errors.length}`);
    }
  }, 30 * 60 * 1000); // 30 minutes
}

/**
 * Stop periodic cleanup tasks
 */
export function stopPeriodicCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get call quality metrics
 */
export function getCallQualityMetrics(callSid: string) {
  const callData = activeCalls.get(callSid);
  return callData?.metrics || null;
}


export const callAgentService = {
  getTwilioAuthHeader,
  sanitizeCredential,
  validateTwilioCredentials,
  validateTwilioCredentialsWithAPI,
  logCredentialDebugInfo,
  logCredentialDebugInfoMasked,
  generateInboundTwiML,
  verifyTwilioCallSignature,
  configureElevenLabsAgent,
  getCallQualityMetrics,
  handleAudioStream,
  initiateOutboundCall,
  trackCallStatus,
  fallbackToBasicCall,
  extractTranscript,
  getActiveCall,
  setActiveCall,
  removeActiveCall,
  getActiveCalls,
  cleanupStaleCalls,
  attemptCircuitBreakerRecovery,
  forceCleanupAllCalls,
  startPeriodicCleanup,
  stopPeriodicCleanup,
  getCircuitBreakerState,
  categorizeError
};
