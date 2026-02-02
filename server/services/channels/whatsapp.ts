import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
  WAMessage,
  downloadMediaMessage,
  decryptPollVote,
  jidNormalizedUser,
  fetchLatestWaWebVersion
} from 'baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import * as fsPromises from 'fs/promises';
import fsExtra from 'fs-extra';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { storage } from '../../storage';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  Message,
  PERMISSIONS
} from '@shared/schema';
import pino from 'pino';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { getUserPermissions } from '../../middleware';
import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
import {
  convertAudioForWhatsAppWithFallback,
  needsConversionForWhatsApp,
  getWhatsAppMimeType,
  cleanupTempAudioFiles
} from '../../utils/audio-converter';
import { isWhatsAppGroupChatId } from '../../utils/whatsapp-group-filter';
import mimeTypes from 'mime-types';

/**
 * Helper function to determine the correct identifier type based on connection type
 */
function getIdentifierTypeFromConnection(channelType?: string): string {
  if (channelType) {
    switch (channelType) {
      case 'whatsapp_official':
        return 'whatsapp_official';
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return 'whatsapp_unofficial';
      default:
        return channelType;
    }
  }

  return 'whatsapp_unofficial';
}

/**
 * Normalize WhatsApp JID to standard format
 * Converts @lid (linked device) and other non-standard formats to @s.whatsapp.net
 * @param jid - The JID to normalize (e.g., "1234567890@lid" or "1234567890@s.whatsapp.net")
 * @returns Normalized JID in format "phoneNumber@s.whatsapp.net" or "groupId@g.us"
 */
function normalizeWhatsAppJid(jid: string): string {
  if (!jid || typeof jid !== 'string') {
    return jid;
  }


  if (jid.endsWith('@g.us')) {
    return jid;
  }


  const parts = jid.split('@');
  if (parts.length < 2) {

    const cleanPhone = jid.replace(/[^\d]/g, '');
    return cleanPhone ? `${cleanPhone}@s.whatsapp.net` : jid;
  }

  const phoneNumber = parts[0];
  const suffix = parts[1].toLowerCase();


  if (suffix === 'lid' || suffix === 'whatsapp.net' || !suffix.includes('.')) {
    return `${phoneNumber}@s.whatsapp.net`;
  }


  return jid;
}

/**
 * Extract and normalize phone number from WhatsApp JID
 * @param jid - The JID to extract phone number from
 * @returns Clean phone number (digits only)
 */
function extractPhoneNumberFromJid(jid: string): string {
  const normalizedJid = normalizeWhatsAppJid(jid);
  const phoneNumber = normalizedJid.split('@')[0];
  return phoneNumber.replace(/[^\d]/g, '');
}

process.on('unhandledRejection', (reason: any, promise) => {
  if (reason && reason.message && reason.message.includes('No session found to decrypt message')) {
    const key = reason.key;
    if (key && (key.remoteJid === 'status@broadcast' || key.remoteJid?.includes('@broadcast'))) {

      return;
    }
  }

  if (reason && !reason.message?.includes('No session found to decrypt message')) {
    console.error('Unhandled Promise Rejection in WhatsApp service:', reason);
  }
});

interface ConnectionState {
  socket: WASocket | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'qr_code';
  lastConnected: Date | null;
  reconnectAttempts: number;
  lastReconnectAttempt: Date | null;
  healthScore: number;
  errorCount: number;
  lastError: string | null;
  lastLatency: number | null;
  averageLatency: number | null;
  latencyHistory: number[];
  lastHealthCheck: Date | null;
  qrGenerationTimeout: NodeJS.Timeout | null;
  lastQr: string | null; // Cache last QR string for deduplication (Comment 1)
  lastQrAt: Date | null; // Timestamp of last QR emission (Comment 1)
  nextAttemptIn: number | null; // Store computed backoff delay for observability (Comment 5)
  companyId?: number; // Company ID for filtering events
  rateLimitInfo: {
    messagesSent: number;
    lastReset: Date;
    isLimited: boolean;
  };
}

interface ReconnectionConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  healthCheckInterval: number;
  pingTimeout: number;
  rateLimitWindow: number;
  maxMessagesPerWindow: number;
}

const activeConnections = new Map<number, WASocket>();
const connectionStates = new Map<number, ConnectionState>();


const connectSemaphore = {
  maxConcurrent: 8,
  current: 0,
  waiting: [] as Array<{ resolve: () => void; reject: (err: Error) => void }>,
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.current < this.maxConcurrent) {
        this.current++;
        resolve();
      } else {
        this.waiting.push({ resolve, reject });
      }
    });
  },
  release(): void {
    this.current--;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      this.current++;
      next.resolve();
    }
  }
};


const companyConnectSemaphores = new Map<number, {
  maxConcurrent: number;
  current: number;
  waiting: Array<{ resolve: () => void; reject: (err: Error) => void }>;
  acquire(): Promise<void>;
  release(): void;
}>();

function getCompanySemaphore(companyId: number): typeof companyConnectSemaphores extends Map<number, infer T> ? T : never {
  if (!companyConnectSemaphores.has(companyId)) {
    const semaphore = {
      maxConcurrent: 2, // Max 2 concurrent connects per company
      current: 0,
      waiting: [] as Array<{ resolve: () => void; reject: (err: Error) => void }>,
      async acquire(): Promise<void> {
        return new Promise((resolve, reject) => {
          if (this.current < this.maxConcurrent) {
            this.current++;
            resolve();
          } else {
            this.waiting.push({ resolve, reject });
          }
        });
      },
      release(): void {
        this.current--;
        if (this.waiting.length > 0) {
          const next = this.waiting.shift()!;
          this.current++;
          next.resolve();
        }
      }
    };
    companyConnectSemaphores.set(companyId, semaphore);
  }
  return companyConnectSemaphores.get(companyId)!;
}


const qrGenerationRateLimits = new Map<string, {
  lastInvocation: number;
  count: number;
  windowStart: number;
}>();


interface ReconnectTask {
  connectionId: number;
  connection: any;
  priority: number;
  addedAt: number;
}

const reconnectQueue: ReconnectTask[] = [];
let reconnectPoolSize = 4; // Max concurrent reconnections
let activeReconnections = 0;
let reconnectQueueProcessing = false;


const pollContextCache = new Map<string, {
  pollName: string;
  pollOptions: string[];
  selectableCount: number;
  createdAt: number;
  pollCreationMessage?: any; 
  pollMsgId?: string;
  pollCreatorJid?: string;
  pollEncKey?: any; 
  sentMessage?: any; 
}>();


setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  const keysToDelete: string[] = [];
  pollContextCache.forEach((context, key) => {
    if (now - context.createdAt > maxAge) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => pollContextCache.delete(key));
}, 60 * 60 * 1000); // Run every hour

const RECONNECTION_CONFIG: ReconnectionConfig = {
  maxAttempts: 8, // Reduced from 10 (Comment 5)
  baseDelay: 2000,
  maxDelay: 300000,
  backoffMultiplier: 1.5,
  healthCheckInterval: 20000, // Will be adaptive (Comment 4)
  pingTimeout: 7000, // Reduced from 10000 (Comment 4)
  rateLimitWindow: 60000,
  maxMessagesPerWindow: 100
};

interface TypingConfig {
  enabled: boolean;
  wordsPerMinute: number;
  minDelay: number;
  maxDelay: number;
  randomnessFactor: number;
  recordingMinDelay: number;
  recordingMaxDelay: number;
}

interface MessageSplittingConfig {
  enabled: boolean;
  maxLength: number;
  splitMethod: 'sentences' | 'paragraphs' | 'characters' | 'logical';
  delayBetweenMessages: number;
  randomDelayFactor: number;
  preserveFormatting: boolean;
  minChunkSize: number;
  smartBoundaries: boolean;
  prioritizeSentences: boolean;

  logicalSplitting: {
    enabled: boolean;
    delimiter: string;
    fallbackToCharacters: boolean;
  };
}

interface MessageDebouncingConfig {
  enabled: boolean;
  debounceDelay: number;
  maxDebounceDelay: number;
}

interface DebouncedMessage {
  message: any;
  conversation: any;
  contact: any;
  channelConnection: any;
  timeoutId: NodeJS.Timeout;
  createdAt: Date;
}

const TYPING_CONFIG: TypingConfig = {
  enabled: true,
  wordsPerMinute: 50,
  minDelay: 1000,
  maxDelay: 5000,
  randomnessFactor: 0.6,
  recordingMinDelay: 2000,
  recordingMaxDelay: 4000,
};

const MESSAGE_SPLITTING_CONFIG: MessageSplittingConfig = {
  enabled: false,
  maxLength: 300,
  splitMethod: 'sentences',
  delayBetweenMessages: 2000,
  randomDelayFactor: 0.5,
  preserveFormatting: true,
  minChunkSize: 20,
  smartBoundaries: true,
  prioritizeSentences: true,
  logicalSplitting: {
    enabled: true,
    delimiter: '||',
    fallbackToCharacters: true,
  },
};

const MESSAGE_DEBOUNCING_CONFIG: MessageDebouncingConfig = {
  enabled: true,
  debounceDelay: 5000,
  maxDebounceDelay: 30000,
};

/**
 * Check if a user has permission to access a WhatsApp connection
 * Integrates with the company's permission system
 */
export async function checkConnectionPermission(
  user: any,
  connection: any,
  conversationId?: number,
  connectionId?: number
): Promise<boolean> {


  if (user.isSuperAdmin) {
    return true;
  }

  if (connection.userId === user.id) {
    return true;
  }

  let connectionCompanyId = connection.companyId;

  if (!connectionCompanyId && connection.userId) {
    try {
      const connectionOwner = await storage.getUser(connection.userId);
      connectionCompanyId = connectionOwner?.companyId;

    } catch (error) {
      console.error('Error getting connection owner:', error);
    }
  }

  if (user.companyId !== connectionCompanyId) {
    return false;
  }

  const userPermissions = await getUserPermissions(user);


  if (userPermissions[PERMISSIONS.MANAGE_CHANNELS]) {
    return true;
  }

  if (userPermissions[PERMISSIONS.MANAGE_CONVERSATIONS]) {

    const targetConnectionId = connectionId || connection.id;

    if (conversationId) {

      try {
        const conversation = await storage.getConversation(conversationId);


        if (!conversation) {

          return false;
        }

        const isAssignedToUser = conversation.assignedToUserId === user.id;
        const isCorrectChannel = conversation.channelId === targetConnectionId;



        if (conversation && isAssignedToUser && isCorrectChannel) {

          return true;
        } else {

        }
      } catch (error) {
        console.error('Error checking conversation assignment:', error);
      }
    } else {

      try {
        const { conversations: allConversations } = await storage.getConversations({
          companyId: user.companyId
        });


        const assignedConversations = allConversations.filter(
          (conv: any) => conv.assignedToUserId === user.id
        );


        const conversationsOnConnection = assignedConversations.filter(
          (conv: any) => conv.channelId === targetConnectionId
        );


        if (conversationsOnConnection.length > 0) {

          return true;
        }
      } catch (error) {
        console.error('Error checking agent conversation assignments:', error);
      }
    }
  } else {

  }



  if (user.role === 'agent') {




  }

  return false;
}

const debouncedMessages = new Map<string, DebouncedMessage>();

interface QueuedMessage {
  id: string;
  phoneNumber: string;
  connectionId: number;
  chunks: string[];
  currentChunkIndex: number;
  timeoutIds: NodeJS.Timeout[];
  createdAt: Date;
  sock: any;
  cancelled: boolean;
}

const messageQueues = new Map<string, QueuedMessage[]>();

/**
 * Generate a unique queue ID for a user's message queue
 */
function getQueueKey(phoneNumber: string, connectionId: number): string {
  return `${connectionId}_${phoneNumber}`;
}

/**
 * Cancel all queued messages for a specific user
 */
function cancelQueuedMessages(phoneNumber: string, connectionId: number): void {
  const queueKey = getQueueKey(phoneNumber, connectionId);
  const userQueue = messageQueues.get(queueKey);

  if (!userQueue || userQueue.length === 0) {

    return;
  }



  let totalTimeoutsCancelled = 0;
  let totalChunksCancelled = 0;

  for (const queuedMessage of userQueue) {
    const remainingChunks = queuedMessage.chunks.length - queuedMessage.currentChunkIndex;
    totalChunksCancelled += remainingChunks;



    queuedMessage.cancelled = true;

    for (const timeoutId of queuedMessage.timeoutIds) {
      clearTimeout(timeoutId);
      totalTimeoutsCancelled++;

    }

    queuedMessage.timeoutIds.length = 0;
  }

  messageQueues.delete(queueKey);


}

/**
 * Add a message to the queue for delayed sending
 */
function addToMessageQueue(
  phoneNumber: string,
  connectionId: number,
  chunks: string[],
  messageId: string,
  sock: any
): QueuedMessage {
  const queueKey = getQueueKey(phoneNumber, connectionId);

  if (!messageQueues.has(queueKey)) {
    messageQueues.set(queueKey, []);
  }

  const queuedMessage: QueuedMessage = {
    id: messageId,
    phoneNumber,
    connectionId,
    chunks,
    currentChunkIndex: 0,
    timeoutIds: [],
    createdAt: new Date(),
    sock,
    cancelled: false
  };

  messageQueues.get(queueKey)!.push(queuedMessage);



  return queuedMessage;
}

/**
 * Remove a specific message from the queue
 */
function removeFromMessageQueue(phoneNumber: string, connectionId: number, messageId: string): void {
  const queueKey = getQueueKey(phoneNumber, connectionId);
  const userQueue = messageQueues.get(queueKey);

  if (!userQueue) {
    return;
  }

  const messageIndex = userQueue.findIndex(msg => msg.id === messageId);
  if (messageIndex !== -1) {
    const queuedMessage = userQueue[messageIndex];
    for (const timeoutId of queuedMessage.timeoutIds) {
      clearTimeout(timeoutId);
    }
    userQueue.splice(messageIndex, 1);

    if (userQueue.length === 0) {
      messageQueues.delete(queueKey);
    }


  }
}

const healthCheckIntervals = new Map<number, NodeJS.Timeout>();
const reconnectionTimeouts = new Map<number, NodeJS.Timeout>();
const connectionAttempts = new Map<number, boolean>();

/**
 * Get a WhatsApp connection by ID
 * @param connectionId The ID of the connection
 * @returns The WhatsApp socket or undefined if not found
 */
export function getConnection(connectionId: number): WASocket | undefined {
  return activeConnections.get(connectionId);
}

/**
 * Initialize connection state for enterprise-grade management
 */
function initializeConnectionState(connectionId: number): ConnectionState {
  const state: ConnectionState = {
    socket: null,
    status: 'disconnected',
    lastConnected: null,
    reconnectAttempts: 0,
    lastReconnectAttempt: null,
    healthScore: 100,
    errorCount: 0,
    lastError: null,
    lastLatency: null,
    averageLatency: null,
    latencyHistory: [],
    lastHealthCheck: null,
    qrGenerationTimeout: null,
    lastQr: null,
    lastQrAt: null,
    nextAttemptIn: null,
    rateLimitInfo: {
      messagesSent: 0,
      lastReset: new Date(),
      isLimited: false
    }
  };

  connectionStates.set(connectionId, state);
  return state;
}

/**
 * Get or create connection state
 */
function getConnectionState(connectionId: number): ConnectionState {
  let state = connectionStates.get(connectionId);
  if (!state) {
    state = initializeConnectionState(connectionId);
  }
  return state;
}

/**
 * Calculate exponential backoff delay with jitter (Comment 5)
 */
function calculateBackoffDelay(attempt: number): number {
  const baseDelay = RECONNECTION_CONFIG.baseDelay * Math.pow(RECONNECTION_CONFIG.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(baseDelay, RECONNECTION_CONFIG.maxDelay);

  const jitter = (Math.random() * 1.0) + 0.5; // 0.5 to 1.5
  return Math.floor(cappedDelay * jitter);
}

/**
 * Update connection health score based on events
 */
function updateHealthScore(connectionId: number, event: 'success' | 'error' | 'timeout'): void {
  const state = getConnectionState(connectionId);

  switch (event) {
    case 'success':
      state.healthScore = Math.min(100, state.healthScore + 10);
      state.errorCount = Math.max(0, state.errorCount - 1);
      break;
    case 'error':
      state.healthScore = Math.max(0, state.healthScore - 20);
      state.errorCount++;
      break;
    case 'timeout':
      state.healthScore = Math.max(0, state.healthScore - 15);
      state.errorCount++;
      break;
  }


}

/**
 * Check if connection should attempt reconnection based on health and limits
 */
function shouldAttemptReconnection(connectionId: number): boolean {
  const state = getConnectionState(connectionId);

  if (state.reconnectAttempts >= RECONNECTION_CONFIG.maxAttempts) {

    return false;
  }

  if (state.healthScore < 20) {

    return false;
  }



  return true;
}

/**
 * Get adaptive health check interval with jitter (Comment 4)
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState): number {
  const baseInterval = RECONNECTION_CONFIG.healthCheckInterval;
  let adaptiveInterval: number;
  

  if (state.averageLatency !== null && state.averageLatency < 1500 && state.errorCount === 0) {

    adaptiveInterval = 60000 + Math.random() * 30000; // 60-90s
  } else if (state.averageLatency !== null && state.averageLatency < 3000 && state.errorCount < 3) {

    adaptiveInterval = 45000 + Math.random() * 15000; // 45-60s
  } else {

    adaptiveInterval = 20000 + Math.random() * 10000; // 20-30s
  }
  

  const jitter = (Math.random() * 0.4) - 0.2; // -0.2 to +0.2
  return Math.floor(adaptiveInterval * (1 + jitter));
}

/**
 * Start health monitoring for a connection with adaptive intervals (Comment 4)
 */
function startHealthMonitoring(connectionId: number): void {
  const existingInterval = healthCheckIntervals.get(connectionId);
  if (existingInterval) {
    clearInterval(existingInterval);
  }

  let healthCheckCounter = 0;
  let consecutiveFailures = 0;

  const performHealthCheck = async () => {
    const sock = activeConnections.get(connectionId);
    const state = getConnectionState(connectionId);

    if (!sock || state.status !== 'connected') {
      return;
    }

    healthCheckCounter++;

    try {

      const pingStart = Date.now();
      
      try {

        await Promise.race([
          sock.query({ tag: 'iq', attrs: { type: 'get', xmlns: 'w:p' } }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Ping timeout')), RECONNECTION_CONFIG.pingTimeout)
          )
        ]);


        const latency = Date.now() - pingStart;
        

        state.lastLatency = latency;
        state.latencyHistory.push(latency);
        

        if (state.latencyHistory.length > 10) {
          state.latencyHistory = state.latencyHistory.slice(-10);
        }
        

        state.averageLatency = state.latencyHistory.reduce((sum, val) => sum + val, 0) / state.latencyHistory.length;
        state.lastHealthCheck = new Date();
        consecutiveFailures = 0; // Reset on success


        if (latency > 5000) {
          updateHealthScore(connectionId, 'timeout');
        } else if (latency >= 2000) {
          updateHealthScore(connectionId, 'error');
        } else {
          updateHealthScore(connectionId, 'success');
        }


        if (!sock.authState?.keys || !sock.user?.id) {
          updateHealthScore(connectionId, 'error');
        }

      } catch (pingError) {

        consecutiveFailures++;
        updateHealthScore(connectionId, 'error');
        console.error(`Health check ping failed for connection ${connectionId}:`, pingError);
        state.lastLatency = null;


        if (consecutiveFailures >= 2 && state.healthScore < 30) {
          await scheduleReconnection(connectionId, await storage.getChannelConnection(connectionId));
        }
      }


      let connectionStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (state.healthScore >= 70 && (state.lastLatency === null || state.lastLatency < 2000)) {
        connectionStatus = 'healthy';
      } else if (state.healthScore < 30 || (state.lastLatency !== null && state.lastLatency >= 5000)) {
        connectionStatus = 'unhealthy';
      } else {
        connectionStatus = 'degraded';
      }


      emitWhatsAppEvent('connectionHealth', {
        connectionId,
        healthScore: state.healthScore,
        status: connectionStatus,
        latency: state.lastLatency,
        averageLatency: state.averageLatency,
        lastHealthCheck: state.lastHealthCheck,
        errorCount: state.errorCount,
        reconnectAttempts: state.reconnectAttempts,
        companyId: state.companyId,
      });


      if (state.lastLatency !== null) {
        if (state.lastLatency > 5000) {
          console.warn(`High latency detected for connection ${connectionId}: ${state.lastLatency}ms`);
        } else if (state.lastLatency > 2000) {

        }
      }


      if (healthCheckCounter % 10 === 0) {

      }

    } catch (error) {
      updateHealthScore(connectionId, 'error');
      console.error(`Error in health monitoring for connection ${connectionId}:`, error);
    }
    

    const nextInterval = getAdaptiveHealthCheckInterval(state);
    const timeout = setTimeout(performHealthCheck, nextInterval);
    healthCheckIntervals.set(connectionId, timeout);
  };


  performHealthCheck();
}

/**
 * Stop health monitoring for a connection
 */
function stopHealthMonitoring(connectionId: number): void {
  const interval = healthCheckIntervals.get(connectionId);
  if (interval) {
    clearInterval(interval);
    healthCheckIntervals.delete(connectionId);
  }
}

/**
 * Schedule intelligent reconnection with exponential backoff
 */
async function scheduleReconnection(connectionId: number, connection: any): Promise<void> {
  if (!connection) {

    return;
  }

  const state = getConnectionState(connectionId);

  if (!shouldAttemptReconnection(connectionId)) {

    await updateConnectionStatus(connectionId, 'error');
    return;
  }

  const existingTimeout = reconnectionTimeouts.get(connectionId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  state.reconnectAttempts++;
  state.lastReconnectAttempt = new Date();
  state.status = 'reconnecting';

  const delay = calculateBackoffDelay(state.reconnectAttempts);
  state.nextAttemptIn = delay; // Store for observability (Comment 5)

  await updateConnectionStatus(connectionId, 'reconnecting');

  emitWhatsAppEvent('connectionReconnecting', {
    connectionId,
    attempt: state.reconnectAttempts,
    maxAttempts: RECONNECTION_CONFIG.maxAttempts,
    nextAttemptIn: delay,
    healthScore: state.healthScore,
    companyId: state.companyId,
  });

  const timeout = setTimeout(async () => {
    try {
      const sessionValid = await validateSessionIntegrity(connectionId);

      if (!sessionValid && state.reconnectAttempts > 3) {
        await backupSession(connectionId);
        const sessionDir = path.join(SESSION_DIR, `session-${connectionId}`);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error(`Error deleting corrupted session directory for connection ${connectionId}:`, error);
        }
        console.warn(`Session corrupted after 3 attempts, clearing for QR generation for connection ${connectionId}`);
        await updateConnectionStatus(connectionId, 'qr_code');
        state.reconnectAttempts = 0;

        emitWhatsAppEvent('qrCodeRequired', {
          connectionId,
          message: 'Session corrupted. Please scan QR code manually.',
          companyId: state.companyId,
        });

        await cleanupConnection(connectionId);
        return;
      }

      await backupSession(connectionId);


      await cleanupConnection(connectionId);

      await connectToWhatsApp(connectionId, connection.userId);

      state.reconnectAttempts = 0;
      state.lastConnected = new Date();
      state.nextAttemptIn = null; // Clear on success
      updateHealthScore(connectionId, 'success');



    } catch (error) {


      state.lastError = error instanceof Error ? error.message : 'Unknown error';
      updateHealthScore(connectionId, 'error');

      if (state.reconnectAttempts < RECONNECTION_CONFIG.maxAttempts) {
        await scheduleReconnection(connectionId, connection);
      } else {

        await updateConnectionStatus(connectionId, 'error');

        emitWhatsAppEvent('connectionFailed', {
          connectionId,
          error: 'Max reconnection attempts exceeded',
          totalAttempts: state.reconnectAttempts,
          companyId: state.companyId,
        });
      }
    }
  }, delay);

  reconnectionTimeouts.set(connectionId, timeout);
}

/**
 * Update connection status in database and emit events
 */
async function updateConnectionStatus(connectionId: number, status: string): Promise<void> {
  try {
    await storage.updateChannelConnectionStatus(connectionId, status);

    const state = getConnectionState(connectionId);
    state.status = status as any;

    emitWhatsAppEvent('connectionStatusUpdate', {
      connectionId,
      status,
      companyId: state.companyId,
    });
  } catch (error) {

  }
}

/**
 * Clean up connection resources
 */
async function cleanupConnection(connectionId: number): Promise<void> {
  try {
    stopHealthMonitoring(connectionId);
    

    clearQRIntervals(connectionId);

    const timeout = reconnectionTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      reconnectionTimeouts.delete(connectionId);
    }

    const existingSocket = activeConnections.get(connectionId);
    if (existingSocket) {
      try {

        if (existingSocket.ev) {

          existingSocket.ev.removeAllListeners('connection.update');
          existingSocket.ev.removeAllListeners('creds.update');
          existingSocket.ev.removeAllListeners('messages.upsert');
          existingSocket.ev.removeAllListeners('messages.update');
          existingSocket.ev.removeAllListeners('messages.reaction');
          existingSocket.ev.removeAllListeners('contacts.upsert');
          existingSocket.ev.removeAllListeners('groups.upsert');
          existingSocket.ev.removeAllListeners('group-participants.update');
          existingSocket.ev.removeAllListeners('blocklist.set');
          existingSocket.ev.removeAllListeners('blocklist.update');
          existingSocket.ev.removeAllListeners('call');
          existingSocket.ev.removeAllListeners('presence.update');


          (existingSocket.ev as any).removeAllListeners('chats.set');
          (existingSocket.ev as any).removeAllListeners('contacts.set');
          (existingSocket.ev as any).removeAllListeners('messaging-history.set');
          (existingSocket.ev as any).removeAllListeners('labels.association');
          (existingSocket.ev as any).removeAllListeners('labels.edit');
        }

        existingSocket.ws?.close();
      } catch (error) {
        console.error('Error cleaning up socket listeners:', error);
      }
      activeConnections.delete(connectionId);
    }


    connectionStates.delete(connectionId);


    connectionAttempts.delete(connectionId);

  } catch (error) {
    console.error('Error during connection cleanup:', error);
  }
}



