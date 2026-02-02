import crypto from 'crypto';
import { storage } from '../../storage';
import { getCachedCompanySetting, getCachedInitialPipelineStage } from '../../utils/pipeline-cache';
import { InsertConversation, InsertMessage, InsertContact } from '@shared/schema';
import { broadcastToCompany, broadcastToWebChatSession } from '../../utils/websocket';
import { smartWebSocketBroadcaster } from '../../utils/smart-websocket-broadcaster';
import { logger } from '../../utils/logger';

interface WebChatConnectionData {
  widgetToken?: string;
  widgetColor?: string;
  welcomeMessage?: string;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  showAvatar?: boolean;
  companyName?: string;
  allowFileUpload?: boolean;
  collectEmail?: boolean;
  collectName?: boolean;
}

interface SessionInfo {
  connectionId: number;
  companyId: number;
  contactId?: number;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  createdAt: Date;
  lastActiveAt: Date;
}

const sessions = new Map<string, SessionInfo>();

async function generateWidgetToken(connectionId: number): Promise<string> {
  const token = 'wc_' + crypto.randomBytes(24).toString('hex');
  const connection = await storage.getChannelConnection(connectionId);
  const data = (connection?.connectionData || {}) as WebChatConnectionData;
  await storage.updateChannelConnection(connectionId, {
    connectionData: {
      ...data,
      widgetToken: token,
    },
    status: 'active'
  });
  return token;
}

async function verifyWidgetToken(token: string): Promise<any | null> {
  const connections = await storage.getChannelConnectionsByType('webchat');
  for (const conn of connections) {
    const data = (conn.connectionData || {}) as WebChatConnectionData;
    if (data.widgetToken === token) return conn;
  }
  return null;
}

async function connect(connectionId: number, userId: number): Promise<void> {
  const conn = await storage.getChannelConnection(connectionId);
  if (!conn) throw new Error(`Connection ${connectionId} not found`);
  const data = (conn.connectionData || {}) as WebChatConnectionData;
  if (!data.widgetToken) {
    await generateWidgetToken(connectionId);
  } else {
    await storage.updateChannelConnectionStatus(connectionId, 'active');
  }
  logger.info('webchat', `WebChat connection ${connectionId} activated by user ${userId}`);
}

async function disconnect(connectionId: number, userId: number): Promise<boolean> {
  try {
    const conn = await storage.getChannelConnection(connectionId);
    if (!conn) return false;

    const data = (conn.connectionData || {}) as WebChatConnectionData;
    await storage.updateChannelConnection(connectionId, {
      status: 'disconnected',
      connectionData: {
        ...data,
        widgetToken: undefined
      }
    });

    for (const [sid, info] of sessions.entries()) {
      if (info.connectionId === connectionId) sessions.delete(sid);
    }
    logger.info('webchat', `WebChat connection ${connectionId} disconnected by user ${userId}`);
    return true;
  } catch (e) {
    logger.error('webchat', 'Error disconnecting WebChat connection:', e);
    return false;
  }
}

async function registerSession(connectionId: number, companyId: number, sessionId: string, visitorName?: string, visitorEmail?: string, visitorPhone?: string) {
  sessions.set(sessionId, {
    connectionId,
    companyId,
    visitorName,
    visitorEmail,
    visitorPhone,
    createdAt: new Date(),
    lastActiveAt: new Date()
  });

  try {
    await ensureContactAndConversation(connectionId, companyId, sessionId, visitorName, visitorEmail, visitorPhone);
  } catch (e) {
    logger.warn('webchat', 'Failed to pre-create contact from session registration', e as any);
  }
}

