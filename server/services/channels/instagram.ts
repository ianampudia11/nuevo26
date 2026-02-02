import { storage } from '../../storage';
import { getCachedCompanySetting, getCachedInitialPipelineStage } from '../../utils/pipeline-cache';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
} from '@shared/schema';
import { EventEmitter } from 'events';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import fsExtra from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';


interface InstagramAccountInfo {
  id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
}
interface InstagramConnectionData {
  instagramAccountId?: string;
  accountInfo?: InstagramAccountInfo;
  appId?: string;
  appSecret?: string;
  webhookUrl?: string;
  verifyToken?: string;
  lastConnectedAt?: string;
  lastValidatedAt?: string;
  accessTokenExpiresAt?: string;
  lastTokenRefresh?: string;
  features?: {
    mediaMessages?: boolean;
    stories?: boolean;
    quickReplies?: boolean;
    templates?: boolean;
  };
  settings?: {
    autoResponses?: boolean;
    messageTemplates?: any[];
    quickReplies?: any[];
  };
}

interface ChannelConnection {
  id: number;
  userId: number;
  companyId: number;
  accountName?: string | null;
  accessToken?: string | null;
  connectionData?: InstagramConnectionData | Record<string, any> | null;
  channelType: 'instagram' | string;
  status: 'active' | 'inactive' | 'error' | 'connected' | 'disconnected' | 'pending' | string;
}

type Contact = ReturnType<typeof storage.createContact> extends Promise<infer T> ? T : any;
type Conversation = ReturnType<typeof storage.createConversation> extends Promise<infer T> ? T : any;
type Message = ReturnType<typeof storage.createMessage> extends Promise<infer T> ? T : any;


interface InstagramWebhookMessageAttachment {
  type: string;
  payload?: {
    url?: string;
    sticker_id?: string;
  };
  title?: string;
  url?: string;
}

interface InstagramMediaUploadResponse {
  id: string;
}

interface InstagramMessageTemplate {
  id: string;
  name: string;
  content: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  quickReplies?: string[];
}

interface InstagramQuickReply {
  content_type: 'text';
  title: string;
  payload: string;
}

interface InstagramWebhookMessage {
  mid: string;
  text?: string;
  attachments?: InstagramWebhookMessageAttachment[];
  timestamp?: number;
  is_deleted?: boolean;
  is_echo?: boolean;
}

interface InstagramWebhookMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: InstagramWebhookMessage;
  postback?: { title: string; payload: string; };
  reaction?: { reaction: string; emoji: string; action: string; mid: string; };
}

interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging?: InstagramWebhookMessagingEvent[];
  changes?: Array<{
    field: string;
    value: {
      sender: { id: string };
      recipient: { id: string };
      timestamp: string | number;
      message: {
        mid: string;
        text: string;
        is_echo?: boolean;
      };
    };
  }>;
}

interface InstagramWebhookBody {
  object: 'instagram' | string;
  entry?: InstagramWebhookEntry[];
  'hub.mode'?: 'subscribe';
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

interface ConnectionStatusUpdatePayload {
  connectionId: number;
  status: ChannelConnection['status'];
  accountInfo?: InstagramAccountInfo;
}

interface ConnectionErrorPayload {
  connectionId: number;
  error: string;
  requiresReauth?: boolean;
}

interface MessageReceivedPayload {
  message: Message;
  conversation: Conversation;
  contact: Contact;
  connection: ChannelConnection;
}

interface InstagramAccountInfoResponse extends InstagramAccountInfo {}
interface InstagramMessageSendResponse {
  message_id: string;
  recipient_id?: string;
}
interface InstagramSubscriptionResponse {
    success?: boolean;
}


interface InstagramMediaMessageRequestBody {
  recipient: { id: string };
  message: {
    attachment: {
      type: 'image' | 'video';
      payload: { url: string; is_reusable?: boolean };
    };
    text?: string;
  };
}

declare global {
  var broadcastToAllClients: ((payload: { type: string; data: any }) => void) | undefined;
}


interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  accountInfo: any | null;
  consecutiveFailures: number;
  lastSuccessfulValidation: Date | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt: Date | null;
}


const HEALTH_CHECK_INTERVALS = {
  ACTIVE: 120000, // 2 minutes
  INACTIVE: 300000, // 5 minutes
  ERROR: 60000, // 1 minute
  RECOVERY: 30000 // 30 seconds
};


const ACTIVITY_THRESHOLDS = {
  INACTIVE_TIMEOUT: 600000, // 10 minutes
  ACTIVE_THRESHOLD: 300000, // 5 minutes
  TOKEN_VALIDATION_INTERVAL: 3600000, // 1 hour
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_BACKOFF_BASE: 30000 // 30 seconds
};

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const healthMonitoringIntervals = new Map<number, NodeJS.Timeout>();
const recoveryTimeouts = new Map<number, NodeJS.Timeout>();
const eventEmitter = new EventEmitter();


eventEmitter.setMaxListeners(50);


import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
eventEmitterMonitor.register('instagram-service', eventEmitter);

/**
 * Get or create connection state
 */
function getConnectionState(connectionId: number): ConnectionState {
  if (!connectionStates.has(connectionId)) {
    connectionStates.set(connectionId, {
      isActive: false,
      lastActivity: new Date(),
      errorCount: 0,
      lastError: null,
      accountInfo: null
      ,consecutiveFailures: 0
      ,lastSuccessfulValidation: null
      ,isRecovering: false
      ,recoveryAttempts: 0
      ,lastRecoveryAttempt: null
    });
  }
  return connectionStates.get(connectionId)!;
}

/**
 * Update connection activity
 */
export function updateConnectionActivity(connectionId: number, success: boolean = true, error?: string) {
  const state = getConnectionState(connectionId);
  state.lastActivity = new Date();

  if (success) {
    state.errorCount = 0;
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.isActive = true;
    state.lastSuccessfulValidation = new Date();

    if (state.isRecovering) {
      state.isRecovering = false;
      state.recoveryAttempts = 0;
      state.lastRecoveryAttempt = null;
      logger.info('instagram', `Connection ${connectionId} recovered successfully`);

      const recoveryTimeout = recoveryTimeouts.get(connectionId);
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
        recoveryTimeouts.delete(connectionId);
      }
    }
  } else {
    state.errorCount++;
    state.consecutiveFailures++;
    state.lastError = error || 'Unknown error';

    if (state.consecutiveFailures >= 3 && !state.isRecovering) {

      initiateConnectionRecovery(connectionId);
    }
  }
}