/**
 * Get connection diagnostics for troubleshooting
 */
export function getConnectionDiagnostics(connectionId: number): any {
  const state = getConnectionState(connectionId);
  const socket = activeConnections.get(connectionId);

  return {
    connectionId,
    status: state.status,
    healthScore: state.healthScore,
    reconnectAttempts: state.reconnectAttempts,
    lastConnected: state.lastConnected,
    lastReconnectAttempt: state.lastReconnectAttempt,
    errorCount: state.errorCount,
    lastError: state.lastError,
    lastLatency: state.lastLatency,
    averageLatency: state.averageLatency,
    latencyHistory: state.latencyHistory,
    lastHealthCheck: state.lastHealthCheck,
    rateLimitInfo: state.rateLimitInfo,
    socketConnected: !!socket,
    hasUser: !!socket?.user?.id,
    hasAuthState: !!socket?.authState,
    hasKeys: !!socket?.authState?.keys,
    sessionExists: fs.existsSync(path.join(SESSION_DIR, `session-${connectionId}`))
  };
}


import { eventEmitterPool } from '../../utils/event-emitter-pool';
import { smartWebSocketBroadcaster } from '../../utils/smart-websocket-broadcaster';


const WHATSAPP_NAMESPACE = 'whatsapp';



interface PowerChatMessageTracking {
  timestamp: number;
  messageId: string;
  content: string; // For debugging purposes
  source: 'powerchat';
}

const recentPowerChatMessages = new Map<string, PowerChatMessageTracking>();
const POWERCHAT_MESSAGE_TRACKING_DURATION = 30000; // 30 seconds - sufficient for echo detection


setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  recentPowerChatMessages.forEach((value, key) => {
    if (now - value.timestamp > POWERCHAT_MESSAGE_TRACKING_DURATION) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => recentPowerChatMessages.delete(key));


}, POWERCHAT_MESSAGE_TRACKING_DURATION); // Run cleanup every 30 seconds


const pooledEmitter = eventEmitterPool.getEmitter(WHATSAPP_NAMESPACE);
eventEmitterMonitor.register('whatsapp-service', pooledEmitter);


function emitWhatsAppEvent(eventName: string, data: any): void {
  eventEmitterPool.emit(WHATSAPP_NAMESPACE, eventName, data);
}

function broadcastWhatsAppEvent(eventType: string, data: any, options: {
  companyId?: number;
  userId?: number;
  conversationId?: number;
  priority?: 'high' | 'normal' | 'low';
} = {}): void {
  smartWebSocketBroadcaster.broadcast({
    type: eventType,
    data,
    companyId: options.companyId,
    userId: options.userId,
    conversationId: options.conversationId,
    priority: options.priority || 'normal',
    batchable: options.priority !== 'high'
  });
}

/**
 * Clear QR code intervals and timeouts for a connection
 * Prevents memory leaks and unnecessary emissions
 * Also resets QR cache fields (Comment 1)
 */
function clearQRIntervals(connectionId: number): void {
  const state = getConnectionState(connectionId);
  
  if (state.qrGenerationTimeout) {
    clearTimeout(state.qrGenerationTimeout);
    state.qrGenerationTimeout = null;
  }

  state.lastQr = null;
  state.lastQrAt = null;
}


function broadcastNewConversation(enrichedConversation: any): void {
  try {
    if ((global as any).broadcastConversationUpdate) {
      (global as any).broadcastConversationUpdate(enrichedConversation, 'newConversation');
      return;
    }
  } catch (e) {

  }


  smartWebSocketBroadcaster.broadcast({
    type: 'newConversation',
    data: enrichedConversation,
    companyId: enrichedConversation.companyId,
    priority: 'high',
    batchable: false
  });
}

const baileysPinoLogger = pino({ level: 'warn' });

/**
 * Create proxy agent for WhatsApp based on per-connection proxy server selection
 * @param connectionId The connection ID to load proxy config for
 * @returns Proxy agent instance or undefined if proxy is not selected/enabled
 */
async function createProxyAgent(connectionId: number): Promise<any | undefined> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      console.warn(`Connection not found for ID ${connectionId}`);
      return undefined;
    }

    if (!connection.proxyServerId) {
      return undefined;
    }

    const proxyServer: any = await storage.getWhatsappProxyServer(connection.proxyServerId);
    if (!proxyServer || !proxyServer.enabled) {
      return undefined;
    }

    if (!proxyServer.host || !proxyServer.port) {
      console.warn(`Invalid proxy server configuration for proxy ID ${connection.proxyServerId}`);
      return undefined;
    }

    const type = String(proxyServer.type || '').toLowerCase();
    const portNum = Number(proxyServer.port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
      console.warn(`Invalid proxy port ${portNum} for proxy ID ${connection.proxyServerId}`);
      return undefined;
    }

    const user = encodeURIComponent(proxyServer.username || '');
    const pass = encodeURIComponent(proxyServer.password || '');

    let proxyUrl: string;
    if (proxyServer.username && proxyServer.password) {
      proxyUrl = `${type}://${user}:${pass}@${proxyServer.host}:${portNum}`;
    } else {
      proxyUrl = `${type}://${proxyServer.host}:${portNum}`;
    }

    let agent: any;
    switch (type) {
      case 'socks5':
        agent = new SocksProxyAgent(proxyUrl);

        break;
      case 'http':
      case 'https':
        agent = new HttpsProxyAgent(proxyUrl);

        break;
      default:
        console.warn(`Unsupported proxy type: ${proxyServer.type}`);
        return undefined;
    }

    return agent;
  } catch (error) {
    console.error(`Error creating proxy agent for connection ${connectionId}:`, error);
    return undefined;
  }
}

/**
 * Validate session integrity by checking credentials file structure
 * @param connectionId The connection ID to validate
 * @returns true if session is valid, false otherwise
 */
