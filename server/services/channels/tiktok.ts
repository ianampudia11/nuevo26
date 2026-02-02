import { storage } from '../../storage';
import { InsertMessage, InsertConversation, InsertContact, conversations, contacts, messages, contactAuditLogs } from '@shared/schema';
import { EventEmitter } from 'events';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { smartWebSocketBroadcaster } from '../../utils/smart-websocket-broadcaster';
import { eventEmitterPool } from '../../utils/event-emitter-pool';
import { eventEmitterMonitor } from '../../utils/event-emitter-monitor';
import { getDb } from '../../db';
import { eq, and, sql, lt, isNotNull } from 'drizzle-orm';
import { logTikTokWebhookEvent } from '../../utils/webhook-logger';
import type {
  TikTokConnectionData,
  TikTokPlatformConfig,
  TikTokOAuthTokenResponse,
  TikTokUserInfo,
  TikTokMessage,
  TikTokConversation,
  TikTokSendMessageRequest,
  TikTokSendMessageResponse,
  TikTokAPIError,
  TikTokRateLimit,
  TikTokConversationMetadata
} from '@shared/types/tiktok';
import type { TikTokScopeValidationResult } from '@shared/types/tiktok';
import { TikTokErrorCode } from '@shared/types/tiktok';

type RecoveryStage = 'validating' | 'refreshing_token' | 'testing_connection' | 'recovered';

interface ConnectionState {
  isActive: boolean;
  lastActivity: Date;
  errorCount: number;
  lastError: string | null;
  userInfo: TikTokUserInfo | null;
  consecutiveFailures: number;
  lastSuccessfulValidation: Date | null;
  isRecovering: boolean;
  recoveryAttempts: number;
  lastRecoveryAttempt: Date | null;
  rateLimit: TikTokRateLimit | null;
  tokenRefreshInProgress: boolean;
  recoveryStage: RecoveryStage | null;
  scheduledRefreshAt: number | null;
  consecutiveValidationFailures: number;
}





interface TypingIndicatorState {
  conversationId: number;
  userId: number;
  isTyping: boolean;
  startedAt: Date;
  timeout?: NodeJS.Timeout;
}

interface PresenceState {
  conversationId: number;
  userId: number;
  status: 'online' | 'offline' | 'away';
  lastSeen: Date;
  timeout?: NodeJS.Timeout;
}


const typingIndicators = new Map<number, Map<number, TypingIndicatorState>>();


const presenceStates = new Map<number, PresenceState>();


const TYPING_INDICATOR_TIMEOUT = 5000; // 5 seconds
const PRESENCE_TIMEOUT = 60000; // 1 minute
const TYPING_SIMULATION_WPM = 50; // Words per minute for realistic typing simulation

/** Minimum required OAuth scopes for TikTok messaging (scope minimization) */
const REQUIRED_TIKTOK_SCOPES = ['user.info.basic', 'im.chat'];





interface MessageStatusTracking {
  messageId: number;
  channelMessageId: string;
  conversationId: number;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  error?: string;
  readBy?: number[]; // User IDs who read the message
}


const messageStatusMap = new Map<number, MessageStatusTracking>();


const readReceiptsByConversation = new Map<number, Map<number, Date>>(); // conversationId -> Map<messageId, readAt>





interface MessageReaction {
  id: number;
  messageId: number;
  userId: number;
  emoji: string;
  createdAt: Date;
}

interface MessageMention {
  userId: number;
  userName: string;
  startIndex: number;
  length: number;
}

interface MentionNotification {
  messageId: number;
  conversationId: number;
  mentionedUserId: number;
  mentionedByUserId: number;
  messageContent: string;
  createdAt: Date;
}


const messageReactions = new Map<number, Map<string, MessageReaction[]>>(); // messageId -> Map<emoji, reactions[]>


const messageMentions = new Map<number, MessageMention[]>(); // messageId -> mentions[]


const unreadMentions = new Map<number, MentionNotification[]>(); // userId -> notifications[]


const AVAILABLE_REACTIONS = [
  '❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '💯',
  '👏', '🙏', '💪', '✨', '⭐', '💖', '😍', '🤔', '😎', '🥳'
];

const activeConnections = new Map<number, boolean>();
const connectionStates = new Map<number, ConnectionState>();
const healthMonitoringIntervals = new Map<number, NodeJS.Timeout>();
const recoveryTimeouts = new Map<number, NodeJS.Timeout>();
const proactiveRefreshTimeouts = new Map<number, NodeJS.Timeout>();
const refreshLocks = new Map<number, Promise<string>>(); // connectionId -> in-flight refresh promise
const tokenRefreshCount24h = new Map<number, { count: number; resetAt: number }>(); // connectionId -> { count, resetAt }
const HEALTH_CHECK_HEARTBEAT_INTERVAL = 10; // log heartbeat every N health checks per connection
const userInfoValidationCache = new Map<number, { userInfo: TikTokUserInfo; cachedAt: number }>();

const HEALTH_CHECK_INTERVALS = {
  ACTIVE: 300000,     // 5 minutes for stable connections
  INACTIVE: 300000,   // 5 minutes for inactive connections
  ERROR: 60000,       // 1 minute for connections with errors
  RECOVERY: 15000,    // 15 seconds during recovery
  TOKEN_EXPIRING: 600000 // 10 minutes when token expires within 24 hours
};


const ACTIVITY_THRESHOLDS = {
  INACTIVE_TIMEOUT: 600000,  // 10 minutes
  ACTIVE_THRESHOLD: 300000,  // 5 minutes
  TOKEN_VALIDATION_INTERVAL: 3600000, // 1 hour
  TOKEN_REFRESH_BUFFER: 43200000, // 12 hours (refresh 12h before expiry)
  TOKEN_EXPIRING_SOON_MS: 86400000, // 24 hours - use TOKEN_EXPIRING interval
  MAX_RECOVERY_ATTEMPTS: 3,
  RECOVERY_BACKOFF_BASE: 30000, // 30 seconds
  MAX_RECOVERY_TIME_MS: 30 * 60 * 1000, // 30 minutes max recovery
  VALIDATION_TIMEOUT_MS: 5000,
  USER_INFO_CACHE_MS: 5 * 60 * 1000 // 5 minutes cache for getUserInfo
};


const TIKTOK_API_VERSION = 'v2';
const TIKTOK_OAUTH_BASE_URL = 'https://open.tiktokapis.com';
const TIKTOK_AUTH_BASE_URL = 'https://www.tiktok.com';
const TIKTOK_BUSINESS_API_BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3'; // TikTok Business Messaging API v1.3 endpoint


const TIKTOK_RATE_LIMIT = {
  MAX_QPS: 10, // 10 queries per second
  WINDOW_MS: 1000 // 1 second window
};


const TIKTOK_NAMESPACE = 'tiktok-service';
const pooledEmitter = eventEmitterPool.getEmitter(TIKTOK_NAMESPACE);
eventEmitterMonitor.register('tiktok-service', pooledEmitter);


const eventEmitter = pooledEmitter;

/** Structured log prefix for TikTok service */
function tiktokLog(connectionId: number | undefined, action: string, message: string, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO', meta?: Record<string, unknown>): void {
  const prefix = connectionId != null ? `[TikTok][ConnectionID:${connectionId}][${action}]` : `[TikTok][${action}]`;
  const full = `${prefix} ${message}`;
  if (level === 'DEBUG') logger.debug('tiktok', full, meta);
  else if (level === 'WARN') logger.warn('tiktok', full, meta);
  else if (level === 'ERROR') logger.error('tiktok', full, meta);
  else logger.info('tiktok', full, meta);
}

function formatTokenExpiry(expiresAt: number): string {
  const now = Date.now();
  const ms = expiresAt - now;
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `expires in ${Math.floor(hours / 24)} days`;
  return `expires in ${hours}h ${mins}m`;
}





/**
 * Emit TikTok event to event emitter
 */
function emitTikTokEvent(eventName: string, data: any): void {
  eventEmitterPool.emit(TIKTOK_NAMESPACE, eventName, data);
}

/**
 * Broadcast TikTok event via WebSocket
 */
function broadcastTikTokEvent(eventType: string, data: any, options: {
  companyId?: number | null;
  userId?: number | null;
  conversationId?: number | null;
  priority?: 'high' | 'normal' | 'low';
} = {}): void {
  smartWebSocketBroadcaster.broadcast({
    type: eventType,
    data,
    companyId: options.companyId ?? undefined,
    userId: options.userId ?? undefined,
    conversationId: options.conversationId ?? undefined,
    priority: options.priority || 'normal',
    batchable: options.priority !== 'high'
  });
}





/**
 * Add reaction to a message
 */
async function addReaction(
  messageId: number,
  userId: number,
  emoji: string,
  companyId: number
): Promise<void> {
  try {

    if (!AVAILABLE_REACTIONS.includes(emoji)) {
      throw new Error(`Invalid reaction emoji: ${emoji}`);
    }


    const message = await storage.getMessageById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }


    const conversation = await storage.getConversation(message.conversationId);
    if (!conversation || conversation.companyId !== companyId) {
      throw new Error('Access denied');
    }


    if (!messageReactions.has(messageId)) {
      messageReactions.set(messageId, new Map());
    }

    const reactions = messageReactions.get(messageId)!;
    if (!reactions.has(emoji)) {
      reactions.set(emoji, []);
    }

    const emojiReactions = reactions.get(emoji)!;
    const existingReaction = emojiReactions.find(r => r.userId === userId);

    if (existingReaction) {
      logger.debug('tiktok', `User ${userId} already reacted with ${emoji} to message ${messageId}`);
      return;
    }


    const reaction: MessageReaction = {
      id: Date.now(), // Simple ID generation
      messageId,
      userId,
      emoji,
      createdAt: new Date()
    };

    emojiReactions.push(reaction);


    const currentMetadata = (message.metadata as any) || {};
    const currentReactions = currentMetadata.reactions || [];
    currentReactions.push({
      userId,
      emoji,
      createdAt: reaction.createdAt
    });

    await storage.updateMessage(messageId, {
      metadata: {
        ...currentMetadata,
        reactions: currentReactions
      }
    });


    emitTikTokEvent('reactionAdded', {
      messageId,
      userId,
      emoji,
      reaction
    });


    broadcastTikTokEvent('messageReaction', {
      messageId,
      conversationId: message.conversationId,
      userId,
      emoji,
      action: 'add',
      reaction
    }, {
      companyId,
      conversationId: message.conversationId,
      priority: 'normal'
    });

    logger.info('tiktok', `Reaction ${emoji} added to message ${messageId} by user ${userId}`);
  } catch (error) {
    logger.error('tiktok', 'Error adding reaction:', error);
    throw error;
  }
}

/**
 * Remove reaction from a message
 */
async function removeReaction(
  messageId: number,
  userId: number,
  emoji: string,
  companyId: number
): Promise<void> {
  try {

    const message = await storage.getMessageById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }


    const conversation = await storage.getConversation(message.conversationId);
    if (!conversation || conversation.companyId !== companyId) {
      throw new Error('Access denied');
    }


    const reactions = messageReactions.get(messageId);
    if (reactions && reactions.has(emoji)) {
      const emojiReactions = reactions.get(emoji)!;
      const index = emojiReactions.findIndex(r => r.userId === userId);
      if (index !== -1) {
        emojiReactions.splice(index, 1);


        if (emojiReactions.length === 0) {
          reactions.delete(emoji);
        }
      }
    }


    const currentMetadata = (message.metadata as any) || {};
    const currentReactions = currentMetadata.reactions || [];
    const updatedReactions = currentReactions.filter(
      (r: any) => !(r.userId === userId && r.emoji === emoji)
    );

    await storage.updateMessage(messageId, {
      metadata: {
        ...currentMetadata,
        reactions: updatedReactions
      }
    });


    emitTikTokEvent('reactionRemoved', {
      messageId,
      userId,
      emoji
    });


    broadcastTikTokEvent('messageReaction', {
      messageId,
      conversationId: message.conversationId,
      userId,
      emoji,
      action: 'remove'
    }, {
      companyId,
      conversationId: message.conversationId,
      priority: 'normal'
    });

    logger.info('tiktok', `Reaction ${emoji} removed from message ${messageId} by user ${userId}`);
  } catch (error) {
    logger.error('tiktok', 'Error removing reaction:', error);
    throw error;
  }
}

/**
 * Get reactions for a message
 */
function getMessageReactions(messageId: number): Map<string, MessageReaction[]> {
  return messageReactions.get(messageId) || new Map();
}

/**
 * Get reaction summary for a message
 */
function getReactionSummary(messageId: number): { emoji: string; count: number; users: number[] }[] {
  const reactions = messageReactions.get(messageId);
  if (!reactions) return [];

  const summary: { emoji: string; count: number; users: number[] }[] = [];

  reactions.forEach((reactionList, emoji) => {
    summary.push({
      emoji,
      count: reactionList.length,
      users: reactionList.map(r => r.userId)
    });
  });

  return summary.sort((a, b) => b.count - a.count);
}

/**
 * Check if user reacted to message
 */
function hasUserReacted(messageId: number, userId: number, emoji?: string): boolean {
  const reactions = messageReactions.get(messageId);
  if (!reactions) return false;

  if (emoji) {
    const emojiReactions = reactions.get(emoji);
    return emojiReactions ? emojiReactions.some(r => r.userId === userId) : false;
  }


  for (const reactionList of Array.from(reactions.values())) {
    if (reactionList.some((r: MessageReaction) => r.userId === userId)) {
      return true;
    }
  }

  return false;
}





/**
 * Parse mentions from message content
 * Format: @username or @[User Name](userId)
 */
function parseMentions(content: string): MessageMention[] {
  const mentions: MessageMention[] = [];


  const pattern1 = /@\[([^\]]+)\]\((\d+)\)/g;
  let match;

  while ((match = pattern1.exec(content)) !== null) {
    mentions.push({
      userId: parseInt(match[2]),
      userName: match[1],
      startIndex: match.index,
      length: match[0].length
    });
  }



  const pattern2 = /@(\w+)/g;
  while ((match = pattern2.exec(content)) !== null) {

    const alreadyMatched = mentions.some(
      m => match!.index >= m.startIndex && match!.index < m.startIndex + m.length
    );

    if (!alreadyMatched) {
      mentions.push({
        userId: 0, // Would need to resolve username to userId
        userName: match[1],
        startIndex: match.index,
        length: match[0].length
      });
    }
  }

  return mentions;
}

/**
 * Add mentions to a message
 */
async function addMentionsToMessage(
  messageId: number,
  content: string,
  senderId: number,
  conversationId: number,
  companyId: number
): Promise<void> {
  try {
    const mentions = parseMentions(content);

    if (mentions.length === 0) {
      return;
    }


    messageMentions.set(messageId, mentions);


    for (const mention of mentions) {
      if (mention.userId === 0 || mention.userId === senderId) {
        continue; // Skip unresolved or self-mentions
      }

      const notification: MentionNotification = {
        messageId,
        conversationId,
        mentionedUserId: mention.userId,
        mentionedByUserId: senderId,
        messageContent: content.substring(0, 100), // First 100 chars
        createdAt: new Date()
      };

      if (!unreadMentions.has(mention.userId)) {
        unreadMentions.set(mention.userId, []);
      }
      unreadMentions.get(mention.userId)!.push(notification);


      emitTikTokEvent('userMentioned', {
        messageId,
        conversationId,
        mentionedUserId: mention.userId,
        mentionedByUserId: senderId,
        mention
      });


      broadcastTikTokEvent('mention', {
        messageId,
        conversationId,
        mentionedUserId: mention.userId,
        mentionedByUserId: senderId,
        messageContent: content.substring(0, 100),
        mention
      }, {
        companyId,
        userId: mention.userId, // Target specific user
        priority: 'high'
      });
    }

    logger.info('tiktok', `${mentions.length} mentions added to message ${messageId}`);
  } catch (error) {
    logger.error('tiktok', 'Error adding mentions:', error);
  }
}

/**
 * Get mentions for a message
 */
function getMessageMentions(messageId: number): MessageMention[] {
  return messageMentions.get(messageId) || [];
}

/**
 * Get unread mentions for a user
 */
function getUnreadMentions(userId: number): MentionNotification[] {
  return unreadMentions.get(userId) || [];
}