async function validateTokenHealth(connectionId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) return false;

    const connectionData = connection.connectionData as InstagramConnectionData | undefined;
    const accessToken = connection.accessToken;
    const instagramAccountId = connectionData?.instagramAccountId;

    if (!accessToken || !instagramAccountId) return false;

    const response = await axios.get(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}`,
      {
        params: { fields: 'id,username' },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      }
    );

    if (response.status === 200) {
      updateConnectionActivity(connectionId, true);
      logger.debug('instagram', `Token validation successful for connection ${connectionId}`);
      return true;
    }

    return false;
  } catch (error: any) {
    logger.warn('instagram', `Token validation failed for connection ${connectionId}:`, error?.message || error);

    const status = error?.response?.status;
    const graphErrorCode = error?.response?.data?.error?.code;

    if (status === 401 || status === 403 || (status === 400 && graphErrorCode === 190)) {
      await handleTokenExpiration(connectionId);
    } else {
      updateConnectionActivity(connectionId, false, error?.message || String(error));
    }

    return false;
  }
}

async function handleTokenExpiration(connectionId: number): Promise<void> {
  try {
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    const state = getConnectionState(connectionId);
    state.lastError = 'Access token expired or invalid';
    state.isActive = false;

    eventEmitter.emit('connectionError', { connectionId, error: 'Access token expired or invalid', requiresReauth: true } as ConnectionErrorPayload);
    logger.error('instagram', `Access token expired for connection ${connectionId}`);
  } catch (error: any) {
    logger.error('instagram', `Error handling token expiration for connection ${connectionId}:`, error);
  }
}

async function initiateConnectionRecovery(connectionId: number): Promise<void> {
  const state = getConnectionState(connectionId);


  if (state.isRecovering) return;


  if ((state.recoveryAttempts || 0) >= ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
    logger.error('instagram', `Max recovery attempts reached for connection ${connectionId}`);
    try {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
    } catch (err) {
      logger.error('instagram', `Failed to mark connection ${connectionId} as error:`, err);
    }
    return;
  }


  state.isRecovering = true;
  state.recoveryAttempts = (state.recoveryAttempts || 0) + 1;
  state.lastRecoveryAttempt = new Date();
  logger.info('instagram', `Initiating recovery for connection ${connectionId} (attempt ${state.recoveryAttempts})`);


  const backoffDelay = ACTIVITY_THRESHOLDS.RECOVERY_BACKOFF_BASE * Math.pow(2, (state.recoveryAttempts || 1) - 1);


  const recoveryTimeout = setTimeout(async () => {
    try {
      const success = await validateTokenHealth(connectionId);

      if (success) {
        logger.info('instagram', `Recovery succeeded for connection ${connectionId}`);

      } else {

        if ((state.recoveryAttempts || 0) < ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
          logger.info('instagram', `Recovery attempt ${state.recoveryAttempts} failed for connection ${connectionId}, scheduling retry`);


          const prev = recoveryTimeouts.get(connectionId);
          if (prev) {
            clearTimeout(prev);
            recoveryTimeouts.delete(connectionId);
          }

          const retryTimeout = setTimeout(async () => {

            recoveryTimeouts.delete(connectionId);
            try {
              const latestState = getConnectionState(connectionId);

              if (latestState.isRecovering) return;
              if ((latestState.consecutiveFailures || 0) < 3) return;

              const conn = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
              if (!conn) return;

              if (conn.status === 'error' || conn.status === 'disconnected' || conn.status === 'inactive' || !activeConnections.has(connectionId)) return;


              await initiateConnectionRecovery(connectionId);
            } catch (e) {
              logger.error('instagram', `Error running scheduled recovery retry for ${connectionId}:`, e);
            }
          }, backoffDelay) as unknown as NodeJS.Timeout;

          recoveryTimeouts.set(connectionId, retryTimeout);
        } else {

          state.isRecovering = false;
          try {
            await storage.updateChannelConnectionStatus(connectionId, 'error');
          } catch (err) {
            logger.error('instagram', `Failed to mark connection ${connectionId} as error after recovery attempts:`, err);
          }
          logger.error('instagram', `Recovery failed for connection ${connectionId} after ${state.recoveryAttempts} attempts`);
        }
      }
    } catch (err) {
      logger.error('instagram', `Error during recovery attempt for connection ${connectionId}:`, err);
      state.isRecovering = false;
    } finally {
      recoveryTimeouts.delete(connectionId);
    }
  }, backoffDelay);

  recoveryTimeouts.set(connectionId, recoveryTimeout as unknown as NodeJS.Timeout);
}

/**
 * Determine adaptive health check interval based on connection state
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState): number {
  if (state.isRecovering) return HEALTH_CHECK_INTERVALS.RECOVERY;
  if (state.errorCount > 0) return HEALTH_CHECK_INTERVALS.ERROR;
  if (state.isActive) return HEALTH_CHECK_INTERVALS.ACTIVE;
  return HEALTH_CHECK_INTERVALS.INACTIVE;
}

/**
 * Stop health monitoring and clear timers for a connection
 */
function stopHealthMonitoring(connectionId: number) {
  const interval = healthMonitoringIntervals.get(connectionId);
  if (interval) {
    clearTimeout(interval);
    healthMonitoringIntervals.delete(connectionId);
  }

  const recovery = recoveryTimeouts.get(connectionId);
  if (recovery) {
    clearTimeout(recovery);
    recoveryTimeouts.delete(connectionId);
  }
}

/**
 * Start health monitoring loop for a connection
 */
function startHealthMonitoring(connectionId: number) {
  stopHealthMonitoring(connectionId);

  const performHealthCheck = async () => {
    try {
      const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
      if (!connection) {
        stopHealthMonitoring(connectionId);
        return;
      }

      const state = getConnectionState(connectionId);

      let validated = true;
      const timeSinceValidation = state.lastSuccessfulValidation ? (Date.now() - state.lastSuccessfulValidation.getTime()) : Infinity;
      if (timeSinceValidation > ACTIVITY_THRESHOLDS.TOKEN_VALIDATION_INTERVAL) {

        validated = await validateTokenHealth(connectionId);
      }


      if (validated && !state.isActive && connection.status !== 'error') {
        state.isActive = true;
        await storage.updateChannelConnectionStatus(connectionId, 'active');
        eventEmitter.emit('connectionStatusUpdate', { connectionId, status: 'active' });
        logger.info('instagram', `Connection ${connectionId} marked active`);
      }

      const nextInterval = getAdaptiveHealthCheckInterval(state);
      const timeout = setTimeout(performHealthCheck, nextInterval);
      healthMonitoringIntervals.set(connectionId, timeout);
    } catch (error: any) {
      logger.error('instagram', 'Health check error for connection ' + connectionId + ':', error);
      updateConnectionActivity(connectionId, false, error?.message || String(error));

      const timeout = setTimeout(performHealthCheck, HEALTH_CHECK_INTERVALS.ERROR);
      healthMonitoringIntervals.set(connectionId, timeout);
    }
  };


  performHealthCheck();
}

/**
 * Initialize health monitoring for all active Instagram connections.
 * This should be called when the server starts.
 */
export async function initializeHealthMonitoring(): Promise<void> {
  try {
    const connections = await storage.getChannelConnectionsByType('instagram');
    for (const conn of connections) {
      if (conn.status === 'active' || conn.status === 'connected') {
        activeConnections.set(conn.id, true);
        updateConnectionActivity(conn.id, true);
        startHealthMonitoring(conn.id);
        logger.info('instagram', `Started health monitoring for connection ${conn.id}`);
      }
    }
  } catch (error: any) {
    logger.error('instagram', 'Error initializing health monitoring:', error);
  }
}

/**
 * Process a message through the flow executor
 * This function handles flow execution for Instagram messages
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any
): Promise<void> {
  try {
    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    logger.error('instagram', 'Error in flow executor:', error);
    throw error;
  }
}

/**
 * Enhanced error handling utilities for Instagram service
 */

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2
};

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;


    if (status && (status >= 500 || status === 429)) {
      return true;
    }


    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return true;
    }


    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for exponential backoff with jitter
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Execute a function with retry logic and exponential backoff
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  connectionId?: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();


      if (connectionId && attempt > 0) {
        updateConnectionActivity(connectionId, true);
        logger.info('instagram', `${operationName} succeeded after ${attempt} retries`);
      }

      return result;
    } catch (error) {
      lastError = error;


      if (connectionId) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateConnectionActivity(connectionId, false, errorMessage);
      }


      if (attempt === config.maxRetries || !isRetryableError(error)) {
        break;
      }

      const delay = calculateRetryDelay(attempt, config);
      logger.warn('instagram', `${operationName} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error instanceof Error ? error.message : error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }


  logger.error('instagram', `${operationName} failed after ${config.maxRetries + 1} attempts:`, lastError);
  throw lastError;
}

