import {storage} from '../../storage';
import {InsertMessage, InsertConversation, InsertContact} from '@shared/schema';
import { getCachedCompanySetting, getCachedInitialPipelineStage } from '../../utils/pipeline-cache';
import {EventEmitter} from 'events';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

interface MessengerConnectionData {
  pageId: string;
  appId: string;
  appSecret?: string;
  webhookUrl?: string;
  verifyToken?: string;
  pageInfo?: any;
  tokenExpiresAt?: string;
  lastTokenValidation?: string;
}

interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  pageInfo: any | null;
  consecutiveFailures: number;
  lastSuccessfulValidation: Date | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt: Date | null;
}

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const healthMonitoringIntervals = new Map<number, NodeJS.Timeout>();
const recoveryTimeouts = new Map<number, NodeJS.Timeout>();


const HEALTH_CHECK_INTERVALS = {
  ACTIVE: 120000,    // 2 minutes for active connections
  INACTIVE: 300000,  // 5 minutes for inactive connections
  ERROR: 60000,      // 1 minute for connections with errors
  RECOVERY: 30000    // 30 seconds during recovery
};

const ACTIVITY_THRESHOLDS = {
  INACTIVE_TIMEOUT: 600000,  // 10 minutes
  ACTIVE_THRESHOLD: 300000,  // 5 minutes
  TOKEN_VALIDATION_INTERVAL: 3600000, // 1 hour
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_BACKOFF_BASE: 30000 // 30 seconds
};

const eventEmitter = new EventEmitter();


eventEmitter.setMaxListeners(50);


import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
eventEmitterMonitor.register('messenger-service', eventEmitter);

const MESSENGER_API_VERSION = 'v24.0';
const MESSENGER_GRAPH_URL = 'https://graph.facebook.com';

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
      pageInfo: null,
      consecutiveFailures: 0,
      lastSuccessfulValidation: null,
      isRecovering: false,
      recoveryAttempts: 0,
      lastRecoveryAttempt: null
    });
  }
  return connectionStates.get(connectionId)!;
}

/**
 * Update connection activity
 */
function updateConnectionActivity(connectionId: number, success: boolean = true, error?: string) {
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
      logger.info('messenger', `Connection ${connectionId} recovered successfully`);
      

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

/**
 * Start health monitoring for a connection
 */
function startHealthMonitoring(connectionId: number) {
  stopHealthMonitoring(connectionId);

  const performHealthCheck = async () => {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        stopHealthMonitoring(connectionId);
        return;
      }

      const state = getConnectionState(connectionId);
      const timeSinceValidation = state.lastSuccessfulValidation
        ? Date.now() - state.lastSuccessfulValidation.getTime()
        : Infinity;


      if (timeSinceValidation > ACTIVITY_THRESHOLDS.TOKEN_VALIDATION_INTERVAL) {
        await validateTokenHealth(connectionId);
      }



      if (!state.isActive) {
        state.isActive = true;
        await storage.updateChannelConnectionStatus(connectionId, 'active');
        eventEmitter.emit('connectionStatusUpdate', {
          connectionId,
          status: 'active'
        });
        logger.info('messenger', `Connection ${connectionId} ensured as active (Messenger channels are always active)`);
      }


      const nextInterval = getAdaptiveHealthCheckInterval(state);
      const timeout = setTimeout(performHealthCheck, nextInterval);
      healthMonitoringIntervals.set(connectionId, timeout);
      
    } catch (error) {
      logger.error('messenger', `Health monitoring error for connection ${connectionId}:`, error);
      updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Health check failed');
      

      const timeout = setTimeout(performHealthCheck, HEALTH_CHECK_INTERVALS.ERROR);
      healthMonitoringIntervals.set(connectionId, timeout);
    }
  };


  performHealthCheck();
}

/**
 * Stop health monitoring for a connection
 */
function stopHealthMonitoring(connectionId: number) {
  const interval = healthMonitoringIntervals.get(connectionId);
  if (interval) {
    clearTimeout(interval);
    healthMonitoringIntervals.delete(connectionId);
  }
  

  const recoveryTimeout = recoveryTimeouts.get(connectionId);
  if (recoveryTimeout) {
    clearTimeout(recoveryTimeout);
    recoveryTimeouts.delete(connectionId);
  }
}

/**
 * Get adaptive health check interval based on connection state
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState): number {
  if (state.isRecovering) {
    return HEALTH_CHECK_INTERVALS.RECOVERY;
  }
  if (state.errorCount > 0) {
    return HEALTH_CHECK_INTERVALS.ERROR;
  }
  if (state.isActive) {
    return HEALTH_CHECK_INTERVALS.ACTIVE;
  }
  return HEALTH_CHECK_INTERVALS.INACTIVE;
}

/**
 * Validate token health by making a test API call
 */