/**
 * Mark mention as read
 */
function markMentionAsRead(userId: number, messageId: number): void {
  const mentions = unreadMentions.get(userId);
  if (!mentions) return;

  const index = mentions.findIndex(m => m.messageId === messageId);
  if (index !== -1) {
    mentions.splice(index, 1);

    if (mentions.length === 0) {
      unreadMentions.delete(userId);
    }
  }
}

/**
 * Clear all mentions for a user
 */
function clearUserMentions(userId: number): void {
  unreadMentions.delete(userId);
}

/**
 * Format message content with mentions for display
 */
function formatMessageWithMentions(content: string, mentions: MessageMention[]): string {
  if (mentions.length === 0) return content;


  const sortedMentions = [...mentions].sort((a, b) => b.startIndex - a.startIndex);

  let formattedContent = content;

  for (const mention of sortedMentions) {
    const before = formattedContent.substring(0, mention.startIndex);
    const after = formattedContent.substring(mention.startIndex + mention.length);
    formattedContent = `${before}@${mention.userName}${after}`;
  }

  return formattedContent;
}





/**
 * Track message status
 */
function trackMessageStatus(
  messageId: number,
  channelMessageId: string,
  conversationId: number,
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed',
  error?: string
): void {
  try {
    const existing = messageStatusMap.get(messageId);
    const now = new Date();

    const tracking: MessageStatusTracking = {
      messageId,
      channelMessageId,
      conversationId,
      status,
      sentAt: existing?.sentAt || (status === 'sent' ? now : undefined),
      deliveredAt: existing?.deliveredAt || (status === 'delivered' ? now : undefined),
      readAt: existing?.readAt || (status === 'read' ? now : undefined),
      failedAt: existing?.failedAt || (status === 'failed' ? now : undefined),
      error: error || existing?.error,
      readBy: existing?.readBy || []
    };

    messageStatusMap.set(messageId, tracking);

    logger.debug('tiktok', `Message ${messageId} status tracked: ${status}`);
  } catch (error) {
    logger.error('tiktok', 'Error tracking message status:', error);
  }
}

/**
 * Get message status tracking
 */
function getMessageStatusTracking(messageId: number): MessageStatusTracking | null {
  return messageStatusMap.get(messageId) || null;
}

/**
 * Mark message as read by user
 */
async function markMessageAsRead(
  messageId: number,
  userId: number,
  companyId: number
): Promise<void> {
  try {

    const message = await storage.getMessageById(messageId);
    if (!message) {
      logger.warn('tiktok', `Message ${messageId} not found for read receipt`);
      return;
    }


    await storage.updateMessage(messageId, { status: 'read' });


    const tracking = messageStatusMap.get(messageId);
    if (tracking) {
      if (!tracking.readBy) {
        tracking.readBy = [];
      }
      if (!tracking.readBy.includes(userId)) {
        tracking.readBy.push(userId);
      }
      tracking.readAt = new Date();
      tracking.status = 'read';
    }


    if (!readReceiptsByConversation.has(message.conversationId)) {
      readReceiptsByConversation.set(message.conversationId, new Map());
    }
    const conversationReceipts = readReceiptsByConversation.get(message.conversationId)!;
    conversationReceipts.set(messageId, new Date());


    emitTikTokEvent('messageRead', {
      messageId,
      userId,
      conversationId: message.conversationId,
      readAt: new Date()
    });


    broadcastTikTokEvent('messageStatusUpdate', {
      messageId,
      conversationId: message.conversationId,
      status: 'read',
      readBy: tracking?.readBy || [userId],
      readAt: new Date()
    }, {
      companyId,
      conversationId: message.conversationId,
      priority: 'normal'
    });

    logger.debug('tiktok', `Message ${messageId} marked as read by user ${userId}`);
  } catch (error) {
    logger.error('tiktok', 'Error marking message as read:', error);
  }
}

/**
 * Mark all messages in conversation as read
 */
async function markConversationAsRead(
  conversationId: number,
  userId: number,
  companyId: number
): Promise<void> {
  try {

    const messages = await storage.getMessagesByConversation(conversationId);
    const unreadMessages = messages.filter(msg =>
      msg.status !== 'read' && msg.senderType === 'contact'
    );


    for (const message of unreadMessages) {
      await markMessageAsRead(message.id, userId, companyId);
    }


    broadcastTikTokEvent('conversationRead', {
      conversationId,
      userId,
      messageCount: unreadMessages.length,
      readAt: new Date()
    }, {
      companyId,
      conversationId,
      priority: 'normal'
    });

    logger.info('tiktok', `Conversation ${conversationId} marked as read by user ${userId} (${unreadMessages.length} messages)`);
  } catch (error) {
    logger.error('tiktok', 'Error marking conversation as read:', error);
  }
}

/**
 * Get read receipts for a message
 */
function getMessageReadReceipts(messageId: number): { userId: number; readAt: Date }[] {
  const tracking = messageStatusMap.get(messageId);
  if (!tracking || !tracking.readBy) {
    return [];
  }

  return tracking.readBy.map(userId => ({
    userId,
    readAt: tracking.readAt || new Date()
  }));
}

/**
 * Get delivery status for a message
 */
async function getMessageDeliveryStatus(messageId: number): Promise<{
  status: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  error?: string;
  readBy?: number[];
} | null> {
  try {
    const message = await storage.getMessageById(messageId);
    if (!message) {
      return null;
    }

    const tracking = messageStatusMap.get(messageId);

    return {
      status: message.status || 'unknown',
      sentAt: tracking?.sentAt,
      deliveredAt: tracking?.deliveredAt,
      readAt: tracking?.readAt,
      failedAt: tracking?.failedAt,
      error: tracking?.error,
      readBy: tracking?.readBy
    };
  } catch (error) {
    logger.error('tiktok', 'Error getting message delivery status:', error);
    return null;
  }
}

/**
 * Send read receipt to TikTok (if supported by API)
 */
async function sendReadReceipt(
  connectionId: number,
  messageId: string
): Promise<void> {
  try {




    logger.debug('tiktok', `Read receipt sent for message ${messageId}`);
  } catch (error) {
    logger.error('tiktok', 'Error sending read receipt:', error);
  }
}





/**
 * Start typing indicator for a user in a conversation
 */
function startTypingIndicator(conversationId: number, userId: number, companyId: number): void {
  try {

    if (!typingIndicators.has(conversationId)) {
      typingIndicators.set(conversationId, new Map());
    }

    const conversationTyping = typingIndicators.get(conversationId)!;


    const existingState = conversationTyping.get(userId);
    if (existingState?.timeout) {
      clearTimeout(existingState.timeout);
    }


    const timeout = setTimeout(() => {
      stopTypingIndicator(conversationId, userId, companyId);
    }, TYPING_INDICATOR_TIMEOUT);

    conversationTyping.set(userId, {
      conversationId,
      userId,
      isTyping: true,
      startedAt: new Date(),
      timeout
    });


    broadcastTikTokEvent('userTyping', {
      conversationId,
      userId,
      isTyping: true
    }, {
      companyId,
      conversationId,
      priority: 'high'
    });

    logger.debug('tiktok', `User ${userId} started typing in conversation ${conversationId}`);
  } catch (error) {
    logger.error('tiktok', 'Error starting typing indicator:', error);
  }
}

/**
 * Stop typing indicator for a user in a conversation
 */
function stopTypingIndicator(conversationId: number, userId: number, companyId: number): void {
  try {
    const conversationTyping = typingIndicators.get(conversationId);
    if (!conversationTyping) return;

    const state = conversationTyping.get(userId);
    if (!state) return;


    if (state.timeout) {
      clearTimeout(state.timeout);
    }


    conversationTyping.delete(userId);


    if (conversationTyping.size === 0) {
      typingIndicators.delete(conversationId);
    }


    broadcastTikTokEvent('userTyping', {
      conversationId,
      userId,
      isTyping: false
    }, {
      companyId,
      conversationId,
      priority: 'normal'
    });

    logger.debug('tiktok', `User ${userId} stopped typing in conversation ${conversationId}`);
  } catch (error) {
    logger.error('tiktok', 'Error stopping typing indicator:', error);
  }
}

/**
 * Get typing users in a conversation
 */
function getTypingUsers(conversationId: number): number[] {
  const conversationTyping = typingIndicators.get(conversationId);
  if (!conversationTyping) return [];

  return Array.from(conversationTyping.values())
    .filter(state => state.isTyping)
    .map(state => state.userId);
}

/**
 * Update user presence status
 */
function updatePresenceStatus(
  userId: number,
  conversationId: number,
  status: 'online' | 'offline' | 'away',
  companyId: number
): void {
  try {

    const existingState = presenceStates.get(userId);
    if (existingState?.timeout) {
      clearTimeout(existingState.timeout);
    }


    let timeout: NodeJS.Timeout | undefined;
    if (status === 'online') {
      timeout = setTimeout(() => {
        updatePresenceStatus(userId, conversationId, 'away', companyId);
      }, PRESENCE_TIMEOUT);
    }


    presenceStates.set(userId, {
      conversationId,
      userId,
      status,
      lastSeen: new Date(),
      timeout
    });


    broadcastTikTokEvent('userPresence', {
      userId,
      conversationId,
      status,
      lastSeen: new Date()
    }, {
      companyId,
      conversationId,
      priority: 'normal'
    });

    logger.debug('tiktok', `User ${userId} presence updated to ${status}`);
  } catch (error) {
    logger.error('tiktok', 'Error updating presence status:', error);
  }
}

/**
 * Get user presence status
 */
function getUserPresence(userId: number): PresenceState | null {
  return presenceStates.get(userId) || null;
}

/**
 * Calculate realistic typing delay based on message length
 */
function calculateTypingDelay(message: string): number {
  const words = message.split(/\s+/).length;
  const baseDelay = (words / TYPING_SIMULATION_WPM) * 60 * 1000;


  const randomFactor = 0.7 + Math.random() * 0.6;
  const delay = baseDelay * randomFactor;


  return Math.min(Math.max(delay, 1000), 5000);
}

/**
 * Simulate typing indicator before sending message
 */
async function simulateTyping(
  conversationId: number,
  userId: number,
  companyId: number,
  message: string
): Promise<void> {
  try {

    startTypingIndicator(conversationId, userId, companyId);


    const delay = calculateTypingDelay(message);


    await new Promise(resolve => setTimeout(resolve, delay));


    stopTypingIndicator(conversationId, userId, companyId);
  } catch (error) {
    logger.error('tiktok', 'Error simulating typing:', error);

    stopTypingIndicator(conversationId, userId, companyId);
  }
}





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
      userInfo: null,
      consecutiveFailures: 0,
      lastSuccessfulValidation: null,
      isRecovering: false,
      recoveryAttempts: 0,
      lastRecoveryAttempt: null,
      rateLimit: null,
      tokenRefreshInProgress: false,
      recoveryStage: null,
      scheduledRefreshAt: null,
      consecutiveValidationFailures: 0
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
      logger.info('tiktok', `Connection ${connectionId} recovered successfully`);
      

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
 * Get adaptive health check interval based on connection state and token expiry
 */
function getAdaptiveHealthCheckInterval(state: ConnectionState, tokenExpiresAt?: number): number {
  if (state.isRecovering) {
    return HEALTH_CHECK_INTERVALS.RECOVERY;
  }
  if (state.errorCount > 0) {
    return HEALTH_CHECK_INTERVALS.ERROR;
  }
  const now = Date.now();
  if (tokenExpiresAt && tokenExpiresAt < now + ACTIVITY_THRESHOLDS.TOKEN_EXPIRING_SOON_MS) {
    return HEALTH_CHECK_INTERVALS.TOKEN_EXPIRING;
  }
  if (state.isActive) {
    return HEALTH_CHECK_INTERVALS.ACTIVE;
  }
  return HEALTH_CHECK_INTERVALS.INACTIVE;
}

/**
 * Schedule a one-time proactive token refresh at (tokenExpiresAt - 12h)
 */