/**
 * Get connection health status
 */
export function getConnectionHealth(connectionId: number): {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  healthScore: number;
} {
  const state = getConnectionState(connectionId);
  const isActive = activeConnections.has(connectionId);


  let healthScore = 100;
  if (state.errorCount > 0) {
    healthScore = Math.max(0, 100 - (state.errorCount * 10));
  }

  const timeSinceActivity = Date.now() - state.lastActivity.getTime();
  if (timeSinceActivity > 300000) { // 5 minutes
    healthScore = Math.max(0, healthScore - 20);
  }

  return {
    isActive,
    lastActivity: state.lastActivity,
    errorCount: state.errorCount,
    lastError: state.lastError,
    healthScore
  };
}

const INSTAGRAM_API_VERSION = 'v24.0';
const INSTAGRAM_GRAPH_URL = 'https://graph.facebook.com';


export function verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
  if (!signature) {
    console.error('Error verifying Instagram webhook signature: No signature provided.');
    return false;
  }
  try {
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(payload, 'utf8');
    const expectedSignature = hmac.digest('hex');

    const providedSignature = signature.startsWith('sha256=')
      ? signature.substring('sha256='.length)
      : signature;

    if (expectedSignature.length !== providedSignature.length) {
        console.error('Error verifying Instagram webhook signature: Signature length mismatch.');
        return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying Instagram webhook signature:', error);
    return false;
  }
}

export async function connectToInstagram(connectionId: number, userId: number, companyId?: number): Promise<void> {
  let currentConnection: ChannelConnection | null = null;
  try {
    logger.info('instagram', `Connecting to Instagram for connection ${connectionId} by user ${userId} (company: ${companyId})`);

    const connectionResult = await storage.getChannelConnection(connectionId);
    if (!connectionResult) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }
    currentConnection = connectionResult as ChannelConnection;


    if (companyId && currentConnection.companyId && currentConnection.companyId !== companyId) {
      logger.error('instagram', `Company ID mismatch: Connection ${connectionId} belongs to company ${currentConnection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    if (currentConnection.userId !== userId) {
      logger.error('instagram', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }


    const accessToken = currentConnection.accessToken;
    const instagramAccountId = (currentConnection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken) {
      throw new Error('Instagram access token is missing for this connection.');
    }
    if (!instagramAccountId) {
      throw new Error('Instagram account ID is missing from connectionData.');
    }


    const connectionData = currentConnection.connectionData as InstagramConnectionData;
    const validationResult = await validateConnectionConfiguration(connectionData, accessToken);
    if (!validationResult.success) {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
      updateConnectionActivity(connectionId, false, validationResult.error);

      eventEmitter.emit('connectionError', {
        connectionId,
        error: validationResult.error
      });

      throw new Error(`Connection validation failed: ${validationResult.error}`);
    }


  await storage.updateChannelConnectionStatus(connectionId, 'active');

    const updatedConnectionData: InstagramConnectionData = {
      ...(connectionData || {}),
      accountInfo: validationResult.accountInfo,
      lastConnectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString()
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>,
    });

    activeConnections.set(connectionId, true);
    updateConnectionActivity(connectionId, true);

    logger.info('instagram', `Connection ${connectionId} established successfully for account: ${validationResult.accountInfo?.username}`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'active',
      accountInfo: validationResult.accountInfo
    } as ConnectionStatusUpdatePayload);
  } catch (error: unknown) {
    const baseMessage = `Error connecting to Instagram (ID: ${connectionId}):`;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('instagram', baseMessage, errorMessage);

    if (connectionId && (currentConnection || await storage.getChannelConnection(connectionId))) {
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        updateConnectionActivity(connectionId, false, errorMessage);
    }
    if (error instanceof Error) throw error;
    throw new Error(`${baseMessage} ${errorMessage}`);
  }
}

export async function disconnectFromInstagram(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      logger.warn('instagram', `Connection ${connectionId} not found for disconnection`);
      return false;
    }


    if (connection.userId !== userId) {
      logger.error('instagram', `Unauthorized disconnect attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

  activeConnections.delete(connectionId);
  updateConnectionActivity(connectionId, true);
  await storage.updateChannelConnectionStatus(connectionId, 'inactive');

    logger.info('instagram', `Instagram connection ${connectionId} disconnected successfully`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'inactive'
    } as ConnectionStatusUpdatePayload);

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('instagram', `Error disconnecting from Instagram (ID: ${connectionId}):`, errorMessage);
    return false;
  }
}

export function isInstagramConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId);
}

export function getActiveInstagramConnections(): number[] {
  return Array.from(activeConnections.keys());
}

function getAxiosErrorDetails(error: AxiosError): string {
    const fbError = (error.response?.data as any)?.error;
    if (fbError) {
        return `Type: ${fbError.type}, Code: ${fbError.code}, Message: ${fbError.message}, User Title: ${fbError.error_user_title}, User Msg: ${fbError.error_user_msg}, Trace ID: ${fbError.fbtrace_id}`;
    }
    return error.message;
}


/**
 * Enhanced send message function that integrates with the inbox system
 * @param connectionId The channel connection ID
 * @param userId The user ID sending the message
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient Instagram user ID (IGSID)
 * @param message The message content
 * @returns The saved message object
 */