async function validateTokenHealth(connectionId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      return false;
    }

    const connectionData = connection.connectionData as MessengerConnectionData;
    const accessToken = connection.accessToken;

    if (!accessToken || !connectionData?.pageId) {
      return false;
    }


    const response = await axios.get(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/${connectionData.pageId}`,
      {
        params: { fields: 'id,name' },
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      }
    );

    if (response.status === 200) {
      updateConnectionActivity(connectionId, true);
      logger.debug('messenger', `Token validation successful for connection ${connectionId}`);
      return true;
    }

    return false;
  } catch (error: any) {
    logger.warn('messenger', `Token validation failed for connection ${connectionId}:`, error.message);
    

    if (error.response?.status === 401 || error.response?.status === 403) {
      await handleTokenExpiration(connectionId);
    } else {
      updateConnectionActivity(connectionId, false, error.message);
    }
    
    return false;
  }
}

/**
 * Handle token expiration by updating connection status and notifying
 */
async function handleTokenExpiration(connectionId: number): Promise<void> {
  try {
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    
    const state = getConnectionState(connectionId);
    state.lastError = 'Access token expired or invalid';
    state.isActive = false;
    
    eventEmitter.emit('connectionError', {
      connectionId,
      error: 'Access token expired or invalid',
      requiresReauth: true
    });
    
    logger.error('messenger', `Access token expired for connection ${connectionId}`);
  } catch (error) {
    logger.error('messenger', `Error handling token expiration for connection ${connectionId}:`, error);
  }
}

/**
 * Initiate connection recovery process
 */
async function initiateConnectionRecovery(connectionId: number): Promise<void> {
  const state = getConnectionState(connectionId);
  
  if (state.isRecovering) {
    return; // Already recovering
  }
  
  if (state.recoveryAttempts >= ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
    logger.error('messenger', `Max recovery attempts reached for connection ${connectionId}`);
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    return;
  }
  
  state.isRecovering = true;
  state.recoveryAttempts++;
  state.lastRecoveryAttempt = new Date();
  
  logger.info('messenger', `Initiating recovery for connection ${connectionId} (attempt ${state.recoveryAttempts})`);
  

  const backoffDelay = ACTIVITY_THRESHOLDS.RECOVERY_BACKOFF_BASE * Math.pow(2, state.recoveryAttempts - 1);
  
  const recoveryTimeout = setTimeout(async () => {
    try {
      const success = await validateTokenHealth(connectionId);
      if (success) {
        logger.info('messenger', `Recovery successful for connection ${connectionId}`);
      } else {

        if (state.recoveryAttempts < ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
          setTimeout(() => initiateConnectionRecovery(connectionId), backoffDelay);
        } else {
          state.isRecovering = false;
          await storage.updateChannelConnectionStatus(connectionId, 'error');
          logger.error('messenger', `Recovery failed for connection ${connectionId} after ${state.recoveryAttempts} attempts`);
        }
      }
    } catch (error) {
      logger.error('messenger', `Recovery error for connection ${connectionId}:`, error);
      state.isRecovering = false;
    }
    
    recoveryTimeouts.delete(connectionId);
  }, backoffDelay);
  
  recoveryTimeouts.set(connectionId, recoveryTimeout);
}

/**
 * Process a message through the flow executor
 * This function handles flow execution for Messenger messages
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
    logger.error('messenger', 'Error in flow executor:', error);
    throw error;
  }
}

/**
 * Find or create a conversation for a contact and channel
 * @param connectionId The channel connection ID
 * @param recipientId The recipient's Facebook user ID (PSID)
 * @param companyId The company ID for multi-tenant security
 * @returns The conversation object
 */
async function findOrCreateConversation(connectionId: number, recipientId: string, companyId: number) {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }


  const cleanedRecipientId = cleanRecipientId(recipientId);

  let contact = await storage.getContactByPhone(cleanedRecipientId, companyId);

  if (!contact) {


    const connection = await storage.getChannelConnection(connectionId);
    let userName = generateFallbackName(cleanedRecipientId); // Use friendly fallback name
    let avatarUrl = null;

    if (connection?.accessToken) {

      const userProfile = await fetchFacebookUserProfileWithRetry(cleanedRecipientId, connection.accessToken);
      if (validateUserProfile(userProfile) && userProfile) {
        userName = userProfile.name;
        avatarUrl = userProfile.profile_pic || null;
        
      } else {

      }
    } else {

    }

    const contactData: InsertContact = {
      companyId: companyId,
      name: userName,
      phone: cleanedRecipientId,
      email: null,
      avatarUrl: avatarUrl,
      identifier: cleanedRecipientId,
      identifierType: 'messenger',
      source: 'messenger',
      notes: null
    };

    

    contact = await storage.getOrCreateContact(contactData);

    
  } else {

    if (contact.name.startsWith('Messenger User ')) {
      const connection = await storage.getChannelConnection(connectionId);
      if (connection?.accessToken) {

        const userProfile = await fetchFacebookUserProfileWithRetry(cleanedRecipientId, connection.accessToken);
        if (validateUserProfile(userProfile) && userProfile) {
          await storage.updateContact(contact.id, {
            name: userProfile.name,
            avatarUrl: userProfile.profile_pic || contact.avatarUrl
          });
          contact.name = userProfile.name;
          contact.avatarUrl = userProfile.profile_pic || contact.avatarUrl;
          
        } else {

          const friendlyName = generateFallbackName(cleanedRecipientId);
          await storage.updateContact(contact.id, {
            name: friendlyName
          });
          contact.name = friendlyName;
          
        }
      } else {

        const friendlyName = generateFallbackName(cleanedRecipientId);
        await storage.updateContact(contact.id, {
          name: friendlyName
        });
        contact.name = friendlyName;
     
      }
    }
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
      channelType: 'messenger',
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

/**
 * Fetch Facebook user profile information
 * @param userId The Facebook user ID (PSID)
 * @param accessToken The page access token
 * @returns User profile data or null if failed
 */
async function fetchFacebookUserProfile(userId: string, accessToken: string): Promise<{name: string, profile_pic?: string} | null> {
  try {
    

    const response = await axios.get(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/${userId}`,
      {
        params: {
          fields: 'first_name,last_name,profile_pic',
          access_token: accessToken
        },
        timeout: 10000
      }
    );

    

    if (response.status === 200 && response.data) {

      const firstName = response.data.first_name || '';
      const lastName = response.data.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();


      const displayName = fullName || firstName || `Messenger User ${userId}`;

      

      return {
        name: displayName,
        profile_pic: response.data.profile_pic
      };
    }
  } catch (error: any) {
    


    if (error.response?.status === 400) {
      const errorData = error.response?.data?.error;
      if (errorData?.code === 100 && errorData?.error_subcode === 33) {
        logger.warn('messenger', `🔒 User Profile API access denied for PSID ${userId}. This requires "Business Asset User Profile Access" permission from Facebook. Using fallback name generation.`);

      } else {
        logger.error('messenger', `Bad request when fetching user profile for ${userId}. PSID may be invalid or user may have blocked the page.`);
      }
    } else if (error.response?.status === 403) {
      logger.error('messenger', `Permission denied when fetching user profile for ${userId}. Check page access token permissions.`);
    } else if (error.response?.status === 404) {
      logger.error('messenger', `User profile not found for ${userId}. User may have deactivated their account.`);
    } else {
      logger.error('messenger', `Failed to fetch Facebook user profile for ${userId}:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
    }
  }

  return null;
}

/**
 * Fetch Facebook user profile with retry logic
 * @param userId The Facebook user ID (PSID)
 * @param accessToken The page access token
 * @param maxRetries Maximum number of retry attempts
 * @returns User profile data or null if failed
 */
async function fetchFacebookUserProfileWithRetry(
  userId: string,
  accessToken: string,
  maxRetries: number = 2
): Promise<{name: string, profile_pic?: string} | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchFacebookUserProfile(userId, accessToken);
      if (result) {
        return result;
      }


      if (attempt === 0) {

      }
    } catch (error: any) {



      if (error.response?.status === 400 || error.response?.status === 404) {

        break;
      }


      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }


  return null;
}

/**
 * Log contact creation/update events for debugging
 */
function logContactEvent(event: string, data: any): void {
  const logData = {
    timestamp: new Date().toISOString(),
    event,
    ...data
  };


  logger.info('messenger-contact', `${event}`, logData);
}

/**
 * Validate Facebook user profile data
 */
function validateUserProfile(profile: any): boolean {
  if (!profile) return false;


  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    return false;
  }


  if (profile.name.startsWith('Messenger User ')) {
    return false;
  }

  return true;
}

/**
 * Generate a user-friendly fallback name when Facebook User Profile API is not available
 * This creates more personalized names than just "Messenger User [PSID]"
 */
function generateFallbackName(psid: string): string {

  const adjectives = [
    'Friendly', 'Kind', 'Helpful', 'Smart', 'Creative', 'Awesome', 'Cool', 'Nice',
    'Happy', 'Bright', 'Cheerful', 'Positive', 'Amazing', 'Wonderful', 'Great'
  ];

  const nouns = [
    'Friend', 'Visitor', 'Guest', 'User', 'Contact', 'Person', 'Individual',
    'Customer', 'Client', 'Member', 'Supporter', 'Follower', 'Subscriber'
  ];


  const psidNum = parseInt(psid.slice(-6), 10) || 0; // Use last 6 digits
  const adjIndex = psidNum % adjectives.length;
  const nounIndex = Math.floor(psidNum / adjectives.length) % nouns.length;

  return `${adjectives[adjIndex]} ${nouns[nounIndex]}`;
}

/**
 * Clean recipient ID by removing + prefix if present
 * @param recipientId The recipient ID that may have + prefix
 * @returns Clean recipient ID without + prefix
 */
function cleanRecipientId(recipientId: string): string {
  if (recipientId.startsWith('+')) {
    const cleaned = recipientId.substring(1);
    
    return cleaned;
  }
  return recipientId;
}

/**
 * Update existing contact with Facebook profile information
 * @param contactId The contact ID to update
 * @param userId The Facebook user ID (PSID)
 * @param accessToken The page access token
 * @returns Updated contact or null if failed
 */
async function updateContactWithProfile(contactId: number, userId: string, accessToken: string): Promise<boolean> {
  try {
    const userProfile = await fetchFacebookUserProfile(userId, accessToken);
    if (userProfile) {
      await storage.updateContact(contactId, {
        name: userProfile.name,
        avatarUrl: userProfile.profile_pic || null
      });
      
      return true;
    }
  } catch (error: any) {
    
  }
  return false;
}

/**
 * Enhanced error handling utilities for Messenger service
 */

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

interface MessengerError {
  code?: string;
  message: string;
  type?: 'authentication' | 'rate_limit' | 'network' | 'validation' | 'unknown';
  retryable: boolean;
  requiresReauth?: boolean;
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
        logger.info('messenger', `${operationName} succeeded after ${attempt} retries`);
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
      logger.warn('messenger', `${operationName} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms:`, error instanceof Error ? error.message : error);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }


  logger.error('messenger', `${operationName} failed after ${config.maxRetries + 1} attempts:`, lastError);
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

/**
 * Verify webhook signature for Messenger
 * @param payload The raw payload from the webhook
 * @param signature The signature from the X-Hub-Signature-256 header
 * @param appSecret The app secret for verification
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload, 'utf8')
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    console.error('Error verifying Messenger webhook signature:', error);
    return false;
  }
}

/**
 * Verify webhook signature against any configured Messenger connection
 * @param payload The raw payload from the webhook
 * @param signature The signature from the X-Hub-Signature-256 header
 * @returns True if signature is valid for any connection
 */
async function verifyWebhookSignatureForAnyConnection(payload: string, signature: string): Promise<boolean> {
  try {
    const connections = await storage.getChannelConnections(null);
    const messengerConnections = connections.filter((conn: any) => conn.channelType === 'messenger');

    for (const connection of messengerConnections) {
      const connectionData = connection.connectionData as MessengerConnectionData;
      if (connectionData?.appSecret) {
        const isValid = verifyWebhookSignature(payload, signature, connectionData.appSecret);
        if (isValid) {

          return true;
        }
      }
    }

    console.warn('Webhook signature could not be verified against any connection');
    return false;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Connect to Facebook Messenger Page
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 * @param companyId The company ID for multi-tenant security
 */
export async function connectToMessenger(connectionId: number, userId: number, companyId?: number): Promise<void> {
  try {
    logger.info('messenger', `Connecting to Messenger for connection ${connectionId} by user ${userId} (company: ${companyId})`);

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (companyId && connection.companyId && connection.companyId !== companyId) {
      logger.error('messenger', `Company ID mismatch: Connection ${connectionId} belongs to company ${connection.companyId}, but user is from company ${companyId}`);
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    if (connection.userId !== userId) {
      logger.error('messenger', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

    activeConnections.set(connectionId, true);
    updateConnectionActivity(connectionId, true);

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as MessengerConnectionData;
    const pageId = connectionData?.pageId;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    if (!pageId) {
      throw new Error('Messenger page ID is missing');
    }


    const validationResult = await validateConnectionConfiguration(connectionData, accessToken);
    if (!validationResult.success) {
      await storage.updateChannelConnectionStatus(connectionId, 'error');

      eventEmitter.emit('connectionError', {
        connectionId,
        error: validationResult.error
      });

      throw new Error(`Connection validation failed: ${validationResult.error}`);
    }


    await storage.updateChannelConnectionStatus(connectionId, 'connected');

    const updatedConnectionData = {
      ...(connectionData || {}),
      pageInfo: validationResult.pageInfo,
      lastConnectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString()
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData
    });

    logger.info('messenger', `Connection ${connectionId} established successfully for page: ${validationResult.pageInfo?.name}`);


    startHealthMonitoring(connectionId);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'connected',
      pageInfo: validationResult.pageInfo
    });
  } catch (error: any) {
    logger.error('messenger', `Error connecting to Messenger connection ${connectionId}:`, error.message);
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    throw error;
  }
}

/**
 * Disconnect from Messenger
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 */
export async function disconnectFromMessenger(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.userId !== userId) {
      throw new Error('Unauthorized access to channel connection');
    }

    activeConnections.delete(connectionId);
    updateConnectionActivity(connectionId, true);


    stopHealthMonitoring(connectionId);

    await storage.updateChannelConnectionStatus(connectionId, 'disconnected');

    

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'disconnected'
    });

    return true;
  } catch (error: any) {
    console.error('Error disconnecting from Messenger:', error);
    return false;
  }
}

/**
 * Check if Messenger connection is active
 * @param connectionId The ID of the channel connection
 * @returns True if connection is active
 */
export function isMessengerConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId);
}

/**
 * Get all active Messenger connections
 * @returns Array of active connection IDs
 */
export function getActiveMessengerConnections(): number[] {
  return Array.from(activeConnections.keys());
}

/**
 * Enhanced send message function that integrates with the inbox system
 * @param connectionId The channel connection ID
 * @param userId The user ID sending the message
 * @param companyId The company ID for multi-tenant security
 * @param to The recipient Facebook user ID (PSID)
 * @param message The message content
 * @returns The saved message object
 */
export async function sendMessage(connectionId: number, userId: number, companyId: number, to: string, message: string) {
  try {
    if (!companyId) {
      throw new Error('Company ID is required for multi-tenant security');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.companyId !== companyId) {
      throw new Error(`Access denied: Connection does not belong to company ${companyId}`);
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as MessengerConnectionData;
    const pageId = connectionData?.pageId;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    if (!pageId) {
      throw new Error('Messenger page ID is missing');
    }



    const cleanedRecipientId = cleanRecipientId(to);
    
    

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messages`,
      {
        recipient: {
          id: cleanedRecipientId
        },
        message: {
          text: message
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data) {
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
        externalId: messageId || `messenger-${Date.now()}`,
        metadata: JSON.stringify({
          messenger_message_id: messageId,
          timestamp: new Date().toISOString(),
          page_id: pageId,
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
    logger.error('messenger', 'Error sending Messenger message:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || error.message);
  }
}

/**
 * Send a text message via Messenger (legacy function for backward compatibility)
 * @param connectionId The ID of the channel connection
 * @param to The recipient Facebook user ID (PSID)
 * @param message The message text to send
 * @returns Promise with send result
 */
export async function sendMessengerMessage(
  connectionId: number,
  to: string,
  message: string,
  userId?: number
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    return await executeWithRetry(
      async () => {
        const connection = await storage.getChannelConnection(connectionId);
        if (!connection) {
          throw new Error(`Connection with ID ${connectionId} not found`);
        }

        if (userId && connection.userId !== userId) {
          throw new Error('Unauthorized access to channel connection');
        }

        const accessToken = connection.accessToken;
        const connectionData = connection.connectionData as MessengerConnectionData;
        const pageId = connectionData?.pageId;

        if (!accessToken) {
          throw new Error('Messenger page access token is missing');
        }

        if (!pageId) {
          throw new Error('Messenger page ID is missing');
        }


        const cleanedRecipientId = cleanRecipientId(to);
        
        

        const response = await axios.post(
          `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messages`,
          {
            recipient: {
              id: cleanedRecipientId
            },
            message: {
              text: message
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.status === 200 && response.data) {
          const messageId = response.data.message_id;
          return {
            success: true,
            messageId
          };
        } else {
          throw new Error('Failed to send message: Unknown error');
        }
      },
      'Messenger message sending',
      connectionId
    );
  } catch (error: any) {
    logger.error('messenger', `Error sending message via connection ${connectionId}:`, error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}



/**
 * Send a message with quick replies via Messenger
 * @param connectionId The ID of the channel connection
 * @param to The recipient Facebook user ID (PSID)
 * @param message The message text to send
 * @param quickReplies Array of quick reply options
 * @returns Promise with send result
 */
export async function sendMessengerQuickReply(
  connectionId: number,
  to: string,
  message: string,
  quickReplies: Array<{ title: string; payload: string }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const accessToken = connection.accessToken;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    const formattedQuickReplies = quickReplies.map(reply => ({
      content_type: 'text',
      title: reply.title,
      payload: reply.payload
    }));

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messages`,
      {
        recipient: {
          id: to
        },
        message: {
          text: message,
          quick_replies: formattedQuickReplies
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.message_id;

      return {
        success: true,
        messageId
      };
    } else {
      return {
        success: false,
        error: 'Failed to send quick reply message: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('Error sending Messenger quick reply:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Upload media file to Facebook's servers using Attachment Upload API
 * @param accessToken Facebook page access token
 * @param filePath Local path to the media file
 * @param mediaType Type of media (image, video, audio, file)
 * @returns Promise with attachment ID
 */
async function uploadMediaToFacebook(
  accessToken: string,
  filePath: string,
  mediaType: 'image' | 'video' | 'audio' | 'file'
): Promise<{ success: boolean; attachmentId?: string; error?: string }> {
  try {
    const fs = await import('fs');
    const FormData = await import('form-data');

    

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const formData = new FormData.default();


    const message = {
      attachment: {
        type: mediaType,
        payload: {
          is_reusable: true
        }
      }
    };

    formData.append('message', JSON.stringify(message));
    formData.append('filedata', fs.createReadStream(filePath));

    const uploadResponse = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/message_attachments`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...formData.getHeaders()
        },
        timeout: 30000 // 30 second timeout for uploads
      }
    );

    if (uploadResponse.status === 200 && uploadResponse.data?.attachment_id) {
      

      return {
        success: true,
        attachmentId: uploadResponse.data.attachment_id
      };
    } else {
      console.error('❌ [MESSENGER UPLOAD] Upload failed:', uploadResponse.data);
      return {
        success: false,
        error: 'Failed to upload media to Facebook servers'
      };
    }
  } catch (error: any) {
    console.error('❌ [MESSENGER UPLOAD] Upload error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send a media message via Messenger using uploaded attachment
 * @param connectionId The ID of the channel connection
 * @param to The recipient Facebook user ID (PSID)
 * @param filePath Local path to the media file (will be uploaded to Facebook)
 * @param mediaType The type of media (image, video, audio, file)
 * @returns Promise with send result
 */
export async function sendMessengerMediaMessage(
  connectionId: number,
  to: string,
  filePath: string,
  mediaType: 'image' | 'video' | 'audio' | 'file'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const accessToken = connection.accessToken;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    


    const uploadResult = await uploadMediaToFacebook(accessToken, filePath, mediaType);

    if (!uploadResult.success || !uploadResult.attachmentId) {
      return {
        success: false,
        error: uploadResult.error || 'Failed to upload media to Facebook'
      };
    }


    const mediaRequest = {
      recipient: {
        id: to
      },
      message: {
        attachment: {
          type: mediaType,
          payload: {
            attachment_id: uploadResult.attachmentId
          }
        }
      }
    };

    

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messages`,
      mediaRequest,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.message_id;

      

      return {
        success: true,
        messageId
      };
    } else {
      return {
        success: false,
        error: 'Failed to send media message: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('❌ [MESSENGER MEDIA] Send error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send a button template message via Messenger
 * @param connectionId The ID of the channel connection
 * @param to The recipient Facebook user ID (PSID)
 * @param text The message text
 * @param buttons Array of button options
 * @returns Promise with send result
 */
export async function sendMessengerButtonTemplate(
  connectionId: number,
  to: string,
  text: string,
  buttons: Array<{ type: string; title: string; payload?: string; url?: string }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const accessToken = connection.accessToken;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messages`,
      {
        recipient: {
          id: to
        },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: text,
              buttons: buttons
            }
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 && response.data) {
      const messageId = response.data.message_id;

      return {
        success: true,
        messageId
      };
    } else {
      return {
        success: false,
        error: 'Failed to send button template: Unknown error'
      };
    }
  } catch (error: any) {
    console.error('Error sending Messenger button template:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Categorize Messenger API errors for better handling
 */
function categorizeMessengerError(error: any): MessengerError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const errorData = error.response?.data?.error;
    

    if (status === 401 || status === 403) {
      return {
        code: errorData?.code || 'AUTH_ERROR',
        message: errorData?.message || error.message,
        type: 'authentication',
        retryable: false,
        requiresReauth: true
      };
    }
    

    if (status === 429) {
      return {
        code: errorData?.code || 'RATE_LIMIT',
        message: errorData?.message || 'Rate limit exceeded',
        type: 'rate_limit',
        retryable: true
      };
    }
    

    if (status && status >= 500) {
      return {
        code: errorData?.code || 'SERVER_ERROR',
        message: errorData?.message || error.message,
        type: 'network',
        retryable: true
      };
    }
    

    if (status && status >= 400 && status < 500) {
      return {
        code: errorData?.code || 'VALIDATION_ERROR',
        message: errorData?.message || error.message,
        type: 'validation',
        retryable: false
      };
    }
  }
  

  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return {
      code: error.code,
      message: error.message,
      type: 'network',
      retryable: true
    };
  }
  

  return {
    message: error.message || 'Unknown error',
    type: 'unknown',
    retryable: false
  };
}

/**
 * Process messaging event with retry logic
 */
async function processMessagingEventWithRetry(
  messagingEvent: any, 
  companyId?: number, 
  targetConnection?: any, 
  eventId?: string
): Promise<void> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await handleIncomingMessengerMessage(messagingEvent, companyId, targetConnection);
      return; // Success
    } catch (error: any) {
      lastError = error;
      logger.warn('messenger', `Message processing failed for event ${eventId} (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      

      if (error.message.includes('Company ID mismatch') || error.message.includes('security violation')) {
        throw error;
      }
      
      if (attempt < maxRetries) {

        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logger.error('messenger', `Failed to process messaging event ${eventId} after ${maxRetries + 1} attempts:`, lastError);
  throw lastError;
}

/**
 * Process incoming webhook from Messenger with enhanced error handling and payload optimization
 * @param body The webhook payload
 * @param signature The webhook signature for verification
 * @param companyId Optional company ID for multi-tenant security
 */
export async function processWebhook(body: any, signature?: string, companyId?: number, targetConnection?: any): Promise<void> {
  const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {

    if (body['hub.mode'] === 'subscribe' && body['hub.verify_token']) {
      return;
    }


    if (signature && typeof body === 'string') {
      const isValidSignature = await verifyWebhookSignatureForAnyConnection(body, signature);
      if (!isValidSignature) {
        logger.error('messenger', `Invalid webhook signature for ${webhookId} - rejecting request`);
        throw new Error('Invalid webhook signature');
      }
      logger.debug('messenger', `Webhook signature verified for ${webhookId}`);
    }


    if (!body.entry || !Array.isArray(body.entry)) {
      logger.warn('messenger', `Invalid webhook payload structure for ${webhookId}: missing or invalid entry array`);
      return;
    }


    const totalMessages = body.entry.reduce((count: number, entry: any) => 
      count + (entry.messaging?.length || 0), 0);
    
    if (totalMessages > 50) {
      logger.warn('messenger', `Large webhook payload detected for ${webhookId}: ${totalMessages} messages`);
    }


    const concurrencyLimit = Math.min(5, Math.max(1, Math.floor(totalMessages / 10)));
    const entryPromises: Promise<void>[] = [];

    for (const entry of body.entry) {
      if (entry.messaging && Array.isArray(entry.messaging)) {

        const messagingPromises = entry.messaging.map((messagingEvent: any, index: number) =>
          processMessagingEventWithRetry(messagingEvent, companyId, targetConnection, `${webhookId}_${index}`)
        );
        

        for (let i = 0; i < messagingPromises.length; i += concurrencyLimit) {
          const batch = messagingPromises.slice(i, i + concurrencyLimit);
          entryPromises.push(Promise.all(batch).then(() => {}));
        }
      }
    }


    await Promise.all(entryPromises);
    
    logger.debug('messenger', `Webhook ${webhookId} processed successfully: ${totalMessages} messages`);

  } catch (error: any) {
    logger.error('messenger', `Error processing webhook ${webhookId}:`, {
      error: error.message,
      stack: error.stack,
      payloadSize: JSON.stringify(body).length,
      companyId,
      targetConnectionId: targetConnection?.id
    });
    throw error; // Re-throw to ensure proper HTTP error response
  }
}

/**
 * Handle an incoming message from Messenger webhook
 * @param messagingEvent The messaging event from the webhook
 * @param companyId Optional company ID for multi-tenant security
 */
async function handleIncomingMessengerMessage(messagingEvent: any, companyId?: number, targetConnection?: any): Promise<void> {
  let connection: any = null;

  try {
   


    const senderId = messagingEvent.sender?.id;
    const recipientId = messagingEvent.recipient?.id;
    const message = messagingEvent.message;
    const postback = messagingEvent.postback;


    if (message?.is_echo) {
      return;
    }


    if (messagingEvent.delivery || messagingEvent.read) {
      
      logger.debug('messenger', 'Skipping delivery/read receipt processing');
      return;
    }


    if (!message && !postback) {
    
      return;
    }


    if (!senderId || !recipientId) {

      return;
    }





    if (targetConnection) {

      connection = targetConnection;
    } else {

      const connections = await storage.getChannelConnectionsByType('messenger');
      connection = connections.find((conn: any) => {
        const connectionData = conn.connectionData as MessengerConnectionData;
        return connectionData?.pageId === recipientId;
      });

      if (!connection) {
       
        return;
      }


    }


    if (companyId && connection.companyId !== companyId) {
      return;
    }

    if (!connection.companyId) {
      logger.error('messenger', `Connection ${connection.id} missing companyId - security violation`);
      return;
    }


    
    let contact = await storage.getContactByPhone(senderId, connection.companyId);
    if (!contact) {

      

      let userName = generateFallbackName(senderId); // Use friendly fallback name instead of generic one
      let avatarUrl = null;

      if (connection.accessToken) {
        logContactEvent('PROFILE_FETCH_ATTEMPT', {
          senderId,
          connectionId: connection.id,
          hasAccessToken: true,
          fallbackName: userName
        });

        const userProfile = await fetchFacebookUserProfileWithRetry(senderId, connection.accessToken);
        if (validateUserProfile(userProfile) && userProfile) {
          userName = userProfile.name;
          avatarUrl = userProfile.profile_pic || null;

          logContactEvent('PROFILE_FETCH_SUCCESS', {
            senderId,
            name: userName,
            hasAvatar: !!avatarUrl,
            profilePicUrl: avatarUrl ? 'present' : 'none'
          });
        } else {
          logContactEvent('PROFILE_FETCH_FAILED', {
            senderId,
            reason: userProfile ? 'invalid_profile_data' : 'api_call_failed',
            fallbackName: userName,
            usingFriendlyFallback: true
          });
        }
      } else {
        logContactEvent('PROFILE_FETCH_SKIPPED', {
          senderId,
          reason: 'no_access_token',
          fallbackName: userName,
          usingFriendlyFallback: true
        });
      }
      
      const insertContactData: InsertContact = {
        companyId: connection.companyId,
        phone: senderId,
        name: userName,
        avatarUrl: avatarUrl,
        source: 'messenger',
        identifier: senderId,
        identifierType: 'messenger'
      };

      

      contact = await storage.getOrCreateContact(insertContactData);


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

      

      if (contact.name.startsWith('Messenger User ') && connection.accessToken) {
        logContactEvent('EXISTING_CONTACT_UPDATE_ATTEMPT', {
          contactId: contact.id,
          senderId,
          currentName: contact.name,
          hasAccessToken: true
        });

        const userProfile = await fetchFacebookUserProfileWithRetry(senderId, connection.accessToken);
        if (validateUserProfile(userProfile) && userProfile) {
          await storage.updateContact(contact.id, {
            name: userProfile.name,
            avatarUrl: userProfile.profile_pic || contact.avatarUrl
          });
          contact.name = userProfile.name;
          contact.avatarUrl = userProfile.profile_pic || contact.avatarUrl;

          logContactEvent('EXISTING_CONTACT_UPDATE_SUCCESS', {
            contactId: contact.id,
            senderId,
            oldName: `Messenger User ${senderId}`,
            newName: contact.name,
            hasAvatar: !!contact.avatarUrl
          });
        } else {

          const friendlyName = generateFallbackName(senderId);
          await storage.updateContact(contact.id, {
            name: friendlyName
          });
          contact.name = friendlyName;

          logContactEvent('EXISTING_CONTACT_UPDATE_FALLBACK', {
            contactId: contact.id,
            senderId,
            oldName: `Messenger User ${senderId}`,
            newName: friendlyName,
            reason: userProfile ? 'invalid_profile_data' : 'api_call_failed',
            usingFriendlyFallback: true
          });
        }
      } else if (contact.name.startsWith('Messenger User ') && !connection.accessToken) {

        const friendlyName = generateFallbackName(senderId);
        await storage.updateContact(contact.id, {
          name: friendlyName
        });
        contact.name = friendlyName;

        logContactEvent('EXISTING_CONTACT_UPDATE_NO_TOKEN', {
          contactId: contact.id,
          senderId,
          oldName: `Messenger User ${senderId}`,
          newName: friendlyName,
          usingFriendlyFallback: true
        });
      }
    }


    
    let conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connection.id
    );

    if (!conversation) {

      const insertConversationData: InsertConversation = {
        companyId: connection.companyId,
        contactId: contact.id,
        channelType: 'messenger',
        channelId: connection.id,
        status: 'open',
        lastMessageAt: new Date()
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

    let messageText = '';
    let messageType = 'text';
    let mediaUrl = null;
    let channelMessageId = null;

    if (message) {
      channelMessageId = message.mid;

      if (message.text) {
        messageText = message.text;
        messageType = 'text';
      } else if (message.attachments && message.attachments.length > 0) {
        const attachment = message.attachments[0];
        messageType = attachment.type || 'media';
        mediaUrl = attachment.payload?.url;
        messageText = `[${messageType.toUpperCase()}]`;
      } else if (message.quick_reply) {
        messageText = message.quick_reply.payload;
        messageType = 'quick_reply';
      }
    } else if (postback) {
      messageText = postback.payload || postback.title;
      messageType = 'postback';
      channelMessageId = `postback_${Date.now()}`;
    }

    if (!messageText) {
      
      return;
    }

    const insertMessageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageText,
      type: messageType,
      direction: 'inbound',
      status: 'delivered',
      externalId: channelMessageId,
      mediaUrl: mediaUrl,
      metadata: JSON.stringify({
        channelType: 'messenger',
        timestamp: messagingEvent.timestamp || Date.now(),
        senderId: senderId,
        recipientId: recipientId,
        pageId: recipientId
      })
    };



    
    const savedMessage = await storage.createMessage(insertMessageData);
    
    

    updateConnectionActivity(connection.id, true);


    try {
      await storage.updateChannelConnectionStatus(connection.id, 'active');
      activeConnections.set(connection.id, true);


      eventEmitter.emit('connectionStatusUpdate', {
        connectionId: connection.id,
        status: 'active'
      });
    } catch (statusError) {
      logger.error('messenger', 'Error updating connection status:', statusError);
    }


    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date(),
      status: 'active'
    });


    const conversationWithContact = await storage.getConversation(conversation.id);


    logger.info('messenger', `Message received from ${senderId} via connection ${connection.id}`);


    if ((global as any).broadcastToAllClients && (global as any).broadcastConversationUpdate && conversationWithContact) {

      (global as any).broadcastToAllClients({
        type: 'newMessage',
        data: savedMessage
      }, conversationWithContact.companyId);


      (global as any).broadcastConversationUpdate(conversationWithContact, 'conversationUpdated');


      try {
        const unreadCount = await storage.getUnreadCount(conversation.id);
        (global as any).broadcastToAllClients({
          type: 'unreadCountUpdated',
          data: {
            conversationId: conversation.id,
            unreadCount
          }
        }, conversationWithContact.companyId);
      } catch (error) {
        logger.error('messenger', 'Error broadcasting unread count update:', error);
      }
    }


    eventEmitter.emit('messageReceived', {
      message: savedMessage,
      conversation: conversationWithContact,
      contact: contact,
      connection: connection
    });


    try {
      if (connection.companyId && !conversation.botDisabled) {
        logger.debug('messenger', `Message eligible for flow processing: conversation ${conversation.id}`);


        await processMessageThroughFlowExecutor(savedMessage, conversation, contact, connection);
      }
    } catch (flowError: any) {
      logger.error('messenger', `Error processing message through flows:`, flowError.message);
    }

  } catch (error: any) {
    logger.error('messenger', `Error handling incoming Messenger message:`, error.message);
    if (connection?.id) {
      updateConnectionActivity(connection.id, false, error.message);
    }
  }
}

/**
 * Subscribe to Messenger events
 * @param eventType The type of event to subscribe to
 * @param callback The callback function to call when the event occurs
 * @returns A function to unsubscribe from the event
 */
export function subscribeToMessengerEvents(
  eventType: 'connectionStatusUpdate' | 'connectionError' | 'messageReceived' | 'messageSent',
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

    if (!url.pathname.includes('/api/webhooks/messenger')) {
      return { success: false, error: 'Webhook URL must point to /api/webhooks/messenger endpoint' };
    }

    const challenge = 'test_challenge_' + Date.now();
    const testParams = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': verifyToken,
      'hub.challenge': challenge
    });

    const testResponse = await axios.get(`${webhookUrl}?${testParams.toString()}`, {
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept any non-server error
    });

    

    if (testResponse.status === 200) {
      if (testResponse.data === challenge) {

        return { success: true };
      } else {
        
        return { success: false, error: 'Webhook returned incorrect challenge response' };
      }
    } else if (testResponse.status === 403) {

      return { success: false, error: 'Webhook verification failed - verify token does not match. Check your verify token configuration.' };
    } else {

      return { success: false, error: `Webhook test failed with status ${testResponse.status}` };
    }
  } catch (error: any) {
    console.error('❌ [WEBHOOK TEST] Error testing webhook configuration:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      return {
        success: false,
        error: 'Webhook verification failed - verify token does not match. Please check your verify token configuration.'
      };
    }
    
    return {
      success: false,
      error: error.code === 'ECONNREFUSED'
        ? 'Could not connect to webhook URL - check if server is accessible'
        : error.message || 'Webhook test failed'
    };
  }
}

/**
 * Validate Messenger connection configuration
 * @param connectionData The connection configuration to validate
 * @returns Promise with validation result
 */
export async function validateConnectionConfiguration(
  connectionData: MessengerConnectionData,
  accessToken: string
): Promise<{ success: boolean; error?: string; pageInfo?: any }> {
  try {

    const response = await axios.get(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/${connectionData.pageId}`,
      {
        params: {
          fields: 'id,name,picture,category,followers_count,access_token'
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
        pageInfo: response.data
      };
    } else {
      return {
        success: false,
        error: 'Failed to validate page access'
      };
    }
  } catch (error: any) {
    console.error('Error validating Messenger connection:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      return {
        success: false,
        error: 'Access denied - check page access token permissions'
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Page not found - check page ID'
      };
    } else {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Connection validation failed'
      };
    }
  }
}

/**
 * Set up webhook subscription for Messenger
 * @param connectionId The ID of the channel connection
 * @param callbackUrl The webhook callback URL
 * @param verifyToken The webhook verify token
 * @returns Promise<boolean> indicating success
 */
export async function setupWebhookSubscription(
  connectionId: number,
  callbackUrl: string,
  verifyToken: string
): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const accessToken = connection.accessToken;
    const connectionData = connection.connectionData as MessengerConnectionData;
    const appId = connectionData?.appId;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    if (!appId) {
      throw new Error('Messenger app ID is missing');
    }

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/${appId}/subscriptions`,
      {
        object: 'page',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: [
          'messages',
          'messaging_postbacks',
          'messaging_optins',
          'message_deliveries',
          'message_reads'
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.status === 200;
  } catch (error: any) {
    console.error('Error setting up Messenger webhook subscription:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Set up persistent menu for Messenger page
 * @param connectionId The ID of the channel connection
 * @param menuItems Array of menu items
 * @returns Promise<boolean> indicating success
 */
export async function setupPersistentMenu(
  connectionId: number,
  menuItems: Array<{ type: string; title: string; payload?: string; url?: string }>
): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const accessToken = connection.accessToken;

    if (!accessToken) {
      throw new Error('Messenger page access token is missing');
    }

    const response = await axios.post(
      `${MESSENGER_GRAPH_URL}/${MESSENGER_API_VERSION}/me/messenger_profile`,
      {
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: menuItems
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.status === 200;
  } catch (error: any) {
    console.error('Error setting up Messenger persistent menu:', error.response?.data || error.message);
    return false;
  }
}

export default {
  connect: connectToMessenger,
  disconnect: disconnectFromMessenger,
  sendMessage: sendMessengerMessage,
  sendQuickReply: sendMessengerQuickReply,
  sendMedia: sendMessengerMediaMessage,
  sendButtonTemplate: sendMessengerButtonTemplate,
  isActive: isMessengerConnectionActive,
  getActiveConnections: getActiveMessengerConnections,
  subscribeToEvents: subscribeToMessengerEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  setupPersistentMenu: setupPersistentMenu,
  verifyWebhookSignature,
  testWebhookConfiguration,
  validateConnectionConfiguration,
  getConnectionHealth,
  initializeHealthMonitoring
};

/**
 * Initialize health monitoring for all active Messenger connections
 * This should be called when the server starts
 */
export async function initializeHealthMonitoring(): Promise<void> {
  try {
    const connections = await storage.getChannelConnectionsByType('messenger');

    for (const connection of connections) {
      if (connection.status === 'active' || connection.status === 'connected') {
        activeConnections.set(connection.id, true);
        updateConnectionActivity(connection.id, true);
        startHealthMonitoring(connection.id);

        logger.info('messenger', `Started health monitoring for connection ${connection.id}`);
      }
    }
  } catch (error) {
    logger.error('messenger', 'Error initializing health monitoring:', error);
  }
}
