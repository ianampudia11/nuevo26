import { storage } from '../../storage';
import { getCachedCompanySetting, getCachedInitialPipelineStage } from '../../utils/pipeline-cache';
import {
  InsertMessage,
  InsertConversation,
  InsertContact,
  ChannelConnection as SchemaChannelConnection,
} from '@shared/schema';
import { EventEmitter } from 'events';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { logger } from '../../utils/logger';


let TelegramClient: any = null;
let Api: any = null;
let StringSession: any = null;

try {
  const { TelegramClient: TC, Api: TApi } = require('telegram');
  const { StringSession: SS } = require('telegram/sessions');

  TelegramClient = TC;
  Api = TApi;
  StringSession = SS;

  logger.info('telegram', 'GramJS loaded successfully - QR code authentication available');
} catch (telegramError) {

  logger.warn('telegram', 'GramJS not available, advanced Telegram features disabled');
}

interface TelegramConnectionData {
  botToken?: string;
  apiId?: string;
  apiHash?: string;
  sessionString?: string;
  webhookUrl?: string;
  verifyToken?: string;
  botInfo?: any;
  lastConnectedAt?: string;
  lastValidatedAt?: string;
}

interface ChannelConnection {
  id: number;
  userId: number;
  companyId: number;
  accessToken?: string | null;
  connectionData?: TelegramConnectionData | Record<string, any> | null;
  channelType: 'telegram' | string;
  status: 'connected' | 'disconnected' | 'error' | 'pending' | string;
}

interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  botInfo: any | null;
  client: any | null;
}

interface TelegramWebhookUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: 'private' | 'group' | 'supergroup' | 'channel';
      first_name?: string;
      last_name?: string;
      username?: string;
      title?: string;
    };
    date: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    video?: {
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      duration: number;
      file_size?: number;
    };
    audio?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      file_size?: number;
    };
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      file_size?: number;
    };
    caption?: string;
  };
}

type Contact = ReturnType<typeof storage.createContact> extends Promise<infer T> ? T : any;
type Conversation = ReturnType<typeof storage.createConversation> extends Promise<infer T> ? T : any;

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const eventEmitter = new EventEmitter();


eventEmitter.setMaxListeners(50);


import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
eventEmitterMonitor.register('telegram-service', eventEmitter);

const TELEGRAM_API_URL = 'https://api.telegram.org';

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
      botInfo: null,
      client: null
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
    state.lastError = null;
  } else {
    state.errorCount++;
    state.lastError = error || 'Unknown error';
  }
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
 * Verify webhook signature for Telegram
 */
export function verifyWebhookSignature(payload: string, signature: string, botToken: string): boolean {
  try {
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const expectedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(payload, 'utf8')
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    logger.error('telegram', 'Error verifying Telegram webhook signature:', error);
    return false;
  }
}

/**
 * Verify webhook signature against any configured Telegram connection
 */