export async function sendMessage(connectionId: number, userId: number, companyId: number, to: string, message: string) {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    const accessToken = connection.accessToken;
    const instagramAccountId = (connection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken) {
      throw new Error('Instagram access token is missing');
    }

    if (!instagramAccountId) {
      throw new Error('Instagram account ID is missing');
    }


    const response = await axios.post<InstagramMessageSendResponse>(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}/messages`,
      { recipient: { id: to }, message: { text: message } },
      {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.message_id) {
      const messageId = response.data.message_id;


      const conversation = await findOrCreateConversation(connectionId, to, companyId);


      const savedMessage = await storage.createMessage({
        conversationId: conversation.id,
        direction: 'outbound',
        type: 'text',
        content: message,
        senderId: userId,
        senderType: 'user',
        isFromBot: false,
        externalId: messageId || `instagram-${Date.now()}`,
        metadata: JSON.stringify({
          instagram_message_id: messageId,
          timestamp: new Date().toISOString(),
          instagram_account_id: instagramAccountId,
          recipient_id: to
        })
      });


      await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date()
      });


      const fullConversation = await storage.getConversation(conversation.id);


      eventEmitter.emit('messageSent', {
        message: savedMessage,
        conversation: fullConversation
      });

      return savedMessage;
    } else {
      throw new Error('Failed to send message: Unknown error');
    }
  } catch (error: any) {
    logger.error('instagram', 'Error sending Instagram message:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Send a text message via Instagram (legacy function for backward compatibility)
 * @param connectionId The ID of the channel connection
 * @param to The recipient Instagram user ID (IGSID)
 * @param message The message text to send
 * @param userId Optional user ID for authorization
 * @returns Promise with send result
 */
export async function sendInstagramMessage(
  connectionId: number,
  to: string,
  message: string,
  userId?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    return await executeWithRetry(
      async () => {
        const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
        if (!connection) {
          throw new Error(`Connection with ID ${connectionId} not found`);
        }

        if (userId && connection.userId !== userId) {
          throw new Error('Unauthorized access to channel connection');
        }

        const accessToken = connection.accessToken;
        const instagramAccountId = (connection.connectionData as InstagramConnectionData)?.instagramAccountId;

        if (!accessToken) {
          throw new Error('Instagram access token is missing.');
        }
        if (!instagramAccountId) {
          throw new Error('Instagram account ID is missing from connectionData.');
        }

        const response = await axios.post<InstagramMessageSendResponse>(
          `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}/messages`,
          { recipient: { id: to }, message: { text: message } },
          {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.status === 200 && response.data?.message_id) {
          return { success: true, messageId: response.data.message_id };
        } else {
          throw new Error(`Failed to send message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
        }
      },
      'Instagram message sending',
      connectionId
    );
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Instagram message.';
    if (axios.isAxiosError(error)) {
      errorMessage = getAxiosErrorDetails(error as AxiosError);
      logger.error('instagram', 'Axios error sending Instagram message:', errorMessage);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      logger.error('instagram', 'Error sending Instagram message:', error.message);
    } else {
      logger.error('instagram', 'Unknown error sending Instagram message:', error);
    }
    return { success: false, error: errorMessage };
  }
}



/**
 * Upload media to Instagram for messaging
 */