function scheduleProactiveTokenRefresh(connectionId: number): void {
  const existing = proactiveRefreshTimeouts.get(connectionId);
  if (existing) {
    clearTimeout(existing);
    proactiveRefreshTimeouts.delete(connectionId);
  }

  (async () => {
    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) return;
      const data = connection.connectionData as TikTokConnectionData;
      if (!data?.tokenExpiresAt || !data?.refreshToken) return;

      const nextRefreshAt = data.tokenExpiresAt - ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER;
      if (nextRefreshAt <= Date.now()) {
        await ensureValidToken(connectionId);
        return;
      }

      const delay = nextRefreshAt - Date.now();
      const state = getConnectionState(connectionId);
      state.scheduledRefreshAt = nextRefreshAt;
      eventEmitter.emit('tokenRefreshScheduled', { connectionId, scheduledAt: nextRefreshAt });
      tiktokLog(connectionId, 'ProactiveRefresh', `Next refresh at ${new Date(nextRefreshAt).toISOString()} (in ${Math.round(delay / 1000)}s)`, 'DEBUG');

      const timeout = setTimeout(async () => {
        proactiveRefreshTimeouts.delete(connectionId);
        try {
          await ensureValidToken(connectionId);
          scheduleProactiveTokenRefresh(connectionId);
        } catch (err) {
          tiktokLog(connectionId, 'ProactiveRefresh', `Proactive refresh failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
        }
      }, delay);
      proactiveRefreshTimeouts.set(connectionId, timeout);
    } catch (err) {
      tiktokLog(connectionId, 'ProactiveRefresh', `Failed to schedule: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
    }
  })();
}





/**
 * Get TikTok platform configuration
 */
async function getPlatformConfig(): Promise<TikTokPlatformConfig> {
  const config = await storage.getPartnerConfiguration('tiktok');
  
  if (!config || !config.isActive) {
    throw new Error('TikTok platform configuration not found or inactive');
  }

  return {
    clientKey: config.partnerApiKey,
    clientSecret: config.partnerId, // Stored in partnerId field
    webhookUrl: config.partnerWebhookUrl || '',
    webhookSecret: (config as any).webhookVerifyToken || undefined,
    apiVersion: TIKTOK_API_VERSION,

    apiBaseUrl: (config as any).apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL,
    partnerId: config.partnerId,

    partnerName: (config as any).partnerName || (config.publicProfile as any)?.companyName || undefined,
    logoUrl: (config.publicProfile as any)?.logoUrl || undefined,
    redirectUrl: config.redirectUrl || undefined
  };
}





/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<TikTokOAuthTokenResponse> {
  try {
    const platformConfig = await getPlatformConfig();
    
    const params: Record<string, string> = {
      client_key: platformConfig.clientKey,
      client_secret: platformConfig.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    };


    if (codeVerifier) {
      params.code_verifier = codeVerifier;
    }
    

    const logParams = {
      ...params,
      client_secret: params.client_secret ? '***REDACTED***' : undefined,
      code_verifier: codeVerifier ? '***REDACTED***' : undefined
    };
    logger.info('tiktok', 'Token exchange request params:', JSON.stringify(logParams, null, 2));
    logger.info('tiktok', `Token exchange URL: ${TIKTOK_OAUTH_BASE_URL}/${TIKTOK_API_VERSION}/oauth/token/`);
    logger.info('tiktok', `Redirect URI: ${redirectUri}`);
    logger.info('tiktok', `PKCE code_verifier present: ${!!codeVerifier}`);
    
    const response = await axios.post(
      `${TIKTOK_OAUTH_BASE_URL}/${TIKTOK_API_VERSION}/oauth/token/`,
      new URLSearchParams(params),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );


    logger.info('tiktok', 'Token exchange response status:', response.status);
    logger.info('tiktok', 'Token exchange response headers:', JSON.stringify(response.headers, null, 2));
    logger.info('tiktok', 'Token exchange response data:', JSON.stringify(response.data, null, 2));
    

    if (response.data.error) {
      const errorData = response.data.error;
      const errorMessage = `TikTok token exchange error: ${errorData.code || 'UNKNOWN'} - ${errorData.message || JSON.stringify(errorData)}`;
      logger.error('tiktok', errorMessage);
      logger.error('tiktok', 'Full error response:', JSON.stringify(response.data, null, 2));
      throw new Error(errorMessage);
    }
    

    if (!response.data.access_token) {
      const errorMessage = `Token exchange missing access_token: ${JSON.stringify(response.data)}`;
      logger.error('tiktok', errorMessage);
      logger.error('tiktok', 'Response status:', response.status);
      logger.error('tiktok', 'Response headers:', JSON.stringify(response.headers, null, 2));
      throw new Error(errorMessage);
    }


    const scopeStr = response.data.scope ?? '';
    const scopeValidation = validateTikTokScopes(scopeStr);
    if (!scopeValidation.valid) {
      const errorMessage = `Required TikTok scopes not granted. Missing: ${scopeValidation.missingScopes.join(', ')}. Please re-authorize with all requested permissions.`;
      logger.error('tiktok', errorMessage, { grantedScopes: scopeValidation.grantedScopes, missingScopes: scopeValidation.missingScopes });
      throw new Error(errorMessage);
    }
    if (scopeValidation.warnings.length > 0) {
      scopeValidation.warnings.forEach((w) => logger.warn('tiktok', w));
    }
    logger.info('tiktok', 'OAuth scope grant (audit)', {
      grantedScopes: scopeValidation.grantedScopes,
      timestamp: new Date().toISOString()
    });

    logger.info('tiktok', 'Successfully exchanged authorization code for access token');
    return response.data;
  } catch (error) {
    logger.error('tiktok', 'Error exchanging authorization code:', error);
    throw handleTikTokError(error);
  }
}

/**
 * Validate granted OAuth scopes (scope minimization for GDPR)
 * Returns validation result with missing/excess scopes and warnings.
 */
function validateTikTokScopes(scopeString: string): TikTokScopeValidationResult {
  const grantedScopes = (scopeString || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const missingScopes = REQUIRED_TIKTOK_SCOPES.filter((s) => !grantedScopes.includes(s));
  const excessScopes = grantedScopes.filter((s) => !REQUIRED_TIKTOK_SCOPES.includes(s));
  const warnings: string[] = [];
  if (grantedScopes.includes('business.management') && !REQUIRED_TIKTOK_SCOPES.includes('business.management')) {
    warnings.push('Scope business.management granted but not required for current feature set (scope minimization)');
  }
  return {
    valid: missingScopes.length === 0,
    grantedScopes,
    missingScopes,
    excessScopes,
    warnings
  };
}

const REFRESH_RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

/**
 * Refresh access token using refresh token with retry and rate limit handling
 */
async function refreshAccessToken(
  refreshToken: string,
  connectionId?: number
): Promise<TikTokOAuthTokenResponse> {
  const attemptLog = (attempt: number, msg: string, meta?: Record<string, unknown>) =>
    tiktokLog(connectionId, 'TokenRefresh', msg, attempt === 0 ? 'INFO' : 'WARN', { attempt, ...meta });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, REFRESH_RETRY_DELAYS[attempt - 1]));
      }
      attemptLog(attempt, `Refresh attempt ${attempt + 1}/3 at ${new Date().toISOString()}`);

      const platformConfig = await getPlatformConfig();

      const response = await axios.post(
        `${TIKTOK_OAUTH_BASE_URL}/${TIKTOK_API_VERSION}/oauth/token/`,
        new URLSearchParams({
          client_key: platformConfig.clientKey,
          client_secret: platformConfig.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000,
          validateStatus: (status) => status < 500 || status === 429
        }
      );

      const rateLimitReset = response.headers['x-ratelimit-reset'];
      if (response.status === 429 && rateLimitReset) {
        const resetAt = parseInt(rateLimitReset, 10) * 1000;
        const waitMs = Math.max(1000, resetAt - Date.now());
        attemptLog(attempt, `Rate limited; waiting until ${new Date(resetAt).toISOString()} (${waitMs}ms)`);
        await new Promise(r => setTimeout(r, Math.min(waitMs, 60000)));
        continue;
      }
      if (response.status === 429 && !rateLimitReset) {
        const waitMs = REFRESH_RETRY_DELAYS[attempt] ?? 4000;
        attemptLog(attempt, `Rate limited (no reset header); waiting ${waitMs}ms before retry`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (response.status !== 200) {
        const errData = response.data as any;
        throw new Error(errData?.error?.message || `HTTP ${response.status}`);
      }

      if (response.data?.error) {
        const errData = response.data.error;
        throw new Error(`${errData.code || 'ERROR'}: ${errData.message || JSON.stringify(errData)}`);
      }

      if (!response.data?.access_token) {
        throw new Error('Response missing access_token');
      }

      attemptLog(attempt, 'Successfully refreshed access token', { connectionId });
      return response.data;
    } catch (error: any) {
      const isRetryable = attempt < 2 && (error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT');
      attemptLog(attempt, `Refresh failed: ${error.message}`, { success: false, isRetryable });
      if (!isRetryable) {
        throw handleTikTokError(error);
      }
    }
  }
  throw new Error('Token refresh failed after 3 attempts');
}

/**
 * Check if token needs refresh and refresh if necessary (with mutex and fallback)
 */
async function ensureValidToken(connectionId: number): Promise<string> {
  const connection = await storage.getChannelConnection(connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  const connectionData = connection.connectionData as TikTokConnectionData;
  const now = Date.now();
  const state = getConnectionState(connectionId);

  const needsRefresh =
    connectionData.tokenExpiresAt &&
    connectionData.tokenExpiresAt < now + ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER;

  if (!needsRefresh) {
    return connectionData.accessToken;
  }


  let refreshPromise = refreshLocks.get(connectionId);
  if (refreshPromise) {
    try {
      return await refreshPromise;
    } catch {

      try {
        await getUserInfo(connectionData.accessToken);
        tiktokLog(connectionId, 'EnsureValidToken', 'Used existing token after refresh lock failed', 'INFO');
        return connectionData.accessToken;
      } catch {
        throw new Error('Token refresh failed and existing token invalid');
      }
    }
  }

  state.tokenRefreshInProgress = true;
  const tokenRefreshAttempts = (connectionData.tokenRefreshAttempts ?? 0) + 1;

  refreshPromise = (async (): Promise<string> => {
    try {
      tiktokLog(connectionId, 'EnsureValidToken', `Token expiring soon (${formatTokenExpiry(connectionData.tokenExpiresAt!)}), refreshing...`, 'INFO');
      const tokenResponse = await refreshAccessToken(connectionData.refreshToken, connectionId);

      const newExpiresAt = now + tokenResponse.expires_in * 1000;
      const updatedConnectionData: TikTokConnectionData = {
        ...connectionData,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: newExpiresAt,
        lastSyncAt: now,
        tokenRefreshedAt: now,
        tokenRefreshAttempts: 0,
        nextTokenRefreshAt: newExpiresAt - ACTIVITY_THRESHOLDS.TOKEN_REFRESH_BUFFER,
        status: 'active'
      };

      await storage.updateChannelConnection(connectionId, {
        accessToken: tokenResponse.access_token,
        connectionData: updatedConnectionData
      });

      updateConnectionActivity(connectionId, true);
      state.tokenRefreshInProgress = false;
      refreshLocks.delete(connectionId);


      const bucket = tokenRefreshCount24h.get(connectionId);
      const resetAt = bucket && bucket.resetAt > now ? bucket.resetAt : now + 86400000;
      if (!bucket || bucket.resetAt <= now) {
        tokenRefreshCount24h.set(connectionId, { count: 1, resetAt });
      } else {
        bucket.count++;
      }

      emitTikTokEvent('tokenRefreshed', {
        connectionId,
        oldExpiresAt: connectionData.tokenExpiresAt,
        newExpiresAt
      });
      eventEmitter.emit('tokenRefreshCompleted', {
        connectionId,
        oldExpiresAt: connectionData.tokenExpiresAt,
        newExpiresAt
      });
      tiktokLog(connectionId, 'TokenRefresh', `Token refreshed successfully; ${formatTokenExpiry(newExpiresAt)}`, 'INFO');
      scheduleProactiveTokenRefresh(connectionId);


      try {
        const tokenScope = tokenResponse.scope ? tokenResponse.scope.split(',').map((s: string) => s.trim()) : [];
        const missingScopes = REQUIRED_TIKTOK_SCOPES.filter((s) => !tokenScope.includes(s));
        if (tokenScope.some((s) => !REQUIRED_TIKTOK_SCOPES.includes(s))) {
          tiktokLog(connectionId, 'TokenRefresh', 'Extra scopes granted (e.g. business.management); not required for current feature set', 'DEBUG');
        }
        if (missingScopes.length > 0) {
          const conn = await storage.getChannelConnection(connectionId);
          if (conn?.connectionData && typeof conn.connectionData === 'object') {
            const data = conn.connectionData as Record<string, unknown>;
            const restricted = [...(Array.isArray(data.restrictedFeatures) ? data.restrictedFeatures : []), ...missingScopes];
            await storage.updateChannelConnection(connectionId, {
              connectionData: { ...data, grantedScopes: tokenScope, restrictedFeatures: [...new Set(restricted)] } as TikTokConnectionData
            }).catch(() => {});
            eventEmitter.emit('scopesChanged', { connectionId, grantedScopes: tokenScope, restrictedFeatures: restricted });
          }
        }
        const userInfo = await getUserInfo(tokenResponse.access_token);
        const regionResult = await detectRegionRestrictions(tokenResponse.access_token, userInfo);
        const conn2 = await storage.getChannelConnection(connectionId);
        if (conn2?.connectionData && typeof conn2.connectionData === 'object') {
          const data = conn2.connectionData as Record<string, unknown>;
          const prevRestricted = (data.regionRestricted as boolean) ?? false;
          if (regionResult.regionRestricted !== prevRestricted || (regionResult.restrictedFeatures?.length ?? 0) > 0) {
            await storage.updateChannelConnection(connectionId, {
              connectionData: {
                ...data,
                regionRestricted: regionResult.regionRestricted,
                restrictedFeatures: regionResult.restrictedFeatures,
                regionCode: regionResult.regionCode
              } as TikTokConnectionData
            }).catch(() => {});
            eventEmitter.emit('regionRestrictionsChanged', {
              connectionId,
              regionRestricted: regionResult.regionRestricted,
              restrictedFeatures: regionResult.restrictedFeatures
            });
          }
        }
      } catch (scopeErr) {
        tiktokLog(connectionId, 'TokenRefresh', `Scope/region check after refresh failed: ${scopeErr instanceof Error ? scopeErr.message : 'Unknown'}`, 'DEBUG');
      }
      return tokenResponse.access_token;
    } catch (error) {
      state.tokenRefreshInProgress = false;
      refreshLocks.delete(connectionId);
      tiktokLog(connectionId, 'TokenRefresh', `Refresh failed: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
      const conn = await storage.getChannelConnection(connectionId);
      if (conn?.connectionData && typeof conn.connectionData === 'object') {
        const data = { ...(conn.connectionData as Record<string, unknown>), tokenRefreshAttempts };
        await storage.updateChannelConnection(connectionId, { connectionData: data as TikTokConnectionData }).catch(() => {});
      }

      try {
        await getUserInfo(connectionData.accessToken);
        tiktokLog(connectionId, 'EnsureValidToken', 'Used existing token after refresh failure', 'WARN');
        return connectionData.accessToken;
      } catch {
        await handleTokenExpiration(connectionId);
        throw error;
      }
    }
  })();

  refreshLocks.set(connectionId, refreshPromise);
  return refreshPromise;
}





/**
 * Get TikTok user information
 */
async function getUserInfo(accessToken: string): Promise<TikTokUserInfo> {
  try {

    const BASIC_FIELDS = 'open_id,union_id,avatar_url,display_name';
    


    

    const response = await axios.get(
      `${TIKTOK_OAUTH_BASE_URL}/${TIKTOK_API_VERSION}/user/info/`,
      {
        params: {
          fields: BASIC_FIELDS
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    logger.debug('tiktok', 'Successfully retrieved user info');
    return response.data.data.user;
  } catch (error) {
    logger.error('tiktok', 'Error getting user info:', error);
    throw handleTikTokError(error);
  }
}

/**
 * Get sender (conversation participant) user info by user ID for Business Messaging API.
 * Uses Business API user endpoint when available; returns undefined if not supported or on error.
 */
async function getSenderUserInfo(accessToken: string, userId: string): Promise<TikTokUserInfo | undefined> {
  try {
    const platformConfig = await getPlatformConfig();
    const apiBaseUrl = platformConfig.apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL;
    const response = await axios.get(
      `${apiBaseUrl}/business/user/info/`,
      {
        params: { user_id: userId },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: (status) => status < 500
      }
    );
    if (response.status === 200 && response.data?.data?.user) {
      return response.data.data.user as TikTokUserInfo;
    }
    return undefined;
  } catch (error) {
    logger.debug('tiktok', 'getSenderUserInfo failed (API may not support user_id lookup)', { userId });
    return undefined;
  }
}

/**
 * Verify if TikTok account is a Business Account
 * Attempts to call Business Messaging API endpoint to verify account type
 */
async function verifyBusinessAccount(accessToken: string): Promise<{
  isBusinessAccount: boolean;
  businessAccountId?: string;
}> {
  try {


    const response = await axios.get(
      `${TIKTOK_BUSINESS_API_BASE_URL}/business/account/info`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      }
    );

    if (response.status === 200) {

      const businessAccountId = response.data?.data?.business_account_id || response.data?.business_account_id;
      logger.info('tiktok', 'Business Account verified successfully', { businessAccountId });
      return {
        isBusinessAccount: true,
        businessAccountId
      };
    } else if (response.status === 403) {

      logger.warn('tiktok', 'Business Account verification failed: 403 Forbidden - likely Personal/Creator account');
      return {
        isBusinessAccount: false
      };
    } else {

      const errorCode = response.data?.error?.code;
      if (errorCode === 'BUSINESS_ACCOUNT_REQUIRED' || errorCode === 'INSUFFICIENT_PERMISSIONS') {
        logger.warn('tiktok', 'Business Account verification failed:', errorCode);
        return {
          isBusinessAccount: false
        };
      }

      logger.warn('tiktok', 'Business Account verification returned unexpected status:', response.status);
      return {
        isBusinessAccount: false
      };
    }
  } catch (error: any) {

    if (error.response?.status === 403) {
      logger.warn('tiktok', 'Business Account verification failed: 403 Forbidden');
      return {
        isBusinessAccount: false
      };
    }
    
    const errorCode = error.response?.data?.error?.code;
    if (errorCode === 'BUSINESS_ACCOUNT_REQUIRED' || errorCode === 'INSUFFICIENT_PERMISSIONS') {
      logger.warn('tiktok', 'Business Account verification failed:', errorCode);
      return {
        isBusinessAccount: false
      };
    }
    

    logger.error('tiktok', 'Error verifying Business Account:', error.message);
    return {
      isBusinessAccount: false
    };
  }
}

/**
 * Detect region restrictions for TikTok Business Messaging API
 * EEA/UK/CH regions have restricted messaging features
 */
async function detectRegionRestrictions(
  accessToken: string,
  userInfo: TikTokUserInfo
): Promise<{
  regionRestricted: boolean;
  restrictedFeatures: string[];
  regionCode?: string;
}> {
  const EEA_UK_RESTRICTED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 
    'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 
    'SE', 'GB', 'CH'
  ]; // EEA + UK + Switzerland

  let detectedRegionCode: string | undefined;
  let regionRestricted = false;
  let restrictedFeatures: string[] = [];

  try {

    try {
      const accountInfoResponse = await axios.get(
        `${TIKTOK_BUSINESS_API_BASE_URL}/business/account/info`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        }
      );

      if (accountInfoResponse.status === 200) {

        const accountData = accountInfoResponse.data?.data || accountInfoResponse.data;
        detectedRegionCode = accountData?.region_code || 
                            accountData?.country_code || 
                            accountData?.region ||
                            accountData?.country;
        
        if (detectedRegionCode) {

          detectedRegionCode = detectedRegionCode.toUpperCase().substring(0, 2);
          logger.debug('tiktok', `Region code detected from Business API: ${detectedRegionCode}`);
        }
      }
    } catch (accountInfoError: any) {

      logger.debug('tiktok', 'Could not retrieve region from Business API account info:', accountInfoError.message);
    }



    const conversationsResponse = await axios.get(
      `${TIKTOK_BUSINESS_API_BASE_URL}/business/conversations/`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      }
    );

    if (conversationsResponse.status === 200) {

      logger.debug('tiktok', 'Region check passed - messaging features available');
      


      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
          logger.warn('tiktok', `Region ${detectedRegionCode} is in restricted list, but API call succeeded. Marking as restricted.`);
        }
      }
      
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    } else {

      const errorCode = conversationsResponse.data?.error?.code;
      const errorMessage = conversationsResponse.data?.error?.message || '';
      

      if (!detectedRegionCode && errorMessage) {

        const regionMatch = errorMessage.match(/\b([A-Z]{2})\b/);
        if (regionMatch) {
          detectedRegionCode = regionMatch[1];
        }
      }
      
      if (
        errorCode === 'REGION_NOT_SUPPORTED' ||
        errorCode === 'SERVICE_UNAVAILABLE_IN_REGION' ||
        errorMessage.toLowerCase().includes('not available in your region') ||
        errorMessage.toLowerCase().includes('eea') ||
        errorMessage.toLowerCase().includes('european')
      ) {


        if (detectedRegionCode) {
          regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        } else {

          regionRestricted = true;
        }
        
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
          logger.warn('tiktok', `Region restriction detected: ${errorCode || errorMessage}`, { regionCode: detectedRegionCode });
        }
        
        return {
          regionRestricted,
          restrictedFeatures,
          regionCode: detectedRegionCode
        };
      }
      


      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
        if (regionRestricted) {
          restrictedFeatures = ['messaging', 'conversations'];
        }
      }
      
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    }
  } catch (error: any) {

    const errorCode = error.response?.data?.error?.code;
    const errorMessage = error.response?.data?.error?.message || '';
    

    if (!detectedRegionCode && errorMessage) {
      const regionMatch = errorMessage.match(/\b([A-Z]{2})\b/);
      if (regionMatch) {
        detectedRegionCode = regionMatch[1];
      }
    }
    
    if (
      errorCode === 'REGION_NOT_SUPPORTED' ||
      errorCode === 'SERVICE_UNAVAILABLE_IN_REGION' ||
      errorMessage.toLowerCase().includes('not available in your region') ||
      errorMessage.toLowerCase().includes('eea') ||
      errorMessage.toLowerCase().includes('european')
    ) {

      if (detectedRegionCode) {
        regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
      } else {
        regionRestricted = true;
      }
      
      if (regionRestricted) {
        restrictedFeatures = ['messaging', 'conversations'];
      }
      
      logger.warn('tiktok', 'Region restriction detected from error:', errorCode || errorMessage, { regionCode: detectedRegionCode });
      return {
        regionRestricted,
        restrictedFeatures,
        regionCode: detectedRegionCode
      };
    }
    

    if (detectedRegionCode) {
      regionRestricted = EEA_UK_RESTRICTED_REGIONS.includes(detectedRegionCode);
      if (regionRestricted) {
        restrictedFeatures = ['messaging', 'conversations'];
        logger.warn('tiktok', `Detected region ${detectedRegionCode} is in restricted list`);
      }
    }
    

    logger.debug('tiktok', 'Region check inconclusive', { regionCode: detectedRegionCode, regionRestricted });
    return {
      regionRestricted,
      restrictedFeatures,
      regionCode: detectedRegionCode
    };
  }
}





/**
 * Start health monitoring for a connection
 */
function startHealthMonitoring(connectionId: number) {
  stopHealthMonitoring(connectionId);

  (async () => {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      tiktokLog(connectionId, 'HealthMonitor', 'Connection not found, skipping monitoring', 'WARN');
      return;
    }
    const connectionData = connection.connectionData as TikTokConnectionData;
    if (!connectionData?.accessToken?.trim() || !connectionData?.refreshToken?.trim()) {
      tiktokLog(connectionId, 'HealthMonitor', 'Missing accessToken or refreshToken, skipping monitoring', 'WARN');
      return;
    }
  })().then(() => {
    let healthCheckCount = 0;
    const performHealthCheck = async () => {
      try {
        const connection = await storage.getChannelConnection(connectionId);
        if (!connection) {
          stopHealthMonitoring(connectionId);
          return;
        }

        const connectionData = connection.connectionData as TikTokConnectionData;
        const state = getConnectionState(connectionId);
        const timeSinceValidation = state.lastSuccessfulValidation
          ? Date.now() - state.lastSuccessfulValidation.getTime()
          : Infinity;

        if (timeSinceValidation > ACTIVITY_THRESHOLDS.TOKEN_VALIDATION_INTERVAL) {
          const start = Date.now();
          const valid = await validateTokenHealth(connectionId);
          const duration = Date.now() - start;
          if (valid) {
            eventEmitter.emit('healthCheckCompleted', { connectionId, duration });
            const fresh = await storage.getChannelConnection(connectionId);
            if (fresh?.connectionData && typeof fresh.connectionData === 'object') {
              const data = fresh.connectionData as Record<string, unknown>;
              const hcCount = ((data.healthCheckCount as number) ?? 0) + 1;
              const lastHealthCheckAt = Date.now();
              const payload: Record<string, unknown> = { ...data, lastHealthCheckAt };
              if (hcCount % 10 === 0) payload.healthCheckCount = hcCount;
              await storage.updateChannelConnection(connectionId, { connectionData: payload as unknown as TikTokConnectionData }).catch(() => {});
            }
          }
        }

        await ensureValidToken(connectionId);

        if (!state.isActive) {
          state.isActive = true;
          const updated = await storage.updateChannelConnectionStatus(connectionId, 'active');
          emitTikTokEvent('connectionStatusUpdate', { connectionId, status: 'active' });
          if (updated) {
            broadcastTikTokEvent('connectionStatusUpdate', {
              connectionId,
              status: 'active',
              connection: updated
            }, { companyId: updated.companyId, priority: 'normal' });
          }
          tiktokLog(connectionId, 'HealthMonitor', 'Connection marked as active', 'INFO');
        }

        healthCheckCount++;
        if (healthCheckCount % HEALTH_CHECK_HEARTBEAT_INTERVAL === 0) {
          tiktokLog(connectionId, 'HealthMonitor', `Heartbeat: ${healthCheckCount} checks completed`, 'DEBUG');
        }

        const nextInterval = getAdaptiveHealthCheckInterval(state, connectionData?.tokenExpiresAt);
        const timeout = setTimeout(performHealthCheck, nextInterval);
        healthMonitoringIntervals.set(connectionId, timeout);

        const totalIntervals = healthMonitoringIntervals.size;
        if (totalIntervals > 500) {
          tiktokLog(undefined, 'HealthMonitor', `Warning: ${totalIntervals} monitoring intervals active (possible leak)`, 'WARN');
        }
      } catch (error) {
        eventEmitter.emit('healthCheckFailed', {
          connectionId,
          error: error instanceof Error ? error.message : String(error)
        });
        tiktokLog(connectionId, 'HealthMonitor', `Health check error: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
        updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Health check failed');
        const timeout = setTimeout(performHealthCheck, HEALTH_CHECK_INTERVALS.ERROR);
        healthMonitoringIntervals.set(connectionId, timeout);
      }
    };
    performHealthCheck();
  });
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
  const proactiveTimeout = proactiveRefreshTimeouts.get(connectionId);
  if (proactiveTimeout) {
    clearTimeout(proactiveTimeout);
    proactiveRefreshTimeouts.delete(connectionId);
  }
}

/**
 * Validate token health by making a test API call (with cache and timeout)
 */
async function validateTokenHealth(connectionId: number): Promise<boolean> {
  const state = getConnectionState(connectionId);
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) return false;

    const connectionData = connection.connectionData as TikTokConnectionData;
    const accessToken = connectionData.accessToken;
    if (!accessToken) return false;

    const cached = userInfoValidationCache.get(connectionId);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < ACTIVITY_THRESHOLDS.USER_INFO_CACHE_MS) {
      updateConnectionActivity(connectionId, true);
      state.consecutiveValidationFailures = 0;
      return true;
    }

    const timeoutMs = ACTIVITY_THRESHOLDS.VALIDATION_TIMEOUT_MS;
    const userInfo = await Promise.race([
      getUserInfo(accessToken),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Validation timeout')), timeoutMs)
      )
    ]);
    userInfoValidationCache.set(connectionId, { userInfo, cachedAt: now });
    updateConnectionActivity(connectionId, true);
    state.consecutiveValidationFailures = 0;
    tiktokLog(connectionId, 'ValidateToken', 'Token validation successful', 'DEBUG');
    return true;
  } catch (error: any) {
    state.consecutiveValidationFailures = (state.consecutiveValidationFailures ?? 0) + 1;
    eventEmitter.emit('healthCheckFailed', {
      connectionId,
      error: error.message,
      consecutiveFailures: state.consecutiveValidationFailures
    });
    tiktokLog(connectionId, 'ValidateToken', `Validation failed: ${error.message}`, 'WARN');

    if (error.message === 'Validation timeout') {
      tiktokLog(connectionId, 'ValidateToken', 'Soft failure (timeout), will retry next interval', 'DEBUG');
      return false;
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      await handleTokenExpiration(connectionId);
    } else {
      updateConnectionActivity(connectionId, false, error.message);
    }
    return false;
  }
}