async function validateSessionIntegrity(connectionId: number): Promise<boolean> {
  try {
    const sessionDir = path.join(SESSION_DIR, `session-${connectionId}`);
    const credsPath = path.join(sessionDir, 'creds.json');

    try {
      await fsPromises.access(credsPath);
    } catch {
      return false;
    }

    const credsData = await fsPromises.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(credsData);

    if (!creds.me || !creds.signedIdentityKey || !creds.signedPreKey) {
      return false;
    }


    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Create a backup of the current session before reconnection attempts
 * Enforces retention limits (Comment 9)
 * @param connectionId The connection ID to backup
 */
async function backupSession(connectionId: number): Promise<void> {
  try {
    const sessionDir = path.join(SESSION_DIR, `session-${connectionId}`);

    if (!fs.existsSync(sessionDir)) {
      return;
    }

    const backupDir = path.join(SESSION_DIR, `session-${connectionId}-backup-${Date.now()}`);
    const backupStartTime = Date.now();
    await fsExtra.copy(sessionDir, backupDir);
    const backupDuration = Date.now() - backupStartTime;
    



    await cleanupOldBackups(connectionId);

  } catch (error) {
    console.error(`Session backup failed for connection ${connectionId}:`, error);
  }
}

/**
 * Clean up old session backups, keeping only the last 5 per connection (Comment 9)
 * Enforces overall size limit (100MB total)
 * @param connectionId The connection ID to clean backups for
 */
async function cleanupOldBackups(connectionId: number): Promise<void> {
  try {
    const files = fs.readdirSync(SESSION_DIR);
    const backupPattern = `session-${connectionId}-backup-`;
    const maxBackupsPerConnection = 5;
    const maxTotalSizeBytes = 100 * 1024 * 1024; // 100MB

    const candidates = files.filter(file => file.startsWith(backupPattern));
    const backups = candidates
      .filter(file => {
        const suffix = file.slice(backupPattern.length);
        const n = Number(suffix);
        return Number.isFinite(n);
      })
      .map(file => ({
        name: file,
        timestamp: Number(file.slice(backupPattern.length)),
        path: path.join(SESSION_DIR, file)
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Newest first


    const oldBackups = backups.slice(maxBackupsPerConnection);
    let deletedCount = 0;
    
    for (const backup of oldBackups) {
      try {
        const stat = fs.lstatSync(backup.path);
        if (stat.isDirectory()) {
          fs.rmSync(backup.path, { recursive: true, force: true });
          deletedCount++;
        }
      } catch (error) {
        console.error(`Failed to delete old backup ${backup.name}:`, error);
      }
    }


    let totalSize = 0;
    const allBackups: Array<{ name: string; path: string; size: number; timestamp: number }> = [];
    
    for (const file of files) {
      if (file.includes('-backup-')) {
        const filePath = path.join(SESSION_DIR, file);
        try {
          const stat = fs.lstatSync(filePath);
          if (stat.isDirectory()) {
            const size = await getDirectorySize(filePath);
            const match = file.match(/backup-(\d+)$/);
            const timestamp = match ? Number(match[1]) : 0;
            allBackups.push({ name: file, path: filePath, size, timestamp });
            totalSize += size;
          }
        } catch (e) {

        }
      }
    }


    if (totalSize > maxTotalSizeBytes) {
      allBackups.sort((a, b) => a.timestamp - b.timestamp); // Oldest first
      for (const backup of allBackups) {
        if (totalSize <= maxTotalSizeBytes) break;
        try {
          fs.rmSync(backup.path, { recursive: true, force: true });
          totalSize -= backup.size;
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete oversized backup ${backup.name}:`, error);
        }
      }
    }

    if (deletedCount > 0) {

    }
  } catch (error) {
    console.error(`Error cleaning up old backups for connection ${connectionId}:`, error);
  }
}

/**
 * Get total size of a directory recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.lstatSync(filePath);
      if (stat.isDirectory()) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += stat.size;
      }
    }
  } catch (e) {

  }
  return totalSize;
}

async function getEnhancedGroupMetadata(sock: WASocket, groupJid: string) {
  try {



    const metadata = await sock.groupMetadata(groupJid);



    const enhancedParticipants = [];

    for (const participant of metadata.participants) {
      const participantAny = participant as any;


      let enhancedParticipant = { ...participant };


      try {

        if ((sock as any).store && (sock as any).store.contacts) {
          const contactInfo = (sock as any).store.contacts[participant.id];
          if (contactInfo) {

            enhancedParticipant = { ...enhancedParticipant, ...contactInfo };
          }
        }


        const onWhatsAppResult = await sock.onWhatsApp(participant.id);
        if (onWhatsAppResult && onWhatsAppResult.length > 0) {
          const contactData = onWhatsAppResult[0] as any;



          if (contactData.jid && !(enhancedParticipant as any).jid) {
            (enhancedParticipant as any).jid = contactData.jid;
          }
          if (contactData.name && !(enhancedParticipant as any).name) {
            (enhancedParticipant as any).name = contactData.name;
          }
        }
      } catch (error) {

      }

      enhancedParticipants.push(enhancedParticipant);
    }

    return {
      ...metadata,
      participants: enhancedParticipants
    };

  } catch (error) {

    throw error;
  }
}

const SESSION_DIR = path.join(process.cwd(), 'whatsapp-sessions');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
fsExtra.ensureDirSync(MEDIA_DIR);

const mediaCache = new Map<string, string>();

/**
 * Calculate realistic typing delay based on message length
 * Simulates human typing speed with randomness
 */
function calculateTypingDelay(message: string): number {
  if (!TYPING_CONFIG.enabled) {
    return 0;
  }

  const words = message.split(' ').length;
  const baseDelay = (words / TYPING_CONFIG.wordsPerMinute) * 60 * 1000;

  const randomFactor = 0.7 + Math.random() * TYPING_CONFIG.randomnessFactor;
  const calculatedDelay = Math.min(Math.max(baseDelay * randomFactor, TYPING_CONFIG.minDelay), TYPING_CONFIG.maxDelay);


  return calculatedDelay;
}

/**
 * Calculate realistic recording delay for voice messages
 * Simulates time needed to record a voice message
 */
function calculateRecordingDelay(): number {
  if (!TYPING_CONFIG.enabled) {
    return 0;
  }

  const delay = TYPING_CONFIG.recordingMinDelay + Math.random() * (TYPING_CONFIG.recordingMaxDelay - TYPING_CONFIG.recordingMinDelay);

  return delay;
}

/**
 * Send typing indicator and wait for realistic typing time
 * @param sock WhatsApp socket connection
 * @param jid Recipient JID (phone number with @s.whatsapp.net or group JID)
 * @param message Message content to calculate typing time
 */
async function simulateTyping(sock: WASocket, jid: string, message: string): Promise<void> {
  if (!TYPING_CONFIG.enabled) {
    return;
  }

  try {


    await sock.sendPresenceUpdate('composing', jid);

    const delay = calculateTypingDelay(message);
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }


  } catch (error) {

  }
}

/**
 * Send recording indicator and wait for realistic recording time
 * @param sock WhatsApp socket connection
 * @param jid Recipient JID (phone number with @s.whatsapp.net or group JID)
 */
async function simulateRecording(sock: WASocket, jid: string): Promise<void> {
  if (!TYPING_CONFIG.enabled) {
    return;
  }

  try {


    await sock.sendPresenceUpdate('recording', jid);

    const delay = calculateRecordingDelay();
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }


  } catch (error) {

  }
}

/**
 * Stop presence indicators (typing/recording)
 * @param sock WhatsApp socket connection
 * @param jid Recipient JID
 */
async function stopPresenceIndicators(sock: WASocket, jid: string): Promise<void> {
  if (!TYPING_CONFIG.enabled) {
    return;
  }

  try {
    await sock.sendPresenceUpdate('paused', jid);

  } catch (error) {

  }
}

/**
 * Split a long message into smaller, natural chunks
 * @param message The message to split
 * @returns Array of message chunks
 */
function splitMessage(message: string): string[] {
  if (!MESSAGE_SPLITTING_CONFIG.enabled) {
    return [message];
  }


  if (MESSAGE_SPLITTING_CONFIG.logicalSplitting.enabled) {
    const logicalChunks = splitByLogicalDelimiter(message);
    if (logicalChunks.length > 1) {
      return logicalChunks;
    }

    if (!MESSAGE_SPLITTING_CONFIG.logicalSplitting.fallbackToCharacters) {
      return [message];
    }
  }


  if (message.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
    return [message];
  }

  let chunks: string[] = [];

  switch (MESSAGE_SPLITTING_CONFIG.splitMethod) {
    case 'sentences':
      chunks = splitBySentences(message);
      break;
    case 'paragraphs':
      chunks = splitByParagraphs(message);
      break;
    case 'characters':
      chunks = splitByCharacters(message);
      break;
    case 'logical':
      chunks = splitByLogicalDelimiter(message);
      break;
    default:
      chunks = [message];
  }

  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
      finalChunks.push(chunk);
    } else {
      finalChunks.push(...splitByCharacters(chunk));
    }
  }



  finalChunks.forEach((chunk, index) => {

  });

  return finalChunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Split message by logical delimiter (e.g., || for Mandarin conversations)
 * @param message The message to split
 * @returns Array of message chunks split by delimiter
 */
function splitByLogicalDelimiter(message: string): string[] {
  const delimiter = MESSAGE_SPLITTING_CONFIG.logicalSplitting.delimiter;

  if (!delimiter || !message.includes(delimiter)) {
    return [message];
  }


  const chunks = message
    .split(delimiter)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);


  if (chunks.length === 0) {
    return [message];
  }



  return chunks;
}

/**
 * Split message by sentences with improved logic
 */
function splitBySentences(message: string): string[] {
  const chunks: string[] = [];
  let remainingText = message.trim();

  while (remainingText.length > 0) {
    if (remainingText.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
      chunks.push(remainingText);
      break;
    }

    const chunk = findOptimalSplit(remainingText, MESSAGE_SPLITTING_CONFIG.maxLength);
    chunks.push(chunk);

    remainingText = remainingText.substring(chunk.length).trim();
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Find the optimal split point for a message chunk
 * Priority: sentence endings > clause boundaries > word boundaries > character limit
 */
function findOptimalSplit(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const minChunkSize = MESSAGE_SPLITTING_CONFIG.minChunkSize;
  const smartBoundaries = MESSAGE_SPLITTING_CONFIG.smartBoundaries;
  const prioritizeSentences = MESSAGE_SPLITTING_CONFIG.prioritizeSentences;

  if (!smartBoundaries) {
    return splitAtWordBoundary(text, maxLength, minChunkSize);
  }

  const boundaryPatterns = [
    ...(prioritizeSentences ? [{ pattern: /[.!?]+\s+/g, minChunkSize: Math.max(minChunkSize, 20), description: 'sentence' }] : []),
    { pattern: /[;:,]\s+/g, minChunkSize: Math.max(minChunkSize, 30), description: 'clause' },
    { pattern: /\n\s*/g, minChunkSize: minChunkSize, description: 'line break' },
    { pattern: /\s+/g, minChunkSize: Math.max(minChunkSize, 10), description: 'word' }
  ];

  for (const { pattern, minChunkSize: patternMinSize, description } of boundaryPatterns) {
    const matches = Array.from(text.matchAll(pattern));

    let bestMatch = null;
    let bestPosition = -1;

    for (const match of matches) {
      const position = match.index! + match[0].length;

      if (position <= maxLength && position >= patternMinSize) {
        bestMatch = match;
        bestPosition = position;
      }
    }

    if (bestMatch && bestPosition > 0) {
      const chunk = text.substring(0, bestPosition).trim();

      if (chunk.length >= patternMinSize) {

        return chunk;
      }
    }
  }

  return splitAtWordBoundary(text, maxLength, minChunkSize);
}

/**
 * Split text at word boundary with minimum chunk size consideration
 */
function splitAtWordBoundary(text: string, maxLength: number, minChunkSize: number): string {
  const words = text.split(/\s+/);
  let chunk = '';

  for (const word of words) {
    const testChunk = chunk + (chunk ? ' ' : '') + word;
    if (testChunk.length <= maxLength) {
      chunk = testChunk;
    } else {
      break;
    }
  }

  if (chunk.length < minChunkSize && words.length > 1) {
    const nextWord = words[chunk.split(' ').length];
    if (nextWord) {
      const forcedChunk = chunk + (chunk ? ' ' : '') + nextWord;
      if (forcedChunk.length <= maxLength * 1.1) {
        chunk = forcedChunk;
      }
    }
  }

  if (!chunk && words.length > 0) {
    chunk = text.substring(0, Math.max(maxLength - 3, minChunkSize)) + '...';

  }

  return chunk || text.substring(0, maxLength);
}

/**
 * Split message by paragraphs with improved logic
 */
function splitByParagraphs(message: string): string[] {
  const paragraphs = message.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    const separator = currentChunk ? '\n\n' : '';
    const testChunk = currentChunk + separator + trimmedParagraph;

    if (testChunk.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      if (trimmedParagraph.length > MESSAGE_SPLITTING_CONFIG.maxLength) {
        const paragraphChunks = splitBySentences(trimmedParagraph);
        chunks.push(...paragraphChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedParagraph;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Split message by character count with smart word boundaries
 */
function splitByCharacters(message: string): string[] {
  const chunks: string[] = [];
  let remainingText = message.trim();

  while (remainingText.length > 0) {
    if (remainingText.length <= MESSAGE_SPLITTING_CONFIG.maxLength) {
      chunks.push(remainingText);
      break;
    }

    let splitPoint = MESSAGE_SPLITTING_CONFIG.maxLength;

    for (let i = MESSAGE_SPLITTING_CONFIG.maxLength - 1; i >= Math.max(20, MESSAGE_SPLITTING_CONFIG.maxLength * 0.7); i--) {
      if (remainingText[i] === ' ') {
        splitPoint = i;
        break;
      }
    }

    let chunk = remainingText.substring(0, splitPoint).trim();

    if (chunk.length < 20 && remainingText.length > MESSAGE_SPLITTING_CONFIG.maxLength) {
      chunk = remainingText.substring(0, MESSAGE_SPLITTING_CONFIG.maxLength).trim();
      splitPoint = chunk.length;
    }

    chunks.push(chunk);
    remainingText = remainingText.substring(splitPoint).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Calculate delay between split messages
 */
function calculateSplitMessageDelay(): number {
  const baseDelay = MESSAGE_SPLITTING_CONFIG.delayBetweenMessages;
  const randomFactor = 1 + (Math.random() - 0.5) * MESSAGE_SPLITTING_CONFIG.randomDelayFactor;
  const delay = Math.max(baseDelay * randomFactor, 1000);


  return delay;
}

/**
 * Configure typing indicator behavior
 * @param config Partial typing configuration to update
 */
export function configureTypingBehavior(config: Partial<TypingConfig>): void {
  Object.assign(TYPING_CONFIG, config);

}

/**
 * Configure message debouncing behavior
 * @param config Partial message debouncing configuration to update
 */
export function configureMessageDebouncing(config: Partial<MessageDebouncingConfig>): void {
  Object.assign(MESSAGE_DEBOUNCING_CONFIG, config);

}

/**
 * Get current message debouncing configuration
 * @returns Current message debouncing configuration
 */
export function getMessageDebouncingConfiguration(): MessageDebouncingConfig {
  return { ...MESSAGE_DEBOUNCING_CONFIG };
}

/**
 * Generate a unique debounce key for a user's message processing
 */
function getDebounceKey(remoteJid: string, connectionId: number): string {
  return `${connectionId}_${remoteJid}`;
}

/**
 * Cancel any existing debounced message processing for a user
 */
function cancelDebouncedMessage(remoteJid: string, connectionId: number): void {
  const debounceKey = getDebounceKey(remoteJid, connectionId);
  const existingDebounce = debouncedMessages.get(debounceKey);

  if (existingDebounce) {
    clearTimeout(existingDebounce.timeoutId);
    debouncedMessages.delete(debounceKey);
  }
}

/**
 * Schedule debounced processing of a user message
 */
function scheduleDebounceProcessing(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any,
  remoteJid: string,
  connectionId: number
): void {
  const debounceKey = getDebounceKey(remoteJid, connectionId);

  cancelDebouncedMessage(remoteJid, connectionId);

  const timeoutId = setTimeout(async () => {
    try {
      debouncedMessages.delete(debounceKey);

      await processMessageThroughFlowExecutor(message, conversation, contact, channelConnection);
    } catch (error) {

      debouncedMessages.delete(debounceKey);
    }
  }, MESSAGE_DEBOUNCING_CONFIG.debounceDelay);

  const debouncedMessage: DebouncedMessage = {
    message,
    conversation,
    contact,
    channelConnection,
    timeoutId,
    createdAt: new Date()
  };

  debouncedMessages.set(debounceKey, debouncedMessage);
}

/**
 * Process a message through the flow executor (extracted for reuse in debouncing)
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any
): Promise<void> {
  try {
    if (!contact || !contact.phone) {
      return;
    }

    const cleanPhone = contact.phone.replace(/[^\d]/g, '');


    if (isWhatsAppGroupChatId(contact.phone)) {
      return;
    }

    if (conversation && (conversation.isGroup === true || conversation.is_group === true)) {
      return;
    }

    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Clean up old debounced messages that may have been orphaned
 */
function cleanupOldDebouncedMessages(): void {
  const now = new Date();
  const maxAge = MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay * 2;

  const keysToDelete: string[] = [];

  debouncedMessages.forEach((debouncedMessage, key) => {
    const age = now.getTime() - debouncedMessage.createdAt.getTime();
    if (age > maxAge) {
      clearTimeout(debouncedMessage.timeoutId);
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => debouncedMessages.delete(key));
}

/**
 * Get debouncing status for debugging
 */
export function getDebouncingStatus(): any {
  return {
    enabled: MESSAGE_DEBOUNCING_CONFIG.enabled,
    debounceDelay: MESSAGE_DEBOUNCING_CONFIG.debounceDelay,
    maxDebounceDelay: MESSAGE_DEBOUNCING_CONFIG.maxDebounceDelay,
    activeDebouncedMessages: debouncedMessages.size,
    debouncedUsers: Array.from(debouncedMessages.keys())
  };
}

/**
 * Configure message splitting behavior
 * @param config Partial message splitting configuration to update
 */
export function configureMessageSplitting(config: Partial<MessageSplittingConfig>): void {
  Object.assign(MESSAGE_SPLITTING_CONFIG, config);

}

/**
 * Get current typing configuration
 * @returns Current typing configuration
 */
export function getTypingConfiguration(): TypingConfig {
  return { ...TYPING_CONFIG };
}

/**
 * Get current message splitting configuration
 * @returns Current message splitting configuration
 */
export function getMessageSplittingConfiguration(): MessageSplittingConfig {
  return { ...MESSAGE_SPLITTING_CONFIG };
}



/**
 * Send a message with automatic splitting if needed
 * @param sock WhatsApp socket connection
 * @param phoneNumber Recipient phone number
 * @param message Message content
 * @param connectionId Connection ID for logging
 * @returns Array of sent message info
 */
async function sendMessageWithSplitting(
  sock: WASocket,
  phoneNumber: string,
  message: string,
  connectionId: number
): Promise<any[]> {
  const chunks = splitMessage(message);
  const sentMessages: any[] = [];

  if (chunks.length === 1) {
    try {
      await simulateTyping(sock, phoneNumber, chunks[0]);
      const sentMessageInfo = await sock.sendMessage(phoneNumber, { text: chunks[0] });
      await stopPresenceIndicators(sock, phoneNumber);
      sentMessages.push(sentMessageInfo);

      return sentMessages;
    } catch (error) {

      throw error;
    }
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;



  const queuedMessage = addToMessageQueue(phoneNumber, connectionId, chunks, messageId, sock);


  try {
    await simulateTyping(sock, phoneNumber, chunks[0]);
    const firstMessageInfo = await sock.sendMessage(phoneNumber, { text: chunks[0] });
    sentMessages.push(firstMessageInfo);
    await stopPresenceIndicators(sock, phoneNumber);


    queuedMessage.currentChunkIndex = 1;

    for (let i = 1; i < chunks.length; i++) {
      const chunkIndex = i;
      const chunk = chunks[i];
      const isLastChunk = i === chunks.length - 1;
      const delay = calculateSplitMessageDelay();

      const actualDelay = delay * i;


      const timeoutId = setTimeout(async () => {
        try {


          const queueKey = getQueueKey(phoneNumber, connectionId);
          const currentQueue = messageQueues.get(queueKey);
          const currentMessage = currentQueue?.find(msg => msg.id === messageId);

          if (!currentMessage) {

            return;
          }

          if (currentMessage.cancelled) {

            return;
          }

          if (!currentMessage.timeoutIds.includes(timeoutId)) {

            return;
          }



          await simulateTyping(sock, phoneNumber, chunk);
          const sentMessageInfo = await sock.sendMessage(phoneNumber, { text: chunk });
          await stopPresenceIndicators(sock, phoneNumber);



          currentMessage.currentChunkIndex = chunkIndex + 1;

          if (isLastChunk) {
            removeFromMessageQueue(phoneNumber, connectionId, messageId);

          }

        } catch (error) {

          removeFromMessageQueue(phoneNumber, connectionId, messageId);
        }
      }, actualDelay);

      queuedMessage.timeoutIds.push(timeoutId);


    }

  } catch (error) {

    removeFromMessageQueue(phoneNumber, connectionId, messageId);
    throw error;
  }




  return sentMessages;
}

/**
 * Helper function to resolve media URL to actual file system path
 * Converts URLs like '/media/flow-media/filename.jpg' to actual file paths
 * For external URLs, returns the URL as-is for download handling
 */
function resolveMediaPath(mediaUrlOrPath: string): string {
  if (mediaUrlOrPath.startsWith('http://') || mediaUrlOrPath.startsWith('https://')) {
    return mediaUrlOrPath;
  }

  if (mediaUrlOrPath.startsWith('/media/flow-media/')) {
    const filename = path.basename(mediaUrlOrPath);
    return path.join(process.cwd(), 'uploads', 'flow-media', filename);
  }

  if (mediaUrlOrPath.startsWith('/media/')) {
    return path.join(process.cwd(), 'public', mediaUrlOrPath.substring(1));
  }

  if (mediaUrlOrPath.startsWith('/uploads/')) {
    return path.join(process.cwd(), mediaUrlOrPath.substring(1));
  }

  if (path.isAbsolute(mediaUrlOrPath) && !mediaUrlOrPath.startsWith('/media/') && !mediaUrlOrPath.startsWith('/uploads/')) {
    return mediaUrlOrPath;
  }

  return path.resolve(mediaUrlOrPath);
}

/**
 * Attempt alternative media download methods when Baileys fails
 * @param message The WhatsApp message containing media
 * @param sock The WhatsApp socket
 * @param messageId The message ID for logging
 * @returns Buffer containing media data or null if failed
 */
async function attemptAlternativeMediaDownload(message: WAMessage, sock: WASocket, messageId: string, connectionId: number): Promise<Buffer | null> {
  try {




    const mediaMessage = message.message?.imageMessage ||
                        message.message?.videoMessage ||
                        message.message?.audioMessage ||
                        message.message?.documentMessage ||
                        message.message?.stickerMessage;

    if (mediaMessage?.url) {


      try {


        const proxyAgent = await createProxyAgent(connectionId);
        const axiosOptions: any = {
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
          headers: {
            'User-Agent': 'WhatsApp/2.2147.10 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        };
        if (proxyAgent) {
          axiosOptions.httpAgent = proxyAgent;
          axiosOptions.httpsAgent = proxyAgent;
        }
        const response = await axios.get(mediaMessage.url, axiosOptions);

        if (response.data && response.data.byteLength > 0) {

          return Buffer.from(response.data);
        }
      } catch (directDownloadError) {

      }
    }



    try {
      const stream = await downloadMediaMessage(
        message,
        'stream',
        {},
        {
          logger: baileysPinoLogger,
          reuploadRequest: sock.updateMediaMessage
        }
      );

      if (stream) {

        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 0) {

              resolve(buffer);
            } else {
              resolve(null);
            }
          });
          stream.on('error', reject);
        });
      }
    } catch (streamError) {

    }


    return null;

  } catch (error) {
    console.error(`Alternative download methods failed for message ${messageId}:`, error);
    return null;
  }
}

/**
 * Download media from a WhatsApp message and save it to disk
 * @param message The WhatsApp message containing media
 * @param sock The WhatsApp socket
 * @returns The URL path to the saved media file or null if failed
 */
export async function downloadAndSaveMedia(message: WAMessage, sock: WASocket, connectionId: number): Promise<string | null> {
  const messageId = message.key?.id || '';
  try {
    if (!message.message) return null;

    const timestamp = message.messageTimestamp || Date.now();
    const mediaKey = crypto.createHash('md5').update(`${messageId}_${timestamp}`).digest('hex');

    if (mediaCache.has(mediaKey)) {
      const cachedUrl = mediaCache.get(mediaKey);
      if (cachedUrl) {


        const filePath = path.join(process.cwd(), 'public', cachedUrl.substring(1));
        if (await fsExtra.pathExists(filePath)) {
          return cachedUrl;
        }


      }
      mediaCache.delete(mediaKey);
    }

    let extension = '';
    let mimeType = '';
    let mediaType = '';

    if (message.message.imageMessage) {
      extension = '.jpg';
      mimeType = message.message.imageMessage.mimetype || 'image/jpeg';
      mediaType = 'image';
    }
    else if (message.message.videoMessage) {
      extension = '.mp4';
      mimeType = message.message.videoMessage.mimetype || 'video/mp4';
      mediaType = 'video';
    }
    else if (message.message.audioMessage) {
      extension = '.mp3';
      mimeType = message.message.audioMessage.mimetype || 'audio/mpeg';
      mediaType = 'audio';
    }
    else if (message.message.stickerMessage) {
      extension = '.webp';
      mimeType = 'image/webp';
      mediaType = 'sticker';
    }
    else if (message.message.documentMessage) {
      const fileName = message.message.documentMessage.fileName || '';
      const fileExt = path.extname(fileName);
      extension = fileExt || '.bin';
      mimeType = message.message.documentMessage.mimetype || 'application/octet-stream';
      mediaType = 'document';
    }
    else {
      return null;
    }

    const mediaTypeDir = path.join(MEDIA_DIR, mediaType);
    await fsExtra.ensureDir(mediaTypeDir);

    const filename = `${mediaKey}${extension}`;
    const filepath = path.join(mediaTypeDir, filename);
    const mediaUrl = `/media/${mediaType}/${filename}`;



    if (await fsExtra.pathExists(filepath)) {

      mediaCache.set(mediaKey, mediaUrl);
      return mediaUrl;
    }



    let buffer: Buffer | null = null;

    try {
      buffer = await downloadMediaMessage(
        message,
        'buffer',
        {}, // options - can be used for additional configuration
        {
          logger: baileysPinoLogger,
          reuploadRequest: sock.updateMediaMessage
        }
      );
    } catch (error: any) {
      console.error(`Baileys download failed for message ${messageId}:`, error.message);


      if (error.message?.includes('empty media key') ||
          error.message?.includes('Cannot derive') ||
          error.message?.includes('media key')) {



        buffer = await attemptAlternativeMediaDownload(message, sock, messageId, connectionId);
      } else {


        buffer = await attemptAlternativeMediaDownload(message, sock, messageId, connectionId);
      }
    }

    if (!buffer || buffer.length === 0) {
      console.error(`Downloaded buffer is empty or null for message ${messageId}`);
      return null;
    }


    await fsExtra.writeFile(filepath, buffer);


    mediaCache.set(mediaKey, mediaUrl);

    return mediaUrl;
  } catch (error) {
    console.error(`Error downloading media for message ${messageId}:`, error);
    return null;
  }
}

/**
 * Connects to WhatsApp using the Baileys library
 * @param connectionId The ID of the channel connection
 * @param userId The user ID who owns this connection
 */
export async function connectToWhatsApp(connectionId: number, userId: number): Promise<void> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, undefined, connectionId);

    if (!hasConnectionAccess) {
      throw new Error('You do not have permission to access this connection');
    }

    if (activeConnections.has(connectionId)) {

      return;
    }


    if (connectionAttempts.get(connectionId)) {

      return;
    }


    connectionAttempts.set(connectionId, true);

    try {

      await cleanupConnection(connectionId);

      const sessionDir = path.join(SESSION_DIR, `session-${connectionId}`);
      if (fs.existsSync(sessionDir)) {
        const sessionValid = await validateSessionIntegrity(connectionId);
        if (!sessionValid) {
          await backupSession(connectionId);
        }
      } else {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);

      const refreshedConnection = await storage.getChannelConnection(connectionId);
      const shouldSyncHistory = refreshedConnection?.historySyncEnabled || false;


      const proxyAgent = await createProxyAgent(connectionId);


      const versionPromise = fetchLatestWaWebVersion();
      const timeoutPromise = new Promise<{ version: undefined; isLatest: false }>((resolve) => {
        setTimeout(() => resolve({ version: undefined, isLatest: false }), 3000);
      });
      
      const { version } = await Promise.race([versionPromise, timeoutPromise]).catch((err) => {
        console.warn('Using cached version for faster QR generation:', err.message);
        return { version: undefined, isLatest: false };
      });

      const sock = makeWASocket({
        ...(version && { version }), // 🔥 Use the dynamically fetched version if available
        ...(proxyAgent && { agent: proxyAgent, fetchAgent: proxyAgent }),
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, baileysPinoLogger),
        },
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        logger: baileysPinoLogger,
        markOnlineOnConnect: true,

        syncFullHistory: false,
        shouldSyncHistoryMessage: (_msg) => {
          return false; // Disable during QR phase
        },
        getMessage: async (_key) => {
          return undefined;
        },

        cachedGroupMetadata: async (jid) => {
          try {

            const conversation = await storage.getConversationByGroupJid(jid);
            if (conversation && conversation.groupMetadata) {

              return conversation.groupMetadata as any;
            }

            return undefined;
          } catch (error) {

            return undefined;
          }
        },

        shouldIgnoreJid: (jid) => {

          return false;
        },

        emitOwnEvents: true,

        keepAliveIntervalMs: 28000, // Reduced from 15000 (Comment 7)

        connectTimeoutMs: 30000,
      });

      activeConnections.set(connectionId, sock);

      const connState = getConnectionState(connectionId);
      connState.socket = sock;
      connState.status = 'connecting';
      

      const connection = await storage.getChannelConnection(connectionId);
      if (connection) {
        connState.companyId = connection.companyId ?? undefined;
      }


      const qrTimeout = setTimeout(() => {
        if (connState.status === 'connecting') {
          console.warn(`QR generation timeout for connection ${connectionId}`);
          connState.status = 'error';
          updateHealthScore(connectionId, 'timeout');
          

          connectionAttempts.delete(connectionId);
          
          emitWhatsAppEvent('connectionStatusUpdate', {
            connectionId,
            status: 'error',
            error: 'QR generation timeout',
            companyId: connState.companyId,
          });
        }
      }, 30000); // 30 second timeout for QR generation


      connState.qrGenerationTimeout = qrTimeout;

      sock.ev.on('connection.update', async (update) => {
        try {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {

            const now = new Date();
            const shouldEmit = !connState.lastQr || 
                             connState.lastQr !== qr || 
                             !connState.lastQrAt || 
                             (now.getTime() - connState.lastQrAt.getTime()) > 12000; // Only re-emit if >12s since last
            
            if (shouldEmit) {

              clearQRIntervals(connectionId);
              if (connState.qrGenerationTimeout) {
                clearTimeout(connState.qrGenerationTimeout);
                connState.qrGenerationTimeout = null;
              }
              
              connState.status = 'qr_code';
              await updateConnectionStatus(connectionId, 'qr_code');


              connState.lastQr = qr;
              connState.lastQrAt = now;


              emitWhatsAppEvent('qrCode', {
                connectionId,
                qrCode: qr,
                companyId: connState.companyId,
              });
            }
          }

          if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;


          clearQRIntervals(connectionId);
          if (connState.qrGenerationTimeout) {
            clearTimeout(connState.qrGenerationTimeout);
            connState.qrGenerationTimeout = null;
          }
          

          connectionAttempts.delete(connectionId);

          if (shouldReconnect) {
            connState.status = 'reconnecting';
            updateHealthScore(connectionId, 'error');

            const connection = await storage.getChannelConnection(connectionId);
            if (connection) {
              await scheduleReconnection(connectionId, connection);
            }
          } else {
            await updateConnectionStatus(connectionId, 'logged_out');

            await cleanupConnection(connectionId);

            try {
              const sessionDir = path.join(SESSION_DIR, `session-${connectionId}`);
              if (fs.existsSync(sessionDir)) {
                fs.rmSync(sessionDir, { recursive: true, force: true });
              }
            } catch (error) {
              console.error('Error removing session directory:', error);
            }
          }
        } else if (connection === 'open') {

          clearQRIntervals(connectionId);
          

          if (connState.qrGenerationTimeout) {
            clearTimeout(connState.qrGenerationTimeout);
            connState.qrGenerationTimeout = null;
          }
          

          connectionAttempts.delete(connectionId);
          
          connState.status = 'connected';
          connState.lastConnected = new Date();
          connState.reconnectAttempts = 0;
          connState.lastError = null;
          updateHealthScore(connectionId, 'success');

          await updateConnectionStatus(connectionId, 'active');

          startHealthMonitoring(connectionId);

          emitWhatsAppEvent('connectionStatusUpdate', {
            connectionId,
            status: 'connected',
            companyId: connState.companyId,
          });
        }
        } catch (error) {
          console.error('Error in connection.update handler:', error);
        }
      });

      sock.ev.on('creds.update', (_creds) => {
        saveCreds();

      });



      (sock.ev as any).on('chats.set', async ({ chats }: { chats: any[] }) => {


        try {
          for (const chat of chats) {
            try {
              if (chat.id && !chat.id.includes('status@broadcast')) {
                if (chat.id.includes('@broadcast') || chat.id === 'status@broadcast') {
                  continue;
                }

                const phoneNumber = chat.id.split('@')[0];
                let contact = await storage.getContactByIdentifier(phoneNumber, 'whatsapp');

                if (!contact) {
                  const user = await storage.getUser(userId);
                  const companyId = user?.companyId;

                  const contactData: InsertContact = {
                    companyId: companyId,
                    name: chat.name || phoneNumber,
                    phone: phoneNumber,
                    email: null,
                    avatarUrl: null,
                    identifier: phoneNumber,
                    identifierType: 'whatsapp',
                    source: 'whatsapp',
                    notes: null,
                    createdBy: userId
                  };

                  contact = await storage.getOrCreateContact(contactData);

                }

                const existingConversation = await storage.getConversationByContactAndChannel(
                  contact.id,
                  connectionId
                );

                if (!existingConversation) {
                  const user = await storage.getUser(userId);
                  const companyId = user?.companyId;

                  const connection = await storage.getChannelConnection(connectionId);
                  const channelType = connection?.channelType || 'whatsapp_unofficial';

                  const conversationData: InsertConversation = {
                    companyId: companyId,
                    contactId: contact.id,
                    channelId: connectionId,
                    channelType: channelType,
                    status: 'active',
                    lastMessageAt: chat.conversationTimestamp ? new Date(typeof chat.conversationTimestamp === 'object' ? chat.conversationTimestamp.toNumber() : Number(chat.conversationTimestamp)) : new Date()
                  };

                  const conversation = await storage.createConversation(conversationData);



                  broadcastWhatsAppEvent('newConversation', {
                    ...conversation,
                    contact
                  }, {
                    companyId: contact?.companyId || undefined,
                    priority: 'normal'
                  });
                }
              }
            } catch (error) {
              console.error('Error processing chat:', error);
            }
          }


          const connState = getConnectionState(connectionId);
          emitWhatsAppEvent('whatsappHistorySyncComplete', {
            connectionId,
            contactsCount: chats.length,
            messagesCount: 0,
            companyId: connState.companyId,
          });
        } catch (error) {
          console.error('Error processing chats:', error);
        }
      });

      (sock.ev as any).on('messages.upsert', async ({ messages, type }: { messages: any[], type: string }) => {

        for (const waMsg of messages) {
          try {
            if (waMsg.key && waMsg.key.remoteJid) {
              if (waMsg.key.remoteJid.includes('@broadcast') || waMsg.key.remoteJid === 'status@broadcast') {

                continue;
              }
              await handleIncomingMessage(waMsg, connectionId, userId);
            }
          } catch (error: any) {
            if (error.message && error.message.includes('No session found to decrypt message')) {
              const remoteJid = waMsg.key?.remoteJid;
              const participant = waMsg.key?.participant;

              if (remoteJid === 'status@broadcast' || remoteJid?.includes('@broadcast')) {

                continue;
              }
            }

            console.error('Error handling message:', {
              error: error.message,
              remoteJid: waMsg.key?.remoteJid,
              participant: waMsg.key?.participant,
              messageId: waMsg.key?.id
            });
          }
        }
      });

      (sock.ev as any).on('messages.update', async (updates: any[]) => {


      });

      (sock.ev as any).on('messages.reaction', async (reactions: any[]) => {
        try {


          for (const reactionEvent of reactions) {
            try {
              await handleIncomingReaction(reactionEvent, connectionId, userId);
            } catch (error: any) {
              console.error('Error handling reaction:', {
                error: error.message,
                reactionEvent,
                connectionId,
                userId
              });
            }
          }
        } catch (error: any) {
          console.error('Error processing reactions batch:', error);
        }
      });



      (sock.ev as any).on('messaging-history.set', async (data: any) => {
        try {
          const { chats: newChats, contacts: newContacts, messages: newMessages, syncType } = data;

          if (!shouldSyncHistory) {
            return;
          }


          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

          const filteredMessages = newMessages?.filter((message: any) => {
            if (!message.messageTimestamp) return false;

            const messageTimestamp = typeof message.messageTimestamp === 'object'
              ? message.messageTimestamp.toNumber()
              : Number(message.messageTimestamp);

            return messageTimestamp >= sevenDaysAgoTimestamp;
          }) || [];

          const originalMessageCount = newMessages?.length || 0;
          const filteredMessageCount = filteredMessages.length;
          const filteredOutCount = originalMessageCount - filteredMessageCount;

          if (filteredOutCount > 0) {

          }

          const totalItems = (newChats?.length || 0) + (filteredMessages?.length || 0);
          await storage.updateChannelConnection(connectionId, {
            historySyncStatus: 'syncing',
            historySyncProgress: 0,
            historySyncTotal: totalItems
          });

          const user = await storage.getUser(userId);
          emitWhatsAppEvent('historySyncProgress', {
            connectionId,
            companyId: user?.companyId,
            progress: 0,
            total: totalItems,
            status: 'syncing'
          });

          const batchId = `${connectionId}-${Date.now()}-${syncType}`;

          const syncUser = await storage.getUser(userId);
          if (syncUser?.companyId) {
            await storage.createHistorySyncBatch({
              connectionId,
              companyId: syncUser.companyId,
              batchId,
              syncType: syncType === 'initial' ? 'initial' : 'manual',
              totalChats: newChats?.length || 0,
              totalMessages: filteredMessages?.length || 0,
              totalContacts: newContacts?.length || 0
            });
          }




          await storage.updateChannelConnection(connectionId, {
            historySyncStatus: 'completed',
            historySyncProgress: (newChats?.length || 0) + (filteredMessages?.length || 0),
            lastHistorySyncAt: new Date()
          });

          emitWhatsAppEvent('historySyncComplete', {
            connectionId,
            companyId: syncUser?.companyId,
            batchId,
            totalChats: newChats?.length || 0,
            totalMessages: filteredMessages?.length || 0,
            totalContacts: newContacts?.length || 0
          });


        } catch (error) {
          console.error('Error processing history sync:', error);

          await storage.updateChannelConnection(connectionId, {
            historySyncStatus: 'failed',
            historySyncError: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      await updateConnectionStatus(connectionId, 'connecting');

    } catch (error: any) {
      console.error('Error connecting to WhatsApp:', error);
      await storage.updateChannelConnectionStatus(connectionId, 'error');

      const connState = getConnectionState(connectionId);
      emitWhatsAppEvent('connectionError', {
        connectionId,
        error: error.message || 'Unknown error connecting to WhatsApp',
        companyId: connState.companyId,
      });

      throw error;
    } finally {

      connectionAttempts.delete(connectionId);
    }
  } catch (error) {


    console.error(`Error in connectToWhatsApp setup for connection ${connectionId}:`, error);
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    const connState = getConnectionState(connectionId);
    emitWhatsAppEvent('connectionError', {
      connectionId,
      error: (error as any).message || 'Unknown error during connection setup',
      companyId: connState.companyId,
    });

    connectionAttempts.delete(connectionId);
    throw error;
  }
}

/**
 * Extract externalAdReply from WhatsApp message structure
 * Checks extendedTextMessage.contextInfo, viewOnceMessage, and quoted context
 */
function extractExternalAdReply(waMsg: WAMessage): any | null {
  try {
    const msgAny: any = waMsg.message as any;
    if (!msgAny) return null;


    if (msgAny.extendedTextMessage?.contextInfo?.externalAdReply) {
      return msgAny.extendedTextMessage.contextInfo.externalAdReply;
    }


    if (msgAny.viewOnceMessage?.message?.extendedTextMessage?.contextInfo?.externalAdReply) {
      return msgAny.viewOnceMessage.message.extendedTextMessage.contextInfo.externalAdReply;
    }


    if (msgAny.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.contextInfo?.externalAdReply) {
      return msgAny.extendedTextMessage.contextInfo.quotedMessage.extendedTextMessage.contextInfo.externalAdReply;
    }


    if (msgAny.extendedTextMessage?.contextInfo?.quotedMessage) {
      const quotedMsg = msgAny.extendedTextMessage.contextInfo.quotedMessage;

      for (const key of Object.keys(quotedMsg)) {
        if (quotedMsg[key]?.contextInfo?.externalAdReply) {
          return quotedMsg[key].contextInfo.externalAdReply;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting externalAdReply:', error);
    return null;
  }
}

/**
 * Handle incoming WhatsApp messages
 */
async function handleIncomingMessage(
  waMsg: WAMessage,
  connectionId: number,
  userId: number,
  isHistorySync: boolean = false,
  historySyncBatchId?: string
): Promise<void> {
  const messageId = waMsg.key?.id || 'unknown';
  const rawRemoteJid = waMsg.key?.remoteJid || '';
  
  try {
    if (!waMsg.key || !waMsg.key.remoteJid || !waMsg.key.id) {
      return;
    }

    if (waMsg.key.remoteJid.includes('@broadcast') || waMsg.key.remoteJid === 'status@broadcast') {
      return;
    }

    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return;
    }


    const rawRemoteJidBeforeNormalization = waMsg.key.remoteJid;
    const remoteJid = normalizeWhatsAppJid(waMsg.key.remoteJid);
    const companyId = user.companyId;

    const isFromMe = waMsg.key.fromMe === true;



    const remoteJidAlt = (waMsg.key as any).remoteJidAlt || null;
    const participantAlt = (waMsg.key as any).participantAlt || null;
   
    if (isFromMe && !isHistorySync) {


      const trackingKey = `${remoteJid}:${waMsg.key.id}`;
      const recentPowerChatMessage = recentPowerChatMessages.get(trackingKey);

      if (recentPowerChatMessage) {
        const messageAge = Date.now() - recentPowerChatMessage.timestamp;
        if (messageAge < POWERCHAT_MESSAGE_TRACKING_DURATION) {
          return;
        } else {

          recentPowerChatMessages.delete(trackingKey);
        }
      }
    }




    if (!isFromMe && !isHistorySync) {
      const queueKey = getQueueKey(remoteJid, connectionId);
      const existingQueue = messageQueues.get(queueKey);
      if (existingQueue && existingQueue.length > 0) {
        const totalPendingChunks = existingQueue.reduce((total, msg) => {
          return total + (msg.chunks.length - msg.currentChunkIndex);
        }, 0);

        existingQueue.forEach(msg => {
          const remainingChunks = msg.chunks.length - msg.currentChunkIndex;

        });

        cancelQueuedMessages(remoteJid, connectionId);

      } else {

      }
    } else {

    }


    const isGroupChat = remoteJid.endsWith('@g.us');
    
    if (isGroupChat) {
      return;
    }

    let messageType = 'text';
    let messageContent = '';
    let mediaUrl: string | null = null;



    let actualPhoneNumber: string | null = null;
    let resolvedRemoteJid = remoteJid;
    
    if (rawRemoteJidBeforeNormalization.endsWith('@lid')) {
      

      if (remoteJidAlt && remoteJidAlt.includes('@s.whatsapp.net')) {
        resolvedRemoteJid = remoteJidAlt;
        actualPhoneNumber = remoteJidAlt.split('@')[0];
      }
      

      if (!actualPhoneNumber) {
        try {
          const sock = activeConnections.get(connectionId);
          if (sock) {


            if ((sock as any).store && (sock as any).store.contacts) {
              const contactInfo = (sock as any).store.contacts[rawRemoteJidBeforeNormalization];
              if (contactInfo) {
                

                if (contactInfo.phoneNumber) {
                  const phoneJid = `${contactInfo.phoneNumber}@s.whatsapp.net`;
                  resolvedRemoteJid = phoneJid;
                  actualPhoneNumber = contactInfo.phoneNumber.replace(/[^\d]/g, '');
                } else if (contactInfo.jid && contactInfo.jid.includes('@s.whatsapp.net')) {
                  resolvedRemoteJid = contactInfo.jid;
                  actualPhoneNumber = contactInfo.jid.split('@')[0];
                }
              }
            }
            

            if (!actualPhoneNumber) {
              try {
                const normalizedJid = jidNormalizedUser(rawRemoteJidBeforeNormalization);
                if (normalizedJid && normalizedJid.includes('@s.whatsapp.net') && normalizedJid !== rawRemoteJidBeforeNormalization) {
                  resolvedRemoteJid = normalizedJid;
                  actualPhoneNumber = normalizedJid.split('@')[0];
                 
                }
              } catch (normalizeError) {
              }
            }
          } else {
          }
        } catch (error) {
        }
      }
      


      if (!actualPhoneNumber) {
        try {
          const lidIdentifier = rawRemoteJidBeforeNormalization.split('@')[0];
          

          let existingContact = await storage.getContactByIdentifier(lidIdentifier, 'whatsapp');
          

          if (!existingContact) {

            const conversations = await storage.getConversationsByChannel(connectionId);
            for (const conv of conversations) {
              if (conv.contactId) {
                const contact = await storage.getContact(conv.contactId);
                if (contact && contact.phone && 
                    !contact.phone.startsWith('LID-') && 
                    contact.phone.replace(/[^\d]/g, '').length >= 10) {

                  const recentMessages = await storage.getMessagesByConversationPaginated(conv.id, 10, 0);
                  for (const msg of recentMessages) {
                    if (msg.metadata) {
                      const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
                      if (metadata.originalRemoteJid === rawRemoteJidBeforeNormalization ||
                          metadata.remoteJid === rawRemoteJidBeforeNormalization) {
                        existingContact = contact;
                        break;
                      }
                    }
                  }
                  if (existingContact) break;
                }
              }
            }
          }
          

          if (existingContact && existingContact.phone && 
              !existingContact.phone.startsWith('LID-') && 
              existingContact.phone.replace(/[^\d]/g, '').length >= 10) {
            actualPhoneNumber = existingContact.phone.replace(/[^\d]/g, '');
            resolvedRemoteJid = `${actualPhoneNumber}@s.whatsapp.net`;
          }
        } catch (dbError) {
        }
      }
      

      if (!actualPhoneNumber) {
        resolvedRemoteJid = rawRemoteJidBeforeNormalization;
      }
    }


    const phoneNumber = actualPhoneNumber || extractPhoneNumberFromJid(resolvedRemoteJid);
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    

    if (isWhatsAppGroupChatId(cleanPhoneNumber)) {
      return;
    }

    let contactDisplayName: string | null = null;
    if (waMsg.pushName && waMsg.pushName.trim()) {
      contactDisplayName = waMsg.pushName.trim();
    } else if ((waMsg as any).notify && (waMsg as any).notify.trim()) {
      contactDisplayName = (waMsg as any).notify.trim();
    }



    if (isFromMe) {
      contactDisplayName = null;
    }

    if (waMsg.message) {
      if (waMsg.message.conversation) {
        messageContent = waMsg.message.conversation;
      }
      else if (waMsg.message.extendedTextMessage) {
        messageContent = waMsg.message.extendedTextMessage.text || '';
      }
      else if (waMsg.message.imageMessage) {
        messageType = 'image';
        messageContent = waMsg.message.imageMessage.caption || 'Image message';

        if (!isHistorySync) {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            mediaUrl = await downloadAndSaveMedia(waMsg, sock, connectionId);
            if (mediaUrl) {

            } else {
              console.error(`Failed to download image for message ${waMsg.key?.id || 'unknown'} - media will be available for on-demand download`);

            }
          }
        }
      }
      else if (waMsg.message.videoMessage) {
        messageType = 'video';
        messageContent = waMsg.message.videoMessage.caption || 'Video message';

        if (!isHistorySync) {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            mediaUrl = await downloadAndSaveMedia(waMsg, sock, connectionId);
            if (mediaUrl) {

            } else {
              console.error(`Failed to download video for message ${waMsg.key?.id || 'unknown'} - media will be available for on-demand download`);

            }
          }
        }
      }
      else if (waMsg.message.audioMessage) {
        messageType = 'audio';
        messageContent = 'Audio message';

        if (!isHistorySync) {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            mediaUrl = await downloadAndSaveMedia(waMsg, sock, connectionId);
            if (mediaUrl) {

            } else {
              console.error(`Failed to download audio for message ${waMsg.key?.id || 'unknown'} - media will be available for on-demand download`);

            }
          }
        }
      }
      else if (waMsg.message.documentMessage) {
        messageType = 'document';
        messageContent = waMsg.message.documentMessage.fileName || 'Document message';

        if (!isHistorySync) {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            mediaUrl = await downloadAndSaveMedia(waMsg, sock, connectionId);
            if (mediaUrl) {

            } else {
              console.error(`Failed to download document for message ${waMsg.key?.id || 'unknown'} - media will be available for on-demand download`);

            }
          }
        }
      }
      else if (waMsg.message.contactMessage) {
        messageType = 'contact';
        messageContent = 'Contact shared';
      }
      else if (waMsg.message.locationMessage) {
        messageType = 'location';
        messageContent = 'Location shared';
      }
      else if (waMsg.message.stickerMessage) {
        messageType = 'sticker';
        messageContent = 'Sticker message';

        if (!isHistorySync) {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            mediaUrl = await downloadAndSaveMedia(waMsg, sock, connectionId);
            if (mediaUrl) {

            } else {
              console.error(`Failed to download sticker for message ${waMsg.key?.id || 'unknown'} - media will be available for on-demand download`);

            }
          }
        }
      }
      else if (waMsg.message.reactionMessage) {
        messageType = 'reaction';
        const reaction = waMsg.message.reactionMessage;
        const emoji = reaction.text || '👍';
        const targetMessageId = reaction.key?.id || 'unknown';


        messageContent = `${emoji}`;


        const reactionMetadata = {
          targetMessageId: targetMessageId,
          targetMessageKey: reaction.key,
          emoji: emoji,
          reactionType: 'message_reaction'
        };


        (waMsg as any).reactionMetadata = reactionMetadata;

        
      }
      else if (waMsg.message.pollCreationMessage || waMsg.message.pollCreationMessageV3) {
        messageType = 'poll';
        const pollCreation = waMsg.message.pollCreationMessage || waMsg.message.pollCreationMessageV3;

        if (pollCreation) {
          messageContent = pollCreation.name || 'Poll';


          if (waMsg.key?.id) {
            const pollId = waMsg.key.id;
            const pollOptions = pollCreation.options?.map((opt: any) => opt.optionName || opt.name || opt.text || opt) || [];

            pollContextCache.set(pollId, {
              pollName: pollCreation.name || 'Poll',
              pollOptions: pollOptions,
              selectableCount: pollCreation.selectableOptionsCount || 1,
              createdAt: Date.now(),
              pollCreationMessage: pollCreation,
              pollMsgId: pollId,
              pollCreatorJid: waMsg.key.remoteJid || '',
              pollEncKey: waMsg.message.messageContextInfo?.messageSecret
            });
          }
        } else {
          messageContent = 'Poll';
        }
      }
      else if (waMsg.message.pollUpdateMessage) {
        messageType = 'poll_vote';
        const pollUpdate = waMsg.message.pollUpdateMessage;




        try {
          const sock = activeConnections.get(connectionId);
          if (sock && pollUpdate.pollCreationMessageKey && pollUpdate.vote) {

            const pollId = pollUpdate.pollCreationMessageKey.id || '';


            const pollContext = pollContextCache.get(pollId);

            if (pollContext) {


              try {

                if (pollContext.pollEncKey) {



                  const pollEncKey = pollContext.pollEncKey;
                  const pollMsgId = pollUpdate.pollCreationMessageKey.id || '';




                  const meId = sock?.authState?.creds?.me?.id || '';


                  const pollCreatorJid = pollUpdate.pollCreationMessageKey.fromMe
                    ? jidNormalizedUser(meId)  // Poll created by authenticated user
                    : jidNormalizedUser(pollUpdate.pollCreationMessageKey.participant || pollUpdate.pollCreationMessageKey.remoteJid || '');


                  const voterJid = waMsg.key.fromMe
                    ? jidNormalizedUser(meId)  // We voted on our own poll
                    : jidNormalizedUser(waMsg.key.participant || waMsg.key.remoteJid || '');






                  let encKeyBuffer;
                  if (typeof pollEncKey === 'string') {
                    encKeyBuffer = new Uint8Array(Buffer.from(pollEncKey, 'base64'));

                  } else if (pollEncKey && typeof pollEncKey === 'object') {

                    encKeyBuffer = new Uint8Array(Object.values(pollEncKey) as number[]);

                  } else {
                    encKeyBuffer = pollEncKey;

                  }



                  try {
                    const decryptedVote = decryptPollVote(pollUpdate.vote, {
                      pollEncKey: encKeyBuffer,
                      pollCreatorJid,
                      pollMsgId,
                      voterJid
                    });




                  if (decryptedVote && decryptedVote.selectedOptions && decryptedVote.selectedOptions.length > 0) {

                    let selectedIndex = 0;


                    const selectedOptionHash = decryptedVote.selectedOptions[0];
                    const selectedHashHex = Buffer.isBuffer(selectedOptionHash) ? selectedOptionHash.toString('hex') : selectedOptionHash;


                    let foundMatch = false;
                    for (let i = 0; i < pollContext.pollOptions.length; i++) {
                      const optionText = pollContext.pollOptions[i];
                      const optionHash = crypto.createHash('sha256').update(optionText).digest('hex');

                      if (optionHash === selectedHashHex) {
                        selectedIndex = i;
                        foundMatch = true;
                        break;
                      }
                    }

                    if (!foundMatch) {

                      for (let i = 0; i < pollContext.pollOptions.length; i++) {
                        const optionText = pollContext.pollOptions[i];


                        const utf8Hash = crypto.createHash('sha256').update(optionText, 'utf8').digest('hex');
                        const bufferHash = crypto.createHash('sha256').update(Buffer.from(optionText, 'utf8')).digest('hex');
                        const base64Hash = crypto.createHash('sha256').update(Buffer.from(optionText).toString('base64')).digest('hex');

                        if (utf8Hash === selectedHashHex || bufferHash === selectedHashHex || base64Hash === selectedHashHex) {
                          selectedIndex = i;
                          foundMatch = true;
                          break;
                        }
                      }

                      if (!foundMatch) {
                        selectedIndex = 0;
                      }
                    }

                    messageContent = `poll_vote_selected:${selectedIndex}`;
                    (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex = selectedIndex;
                  } else {
                    messageContent = 'poll_vote_received';
                  }
                  } catch (decryptError) {

                    const encPayload = pollUpdate.vote?.encPayload;
                    const senderTimestamp = pollUpdate.senderTimestampMs;

                    if (encPayload && pollContext.pollOptions.length > 0) {

                      let timestampValue = 0;
                      if (senderTimestamp) {
                        if (typeof senderTimestamp === 'object' && senderTimestamp.low !== undefined) {
                          timestampValue = Math.abs(senderTimestamp.low);
                        } else {
                          timestampValue = Number(senderTimestamp);
                        }
                      }
                      const timestampIndex = Math.abs(timestampValue) % pollContext.pollOptions.length;

                      messageContent = `poll_vote_selected:${timestampIndex}`;
                      (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex = timestampIndex;
                    } else {
                      messageContent = 'poll_vote_received';
                    }
                  }
                } else {
                  messageContent = 'poll_vote_received';
                }
              } catch (baileysFallbackError) {
                messageContent = 'poll_vote_received';
              }
            } else {


              try {
                const { storage } = await import('../../storage');


                const channelConnection = await storage.getChannelConnection(connectionId);
                const companyId = channelConnection?.companyId;


                const pollMessage = await storage.getMessageByExternalId(
                  pollUpdate.pollCreationMessageKey.id || '',
                  companyId || undefined
                );

                if (pollMessage) {
                  const metadata = typeof pollMessage.metadata === 'string'
                    ? JSON.parse(pollMessage.metadata)
                    : pollMessage.metadata;

                  if (metadata?.pollContext) {


                    const dbPollContext = {
                      pollName: metadata.pollContext.pollName,
                      pollOptions: metadata.pollContext.pollOptions,
                      selectableCount: metadata.pollContext.selectableCount,
                      createdAt: Date.now(),
                      pollCreationMessage: metadata.whatsappMessage?.message?.pollCreationMessage
                    };

                    if (dbPollContext.pollCreationMessage) {
                      const decryptedVote = decryptPollVote(pollUpdate.vote, dbPollContext.pollCreationMessage);

                      if (decryptedVote && decryptedVote.selectedOptions && decryptedVote.selectedOptions.length > 0) {

                        let selectedIndex = 0;
                        const selectedOptionHash = decryptedVote.selectedOptions[0];
                        const selectedHashHex = Buffer.isBuffer(selectedOptionHash) ? selectedOptionHash.toString('hex') : selectedOptionHash;

                        let foundMatch = false;
                        for (let i = 0; i < dbPollContext.pollOptions.length; i++) {
                          const optionText = dbPollContext.pollOptions[i];
                          const optionHash = crypto.createHash('sha256').update(optionText).digest('hex');

                          if (optionHash === selectedHashHex) {
                            selectedIndex = i;
                            foundMatch = true;

                            break;
                          }
                        }

                        if (!foundMatch) {

                          selectedIndex = 0;
                        }



                        messageContent = `poll_vote_selected:${selectedIndex}`;
                        (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex = selectedIndex;
                      } else {
                        throw new Error('No selected options found in decrypted vote from database');
                      }
                    } else {
                      throw new Error('No poll creation message found in database context');
                    }
                  } else {
                    throw new Error('No poll context found in database message metadata');
                  }
                } else {
                  throw new Error('No poll message found in database');
                }
              } catch (dbError) {
                console.error('Database poll context retrieval failed:', dbError);


                try {
                  const encPayload = pollUpdate.vote?.encPayload;
                  if (encPayload) {

                    let payloadStr = '';
                    if (typeof encPayload === 'string') {
                      payloadStr = encPayload;
                    } else if (Buffer.isBuffer(encPayload)) {
                      payloadStr = encPayload.toString('base64');
                    } else if (typeof encPayload === 'object') {

                      const bufferArray = Object.values(encPayload) as number[];
                      payloadStr = Buffer.from(bufferArray).toString('base64');
                    }



                    const hash = payloadStr.slice(-8); // Take last 8 characters
                    let hashValue = 0;
                    for (let i = 0; i < hash.length; i++) {
                      hashValue += hash.charCodeAt(i);
                    }



                    const assumedOptionCount = 3; // This should ideally come from the poll context
                    const selectedIndex = hashValue % assumedOptionCount;

                    messageContent = `poll_vote_selected:${selectedIndex}`;


                    (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex = selectedIndex;
                  } else {

                    messageContent = 'poll_vote_received';
                  }
                } catch (fallbackError) {
                  console.error('Error in final fallback poll vote extraction:', fallbackError);
                  messageContent = 'poll_vote_received';
                }
              }
            }
          } else {
            messageContent = 'poll_vote_received';
          }
        } catch (error) {
          console.error('Error processing poll vote:', error);
          messageContent = 'poll_vote_received';
        }
      }
      else {
        messageType = 'unknown';
        messageContent = 'Unsupported message type';

      }
    } else {

      return;
    }



    let contact = null;
    let conversation = null;



    contact = await storage.getContactByIdentifier(cleanPhoneNumber, 'whatsapp');

      if (!contact) {
        let name = contactDisplayName || cleanPhoneNumber;
        let profilePictureUrl = null;

        try {
          const sock = activeConnections.get(connectionId);
          if (sock) {
            profilePictureUrl = await fetchProfilePicture(connectionId, cleanPhoneNumber);
          }
        } catch (e) {

        }

        const connection = await storage.getChannelConnection(connectionId);
        const identifierType = getIdentifierTypeFromConnection(connection?.channelType);


        const contactData: InsertContact = {
          companyId: companyId,
          name,
          phone: `+${cleanPhoneNumber}`, // Store with + prefix for consistency - this is the ACTUAL sender's phone
          email: null,
          avatarUrl: profilePictureUrl,
          identifier: cleanPhoneNumber, // Store clean phone number as identifier - this is the ACTUAL sender's phone
          identifierType: identifierType,
          source: 'whatsapp',
          notes: null,
          createdBy: userId,
          ...(isHistorySync && {
            isHistorySync: true,
            historySyncBatchId: historySyncBatchId
          })
        };

        contact = await storage.getOrCreateContact(contactData);
        
       

      } else if (contactDisplayName && contact.name === contact.phone) {

        try {
          contact = await storage.updateContact(contact.id, {
            name: contactDisplayName
          });

        } catch (updateError) {
          console.error('Error updating contact name:', updateError);

        }
      }

      conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        connectionId
      );

      if (!conversation) {
        const connection = await storage.getChannelConnection(connectionId);
        const channelType = connection?.channelType || 'whatsapp_unofficial';

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: channelType,
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: false,
          ...(isHistorySync && {
            isHistorySync: true,
            historySyncBatchId: historySyncBatchId
          })
        };

        conversation = await storage.createConversation(conversationData);
        

        broadcastNewConversation({
          ...conversation,
          contact
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
        
       
      }

    if (conversation) {
      conversation = await storage.updateConversation(conversation.id, {
        lastMessageAt: new Date()
      });
    }

    const direction = isFromMe ? 'outbound' : 'inbound';
    const senderType = isFromMe ? 'user' : 'contact';
    const senderId = isFromMe ? userId : (contact?.id || null);

    const messageTimestamp = waMsg.messageTimestamp
      ? new Date((typeof waMsg.messageTimestamp === 'object'
        ? waMsg.messageTimestamp.toNumber()
        : Number(waMsg.messageTimestamp)) * 1000)
      : new Date();


    let quotedStanzaId: string | null = null;
    try {
      const msgAny: any = waMsg.message as any;
      if (msgAny && typeof msgAny === 'object') {
        for (const k of Object.keys(msgAny)) {
          const node = msgAny[k];
          if (node && node.contextInfo && node.contextInfo.stanzaId) {
            quotedStanzaId = node.contextInfo.stanzaId as string;
            break;
          }
        }
      }
    } catch (e) {

    }


    let externalAdReply: any | null = null;
    try {
      const rawExternalAdReply = extractExternalAdReply(waMsg);
      if (rawExternalAdReply) {
        externalAdReply = {
          title: rawExternalAdReply.title || null,
          body: rawExternalAdReply.body || null,
          thumbnail: null, // Will be processed below
          mediaUrl: rawExternalAdReply.mediaUrl || null,
          sourceUrl: rawExternalAdReply.sourceUrl || null,
          renderLargerThumbnail: rawExternalAdReply.renderLargerThumbnail || false,
          showAdAttribution: rawExternalAdReply.showAdAttribution || false
        };


        if (rawExternalAdReply.thumbnail) {
          const thumbnail = rawExternalAdReply.thumbnail;
          

          if (typeof thumbnail === 'string' && thumbnail.startsWith('data:')) {
            externalAdReply.thumbnail = thumbnail;
          }

          else if (typeof thumbnail === 'string' && (thumbnail.startsWith('http://') || thumbnail.startsWith('https://'))) {
            externalAdReply.thumbnail = thumbnail;
          }


          else if (thumbnail && typeof thumbnail === 'object') {

            if (thumbnail.url) {
              externalAdReply.thumbnail = thumbnail.url;
            } else if (thumbnail.directPath) {

              externalAdReply.thumbnail = thumbnail.directPath;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing externalAdReply:', error);
    }

    if (isFromMe && !isHistorySync && waMsg.key?.id) {
      try {
        const existing = await storage.getMessageByWhatsAppId(conversation.id, waMsg.key.id);
        if (existing) {

          return;
        }
      } catch (e) {

      }
    }

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageContent,
      direction,
      type: messageType,
      sentAt: messageTimestamp,
      ...(isHistorySync && { createdAt: messageTimestamp }),
      senderId,
      senderType,
      status: 'delivered',
      mediaUrl,
      externalId: waMsg.key.id,

      groupParticipantJid: null, // Group chat handling disabled
      groupParticipantName: null, // Group chat handling disabled

      metadata: JSON.stringify({
        messageId: waMsg.key.id,
        remoteJid: resolvedRemoteJid, // Use resolved JID (actual phone number)
        normalizedRemoteJid: remoteJid,
        originalRemoteJid: rawRemoteJidBeforeNormalization,
        fromMe: isFromMe,
        isGroupChat: false,
        canonicalIdentifier: cleanPhoneNumber,
        wasLidResolved: actualPhoneNumber !== null,
        ...(mediaUrl && { mediaUrl }),
        ...(quotedStanzaId ? { isQuotedMessage: true, quotedMessageId: quotedStanzaId } : {}),
        ...(externalAdReply ? { externalAdReply } : {}),

        ...(messageType === 'reaction' && (waMsg as any).reactionMetadata ? (waMsg as any).reactionMetadata : {}),
        ...(messageType === 'poll' && (waMsg.message.pollCreationMessage || waMsg.message.pollCreationMessageV3) && (() => {
          const pollCreation = waMsg.message.pollCreationMessage || waMsg.message.pollCreationMessageV3;
          return pollCreation ? {
            pollContext: {
              pollName: pollCreation.name || 'Poll',
              pollOptions: pollCreation.options?.map((opt: any) =>
                opt.optionName || opt.name || opt.text || opt
              ) || [],
              selectableCount: pollCreation.selectableOptionsCount || 1
            }
          } : {};
        })()),
        ...(messageType === 'poll_vote' && waMsg.message.pollUpdateMessage && {
          pollVote: {
            pollCreationMessageKey: waMsg.message.pollUpdateMessage.pollCreationMessageKey,
            encPayload: waMsg.message.pollUpdateMessage.vote?.encPayload,
            encIv: waMsg.message.pollUpdateMessage.vote?.encIv,
            senderTimestampMs: waMsg.message.pollUpdateMessage.senderTimestampMs,

            ...(typeof (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex === 'number' && {
              selectedIndex: (waMsg.message.pollUpdateMessage as any).decryptedSelectedIndex
            })
          }
        }),
        whatsappMessage: {
          key: waMsg.key,
          message: waMsg.message,
          messageTimestamp: waMsg.messageTimestamp
        }
      }),
      isHistorySync,
      historySyncBatchId
    };

    const message = await storage.createMessage(messageData);




    try {
      if (!isFromMe && !isHistorySync) {

        const unreadCount = await storage.getUnreadCount(conversation.id);


        broadcastWhatsAppEvent('unreadCountUpdated', {
          conversationId: conversation.id,
          unreadCount
        }, {
          conversationId: conversation.id,
          priority: 'normal'
        });
      }
    } catch (error) {
      console.error('Error broadcasting unread count update:', error);
    }


    if (isFromMe) {

      emitWhatsAppEvent('messageSent', {
        message,
        conversation,
        contact,
        companyId: conversation?.companyId,
      });
    } else {

      emitWhatsAppEvent('messageReceived', {
        message,
        conversation,
        contact,
        companyId: conversation?.companyId,
      });
    }



    if (!isGroupChat && !isFromMe) {
      try {
        const channelConnection = await storage.getChannelConnection(connectionId);

        if (channelConnection && contact) {

          
          
          if (MESSAGE_DEBOUNCING_CONFIG.enabled) {
            
            scheduleDebounceProcessing(message, conversation, contact, channelConnection, resolvedRemoteJid, connectionId);
          } else {
            await processMessageThroughFlowExecutor(message, conversation, contact, channelConnection);
          }
        }
      } catch (error) {
        console.error('Error processing message through flow executor:', error);
      }
    }

  } catch (error: any) {
    console.error('Error handling incoming message:', error);
  }
}

/**
 * Handle incoming WhatsApp message reactions
 */
async function handleIncomingReaction(
  reactionEvent: any,
  connectionId: number,
  userId: number
): Promise<void> {
  try {
    const { key, reaction } = reactionEvent;

    if (!key || !key.remoteJid || !key.id || !reaction) {

      return;
    }

    

    const user = await storage.getUser(userId);
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return;
    }

    const isGroupChat = key.remoteJid.endsWith('@g.us');
    let phoneNumber: string;
    let groupJid: string | null = null;
    let participantJid: string | null = null;

    if (isGroupChat) {
      groupJid = key.remoteJid;
      participantJid = key.participant || key.remoteJid;
      phoneNumber = participantJid ? participantJid.split('@')[0] : key.remoteJid.split('@')[0];
    } else {
      phoneNumber = key.remoteJid.split('@')[0];
    }


    const syntheticReactionMessage = {
      key: {
        remoteJid: key.remoteJid,
        fromMe: false,
        id: `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        participant: key.participant
      },
      message: {
        reactionMessage: {
          key: key,
          text: reaction.text || '👍',
          senderTimestampMs: reaction.senderTimestampMs || Date.now()
        }
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      pushName: null
    };


    await handleIncomingMessage(syntheticReactionMessage as any, connectionId, userId);

  } catch (error: any) {
    console.error('Error handling incoming reaction:', error);
  }
}

/**
 * Disconnect from WhatsApp with enterprise-grade cleanup
 */
export async function disconnectWhatsApp(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }





    const connState = getConnectionState(connectionId);
    connState.status = 'disconnected';
    connState.lastError = null;

    await updateConnectionStatus(connectionId, 'disconnected');

    const sock = activeConnections.get(connectionId);
    if (!sock) {


      await cleanupConnection(connectionId);

      emitWhatsAppEvent('connectionStatusUpdate', {
        connectionId,
        status: 'disconnected',
        companyId: connState.companyId,
      });

      return true;
    }

    try {
      await sock.logout();

    } catch (logoutError) {


      try {
        sock.ws?.close();
      } catch (closeError) {

      }
    }

    await cleanupConnection(connectionId);

    emitWhatsAppEvent('connectionStatusUpdate', {
      connectionId,
      status: 'disconnected',
      companyId: connState.companyId,
    });


    return true;
  } catch (error: any) {


    const connState = getConnectionState(connectionId);
    connState.lastError = error.message;
    updateHealthScore(connectionId, 'error');

    return false;
  }
}

/**
 * Send an audio message via WhatsApp
 */
export async function sendWhatsAppAudioMessage(
  connectionId: number,
  userId: number,
  to: string,
  audioPath: string,
  isFromBot: boolean = false,
  conversationId?: number
): Promise<Message | null> {

  let convertedAudioPath: string | null = null;
  let actualAudioPath: string = audioPath;

  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, conversationId, connectionId);

    if (!hasConnectionAccess) {
      throw new Error('You do not have permission to access this connection');
    }

    let sock = activeConnections.get(connectionId);
    if (!sock) {


      try {
        await connectToWhatsApp(connectionId, userId);
        await new Promise(resolve => setTimeout(resolve, 3000));

        sock = activeConnections.get(connectionId);
        if (!sock) {
          throw new Error(`Failed to establish WhatsApp connection for ID ${connectionId} after reconnection attempt`);
        }


      } catch (reconnectError) {
        console.error(`Failed to reconnect WhatsApp connection ${connectionId}:`, reconnectError);
        throw new Error(`No active connection found for ID ${connectionId} and reconnection failed: ${(reconnectError as any).message}`);
      }
    }

    if (!sock.user?.id) {

      throw new Error(`WhatsApp connection is not properly authenticated`);
    }

    const isGroupChat = to.endsWith('@g.us');
    let phoneNumber = to;

    if (!phoneNumber.includes('@')) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      phoneNumber = `${phoneNumber}@s.whatsapp.net`;
    }



    let originalBuffer: Buffer;

    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
      try {

        const response = await axios.get(audioPath, {
          responseType: 'arraybuffer',
          timeout: 30000 // 30 second timeout
        });
        originalBuffer = Buffer.from(response.data);


        const tempDir = path.join(process.cwd(), 'temp', 'audio');
        await fsExtra.ensureDir(tempDir);


        const urlPath = new URL(audioPath).pathname;
        const urlFilename = path.basename(urlPath);
        const tempFilename = urlFilename || `temp_audio_${Date.now()}.mp3`;

        actualAudioPath = path.join(tempDir, tempFilename);
        await fsPromises.writeFile(actualAudioPath, originalBuffer);


      } catch (downloadError: any) {
        console.error('Error downloading audio from URL:', downloadError);
        throw new Error(`Failed to download audio from URL: ${audioPath}. Error: ${downloadError.message}`);
      }
    } else {

      if (!await fsExtra.pathExists(audioPath)) {
        throw new Error(`Audio file not found at path: ${audioPath}`);
      }
      originalBuffer = await fsPromises.readFile(audioPath);
    }


    const fileExtension = path.extname(actualAudioPath).toLowerCase();


    let mimeType = 'audio/mpeg';
    if (fileExtension === '.webm') {
      mimeType = 'audio/webm';
    } else if (fileExtension === '.ogg') {
      mimeType = 'audio/ogg';
    } else if (fileExtension === '.aac') {
      mimeType = 'audio/aac';
    } else if (fileExtension === '.m4a') {
      mimeType = 'audio/mp4';
    }

    let finalAudioPath = actualAudioPath;
    let finalMimeType = mimeType;
    let audioBuffer = originalBuffer;


    if (needsConversionForWhatsApp(mimeType, fileExtension)) {
      const tempDir = path.join(process.cwd(), 'temp', 'audio');
      await fsExtra.ensureDir(tempDir);

      try {
        const conversionResult = await convertAudioForWhatsAppWithFallback(
          actualAudioPath,
          tempDir,
          path.basename(actualAudioPath)
        );

        convertedAudioPath = conversionResult.outputPath;
        finalAudioPath = convertedAudioPath;
        audioBuffer = await fsPromises.readFile(convertedAudioPath);
        finalMimeType = conversionResult.mimeType;
        

        if (finalMimeType.includes(';')) {
          finalMimeType = finalMimeType.split(';')[0].trim();
        }
      } catch (conversionError) {
        console.error('Audio conversion failed, using original file:', conversionError);

        audioBuffer = originalBuffer;
        finalMimeType = mimeType;

        if (finalMimeType.includes(';')) {
          finalMimeType = finalMimeType.split(';')[0].trim();
        }
      }
    } else {
      finalMimeType = getWhatsAppMimeType(fileExtension.substring(1));

      if (finalMimeType.includes(';')) {
        finalMimeType = finalMimeType.split(';')[0].trim();
      }
    }


    

    let sentMessageInfo;
    try {
      await simulateRecording(sock, phoneNumber);


      sentMessageInfo = await sock.sendMessage(phoneNumber, {
        audio: audioBuffer,
        mimetype: finalMimeType,
        ptt: true
      });

      await stopPresenceIndicators(sock, phoneNumber);

      updateHealthScore(connectionId, 'success');

      if (!sentMessageInfo) {
        throw new Error('Failed to send audio message: No response from WhatsApp');
      }
    } catch (sendError) {
      console.error('WhatsApp Service: Error in sock.sendMessage for audio:', sendError);
      updateHealthScore(connectionId, 'error');
      throw sendError;
    }

    let contact = null;
    let conversation = null;

    if (isGroupChat) {
      const groupJid = phoneNumber;
      conversation = await storage.getConversationByGroupJid(groupJid);

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        let groupName = groupJid.split('@')[0];
        let groupMetadata = null;

        try {
          const metadata = await sock.groupMetadata(groupJid);
          groupName = metadata.subject || groupName;
          groupMetadata = {
            subject: metadata.subject,
            desc: metadata.desc,
            participants: metadata.participants,
            creation: metadata.creation,
            owner: metadata.owner
          };
        } catch (error) {

        }

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: null,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: true,
          groupJid: groupJid,
          groupName: groupName,
          groupDescription: groupMetadata?.desc || null,
          groupParticipantCount: groupMetadata?.participants?.length || 0,
          groupCreatedAt: groupMetadata?.creation ? new Date(groupMetadata.creation * 1000) : new Date(),
          groupMetadata: groupMetadata
        };

        conversation = await storage.createConversation(conversationData);

      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    } else {
      const identifier = to.includes('@') ? to.split('@')[0] : to;
      contact = await storage.getContactByIdentifier(identifier, 'whatsapp');

      if (!contact) {
        let profilePictureUrl = null;

        try {
          profilePictureUrl = await fetchProfilePicture(connectionId, identifier);
        } catch (fetchError) {

        }

        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const contactData: InsertContact = {
          companyId: companyId,
          name: identifier,
          phone: identifier,
          email: null,
          avatarUrl: profilePictureUrl,
          identifier,
          identifierType: 'whatsapp',
          source: 'whatsapp',
          notes: null
        };

        contact = await storage.getOrCreateContact(contactData);
      }

      conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        connectionId
      );

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: false
        };

        conversation = await storage.createConversation(conversationData);
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    }


    const MEDIA_DIR = path.join(process.cwd(), 'public', 'media');
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const fileExt = path.extname(finalAudioPath) || '.webm';
    const filename = `${uniqueId}${fileExt}`;

    const mediaTypeDir = path.join(MEDIA_DIR, 'audio');
    await fsExtra.ensureDir(mediaTypeDir);

    const mediaFilePath = path.join(mediaTypeDir, filename);
    await fsExtra.copy(finalAudioPath, mediaFilePath);

    const mediaUrl = `/media/audio/${filename}`;

    const whatsappMessageId = sentMessageInfo?.key?.id;
    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: 'Voice message',
      direction: 'outbound',
      type: 'audio',
      sentAt: new Date(),
      senderId: isFromBot ? null : userId,
      senderType: isFromBot ? null : 'user',
      isFromBot: isFromBot,
      status: 'sent',
      externalId: whatsappMessageId,
      groupParticipantJid: null,
      groupParticipantName: null,
      metadata: JSON.stringify({
        messageId: whatsappMessageId,
        remoteJid: sentMessageInfo?.key?.remoteJid,
        fromMe: true,
        isGroupChat,
        audioPath: finalAudioPath,
        originalPath: audioPath,
        mimeType: finalMimeType,
        ...(isGroupChat && { groupJid: phoneNumber }),
        whatsappMessage: sentMessageInfo ? {
          key: sentMessageInfo.key,
          message: { audioMessage: { mimetype: finalMimeType, ptt: true } },
          messageTimestamp: Date.now()
        } : null
      }),
      mediaUrl: mediaUrl,
    };

    const savedMessage = await storage.createMessage(messageData);


    emitWhatsAppEvent('messageSent', {
      message: savedMessage,
      conversation,
      contact,
      companyId: conversation?.companyId,
    });

    return savedMessage;
  } catch (error: any) {
    console.error('Error sending WhatsApp audio message:', error);
    return null;
  } finally {


    const filesToCleanup: string[] = [];

    if (convertedAudioPath) {
      filesToCleanup.push(convertedAudioPath);
    }


    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
      if (actualAudioPath && actualAudioPath !== audioPath) {
        filesToCleanup.push(actualAudioPath);
      }
    }

    if (filesToCleanup.length > 0) {
      try {
        await cleanupTempAudioFiles(filesToCleanup);
      } catch (cleanupError) {
        console.error('Error cleaning up temporary audio files:', cleanupError);
      }
    }
  }
}