async function ensureContactAndConversation(connectionId: number, companyId: number, sessionId: string, visitorName?: string, visitorEmail?: string, visitorPhone?: string) {

  let contact = await storage.getContactByIdentifier?.(sessionId, 'webchat');
  if (!contact) {
    const insertContact: InsertContact = {
      companyId,
      name: visitorName || 'Website Visitor',
      email: visitorEmail || null,
      phone: (visitorPhone || undefined) as any,
      avatarUrl: undefined as any,
      identifier: sessionId,
      identifierType: 'webchat',
      source: 'webchat',
      notes: undefined as any,
      isHistorySync: false,
      historySyncBatchId: undefined as any
    };
    contact = await storage.getOrCreateContact(insertContact);


    try {
      const autoAddEnabled = await getCachedCompanySetting(companyId, 'autoAddContactToPipeline');
      if (autoAddEnabled) {

        const initialStage = await getCachedInitialPipelineStage(companyId);
        if (initialStage) {

          const existingDeal = await storage.getActiveDealByContact(contact.id, companyId, initialStage.pipelineId);
          if (!existingDeal) {
            const connection = await storage.getChannelConnection(connectionId);
            const deal = await storage.createDeal({
              companyId: companyId,
              contactId: contact.id,
              title: `New Lead - ${contact.name}`,
              pipelineId: initialStage.pipelineId,
              stageId: initialStage.id,
              stage: 'lead'
            });
            await storage.createDealActivity({
              dealId: deal.id,
              userId: connection?.userId || 1,
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

    if (contact.identifierType === 'webchat' && (!contact.identifier || contact.identifier.trim() === '')) {
      logger.warn('webchat', `Found webchat contact ${contact.id} with missing identifier, updating with sessionId: ${sessionId}`);
      contact = await storage.updateContact(contact.id, {
        identifier: sessionId,
        identifierType: 'webchat'
      });
    }
  }


  let conversation = await storage.getConversationByContactAndChannel(contact.id, connectionId);
  if (!conversation) {
    const insertConversation: InsertConversation = {
      companyId,
      contactId: contact.id,
      channelType: 'webchat',
      channelId: connectionId,
      status: 'open',
      assignedToUserId: null as any,
      lastMessageAt: new Date(),
      unreadCount: 0,
      botDisabled: false,
      disabledAt: null as any,
      disableDuration: null as any,
      disableReason: null as any,
      isGroup: false,
      groupJid: null as any,
      groupName: null as any,
      groupDescription: null as any,
      groupParticipantCount: 0,
      groupCreatedAt: null as any,
      groupMetadata: null as any,
      isHistorySync: false,
      historySyncBatchId: null as any,
      isStarred: false,
      isArchived: false,
      starredAt: null as any,
      archivedAt: null as any
    };
    conversation = await storage.createConversation(insertConversation);

    broadcastToCompany({ type: 'newConversation', data: { ...conversation, contact } }, companyId);
  }
  return { contact, conversation };
}

async function processMessageThroughFlowExecutor(
  message: any,
  conversation: any,
  contact: any,
  channelConnection: any
): Promise<void> {
  try {
    if (!contact || !contact.identifier) {
      logger.debug('webchat', `Skipping flow executor: missing contact or identifier`);
      return;
    }

    logger.debug('webchat', `Processing message through flow executor:`, {
      contactIdentifier: contact.identifier,
      messageId: message.id,
      conversationId: conversation?.id
    });

    const flowExecutorModule = await import('../flow-executor');
    const flowExecutor = flowExecutorModule.default;

    if (contact) {
      await flowExecutor.processIncomingMessage(message, conversation, contact, channelConnection);
    }
  } catch (error) {
    logger.error('webchat', `Error in processMessageThroughFlowExecutor:`, error);
  }
}

async function processWebhook(payload: any, companyId?: number): Promise<any> {
  const { token, eventType, data } = payload || {};
  if (!token) throw new Error('Missing widget token');
  const connection = await verifyWidgetToken(token);
  if (!connection) throw new Error('Invalid token');
  if (companyId && connection.companyId !== companyId) throw new Error('Access denied');

  const sessionId: string = data?.sessionId;
  if (!sessionId) throw new Error('Missing sessionId');


  if (!sessions.has(sessionId)) {
    await registerSession(connection.id, connection.companyId, sessionId, data?.visitorName, data?.visitorEmail, data?.visitorPhone);
  }
  const info = sessions.get(sessionId)!;

  if (data?.visitorName && !info.visitorName) info.visitorName = data.visitorName;
  if (data?.visitorEmail && !info.visitorEmail) info.visitorEmail = data.visitorEmail;
  if (data?.visitorPhone && !info.visitorPhone) info.visitorPhone = data.visitorPhone;
  info.lastActiveAt = new Date();

  switch (eventType) {
    case 'message': {
      const content: string = String(data?.message || '').slice(0, 5000);
      const visitorName: string | undefined = (data?.visitorName ?? info.visitorName);
      const visitorEmail: string | undefined = (data?.visitorEmail ?? info.visitorEmail);
      const visitorPhone: string | undefined = (data?.visitorPhone ?? info.visitorPhone);
      const mediaUrl: string | undefined = data?.mediaUrl;
      const { contact, conversation } = await ensureContactAndConversation(connection.id, connection.companyId, sessionId, visitorName, visitorEmail, visitorPhone);

      const insertMessage: InsertMessage = {
        conversationId: conversation.id,
        direction: 'inbound',
        type: data?.messageType || 'text',
        content,
        metadata: { channelType: 'webchat', sessionId, timestamp: Date.now() } as any,
        senderId: undefined as any,
        senderType: 'contact',
        status: 'delivered',
        sentAt: new Date(),
        readAt: undefined as any,
        isFromBot: false,
        mediaUrl: mediaUrl || (undefined as any),
        externalId: `webchat_${Date.now()}`,
        groupParticipantJid: undefined as any,
        groupParticipantName: undefined as any,
        isHistorySync: false,
        historySyncBatchId: undefined as any,
        createdAt: new Date()
      };

      const saved = await storage.createMessage(insertMessage);
      await storage.updateConversation(conversation.id, { lastMessageAt: new Date(), status: 'open' });


      smartWebSocketBroadcaster.broadcast({
        type: 'newMessage',
        data: saved,
        companyId: connection.companyId,
        conversationId: conversation.id,
        priority: 'high',
        batchable: false
      });


      broadcastToCompany({ type: 'newMessage', data: saved }, connection.companyId);


      if (!conversation.botDisabled) {
        await processMessageThroughFlowExecutor(saved, conversation, contact, connection);
      }

      return saved;
    }
    case 'typing':
    case 'session_start': {
      const visitorName: string | undefined = (data?.visitorName ?? info.visitorName);
      const visitorEmail: string | undefined = (data?.visitorEmail ?? info.visitorEmail);
      const visitorPhone: string | undefined = (data?.visitorPhone ?? info.visitorPhone);
      const result = await ensureContactAndConversation(connection.id, connection.companyId, sessionId, visitorName, visitorEmail, visitorPhone);
      return result;
    }
    case 'session_end':
    case 'file_upload':
    default:

      return null;
  }
}

async function sendMessage(
  connectionId: number,
  sessionId: string,
  content: string,
  messageType: string = 'text',
  mediaUrl?: string
): Promise<any> {
  const connection = await storage.getChannelConnection(connectionId);
  if (!connection) throw new Error(`Connection ${connectionId} not found`);
  const companyId = connection.companyId;
  if (companyId == null) {
    throw new Error('Connection has no companyId');
  }

  if (!sessions.has(sessionId)) {
    await registerSession(connectionId, companyId, sessionId);
  }

  const { contact, conversation } = await ensureContactAndConversation(connectionId, companyId, sessionId);

  const insertMessage: InsertMessage = {
    conversationId: conversation.id,
    direction: 'outbound',
    type: messageType || 'text',
    content,
    metadata: { channelType: 'webchat', sessionId, timestamp: Date.now() } as any,
    senderId: undefined as any,
    senderType: 'user',
    status: 'sent',
    sentAt: new Date(),
    readAt: undefined as any,
    isFromBot: false,
    mediaUrl: mediaUrl || (undefined as any),
    externalId: `webchat_${Date.now()}`,
    groupParticipantJid: undefined as any,
    groupParticipantName: undefined as any,
    isHistorySync: false,
    historySyncBatchId: undefined as any,
    createdAt: new Date()
  };

  const saved = await storage.createMessage(insertMessage);
  await storage.updateConversation(conversation.id, { lastMessageAt: new Date() });


  broadcastToWebChatSession({ type: 'webchatMessage', data: saved }, sessionId);

  smartWebSocketBroadcaster.broadcast({
    type: 'newMessage',
    data: saved,
    companyId,
    conversationId: conversation.id,
    priority: 'high',
    batchable: false
  });

  broadcastToCompany({ type: 'newMessage', data: saved }, companyId);

  return saved;
}

async function initializeAllConnections(): Promise<void> {
  try {
    const connections = await storage.getChannelConnectionsByType('webchat');
    for (const c of connections) {
      const data = (c.connectionData || {}) as WebChatConnectionData;
      if (!data.widgetToken) {
        await generateWidgetToken(c.id);
      }
    }
    logger.info('webchat', `Initialized ${connections.length} WebChat connections`);
  } catch (e) {
    logger.error('webchat', 'Error initializing WebChat connections:', e);
  }
}

export default {
  connect,
  disconnect,
  processWebhook,
  sendMessage,
  generateWidgetToken,
  verifyWidgetToken,
  initializeAllConnections,
  registerSession,
};