/**
 * Handle token expiration: attempt one final refresh before marking error; notify tenant
 */
async function handleTokenExpiration(connectionId: number): Promise<void> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) return;
    const connectionData = connection.connectionData as TikTokConnectionData;

    try {
      const tokenResponse = await refreshAccessToken(connectionData.refreshToken, connectionId);
      const now = Date.now();
      const newExpiresAt = now + tokenResponse.expires_in * 1000;
      const updatedData: TikTokConnectionData = {
        ...connectionData,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: newExpiresAt,
        lastSyncAt: now,
        tokenRefreshedAt: now,
        tokenRefreshAttempts: 0,
        status: 'active',
        lastError: undefined
      };
      await storage.updateChannelConnection(connectionId, {
        accessToken: tokenResponse.access_token,
        connectionData: updatedData
      });
      await storage.updateChannelConnectionStatus(connectionId, 'active');
      const state = getConnectionState(connectionId);
      state.isActive = true;
      state.lastError = null;
      emitTikTokEvent('tokenRecovered', { connectionId });
      eventEmitter.emit('tokenRecovered', { connectionId });
      broadcastTikTokEvent('connectionStatusUpdate', {
        connectionId,
        status: 'active',
        connection: await storage.getChannelConnection(connectionId)
      }, { companyId: connection.companyId, priority: 'high' });
      tiktokLog(connectionId, 'TokenExpiration', 'Recovered via final refresh', 'INFO');
      return;
    } catch (refreshErr: any) {
      const isRefreshInvalid =
        refreshErr?.response?.status === 400 ||
        refreshErr?.response?.data?.error?.code === 'invalid_refresh_token' ||
        /refresh.*invalid|expired/i.test(refreshErr?.message || '');
      const reason = isRefreshInvalid ? 'REFRESH_TOKEN_INVALID' : 'TOKEN_EXPIRED';
      const lastErrorMsg = reason === 'REFRESH_TOKEN_INVALID'
        ? 'Refresh token invalid or revoked; re-authentication required'
        : 'Access token expired or invalid';
      const conn = await storage.updateChannelConnectionStatus(connectionId, 'error');
      const state = getConnectionState(connectionId);
      state.lastError = lastErrorMsg;
      state.isActive = false;
      const data = connection.connectionData as Record<string, unknown>;
      await storage.updateChannelConnection(connectionId, {
        connectionData: { ...data, lastError: reason } as TikTokConnectionData
      }).catch(() => {});

      emitTikTokEvent('connectionError', {
        connectionId,
        error: lastErrorMsg,
        requiresReauth: true,
        reason
      });
      if (conn) {
        broadcastTikTokEvent('connectionError', {
          connectionId,
          status: 'error',
          error: lastErrorMsg,
          requiresReauth: true,
          connection: conn
        }, { companyId: conn.companyId, priority: 'high' });
      }
      tiktokLog(connectionId, 'TokenExpiration', lastErrorMsg, 'ERROR', { reason });
    }
  } catch (error) {
    tiktokLog(connectionId, 'TokenExpiration', `Error handling expiration: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
  }
}

/**
 * Initiate connection recovery with stages and error-type strategies
 */
async function initiateConnectionRecovery(connectionId: number, lastErrorStatus?: number): Promise<void> {
  const state = getConnectionState(connectionId);

  if (state.isRecovering) return;

  if (state.recoveryAttempts >= ACTIVITY_THRESHOLDS.MAX_RECOVERY_ATTEMPTS) {
    tiktokLog(connectionId, 'Recovery', 'Max recovery attempts reached', 'ERROR');
    await storage.updateChannelConnectionStatus(connectionId, 'error');
    eventEmitter.emit('recoveryFailed', { connectionId, reason: 'max_attempts' });
    return;
  }

  const recoveryStartedAt = Date.now();
  state.isRecovering = true;
  state.recoveryAttempts++;
  state.lastRecoveryAttempt = new Date();
  state.recoveryStage = 'validating';
  eventEmitter.emit('recoveryStarted', { connectionId, attempt: state.recoveryAttempts });
  tiktokLog(connectionId, 'Recovery', `Starting recovery (attempt ${state.recoveryAttempts})`, 'INFO');

  let backoffDelay = ACTIVITY_THRESHOLDS.RECOVERY_BACKOFF_BASE * Math.pow(2, state.recoveryAttempts - 1);
  if (lastErrorStatus === 401 || lastErrorStatus === 403) {
    backoffDelay = 0;
  } else if (lastErrorStatus === 429) {
    backoffDelay = Math.max(backoffDelay, 60000);
  }

  const recoveryTimeout = setTimeout(async () => {
    try {
      if (Date.now() - recoveryStartedAt > ACTIVITY_THRESHOLDS.MAX_RECOVERY_TIME_MS) {
        state.isRecovering = false;
        state.recoveryStage = null;
        tiktokLog(connectionId, 'Recovery', 'Recovery time limit (30 min) exceeded', 'ERROR');
        await storage.updateChannelConnectionStatus(connectionId, 'error');
        eventEmitter.emit('recoveryFailed', { connectionId, reason: 'timeout' });
        recoveryTimeouts.delete(connectionId);
        return;
      }

      state.recoveryStage = 'refreshing_token';
      eventEmitter.emit('recoveryProgress', { connectionId, stage: 'refreshing_token' });
      await ensureValidToken(connectionId);

      state.recoveryStage = 'testing_connection';
      eventEmitter.emit('recoveryProgress', { connectionId, stage: 'testing_connection' });
      const isValid = await validateTokenHealth(connectionId);

      if (isValid) {
        state.recoveryStage = 'recovered';
        state.isRecovering = false;
        state.recoveryStage = null;
        eventEmitter.emit('recoverySucceeded', { connectionId });
        updateConnectionActivity(connectionId, true);
        recoveryTimeouts.delete(connectionId);
        tiktokLog(connectionId, 'Recovery', 'Recovered successfully', 'INFO');
      } else {
        eventEmitter.emit('recoveryProgress', { connectionId, stage: 'validating' });
        updateConnectionActivity(connectionId, false, 'Recovery validation failed');
        recoveryTimeouts.delete(connectionId);
        state.isRecovering = false;
        state.recoveryStage = null;
        initiateConnectionRecovery(connectionId);
      }
    } catch (error) {
      tiktokLog(connectionId, 'Recovery', `Recovery error: ${error instanceof Error ? error.message : 'Unknown'}`, 'ERROR');
      updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Recovery failed');
      recoveryTimeouts.delete(connectionId);
      state.isRecovering = false;
      state.recoveryStage = null;
      eventEmitter.emit('recoveryFailed', { connectionId, reason: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }, backoffDelay);

  recoveryTimeouts.set(connectionId, recoveryTimeout);
}

/**
 * Get health monitoring statistics for admin dashboards
 */
function getHealthMonitoringStats(): {
  totalMonitored: number;
  byStatus: Record<string, number>;
  averageIntervalMs: number;
  tokenRefreshesLast24h: number;
  connectionIds: number[];
} {
  const connectionIds = Array.from(healthMonitoringIntervals.keys());
  const totalMonitored = connectionIds.length;
  const byStatus: Record<string, number> = {};
  let tokenRefreshesLast24h = 0;
  const now = Date.now();
  for (const cid of connectionIds) {
    const state = connectionStates.get(cid);
    const status = state?.isActive ? 'active' : (state?.isRecovering ? 'recovering' : 'error');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const bucket = tokenRefreshCount24h.get(cid);
    if (bucket && bucket.resetAt > now) tokenRefreshesLast24h += bucket.count;
  }
  const intervals = [HEALTH_CHECK_INTERVALS.ACTIVE, HEALTH_CHECK_INTERVALS.ERROR, HEALTH_CHECK_INTERVALS.RECOVERY, HEALTH_CHECK_INTERVALS.TOKEN_EXPIRING];
  const averageIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return {
    totalMonitored,
    byStatus,
    averageIntervalMs,
    tokenRefreshesLast24h,
    connectionIds
  };
}

let dailySummaryScheduled = false;
function scheduleDailySummary(): void {
  if (dailySummaryScheduled) return;
  dailySummaryScheduled = true;
  const run = () => {
    const stats = getHealthMonitoringStats();
    tiktokLog(undefined, 'Summary', `TikTok Health Monitoring Summary: ${stats.totalMonitored} connections active, ${stats.tokenRefreshesLast24h} tokens refreshed (24h), errors by status: ${JSON.stringify(stats.byStatus)}`, 'INFO');
  };
  const nextMidnight = new Date();
  nextMidnight.setUTCHours(24, 0, 0, 0);
  setTimeout(() => { run(); setInterval(run, 86400000); }, nextMidnight.getTime() - Date.now());
}

const BATCH_TOKEN_REFRESH_SIZE = 10;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Get connections that need token refresh (tokenExpiresAt < now + 12h) - safety net for hourly batch.
 * Uses indexed query on token expiry to avoid full-table scans.
 */
async function getConnectionsNeedingTokenRefresh(): Promise<number[]> {
  const now = Date.now();
  const threshold = now + TWELVE_HOURS_MS;
  return storage.getTikTokConnectionIdsNeedingTokenRefresh(threshold);
}

let batchTokenRefreshInterval: NodeJS.Timeout | null = null;

/**
 * Run batch token refresh once per hour (safety net)
 */
async function runBatchTokenRefresh(): Promise<void> {
  try {
    const ids = await getConnectionsNeedingTokenRefresh();
    if (ids.length === 0) return;
    tiktokLog(undefined, 'BatchRefresh', `Safety net: ${ids.length} connection(s) need token refresh`, 'INFO');
    for (let i = 0; i < ids.length; i += BATCH_TOKEN_REFRESH_SIZE) {
      const batch = ids.slice(i, i + BATCH_TOKEN_REFRESH_SIZE);
      await Promise.all(batch.map((connectionId) => ensureValidToken(connectionId).catch((err) => {
        tiktokLog(connectionId, 'BatchRefresh', `Failed: ${err instanceof Error ? err.message : 'Unknown'}`, 'WARN');
      })));
    }
  } catch (err) {
    tiktokLog(undefined, 'BatchRefresh', `Batch refresh error: ${err instanceof Error ? err.message : 'Unknown'}`, 'ERROR');
  }
}

function startBatchTokenRefreshInterval(): void {
  if (batchTokenRefreshInterval) return;
  batchTokenRefreshInterval = setInterval(runBatchTokenRefresh, 3600000);
  tiktokLog(undefined, 'BatchRefresh', 'Hourly batch token refresh safety net started', 'DEBUG');
}

function stopBatchTokenRefreshInterval(): void {
  if (batchTokenRefreshInterval) {
    clearInterval(batchTokenRefreshInterval);
    batchTokenRefreshInterval = null;
  }
}

const MESSAGING_WINDOW_EXPIRATION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let messagingWindowExpirationInterval: NodeJS.Timeout | null = null;

/**
 * Run periodic check: mark TikTok conversations as window closed when messagingWindowExpiresAt has passed.
 * Broadcasts conversationUpdated so UI can disable reply box.
 */
async function runMessagingWindowExpirationCheck(): Promise<void> {
  try {
    const db = getDb();
    const now = Date.now();
    const expired = await db
      .select({ id: conversations.id, companyId: conversations.companyId, groupMetadata: conversations.groupMetadata })
      .from(conversations)
      .where(
        and(
          eq(conversations.channelType, 'tiktok'),
          sql`${conversations.groupMetadata}->>'messagingWindowStatus' = 'open'`,
          sql`(${conversations.groupMetadata}->>'messagingWindowExpiresAt')::bigint < ${now}`
        )
      );
    if (expired.length === 0) return;
    logger.info('tiktok', `Messaging window expiration: updating ${expired.length} conversation(s) to closed`);
    for (const row of expired) {
      try {
        const currentMetadata = (row.groupMetadata as TikTokConversationMetadata) || {};
        await storage.updateConversation(row.id, {
          groupMetadata: {
            ...currentMetadata,
            messagingWindowStatus: 'closed',
            conversationState: 'window_closed'
          }
        });
        const updated = await storage.getConversation(row.id);
        if (updated && row.companyId) {
          broadcastTikTokEvent('conversationUpdated', updated, {
            companyId: row.companyId,
            conversationId: row.id,
            priority: 'normal'
          });
        }
      } catch (err) {
        logger.error('tiktok', 'Error updating conversation window status', { conversationId: row.id, err });
      }
    }
  } catch (err) {
    logger.error('tiktok', 'Error in messaging window expiration check', err);
  }
}

function startMessagingWindowExpirationWorker(): void {
  if (messagingWindowExpirationInterval) return;
  runMessagingWindowExpirationCheck();
  messagingWindowExpirationInterval = setInterval(
    runMessagingWindowExpirationCheck,
    MESSAGING_WINDOW_EXPIRATION_CHECK_INTERVAL_MS
  );
  logger.info('tiktok', 'Messaging window expiration worker started (hourly)');
}

/**
 * Stop all health monitoring (graceful shutdown)
 */
function stopAllHealthMonitoring(): void {
  let intervalsStopped = 0;
  for (const [connectionId, timeout] of healthMonitoringIntervals) {
    clearTimeout(timeout);
    intervalsStopped++;
  }
  healthMonitoringIntervals.clear();
  for (const [connectionId, timeout] of proactiveRefreshTimeouts) {
    clearTimeout(timeout);
  }
  proactiveRefreshTimeouts.clear();
  for (const [, timeout] of recoveryTimeouts) {
    clearTimeout(timeout);
  }
  recoveryTimeouts.clear();
  connectionStates.clear();
  stopBatchTokenRefreshInterval();
  tiktokLog(undefined, 'Shutdown', `Stopped ${intervalsStopped} health monitoring interval(s)`, 'INFO');
}

/**
 * Manually trigger token refresh for testing (admin)
 */
async function testTokenRefresh(connectionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureValidToken(connectionId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Manually run a health check for testing (admin)
 */
async function testHealthCheck(connectionId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const valid = await validateTokenHealth(connectionId);
    return { success: valid };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get detailed health monitoring status for a connection (admin)
 */
function getHealthMonitoringStatus(connectionId: number): {
  monitored: boolean;
  nextCheckInMs: number | null;
  lastCheckResult: 'success' | 'failure' | 'unknown';
  intervalMs: number;
  state: Partial<ConnectionState>;
} | null {
  const state = connectionStates.get(connectionId);
  const hasInterval = healthMonitoringIntervals.has(connectionId);
  const interval = hasInterval ? HEALTH_CHECK_INTERVALS.ACTIVE : 0;
  return {
    monitored: hasInterval,
    nextCheckInMs: hasInterval ? interval : null,
    lastCheckResult: state?.lastSuccessfulValidation ? 'success' : (state?.lastError ? 'failure' : 'unknown'),
    intervalMs: interval,
    state: state ? {
      isActive: state.isActive,
      consecutiveFailures: state.consecutiveFailures,
      consecutiveValidationFailures: state.consecutiveValidationFailures,
      isRecovering: state.isRecovering,
      recoveryStage: state.recoveryStage,
      scheduledRefreshAt: state.scheduledRefreshAt
    } : {}
  };
}

/**
 * Find or create a contact for a TikTok user
 * @param companyId The company ID for multi-tenant security
 * @param participantId The TikTok user open_id
 * @param participantData Optional user info from TikTok API
 * @returns The contact object
 */
async function findOrCreateContact(
  companyId: number,
  participantId: string,
  participantData?: TikTokUserInfo
): Promise<any> {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }

  let contact = await storage.getContactByIdentifier(participantId, 'tiktok');
  
  if (!contact) {
    const contactData: InsertContact = {
      companyId: companyId,
      name: participantData?.display_name || `TikTok User ${participantId.substring(0, 6)}...`,
      phone: null,
      email: null,
      avatarUrl: participantData?.avatar_url || participantData?.avatar_large_url || null,
      identifier: participantId,
      identifierType: 'tiktok',
      source: 'tiktok',
      notes: participantData?.bio_description || null
    };

    contact = await storage.getOrCreateContact(contactData);
    logger.info('tiktok', `Created new contact: ${contact.id} for TikTok user ${participantId}`);
  } else {

    if (participantData) {
      const updates: Partial<InsertContact> = {};
      if (participantData.display_name && contact.name.startsWith('TikTok User')) {
        updates.name = participantData.display_name;
      }
      if (participantData.avatar_url && !contact.avatarUrl) {
        updates.avatarUrl = participantData.avatar_url;
      }
      if (Object.keys(updates).length > 0) {
        contact = await storage.updateContact(contact.id, updates);
      }
    }
  }

  return contact;
}

/**
 * Find or create a conversation for a TikTok user
 * @param connectionId The channel connection ID
 * @param participantId The TikTok user open_id
 * @param companyId The company ID for multi-tenant security
 * @param conversationExternalId Optional TikTok conversation_id
 * @returns The conversation object
 */
async function findOrCreateConversation(
  connectionId: number,
  participantId: string,
  companyId: number,
  conversationExternalId?: string
): Promise<any> {
  if (!companyId) {
    throw new Error('Company ID is required for multi-tenant security');
  }

  const contact = await findOrCreateContact(companyId, participantId);

  let conversation: any = undefined;


  if (conversationExternalId) {
    const db = getDb();
    const [foundByExternalId] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelId, connectionId),
          eq(conversations.channelType, 'tiktok'),
          eq(conversations.companyId, companyId),
          sql`${conversations.groupMetadata}->>'tiktokConversationId' = ${conversationExternalId}`
        )
      )
      .limit(1);
    
    if (foundByExternalId) {
      conversation = foundByExternalId;
      logger.info('tiktok', `Found conversation ${conversation.id} by external ID ${conversationExternalId}`);
    }
  }


  if (!conversation) {
    conversation = await storage.getConversationByContactAndChannel(
      contact.id,
      connectionId
    );
  }

  if (!conversation) {
    const conversationData: InsertConversation = {
      companyId: companyId,
      contactId: contact.id,
      channelId: connectionId,
      channelType: 'tiktok',
      status: 'open',
      assignedToUserId: null,
      lastMessageAt: new Date(),
      ...(conversationExternalId && {
        groupMetadata: { tiktokConversationId: conversationExternalId }
      })
    };

    conversation = await storage.createConversation(conversationData);
    logger.info('tiktok', `Created new conversation: ${conversation.id} for TikTok user ${participantId}${conversationExternalId ? ` with external ID ${conversationExternalId}` : ''}`);
  } else if (conversationExternalId) {

    const currentMetadata = (conversation.groupMetadata as any) || {};
    if (!currentMetadata.tiktokConversationId) {
      await storage.updateConversation(conversation.id, {
        groupMetadata: { ...currentMetadata, tiktokConversationId: conversationExternalId }
      });
      logger.info('tiktok', `Updated conversation ${conversation.id} with external ID ${conversationExternalId}`);
    }
  }

  return conversation;
}

const MESSAGING_WINDOW_HOURS_DEFAULT = 48;
const MESSAGING_WINDOW_MS = MESSAGING_WINDOW_HOURS_DEFAULT * 60 * 60 * 1000;

/**
 * Check if the messaging window is still open for a conversation
 * TikTok enforces a 24-48 hour window after last user interaction
 * @param conversationId Internal conversation ID
 * @param windowHours Window duration in hours (default: 48)
 * @returns Object with window status and metadata
 */
async function checkMessagingWindow(
  conversationId: number,
  windowHours: number = MESSAGING_WINDOW_HOURS_DEFAULT
): Promise<{
  isOpen: boolean;
  status: 'open' | 'closed' | 'expired';
  expiresAt?: number;
  lastInteractionAt?: number;
  reason?: string;
}> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    return {
      isOpen: false,
      status: 'expired',
      reason: 'Conversation not found'
    };
  }
  if (conversation.channelType !== 'tiktok') {
    return {
      isOpen: false,
      status: 'closed',
      reason: 'Not a TikTok conversation'
    };
  }

  const metadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
  const conversationState = metadata.conversationState;

  if (conversationState === 'user_blocked') {
    return {
      isOpen: false,
      status: 'closed',
      lastInteractionAt: metadata.lastUserInteractionAt,
      expiresAt: metadata.messagingWindowExpiresAt,
      reason: 'User has blocked the business'
    };
  }
  if (conversationState === 'expired' || metadata.messagingWindowStatus === 'closed') {
    return {
      isOpen: false,
      status: 'closed',
      lastInteractionAt: metadata.lastUserInteractionAt,
      expiresAt: metadata.messagingWindowExpiresAt,
      reason: 'Messaging window has closed'
    };
  }

  let lastInteractionAt: number | undefined = metadata.lastUserInteractionAt;
  if (lastInteractionAt == null) {
    const msgs = await storage.getMessagesByConversation(conversationId);
    const lastInbound = msgs
      .filter((m) => m.direction === 'inbound')
      .sort((a, b) => (b.createdAt ? b.createdAt.getTime() : 0) - (a.createdAt ? a.createdAt.getTime() : 0))[0];
    if (lastInbound?.createdAt) {
      lastInteractionAt = lastInbound.createdAt.getTime();
    } else if (conversation.lastMessageAt) {
      lastInteractionAt = conversation.lastMessageAt.getTime();
    }
  }

  if (lastInteractionAt == null) {
    return {
      isOpen: true,
      status: 'open',
      reason: 'New conversation, no prior user message'
    };
  }

  const windowMs = windowHours * 60 * 60 * 1000;
  const expiresAt = lastInteractionAt + windowMs;
  const now = Date.now();
  const isOpen = now < expiresAt;
  const status: 'open' | 'closed' | 'expired' = isOpen ? 'open' : (conversationState === 'window_closed' ? 'closed' : 'expired');

  return {
    isOpen,
    status,
    expiresAt,
    lastInteractionAt,
    reason: isOpen ? undefined : '48-hour messaging window has closed'
  };
}

/**
 * Get conversation metadata including messaging window status
 * Used by UI to determine if reply box should be enabled
 * @param conversationId Internal conversation ID
 * @returns Conversation metadata with window status
 */
async function getConversationMetadata(conversationId: number): Promise<{
  windowStatus: 'open' | 'closed' | 'expired';
  canReply: boolean;
  expiresAt?: number;
  lastInteractionAt?: number;
  conversationState: string;
}> {
  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    return {
      windowStatus: 'expired',
      canReply: false,
      conversationState: 'unknown'
    };
  }
  const metadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
  const windowCheck = await checkMessagingWindow(conversationId);
  return {
    windowStatus: windowCheck.status,
    canReply: windowCheck.isOpen,
    expiresAt: windowCheck.expiresAt,
    lastInteractionAt: windowCheck.lastInteractionAt,
    conversationState: metadata.conversationState ?? 'active'
  };
}

/**
 * Update conversation's messaging window status (e.g. when API returns window expired)
 */
async function updateConversationWindowStatus(
  conversationId: number,
  status: 'open' | 'closed' | 'expired'
): Promise<void> {
  try {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || conversation.channelType !== 'tiktok') return;
    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    const conversationState: TikTokConversationMetadata['conversationState'] =
      status === 'closed' || status === 'expired' ? 'window_closed' : 'active';
    await storage.updateConversation(conversationId, {
      groupMetadata: {
        ...currentMetadata,
        messagingWindowStatus: status,
        conversationState
      }
    });
  } catch (err) {
    logger.error('tiktok', 'Error updating conversation window status', { conversationId, status, err });
  }
}

/**
 * List conversations from TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param cursor Optional pagination cursor
 * @param limit Optional limit for results (default: 20)
 * @returns List of conversations with pagination info
 */
async function listConversations(
  connectionId: number,
  companyId: number,
  cursor?: string,
  limit: number = 20
): Promise<{ conversations: TikTokConversation[]; next_cursor?: string; has_more: boolean }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }


    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }

    const connectionData = connection.connectionData as TikTokConnectionData;
    if (!connectionData?.accessToken) {
      throw new Error('Access token not found in connection data');
    }

    const accessToken = await ensureValidToken(connectionId);
    const platformConfig = await getPlatformConfig();
    const apiBaseUrl = platformConfig.apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL;

    const queryParams: Record<string, string> = {
      limit: limit.toString()
    };
    if (cursor) {
      queryParams.cursor = cursor;
    }

    const response = await axios.get(
      `${apiBaseUrl}/business/conversations/`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: queryParams,
        timeout: 10000
      }
    );

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Listed conversations via connection ${connectionId}`);

    return {
      conversations: response.data.conversations || [],
      next_cursor: response.data.next_cursor,
      has_more: !!response.data.next_cursor
    };
  } catch (error) {
    logger.error('tiktok', `Error listing conversations via connection ${connectionId}:`, error);
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'List conversations failed');
    throw handleTikTokError(error);
  }
}