export async function sendWhatsAppMessage(
  connectionId: number,
  userId: number,
  to: string,
  message: string,
  isFromBot: boolean = false,
  conversationId?: number
): Promise<Message | null> {

  const startTime = Date.now();

  try {



    const [connection, user] = await Promise.all([
      storage.getChannelConnection(connectionId),
      storage.getUser(userId)
    ]);

    if (!connection) {
      throw new Error('Connection not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, conversationId, connectionId);

    if (!hasConnectionAccess) {
      throw new Error('You do not have permission to access this connection');
    }

    let connectionCompanyId = connection.companyId;
    if (!connectionCompanyId) {
      const connectionOwner = await storage.getUser(connection.userId);
      if (connectionOwner) {
        connectionCompanyId = connectionOwner.companyId;
      }
    }



    let sock = activeConnections.get(connectionId);
    if (!sock) {

      if (connectionAttempts.get(connectionId)) {

        await new Promise(resolve => setTimeout(resolve, 100));
        sock = activeConnections.get(connectionId);

        if (!sock) {
          throw new Error(`Connection attempt in progress for ID ${connectionId}, please retry`);
        }
      } else {
        try {
          await connectToWhatsApp(connectionId, userId);


          await new Promise(resolve => setTimeout(resolve, 500));

          sock = activeConnections.get(connectionId);
          if (!sock) {
            throw new Error(`Failed to establish WhatsApp connection for ID ${connectionId} after reconnection attempt`);
          }

        } catch (reconnectError) {
          console.error(`Failed to reconnect WhatsApp connection ${connectionId}:`, reconnectError);
          throw new Error(`No active connection found for ID ${connectionId} and reconnection failed: ${(reconnectError as any).message}`);
        }
      }
    }


    if (!sock.user?.id) {
      throw new Error(`WhatsApp connection is not properly authenticated`);
    }


    const connState = getConnectionState(connectionId);
    if (connState.status === 'disconnected' || connState.status === 'error') {
      throw new Error(`WhatsApp connection is not ready (status: ${connState.status})`);
    }


    const isGroupChat = to.endsWith('@g.us');
    if (isGroupChat) {
      throw new Error('Group chat messaging is disabled for unofficial WhatsApp integration');
    }


    let phoneNumber = to;
    if (!phoneNumber.includes('@')) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      phoneNumber = `${phoneNumber}@s.whatsapp.net`;
    } else {


      if (phoneNumber.endsWith('@lid')) {
      } else {
        phoneNumber = normalizeWhatsAppJid(phoneNumber);
      }
    }

    let sentMessageInfo;
    try {
      if (isFromBot) {
        const chunks = splitMessage(message);
        if (chunks.length > 1) {
          const sentMessages = await sendMessageWithSplitting(sock, phoneNumber, message, connectionId);
          sentMessageInfo = sentMessages[0];
        } else {
          const typingPromise = simulateTyping(sock, phoneNumber, message);
          const messagePromise = sock.sendMessage(phoneNumber, { text: message });
          sentMessageInfo = await messagePromise;
          await stopPresenceIndicators(sock, phoneNumber);
          typingPromise.catch(error => {
            console.warn('Typing simulation error (non-blocking):', error);
          });
        }
      } else {

        sentMessageInfo = await sock.sendMessage(phoneNumber, { text: message });
      }


      updateHealthScore(connectionId, 'success');

      if (!sentMessageInfo) {

      }
    } catch (sendError) {
      console.error('WhatsApp Service: Error in sock.sendMessage:', sendError);
      updateHealthScore(connectionId, 'error');
      throw sendError;
    }

    let contact = null;
    let conversation = null;

    if (isGroupChat) {
      const groupJid = phoneNumber;

      conversation = await storage.getConversationByGroupJid(groupJid);

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        let groupName = groupJid.split('@')[0];
        let groupMetadata = null;

        try {
          const metadata = await sock.groupMetadata(groupJid);
          groupName = metadata.subject || groupName;
          groupMetadata = {
            subject: metadata.subject,
            desc: metadata.desc,
            participants: metadata.participants,
            creation: metadata.creation,
            owner: metadata.owner
          };
        } catch (error) {

        }

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: null,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: true,
          groupJid: groupJid,
          groupName: groupName,
          groupDescription: groupMetadata?.desc || null,
          groupParticipantCount: groupMetadata?.participants?.length || 0,
          groupCreatedAt: groupMetadata?.creation ? new Date(groupMetadata.creation * 1000) : new Date(),
          groupMetadata: groupMetadata
        };

        conversation = await storage.createConversation(conversationData);



        broadcastNewConversation({
          ...conversation,
          contact: null
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    } else {
      const identifier = to.includes('@') ? to.split('@')[0] : to;
      contact = await storage.getContactByIdentifier(identifier, 'whatsapp');

      if (!contact) {
        let profilePictureUrl = null;

        try {
          profilePictureUrl = await fetchProfilePicture(connectionId, identifier);

          if (profilePictureUrl) {

          }
        } catch (fetchError) {

        }

        const user = await storage.getUser(userId);
        const companyId = user?.companyId;


        const connection = await storage.getChannelConnection(connectionId);
        const identifierType = getIdentifierTypeFromConnection(connection?.channelType);

        const contactData: InsertContact = {
          companyId: companyId,
          name: identifier,
          phone: identifier,
          email: null,
          avatarUrl: profilePictureUrl,
          identifier,
          identifierType: identifierType,
          source: 'whatsapp',
          notes: null,
          createdBy: userId
        };

        contact = await storage.getOrCreateContact(contactData);
      }

      conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        connectionId
      );

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: false
        };

        conversation = await storage.createConversation(conversationData);


        broadcastNewConversation({
          ...conversation,
          contact
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    }

    const whatsappMessageId = sentMessageInfo?.key?.id;
    if (whatsappMessageId) {
      const existingMessage = await storage.getMessageByWhatsAppId(conversation.id, whatsappMessageId);
      if (existingMessage) {

        return existingMessage;
      }
    }

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: message,
      direction: 'outbound',
      type: 'text',
      sentAt: new Date(),
      senderId: isFromBot ? null : userId,
      senderType: isFromBot ? null : 'user',
      isFromBot: isFromBot,
      status: 'sent',
      externalId: whatsappMessageId,

      groupParticipantJid: null,
      groupParticipantName: null,

      metadata: JSON.stringify({
        messageId: whatsappMessageId,
        remoteJid: sentMessageInfo?.key?.remoteJid,
        normalizedRemoteJid: phoneNumber,
        fromMe: true,
        isGroupChat: false,
        whatsappMessage: sentMessageInfo ? {
          key: sentMessageInfo.key,
          message: { conversation: message },
          messageTimestamp: Date.now()
        } : null
      }),
      mediaUrl: null,
    };





    let savedMessage;
    try {
      savedMessage = await storage.createMessage(messageData);



      if (whatsappMessageId) {
        const trackingKey = `${phoneNumber}:${whatsappMessageId}`;
        const trackingEntry: PowerChatMessageTracking = {
          timestamp: Date.now(),
          messageId: whatsappMessageId,
          content: message.substring(0, 100), // Store first 100 chars for debugging
          source: 'powerchat' as const
        };

        recentPowerChatMessages.set(trackingKey, trackingEntry);


        setTimeout(() => {
          if (recentPowerChatMessages.has(trackingKey)) {
            recentPowerChatMessages.delete(trackingKey);
          }
        }, POWERCHAT_MESSAGE_TRACKING_DURATION);
      }

    } catch (error: any) {


      throw error;
    }

    emitWhatsAppEvent('messageSent', {
      message: savedMessage,
      conversation,
      contact,
      companyId: conversation?.companyId,
    });


    const deliveryTime = Date.now() - startTime;
    if (deliveryTime > 2000) {
      console.warn(`WhatsApp message delivery took ${deliveryTime}ms (connectionId: ${connectionId})`);
    } else {

    }

    return savedMessage;
  } catch (error: any) {
    const deliveryTime = Date.now() - startTime;
    console.error(`Error sending WhatsApp message after ${deliveryTime}ms:`, error);
    return null;
  }
}

/**
 * Alias for sendWhatsAppMessage to maintain compatibility with flow executor
 * This ensures existing code that calls sendMessage() will work properly
 */
export const sendMessage = sendWhatsAppMessage;

/**
 * Alias for sendWhatsAppAudioMessage to maintain compatibility with flow executor
 * This ensures existing code that calls sendAudioMessage() will work properly
 */
export const sendAudioMessage = sendWhatsAppAudioMessage;

/**
 * Alias for sendWhatsAppMediaMessage to maintain compatibility with flow executor
 * This ensures existing code that calls sendMedia() will work properly
 */
export const sendMedia = sendWhatsAppMediaMessage;

/**
 * Delete a WhatsApp message for everyone using Baileys
 * @param connectionId WhatsApp connection ID
 * @param userId User ID of the sender
 * @param to Recipient phone number (remoteJid)
 * @param messageKey The message key object containing remoteJid, fromMe, and id
 * @returns Success status and any error message
 */
export async function deleteWhatsAppMessage(
  connectionId: number,
  userId: number,
  to: string,
  messageKey: { remoteJid?: string; fromMe?: boolean; id: string },
  conversationId?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, conversationId, connectionId);

    if (!hasConnectionAccess) {
      return { success: false, error: 'You do not have permission to access this connection' };
    }

    const sock = activeConnections.get(connectionId);
    if (!sock) {
      return { success: false, error: 'WhatsApp connection not found or not active' };
    }

    const isGroupChat = to.includes('@g.us');
    let recipient = to;

    if (!isGroupChat) {
      let phoneNumber = to.replace(/[^0-9]/g, '');
      if (!phoneNumber.includes('@')) {
        phoneNumber = phoneNumber + '@s.whatsapp.net';
      }
      recipient = phoneNumber;
    }

    const fullMessageKey = {
      remoteJid: messageKey.remoteJid || recipient,
      fromMe: messageKey.fromMe !== undefined ? messageKey.fromMe : true,
      id: messageKey.id
    };



    await sock.sendMessage(recipient, {
      delete: fullMessageKey
    });


    return { success: true };
  } catch (error: any) {
    console.error('Error deleting WhatsApp message:', error);

    if (error.message?.includes('too old') || error.message?.includes('time limit')) {
      return {
        success: false,
        error: 'Message is too old to be deleted. WhatsApp only allows deletion within 72 minutes of sending.'
      };
    }

    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return {
        success: false,
        error: 'Message not found or already deleted.'
      };
    }

    if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
      return {
        success: false,
        error: 'You do not have permission to delete this message.'
      };
    }

    if (error.message?.includes('group') && error.message?.includes('admin')) {
      return {
        success: false,
        error: 'Only group admins can delete messages in this group.'
      };
    }

    return {
      success: false,
      error: error.message || 'Failed to delete message from WhatsApp'
    };
  }
}