export async function uploadInstagramMedia(
  connectionId: number,
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{ success: boolean; mediaId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }

    const accessToken = connection.accessToken;
    const instagramAccountId = (connection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken || !instagramAccountId) {
      return { success: false, error: 'Instagram credentials missing' };
    }


    const uploadResponse = await axios.post(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}/media`,
      {
        image_url: mediaType === 'image' ? mediaUrl : undefined,
        video_url: mediaType === 'video' ? mediaUrl : undefined,
        media_type: mediaType.toUpperCase()
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (uploadResponse.status === 200 && uploadResponse.data?.id) {
      return {
        success: true,
        mediaId: uploadResponse.data.id
      };
    } else {
      return {
        success: false,
        error: 'Failed to upload media to Instagram'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error uploading media:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Media upload failed'
    };
  }
}

export async function downloadInstagramMedia(
  mediaUrl: string,
  accessToken: string,
  mediaType: string,
  messageId: number
): Promise<string | null> {
  try {

    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 30000
    });

    if (response.status !== 200) {
      logger.error('instagram', `Failed to download media: HTTP ${response.status}`);
      return null;
    }


    const contentType = response.headers['content-type'] || '';
    let extension = '.jpg';
    if (contentType.includes('png')) extension = '.png';
    else if (contentType.includes('gif')) extension = '.gif';
    else if (contentType.includes('webp')) extension = '.webp';
    else if (contentType.includes('mp4')) extension = '.mp4';
    else if (contentType.includes('mpeg')) extension = '.mp3';
    else if (contentType.includes('ogg')) extension = '.ogg';
    else if (mediaType === 'video') extension = '.mp4';
    else if (mediaType === 'audio') extension = '.mp3';


    const uploadDir = path.join(process.cwd(), 'uploads', 'instagram');
    await fsExtra.ensureDir(uploadDir);


    const uniqueId = crypto.randomBytes(16).toString('hex');
    const filename = `${messageId}_${uniqueId}${extension}`;
    const filePath = path.join(uploadDir, filename);


    await fsExtra.writeFile(filePath, response.data);

    logger.info('instagram', `Media downloaded successfully: ${filename}`);
    return `/uploads/instagram/${filename}`;
  } catch (error: any) {
    logger.error('instagram', `Error downloading Instagram media: ${error.message}`);
    return null;
  }
}

export async function sendInstagramMediaMessage(
  connectionId: number,
  to: string,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  caption?: string,
  userId?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }


    if (userId && connection.userId !== userId) {
      return { success: false, error: 'Unauthorized access to channel connection' };
    }

    const accessToken = connection.accessToken;
    const instagramAccountId = (connection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken) {
      return { success: false, error: 'Instagram access token is missing.' };
    }
    if (!instagramAccountId) {
      return { success: false, error: 'Instagram account ID is missing from connectionData.' };
    }

    return await executeWithRetry(
      async () => {
        const mediaRequest: InstagramMediaMessageRequestBody = {
          recipient: { id: to },
          message: {
            attachment: { type: mediaType, payload: { url: mediaUrl, is_reusable: true } }
          }
        };
        if (caption) {
          mediaRequest.message.text = caption;
        }

        const response = await axios.post<InstagramMessageSendResponse>(
          `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}/messages`,
          mediaRequest,
          {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            timeout: 15000 // 15 second timeout for media
          }
        );

        if (response.status === 200 && response.data?.message_id) {
          return { success: true, messageId: response.data.message_id };
        } else {
          throw new Error(`Failed to send media message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`);
        }
      },
      'Instagram media message sending',
      connectionId
    );
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Instagram media message.';
    if (axios.isAxiosError(error)) {
      errorMessage = getAxiosErrorDetails(error as AxiosError);
      logger.error('instagram', 'Axios error sending Instagram media message:', errorMessage);
    } else if (error instanceof Error) {
      errorMessage = error.message;
      logger.error('instagram', 'Error sending Instagram media message:', error.message);
    } else {
      logger.error('instagram', 'Unknown error sending Instagram media message:', error);
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Alias for sendInstagramMediaMessage to match API message service interface
 */
export const sendMedia = sendInstagramMediaMessage;

/**
 * Verify webhook signature against any configured Instagram connection
 * @param payload The raw payload from the webhook
 * @param signature The signature from the X-Hub-Signature-256 header
 * @returns True if signature is valid for any connection
 */
async function verifyWebhookSignatureForAnyConnection(payload: string, signature: string): Promise<boolean> {
  try {
    logger.debug('instagram', 'Starting signature verification for Instagram webhook', {
      hasSignature: !!signature,
      signaturePreview: typeof signature === 'string' && signature.indexOf('=') > 0 ? signature.split('=')[0] + '=...' : 'none',
      payloadLength: payload ? payload.length : 0
    });

    const connections = await storage.getChannelConnections(null) as ChannelConnection[];
    const instagramConnections = connections.filter(conn => conn.channelType === 'instagram');

    logger.debug('instagram', 'Fetched connections for signature verification', { totalInstagramConnections: instagramConnections.length });

    let checked = 0;
    let withAppSecret = 0;
    let skippedNoSecret = 0;

    for (const connection of instagramConnections) {
      checked++;
      const connectionData = connection.connectionData as InstagramConnectionData;
      const hasAppSecret = !!connectionData?.appSecret;

      const accountName = (connection as any).accountName || connectionData?.accountInfo?.name || null;

      logger.debug('instagram', 'Verifying signature against connection', {
        connectionId: connection.id,
        accountName,
        hasAppSecret
      });

      if (!hasAppSecret) {
        skippedNoSecret++;
        logger.warn('instagram', 'Skipping signature verification for connection due to missing appSecret', { connectionId: connection.id });
        continue;
      }

      withAppSecret++;
      let isValid = false;
      try {
        isValid = verifyWebhookSignature(payload, signature, connectionData.appSecret as string);
      } catch (err: any) {
        logger.error('instagram', 'Error while verifying signature for connection', { connectionId: connection.id, error: err });
      }

      logger.debug('instagram', 'Signature verification result', { connectionId: connection.id, valid: !!isValid });

      if (isValid) {
        logger.info('instagram', 'Webhook signature verified for connection', { connectionId: connection.id, accountName });
        return true;
      }
    }

    logger.warn('instagram', 'Webhook signature could not be verified against any connection', {
      totalChecked: checked,
      withAppSecret,
      skippedNoSecret,
      suggestion: 'Ensure appSecret is configured for the Instagram connection(s) you expect to receive webhooks for.'
    });

    logger.info('instagram', 'Signature verification summary', { totalChecked: checked, withAppSecret, skippedNoSecret });
    return false;
  } catch (error: any) {
    logger.error('instagram', 'Exception during verifyWebhookSignatureForAnyConnection', {
      errorName: error?.name || null,
      errorMessage: error?.message || error,
      stack: error?.stack || null
    });
    return false;
  }
}

export async function processWebhook(body: InstagramWebhookBody, signature?: string, companyId?: number): Promise<void> {
  try {

    console.log('🔍 [INSTAGRAM SERVICE] Webhook details:', {
      hasSignature: !!signature,
      bodyType: typeof body,
      companyId: companyId || 'not_specified',
      bodyKeys: Object.keys(body || {})
    });
    
    logger.info('instagram', 'Processing Instagram webhook:', {
      hasSignature: !!signature,
      bodyType: typeof body,
      companyId: companyId || 'not_specified'
    });


    if (companyId) {
      try {
        const connections = await storage.getChannelConnectionsByType('instagram');
        const errorConnections = connections.filter((conn: any) => 
          conn.companyId === companyId && conn.status === 'error'
        );
        
        if (errorConnections.length > 0) {

          for (const connection of errorConnections) {
            try {
              await storage.updateChannelConnectionStatus(connection.id, 'active');
              activeConnections.set(connection.id, true);
              updateConnectionActivity(connection.id, true);
              
              eventEmitter.emit('connectionStatusUpdate', {
                connectionId: connection.id,
                status: 'active'
              });
              

              logger.info('instagram', `Connection ${connection.id} status updated to active via webhook processing`);
            } catch (updateError) {
              console.error(`❌ [INSTAGRAM SERVICE] Failed to update connection ${connection.id}:`, updateError);
            }
          }
        }
      } catch (error) {
        console.error('❌ [INSTAGRAM SERVICE] Error updating connection statuses:', error);
      }
    }


    if (body['hub.mode'] === 'subscribe' && body['hub.verify_token']) {

      logger.info('instagram', 'Webhook verification request received');
      return;
    }


    if (signature && typeof body === 'string') {

      const isValidSignature = await verifyWebhookSignatureForAnyConnection(body, signature);
      if (!isValidSignature) {
        console.error('❌ [INSTAGRAM SERVICE] Invalid webhook signature - rejecting');
        logger.error('instagram', 'Invalid webhook signature - rejecting request');
        throw new Error('Invalid webhook signature');
      }

    }

    if (body.entry && Array.isArray(body.entry)) {

      
      for (const entry of body.entry) {
        console.log('🔍 [INSTAGRAM SERVICE] Entry details:', {
          id: entry.id,
          hasMessaging: !!entry.messaging,
          hasChanges: !!entry.changes,
          isMessagingArray: Array.isArray(entry.messaging),
          isChangesArray: Array.isArray(entry.changes),
          messagingCount: Array.isArray(entry.messaging) ? entry.messaging.length : 0,
          changesCount: Array.isArray(entry.changes) ? entry.changes.length : 0
        });
        

        if (entry.changes && Array.isArray(entry.changes) && entry.changes.length > 0) {

          
          for (const change of entry.changes) {
            
            

            if (change.field === 'messages' && change.value) {
              const messagingEvent = {
                sender: change.value.sender,
                recipient: change.value.recipient,
                timestamp: typeof change.value.timestamp === 'string' ? parseInt(change.value.timestamp) : change.value.timestamp,
                message: change.value.message,
                reaction: undefined // Instagram changes don't have reaction field
              };
              
              
              
              await handleIncomingInstagramMessage(messagingEvent, entry.id, companyId);
            }
          }
        }

        else if (entry.messaging && Array.isArray(entry.messaging)) {

          
          for (const messagingEvent of entry.messaging) {

            await handleIncomingInstagramMessage(messagingEvent, entry.id, companyId);
          }
        } else if (entry.messaging) {

            logger.debug('instagram', 'Non-array messaging event received');
        } else {

        }
      }
    } else {
        console.warn('⚠️ [INSTAGRAM SERVICE] No entry array found in webhook body');
        logger.debug('instagram', 'No entry array found in webhook body');
    }
    

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [INSTAGRAM SERVICE] Error in processWebhook:', errorMessage);
    if (error instanceof Error) {
      console.error('❌ [INSTAGRAM SERVICE] Error stack:', error.stack);
    }
    logger.error('instagram', 'Error processing Instagram webhook:', errorMessage);
    throw error; // Re-throw to ensure proper HTTP error response
  }
}

function captionForAttachment(attachment: InstagramWebhookMessageAttachment): string {
    if (attachment.type === 'story_mention') return '[Mentioned you in a story]';
    if (attachment.type === 'image') return '';
    if (attachment.type === 'video') return '';
    if (attachment.type === 'audio') return '';
    if (attachment.type === 'share' && attachment.title) return `[Shared Post: ${attachment.title}]`;
    if (attachment.type === 'fallback') return '[Unsupported Attachment]';
    return `[${attachment.type.toUpperCase()}]`;
}

/**
 * Find or create a conversation for a contact and channel
 * @param connectionId The channel connection ID
 * @param recipientId The recipient's Instagram user ID (IGSID)
 * @param companyId The company ID for multi-tenant security
 * @returns The conversation object
 */
async function findOrCreateConversation(connectionId: number, recipientId: string, companyId: number) {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }


  let contact = await storage.getContactByPhone(recipientId, companyId);

  if (!contact) {
    const contactData: InsertContact = {
      companyId: companyId,
      name: `Instagram User ${recipientId.substring(0, 6)}...`,
      phone: recipientId,
      email: null,
      avatarUrl: null,
      identifier: recipientId,
      identifierType: 'instagram',
      source: 'instagram',
      notes: null
    };

    contact = await storage.getOrCreateContact(contactData);
  }


  let conversation = await storage.getConversationByContactAndChannel(
    contact.id,
    connectionId
  );

  if (!conversation) {
    const conversationData: InsertConversation = {
      companyId: companyId,
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'instagram',
      status: 'open',
      assignedToUserId: null,
      lastMessageAt: new Date(),
    };

    conversation = await storage.createConversation(conversationData);


    if ((global as any).broadcastToCompany) {
      (global as any).broadcastToCompany({
        type: 'newConversation',
        data: {
          ...conversation,
          contact
        }
      }, companyId);

    }
  }

  return conversation;
}

async function handleIncomingInstagramMessage(messagingEvent: InstagramWebhookMessagingEvent, recipientIgAccountId: string, companyId?: number): Promise<void> {
  let connection: ChannelConnection | null = null;

  try {

    console.log('🔍 [INSTAGRAM HANDLER] Received event:', {
      hasSender: !!messagingEvent.sender,
      hasRecipient: !!messagingEvent.recipient,
      hasMessage: !!messagingEvent.message,
      hasPostback: !!messagingEvent.postback,
      hasReaction: !!messagingEvent.reaction,
      timestamp: messagingEvent.timestamp,
      eventKeys: Object.keys(messagingEvent),
      fullEvent: JSON.stringify(messagingEvent, null, 2)
    });
    
    logger.debug('instagram', 'Processing incoming Instagram message event');

    const message = messagingEvent.message;

    if (messagingEvent.reaction) {

        logger.debug('instagram', 'Skipping reaction event');
        return;
    }

    if (!message || !message.mid) {
      console.warn('⚠️ [INSTAGRAM HANDLER] Missing required message data:', {
        hasMessage: !!message,
        hasMessageId: !!message?.mid
      });
      logger.warn('instagram', 'Missing required message data in event');
      return;
    }


    const isEcho = !!message.is_echo;
    const counterpartyId = isEcho ? messagingEvent.recipient?.id : messagingEvent.sender?.id;

    if (!counterpartyId) {
      console.warn('⚠️ [INSTAGRAM HANDLER] Missing counterparty ID:', {
        isEcho,
        hasSender: !!messagingEvent.sender?.id,
        hasRecipient: !!messagingEvent.recipient?.id
      });
      logger.warn('instagram', 'Missing counterparty ID in event');
      return;
    }



    const connections = await storage.getChannelConnections(null) as ChannelConnection[];
    console.log('🔍 [INSTAGRAM HANDLER] Available connections:', connections.map(conn => ({
      id: conn.id,
      type: conn.channelType,
      accountName: conn.accountName,
      instagramAccountId: conn.channelType === 'instagram' ? (conn.connectionData as InstagramConnectionData)?.instagramAccountId : 'N/A',
      companyId: conn.companyId,
      status: conn.status
    })));
    
    connection = connections.find(conn => {
      const connectionData = conn.connectionData as InstagramConnectionData;
      return conn.channelType === 'instagram' && connectionData?.instagramAccountId === recipientIgAccountId;
    }) || null;


    if (!connection) {

      const instagramConnections = connections.filter(conn => 
        conn.channelType === 'instagram' && 
        (conn.status === 'active' || conn.status === 'error') &&
        (!companyId || conn.companyId === companyId)
      );
      
      if (instagramConnections.length > 0) {
        connection = instagramConnections[0]; // Use the first available Instagram connection
        
      }
    }

    if (!connection) {
      console.error('❌ [INSTAGRAM HANDLER] No Instagram connection found for account ID:', recipientIgAccountId);
      logger.warn('instagram', `No Instagram connection found for account ID: ${recipientIgAccountId}`);
      return;
    }

    

    if (companyId && connection.companyId !== companyId) {
      console.warn('⚠️ [INSTAGRAM HANDLER] Company ID mismatch:', {
        connectionId: connection.id,
        expected: companyId,
        actual: connection.companyId
      });
      logger.warn('instagram', `Company ID mismatch for connection ${connection.id}: expected ${companyId}, got ${connection.companyId}`);
      return;
    }

    if (!connection.companyId) {
      console.error('❌ [INSTAGRAM HANDLER] Connection missing companyId - security violation:', connection.id);
      logger.error('instagram', `Connection ${connection.id} missing companyId - security violation`);
      return;
    }


    let contact = await storage.getContactByPhone(counterpartyId, connection.companyId) as Contact | null;
    
    if (!contact) {

      const insertContactData: InsertContact = {
        companyId: connection.companyId,
        phone: counterpartyId,
        name: `Instagram User ${counterpartyId.substring(0, 6)}...`,
        source: 'instagram',
        identifier: counterpartyId,
        identifierType: 'instagram'
      };
      contact = await storage.getOrCreateContact(insertContactData);
      
      logger.info('instagram', `Created new contact for Instagram user ${counterpartyId}`);


      try {
        const autoAddEnabled = await getCachedCompanySetting(connection.companyId, 'autoAddContactToPipeline');
        if (autoAddEnabled) {

          const initialStage = await getCachedInitialPipelineStage(connection.companyId);
          if (initialStage) {

            const existingDeal = await storage.getActiveDealByContact(contact.id, connection.companyId, initialStage.pipelineId);
            if (!existingDeal) {
              const deal = await storage.createDeal({
                companyId: connection.companyId,
                contactId: contact.id,
                title: `New Lead - ${contact.name}`,
                pipelineId: initialStage.pipelineId,
                stageId: initialStage.id,
                stage: 'lead'
              });
              await storage.createDealActivity({
                dealId: deal.id,
                userId: connection.userId,
                type: 'create',
                content: 'Deal automatically created when contact was added'
              });
            }
          }
        }
      } catch (error) {
        console.error('Error auto-adding contact to pipeline:', error);

      }
    } else {
      
    }

    
    let conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connection.id
    ) as Conversation | null;


    let messageTimestamp: Date;
    try {
      const timestampValue = messagingEvent.timestamp || message.timestamp;
      if (timestampValue) {

        if (typeof timestampValue === 'string' && !isNaN(Number(timestampValue))) {

          messageTimestamp = new Date(Number(timestampValue));
        } else if (typeof timestampValue === 'number') {

          messageTimestamp = new Date(timestampValue);
        } else {

          messageTimestamp = new Date(timestampValue);
        }
        

        if (isNaN(messageTimestamp.getTime())) {
          throw new Error('Invalid timestamp');
        }
      } else {
        messageTimestamp = new Date();
      }
    } catch (error) {
      console.warn('⚠️ [INSTAGRAM HANDLER] Invalid timestamp, using current time:', error);
      messageTimestamp = new Date();
    }

    if (!conversation) {

      const insertConversationData: InsertConversation = {
        companyId: connection.companyId,
        contactId: contact.id,
        channelType: 'instagram',
        channelId: connection.id,
        status: 'open',
        lastMessageAt: messageTimestamp
      };
      conversation = await storage.createConversation(insertConversationData);
      


      if ((global as any).broadcastToCompany) {
        (global as any).broadcastToCompany({
          type: 'newConversation',
          data: {
            ...conversation,
            contact
          }
        }, connection.companyId);

      }
    } else {
      
    }

    let messageText: string;
    let messageType = 'text';
    let mediaUrl: string | null = null;

    console.log('🔍 [INSTAGRAM HANDLER] Parsing message content:', {
      hasText: !!message.text,
      hasAttachments: !!(message.attachments && message.attachments.length > 0),
      text: message.text
    });

    if (message.text) {
      messageText = message.text;

    } else if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      messageType = attachment.type || 'media';
      const cdnUrl = attachment.payload?.url || attachment.url || null;
      messageText = captionForAttachment(attachment);
      

      if (cdnUrl && cdnUrl.includes('lookaside.fbsbx.com')) {
        try {

          const tempMessageId = Date.now();
          const localUrl = await downloadInstagramMedia(
            cdnUrl,
            connection.accessToken || '',
            messageType,
            tempMessageId
          );
          
          if (localUrl) {
            mediaUrl = localUrl;
            logger.info('instagram', `Media downloaded proactively: ${localUrl}`);
          } else {
            mediaUrl = cdnUrl; // Fallback to CDN URL
            logger.warn('instagram', 'Proactive download failed, using CDN URL');
          }
        } catch (error) {
          logger.error('instagram', 'Error downloading media:', error);
          mediaUrl = cdnUrl; // Fallback to CDN URL
        }
      } else {
        mediaUrl = cdnUrl;
      }
    } else {
      messageText = '[Unsupported or Empty Message Content]';

    }

    const insertMessageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageText,
      type: messageType,
      direction: isEcho ? 'outbound' : 'inbound',
      status: isEcho ? 'sent' : 'delivered',
      externalId: message.mid,
      mediaUrl: mediaUrl,
      metadata: {
        channelType: 'instagram',
        timestamp: messageTimestamp.getTime(),
        senderId: messagingEvent.sender?.id,
        recipientId: messagingEvent.recipient?.id
      }
    };

    console.log('📝 [INSTAGRAM HANDLER] Creating message in database:', {
      conversationId: conversation.id,
      content: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
      type: messageType,
      direction: isEcho ? 'outbound' : 'inbound',
      externalId: message.mid,
      isEcho
    });

    const savedMessage = await storage.createMessage(insertMessageData);
    
    
    updateConnectionActivity(connection.id, true);



    if (connection.status === 'error') {

      await storage.updateChannelConnectionStatus(connection.id, 'active');
      activeConnections.set(connection.id, true);
      
      eventEmitter.emit('connectionStatusUpdate', {
        connectionId: connection.id,
        status: 'active'
      });
      
      logger.info('instagram', `Connection ${connection.id} status updated to active after successful message processing`);
    }

    const updatedConversationDataForEvent = {
        ...conversation,
        lastMessageAt: messageTimestamp,
        status: 'open' as const
    };
    await storage.updateConversation(conversation.id, {
      lastMessageAt: messageTimestamp,
      status: 'open'
    });

    logger.info('instagram', `${isEcho ? 'Echo message' : 'Message received'} from ${counterpartyId} via connection ${connection.id}`);

    const eventPayload: MessageReceivedPayload = {
      message: savedMessage,
      conversation: updatedConversationDataForEvent as Conversation,
      contact: contact,
      connection: connection
    };
    eventEmitter.emit('messageReceived', eventPayload);


    if ((global as any).broadcastToCompany) {
      (global as any).broadcastToCompany({
        type: 'newMessage',
        data: savedMessage
      }, connection.companyId);

      (global as any).broadcastToCompany({
        type: 'conversationUpdated',
        data: eventPayload.conversation
      }, connection.companyId);
    }



    if (!isEcho) {
      try {
        if (connection.companyId && !conversation.botDisabled) {
          logger.debug('instagram', `Message eligible for flow processing: conversation ${conversation.id}`);


          await processMessageThroughFlowExecutor(savedMessage, updatedConversationDataForEvent, contact, connection);
        }
      } catch (flowError: any) {
        logger.error('instagram', `Error processing message through flows:`, flowError.message);
      }
    } else {
      logger.debug('instagram', 'Skipping flow execution for echo message (outbound)');
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('instagram', `Error handling incoming Instagram message:`, errorMessage);
    if (connection?.id) {
      updateConnectionActivity(connection.id, false, errorMessage);
    }
  }
}

export function subscribeToInstagramEvents(
  eventType: 'connectionStatusUpdate',
  callback: (data: ConnectionStatusUpdatePayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'connectionError',
  callback: (data: ConnectionErrorPayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'messageReceived',
  callback: (data: MessageReceivedPayload) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: 'messageSent',
  callback: (data: any) => void
): () => void;
export function subscribeToInstagramEvents(
  eventType: string,
  callback: (data: any) => void
): () => void {
  eventEmitter.on(eventType, callback);
  return () => eventEmitter.off(eventType, callback);
}


/**
 * Test webhook configuration
 * @param webhookUrl The webhook URL to test
 * @param verifyToken The verify token to test
 * @returns Promise<boolean> indicating success
 */
export async function testWebhookConfiguration(
  webhookUrl: string,
  verifyToken: string
): Promise<{ success: boolean; error?: string }> {
  try {

    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:') {
      return { success: false, error: 'Webhook URL must use HTTPS' };
    }

    if (!url.pathname.includes('/api/webhooks/instagram')) {
      return { success: false, error: 'Webhook URL must point to /api/webhooks/instagram endpoint' };
    }


    const testParams = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': 'test_challenge_' + Date.now()
    });

    const testResponse = await axios.get(`${webhookUrl}?${testParams.toString()}`, {
      timeout: 10000,
      validateStatus: (status) => status === 200 || status === 403
    });

    if (testResponse.status === 200) {
      return { success: true };
    } else {
      return { success: false, error: 'Webhook verification failed - check verify token configuration' };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error testing webhook configuration:', error.message);
    return {
      success: false,
      error: error.code === 'ECONNREFUSED'
        ? 'Could not connect to webhook URL - check if server is accessible'
        : error.message || 'Webhook test failed'
    };
  }
}

/**
 * Refresh Instagram access token
 */
export async function refreshInstagramAccessToken(
  connectionId: number
): Promise<{ success: boolean; newToken?: string; expiresAt?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const connectionData = connection.connectionData as InstagramConnectionData;
    const appId = connectionData?.appId;
    const appSecret = connectionData?.appSecret;
    const currentToken = connection.accessToken;

    if (!appId || !appSecret || !currentToken) {
      return { success: false, error: 'Missing credentials for token refresh' };
    }


    const response = await axios.get(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: currentToken
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.access_token) {
      const newToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 5184000; // Default 60 days
      const expiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();


      const updatedConnectionData = {
        ...connectionData,
        accessTokenExpiresAt: expiresAt,
        lastTokenRefresh: new Date().toISOString()
      };

      await storage.updateChannelConnection(connectionId, {
        accessToken: newToken,
        connectionData: updatedConnectionData as Record<string, any>
      });

      logger.info('instagram', `Access token refreshed for connection ${connectionId}`);

      return {
        success: true,
        newToken,
        expiresAt
      };
    } else {
      return {
        success: false,
        error: 'Failed to refresh access token'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error refreshing access token:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Token refresh failed'
    };
  }
}

/**
 * Check if access token needs refresh (within 7 days of expiry)
 */
export async function checkTokenExpiry(connectionId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) return false;

    const connectionData = connection.connectionData as InstagramConnectionData;
    const expiresAt = connectionData?.accessTokenExpiresAt;

    if (!expiresAt) return false;

    const expiryDate = new Date(expiresAt);
    const sevenDaysFromNow = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));

    return expiryDate <= sevenDaysFromNow;
  } catch (error) {
    logger.error('instagram', 'Error checking token expiry:', error);
    return false;
  }
}

/**
 * Validate Instagram connection configuration
 * @param connectionData The connection configuration to validate
 * @returns Promise with validation result
 */
export async function validateConnectionConfiguration(
  connectionData: InstagramConnectionData,
  accessToken: string
): Promise<{ success: boolean; error?: string; accountInfo?: any }> {
  try {

    const response = await axios.get(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${connectionData.instagramAccountId}`,
      {
        params: {
          fields: 'id,username,name,profile_picture_url,followers_count'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data) {
      return {
        success: true,
        accountInfo: response.data
      };
    } else {
      return {
        success: false,
        error: 'Failed to validate Instagram account access'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error validating Instagram connection:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'Access denied - check Instagram account access token permissions'
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Instagram account not found - check account ID'
      };
    } else {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Connection validation failed'
      };
    }
  }
}