/**
 * Get messages from a TikTok conversation
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id
 * @param cursor Optional pagination cursor
 * @param limit Optional limit for results (default: 50)
 * @param retryCount Internal retry counter to prevent unbounded recursion (default: 0, max: 1)
 * @returns List of messages with pagination info
 */
async function getMessages(
  connectionId: number,
  companyId: number,
  conversationId: string,
  cursor?: string,
  limit: number = 50,
  retryCount: number = 0
): Promise<{ messages: TikTokMessage[]; next_cursor?: string; has_more: boolean }> {
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }


    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }

    const connectionData = connection.connectionData as TikTokConnectionData;
    if (!connectionData?.accessToken) {
      throw new Error('Access token not found in connection data');
    }

    const accessToken = await ensureValidToken(connectionId);
    const platformConfig = await getPlatformConfig();
    const apiBaseUrl = platformConfig.apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL;

    const queryParams: Record<string, string> = {
      limit: limit.toString()
    };
    if (cursor) {
      queryParams.cursor = cursor;
    }

    const response = await axios.get(
      `${apiBaseUrl}/business/conversations/${conversationId}/messages/`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: queryParams,
        timeout: 10000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      }
    );

    if (response.status === 404) {
      const error: any = new Error('Conversation not found or expired');
      error.response = { status: 404, data: { error: { code: 'conversation_not_found', message: 'The conversation was not found or has expired' } } };
      throw error;
    }

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Retrieved messages for conversation ${conversationId} via connection ${connectionId}`);

    return {
      messages: response.data.messages || [],
      next_cursor: response.data.next_cursor,
      has_more: !!response.data.next_cursor
    };
  } catch (error) {
    logger.error('tiktok', `Error getting messages for conversation ${conversationId} via connection ${connectionId}:`, error);
    

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (isRetryableError(axiosError.response?.status || 0)) {

        if (retryCount < 1) {

          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            return await getMessages(connectionId, companyId, conversationId, cursor, limit, retryCount + 1);
          } catch (retryError) {
            updateConnectionActivity(connectionId, false, retryError instanceof Error ? retryError.message : 'Get messages failed');
            throw handleTikTokError(retryError);
          }
        } else {

          updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Get messages failed');
          throw handleTikTokError(error);
        }
      }
    }

    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Get messages failed');
    throw handleTikTokError(error);
  }
}

/**
 * Send a message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param messageType The type of message ('text' | 'image' | 'video' | 'sticker')
 * @param content The message content object with appropriate fields
 * @returns The API response with message_id
 */
async function sendMessage(
  connectionId: number,
  conversationId: string,
  recipientId: string,
  messageType: 'text' | 'image' | 'video' | 'sticker',
  content: {
    text?: string;
    image_url?: string;
    video_url?: string;
    sticker_id?: string;
    thumbnail_url?: string;
  }
): Promise<{ message_id: string; status: string }> {
  try {
    const accessToken = await ensureValidToken(connectionId);
    const platformConfig = await getPlatformConfig();
    const apiBaseUrl = platformConfig.apiBaseUrl || TIKTOK_BUSINESS_API_BASE_URL;


    const messageRequest: any = {
      recipient_id: recipientId,
      message_type: messageType,
      content: {}
    };


    if (messageType === 'text' && content.text) {
      messageRequest.content.text = content.text;
    } else if (messageType === 'image' && content.image_url) {
      messageRequest.content.image_url = content.image_url;
    } else if (messageType === 'video' && content.video_url) {
      messageRequest.content.video_url = content.video_url;
      if (content.thumbnail_url) {
        messageRequest.content.thumbnail_url = content.thumbnail_url;
      }
    } else if (messageType === 'sticker' && content.sticker_id) {
      messageRequest.content.sticker_id = content.sticker_id;
    }

    const response = await axios.post(
      `${apiBaseUrl}/business/conversations/${conversationId}/messages/`,
      messageRequest,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    updateConnectionActivity(connectionId, true);
    logger.info('tiktok', `Message sent successfully via connection ${connectionId}`);

    return {
      message_id: response.data.message_id,
      status: response.data.status || 'sent'
    };
  } catch (error) {
    logger.error('tiktok', `Error sending message via connection ${connectionId}:`, error);
    updateConnectionActivity(connectionId, false, error instanceof Error ? error.message : 'Send message failed');
    throw handleTikTokError(error);
  }
}

/**
 * Send a message and save to database
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string) - will find or create internal conversation
 * @param recipientId The TikTok user open_id
 * @param userId The user ID sending the message
 * @param messageType The type of message ('text' | 'image' | 'video' | 'sticker')
 * @param content The message content (text string or media URL/sticker ID)
 * @param thumbnailUrl Optional thumbnail URL for video messages
 * @returns The saved message object
 */
async function sendAndSaveMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  userId: number,
  messageType: 'text' | 'image' | 'video' | 'sticker' = 'text',
  content: string,
  thumbnailUrl?: string
): Promise<any> {
  let conversation: any;
  try {
    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }


    if (connection.companyId !== companyId) {
      throw new Error('Unauthorized: Connection does not belong to this company');
    }


    const contentObj: {
      text?: string;
      image_url?: string;
      video_url?: string;
      sticker_id?: string;
      thumbnail_url?: string;
    } = {};

    if (messageType === 'text') {
      contentObj.text = content;
    } else if (messageType === 'image') {
      contentObj.image_url = content;
    } else if (messageType === 'video') {
      contentObj.video_url = content;
      if (thumbnailUrl) {
        contentObj.thumbnail_url = thumbnailUrl;
      }
    } else if (messageType === 'sticker') {
      contentObj.sticker_id = content;
    }


    conversation = await findOrCreateConversation(
      connectionId,
      recipientId,
      companyId,
      conversationId
    );


    const windowCheck = await checkMessagingWindow(conversation.id);
    if (!windowCheck.isOpen) {
      const err: any = new Error(
        windowCheck.reason ?? 'Cannot send message: 48-hour messaging window has closed'
      );
      err.code = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
      err.windowStatus = {
        expiresAt: windowCheck.expiresAt,
        lastInteractionAt: windowCheck.lastInteractionAt,
        status: windowCheck.status
      };
      logger.info('tiktok', 'Messaging window check failed before send', {
        conversationId: conversation.id,
        status: windowCheck.status,
        reason: windowCheck.reason
      });
      throw err;
    }


    const sendResponse = await sendMessage(
      connectionId,
      conversationId,
      recipientId,
      messageType,
      contentObj
    );


    const messageContent = messageType === 'text' ? content : content; // For media, store URL


    const messageData: InsertMessage = {
      conversationId: conversation.id,
      direction: 'outbound',
      type: messageType,
      content: messageContent,
      senderId: userId,
      senderType: 'user',
      externalId: sendResponse.message_id,
      status: 'sent',
      metadata: JSON.stringify({
        platform: 'tiktok',
        recipientId: recipientId,
        tiktok_conversation_id: conversationId,
        api_response: sendResponse
      }),
      createdAt: new Date()
    };

    const savedMessage = await storage.createMessage(messageData);


    await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date()
    });


    trackMessageStatus(
      savedMessage.id,
      savedMessage.externalId || '',
      conversation.id,
      'sent'
    );


    if (messageType === 'text') {
      await addMentionsToMessage(
        savedMessage.id,
        messageContent,
        userId,
        conversation.id,
        companyId
      );
    }


    emitTikTokEvent('messageSent', {
      connectionId,
      conversationId: conversation.id,
      message: savedMessage,
      conversation: conversation
    });

    broadcastTikTokEvent('newMessage', savedMessage, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'high'
    });

    broadcastTikTokEvent('conversationUpdated', conversation, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'normal'
    });

    broadcastTikTokEvent('messageStatusUpdate', {
      messageId: savedMessage.id,
      conversationId: conversation.id,
      status: 'sent',
      sentAt: new Date()
    }, {
      companyId: companyId,
      conversationId: conversation.id,
      priority: 'normal'
    });

    logger.info('tiktok', `Message saved to database: ${savedMessage.id}`);
    return savedMessage;
  } catch (error: any) {
    const isWindowExpired =
      error?.error?.code === TikTokErrorCode.MESSAGE_WINDOW_EXPIRED ||
      error?.code === TikTokErrorCode.MESSAGE_WINDOW_EXPIRED ||
      (axios.isAxiosError(error) &&
        error.response?.status === 403 &&
        (error.response?.data as any)?.error?.code === 'conversation_expired');
    if (isWindowExpired && conversation) {
      await updateConversationWindowStatus(conversation.id, 'closed');
    }
    logger.error('tiktok', `Error in sendAndSaveMessage:`, error);
    if (axios.isAxiosError(error)) {
      const apiErr = handleTikTokError(error);
      const err = new Error(apiErr.error.message) as Error & { error: TikTokAPIError['error'] };
      err.error = apiErr.error;
      throw err;
    }
    throw error;
  }
}

/**
 * Send an image message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param imageUrl The URL of the image to send
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendImageMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  imageUrl: string,
  userId: number
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'image',
    imageUrl
  );
}

/**
 * Send a video message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param videoUrl The URL of the video to send
 * @param thumbnailUrl Optional thumbnail URL for the video
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendVideoMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  videoUrl: string,
  userId: number,
  thumbnailUrl?: string
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'video',
    videoUrl,
    thumbnailUrl
  );
}

/**
 * Send a sticker message via TikTok Business Messaging API
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @param conversationId The TikTok conversation_id (string)
 * @param recipientId The TikTok user open_id
 * @param stickerId The ID of the sticker to send
 * @param userId The user ID sending the message
 * @returns The saved message object
 */
async function sendStickerMessage(
  connectionId: number,
  companyId: number,
  conversationId: string,
  recipientId: string,
  stickerId: string,
  userId: number
): Promise<any> {
  return await sendAndSaveMessage(
    connectionId,
    companyId,
    conversationId,
    recipientId,
    userId,
    'sticker',
    stickerId
  );
}





/**
 * Process incoming webhook event from TikTok (Business Messaging API)
 * user_deletion is processed async so the webhook can return 200 OK immediately (idempotency inside handler).
 */
async function processWebhookEvent(payload: any, webhookContext?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  try {
    logger.debug('tiktok', 'Processing webhook event:', JSON.stringify(payload, null, 2));

    const eventType = payload.event ?? payload.event_type ?? payload.type;

    switch (eventType) {
      case 'im.message.receive':
      case 'message':
      case 'message.received':
        await handleIncomingMessage(payload);
        break;

      case 'message.delivered':
        await handleMessageDelivered(payload);
        break;

      case 'message.read':
        await handleMessageRead(payload);
        break;

      case 'message.failed':
        await handleMessageFailed(payload);
        break;

      case 'user_deletion':
        logTikTokWebhookEvent('user_deletion', 'received', { payload });
        setImmediate(() => {
          handleUserDeletion(payload, webhookContext).then(() => {
            logTikTokWebhookEvent('user_deletion', 'success', { payload });
          }).catch((err) => {
            logger.error('tiktok', 'user_deletion async error', err);
            logTikTokWebhookEvent('user_deletion', 'error', { payload, error: String(err) });
          });
        });
        break;

      case 'conversation.updated':
        await handleConversationUpdated(payload);
        break;

      default:
        logger.warn('tiktok', `Unknown webhook event type: ${eventType}`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error processing webhook event:', error);
    throw error;
  }
}

/**
 * Handle incoming message from TikTok user (Business Messaging API)
 */
async function handleIncomingMessage(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const from_user_id = content.from_user_id ?? payload.sender?.id ?? payload.message?.from?.id;
    const to_user_id = content.to_user_id ?? payload.recipient?.id ?? payload.message?.to?.id;
    const message_id = content.message_id ?? payload.message_id ?? payload.message?.id ?? payload.message?.message_id;
    const conversation_id = content.conversation_id ?? payload.conversation_id;
    const message_type = content.message_type ?? payload.message?.type ?? 'text';

    let messageContent = content.text ?? content.content ?? payload.message?.text ?? payload.message?.content ?? '';
    if (message_type === 'image' && content.image_url) {
      messageContent = content.image_url;
    } else if (message_type === 'video' && content.video_url) {
      messageContent = content.video_url;
    } else if (message_type === 'sticker' && content.sticker_id) {
      messageContent = content.sticker_id;
    }

    if (!from_user_id || !to_user_id || !message_id) {
      logger.warn('tiktok', 'Incoming message missing required fields', { from_user_id, to_user_id, message_id });
      return;
    }

    const connections = await storage.getChannelConnectionsByType('tiktok');
    let connection = connections.find(conn => {
      const data = conn.connectionData as TikTokConnectionData;
      return data?.businessAccountId === to_user_id;
    });
    const matchedViaBusinessAccountId = !!connection;
    if (!connection) {
      connection = connections.find(conn => {
        const data = conn.connectionData as TikTokConnectionData;
        return data?.accountId === to_user_id || (data as any)?.openId === to_user_id || (data as any)?.unionId === to_user_id;
      });
    }

    if (!connection) {
      logger.warn('tiktok', 'Multi-tenant routing: no connection found for to_user_id', {
        to_user_id,
        conversation_id,
        message_id
      });
      return;
    }

    const companyId = connection.companyId ?? undefined;
    if (companyId == null) {
      logger.warn('tiktok', 'Connection has no companyId', { connectionId: connection.id, to_user_id });
      return;
    }
    if (matchedViaBusinessAccountId) {
      logger.debug('tiktok', 'Multi-tenant routing: to_user_id matched connection via businessAccountId', {
        to_user_id,
        connectionId: connection.id,
        companyId,
        conversation_id,
        message_id
      });
    } else {
      logger.debug('tiktok', 'Multi-tenant routing: to_user_id matched connection', {
        to_user_id,
        connectionId: connection.id,
        companyId,
        conversation_id,
        message_id
      });
    }

    const existingMessage = await storage.getMessageByExternalId(message_id, companyId);
    if (existingMessage) {
      logger.debug('tiktok', 'Idempotency: duplicate message ignored', {
        message_id,
        companyId,
        existingMessageId: existingMessage.id
      });
      return;
    }

    let participantData: TikTokUserInfo | undefined;
    try {
      const connectionData = connection.connectionData as TikTokConnectionData;
      if (connectionData?.accessToken) {
        participantData = await getSenderUserInfo(connectionData.accessToken, from_user_id);
      }
    } catch (err) {
      logger.debug('tiktok', 'Could not fetch sender user info, using fallback', { from_user_id });
    }

    const contact = await findOrCreateContact(companyId, from_user_id, participantData);
    const conversation = await findOrCreateConversation(
      connection.id,
      from_user_id,
      companyId,
      conversation_id
    );


    const currentTime = Date.now();
    const windowExpiresAt = currentTime + (48 * 60 * 60 * 1000); // 48 hours
    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    await storage.updateConversation(conversation.id, {
      groupMetadata: {
        ...currentMetadata,
        lastUserInteractionAt: currentTime,
        messagingWindowStatus: 'open',
        messagingWindowExpiresAt: windowExpiresAt,
        conversationState: 'active'
      }
    });

    const messageData: InsertMessage = {
      conversationId: conversation.id,
      direction: 'inbound',
      senderId: contact.id,
      senderType: 'contact',
      content: messageContent,
      type: message_type,
      status: 'received',
      externalId: message_id,
      metadata: {
        platform: 'tiktok',
        senderId: from_user_id,
        tiktok_conversation_id: conversation_id,
        create_time: content.create_time,
        timestamp: content.create_time ? content.create_time * 1000 : Date.now(),
        rawMessage: content
      },
      createdAt: new Date()
    };

    const savedMessage = await storage.createMessage(messageData);
    const updatedConversation = await storage.updateConversation(conversation.id, {
      lastMessageAt: new Date()
    });

    updateConnectionActivity(connection.id, true);

    emitTikTokEvent('messageReceived', {
      connectionId: connection.id,
      conversationId: conversation.id,
      contactId: contact.id,
      message: savedMessage,
      conversation: updatedConversation,
      contact: contact
    });

    broadcastTikTokEvent('newMessage', savedMessage, {
      companyId: connection.companyId,
      conversationId: conversation.id,
      priority: 'high'
    });

    if (updatedConversation) {
      broadcastTikTokEvent('conversationUpdated', updatedConversation, {
        companyId: connection.companyId,
        conversationId: conversation.id,
        priority: 'normal'
      });
    }

    try {
      const unreadCount = await storage.getUnreadCount(conversation.id);
      broadcastTikTokEvent('unreadCountUpdated', {
        conversationId: conversation.id,
        unreadCount
      }, {
        companyId: connection.companyId,
        conversationId: conversation.id,
        priority: 'normal'
      });
    } catch (error) {
      logger.error('tiktok', 'Error broadcasting unread count update:', error);
    }

    logger.info('tiktok', 'Incoming message processed (new message)', {
      messageId: savedMessage.id,
      from_user_id,
      to_user_id,
      companyId: connection.companyId,
      conversation_id,
      message_id,
      connectionId: connection.id
    });
  } catch (error) {
    logger.error('tiktok', 'Error handling incoming message:', error);
    throw error;
  }
}

/**
 * Handle message delivered status update (Business Messaging API payload)
 */
async function handleMessageDelivered(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;

    if (!messageId) {
      logger.warn('tiktok', 'Message delivered event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, { status: 'delivered' });


      trackMessageStatus(
        message.id,
        messageId,
        message.conversationId,
        'delivered'
      );


      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'delivered'
      });


      const conversation = await storage.getConversation(message.conversationId);
      if (conversation) {
        const tracking = getMessageStatusTracking(message.id);
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'delivered',
          deliveredAt: tracking?.deliveredAt || new Date()
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'normal'
        });
      }

      logger.debug('tiktok', `Message ${messageId} marked as delivered`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message delivered:', error);
  }
}

/**
 * Handle message read status update (Business Messaging API payload)
 */
async function handleMessageRead(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;

    if (!messageId) {
      logger.warn('tiktok', 'Message read event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, { status: 'read' });


      trackMessageStatus(
        message.id,
        messageId,
        message.conversationId,
        'read'
      );


      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'read'
      });


      const conversation = await storage.getConversation(message.conversationId);
      if (conversation) {
        const tracking = getMessageStatusTracking(message.id);
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'read',
          readAt: tracking?.readAt || new Date(),
          readBy: tracking?.readBy || []
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'normal'
        });
      }

      logger.debug('tiktok', `Message ${messageId} marked as read`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message read:', error);
  }
}

/**
 * Handle message failed status update (Business Messaging API payload)
 */
async function handleMessageFailed(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const messageId = content.message_id ?? payload.message_id ?? payload.message?.id;
    const error = content.error ?? payload.error ?? 'Unknown error';

    if (!messageId) {
      logger.warn('tiktok', 'Message failed event missing message_id');
      return;
    }


    const message = await storage.getMessageByExternalId(messageId);
    if (message) {
      await storage.updateMessage(message.id, {
        status: 'failed',
        metadata: {
          ...(message.metadata as any),
          error: error
        }
      });


      trackMessageStatus(
        message.id,
        messageId,
        message.conversationId,
        'failed',
        error
      );


      emitTikTokEvent('messageStatusUpdate', {
        messageId: message.id,
        status: 'failed',
        error: error
      });


      const conversation = await storage.getConversation(message.conversationId);
      if (conversation) {
        const tracking = getMessageStatusTracking(message.id);
        broadcastTikTokEvent('messageStatusUpdate', {
          messageId: message.id,
          conversationId: message.conversationId,
          status: 'failed',
          error: error,
          failedAt: tracking?.failedAt || new Date()
        }, {
          companyId: conversation.companyId,
          conversationId: message.conversationId,
          priority: 'high'
        });
      }

      logger.error('tiktok', `Message ${messageId} failed: ${error}`);
    }
  } catch (error) {
    logger.error('tiktok', 'Error handling message failed:', error);
  }
}

/**
 * Log TikTok user deletion to contact_audit_logs and app-level audit (GDPR compliance)
 */
async function logTikTokUserDeletion(params: {
  contactId: number;
  userId: string;
  companyId: number;
  deletionMetadata: Record<string, unknown>;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  affectedMessageCount: number;
  affectedConversationCount: number;
  ipAddress?: string;
  userAgent?: string;
  tx?: any;
}): Promise<void> {
  const description = 'TikTok user data deleted per user_deletion webhook';
  const auditRecord = {
    companyId: params.companyId,
    contactId: params.contactId,
    userId: null as number | null,
    actionType: 'tiktok_user_deletion',
    actionCategory: 'compliance',
    description,
    oldValues: params.oldValues,
    newValues: params.newValues,
    metadata: {
      webhookPayload: params.deletionMetadata,
      timestamp: new Date().toISOString(),
      affectedMessageCount: params.affectedMessageCount,
      affectedConversationCount: params.affectedConversationCount
    },
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null
  };
  if (params.tx) {
    await params.tx.insert(contactAuditLogs).values(auditRecord);
  } else {
    await storage.createContactAuditLog(auditRecord as any);
  }
  try {
    await storage.saveAppSetting(
      `audit_tiktok_deletion_${params.companyId}_${Date.now()}`,
      { ...auditRecord, tiktokUserId: params.userId }
    );
  } catch (e) {
    logger.warn('tiktok', 'Failed to save app-level TikTok deletion audit', e);
  }
}

/**
 * Handle user_deletion webhook event (compliance: user requested data deletion)
 * Enhanced with transaction, full anonymization, audit logging, and idempotency.
 */
async function handleUserDeletion(payload: any, webhookContext?: { ipAddress?: string; userAgent?: string }): Promise<void> {
  const content = payload.content ?? payload.data ?? {};
  const user_id = content.user_id ?? content.from_user_id;

  if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
    logger.warn('tiktok', 'user_deletion event missing or invalid user_id');
    return;
  }

  const db = getDb();
  const contactsToUpdateList = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.identifier, user_id),
        eq(contacts.identifierType, 'tiktok')
      )
    );

  if (contactsToUpdateList.length === 0) {
    logger.info('tiktok', 'user_deletion: no contact found for user_id', { user_id });
    return;
  }

  const now = new Date();
  const deletionMetadata = {
    platform: 'tiktok',
    user_id,
    webhookTimestamp: payload.timestamp ?? Date.now(),
    event: 'user_deletion'
  };

  let totalMessages = 0;
  let totalConversations = 0;

  try {
    await db.transaction(async (tx: any) => {
      for (const contact of contactsToUpdateList) {
        const existingMeta = (contact.deletionMetadata as Record<string, unknown>) || {};
        if (contact.deletionReason === 'tiktok_user_deletion' && existingMeta.user_id === user_id) {
          logger.debug('tiktok', 'user_deletion already processed (idempotent skip)', { user_id, contactId: contact.id });
          continue;
        }

        const oldValues = {
          name: contact.name,
          identifier: contact.identifier,
          identifierType: contact.identifierType,
          avatarUrl: contact.avatarUrl,
          email: contact.email,
          phone: contact.phone,
          notes: contact.notes,
          isActive: contact.isActive
        };

        await tx
          .update(contacts)
          .set({
            name: '[User Deleted]',
            identifier: null,
            identifierType: null,
            avatarUrl: null,
            email: null,
            phone: null,
            company: null,
            notes: ((contact.notes || '') + ' [TikTok user_deletion compliance]').trim(),
            isActive: false,
            deletedAt: now,
            anonymizedAt: now,
            deletionReason: 'tiktok_user_deletion',
            deletionMetadata,
            updatedAt: now
          })
          .where(eq(contacts.id, contact.id));

        const messagesList = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.senderId, contact.id),
              eq(messages.senderType, 'contact')
            )
          );

        for (const msg of messagesList) {
          await tx
            .update(messages)
            .set({
              content: '[Message from deleted user]',
              metadata: {
                ...(typeof msg.metadata === 'object' && msg.metadata !== null ? (msg.metadata as Record<string, unknown>) : {}),
                user_deletion: true,
                anonymized_at: now.toISOString(),
                original_platform: 'tiktok'
              },
              anonymizedAt: now,
              anonymizationReason: 'tiktok_user_deletion'
            })
            .where(eq(messages.id, msg.id));
        }
        totalMessages += messagesList.length;

        const convos = await storage.getConversationsByContact(contact.id);
        for (const conv of convos) {
          const meta = (conv.groupMetadata as Record<string, unknown>) || {};
          await tx
            .update(conversations)
            .set({
              groupMetadata: {
                ...meta,
                userDeleted: true,
                deletedAt: now.toISOString(),
                deletionSource: 'tiktok_webhook',
                messagingWindowStatus: 'expired',
                conversationState: 'user_blocked'
              },
              updatedAt: now
            })
            .where(eq(conversations.id, conv.id));
        }
        totalConversations += convos.length;

        const newValues = {
          name: '[User Deleted]',
          identifier: null,
          identifierType: null,
          avatarUrl: null,
          email: null,
          phone: null,
          isActive: false,
          deletedAt: now,
          anonymizedAt: now,
          deletionReason: 'tiktok_user_deletion',
          deletionMetadata
        };

        await logTikTokUserDeletion({
          contactId: contact.id,
          userId: user_id,
          companyId: contact.companyId!,
          deletionMetadata,
          oldValues,
          newValues,
          affectedMessageCount: messagesList.length,
          affectedConversationCount: convos.length,
          ipAddress: webhookContext?.ipAddress,
          userAgent: webhookContext?.userAgent,
          tx
        });
      }
    });

    logger.info('tiktok', 'user_deletion compliance completed', {
      user_id,
      contactCount: contactsToUpdateList.length,
      messageCount: totalMessages,
      conversationCount: totalConversations
    });
  } catch (error) {
    logger.error('tiktok', 'Error handling user_deletion (transaction rolled back):', error);
    throw error;
  }
}

/**
 * Handle conversation.updated webhook event (conversation state tracking)
 */
async function handleConversationUpdated(payload: any): Promise<void> {
  try {
    const content = payload.content ?? payload.data ?? {};
    const conversation_id = content.conversation_id;
    const status = content.status;

    if (!conversation_id) {
      logger.warn('tiktok', 'conversation.updated event missing conversation_id');
      return;
    }

    const db = getDb();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.channelType, 'tiktok'),
          sql`${conversations.groupMetadata}->>'tiktokConversationId' = ${conversation_id}`
        )
      )
      .limit(1);

    if (!conversation) {
      logger.debug('tiktok', 'conversation.updated: no internal conversation found', { conversation_id });
      return;
    }

    const currentMetadata = (conversation.groupMetadata as TikTokConversationMetadata) || {};
    const tiktokStatusStr = typeof status === 'string' ? status.toLowerCase() : '';
    let conversationState: TikTokConversationMetadata['conversationState'] = currentMetadata.conversationState ?? 'active';
    let messagingWindowStatus: TikTokConversationMetadata['messagingWindowStatus'] = currentMetadata.messagingWindowStatus ?? 'open';
    if (tiktokStatusStr === 'active') {
      conversationState = 'active';
      messagingWindowStatus = 'open';
    } else if (tiktokStatusStr === 'expired') {
      conversationState = 'expired';
      messagingWindowStatus = 'closed';
    } else if (tiktokStatusStr === 'blocked') {
      conversationState = 'user_blocked';
      messagingWindowStatus = 'closed';
    }
    await storage.updateConversation(conversation.id, {
      groupMetadata: {
        ...currentMetadata,
        tiktokStatus: status,
        conversationState,
        messagingWindowStatus
      }
    });

    const updated = await storage.getConversation(conversation.id);
    if (updated) {
      broadcastTikTokEvent('conversationUpdated', updated, {
        companyId: conversation.companyId!,
        conversationId: conversation.id,
        priority: 'normal'
      });
    }
    logger.debug('tiktok', 'conversation.updated processed', { conversation_id, status });
  } catch (error) {
    logger.error('tiktok', 'Error handling conversation.updated:', error);
  }
}

/**
 * Apply data retention policy for TikTok: find contacts with deletedAt older than retentionDays
 * and optionally hard-delete or log application (GDPR compliance).
 * Called by background worker daily.
 */
async function applyDataRetentionPolicy(): Promise<{ companiesProcessed: number; contactsProcessed: number; errors: string[] }> {
  const result = { companiesProcessed: 0, contactsProcessed: 0, errors: [] as string[] };
  try {
    const connections = await storage.getChannelConnectionsByType('tiktok');
    const companyIds = [...new Set(connections.map((c) => c.companyId).filter(Boolean))] as number[];
    const db = getDb();

    for (const companyId of companyIds) {
      try {
        const policy = await storage.getDataRetentionPolicy(companyId, 'tiktok');
        if (!policy?.enabled || policy.retentionDays <= 0) continue;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - policy.retentionDays);
        const expiredContacts = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.companyId, companyId),
              eq(contacts.identifierType, 'tiktok'),
              isNotNull(contacts.deletedAt),
              lt(contacts.deletedAt, cutoff)
            )
          );

        for (const contact of expiredContacts) {
          try {
            await storage.deleteContact(contact.id);
            result.contactsProcessed++;
          } catch (err) {
            result.errors.push(`Contact ${contact.id}: ${(err as Error).message}`);
          }
        }
        if (expiredContacts.length > 0) {
          result.companiesProcessed++;
          logger.info('tiktok', 'Data retention policy applied', {
            companyId,
            retentionDays: policy.retentionDays,
            contactsProcessed: expiredContacts.length
          });
          try {
            await storage.saveAppSetting(
              `audit_tiktok_retention_${companyId}_${Date.now()}`,
              { companyId, retentionDays: policy.retentionDays, contactsProcessed: expiredContacts.length, appliedAt: new Date().toISOString() }
            );
          } catch (_) {}
        }
      } catch (err) {
        result.errors.push(`Company ${companyId}: ${(err as Error).message}`);
      }
    }
  } catch (error) {
    logger.error('tiktok', 'Error in applyDataRetentionPolicy', error);
    result.errors.push((error as Error).message);
  }
  return result;
}

/**
 * Test user_deletion compliance (admin): simulate user_deletion webhook for a connection and test user.
 * For development/testing only; optionally rollback.
 */
async function testUserDeletionCompliance(params: {
  connectionId: number;
  testUserId: string;
  rollback?: boolean;
}): Promise<{ success: boolean; contactCount?: number; messageCount?: number; conversationCount?: number; error?: string }> {
  const payload = {
    event: 'user_deletion',
    content: { user_id: params.testUserId },
    timestamp: Date.now()
  };
  try {
    await handleUserDeletion(payload);
    const db = getDb();
    const contactsList = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.identifier, params.testUserId),
          eq(contacts.identifierType, 'tiktok')
        )
      );
    const count = contactsList.length;
    let messageCount = 0;
    let conversationCount = 0;
    if (count > 0) {
      for (const c of contactsList) {
        const msgs = await db.select().from(messages).where(and(eq(messages.senderId, c.id), eq(messages.senderType, 'contact')));
        messageCount += msgs.length;
        const convos = await storage.getConversationsByContact(c.id);
        conversationCount += convos.length;
      }
    }
    return { success: true, contactCount: count, messageCount, conversationCount };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}



/**
 * Verify TikTok webhook signature (HMAC-SHA256 per guide Section 5.1)
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  try {
    if (!signature || typeof signature !== 'string') {
      logger.warn('tiktok', 'Webhook signature missing or not a string');
      return false;
    }
    const trimmedSignature = signature.trim().toLowerCase();
    if (!/^[a-f0-9]+$/.test(trimmedSignature)) {
      logger.warn('tiktok', 'Webhook signature is not a valid hex string', {
        signatureLength: signature.length,
        signaturePreview: signature.substring(0, 16) + '...'
      });
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const receivedBuf = Buffer.from(trimmedSignature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    if (receivedBuf.length !== expectedBuf.length) {
      logger.warn('tiktok', 'Signature length mismatch', {
        expectedLen: expectedBuf.length,
        receivedLen: receivedBuf.length,
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 100),
        secretPresent: !!webhookSecret
      });
      return false;
    }

    const valid = crypto.timingSafeEqual(receivedBuf, expectedBuf);
    if (!valid) {
      logger.warn('tiktok', 'Webhook signature verification failed', {
        expectedPreview: expectedSignature.substring(0, 16) + '...',
        receivedPreview: trimmedSignature.substring(0, 16) + '...',
        payloadLength: payload.length,
        payloadPreview: payload.substring(0, 100),
        secretPresent: !!webhookSecret
      });
    }
    return valid;
  } catch (error) {
    logger.error('tiktok', 'Error verifying webhook signature:', error);
    return false;
  }
}





/**
 * Handle TikTok API errors and convert to standardized format
 */
function handleTikTokError(error: any): TikTokAPIError {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const responseData = axiosError.response?.data as any;
    const statusCode = axiosError.response?.status || 0;
    const errorCode = responseData?.error?.code || '';
    const errorMessage = responseData?.error?.message || axiosError.message || 'Unknown error occurred';


    let mappedCode = errorCode || 'UNKNOWN_ERROR';
    let userFriendlyMessage = errorMessage;
    let actionableSuggestion = '';


    if (statusCode === 401) {
      mappedCode = TikTokErrorCode.TOKEN_EXPIRED;
      userFriendlyMessage = 'Authentication failed. Please reconnect your TikTok account.';
      actionableSuggestion = 'The access token has expired. Try refreshing the connection.';
    } else if (statusCode === 403) {
      if (errorCode === 'conversation_expired' || errorCode === 'message_window_closed') {
        mappedCode = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
        userFriendlyMessage = 'The messaging window has closed.';
        actionableSuggestion = 'The 24-hour messaging window has closed. Wait for the user to message first.';
      } else if (errorCode === 'invalid_permissions') {
        mappedCode = TikTokErrorCode.INSUFFICIENT_PERMISSIONS;
        userFriendlyMessage = 'Insufficient permissions to perform this action.';
        actionableSuggestion = 'Check that your TikTok Business account has the required permissions for messaging.';
      } else if (errorCode === 'recipient_blocked_business' || errorCode === 'user_blocked_business') {
        mappedCode = TikTokErrorCode.RECIPIENT_BLOCKED;
        userFriendlyMessage = 'The user has blocked your business account.';
        actionableSuggestion = 'Update contact metadata to mark as blocked. User must unblock to receive messages.';
      } else {
        mappedCode = TikTokErrorCode.INSUFFICIENT_PERMISSIONS;
        userFriendlyMessage = 'Access denied.';
        actionableSuggestion = 'Check your TikTok Business account permissions.';
      }
    } else if (statusCode === 404) {
      if (errorCode === 'conversation_not_found') {
        mappedCode = TikTokErrorCode.CONVERSATION_NOT_FOUND;
        userFriendlyMessage = 'Conversation not found.';
        actionableSuggestion = 'The conversation may have expired or been deleted.';
      } else if (errorCode === 'invalid_message_id') {
        mappedCode = 'INVALID_MESSAGE_ID';
        userFriendlyMessage = 'Invalid or duplicate message ID.';
        actionableSuggestion = 'Message may be malformed or already processed (idempotency).';
      } else {
        mappedCode = TikTokErrorCode.CONVERSATION_NOT_FOUND;
        userFriendlyMessage = 'Resource not found.';
      }
    } else if (statusCode === 410) {
      mappedCode = TikTokErrorCode.CONVERSATION_EXPIRED;
      userFriendlyMessage = 'Conversation has expired.';
      actionableSuggestion = 'The conversation has expired. Wait for the user to start a new conversation.';
    } else if (errorCode === 'message_window_expired') {
      mappedCode = TikTokErrorCode.MESSAGE_WINDOW_EXPIRED;
      userFriendlyMessage = 'The messaging window has closed.';
      actionableSuggestion = 'Wait for the user to message first to reopen the 48-hour window.';
    } else if (errorCode === 'conversation_expired') {
      mappedCode = TikTokErrorCode.CONVERSATION_EXPIRED;
      userFriendlyMessage = 'Conversation has expired.';
      actionableSuggestion = 'Mark conversation as expired in metadata. Wait for user to start a new conversation.';
    } else if (statusCode === 429) {
      mappedCode = TikTokErrorCode.RATE_LIMIT_EXCEEDED;
      userFriendlyMessage = 'Rate limit exceeded.';
      actionableSuggestion = 'Too many requests. Please wait a moment before trying again.';
    } else if (statusCode >= 500) {
      mappedCode = 'SERVER_ERROR';
      userFriendlyMessage = 'TikTok API server error.';
      actionableSuggestion = 'TikTok\'s servers are experiencing issues. Please try again later.';
    }

    const tikTokError: TikTokAPIError = {
      error: {
        code: mappedCode,
        message: userFriendlyMessage,
        log_id: responseData?.error?.log_id,
        ...(actionableSuggestion && { suggestion: actionableSuggestion })
      }
    };

    return tikTokError;
  }

  return {
    error: {
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  };
}

/**
 * Check if error is retryable
 */
function isRetryableError(statusCode: number): boolean {

  return statusCode === 429 || statusCode >= 500;
}





/**
 * Initialize a TikTok connection
 */
async function initializeConnection(connectionId: number): Promise<void> {
  try {
    logger.info('tiktok', `Initializing connection ${connectionId}`);

    const connection = await storage.getChannelConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }


    activeConnections.set(connectionId, true);


    const connectionData = connection.connectionData as TikTokConnectionData;
    const userInfo = await getUserInfo(connectionData.accessToken);

    const state = getConnectionState(connectionId);
    state.userInfo = userInfo;
    state.isActive = true;


    startHealthMonitoring(connectionId);
    scheduleProactiveTokenRefresh(connectionId);

    await storage.updateChannelConnectionStatus(connectionId, 'active');

    tiktokLog(connectionId, 'Init', 'Connection initialized successfully', 'INFO');
  } catch (error) {
    logger.error('tiktok', `Error initializing connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Disconnect a TikTok connection
 */