/**
 * Send a quoted message (reply) to WhatsApp using Baileys
 * @param connectionId WhatsApp connection ID
 * @param userId User ID of the sender
 * @param to Recipient phone number
 * @param quotedMessageData Object containing text and quoted message
 * @returns Saved message or null if failed
 */
export async function sendQuotedMessage(
  connectionId: number,
  userId: number,
  to: string,
  quotedMessageData: { text: string; quoted: any },
  isFromBot: boolean = false,
  conversationId?: number
): Promise<Message | null> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, conversationId, connectionId);

    if (!hasConnectionAccess) {
      throw new Error('You do not have permission to access this connection');
    }

    let sock = activeConnections.get(connectionId);
    if (!sock) {


      try {
        await connectToWhatsApp(connectionId, userId);
        await new Promise(resolve => setTimeout(resolve, 3000));

        sock = activeConnections.get(connectionId);
        if (!sock) {
          throw new Error(`Failed to establish WhatsApp connection for ID ${connectionId} after reconnection attempt`);
        }


      } catch (reconnectError) {
        console.error(`Failed to reconnect WhatsApp connection ${connectionId}:`, reconnectError);
        throw new Error(`No active connection found for ID ${connectionId} and reconnection failed: ${(reconnectError as any).message}`);
      }
    }

    if (!sock.user?.id) {

      throw new Error(`WhatsApp connection is not properly authenticated`);
    }

    const isGroupChat = to.endsWith('@g.us');
    let phoneNumber = to;

    if (!phoneNumber.includes('@')) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      phoneNumber = `${phoneNumber}@s.whatsapp.net`;
    }



    if (!quotedMessageData.quoted || !quotedMessageData.quoted.key) {
      throw new Error('Invalid quoted message object - missing key');
    }

    const messageText = quotedMessageData.text?.trim();
    if (!messageText) {
      throw new Error('Message text cannot be empty');
    }

    let sentMessageInfo;
    if (isFromBot) {
      const typingPromise = simulateTyping(sock, phoneNumber, messageText);
      const messagePromise = sock.sendMessage(phoneNumber, { text: messageText }, { quoted: quotedMessageData.quoted });
      sentMessageInfo = await messagePromise;
      await Promise.allSettled([stopPresenceIndicators(sock, phoneNumber), typingPromise]);
    } else {

      sentMessageInfo = await sock.sendMessage(phoneNumber, { text: messageText }, { quoted: quotedMessageData.quoted });
    }

    let contact = null;
    let conversation = null;

    if (isGroupChat) {
      const groupJid = phoneNumber;

      conversation = await storage.getConversationByGroupJid(groupJid);

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        let groupName = groupJid.split('@')[0];
        let groupMetadata = null;

        try {
          const metadata = await sock.groupMetadata(groupJid);
          groupName = metadata.subject || groupName;
          groupMetadata = {
            subject: metadata.subject,
            desc: metadata.desc,
            participants: metadata.participants,
            creation: metadata.creation,
            owner: metadata.owner
          };
        } catch (error) {

        }

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: null,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: true,
          groupJid: groupJid,
          groupName: groupName,
          groupDescription: groupMetadata?.desc || null,
          groupParticipantCount: groupMetadata?.participants?.length || 0,
          groupCreatedAt: groupMetadata?.creation ? new Date(groupMetadata.creation * 1000) : new Date(),
          groupMetadata: groupMetadata
        };

        conversation = await storage.createConversation(conversationData);



        broadcastNewConversation({
          ...conversation,
          contact: null
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    } else {
      const identifier = to.includes('@') ? to.split('@')[0] : to;
      contact = await storage.getContactByIdentifier(identifier, 'whatsapp');

      if (!contact) {
        let profilePictureUrl = null;

        try {
          profilePictureUrl = await fetchProfilePicture(connectionId, identifier);
          if (profilePictureUrl) {

          }
        } catch (fetchError) {

        }

        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const contactData: InsertContact = {
          companyId: companyId,
          name: identifier,
          phone: identifier,
          email: null,
          avatarUrl: profilePictureUrl,
          identifier,
          identifierType: 'whatsapp',
          source: 'whatsapp',
          notes: null
        };

        contact = await storage.getOrCreateContact(contactData);
      }

      conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        connectionId
      );

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: false
        };

        conversation = await storage.createConversation(conversationData);


        broadcastNewConversation({
          ...conversation,
          contact
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    }

    const whatsappMessageId = sentMessageInfo?.key?.id;
    if (whatsappMessageId) {
      const existingMessage = await storage.getMessageByWhatsAppId(conversation.id, whatsappMessageId);
      if (existingMessage) {

        return existingMessage;
      }
    }

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: quotedMessageData.text,
      direction: 'outbound',
      type: 'text',
      sentAt: new Date(),
      senderId: isFromBot ? null : userId,
      senderType: isFromBot ? null : 'user',
      isFromBot: isFromBot,
      status: 'sent',
      externalId: whatsappMessageId,

      groupParticipantJid: null,
      groupParticipantName: null,

      metadata: JSON.stringify({
        messageId: whatsappMessageId,
        remoteJid: sentMessageInfo?.key?.remoteJid,
        fromMe: true,
        isGroupChat,
        isQuotedMessage: true,
        quotedMessageId: quotedMessageData.quoted?.key?.id,
        ...(isGroupChat && { groupJid: phoneNumber }),
        whatsappMessage: sentMessageInfo ? {
          key: sentMessageInfo.key,
          message: { conversation: quotedMessageData.text },
          messageTimestamp: Date.now()
        } : null
      }),
      mediaUrl: null,
    };

    let savedMessage;
    try {
      savedMessage = await storage.createMessage(messageData);

    } catch (error: any) {

      throw error;
    }

    emitWhatsAppEvent('messageSent', {
      message: savedMessage,
      conversation,
      contact,
      companyId: conversation?.companyId,
    });

    return savedMessage;
  } catch (error: any) {
    console.error('Error sending WhatsApp quoted message:', error);
    return null;
  }
}