export async function setupWebhookSubscription(
  connectionId: number,
  callbackUrl: string,
  verifyToken: string
): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found for webhook setup.`);
    }

    const pageAccessToken = connection.accessToken;
    const facebookAppId = (connection.connectionData as InstagramConnectionData)?.appId;

    if (!pageAccessToken) {
      throw new Error('Access Token is missing for webhook setup.');
    }
    if (!facebookAppId) {
      throw new Error('Facebook App ID is missing from connectionData for webhook setup.');
    }

    const fields = [
      'messages',
      'message_reactions',
    ].join(',');

    const response = await axios.post<InstagramSubscriptionResponse>(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${facebookAppId}/subscriptions`,
      {
        object: 'instagram',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: fields,
        access_token: pageAccessToken
      }
    );

    if (response.status === 200 && response.data?.success) {
        logger.info('instagram', `Webhook subscription set up successfully for connection ${connectionId}`);
        return true;
    } else {
        logger.error('instagram', `Failed to set up Instagram webhook subscription for App ${facebookAppId} (Conn: ${connectionId}):`, response.status, response.data);
        return false;
    }
  } catch (error: unknown) {
    let errorMessage = 'Error setting up Instagram webhook subscription';
     if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{error?: {message?: string, type?: string, code?: number, fbtrace_id?: string}}>;
        errorMessage = axiosError.response?.data?.error?.message || axiosError.message || errorMessage;
        logger.error('instagram', `Axios error setting up Instagram webhook subscription (Conn: ${connectionId}):`, errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('instagram', `Error setting up Instagram webhook subscription (Conn: ${connectionId}):`, error.message);
    } else {
        logger.error('instagram', `Unknown error setting up Instagram webhook subscription (Conn: ${connectionId}):`, error);
    }
    return false;
  }
}