async function disconnectConnection(connectionId: number): Promise<void> {
  try {
    logger.info('tiktok', `Disconnecting connection ${connectionId}`);


    stopHealthMonitoring(connectionId);


    activeConnections.delete(connectionId);
    connectionStates.delete(connectionId);


    await storage.updateChannelConnectionStatus(connectionId, 'disconnected');

    logger.info('tiktok', `Connection ${connectionId} disconnected successfully`);
  } catch (error) {
    logger.error('tiktok', `Error disconnecting connection ${connectionId}:`, error);
    throw error;
  }
}

/**
 * Get connection status
 */
function getConnectionStatus(connectionId: number): ConnectionState | null {
  return connectionStates.get(connectionId) || null;
}

const INIT_CONCURRENCY = 5;
const INIT_RETRY_DELAY_MS = 5000;
const INIT_MAX_RETRIES = 2;

/**
 * Initialize all active TikTok connections on server startup (parallel with concurrency limit)
 */
async function initializeAllConnections(): Promise<void> {
  const startTime = Date.now();
  try {
    tiktokLog(undefined, 'Init', 'Initializing all active TikTok connections...', 'INFO');
    const connections = await storage.getChannelConnectionsByType('tiktok');
    const toInit = connections.filter((c) => c.status === 'active' || c.status === 'connected');
    const failed: { id: number; reason: string }[] = [];
    let initializedCount = 0;

    const runOne = async (connection: { id: number; accountName: string }): Promise<void> => {
      for (let attempt = 1; attempt <= INIT_MAX_RETRIES; attempt++) {
        try {
          await initializeConnection(connection.id);
          initializedCount++;
          scheduleProactiveTokenRefresh(connection.id);
          tiktokLog(connection.id, 'Init', `Initialized (${connection.accountName})`, 'INFO');
          return;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (attempt < INIT_MAX_RETRIES) {
            tiktokLog(connection.id, 'Init', `Attempt ${attempt} failed, retrying in ${INIT_RETRY_DELAY_MS / 1000}s: ${msg}`, 'WARN');
            await new Promise((r) => setTimeout(r, INIT_RETRY_DELAY_MS));
          } else {
            failed.push({ id: connection.id, reason: msg });
            tiktokLog(connection.id, 'Init', `Failed after ${INIT_MAX_RETRIES} attempts: ${msg}`, 'ERROR');
          }
        }
      }
    };

    for (let i = 0; i < toInit.length; i += INIT_CONCURRENCY) {
      const batch = toInit.slice(i, i + INIT_CONCURRENCY);
      await Promise.all(batch.map(runOne));
    }

    const totalTime = Date.now() - startTime;
    const successRate = toInit.length ? (initializedCount / toInit.length) * 100 : 100;
    tiktokLog(
      undefined,
      'Init',
      `TikTok initialization complete: ${initializedCount}/${toInit.length} connections (${successRate.toFixed(1)}%), ${failed.length} failed, ${totalTime}ms`,
      'INFO'
    );
    if (failed.length > 0) {
      tiktokLog(undefined, 'Init', `Failed connection IDs: ${failed.map((f) => f.id).join(', ')}. Reasons: ${failed.map((f) => f.reason).join('; ')}`, 'WARN');
    }
    startBatchTokenRefreshInterval();
    startMessagingWindowExpirationWorker();
    scheduleDailySummary();
  } catch (error) {
    logger.error('tiktok', 'Error initializing TikTok connections:', error);
    throw error;
  }
}