/**
 * Get all active WhatsApp connections
 */
export function getActiveConnections(): number[] {
  return Array.from(activeConnections.keys());
}

/**
 * Check if a WhatsApp connection is active
 */
/**
 * Check if a WhatsApp connection is active and ready to send messages
 * @param connectionId The ID of the connection to check
 * @returns True if the connection is active and ready, false otherwise
 */
/**
 * Check if a WhatsApp connection is active and ready to send messages
 * Based on Baileys documentation and testing, this properly verifies connection status
 *
 * @param connectionId The ID of the connection to check
 * @returns True if the connection is active and ready, false otherwise
 */
/**
 * Check if a WhatsApp connection is active and ready to send messages
 * Based on Baileys documentation and testing, this properly verifies connection status
 *
 * @param connectionId The ID of the connection to check
 * @returns True if the connection is active and ready, false otherwise
 */
export function isConnectionActive(connectionId: number): boolean {
  const sock = activeConnections.get(connectionId);

  if (!sock) {

    return false;
  }

  try {
    const hasUser = !!sock.user?.id;

    const hasAuthState = !!sock.authState;

    const hasKeys = !!sock.authState?.keys;



    return hasUser && hasAuthState && hasKeys;
  } catch (error) {
    console.error(`Error checking WhatsApp connection status for ID ${connectionId}:`, error);
    return false;
  }
}

/**
 * Subscribe to WhatsApp events
 */
export function subscribeToWhatsAppEvents(
  event: string,
  callback: (data: any) => void
): () => void {
  return eventEmitterPool.subscribe(WHATSAPP_NAMESPACE, event, callback);
}

/**
 * Send media message to WhatsApp
 * @param connectionId WhatsApp connection ID
 * @param userId User ID of the sender
 * @param to Recipient phone number
 * @param mediaType Type of media ('image', 'video', 'audio', 'document')
 * @param filePath Path to the file on the server
 * @param caption Optional caption for the media
 * @param fileName Optional filename for documents
 * @returns Saved message or null if failed
 */