/**
 * Send Instagram message with quick replies
 */
export async function sendInstagramMessageWithQuickReplies(
  connectionId: number,
  to: string,
  message: string,
  quickReplies: InstagramQuickReply[],
  userId?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: `Connection with ID ${connectionId} not found` };
    }

    if (userId && connection.userId !== userId) {
      return { success: false, error: 'Unauthorized access to channel connection' };
    }

    const accessToken = connection.accessToken;
    const instagramAccountId = (connection.connectionData as InstagramConnectionData)?.instagramAccountId;

    if (!accessToken || !instagramAccountId) {
      return { success: false, error: 'Instagram credentials missing' };
    }

    const messageData = {
      recipient: { id: to },
      message: {
        text: message,
        quick_replies: quickReplies.slice(0, 13) // Instagram allows max 13 quick replies
      }
    };

    const response = await axios.post(
      `${INSTAGRAM_GRAPH_URL}/${INSTAGRAM_API_VERSION}/${instagramAccountId}/messages`,
      messageData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data?.message_id) {
      return {
        success: true,
        messageId: response.data.message_id
      };
    } else {
      return {
        success: false,
        error: 'Failed to send Instagram message with quick replies'
      };
    }
  } catch (error: any) {
    logger.error('instagram', 'Error sending message with quick replies:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to send message'
    };
  }
}