/**
 * Subscribe to TikTok events
 */
export function subscribeToTikTokEvents(
  eventType: 'connectionStatusUpdate',
  callback: (data: { connectionId: number; status: string }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'connectionError',
  callback: (data: { connectionId: number; error: string; requiresReauth?: boolean }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageReceived',
  callback: (data: { connectionId: number; conversationId: number; contactId: number; message: any; conversation?: any; contact?: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageSent',
  callback: (data: { connectionId: number; conversationId: number; message: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageStatusUpdate',
  callback: (data: { messageId: number; status: string; error?: string }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'userTyping',
  callback: (data: { conversationId: number; userId: number; isTyping: boolean }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'userPresence',
  callback: (data: { userId: number; conversationId: number; status: 'online' | 'offline' | 'away'; lastSeen: Date }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageRead',
  callback: (data: { messageId: number; userId: number; conversationId: number; readAt: Date }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'conversationRead',
  callback: (data: { conversationId: number; userId: number; messageCount: number; readAt: Date }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'reactionAdded',
  callback: (data: { messageId: number; userId: number; emoji: string; reaction: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'reactionRemoved',
  callback: (data: { messageId: number; userId: number; emoji: string }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'messageReaction',
  callback: (data: { messageId: number; conversationId: number; userId: number; emoji: string; action: 'add' | 'remove'; reaction?: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'userMentioned',
  callback: (data: { messageId: number; conversationId: number; mentionedUserId: number; mentionedByUserId: number; mention: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: 'mention',
  callback: (data: { messageId: number; conversationId: number; mentionedUserId: number; mentionedByUserId: number; messageContent: string; mention: any }) => void
): () => void;
export function subscribeToTikTokEvents(
  eventType: string,
  callback: (data: any) => void
): () => void {
  return eventEmitterPool.subscribe(TIKTOK_NAMESPACE, eventType, callback);
}

/**
 * Test Business Messaging API connectivity and endpoints
 * Useful for validating Business Messaging API access during partner approval process
 * @param connectionId The channel connection ID
 * @param companyId The company ID for multi-tenant security
 * @returns Comprehensive test report with success/failure status for each endpoint
 */
async function testBusinessMessagingAPI(
  connectionId: number,
  companyId: number
): Promise<{
  success: boolean;
  tests: Array<{
    endpoint: string;
    success: boolean;
    error?: string;
    data?: any;
  }>;
}> {
  const tests: Array<{
    endpoint: string;
    success: boolean;
    error?: string;
    data?: any;
  }> = [];

  try {

    try {
      logger.info('tiktok', `Testing listConversations for connection ${connectionId}`);
      const conversationsResult = await listConversations(connectionId, companyId);
      tests.push({
        endpoint: 'listConversations',
        success: true,
        data: {
          count: conversationsResult.conversations.length,
          has_more: conversationsResult.has_more,
          next_cursor: conversationsResult.next_cursor
        }
      });


      if (conversationsResult.conversations.length > 0) {
        const firstConversation = conversationsResult.conversations[0];
        try {
          logger.info('tiktok', `Testing getMessages for conversation ${firstConversation.conversation_id}`);
          const messagesResult = await getMessages(
            connectionId,
            companyId,
            firstConversation.conversation_id
          );
          tests.push({
            endpoint: 'getMessages',
            success: true,
            data: {
              conversation_id: firstConversation.conversation_id,
              message_count: messagesResult.messages.length,
              has_more: messagesResult.has_more,
              next_cursor: messagesResult.next_cursor
            }
          });
        } catch (error: any) {
          tests.push({
            endpoint: 'getMessages',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: {
              conversation_id: firstConversation.conversation_id
            }
          });
        }
      } else {
        tests.push({
          endpoint: 'getMessages',
          success: true,
          data: {
            skipped: true,
            reason: 'No conversations available to test'
          }
        });
      }
    } catch (error: any) {
      tests.push({
        endpoint: 'listConversations',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    const overallSuccess = tests.every(test => test.success);

    return {
      success: overallSuccess,
      tests
    };
  } catch (error: any) {
    logger.error('tiktok', `Error in testBusinessMessagingAPI for connection ${connectionId}:`, error);
    return {
      success: false,
      tests: [{
        endpoint: 'testBusinessMessagingAPI',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]
    };
  }
}





export const TikTokService = {

  getPlatformConfig,


  exchangeCodeForToken,
  refreshAccessToken,
  ensureValidToken,


  getUserInfo,
  verifyBusinessAccount,
  detectRegionRestrictions,


  initializeConnection,
  initializeAllConnections,
  disconnectConnection,
  getConnectionStatus,
  startHealthMonitoring,
  stopHealthMonitoring,
  stopAllHealthMonitoring,
  getHealthMonitoringStats,
  getConnectionsNeedingTokenRefresh,
  testTokenRefresh,
  testHealthCheck,
  getHealthMonitoringStatus,
  testBusinessMessagingAPI,


  checkMessagingWindow,
  getConversationMetadata,
  sendMessage,
  sendAndSaveMessage,
  sendImageMessage,
  sendVideoMessage,
  sendStickerMessage,
  listConversations,
  getMessages,


  processWebhookEvent,
  verifyWebhookSignature,
  applyDataRetentionPolicy,
  validateTikTokScopes,
  testUserDeletionCompliance,
  logTikTokUserDeletion,


  startTypingIndicator,
  stopTypingIndicator,
  getTypingUsers,
  updatePresenceStatus,
  getUserPresence,
  simulateTyping,


  markMessageAsRead,
  markConversationAsRead,
  getMessageReadReceipts,
  getMessageDeliveryStatus,
  getMessageStatusTracking,
  sendReadReceipt,


  addReaction,
  removeReaction,
  getMessageReactions,
  getReactionSummary,
  hasUserReacted,
  AVAILABLE_REACTIONS,


  parseMentions,
  addMentionsToMessage,
  getMessageMentions,
  getUnreadMentions,
  markMentionAsRead,
  clearUserMentions,
  formatMessageWithMentions,


  eventEmitter,


  subscribeToEvents: subscribeToTikTokEvents,


  handleTikTokError
};

export default TikTokService;