export async function sendWhatsAppMediaMessage(
  connectionId: number,
  userId: number,
  to: string,
  mediaType: 'image' | 'video' | 'audio' | 'document',
  filePath: string,
  caption?: string,
  fileName?: string,
  isFromBot: boolean = false,
  conversationId?: number
): Promise<Message | null> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasConnectionAccess = await checkConnectionPermission(user, connection, conversationId, connectionId);

    if (!hasConnectionAccess) {
      throw new Error('You do not have permission to access this connection');
    }

    let sock = activeConnections.get(connectionId);
    if (!sock) {


      try {
        await connectToWhatsApp(connectionId, userId);

        await new Promise(resolve => setTimeout(resolve, 3000));

        sock = activeConnections.get(connectionId);
        if (!sock) {
          throw new Error(`Failed to establish WhatsApp connection for ID ${connectionId} after reconnection attempt`);
        }


      } catch (reconnectError) {
        console.error(`Failed to reconnect WhatsApp connection ${connectionId}:`, reconnectError);
        throw new Error(`No active connection found for ID ${connectionId} and reconnection failed: ${(reconnectError as any).message}`);
      }
    }

    if (!sock.user?.id) {

      throw new Error(`WhatsApp connection is not properly authenticated`);
    }

    const isGroupChat = to.endsWith('@g.us');
    let phoneNumber = to;

    if (!phoneNumber.includes('@')) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      phoneNumber = `${phoneNumber}@s.whatsapp.net`;
    }



    const resolvedFilePath = resolveMediaPath(filePath);
    let fileContent: Buffer;

    if (resolvedFilePath.startsWith('http://') || resolvedFilePath.startsWith('https://')) {
      try {
        const response = await axios.get(resolvedFilePath, { responseType: 'arraybuffer' });
        fileContent = Buffer.from(response.data);
      } catch (downloadError: any) {
        console.error('Error downloading media from URL:', downloadError);
        throw new Error(`Failed to download media from URL: ${resolvedFilePath}. Error: ${downloadError.message}`);
      }
    } else {
      if (!await fsExtra.pathExists(resolvedFilePath)) {
        throw new Error(`Media file not found at path: ${resolvedFilePath}`);
      }
      fileContent = await fsExtra.readFile(resolvedFilePath);
    }
    let messageContent: any = {};

    switch (mediaType) {
      case 'image':
        messageContent = {
          image: fileContent,
          caption: caption || '',
        };
        break;
      case 'video':
        messageContent = {
          video: fileContent,
          caption: caption || '',
        };
        break;
      case 'audio':


        return await sendWhatsAppAudioMessage(
          connectionId,
          userId,
          to,
          resolvedFilePath,
          isFromBot,
          conversationId
        );
      case 'document': {

        let finalFileName = fileName || path.basename(resolvedFilePath);
        

        const fileExt = path.extname(finalFileName).toLowerCase();
        const pathExt = path.extname(resolvedFilePath).toLowerCase();
        

        let detectedMimetype = mimeTypes.lookup(finalFileName) || mimeTypes.lookup(resolvedFilePath) || 'application/octet-stream';
        

        if (detectedMimetype === 'application/pdf' || fileExt === '.pdf' || pathExt === '.pdf') {
          detectedMimetype = 'application/pdf';

          if (fileExt !== '.pdf') {
            finalFileName = finalFileName.replace(/\.[^/.]+$/, '') + '.pdf';
          }
        }
        
        messageContent = {
          document: fileContent,
          mimetype: detectedMimetype,
          fileName: finalFileName,
          caption: caption || '',
        };
        break;
      }
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }


    let sentMessageInfo;
    if (isFromBot) {
      const simulationMessage = caption || `Sending ${mediaType}...`;
      const typingPromise = simulateTyping(sock, phoneNumber, simulationMessage);
      const messagePromise = sock.sendMessage(phoneNumber, messageContent);
      sentMessageInfo = await messagePromise;
      await Promise.allSettled([stopPresenceIndicators(sock, phoneNumber), typingPromise]);
    } else {

      sentMessageInfo = await sock.sendMessage(phoneNumber, messageContent);
    }

    let contact = null;
    let conversation = null;

    if (isGroupChat) {
      const groupJid = phoneNumber;

      conversation = await storage.getConversationByGroupJid(groupJid);

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        let groupName = groupJid.split('@')[0];
        let groupMetadata = null;

        try {
          const metadata = await sock.groupMetadata(groupJid);
          groupName = metadata.subject || groupName;
          groupMetadata = {
            subject: metadata.subject,
            desc: metadata.desc,
            participants: metadata.participants,
            creation: metadata.creation,
            owner: metadata.owner
          };
        } catch (error) {

        }

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: null,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: true,
          groupJid: groupJid,
          groupName: groupName,
          groupDescription: groupMetadata?.desc || null,
          groupParticipantCount: groupMetadata?.participants?.length || 0,
          groupCreatedAt: groupMetadata?.creation ? new Date(groupMetadata.creation * 1000) : new Date(),
          groupMetadata: groupMetadata
        };

        conversation = await storage.createConversation(conversationData);



        broadcastNewConversation({
          ...conversation,
          contact: null
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    } else {
      const identifier = to.includes('@') ? to.split('@')[0] : to;
      contact = await storage.getContactByIdentifier(identifier, 'whatsapp');

      if (!contact) {
        let profilePictureUrl = null;

        try {
          profilePictureUrl = await fetchProfilePicture(connectionId, identifier);

          if (profilePictureUrl) {

          }
        } catch (fetchError) {

        }

        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const contactData: InsertContact = {
          companyId: companyId,
          name: identifier,
          phone: identifier,
          email: null,
          avatarUrl: profilePictureUrl,
          identifier,
          identifierType: 'whatsapp',
          source: 'whatsapp',
          notes: null
        };

        contact = await storage.getOrCreateContact(contactData);
      }

      conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        connectionId
      );

      if (!conversation) {
        const user = await storage.getUser(userId);
        const companyId = user?.companyId;

        const conversationData: InsertConversation = {
          companyId: companyId,
          contactId: contact.id,
          channelId: connectionId,
          channelType: 'whatsapp_unofficial',
          status: 'active',
          lastMessageAt: new Date(),
          isGroup: false
        };

        conversation = await storage.createConversation(conversationData);


        broadcastNewConversation({
          ...conversation,
          contact
        });
      } else {
        conversation = await storage.updateConversation(conversation.id, {
          lastMessageAt: new Date()
        });
      }
    }

    const uniqueId = crypto.createHash('md5').update(`${Date.now()}`).digest('hex');

    let fileExt = '';
    if (resolvedFilePath.startsWith('http://') || resolvedFilePath.startsWith('https://')) {
      const urlPath = new URL(resolvedFilePath).pathname;
      fileExt = path.extname(urlPath);
      if (!fileExt) {
        switch (mediaType) {
          case 'image': fileExt = '.jpg'; break;
          case 'video': fileExt = '.mp4'; break;
          case 'document': fileExt = '.pdf'; break;
          default: fileExt = '.bin';
        }
      }
    } else {
      fileExt = path.extname(resolvedFilePath);
    }

    const filename = `${uniqueId}${fileExt}`;

    const mediaTypeDir = path.join(MEDIA_DIR, mediaType);
    await fsExtra.ensureDir(mediaTypeDir);

    const mediaFilePath = path.join(mediaTypeDir, filename);

    if (resolvedFilePath.startsWith('http://') || resolvedFilePath.startsWith('https://')) {
      await fsExtra.writeFile(mediaFilePath, fileContent);
    } else {
      await fsExtra.copy(resolvedFilePath, mediaFilePath);
    }

    const mediaUrl = `/media/${mediaType}/${filename}`;

    mediaCache.set(uniqueId, mediaUrl);

    const whatsappMessageId = sentMessageInfo?.key?.id;
    if (whatsappMessageId) {
      const existingMessage = await storage.getMessageByWhatsAppId(conversation.id, whatsappMessageId);
      if (existingMessage) {

        return existingMessage;
      }
    }

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      content: caption || '',
      direction: 'outbound',
      type: mediaType,
      sentAt: new Date(),
      senderId: isFromBot ? null : userId,
      senderType: isFromBot ? null : 'user',
      isFromBot: isFromBot,
      status: 'sent',
      externalId: whatsappMessageId,

      groupParticipantJid: null,
      groupParticipantName: null,

      metadata: JSON.stringify({
        messageId: whatsappMessageId,
        remoteJid: sentMessageInfo?.key?.remoteJid,
        fromMe: true,
        isGroupChat,
        ...(isGroupChat && { groupJid: phoneNumber }),
        originalFileName: fileName || path.basename(resolvedFilePath),
        originalPath: filePath,
        resolvedPath: resolvedFilePath,
        mediaUrl,
        whatsappMessage: sentMessageInfo ? {
          key: sentMessageInfo.key,
          message: { [mediaType]: { caption: caption || '' } },
          messageTimestamp: Date.now()
        } : null
      }),
      mediaUrl,
    };

    let savedMessage;
    try {
      savedMessage = await storage.createMessage(messageData);

    } catch (error: any) {

      throw error;
    }

    emitWhatsAppEvent('messageSent', {
      message: savedMessage,
      conversation,
      contact,
      companyId: conversation?.companyId,
    });

    return savedMessage;
  } catch (error: any) {
    console.error('Error sending WhatsApp media message:', error);
    return null;
  }
}

/**
 * Fetch profile picture for a WhatsApp contact
 * @param connectionId The ID of the WhatsApp connection
 * @param phoneNumber The phone number of the contact
 * @param downloadAndSave Whether to download and save the image locally (default: true)
 * @returns URL to the profile picture or null if not available
 */
export async function fetchProfilePicture(connectionId: number, phoneNumber: string, downloadAndSave: boolean = true): Promise<string | null> {
  try {


    let sock = activeConnections.get(connectionId);
    if (!sock) {


      try {
        const connection = await storage.getChannelConnection(connectionId);
        if (!connection) {
          console.error(`Connection ${connectionId} not found in database`);
          return null;
        }

        await connectToWhatsApp(connectionId, connection.userId);

        await new Promise(resolve => setTimeout(resolve, 3000));

        sock = activeConnections.get(connectionId);
        if (!sock) {
          console.error(`Failed to establish WhatsApp connection for ID ${connectionId} after reconnection attempt`);
          return null;
        }


      } catch (reconnectError) {
        console.error(`Failed to reconnect WhatsApp connection ${connectionId}:`, reconnectError);
        return null;
      }
    }

    let jid = phoneNumber;

    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');

    if (!jid.includes('@')) {
      jid = `${cleanPhoneNumber}@s.whatsapp.net`;
    }



    try {
      const ppUrl = await sock.profilePictureUrl(jid, 'image');

      if (ppUrl) {


        if (!downloadAndSave) {

          return ppUrl;
        }

        const profilePicsDir = path.join(MEDIA_DIR, 'profile_pictures');
        await fsExtra.ensureDir(profilePicsDir);

        const sanitizedPhone = cleanPhoneNumber;
        const existingFiles = await fsExtra.readdir(profilePicsDir).catch(() => []);
        const existingFile = existingFiles.find(file => file.startsWith(`${sanitizedPhone}_`));

        if (existingFile) {
          const existingUrl = `/media/profile_pictures/${existingFile}`;

          return existingUrl;
        }

        const timestamp = Date.now();
        const filename = `${sanitizedPhone}_${timestamp}.jpg`;
        const filepath = path.join(profilePicsDir, filename);

        try {
          const response = await fetch(ppUrl);

          if (!response.ok) {
            console.error(`Failed to download profile picture: ${response.status} ${response.statusText}`);

            return ppUrl;
          }

          const buffer = await response.arrayBuffer();
          const nodeBuffer = Buffer.from(buffer);

          await fsExtra.writeFile(filepath, nodeBuffer);



          const publicUrl = `/media/profile_pictures/${filename}`;


          return publicUrl;
        } catch (downloadError) {
          console.error(`Error downloading profile picture for ${phoneNumber}:`, downloadError);

          return ppUrl;
        }
      } else {

        return null;
      }
    } catch (apiError: any) {
      if (apiError.message?.includes('item-not-found') || apiError.message?.includes('not-authorized')) {

      } else {
        console.error(`API error fetching profile picture for ${phoneNumber}:`, apiError.message);
      }
      return null;
    }
  } catch (error: any) {
    console.error(`Unexpected error fetching profile picture for ${phoneNumber}:`, error);
    return null;
  }
}

/**
 * Fetch group profile picture for a WhatsApp group
 * @param connectionId The ID of the WhatsApp connection
 * @param groupJid The JID of the group
 * @param downloadAndSave Whether to download and save the image locally (default: true)
 * @returns URL to the group profile picture or null if not available
 */
export async function fetchGroupProfilePicture(connectionId: number, groupJid: string, downloadAndSave: boolean = true): Promise<string | null> {
  try {




    const sock = activeConnections.get(connectionId);
    if (!sock) {
      console.error(`[fetchGroupProfilePicture] No active connection found for ID ${connectionId}`);
      return null;
    }



    try {
      const ppUrl = await sock.profilePictureUrl(groupJid, 'image');

      if (ppUrl) {


        if (!downloadAndSave) {

          return ppUrl;
        }

        const profilePicsDir = path.join(MEDIA_DIR, 'group_pictures');
        await fsExtra.ensureDir(profilePicsDir);

        const sanitizedGroupId = groupJid.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = Date.now();
        const filename = `${sanitizedGroupId}_${timestamp}.jpg`;
        const filepath = path.join(profilePicsDir, filename);

        const existingFiles = await fsExtra.readdir(profilePicsDir).catch(() => []);
        const oldFiles = existingFiles.filter(file => file.startsWith(`${sanitizedGroupId}_`));
        for (const oldFile of oldFiles) {
          await fsExtra.remove(path.join(profilePicsDir, oldFile)).catch(() => {});
        }

        try {
          const response = await fetch(ppUrl);

          if (!response.ok) {
            console.error(`Failed to download group profile picture: ${response.status} ${response.statusText}`);

            return ppUrl;
          }

          const buffer = await response.arrayBuffer();
          const nodeBuffer = Buffer.from(buffer);

          await fsExtra.writeFile(filepath, nodeBuffer);



          const publicUrl = `/media/group_pictures/${filename}`;


          return publicUrl;
        } catch (downloadError) {
          console.error(`Error downloading group profile picture for ${groupJid}:`, downloadError);

          return ppUrl;
        }
      } else {

        return null;
      }
    } catch (apiError: any) {
      if (apiError.message?.includes('item-not-found') || apiError.message?.includes('not-authorized')) {

      } else {
        console.error(`API error fetching group profile picture for ${groupJid}:`, apiError.message);
      }
      return null;
    }
  } catch (error: any) {
    console.error(`Unexpected error fetching group profile picture for ${groupJid}:`, error);
    return null;
  }
}

/**
 * Get profile picture URL for a WhatsApp contact (without downloading)
 * @param connectionId The ID of the WhatsApp connection
 * @param phoneNumber The phone number of the contact
 * @returns Direct URL to the profile picture or null if not available
 */
export async function getProfilePictureUrl(connectionId: number, phoneNumber: string): Promise<string | null> {
  try {


    const sock = activeConnections.get(connectionId);
    if (!sock) {
      console.error(`No active connection found for ID ${connectionId}`);
      return null;
    }

    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const jid = `${cleanPhoneNumber}@s.whatsapp.net`;



    try {
      const ppUrl = await sock.profilePictureUrl(jid, 'image');

      if (ppUrl) {

        return ppUrl;
      } else {

        return null;
      }
    } catch (apiError: any) {
      if (apiError.message?.includes('item-not-found') || apiError.message?.includes('not-authorized')) {

      } else {
      }
      return null;
    }
  } catch (error: any) {
    return null;
  }
}

/**
 * Fetch profile pictures for multiple participants in a group
 * @param connectionId The ID of the WhatsApp connection
 * @param participantJids Array of participant JIDs
 * @param downloadAndSave Whether to download and save images locally (default: false for performance)
 * @returns Map of JID to profile picture URL
 */