/**
 * Get Instagram message templates for a connection
 */
export async function getInstagramMessageTemplates(connectionId: number): Promise<InstagramMessageTemplate[]> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return [];
    }

    const connectionData = connection.connectionData as InstagramConnectionData;
    return connectionData?.settings?.messageTemplates || [];
  } catch (error) {
    logger.error('instagram', 'Error getting message templates:', error);
    return [];
  }
}

/**
 * Save Instagram message template
 */
export async function saveInstagramMessageTemplate(
  connectionId: number,
  template: InstagramMessageTemplate
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const connectionData = connection.connectionData as InstagramConnectionData || {};
    const settings = connectionData.settings || {};
    const templates = settings.messageTemplates || [];


    const existingIndex = templates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      templates[existingIndex] = template;
    } else {
      templates.push(template);
    }

    const updatedConnectionData = {
      ...connectionData,
      settings: {
        ...settings,
        messageTemplates: templates
      }
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>
    });

    return { success: true };
  } catch (error: any) {
    logger.error('instagram', 'Error saving message template:', error);
    return { success: false, error: error.message };
  }
}

export default {
  connect: connectToInstagram,
  disconnect: disconnectFromInstagram,
  sendMessage: sendInstagramMessage,
  sendMedia: sendInstagramMediaMessage,
  sendMessageWithQuickReplies: sendInstagramMessageWithQuickReplies,
  uploadMedia: uploadInstagramMedia,
  getMessageTemplates: getInstagramMessageTemplates,
  saveMessageTemplate: saveInstagramMessageTemplate,
  refreshAccessToken: refreshInstagramAccessToken,
  checkTokenExpiry: checkTokenExpiry,
  isActive: isInstagramConnectionActive,
  getActiveConnections: getActiveInstagramConnections,
  subscribeToEvents: subscribeToInstagramEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  verifyWebhookSignature,
  testWebhookConfiguration,
  validateConnectionConfiguration,
  getConnectionHealth,
  initializeHealthMonitoring
};