async function verifyWebhookSignatureForAnyConnection(payload: string, signature: string): Promise<boolean> {
  try {
    const connections = await storage.getChannelConnections(null) as ChannelConnection[];
    const telegramConnections = connections.filter(conn => conn.channelType === 'telegram');

    for (const connection of telegramConnections) {
      const connectionData = connection.connectionData as TelegramConnectionData;
      if (connectionData?.botToken) {
        const isValid = verifyWebhookSignature(payload, signature, connectionData.botToken);
        if (isValid) {
          logger.info('telegram', `Webhook signature verified for connection ${connection.id}`);
          return true;
        }
      }
    }

    logger.warn('telegram', 'Webhook signature could not be verified against any connection');
    return false;
  } catch (error) {
    logger.error('telegram', 'Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Generate QR code for Telegram authentication
 */
export async function generateQRCode(connectionId: number, userId: number): Promise<{ qrCode: string; loginToken: string }> {
  try {
    logger.info('telegram', `Generating QR code for connection ${connectionId} by user ${userId}`);


    if (!TelegramClient || !Api || !StringSession) {
      throw new Error('QR code authentication requires GramJS library. Please install with: npm install telegram');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.userId !== userId) {
      logger.error('telegram', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

    const connectionData = connection.connectionData as TelegramConnectionData;
    if (!connectionData?.apiId || !connectionData?.apiHash) {
      throw new Error('Telegram API credentials are missing');
    }

    const session = new StringSession('');
    const client = new TelegramClient(session, parseInt(connectionData.apiId), connectionData.apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    const loginToken = await client.invoke(new Api.auth.ExportLoginToken({
      apiId: parseInt(connectionData.apiId),
      apiHash: connectionData.apiHash,
      exceptIds: []
    }));


    let tokenData: Uint8Array;
    if ('token' in loginToken) {
      tokenData = loginToken.token as Uint8Array;
    } else if ('bytes' in loginToken) {
      tokenData = loginToken.bytes as Uint8Array;
    } else {
      throw new Error('Unable to extract token from login response');
    }

    const qrCode = `tg://login?token=${Buffer.from(tokenData).toString('base64url')}`;


    const state = getConnectionState(connectionId);
    state.client = client;

    logger.info('telegram', `QR code generated successfully for connection ${connectionId}`);

    return {
      qrCode,
      loginToken: Buffer.from(tokenData).toString('base64url')
    };
  } catch (error: any) {
    logger.error('telegram', `Error generating QR code for connection ${connectionId}:`, error.message);
    throw error;
  }
}

/**
 * Check QR code authentication status
 */
export async function checkQRAuthStatus(connectionId: number, userId: number): Promise<{ authenticated: boolean; sessionString?: string }> {
  try {

    if (!TelegramClient || !Api || !StringSession) {
      throw new Error('QR code authentication requires GramJS library');
    }

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }


    if (connection.userId !== userId) {
      throw new Error('Unauthorized access to channel connection');
    }

    const state = getConnectionState(connectionId);
    if (!state.client) {
      return { authenticated: false };
    }

    try {

      const me = await state.client.getMe();
      if (me) {
        const sessionString = state.client.session.save() as unknown as string;


        const updatedConnectionData = {
          ...(connection.connectionData as TelegramConnectionData || {}),
          sessionString,
          lastConnectedAt: new Date().toISOString(),
          lastValidatedAt: new Date().toISOString()
        };

        await storage.updateChannelConnection(connectionId, {
          connectionData: updatedConnectionData
        });

        logger.info('telegram', `QR authentication successful for connection ${connectionId}`);
        return { authenticated: true, sessionString };
      }
    } catch (error) {

      return { authenticated: false };
    }

    return { authenticated: false };
  } catch (error: any) {
    logger.error('telegram', `Error checking QR auth status for connection ${connectionId}:`, error.message);
    throw error;
  }
}

/**
 * Connect to Telegram using session string or bot token
 */
export async function connectToTelegram(connectionId: number, userId: number): Promise<void> {
  let currentConnection: ChannelConnection | null = null;
  try {
    logger.info('telegram', `Connecting to Telegram for connection ${connectionId} by user ${userId}`);

    const connectionResult = await storage.getChannelConnection(connectionId);
    if (!connectionResult) {
      throw new Error(`Connection with ID ${connectionId} not found`);
    }
    currentConnection = connectionResult as ChannelConnection;


    if (currentConnection.userId !== userId) {
      logger.error('telegram', `Unauthorized access attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }

    const connectionData = currentConnection.connectionData as TelegramConnectionData;


    const validationResult = await validateConnectionConfiguration(connectionData);
    if (!validationResult.success) {
      await storage.updateChannelConnectionStatus(connectionId, 'error');
      updateConnectionActivity(connectionId, false, validationResult.error);

      eventEmitter.emit('connectionError', {
        connectionId,
        error: validationResult.error
      });

      throw new Error(`Connection validation failed: ${validationResult.error}`);
    }


    await storage.updateChannelConnectionStatus(connectionId, 'connected');

    const updatedConnectionData: TelegramConnectionData = {
      ...(connectionData || {}),
      botInfo: validationResult.botInfo,
      lastConnectedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString()
    };

    await storage.updateChannelConnection(connectionId, {
      connectionData: updatedConnectionData as Record<string, any>,
    });

    activeConnections.set(connectionId, true);
    updateConnectionActivity(connectionId, true);

    logger.info('telegram', `Connection ${connectionId} established successfully for bot: ${validationResult.botInfo?.username}`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'connected',
      botInfo: validationResult.botInfo
    });
  } catch (error: unknown) {
    const baseMessage = `Error connecting to Telegram (ID: ${connectionId}):`;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', baseMessage, errorMessage);

    if (connectionId && (currentConnection || await storage.getChannelConnection(connectionId))) {
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        updateConnectionActivity(connectionId, false, errorMessage);
    }
    if (error instanceof Error) throw error;
    throw new Error(`${baseMessage} ${errorMessage}`);
  }
}

/**
 * Disconnect from Telegram
 */
export async function disconnectFromTelegram(connectionId: number, userId: number): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      logger.warn('telegram', `Connection ${connectionId} not found for disconnection`);
      return false;
    }


    if (connection.userId !== userId) {
      logger.error('telegram', `Unauthorized disconnect attempt to connection ${connectionId} by user ${userId}`);
      throw new Error('Unauthorized access to channel connection');
    }


    const state = getConnectionState(connectionId);
    if (state.client) {
      try {
        await state.client.disconnect();
      } catch (error) {
        logger.warn('telegram', `Error disconnecting Telegram client for connection ${connectionId}:`, error);
      }
      state.client = null;
    }

    activeConnections.delete(connectionId);
    updateConnectionActivity(connectionId, true);
    await storage.updateChannelConnectionStatus(connectionId, 'disconnected');

    logger.info('telegram', `Telegram connection ${connectionId} disconnected successfully`);

    eventEmitter.emit('connectionStatusUpdate', {
      connectionId,
      status: 'disconnected'
    });

    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', `Error disconnecting from Telegram (ID: ${connectionId}):`, errorMessage);
    return false;
  }
}

/**
 * Check if Telegram connection is active
 */
export function isTelegramConnectionActive(connectionId: number): boolean {
  return activeConnections.has(connectionId);
}

/**
 * Get active Telegram connections
 */
export function getActiveTelegramConnections(): number[] {
  return Array.from(activeConnections.keys());
}

/**
 * Validate Telegram connection configuration
 */
export async function validateConnectionConfiguration(
  connectionData: TelegramConnectionData
): Promise<{ success: boolean; error?: string; botInfo?: any }> {
  try {
    if (!connectionData?.botToken) {
      return { success: false, error: 'Bot token is required' };
    }


    const response = await axios.get(
      `${TELEGRAM_API_URL}/bot${connectionData.botToken}/getMe`,
      { timeout: 10000 }
    );

    if (response.status === 200 && response.data.ok) {
      return {
        success: true,
        botInfo: response.data.result
      };
    } else {
      return {
        success: false,
        error: 'Failed to validate bot token'
      };
    }
  } catch (error: any) {
    logger.error('telegram', 'Error validating Telegram connection:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      return {
        success: false,
        error: 'Invalid bot token - check your Telegram bot token'
      };
    } else if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Bot not found - check your bot token'
      };
    } else {
      return {
        success: false,
        error: error.response?.data?.description || error.message || 'Connection validation failed'
      };
    }
  }
}

/**
 * Test webhook configuration
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

    if (!url.pathname.includes('/api/webhooks/telegram')) {
      return { success: false, error: 'Webhook URL must point to /api/webhooks/telegram endpoint' };
    }


    const testParams = new URLSearchParams({
      'verify_token': verifyToken,
      'test': 'true'
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
    logger.error('telegram', 'Error testing webhook configuration:', error.message);
    return {
      success: false,
      error: error.code === 'ECONNREFUSED'
        ? 'Could not connect to webhook URL - check if server is accessible'
        : error.message || 'Webhook test failed'
    };
  }
}

/**
 * Send text message via Telegram
 */
export async function sendTelegramMessage(
  connectionId: number,
  to: string,
  message: string,
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

    const connectionData = connection.connectionData as TelegramConnectionData;
    if (!connectionData?.botToken) {
      return { success: false, error: 'Bot token is missing for this connection' };
    }

    const response = await axios.post(
      `${TELEGRAM_API_URL}/bot${connectionData.botToken}/sendMessage`,
      {
        chat_id: to,
        text: message,
        parse_mode: 'Markdown'
      },
      { timeout: 30000 }
    );

    if (response.status === 200 && response.data.ok) {
      updateConnectionActivity(connectionId, true);
      return { success: true, messageId: response.data.result.message_id.toString() };
    } else {
      const errorDetail = `Failed to send message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
      logger.error('telegram', errorDetail);
      updateConnectionActivity(connectionId, false, errorDetail);
      return { success: false, error: errorDetail };
    }
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Telegram message.';
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', 'Axios error sending Telegram message:', errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', 'Error sending Telegram message:', error.message);
    } else {
        logger.error('telegram', 'Unknown error sending Telegram message:', error);
    }
    updateConnectionActivity(connectionId, false, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send media message via Telegram
 */
export async function sendTelegramMediaMessage(
  connectionId: number,
  to: string,
  mediaUrl: string,
  mediaType: 'photo' | 'video' | 'document' | 'audio',
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

    const connectionData = connection.connectionData as TelegramConnectionData;
    if (!connectionData?.botToken) {
      return { success: false, error: 'Bot token is missing for this connection' };
    }

    let endpoint = '';
    let payload: any = {
      chat_id: to,
      caption: caption
    };

    switch (mediaType) {
      case 'photo':
        endpoint = 'sendPhoto';
        payload.photo = mediaUrl;
        break;
      case 'video':
        endpoint = 'sendVideo';
        payload.video = mediaUrl;
        break;
      case 'document':
        endpoint = 'sendDocument';
        payload.document = mediaUrl;
        break;
      case 'audio':
        endpoint = 'sendAudio';
        payload.audio = mediaUrl;
        break;
      default:
        return { success: false, error: `Unsupported media type: ${mediaType}` };
    }

    const response = await axios.post(
      `${TELEGRAM_API_URL}/bot${connectionData.botToken}/${endpoint}`,
      payload,
      { timeout: 30000 }
    );

    if (response.status === 200 && response.data.ok) {
      updateConnectionActivity(connectionId, true);
      return { success: true, messageId: response.data.result.message_id.toString() };
    } else {
      const errorDetail = `Failed to send media message: Status ${response.status}, Data: ${JSON.stringify(response.data)}`;
      logger.error('telegram', errorDetail);
      updateConnectionActivity(connectionId, false, errorDetail);
      return { success: false, error: errorDetail };
    }
  } catch (error: unknown) {
    let errorMessage = 'Failed to send Telegram media message.';
    if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', 'Axios error sending Telegram media message:', errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', 'Error sending Telegram media message:', error.message);
    } else {
        logger.error('telegram', 'Unknown error sending Telegram media message:', error);
    }
    updateConnectionActivity(connectionId, false, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Subscribe to Telegram events
 */
export function subscribeToTelegramEvents(callback: (event: string, data: any) => void): () => void {
  const listeners = {
    connectionStatusUpdate: callback.bind(null, 'connectionStatusUpdate'),
    connectionError: callback.bind(null, 'connectionError'),
    messageReceived: callback.bind(null, 'messageReceived')
  };

  eventEmitter.on('connectionStatusUpdate', listeners.connectionStatusUpdate);
  eventEmitter.on('connectionError', listeners.connectionError);
  eventEmitter.on('messageReceived', listeners.messageReceived);

  return () => {
    eventEmitter.off('connectionStatusUpdate', listeners.connectionStatusUpdate);
    eventEmitter.off('connectionError', listeners.connectionError);
    eventEmitter.off('messageReceived', listeners.messageReceived);
  };
}

/**
 * Get Telegram file URL
 */
async function getTelegramFileUrl(connection: SchemaChannelConnection, fileId: string): Promise<string | null> {
  try {
    const connectionData = connection.connectionData as TelegramConnectionData;
    if (!connectionData?.botToken) {
      return null;
    }

    const response = await axios.get(
      `${TELEGRAM_API_URL}/bot${connectionData.botToken}/getFile`,
      {
        params: { file_id: fileId },
        timeout: 10000
      }
    );

    if (response.status === 200 && response.data.ok) {
      const filePath = response.data.result.file_path;
      return `${TELEGRAM_API_URL}/file/bot${connectionData.botToken}/${filePath}`;
    }

    return null;
  } catch (error) {
    logger.error('telegram', `Error getting file URL for file ${fileId}:`, error);
    return null;
  }
}

/**
 * Process incoming Telegram message
 */
async function handleIncomingTelegramMessage(update: TelegramWebhookUpdate): Promise<void> {
  let connection: SchemaChannelConnection | null = null;

  try {
    logger.debug('telegram', 'Processing incoming Telegram message update');

    if (!update.message) {
      logger.debug('telegram', 'Skipping non-message update');
      return;
    }

    const message = update.message;
    const chatId = message.chat.id.toString();
    const senderId = message.from.id.toString();


    const connections = await storage.getChannelConnections(null) as SchemaChannelConnection[];
    connection = connections.find(conn => {
      return conn.channelType === 'telegram' && conn.status === 'connected';
    }) || null;

    if (!connection) {
      logger.warn('telegram', `No active Telegram connection found for chat ${chatId}`);
      return;
    }


    if (!connection.companyId) {
      logger.error('telegram', `Connection ${connection.id} missing companyId - security violation`);
      return;
    }


    let contact = await storage.getContactByPhone(senderId, connection.companyId) as Contact | null;
    if (!contact) {
      const contactName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') ||
                         message.from.username ||
                         `Telegram User ${senderId.substring(0, 6)}...`;

      const insertContactData: InsertContact = {
        companyId: connection.companyId,
        phone: senderId,
        name: contactName,
        source: 'telegram',
        identifier: senderId,
        identifierType: 'telegram'
      };
      contact = await storage.getOrCreateContact(insertContactData);
      logger.info('telegram', `Created new contact for Telegram user ${senderId}`);


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
    }


    let conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connection.id
    ) as Conversation | null;

    if (!conversation) {
      const insertConversationData: InsertConversation = {
        contactId: contact.id,
        channelId: connection.id,
        channelType: 'telegram',
        companyId: connection.companyId,
        status: 'open',
        lastMessageAt: new Date()
      };
      conversation = await storage.createConversation(insertConversationData);
      logger.info('telegram', `Created new conversation for contact ${contact.id}`);
    }


    let messageText = message.text || message.caption || '';
    let messageType = 'text';
    let mediaUrl: string | null = null;

    if (message.photo && message.photo.length > 0) {
      messageType = 'image';
      const largestPhoto = message.photo[message.photo.length - 1];
      mediaUrl = await getTelegramFileUrl(connection, largestPhoto.file_id);
    } else if (message.video) {
      messageType = 'video';
      mediaUrl = await getTelegramFileUrl(connection, message.video.file_id);
    } else if (message.document) {
      messageType = 'document';
      mediaUrl = await getTelegramFileUrl(connection, message.document.file_id);
    } else if (message.audio) {
      messageType = 'audio';
      mediaUrl = await getTelegramFileUrl(connection, message.audio.file_id);
    } else if (message.voice) {
      messageType = 'voice';
      mediaUrl = await getTelegramFileUrl(connection, message.voice.file_id);
    }

    const messageTimestamp = new Date(message.date * 1000);

    const insertMessageData: InsertMessage = {
      conversationId: conversation.id,
      content: messageText,
      type: messageType,
      direction: 'inbound',
      status: 'delivered',
      externalId: message.message_id.toString(),
      mediaUrl: mediaUrl,
      metadata: {
        channelType: 'telegram',
        timestamp: messageTimestamp.getTime(),
        senderId: senderId,
        chatId: chatId,
        from: message.from
      }
    };

    const savedMessage = await storage.createMessage(insertMessageData);
    updateConnectionActivity(connection.id, true);

    const updatedConversationDataForEvent = {
        ...conversation,
        lastMessageAt: messageTimestamp,
        status: 'open' as const
    };
    await storage.updateConversation(conversation.id, {
      lastMessageAt: messageTimestamp,
      status: 'open'
    });

    logger.info('telegram', `Message received from ${senderId} via connection ${connection.id}`);

    eventEmitter.emit('messageReceived', {
      message: savedMessage,
      conversation: updatedConversationDataForEvent,
      contact: contact,
      connection: connection
    });


    if ((global as any).broadcastToCompany) {
      (global as any).broadcastToCompany({
        type: 'newMessage',
        data: savedMessage
      }, connection.companyId);

      (global as any).broadcastToCompany({
        type: 'conversationUpdated',
        data: updatedConversationDataForEvent
      }, connection.companyId);
    }


    try {
      if (connection.companyId && !conversation.botDisabled) {
        logger.debug('telegram', `Message eligible for flow processing: conversation ${conversation.id}`);


        await processMessageThroughFlowExecutor(savedMessage, conversation, contact, connection);
      }
    } catch (flowError: any) {
      logger.error('telegram', `Error processing message through flows:`, flowError.message);
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', `Error handling incoming Telegram message:`, errorMessage);
    if (connection?.id) {
      updateConnectionActivity(connection.id, false, errorMessage);
    }
  }
}

/**
 * Process Telegram webhook
 */
export async function processWebhook(body: TelegramWebhookUpdate, signature?: string): Promise<void> {
  try {
    logger.info('telegram', 'Processing Telegram webhook:', { hasSignature: !!signature, bodyType: typeof body });


    if (signature && typeof body === 'string') {
      const isValidSignature = await verifyWebhookSignatureForAnyConnection(body, signature);
      if (!isValidSignature) {
        logger.error('telegram', 'Invalid webhook signature - rejecting request');
        throw new Error('Invalid webhook signature');
      }
    }


    await handleIncomingTelegramMessage(body);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('telegram', 'Error processing Telegram webhook:', errorMessage);
    throw error; // Re-throw to ensure proper HTTP error response
  }
}

/**
 * Setup webhook subscription for Telegram bot
 */
export async function setupWebhookSubscription(
  connectionId: number,
  callbackUrl: string
): Promise<boolean> {
  try {
    const connection = await storage.getChannelConnection(connectionId) as ChannelConnection | null;
    if (!connection) {
      throw new Error(`Connection with ID ${connectionId} not found for webhook setup.`);
    }

    const connectionData = connection.connectionData as TelegramConnectionData;
    if (!connectionData?.botToken) {
      throw new Error('Bot token is missing for webhook setup.');
    }

    const response = await axios.post(
      `${TELEGRAM_API_URL}/bot${connectionData.botToken}/setWebhook`,
      {
        url: callbackUrl,
        allowed_updates: ['message', 'edited_message', 'callback_query']
      },
      { timeout: 30000 }
    );

    if (response.status === 200 && response.data.ok) {
        logger.info('telegram', `Webhook subscription set up successfully for connection ${connectionId}`);
        return true;
    } else {
        logger.error('telegram', `Failed to set up Telegram webhook subscription for connection ${connectionId}:`, response.status, response.data);
        return false;
    }
  } catch (error: unknown) {
    let errorMessage = 'Error setting up Telegram webhook subscription';
     if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = (axiosError.response?.data as any)?.description || axiosError.message || errorMessage;
        logger.error('telegram', `Axios error setting up Telegram webhook subscription (Conn: ${connectionId}):`, errorMessage);
    } else if (error instanceof Error) {
        errorMessage = error.message;
        logger.error('telegram', `Error setting up Telegram webhook subscription (Conn: ${connectionId}):`, error.message);
    } else {
        logger.error('telegram', `Unknown error setting up Telegram webhook subscription (Conn: ${connectionId}):`, error);
    }
    return false;
  }
}

/**
 * Process message through flow executor
 */
async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: SchemaChannelConnection
): Promise<void> {
  try {
    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    logger.error('telegram', 'Error in flow executor:', error);
    throw error;
  }
}

export default {
  connect: connectToTelegram,
  disconnect: disconnectFromTelegram,
  sendMessage: sendTelegramMessage,
  sendMedia: sendTelegramMediaMessage,
  isActive: isTelegramConnectionActive,
  getActiveConnections: getActiveTelegramConnections,
  subscribeToEvents: subscribeToTelegramEvents,
  processWebhook: processWebhook,
  setupWebhook: setupWebhookSubscription,
  verifyWebhookSignature,
  testWebhookConfiguration,
  validateConnectionConfiguration,
  getConnectionHealth,
  generateQRCode,
  checkQRAuthStatus
};