export async function fetchParticipantProfilePictures(
  connectionId: number,
  participantJids: string[],
  downloadAndSave: boolean = false
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  try {


    const sock = activeConnections.get(connectionId);
    if (!sock) {
      console.error(`No active connection found for ID ${connectionId}`);
      return results;
    }

    const batchSize = 5;
    for (let i = 0; i < participantJids.length; i += batchSize) {
      const batch = participantJids.slice(i, i + batchSize);

      await Promise.all(batch.map(async (jid) => {
        try {
          const phoneNumber = jid.split('@')[0];
          let profilePictureUrl: string | null = null;

          if (downloadAndSave) {
            profilePictureUrl = await fetchProfilePicture(connectionId, phoneNumber, true);
          } else {
            profilePictureUrl = await getProfilePictureUrl(connectionId, phoneNumber);
          }

          results.set(jid, profilePictureUrl);

        } catch (error) {
          console.error(`Error fetching profile picture for ${jid}:`, error);
          results.set(jid, null);
        }
      }));

      if (i + batchSize < participantJids.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }


    return results;
  } catch (error: any) {
    console.error(`Error fetching participant profile pictures:`, error);
    return results;
  }
}

/**
 * Get profile picture URL for a participant by JID (optimized for group participants)
 * @param connectionId The ID of the WhatsApp connection
 * @param participantJid The JID of the participant (e.g., "1234567890@s.whatsapp.net")
 * @returns Direct URL to the profile picture or null if not available
 */
export async function getParticipantProfilePictureUrl(connectionId: number, participantJid: string): Promise<string | null> {
  try {


    const sock = activeConnections.get(connectionId);
    if (!sock) {
      console.error(`No active connection found for ID ${connectionId}`);
      return null;
    }

    try {
      const ppUrl = await sock.profilePictureUrl(participantJid, 'image');

      if (ppUrl) {

        return ppUrl;
      } else {

        return null;
      }
    } catch (apiError: any) {
      if (apiError.message?.includes('item-not-found') || apiError.message?.includes('not-authorized')) {

      } else {
        console.error(`API error fetching participant profile picture URL for ${participantJid}:`, apiError.message);
      }
      return null;
    }
  } catch (error: any) {
    console.error(`Unexpected error fetching participant profile picture URL for ${participantJid}:`, error);
    return null;
  }
}

/**
 * Check and recover lost WhatsApp connections
 * This function checks if database connections exist but are not in the active connections map
 */
export async function checkAndRecoverConnections(): Promise<void> {
  try {


    const allConnections = await storage.getChannelConnections(null);
    const whatsappConnections = allConnections.filter(conn =>
      (conn.channelType === 'whatsapp' || conn.channelType === 'whatsapp_unofficial') &&
      conn.status === 'active'
    );

    let recoveredCount = 0;

    for (const connection of whatsappConnections) {
      if (!activeConnections.has(connection.id)) {


        const sessionDir = path.join(SESSION_DIR, `session-${connection.id}`);
        const hasCredsFile = fs.existsSync(sessionDir) && fs.existsSync(path.join(sessionDir, 'creds.json'));

        if (hasCredsFile) {
          try {
            await connectToWhatsApp(connection.id, connection.userId);
            recoveredCount++;

          } catch (error) {
            console.error(`Failed to recover WhatsApp connection ${connection.id}:`, error);
            await storage.updateChannelConnectionStatus(connection.id, 'error');
          }
        } else {

          await storage.updateChannelConnectionStatus(connection.id, 'disconnected');
        }
      }
    }


  } catch (error) {
    console.error('Error during connection recovery check:', error);
  }
}

/**
 * Auto-reconnect all eligible WhatsApp connections on server start
 * Uses work queue with pool size instead of fixed stagger (Comment 6)
 * This function should be called once during server initialization
 */
export async function autoReconnectWhatsAppSessions(): Promise<void> {
  try {
    const allConnections = await storage.getChannelConnections(null);

    const whatsappConnections = allConnections.filter(conn =>
      conn.channelType === 'whatsapp' ||
      conn.channelType === 'whatsapp_unofficial'
    );

    if (whatsappConnections.length === 0) {
      return;
    }


    const lastAttempted = new Map<number, number>();

    const eligibleConnections = whatsappConnections.filter(conn => {
      const sessionDir = path.join(SESSION_DIR, `session-${conn.id}`);
      const sessionDirExists = fs.existsSync(sessionDir);

      const hasCredsFile = sessionDirExists && fs.existsSync(path.join(sessionDir, 'creds.json'));

      const hasValidStatus = conn.status &&
        conn.status !== 'error' &&
        conn.status !== 'logged_out' &&
        conn.status !== 'replaced';


      const lastAttempt = lastAttempted.get(conn.id);
      if (lastAttempt && Date.now() - lastAttempt < 300000) {
        return false;
      }

      return hasValidStatus || hasCredsFile;
    });


    for (const connection of eligibleConnections) {
      reconnectQueue.push({
        connectionId: connection.id,
        connection: connection,
        priority: connection.status === 'active' ? 1 : 2, // Active connections have higher priority
        addedAt: Date.now()
      });
    }


    if (!reconnectQueueProcessing && reconnectQueue.length > 0) {
      reconnectQueueProcessing = true;
      processReconnectQueue();
    }


  } catch (error) {
    console.error('Error during WhatsApp auto-reconnection:', error);
  }
}

/**
 * Process reconnect queue with pool size limit (Comment 6)
 */
async function processReconnectQueue(): Promise<void> {
  while (reconnectQueue.length > 0 || activeReconnections > 0) {

    while (activeReconnections < reconnectPoolSize && reconnectQueue.length > 0) {

      reconnectQueue.sort((a, b) => a.priority - b.priority);
      
      const task = reconnectQueue.shift();
      if (!task) break;

      activeReconnections++;
      const taskStartTime = Date.now();
      

      const jitter = (Math.random() * 4000) - 2000; // -2s to +2s
      
      setTimeout(async () => {
        try {
          await connectToWhatsApp(task.connectionId, task.connection.userId);
          const duration = Date.now() - taskStartTime;

        } catch (error) {
          console.error(`Failed to auto-reconnect WhatsApp connection ${task.connectionId}:`, error);
          await storage.updateChannelConnectionStatus(task.connectionId, 'error');
        } finally {
          activeReconnections--;

          setImmediate(() => processReconnectQueue());
        }
      }, Math.max(0, jitter));
    }


    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  reconnectQueueProcessing = false;

}

/**
 * Scrape WhatsApp contacts by checking sequential phone numbers with real-time progress updates
 * @param connectionId The WhatsApp connection ID
 * @param startingNumber The starting phone number (digits only)
 * @param count Number of sequential numbers to check
 * @param progressCallback Callback function for real-time progress updates
 * @returns Object containing valid numbers and scraping results
 */
export async function scrapeWhatsAppContactsWithProgress(
  connectionId: number,
  startingNumber: string,
  count: number,
  progressCallback: (update: any) => void
): Promise<{
  validNumbers: Array<{
    phoneNumber: string;
    jid: string;
    profilePicture?: string;
    name?: string;
  }>;
  totalChecked: number;
  errors: string[];
}> {
  const validNumbers: Array<{
    phoneNumber: string;
    jid: string;
    profilePicture?: string;
    name?: string;
  }> = [];
  const errors: string[] = [];
  let totalChecked = 0;

  try {

    const sock = activeConnections.get(connectionId);
    if (!sock) {
      throw new Error(`No active WhatsApp connection found for ID ${connectionId}`);
    }

    if (!sock.user?.id) {
      throw new Error('WhatsApp connection is not properly authenticated');
    }

    const startingNum = BigInt(startingNumber);


    const batchSize = 10;
    const delay = 2000; // 2 seconds between batches

    for (let i = 0; i < count; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, count);
      const batch: string[] = [];


      for (let j = i; j < batchEnd; j++) {
        const currentNum = (startingNum + BigInt(j)).toString();
        batch.push(currentNum);
      }


      progressCallback({
        type: 'batch_started',
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(count / batchSize),
        batchSize: batch.length,
        totalChecked,
        validCount: validNumbers.length
      });

      try {

        for (const phoneNumber of batch) {
          try {
            totalChecked++;


            progressCallback({
              type: 'checking_number',
              phoneNumber,
              totalChecked,
              validCount: validNumbers.length,
              progress: Math.round((totalChecked / count) * 100)
            });


            const jid = `${phoneNumber}@s.whatsapp.net`;


            const results = await sock.onWhatsApp(jid);
            const result = results && results.length > 0 ? results[0] : null;

            if (result && result.exists) {
              const validContact: {
                phoneNumber: string;
                jid: string;
                profilePicture?: string;
                name?: string;
              } = {
                phoneNumber,
                jid: result.jid || jid
              };


              try {
                const profilePicUrl = await sock.profilePictureUrl(result.jid || jid, 'image');
                if (profilePicUrl) {
                  validContact.profilePicture = profilePicUrl;
                }
              } catch (profileError) {

              }


              try {
                const contactInfo = await sock.getBusinessProfile(result.jid || jid);
                if (contactInfo?.description) {
                  validContact.name = contactInfo.description;
                }
              } catch (nameError) {

              }

              validNumbers.push(validContact);


              progressCallback({
                type: 'contact_found',
                contact: validContact,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / count) * 100)
              });
            } else {

              progressCallback({
                type: 'number_invalid',
                phoneNumber,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / count) * 100)
              });
            }


            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (numberError) {
            const errorMsg = `Error checking ${phoneNumber}: ${numberError instanceof Error ? numberError.message : 'Unknown error'}`;
            errors.push(errorMsg);


            progressCallback({
              type: 'number_error',
              phoneNumber,
              error: errorMsg,
              totalChecked,
              validCount: validNumbers.length,
              errorCount: errors.length,
              progress: Math.round((totalChecked / count) * 100)
            });
          }
        }


        progressCallback({
          type: 'batch_completed',
          batchNumber: Math.floor(i / batchSize) + 1,
          totalBatches: Math.ceil(count / batchSize),
          totalChecked,
          validCount: validNumbers.length,
          errorCount: errors.length
        });


        if (i + batchSize < count) {
          progressCallback({
            type: 'batch_delay',
            message: `Waiting ${delay}ms before next batch...`,
            nextBatchNumber: Math.floor(i / batchSize) + 2,
            totalBatches: Math.ceil(count / batchSize)
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (batchError) {
        const errorMsg = `Error processing batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`;
        errors.push(errorMsg);

        progressCallback({
          type: 'batch_error',
          batchNumber: Math.floor(i / batchSize) + 1,
          error: errorMsg,
          totalChecked,
          validCount: validNumbers.length,
          errorCount: errors.length
        });
      }
    }

    return {
      validNumbers,
      totalChecked,
      errors
    };

  } catch (error) {
    const errorMsg = `WhatsApp scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    errors.push(errorMsg);

    progressCallback({
      type: 'scraping_error',
      error: errorMsg,
      totalChecked,
      validCount: validNumbers.length,
      errorCount: errors.length
    });

    return {
      validNumbers,
      totalChecked,
      errors
    };
  }
}

/**
 * Scrape WhatsApp contacts by checking sequential phone numbers (legacy version without progress)
 * @param connectionId The WhatsApp connection ID
 * @param startingNumber The starting phone number (digits only)
 * @param count Number of sequential numbers to check
 * @returns Object containing valid numbers and scraping results
 */
export async function scrapeWhatsAppContacts(
  connectionId: number,
  startingNumber: string,
  count: number
): Promise<{
  validNumbers: Array<{
    phoneNumber: string;
    jid: string;
    profilePicture?: string;
    name?: string;
  }>;
  totalChecked: number;
  errors: string[];
}> {
  const validNumbers: Array<{
    phoneNumber: string;
    jid: string;
    profilePicture?: string;
    name?: string;
  }> = [];
  const errors: string[] = [];
  let totalChecked = 0;

  try {

    const sock = activeConnections.get(connectionId);
    if (!sock) {
      throw new Error(`No active WhatsApp connection found for ID ${connectionId}`);
    }

    if (!sock.user?.id) {
      throw new Error('WhatsApp connection is not properly authenticated');
    }

    const startingNum = BigInt(startingNumber);


    const batchSize = 10;
    const delay = 2000; // 2 seconds between batches

    for (let i = 0; i < count; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, count);
      const batch: string[] = [];


      for (let j = i; j < batchEnd; j++) {
        const currentNum = (startingNum + BigInt(j)).toString();
        batch.push(currentNum);
      }

      try {

        for (const phoneNumber of batch) {
          try {
            totalChecked++;


            const jid = `${phoneNumber}@s.whatsapp.net`;


            const results = await sock.onWhatsApp(jid);
            const result = results && results.length > 0 ? results[0] : null;

            if (result && result.exists) {
              const validContact: {
                phoneNumber: string;
                jid: string;
                profilePicture?: string;
                name?: string;
              } = {
                phoneNumber,
                jid: result.jid || jid
              };


              try {
                const profilePicUrl = await sock.profilePictureUrl(result.jid || jid, 'image');
                if (profilePicUrl) {
                  validContact.profilePicture = profilePicUrl;
                }
              } catch (profileError) {

              }


              try {
                const contactInfo = await sock.getBusinessProfile(result.jid || jid);
                if (contactInfo?.description) {
                  validContact.name = contactInfo.description;
                }
              } catch (nameError) {

              }

              validNumbers.push(validContact);
            }


            await new Promise(resolve => setTimeout(resolve, 500));

          } catch (numberError) {
            const errorMsg = `Error checking ${phoneNumber}: ${numberError instanceof Error ? numberError.message : 'Unknown error'}`;
            errors.push(errorMsg);
          }
        }


        if (i + batchSize < count) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

      } catch (batchError) {
        const errorMsg = `Error processing batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`;
        errors.push(errorMsg);
      }
    }

    return {
      validNumbers,
      totalChecked,
      errors
    };

  } catch (error) {
    const errorMsg = `WhatsApp scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    errors.push(errorMsg);

    return {
      validNumbers,
      totalChecked,
      errors
    };
  }
}

/**
 * Get poll context cache for debugging
 */
export function getPollContextCache() {
  return Array.from(pollContextCache.entries()).map(([key, value]) => ({
    pollId: key,
    ...value
  }));
}

/**
 * Send a WhatsApp Poll (unofficial API via Baileys)
 * Falls back to text if sending fails
 */
export async function sendWhatsAppPoll(
  connectionId: number,
  userId: number,
  to: string,
  poll: { name: string; values: string[]; selectableCount?: number }
): Promise<any> {
  const sock = activeConnections.get(connectionId);
  if (!sock) throw new Error('WhatsApp connection not active');
  const phoneNumber = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  const selectableCount = poll.selectableCount || 1;

  try {

    const pollMessage = {
      poll: {
        name: poll.name,
        values: poll.values,
        selectableCount
      }
    };

    const sent = await sock.sendMessage(phoneNumber, pollMessage as any);




    if (sent?.key?.id) {

      const pollId = sent.key.id;
      const pollCreationMessage = sent?.message?.pollCreationMessage || sent?.message?.pollCreationMessageV3;
      const messageSecret = sent?.message?.messageContextInfo?.messageSecret;

      const pollContext = {
        pollName: poll.name,
        pollOptions: poll.values,
        selectableCount,
        createdAt: Date.now(),
        pollCreationMessage: pollCreationMessage,

        pollMsgId: pollId,
        pollCreatorJid: to,
        pollEncKey: messageSecret,

        sentMessage: sent?.message
      };

      pollContextCache.set(pollId, pollContext);



      try {
        const { storage } = await import('../../storage');


        const phone = phoneNumber.replace('@s.whatsapp.net', '');


        const channelConnection = await storage.getChannelConnection(connectionId);
        if (!channelConnection || !channelConnection.companyId) {

          return sent;
        }


        const contact = await storage.getContactByPhone(phone, channelConnection.companyId);
        if (!contact) {
          return sent;
        }


        const conversation = await storage.getConversationByContactAndChannel(contact.id, connectionId);

        if (conversation) {


          await storage.createMessage({
            conversationId: conversation.id,
            externalId: pollId,
            direction: 'outbound',
            type: 'poll',
            content: poll.name,
            metadata: JSON.stringify({
              messageId: pollId,
              messageType: 'poll',
              pollContext: {
                pollName: poll.name,
                pollOptions: poll.values,
                selectableCount
              },
              whatsappMessage: {
                key: sent.key,
                message: sent.message,
                messageTimestamp: sent.messageTimestamp
              }
            }),
            isFromBot: true,
            status: 'sent'
          });


        }
      } catch (dbError) {
        console.error('Failed to store poll context in database (non-critical):', dbError);

      }
    }

    return sent;
  } catch (err) {
    console.error('Failed to send poll, falling back to text:', err);

    const fallback = `${poll.name}\n\n${poll.values.map((v, i) => `${i + 1}. ${v}`).join('\n')}`;
    return await sendWhatsAppMessage(connectionId, userId, to, fallback, true);
  }
}

export default {
  connect: connectToWhatsApp,
  disconnect: disconnectWhatsApp,
  sendMessage: sendWhatsAppMessage,
  sendWhatsAppMessage,
  sendAudioMessage: sendWhatsAppAudioMessage,
  sendWhatsAppAudioMessage,
  sendQuotedMessage,
  sendMedia: sendWhatsAppMediaMessage,
  sendMediaMessage: sendWhatsAppMediaMessage,
  sendWhatsAppMediaMessage,
  sendPoll: sendWhatsAppPoll,
  getActiveConnections,
  isConnectionActive,
  fetchProfilePicture,
  fetchGroupProfilePicture,
  getProfilePictureUrl,
  fetchParticipantProfilePictures,
  getParticipantProfilePictureUrl,
  subscribeToEvents: subscribeToWhatsAppEvents,
  autoReconnect: autoReconnectWhatsAppSessions,
  checkAndRecover: checkAndRecoverConnections,
  configureTypingBehavior,
  getTypingConfiguration,
  configureMessageSplitting,
  getMessageSplittingConfiguration,
  getEnhancedGroupMetadata,
  configureMessageDebouncing,
  getMessageDebouncingConfiguration,
  getDebouncingStatus,
  getConnectionDiagnostics,
  cancelQueuedMessages,
  scrapeWhatsAppContacts,
  scrapeWhatsAppContactsWithProgress,
  getQueueStatus: (phoneNumber: string, connectionId: number) => {
    const queueKey = getQueueKey(phoneNumber, connectionId);
    const userQueue = messageQueues.get(queueKey);
    return {
      hasQueue: !!userQueue,
      queueLength: userQueue?.length || 0,
      messages: userQueue?.map(msg => ({
        id: msg.id,
        chunksTotal: msg.chunks.length,
        currentChunkIndex: msg.currentChunkIndex,
        scheduledTimeouts: msg.timeoutIds.length,
        createdAt: msg.createdAt
      })) || []
    };
  },
  testMessageSplitting: (message: string) => {
    const chunks = splitMessage(message);
    return {
      originalLength: message.length,
      chunks: chunks.map((chunk, index) => ({
        index: index + 1,
        text: chunk,
        length: chunk.length
      })),
      totalChunks: chunks.length,
      config: MESSAGE_SPLITTING_CONFIG
    };
  },
  startManualHistorySync,
  startManualHistorySyncSimple,
  eventEmitter: pooledEmitter
};

/**
 * Start manual history sync for a WhatsApp connection
 * First tries Baileys fetchMessageHistory, falls back to reconnection method
 */
async function startManualHistorySync(connectionId: number, userId: number): Promise<void> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (!connection.historySyncEnabled) {
      throw new Error('History sync is not enabled for this connection');
    }

    const sock = activeConnections.get(connectionId);
    if (!sock) {
      throw new Error('WhatsApp connection is not active');
    }


    const connectionState = getConnectionState(connectionId);
    if (connectionState?.status !== 'connected') {
      throw new Error('WhatsApp connection is not ready. Please ensure the connection is active.');
    }



    await storage.updateChannelConnection(connectionId, {
      historySyncStatus: 'syncing',
      historySyncProgress: 0,
      historySyncTotal: 0
    });

    const manualSyncUser = await storage.getUser(userId);
    const batchId = `${connectionId}-${Date.now()}-manual`;

    if (manualSyncUser?.companyId) {
      await storage.createHistorySyncBatch({
        connectionId,
        companyId: manualSyncUser.companyId,
        batchId,
        syncType: 'manual',
        totalMessages: 0,
        totalChats: 0,
        totalContacts: 0
      });
    }


    emitWhatsAppEvent('historySyncProgress', {
      connectionId,
      companyId: manualSyncUser?.companyId,
      progress: 0,
      total: 0,
      status: 'syncing'
    });

    try {






      if (typeof (sock as any).fetchMessageHistory !== 'function') {




        throw new Error('fetchMessageHistory not available - using reconnection method');
      }






      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const timestampFilter = Math.floor(sevenDaysAgo.getTime() / 1000);





      const historyResult = await (sock as any).fetchMessageHistory(50, undefined, timestampFilter);

      
      if (historyResult && (historyResult.messages?.length > 0 || historyResult.chats?.length > 0)) {

        await processHistorySyncData(connectionId, userId, {
          chats: historyResult.chats || [],
          contacts: historyResult.contacts || [],
          messages: historyResult.messages || [],
          batchId
        });

        await storage.updateChannelConnection(connectionId, {
          historySyncStatus: 'completed',
          historySyncProgress: (historyResult.chats?.length || 0) + (historyResult.messages?.length || 0),
          lastHistorySyncAt: new Date()
        });

        emitWhatsAppEvent('historySyncComplete', {
          connectionId,
          companyId: manualSyncUser?.companyId,
          batchId,
          totalChats: historyResult.chats?.length || 0,
          totalMessages: historyResult.messages?.length || 0,
          totalContacts: historyResult.contacts?.length || 0
        });


      } else {

        await storage.updateChannelConnection(connectionId, {
          historySyncStatus: 'completed',
          historySyncProgress: 0,
          lastHistorySyncAt: new Date()
        });

        emitWhatsAppEvent('historySyncComplete', {
          connectionId,
          companyId: manualSyncUser?.companyId,
          batchId,
          totalChats: 0,
          totalMessages: 0,
          totalContacts: 0
        });


      }

    } catch (fetchError) {
      console.error('Error fetching message history:', fetchError);
      console.error('Fetch error details:', {
        name: (fetchError as any)?.name,
        message: (fetchError as any)?.message,
        stack: (fetchError as any)?.stack
      });




      try {
        await storage.updateChannelConnection(connectionId, {
          historySyncEnabled: true,
          historySyncStatus: 'syncing'
        });


        if (sock && typeof sock.end === 'function') {
          sock.end(undefined);
        }


        await cleanupConnection(connectionId);
        activeConnections.delete(connectionId);


        await new Promise(resolve => setTimeout(resolve, 3000));


        await connectToWhatsApp(connectionId, userId);


      } catch (reconnectError) {
        console.error('Error in fallback reconnection:', reconnectError);
        throw reconnectError;
      }
    }

  } catch (error) {
    console.error('Error starting manual history sync:', error);
    await storage.updateChannelConnection(connectionId, {
      historySyncStatus: 'failed',
      historySyncError: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Simple manual history sync using reconnection method
 * This is more reliable than fetchMessageHistory which may not be available
 */
async function startManualHistorySyncSimple(connectionId: number, userId: number): Promise<void> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (!connection.historySyncEnabled) {
      throw new Error('History sync is not enabled for this connection');
    }

    const sock = activeConnections.get(connectionId);
    if (!sock) {
      throw new Error('WhatsApp connection is not active');
    }



    await storage.updateChannelConnection(connectionId, {
      historySyncStatus: 'syncing',
      historySyncProgress: 0,
      historySyncTotal: 0
    });

    const manualSyncUser = await storage.getUser(userId);
    const batchId = `${connectionId}-${Date.now()}-manual`;

    if (manualSyncUser?.companyId) {
      await storage.createHistorySyncBatch({
        connectionId,
        companyId: manualSyncUser.companyId,
        batchId,
        syncType: 'manual',
        totalMessages: 0,
        totalChats: 0,
        totalContacts: 0
      });
    }


    emitWhatsAppEvent('historySyncProgress', {
      connectionId,
      companyId: manualSyncUser?.companyId,
      progress: 0,
      total: 0,
      status: 'syncing'
    });




    await storage.updateChannelConnection(connectionId, {
      historySyncEnabled: true,
      historySyncStatus: 'syncing'
    });

    if (sock && typeof sock.end === 'function') {
      sock.end(undefined);
    }

    await cleanupConnection(connectionId);
    activeConnections.delete(connectionId);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await connectToWhatsApp(connectionId, userId);



  } catch (error) {
    console.error('Error starting simple manual history sync:', error);
    await storage.updateChannelConnection(connectionId, {
      historySyncStatus: 'failed',
      historySyncError: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Process history sync data from Baileys
 */
async function processHistorySyncData(
  connectionId: number,
  userId: number,
  data: {
    chats: any[];
    contacts: any[];
    messages: any[];
    batchId: string;
  }
): Promise<void> {
  try {
    const { chats, contacts, messages, batchId } = data;
    const user = await storage.getUser(userId);
    const companyId = user?.companyId;

    if (!companyId) {
      throw new Error('User company not found');
    }

    let processedContacts = 0;
    let processedChats = 0;
    let processedMessages = 0;
    const totalItems = contacts.length + chats.length + messages.length;
    let totalProcessed = 0;

    const emitProgress = () => {
      emitWhatsAppEvent('historySyncProgress', {
        connectionId,
        companyId,
        progress: totalProcessed,
        total: totalItems,
        status: 'syncing'
      });
    };

    for (const contact of contacts) {
      try {
        if (contact.id && !contact.id.includes('@broadcast')) {
          const phoneNumber = contact.id.split('@')[0];

          let existingContact = await storage.getContactByIdentifier(phoneNumber, 'whatsapp');

          if (!existingContact) {
            const contactData = {
              companyId,
              name: contact.name || contact.notify || phoneNumber,
              phone: phoneNumber,
              email: null,
              avatarUrl: null,
              identifier: phoneNumber,
              identifierType: 'whatsapp' as const,
              source: 'whatsapp' as const,
              notes: null,
              isHistorySync: true,
              historySyncBatchId: batchId
            };

            existingContact = await storage.getOrCreateContact(contactData);
            processedContacts++;
          }
        }
        totalProcessed++;
        if (totalProcessed % 10 === 0) {
          emitProgress();
        }
      } catch (error) {
        console.error('Error processing contact:', error);
        totalProcessed++;
      }
    }

    for (const chat of chats) {
      try {
        if (chat.id && !chat.id.includes('@broadcast')) {
          const phoneNumber = chat.id.split('@')[0];
          let contact = await storage.getContactByIdentifier(phoneNumber, 'whatsapp');

          if (!contact) {
            const contactData = {
              companyId,
              name: chat.name || phoneNumber,
              phone: phoneNumber,
              email: null,
              avatarUrl: null,
              identifier: phoneNumber,
              identifierType: 'whatsapp' as const,
              source: 'whatsapp' as const,
              notes: null,
              isHistorySync: true,
              historySyncBatchId: batchId
            };

            contact = await storage.getOrCreateContact(contactData);
          }

          const existingConversation = await storage.getConversationByContactAndChannel(
            contact.id,
            connectionId
          );

          if (!existingConversation) {
            const connection = await storage.getChannelConnection(connectionId);
            const channelType = connection?.channelType || 'whatsapp_unofficial';

            const conversationData = {
              companyId,
              contactId: contact.id,
              channelId: connectionId,
              channelType,
              status: 'active' as const,
              lastMessageAt: chat.conversationTimestamp ?
                new Date(typeof chat.conversationTimestamp === 'object' ?
                  chat.conversationTimestamp.toNumber() : Number(chat.conversationTimestamp)) :
                new Date(),
              isHistorySync: true,
              historySyncBatchId: batchId
            };

            await storage.createConversation(conversationData);
            processedChats++;
          }
        }
        totalProcessed++;
        if (totalProcessed % 10 === 0) {
          emitProgress();
        }
      } catch (error) {
        console.error('Error processing chat:', error);
        totalProcessed++;
      }
    }


    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

    for (const message of messages) {
      try {

        if (message.messageTimestamp) {
          const messageTimestamp = typeof message.messageTimestamp === 'object'
            ? message.messageTimestamp.toNumber()
            : Number(message.messageTimestamp);

          if (messageTimestamp < sevenDaysAgoTimestamp) {
            totalProcessed++;
            continue;
          }
        }

        await handleIncomingMessage(message, connectionId, userId, true, batchId);
        processedMessages++;
        totalProcessed++;
        if (totalProcessed % 10 === 0) {
          emitProgress();
        }
      } catch (error) {
        console.error('Error processing history message:', error);
        totalProcessed++;
      }
    }

    emitProgress();

    await storage.updateHistorySyncBatch(batchId, {
      processedContacts,
      processedChats,
      processedMessages,
      status: 'completed',
      completedAt: new Date()
    });



  } catch (error) {
    console.error('Error processing history sync data:', error);

    await storage.updateHistorySyncBatch(data.batchId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}
