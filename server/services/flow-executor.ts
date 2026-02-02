import { storage } from '../storage';
import {
  FlowAssignment,
  Message,
  Contact,
  Conversation,
  ChannelConnection} from '@shared/schema';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import whatsAppService from './channels/whatsapp';
import instagramService from './channels/instagram';
import messengerService from './channels/messenger';
import TikTokService from './channels/tiktok';
import googleCalendarService from './google-calendar';
import googleSheetsService from './google-sheets';
import { dataCaptureService } from './data-capture-service';
import axios from 'axios';
import { FlowExecutionManager } from './flow-execution-manager';
import { FlowExecutionContext } from './flow-execution-context';
import {
  NodeType,
  NodeTypeUtils,
  NodeExecutionResult as SharedNodeExecutionResult,
  NodeExecutionConfig
} from '@shared/types/node-types';
import { executeContactNotificationNode } from './nodes/contact-notification-executor';
import { EventEmitter } from 'events';
import * as path from 'path';
import { isWhatsAppGroupChatId } from '../utils/whatsapp-group-filter';
import serverI18n from '../utils/server-i18n';
import type { CallAgentConfig, CallStatus } from './call-agent-service';

interface Flow {
  id: number;
  name: string;
  description: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  createdAt: Date;
  updatedAt: Date;
  userId: number;
  version: number;
  nodes: unknown;
  edges: unknown;
  definition?: string | any;
}


interface NodeExecutionResult {
  success: boolean;
  shouldContinue: boolean;
  nextNodeId?: string;
  waitForUserInput?: boolean;
  error?: string;
  data?: any;
}

interface FlowSessionState {
  sessionId: string;
  flowId: number;
  conversationId: number;
  contactId: number;
  companyId: number;
  status: 'active' | 'waiting' | 'paused' | 'completed' | 'failed' | 'abandoned' | 'timeout';
  currentNodeId: string | null;
  triggerNodeId: string;
  executionPath: string[];
  branchingHistory: any[];
  variables: Map<string, any>;
  nodeStates: Map<string, any>;
  waitingContext: any;
  startedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date | null;
  isLoaded: boolean;
  aiSessionActive: boolean;
  aiNodeId: string | null;
  aiStopKeyword: string | null;
  aiExitOutputHandle: string | null;
}

interface FlowTransition {
  type: 'sequential' | 'conditional' | 'loop' | 'jump';
  conditions?: any[];
  conditionExpression?: string;
  loopIteration?: number;
  maxIterations?: number;
}

interface SessionVariable {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  scope: 'global' | 'flow' | 'node' | 'user' | 'session';
  nodeId?: string;
  isEncrypted?: boolean;
  expiresAt?: Date;
}

/**
 * Enhanced Flow Executor Service - Session-Aware Flow Execution
 * Implements sequential node processing with persistent session management
 */
class FlowExecutor extends EventEmitter {
  private executionManager: FlowExecutionManager;
  private webSocketClients: Map<string, any> = new Map();

  private activeSessions: Map<string, FlowSessionState> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private processingConversations: Set<string> = new Set(); // Track conversations being processed
  private processingLocks: Map<string, Promise<void>> = new Map(); // Promise-based locks for race condition prevention
  private lastAssignmentChangeTime: number = 0;
  private static instance: FlowExecutor;

  constructor() {
    super();

    this.setMaxListeners(50);
    this.executionManager = FlowExecutionManager.getInstance();
    this.setupExecutionEventHandlers();
    this.setupFlowAssignmentEventHandlers();
    this.setupSessionCleanup();
  }

  static getInstance(): FlowExecutor {
    if (!FlowExecutor.instance) {
      FlowExecutor.instance = new FlowExecutor();
    }
    return FlowExecutor.instance;
  }

  /**
   * Set WebSocket clients for real-time updates
   */
  setWebSocketClients(clients: Map<string, any>): void {
    this.webSocketClients = clients;
  }

  /**
   * Setup session cleanup for expired sessions
   */
  private setupSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
      if (session.expiresAt && session.expiresAt < now) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.expireSession(sessionId);
    }
  }

  /**
   * Create a new flow session
   */
  private async createSession(
    flowId: number,
    conversationId: number,
    contactId: number,
    companyId: number,
    triggerNodeId: string,
    initialContext: any,
    triggerNodeData?: any
  ): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    let expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (triggerNodeData && triggerNodeData.enableSessionPersistence !== false) {
      const sessionTimeout = triggerNodeData.sessionTimeout || 30;
      const sessionTimeoutUnit = triggerNodeData.sessionTimeoutUnit || 'minutes';

      let timeoutMs = 0;
      switch (sessionTimeoutUnit) {
        case 'minutes':
          timeoutMs = sessionTimeout * 60 * 1000;
          break;
        case 'hours':
          timeoutMs = sessionTimeout * 60 * 60 * 1000;
          break;
        case 'days':
          timeoutMs = sessionTimeout * 24 * 60 * 60 * 1000;
          break;
        default:
          timeoutMs = 30 * 60 * 1000;
      }

      expiresAt = new Date(now.getTime() + timeoutMs);
    }

    const session: FlowSessionState = {
      sessionId,
      flowId,
      conversationId,
      contactId,
      companyId,
      status: 'active',
      currentNodeId: triggerNodeId,
      triggerNodeId,
      executionPath: [triggerNodeId],
      branchingHistory: [],
      variables: new Map(),
      nodeStates: new Map(),
      waitingContext: null,
      startedAt: now,
      lastActivityAt: now,
      expiresAt,
      isLoaded: true,
      aiSessionActive: false,
      aiNodeId: null,
      aiStopKeyword: null,
      aiExitOutputHandle: null
    };


    session.variables.set('pipeline.currentPipelineId', null);
    session.variables.set('pipeline.previousPipelineId', null);
    session.variables.set('pipeline.currentStageId', null);
    session.variables.set('pipeline.previousStageId', null);
    session.variables.set('pipeline.pipelineChanged', false);
    session.variables.set('pipeline.stageChanged', false);
    session.variables.set('pipeline.movedBetweenPipelines', false);
    session.variables.set('pipeline.lastExecution', null);
    session.variables.set('pipeline.action', null);

    this.activeSessions.set(sessionId, session);

    try {
      await storage.createFlowSession({
        sessionId,
        flowId,
        conversationId,
        contactId,
        companyId,
        status: 'active',
        currentNodeId: triggerNodeId,
        triggerNodeId,
        executionPath: JSON.stringify([triggerNodeId]),
        branchingHistory: JSON.stringify([]),
        sessionData: JSON.stringify({}),
        nodeStates: JSON.stringify({}),
        waitingContext: null,
        startedAt: now,
        lastActivityAt: now,
        expiresAt,
        nodeExecutionCount: 0,
        userInteractionCount: 0,
        errorCount: 0,
        createdAt: now,
        updatedAt: now
      });

      this.emit('sessionCreated', { sessionId, flowId, conversationId, contactId });
    } catch (error) {
      console.error('Error creating flow session in database:', error);


    }

    return sessionId;
  }

  /**
   * Update session state
   */
  private async updateSession(sessionId: string, updates: Partial<FlowSessionState>): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    Object.assign(session, updates, { lastActivityAt: new Date() });


    if (session.status === 'active' && session.triggerNodeId) {
      await this.renewSessionTimeout(session);
    }

    try {
      const dbUpdates: any = {
        lastActivityAt: new Date()
      };


      if (session.expiresAt) {
        dbUpdates.expiresAt = session.expiresAt;
      }

      if (updates.status) dbUpdates.status = updates.status;
      if (updates.currentNodeId) dbUpdates.currentNodeId = updates.currentNodeId;
      if (updates.executionPath) dbUpdates.executionPath = JSON.stringify(updates.executionPath);
      if (updates.branchingHistory) dbUpdates.branchingHistory = JSON.stringify(updates.branchingHistory);
      if (updates.waitingContext !== undefined) dbUpdates.waitingContext = updates.waitingContext ? JSON.stringify(updates.waitingContext) : null;

      if (updates.aiSessionActive !== undefined ||
          updates.aiNodeId !== undefined ||
          updates.aiStopKeyword !== undefined ||
          updates.aiExitOutputHandle !== undefined) {

        const currentNodeStates = session.nodeStates || new Map();
        const aiSessionData = {
          aiSessionActive: session.aiSessionActive,
          aiNodeId: session.aiNodeId,
          aiStopKeyword: session.aiStopKeyword,
          aiExitOutputHandle: session.aiExitOutputHandle
        };

        currentNodeStates.set('__aiSession', aiSessionData);
        session.nodeStates = currentNodeStates;
        dbUpdates.nodeStates = JSON.stringify(Object.fromEntries(currentNodeStates));
      }

      await storage.updateFlowSession(sessionId, dbUpdates);
      this.emit('sessionUpdated', { sessionId, updates });
    } catch (error) {
    }
  }

  /**
   * Renew session timeout based on trigger node configuration
   */
  private async renewSessionTimeout(session: FlowSessionState): Promise<void> {
    try {

      const baseFlow = await storage.getFlow(session.flowId);
      if (!baseFlow) return;

      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
      const { nodes } = await this.parseFlowDefinition(flow);

      const triggerNode = nodes.find((node: any) => node.id === session.triggerNodeId);
      if (!triggerNode) return;

      const triggerData = triggerNode.data || {};
      const enableSessionPersistence = triggerData.enableSessionPersistence !== false;

      if (!enableSessionPersistence) return;

      const sessionTimeout = triggerData.sessionTimeout || 30;
      const sessionTimeoutUnit = triggerData.sessionTimeoutUnit || 'minutes';

      let timeoutMs = 0;
      switch (sessionTimeoutUnit) {
        case 'minutes':
          timeoutMs = sessionTimeout * 60 * 1000;
          break;
        case 'hours':
          timeoutMs = sessionTimeout * 60 * 60 * 1000;
          break;
        case 'days':
          timeoutMs = sessionTimeout * 24 * 60 * 60 * 1000;
          break;
        default:
          timeoutMs = 30 * 60 * 1000; // Default 30 minutes
      }

      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + timeoutMs);


      session.expiresAt = newExpiresAt;


      const existingTimeout = this.sessionTimeouts.get(session.sessionId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }


      const newTimeout = setTimeout(() => {
        this.expireSession(session.sessionId);
      }, timeoutMs);

      this.sessionTimeouts.set(session.sessionId, newTimeout);


    } catch (error) {
      console.error(`[Flow Executor] Error renewing session timeout for ${session.sessionId}:`, error);
    }
  }

  /**
   * Load a session from database into memory
   */
  private async loadSession(sessionId: string): Promise<FlowSessionState | null> {
    try {
      const dbSession = await storage.getFlowSession(sessionId);
      if (!dbSession) return null;

      const executionPath = typeof dbSession.executionPath === 'string'
        ? JSON.parse(dbSession.executionPath)
        : dbSession.executionPath || [];

      const branchingHistory = typeof dbSession.branchingHistory === 'string'
        ? JSON.parse(dbSession.branchingHistory)
        : dbSession.branchingHistory || [];

      const sessionData = typeof dbSession.sessionData === 'string'
        ? JSON.parse(dbSession.sessionData)
        : dbSession.sessionData || {};

      const nodeStates = typeof dbSession.nodeStates === 'string'
        ? JSON.parse(dbSession.nodeStates)
        : dbSession.nodeStates || {};

      const session: FlowSessionState = {
        sessionId: dbSession.sessionId,
        flowId: dbSession.flowId,
        conversationId: dbSession.conversationId,
        contactId: dbSession.contactId,
        companyId: dbSession.companyId || 0,
        status: dbSession.status as any,
        currentNodeId: dbSession.currentNodeId,
        triggerNodeId: dbSession.triggerNodeId,
        executionPath,
        branchingHistory,
        variables: new Map(Object.entries(sessionData)),
        nodeStates: new Map(Object.entries(nodeStates)),
        waitingContext: dbSession.waitingContext,
        startedAt: dbSession.startedAt,
        lastActivityAt: dbSession.lastActivityAt,
        expiresAt: dbSession.expiresAt,
        isLoaded: true,
        aiSessionActive: false,
        aiNodeId: null,
        aiStopKeyword: null,
        aiExitOutputHandle: null
      };

      this.activeSessions.set(sessionId, session);

      return session;
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }

  /**
   * Expire a session
   */
  private async expireSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.status = 'timeout';
    this.activeSessions.delete(sessionId);

    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    try {
      await storage.updateFlowSession(sessionId, { status: 'timeout' });
      this.emit('sessionExpired', { sessionId });
    } catch (error) {
    }
  }

  /**
   * Get active sessions for a conversation
   */
  private async getActiveSessionsForConversation(conversationId: number): Promise<FlowSessionState[]> {
    const activeSessions: FlowSessionState[] = [];

    for (const session of Array.from(this.activeSessions.values())) {
      if (session.conversationId === conversationId &&
          (['active', 'waiting', 'paused'].includes(session.status) || session.aiSessionActive)) {
        activeSessions.push(session);
      }
    }

    if (activeSessions.length === 0) {
      try {
        const dbSessions = await storage.getActiveFlowSessionsForConversation(conversationId);
        for (const dbSession of dbSessions) {
          const session = await this.loadSessionFromDatabase(dbSession.sessionId);
          if (session) {
            activeSessions.push(session);
          }
        }
      } catch (error) {
        console.error('Error loading sessions from database:', error);
      }
    }

    return activeSessions;
  }

  /**
   * Safe JSON parse with fallback
   */
  private safeJsonParse(jsonString: string | null | undefined, fallback: any): any {
    if (!jsonString) return fallback;

    if (typeof jsonString === 'object') {
      return jsonString;
    }

    if (jsonString.trim() === '') return fallback;

    try {
      const trimmed = jsonString.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"')) {
        return JSON.parse(jsonString);
      } else {

        return fallback;
      }
    } catch (error) {

      return fallback;
    }
  }

  /**
   * Load session from database
   */
  private async loadSessionFromDatabase(sessionId: string): Promise<FlowSessionState | null> {
    try {
      const dbSession = await storage.getFlowSession(sessionId);
      if (!dbSession) return null;

      const executionPath = this.safeJsonParse(dbSession.executionPath as string, []);
      const branchingHistory = this.safeJsonParse(dbSession.branchingHistory as string, []);
      const nodeStatesData = this.safeJsonParse(dbSession.nodeStates as string, {});
      const waitingContext = dbSession.waitingContext ? this.safeJsonParse(dbSession.waitingContext as string, null) : null;

      const session: FlowSessionState = {
        sessionId: dbSession.sessionId,
        flowId: dbSession.flowId,
        conversationId: dbSession.conversationId,
        contactId: dbSession.contactId,
        companyId: dbSession.companyId || 0,
        status: dbSession.status as any,
        currentNodeId: dbSession.currentNodeId,
        triggerNodeId: dbSession.triggerNodeId,
        executionPath: Array.isArray(executionPath) ? executionPath : [],
        branchingHistory: Array.isArray(branchingHistory) ? branchingHistory : [],
        variables: new Map(),
        nodeStates: new Map(nodeStatesData && typeof nodeStatesData === 'object' ? Object.entries(nodeStatesData) : []),
        waitingContext: waitingContext,
        startedAt: dbSession.startedAt,
        lastActivityAt: dbSession.lastActivityAt,
        expiresAt: dbSession.expiresAt,
        isLoaded: true,
        aiSessionActive: false,
        aiNodeId: null,
        aiStopKeyword: null,
        aiExitOutputHandle: null
      };

      const aiSessionData = session.nodeStates.get('__aiSession');
      if (aiSessionData) {
        session.aiSessionActive = aiSessionData.aiSessionActive || false;
        session.aiNodeId = aiSessionData.aiNodeId || null;
        session.aiStopKeyword = aiSessionData.aiStopKeyword || null;
        session.aiExitOutputHandle = aiSessionData.aiExitOutputHandle || null;
      }

      const variables = await storage.getFlowSessionVariables(sessionId);
      for (const variable of variables) {
        session.variables.set(variable.variableKey, variable.variableValue);
      }

      this.activeSessions.set(sessionId, session);
      return session;
    } catch (error) {
      console.error('Error loading session from database:', error);
      return null;
    }
  }

  /**
   * Setup execution event handlers for real-time updates
   */
  private setupExecutionEventHandlers(): void {
    this.executionManager.on('executionStarted', (data) => {
      this.broadcastExecutionEvent('flowExecutionStarted', data);
    });

    this.executionManager.on('executionUpdated', (data) => {
      this.broadcastExecutionEvent('flowExecutionUpdated', data);
    });

    this.executionManager.on('executionWaiting', (data) => {
      this.broadcastExecutionEvent('flowExecutionWaiting', data);
    });

    this.executionManager.on('executionCompleted', (data) => {
      this.broadcastExecutionEvent('flowExecutionCompleted', data);
    });

    this.executionManager.on('executionFailed', (data) => {
      this.broadcastExecutionEvent('flowExecutionFailed', data);
    });
  }

  /**
   * Setup flow assignment event handlers to respond to real-time changes
   */
  private setupFlowAssignmentEventHandlers(): void {

    if ((global as any).flowAssignmentEventEmitter) {
      (global as any).flowAssignmentEventEmitter.on('flowAssignmentStatusChanged', (data: any) => {
        


        this.lastAssignmentChangeTime = Date.now();


      });
    }
  }

  /**
   * Broadcast execution events to connected WebSocket clients
   */
  private broadcastExecutionEvent(eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      data
    });

    this.webSocketClients.forEach((client) => {
      if (client.socket.readyState === 1 && client.isAuthenticated) {
        try {
          client.socket.send(message);
        } catch (error) {
          console.error('Error broadcasting execution event:', error);
        }
      }
    });
  }

  /**
   * Send message through the appropriate channel service
   * Unified message sending that supports all channel types
   */
  private async sendMessageThroughChannel(
    channelConnection: ChannelConnection,
    contact: Contact,
    message: string,
    conversation?: Conversation,
    isFromBot: boolean = true
  ): Promise<any> {
    try {
      const channelType = channelConnection.channelType;
      const contactIdentifier = contact.identifier || contact.phone;

      if (!contactIdentifier) {
        throw new Error('Contact identifier is required for message sending');
      }

      switch (channelType) {
        case 'whatsapp':
        case 'whatsapp_unofficial':
          return await whatsAppService.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            contactIdentifier,
            message,
            isFromBot,
            conversation?.id
          );

        case 'whatsapp_official':
          const whatsAppOfficialService = await import('./channels/whatsapp-official');
          return await whatsAppOfficialService.default.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            channelConnection.companyId || 0,
            contactIdentifier,
            message,
            isFromBot
          );

        case 'instagram':
          return await instagramService.sendMessage(
            channelConnection.id,
            contactIdentifier,
            message,
            channelConnection.userId
          );

        case 'messenger':
          return await messengerService.sendMessage(
            channelConnection.id,
            contactIdentifier,
            message,
            channelConnection.userId
          );

        case 'tiktok':
          if (!conversation?.id) {
            throw new Error('Conversation ID required for TikTok messages');
          }
          return await TikTokService.sendAndSaveMessage(
            channelConnection.id,
            conversation.id,
            contactIdentifier,
            message,
            'text'
          );

        case 'email':
          const emailService = await import('./channels/email');
          return await emailService.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            contactIdentifier,
            'Flow Message',
            message,
            { isHtml: false }
          );

        case 'webchat':
          const webchatService = await import('./channels/webchat');
          return await webchatService.default.sendMessage(
            channelConnection.id,
            contactIdentifier,  // This is the sessionId
            message
          );

        default:
          if (conversation) {
            const insertMessage = {
              conversationId: conversation.id,
              senderId: channelConnection.userId,
              content: message,
              type: 'text' as const,
              direction: 'outbound' as const,
              status: 'sent',
              isFromBot: isFromBot,
              timestamp: new Date()
            };
            return await storage.createMessage(insertMessage);
          }
          throw new Error(`Unsupported channel type: ${channelType}`);
      }
    } catch (error) {
      console.error(`Error sending message through ${channelConnection.channelType}:`, error);
      throw error;
    }
  }

  /**
   * Send media message through the appropriate channel service
   * Unified media sending that supports all channel types
   */
  private async sendMediaThroughChannel(
    channelConnection: ChannelConnection,
    contact: Contact,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    caption?: string,
    filename?: string,
    conversation?: Conversation,
    isFromBot: boolean = true
  ): Promise<any> {
    try {
      const channelType = channelConnection.channelType;
      const contactIdentifier = contact.identifier || contact.phone;

      if (!contactIdentifier) {
        throw new Error('Contact identifier is required for media sending');
      }

      switch (channelType) {
        case 'whatsapp':
        case 'whatsapp_unofficial':
          return await whatsAppService.sendMedia(
            channelConnection.id,
            channelConnection.userId,
            contactIdentifier,
            mediaType,
            mediaUrl,
            caption || '',
            filename || '',
            isFromBot,
            conversation?.id
          );

        case 'whatsapp_official':
          const whatsAppOfficialService = await import('./channels/whatsapp-official');
          return await whatsAppOfficialService.default.sendMedia(
            channelConnection.id,
            channelConnection.userId,
            channelConnection.companyId || 0,
            contactIdentifier,
            mediaType,
            mediaUrl,
            caption,
            filename,
            undefined,
            isFromBot
          );

        case 'instagram':
          if (mediaType === 'image' || mediaType === 'video') {
            return await instagramService.sendMedia(
              channelConnection.id,
              contactIdentifier,
              mediaUrl,
              mediaType,
              caption,
              channelConnection.userId
            );
          } else {
            throw new Error(`Instagram does not support ${mediaType} media type`);
          }

        case 'messenger':
          const messengerMediaType = mediaType === 'document' ? 'file' : mediaType;
          return await messengerService.sendMedia(
            channelConnection.id,
            contactIdentifier,
            mediaUrl,
            messengerMediaType as 'image' | 'video' | 'audio' | 'file'
          );

        case 'tiktok':
          if (!conversation?.id) {
            throw new Error('Conversation ID required for TikTok messages');
          }

          if (mediaType === 'image' || mediaType === 'video') {
            return await TikTokService.sendAndSaveMessage(
              channelConnection.id,
              conversation.id,
              contactIdentifier,
              mediaUrl,
              mediaType
            );
          } else {
            throw new Error(`TikTok does not support ${mediaType} media type`);
          }

        case 'email':
          try {

            const mediaResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
            const mediaBuffer = Buffer.from(mediaResponse.data);
            

            let contentType: string;
            let defaultExtension: string;
            switch (mediaType) {
              case 'image':
                contentType = mediaResponse.headers['content-type'] || 'image/jpeg';
                defaultExtension = contentType.includes('png') ? '.png' : contentType.includes('gif') ? '.gif' : '.jpg';
                break;
              case 'video':
                contentType = mediaResponse.headers['content-type'] || 'video/mp4';
                defaultExtension = contentType.includes('webm') ? '.webm' : '.mp4';
                break;
              case 'audio':
                contentType = mediaResponse.headers['content-type'] || 'audio/mpeg';
                defaultExtension = contentType.includes('ogg') ? '.ogg' : contentType.includes('wav') ? '.wav' : '.mp3';
                break;
              case 'document':
                contentType = mediaResponse.headers['content-type'] || 'application/pdf';
                defaultExtension = contentType.includes('pdf') ? '.pdf' : contentType.includes('doc') ? '.doc' : '.bin';
                break;
              default:
                contentType = mediaResponse.headers['content-type'] || 'application/octet-stream';
                defaultExtension = '.bin';
            }
            

            const attachmentFilename = filename || `attachment${defaultExtension}`;
            

            const emailService = await import('./channels/email');
            return await emailService.sendMessage(
              channelConnection.id,
              channelConnection.userId,
              contactIdentifier,
              'Flow Message',
              caption || `${mediaType} message`,
              {
                isHtml: false,
                attachments: [{
                  filename: attachmentFilename,
                  content: mediaBuffer,
                  contentType: contentType
                }]
              }
            );
          } catch (error: any) {
            console.error(`Error sending email media through ${channelConnection.channelType}:`, error);
            throw new Error(`Failed to send email media: ${error.message}`);
          }

        case 'webchat':
          const webchatService = await import('./channels/webchat');
          return await webchatService.default.sendMessage(
            channelConnection.id,
            contactIdentifier,  // This is the sessionId
            caption || `${mediaType} message`,
            mediaType,
            mediaUrl
          );

        default:
          if (conversation) {
            const insertMessage = {
              conversationId: conversation.id,
              senderId: channelConnection.userId,
              content: caption || `${mediaType} message`,
              type: mediaType,
              direction: 'outbound' as const,
              status: 'sent',
              mediaUrl: mediaUrl,
              isFromBot: isFromBot,
              timestamp: new Date()
            };
            return await storage.createMessage(insertMessage);
          }
          throw new Error(`Unsupported channel type for media: ${channelType}`);
      }
    } catch (error) {
      console.error(`Error sending media through ${channelConnection.channelType}:`, error);
      throw error;
    }
  }

  /**
   * Process an incoming message and execute matching flows
   * Enhanced with session-aware execution state management and user input handling
   * Includes concurrency protection to prevent duplicate processing
   */
  async processIncomingMessage(
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    



    if (channelConnection.channelType === 'whatsapp_unofficial' || channelConnection.channelType === 'whatsapp') {

      if (conversation.isGroup === true) {

        return;
      }


      if (contact.phone) {
        const cleanPhone = contact.phone.replace(/[^\d]/g, '');

        if (isWhatsAppGroupChatId(contact.phone)) {

          return;
        }
      }
    }



    const messageKey = `message_${conversation.id}_${message.id}`;


    if (this.processingConversations.has(messageKey)) {

      return;
    }


    const existingLock = this.processingLocks.get(messageKey);
    if (existingLock) {

      await existingLock;

      if (this.processingConversations.has(messageKey)) {

        return;
      }
    }


    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.processingLocks.set(messageKey, lockPromise);
    this.processingConversations.add(messageKey);

    try {
      if (message.direction === 'outbound') {
        return;
      }


      if (!this.isValidIndividualContact(contact)) {
        return;
      }

      const isBotDisabled = await this.isBotDisabled(conversation.id);
      if (isBotDisabled) {
        const hardResetTriggered = await this.checkHardResetKeyword(message, conversation, contact, channelConnection);
        if (hardResetTriggered) {
          return;
        }
        return;
      }

      const activeSessions = await this.getActiveSessionsForConversation(conversation.id);



      if (activeSessions.length > 0) {

        let messageHandled = false;


        const aiSessions = activeSessions.filter(session => session.aiSessionActive);
    

        if (aiSessions.length > 0) {

          const mostRecentAiSession = aiSessions.reduce((latest, current) =>
            current.lastActivityAt > latest.lastActivityAt ? current : latest
          );


          if (await this.handleAISessionMessage(mostRecentAiSession, message, conversation, contact, channelConnection)) {

            messageHandled = true;
          } else {

          }
        }


        if (!messageHandled) {
          for (const session of activeSessions) {
            if (await this.handleUserInputForSession(session, message, conversation, contact, channelConnection)) {
              messageHandled = true;
              break; // Only one session should handle user input
            }
          }
        }


        if (!messageHandled) {
          for (const session of activeSessions) {
            if (await this.handleActiveSessionMessage(session, message, conversation, contact, channelConnection)) {
              messageHandled = true;
              break; // Only one session should handle the message
            }
          }
        }


        if (messageHandled) {

          return;
        } else {

        }
      }

      const waitingExecutions = this.executionManager.getWaitingExecutionsForConversation(conversation.id);

      for (const execution of waitingExecutions) {
        if (await this.handleUserInputForExecution(execution, message, conversation, contact, channelConnection)) {

          return;
        }
      }


      await this.processNewFlowTriggers(message, conversation, contact, channelConnection);


    } catch (error) {
      console.error('Error processing flow for incoming message:', error);
    } finally {

      this.processingConversations.delete(messageKey);
      this.processingLocks.delete(messageKey);

      if (releaseLock!) {
        releaseLock!();
      }
    }
  }

  /**
   * Handle AI session message routing with state consistency checks
   */
  private async handleAISessionMessage(
    session: FlowSessionState,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {
   


      if (!this.isValidIndividualContact(contact)) {

        return false;
      }


      const flowAssignments = await storage.getFlowAssignments(channelConnection.id);
      const activeAssignments = flowAssignments.filter(assignment => assignment.isActive);
      const sessionFlowAssigned = activeAssignments.some(assignment => assignment.flowId === session.flowId);

      if (!sessionFlowAssigned) {
  


        await this.endAISession(session, message, conversation, contact, channelConnection);
        return false;
      }




      if (!session.aiSessionActive || !session.aiNodeId) {
        


        if (session.aiSessionActive && !session.aiNodeId) {
          console.warn(`Inconsistent AI session state for ${session.sessionId}: active but no nodeId`);
          await this.resetAISessionState(session);
        }
        return false;
      }


      const flowData = await storage.getFlow(session.flowId);
      if (!flowData || !flowData.nodes) {
        console.warn(`Flow ${session.flowId} not found or has no nodes, ending AI session`);
        await this.resetAISessionState(session);
        return false;
      }

      const flowNodes = typeof flowData.nodes === 'string' ? JSON.parse(flowData.nodes) : flowData.nodes;
      const currentAiNode = flowNodes.find((node: any) => node.id === session.aiNodeId);
      if (!currentAiNode) {
        console.warn(`AI node ${session.aiNodeId} not found in flow ${session.flowId}, ending session`);
        await this.resetAISessionState(session);
        return false;
      }

      const messageContent = (message.content || '').trim().toLowerCase();
      const stopKeyword = (session.aiStopKeyword || '').toLowerCase();

      if (stopKeyword && messageContent === stopKeyword) {
        return await this.endAISession(session, message, conversation, contact, channelConnection);
      }

      const baseFlow = await storage.getFlow(session.flowId);
      if (!baseFlow) return false;

      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
      const { nodes } = await this.parseFlowDefinition(flow);

      const aiNode = nodes.find((node: any) => node.id === session.aiNodeId);
      if (!aiNode) {
        console.error(`AI node ${session.aiNodeId} not found in flow`);
        return false;
      }


      const context = new FlowExecutionContext();
      context.setVariable('message', message);
      context.setVariable('message.content', message.content);
      context.setVariable('conversation', conversation);
      context.setVariable('contact', contact);
      context.setVariable('flow.id', session.flowId);
      context.setVariable('execution.id', `ai_session_${session.sessionId}_${Date.now()}`);


      await this.executeAIAssistantNodeWithContext(aiNode, context, conversation, contact, channelConnection);


      if (aiNode.data?.enableTaskExecution) {
        const triggeredTasks = context.getVariable('ai.triggeredTasks') as string[];
        if (triggeredTasks && triggeredTasks.length > 0) {
          


          const baseFlow = await storage.getFlow(session.flowId);
          if (baseFlow) {
            const flowEdges = typeof baseFlow.edges === 'string' ? JSON.parse(baseFlow.edges) : baseFlow.edges;
            const outgoingEdges = flowEdges.filter((edge: any) => edge.source === session.aiNodeId);


            const taskEdges = outgoingEdges.filter((edge: any) =>
              triggeredTasks.includes(edge.sourceHandle)
            );

            if (taskEdges.length > 0) {
          


              const flowEdges = typeof baseFlow.edges === 'string' ? JSON.parse(baseFlow.edges) : baseFlow.edges;


              await this.executeConnectedNodesWithSession(
                session,
                aiNode,
                nodes,
                flowEdges,
                message,
                conversation,
                contact,
                channelConnection,
                context,
                false // skipWaitingCheck
              );
            }
          }
        }
      }

      await this.updateSession(session.sessionId, {
        lastActivityAt: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error handling AI session message:', error);


      try {
        await this.resetAISessionState(session);
      } catch (resetError) {
        console.error(`Failed to reset AI session state after error:`, resetError);
      }

      return false;
    }
  }

  /**
   * End AI session and continue flow execution
   */
  private async endAISession(
    session: FlowSessionState,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {


      session.aiSessionActive = false;
      const aiNodeId = session.aiNodeId;
      const aiExitOutputHandle = session.aiExitOutputHandle;
      session.aiNodeId = null;
      session.aiStopKeyword = null;
      session.aiExitOutputHandle = null;

      await this.updateSession(session.sessionId, {
        lastActivityAt: new Date()
      });

      if (aiNodeId && aiExitOutputHandle) {
        const baseFlow = await storage.getFlow(session.flowId);
        if (baseFlow) {
          const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
          const { nodes, edges } = await this.parseFlowDefinition(flow);

          const aiNode = nodes.find((node: any) => node.id === aiNodeId);
          if (aiNode) {
            const exitEdges = edges.filter((edge: any) =>
              edge.source === aiNodeId && edge.sourceHandle === aiExitOutputHandle
            );

            if (exitEdges.length > 0) {


              const context = new FlowExecutionContext();


              context.setSessionVariables(session.variables, session.sessionId);

              context.setMessageVariables(message);
              context.setVariable('flow.id', session.flowId);
              context.setVariable('session.id', session.sessionId);

              for (const edge of exitEdges) {
                const targetNode = nodes.find((node: any) => node.id === edge.target);
                if (targetNode) {
                  session.executionPath.push(targetNode.id);
                  session.currentNodeId = targetNode.id;

                  await this.updateSession(session.sessionId, {
                    currentNodeId: targetNode.id,
                    executionPath: session.executionPath
                  });

                  await this.executeNodeWithSession(
                    session,
                    targetNode,
                    nodes,
                    edges,
                    message,
                    conversation,
                    contact,
                    channelConnection,
                    context
                  );
                }
              }
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error ending AI session:', error);
      return false;
    }
  }

  /**
   * Activate AI session if the AI Assistant node is configured for session takeover
   */
  private async activateAISessionIfConfigured(
    session: FlowSessionState,
    node: any,
    _context: FlowExecutionContext
  ): Promise<void> {
    try {
      const nodeData = node.data || {};

      const enableSessionTakeover = nodeData.enableSessionTakeover || false;
      const stopKeyword = nodeData.stopKeyword || '';
      const exitOutputHandle = nodeData.exitOutputHandle || 'ai-stopped';

 

      if (enableSessionTakeover) {



        session.aiSessionActive = true;
        session.aiNodeId = node.id;
        session.aiStopKeyword = stopKeyword.trim();
        session.aiExitOutputHandle = exitOutputHandle;


        await this.updateSession(session.sessionId, {
          aiSessionActive: true,
          aiNodeId: node.id,
          aiStopKeyword: stopKeyword.trim(),
          aiExitOutputHandle: exitOutputHandle,
          lastActivityAt: new Date()
        });


      } else {

      }
    } catch (error) {
      console.error('Error activating AI session:', error);
    }
  }

  /**
   * Handle active session message for session-based triggers
   * This method processes messages for sessions with enableSessionPersistence
   */
  private async handleActiveSessionMessage(
    session: FlowSessionState,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {

      if (!this.isValidIndividualContact(contact)) {
        return false;
      }

      if (session.status !== 'active' || session.aiSessionActive) {
        return false;
      }




      const baseFlow = await storage.getFlow(session.flowId);
      if (!baseFlow) {

        return false;
      }

      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
      const { nodes, edges } = await this.parseFlowDefinition(flow);


      const triggerNode = nodes.find((node: any) => node.id === session.triggerNodeId);
      if (!triggerNode) {
        return false;
      }



      if (triggerNode.data?.conditionType === 'multiple_keywords') {

        if (message.metadata && typeof message.metadata === 'object') {
          (message.metadata as any).sessionBasedTrigger = true;
        } else {
          (message as any).sessionBasedTrigger = true;
        }
      }

      const triggerData = triggerNode.data || {};
      const enableSessionPersistence = triggerData.enableSessionPersistence !== false;

      if (!enableSessionPersistence) {
        return false;
      }

      if (!this.triggerSupportsChannel(triggerNode, channelConnection.channelType)) {
        return false;
      }




      await this.updateSession(session.sessionId, {
        lastActivityAt: new Date()
      });


      const context = new FlowExecutionContext();


      for (const [key, value] of Array.from(session.variables.entries())) {
        context.setVariable(key, value);
      }


      context.setContactVariables(contact);
      context.setMessageVariables(message);
      context.setConversationVariables(conversation);
      context.setVariable('flow.id', session.flowId);
      context.setVariable('session.id', session.sessionId);


      const allVariables = context.getAllVariables();
      for (const [key, value] of Object.entries(allVariables)) {
        session.variables.set(key, value);

        if (value !== null && value !== undefined) {
          try {
            await storage.upsertFlowSessionVariable({
              sessionId: session.sessionId,
              variableKey: key,
              variableValue: JSON.stringify(value),
              variableType: typeof value,
              scope: 'session',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          } catch (error) {
            console.error('Error persisting session variable:', error);
          }
        }
      }


      await this.executeConnectedNodesWithSession(
        session,
        triggerNode,
        nodes,
        edges,
        message,
        conversation,
        contact,
        channelConnection,
        context,
        true // Skip waiting check since we want to continue execution
      );

      return true;
    } catch (error) {
      console.error(`[Flow Executor] Error handling active session message for session ${session.sessionId}:`, error);
      return false;
    }
  }

  /**
   * Handle user input for a session
   */
  private async handleUserInputForSession(
    session: FlowSessionState,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {
      if (session.status !== 'waiting' || !session.currentNodeId) {
        return false;
      }

      const baseFlow = await storage.getFlow(session.flowId);
      if (!baseFlow) return false;

      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
      const { nodes, edges } = await this.parseFlowDefinition(flow);

      const currentNode = nodes.find((node: any) => node.id === session.currentNodeId);
      if (!currentNode) return false;

      const tempContext = new FlowExecutionContext();

      for (const [key, value] of Array.from(session.variables.entries())) {
        tempContext.setVariable(key, value);
      }

      tempContext.setVariable('flow.id', session.flowId);
      tempContext.setVariable('session.id', session.sessionId);

      const inputMatches = await this.checkUserInputMatch(currentNode, message, tempContext);

      if (inputMatches) {
        const completeMessage = tempContext.getVariable('message.content') || message.content || '';
        const inputType = tempContext.getVariable('user.inputType') || 'text';

        tempContext.setUserInput(completeMessage, inputType);

        const updatedMessage = { ...message, content: completeMessage };
        tempContext.setMessageVariables(updatedMessage);

        const allVariables = tempContext.getAllVariables();
        for (const [key, value] of Object.entries(allVariables)) {
          session.variables.set(key, value);

          if (value !== null && value !== undefined) {
            try {
              await storage.upsertFlowSessionVariable({
                sessionId: session.sessionId,
                variableKey: key,
                variableValue: JSON.stringify(value),
                variableType: typeof value,
                scope: 'session',
                createdAt: new Date(),
                updatedAt: new Date()
              });
            } catch (error) {
              console.error('Error persisting session variable:', error);
            }
          }
        }

        await this.updateSession(session.sessionId, {
          status: 'active',
          waitingContext: null,
          lastActivityAt: new Date()
        });

        await this.continueSessionExecutionFromNode(
          session,
          currentNode,
          nodes,
          edges,
          message,
          conversation,
          contact,
          channelConnection
        );

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error handling user input for session:', error);
      return false;
    }
  }

  /**
   * Continue session execution from a specific node
   */
  private async continueSessionExecutionFromNode(
    session: FlowSessionState,
    currentNode: any,
    allNodes: any[],
    edges: any[],
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const context = new FlowExecutionContext();


      context.setSessionVariables(session.variables, session.sessionId);

      context.setVariable('flow.id', session.flowId);
      context.setVariable('session.id', session.sessionId);

      await this.executeConnectedNodesWithSession(
        session,
        currentNode,
        allNodes,
        edges,
        message,
        conversation,
        contact,
        channelConnection,
        context,
        true
      );
    } catch (error) {
      console.error('Error continuing session execution:', error);
      await this.updateSession(session.sessionId, {
        status: 'failed',
        waitingContext: null
      });
    }
  }

  /**
   * Execute connected nodes with session awareness
   */
  private async executeConnectedNodesWithSession(
    session: FlowSessionState,
    currentNode: any,
    allNodes: any[],
    edges: any[],
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    context: FlowExecutionContext,
    skipWaitingCheck: boolean = false,
    visitedNodes: Set<string> = new Set(),
    maxDepth: number = 100
  ): Promise<void> {
    

    try {

      if (visitedNodes.has(currentNode.id)) {
        console.warn(`Cycle detected: Node ${currentNode.id} already visited in session ${session.sessionId}`);
        await this.updateSession(session.sessionId, {
          status: 'failed'
        });
        return;
      }

      if (visitedNodes.size >= maxDepth) {
        console.warn(`Maximum execution depth (${maxDepth}) reached in session ${session.sessionId}`);
        await this.updateSession(session.sessionId, {
          status: 'failed'
        });
        return;
      }


      const newVisitedNodes = new Set(visitedNodes);
      newVisitedNodes.add(currentNode.id);


      context.setVariable('currentNode.id', currentNode.id);
      context.setVariable('currentNode.type', currentNode.type);
      context.setVariable('currentNode.conditionType', currentNode.data?.conditionType);

      if (!skipWaitingCheck) {
        const currentNodeType = NodeTypeUtils.normalizeNodeType(currentNode.type || '', currentNode.data?.label);
        const shouldWaitForInput = this.shouldNodeWaitForInput(currentNodeType, currentNode);

        if (shouldWaitForInput) {

          await this.updateSession(session.sessionId, {
            status: 'waiting',
            waitingContext: {
              nodeId: currentNode.id,
              nodeType: currentNodeType,
              expectedInputType: this.getExpectedInputType(currentNode),
              timestamp: new Date()
            }
          });

          this.emit('sessionWaiting', {
            sessionId: session.sessionId,
            nodeId: currentNode.id,
            nodeType: currentNodeType
          });

          return;
        }
      }

      const outgoingEdges = edges.filter((edge: any) => edge.source === currentNode.id);

      if (outgoingEdges.length === 0) {

        const triggerNode = allNodes.find((node: any) => node.id === session.triggerNodeId);
        const isSessionBasedTrigger = triggerNode?.data?.enableSessionPersistence === true;

        if (isSessionBasedTrigger) {


          await this.updateSession(session.sessionId, {
            status: 'active',
            currentNodeId: session.triggerNodeId,
            lastActivityAt: new Date()
          });
          return;
        } else {

          await this.updateSession(session.sessionId, {
            status: 'completed',
            currentNodeId: null
          });

          this.emit('sessionCompleted', {
            sessionId: session.sessionId,
            flowId: session.flowId,
            conversationId: session.conversationId
          });

          return;
        }
      }

      const nodeType = currentNode.type || '';
      const nodeLabel = (currentNode.data && currentNode.data.label) || '';
      const currentNodeType = NodeTypeUtils.normalizeNodeType(nodeType, nodeLabel);
      const isConditionNode = nodeType === 'conditionNode' ||
                             nodeType === 'condition' ||
                             nodeLabel === 'Condition Node' ||
                             currentNodeType === NodeType.CONDITION;

      let edgesToExecute = outgoingEdges;

      if (isConditionNode) {
        const conditionResult = await this.executeConditionNodeWithContext(currentNode, context);

        const yesEdges = outgoingEdges.filter((edge: any) =>
          edge.sourceHandle === 'yes' ||
          edge.sourceHandle === 'true' ||
          edge.sourceHandle === 'success' ||
          edge.sourceHandle === 'positive'
        );

        const noEdges = outgoingEdges.filter((edge: any) =>
          edge.sourceHandle === 'no' ||
          edge.sourceHandle === 'false' ||
          edge.sourceHandle === 'failure' ||
          edge.sourceHandle === 'negative'
        );

        if (conditionResult) {
          edgesToExecute = yesEdges.length > 0 ? yesEdges : [];
        } else {
          edgesToExecute = noEdges.length > 0 ? noEdges : [];
        }

        if (yesEdges.length === 0 && noEdges.length === 0) {

          edgesToExecute = outgoingEdges;
        }
      } else if (nodeType === 'trigger' && currentNode.data?.conditionType === 'multiple_keywords') {



        const isSessionBasedTrigger = (message.metadata as any)?.sessionBasedTrigger || (message as any).sessionBasedTrigger;
        const matchedKeyword = (message.metadata as any)?.matchedKeyword || (message as any).matchedKeyword;



        if (isSessionBasedTrigger) {


          const defaultEdges = outgoingEdges.filter((edge: any) => !edge.sourceHandle || edge.sourceHandle === 'default');
          edgesToExecute = defaultEdges.length > 0 ? defaultEdges : outgoingEdges;
          
        } else if (matchedKeyword) {

          const keywordHandleId = `keyword-${matchedKeyword.toLowerCase().replace(/\s+/g, '-')}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);


          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;

          } else {

            const defaultEdges = outgoingEdges.filter((edge: any) => !edge.sourceHandle || edge.sourceHandle === 'default');
            edgesToExecute = defaultEdges.length > 0 ? defaultEdges : outgoingEdges;
            
          }
        } else {

        }
      } else if (currentNodeType === NodeType.MESSAGE && currentNode.data?.enableKeywordTriggers) {

        const matchType = context.getVariable('messageNode.matchType');
        const matchedKeyword = context.getVariable('messageNode.matchedKeyword');

        if (matchType === 'keyword' && matchedKeyword) {

          const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
          const keywordHandleId = `keyword-${keywordValue}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;
          } else {

            const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
            edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
          }
        } else if (matchType === 'no-match') {

          const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        } else {

          edgesToExecute = outgoingEdges;
        }
      } else if (currentNodeType === NodeType.IMAGE && currentNode.data?.enableKeywordTriggers) {

        const matchType = context.getVariable('messageNode.matchType');
        const matchedKeyword = context.getVariable('messageNode.matchedKeyword');

        if (matchType === 'keyword' && matchedKeyword) {

          const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
          const keywordHandleId = `keyword-${keywordValue}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;
          } else {

            const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
            edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
          }
        } else if (matchType === 'no-match') {

          const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        } else {

          edgesToExecute = outgoingEdges;
        }
      } else if (currentNodeType === NodeType.VIDEO && currentNode.data?.enableKeywordTriggers) {

        const matchType = context.getVariable('messageNode.matchType');
        const matchedKeyword = context.getVariable('messageNode.matchedKeyword');

        if (matchType === 'keyword' && matchedKeyword) {

          const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
          const keywordHandleId = `keyword-${keywordValue}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;
          } else {

            const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
            edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
          }
        } else if (matchType === 'no-match') {

          const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        } else {

          edgesToExecute = outgoingEdges;
        }
      } else if (currentNodeType === NodeType.DOCUMENT && currentNode.data?.enableKeywordTriggers) {

        const matchType = context.getVariable('messageNode.matchType');
        const matchedKeyword = context.getVariable('messageNode.matchedKeyword');

        if (matchType === 'keyword' && matchedKeyword) {

          const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
          const keywordHandleId = `keyword-${keywordValue}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;
          } else {

            const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
            edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
          }
        } else if (matchType === 'no-match') {

          const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        } else {

          edgesToExecute = outgoingEdges;
        }
      } else if (currentNodeType === NodeType.AUDIO && currentNode.data?.enableKeywordTriggers) {

        const matchType = context.getVariable('messageNode.matchType');
        const matchedKeyword = context.getVariable('messageNode.matchedKeyword');

        if (matchType === 'keyword' && matchedKeyword) {

          const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
          const keywordHandleId = `keyword-${keywordValue}`;
          const keywordEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

          if (keywordEdges.length > 0) {
            edgesToExecute = keywordEdges;
          } else {

            const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
            edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
          }
        } else if (matchType === 'no-match') {

          const noMatchEdges = outgoingEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        } else {

          edgesToExecute = outgoingEdges;
        }
      } else if (currentNodeType === NodeType.AI_ASSISTANT && currentNode.data?.enableTaskExecution) {
        const triggeredTasks = context.getVariable('ai.triggeredTasks') as string[];

        if (triggeredTasks && triggeredTasks.length > 0) {
          const taskEdges = outgoingEdges.filter((edge: any) =>
            triggeredTasks.includes(edge.sourceHandle)
          );

          if (taskEdges.length > 0) {

            edgesToExecute = taskEdges;
          } else {

            edgesToExecute = [];
          }
        } else {

          edgesToExecute = [];
        }
      } else if (currentNodeType === NodeType.WHATSAPP_INTERACTIVE_BUTTONS) {

        const selectedButtonPayload = context.getVariable('selectedButtonPayload');

  

        if (selectedButtonPayload) {

          const selectedEdges = outgoingEdges.filter((edge: any) => {
            return edge.sourceHandle === selectedButtonPayload;
          });



          edgesToExecute = selectedEdges;
        } else {

          edgesToExecute = [];
        }
      } else if (currentNodeType === NodeType.WHATSAPP_INTERACTIVE_LIST) {

        const selectedListPayload = context.getVariable('selectedListPayload');


        if (selectedListPayload) {

          const selectedEdges = outgoingEdges.filter((edge: any) => {
            return edge.sourceHandle === selectedListPayload;
          });


          edgesToExecute = selectedEdges;
        } else {

          edgesToExecute = [];
        }
      }



      if (currentNodeType === NodeType.UPDATE_PIPELINE_STAGE || currentNodeType === NodeType.MANAGE_CONTACT) {
        edgesToExecute = outgoingEdges;
      }

      for (const edge of edgesToExecute) {
        const targetNode = allNodes.find((node: any) => node.id === edge.target);
        if (!targetNode) {

          continue;
        }

        

        const shouldTraverse = await this.evaluateEdgeCondition(edge, context);


        if (shouldTraverse) {
          session.executionPath.push(targetNode.id);
          session.currentNodeId = targetNode.id;

          await this.updateSession(session.sessionId, {
            currentNodeId: targetNode.id,
            executionPath: session.executionPath
          });

          await this.executeNodeWithSession(
            session,
            targetNode,
            allNodes,
            edges,
            message,
            conversation,
            contact,
            channelConnection,
            context
          );

          if (!isConditionNode && (edge.data?.conditionType || edge.data?.condition)) {
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error executing connected nodes with session:', error);
      await this.updateSession(session.sessionId, {
        status: 'failed'
      });
    }
  }

  /**
   * Check if a node type should wait for user input
   */
  private shouldNodeWaitForInput(nodeType: string | null, node?: any): boolean {
    if (!nodeType) return false;

    switch (nodeType) {
      case NodeType.QUICK_REPLY:
      case NodeType.WHATSAPP_POLL:
      case NodeType.WHATSAPP_INTERACTIVE_BUTTONS:
      case NodeType.WHATSAPP_INTERACTIVE_LIST:
      case NodeType.WHATSAPP_LOCATION_REQUEST:
      case NodeType.INPUT:
        return true;
      case NodeType.MESSAGE:

        return node?.data?.enableKeywordTriggers === true;
      case NodeType.IMAGE:

        return node?.data?.enableKeywordTriggers === true;
      case NodeType.VIDEO:

        return node?.data?.enableKeywordTriggers === true;
      case NodeType.DOCUMENT:

        return node?.data?.enableKeywordTriggers === true;
      case NodeType.AUDIO:

        return node?.data?.enableKeywordTriggers === true;
      case NodeType.WAIT:
        return false;
      default:
        return false;
    }
  }

  /**
   * Execute a single node with session context
   */
  private async executeNodeWithSession(
    session: FlowSessionState,
    node: any,
    allNodes: any[],
    edges: any[],
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    context: FlowExecutionContext
  ): Promise<void> {
    try {
      const nodeType = NodeTypeUtils.normalizeNodeType(node.type || '', node.data?.label);

      session.nodeStates.set(node.id, {
        startTime: new Date(),
        nodeType: nodeType || 'unknown',
        status: 'executing'
      });

      switch (nodeType) {
        case NodeType.MESSAGE:
          await this.executeMessageNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.IMAGE:
          await this.executeMessageNodeWithContext(node, context, conversation, contact, channelConnection, 'image');
          break;

        case NodeType.VIDEO:
          await this.executeMessageNodeWithContext(node, context, conversation, contact, channelConnection, 'video');
          break;

        case NodeType.AUDIO:
          await this.executeMessageNodeWithContext(node, context, conversation, contact, channelConnection, 'audio');
          break;

        case NodeType.DOCUMENT:
          await this.executeMessageNodeWithContext(node, context, conversation, contact, channelConnection, 'document');
          break;

        case NodeType.QUICK_REPLY:
          await this.executeQuickReplyNodeWithContext(node, context, conversation, contact, channelConnection);
          break;
        case NodeType.WHATSAPP_POLL:
          await this.executeWhatsAppPollNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WHATSAPP_INTERACTIVE_BUTTONS:
          await this.executeWhatsAppInteractiveButtonsNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WHATSAPP_INTERACTIVE_LIST:
          await this.executeWhatsAppInteractiveListNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WHATSAPP_CTA_URL:
          await this.executeWhatsAppCTAURLNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WHATSAPP_LOCATION_REQUEST:
          await this.executeWhatsAppLocationRequestNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.FOLLOW_UP:
          await this.executeFollowUpNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.CONDITION:
          await this.executeConditionNodeWithContext(node, context);
          break;

        case NodeType.WAIT:
          await this.executeWaitNodeWithContext(node, context);
          break;

        case NodeType.AI_ASSISTANT:
          await this.executeAIAssistantNodeWithContext(node, context, conversation, contact, channelConnection);
          await this.activateAISessionIfConfigured(session, node, context);


          if (node.data?.enableTaskExecution) {
            const triggeredTasks = context.getVariable('ai.triggeredTasks') as string[];
            if (triggeredTasks && triggeredTasks.length > 0) {
              

              break;
            }
          }

          if (session.aiSessionActive) {

            return;
          }
          break;

        case NodeType.WEBHOOK:
          await this.executeWebhookNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.CONTACT_NOTIFICATION:
          await this.executeContactNotificationNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.HTTP_REQUEST:
          await this.executeHttpRequestNodeWithContext(node, context, conversation, contact, channelConnection);
          break;
        case NodeType.CODE_EXECUTION:
          await this.executeCodeExecutionNodeWithContext(node, context, conversation, contact, channelConnection);
          return; // Don't continue flow since we sent response directly

        case NodeType.BOT_DISABLE:
          await this.executeBotDisableNodeWithContext(node, context, conversation, contact, channelConnection);

          return;

        case NodeType.STRIPE:
          await this.executeStripeNodeWithContext(node, context, conversation, contact, channelConnection);
          return; // Terminal node - stop flow execution

        case NodeType.BOT_RESET:
          await this.executeBotResetNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.INPUT:
          await this.executeInputNodeWithContext(node, context, conversation, contact, channelConnection);

          return;

        case NodeType.ACTION:
          await this.executeActionNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.SHOPIFY:
          await this.executeShopifyNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WOOCOMMERCE:
          await this.executeWooCommerceNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.WHATSAPP_FLOWS:
          await this.executeWhatsAppFlowsNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.TYPEBOT:
          await this.executeTypebotNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.FLOWISE:
          await this.executeFlowiseNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.N8N:
          await this.executeN8nNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.MAKE:
          await this.executeMakeNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.GOOGLE_SHEETS:
          await this.executeGoogleSheetsNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.DATA_CAPTURE:
          await this.executeDataCaptureNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.DOCUMIND:
          await this.executeDocumindNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.CHAT_PDF:
          await this.executeChatPdfNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.CALL_AGENT:





          await this.executeCallAgentNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.GOOGLE_CALENDAR:
          await this.executeGoogleCalendarNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.UPDATE_PIPELINE_STAGE:
          await this.executeUpdatePipelineStageNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.MOVE_DEAL_TO_PIPELINE:
          await this.executeMoveDealToPipelineNode(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.MANAGE_CONTACT:
          await this.executeManageContactNodeWithContext(node, context, conversation, contact, channelConnection);
          break;

        case NodeType.TRIGGER:

          break;

        default:

          break;
      }

      session.nodeStates.set(node.id, {
        ...session.nodeStates.get(node.id),
        endTime: new Date(),
        status: 'completed'
      });

      const allVariables = context.getAllVariables();
      for (const [key, value] of Object.entries(allVariables)) {
        session.variables.set(key, value);

        if (value !== null && value !== undefined) {
          try {
            await storage.upsertFlowSessionVariable({
              sessionId: session.sessionId,
              variableKey: key,
              variableValue: JSON.stringify(value),
              variableType: typeof value,
              scope: 'session',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          } catch (error) {
            console.error('Error persisting session variable:', error);
          }
        }
      }









      await this.executeConnectedNodesWithSession(
        session,
        node,
        allNodes,
        edges,
        message,
        conversation,
        contact,
        channelConnection,
        context,
        false, // skipWaitingCheck
        new Set(), // Start fresh for this execution path
        100 // Default max depth
      );

    } catch (error) {
      console.error(`Error executing node ${node.id} in session ${session.sessionId}:`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      session.nodeStates.set(node.id, {
        ...session.nodeStates.get(node.id),
        endTime: new Date(),
        status: 'failed',
        error: errorMessage
      });

      await this.updateSession(session.sessionId, {
        status: 'failed'
      });
    }
  }

  /**
   * Get expected input type for a node
   */
  private getExpectedInputType(node: any): string {
    const nodeType = NodeTypeUtils.normalizeNodeType(node.type || '', node.data?.label);

    switch (nodeType) {
      case NodeType.QUICK_REPLY:
        return 'quick_reply';
      case NodeType.WHATSAPP_POLL:
        return 'whatsapp_poll';
      case NodeType.WHATSAPP_INTERACTIVE_BUTTONS:
        return 'whatsapp_interactive_button';
      case NodeType.WHATSAPP_INTERACTIVE_LIST:
        return 'whatsapp_interactive_list';
      case NodeType.WHATSAPP_LOCATION_REQUEST:
        return 'location';
      case NodeType.MESSAGE:
        return node.data?.enableKeywordTriggers ? 'message_keyword' : 'text';
      case NodeType.IMAGE:
        return node.data?.enableKeywordTriggers ? 'image_keyword' : 'text';
      case NodeType.VIDEO:
        return node.data?.enableKeywordTriggers ? 'video_keyword' : 'text';
      case NodeType.DOCUMENT:
        return node.data?.enableKeywordTriggers ? 'document_keyword' : 'text';
      case NodeType.AUDIO:
        return node.data?.enableKeywordTriggers ? 'audio_keyword' : 'text';
      case NodeType.INPUT:
        return node.data?.inputType || 'text';
      case NodeType.WAIT:
        return 'none';
      default:
        return 'text';
    }
  }

  /**
   * Evaluate edge condition
   */
  private async evaluateEdgeCondition(edge: any, context: FlowExecutionContext): Promise<boolean> {


    try {
      if (edge.sourceHandle && edge.sourceHandle.startsWith('option-')) {

        return this.evaluateQuickReplyEdge(edge, context);
      }


      if (edge.sourceHandle && edge.sourceHandle.startsWith('keyword-')) {



        const message = context.getVariable('message') as any;
        const triggerMatchedKeyword = message?.metadata?.matchedKeyword || message?.matchedKeyword;
        const isSessionBasedTrigger = message?.metadata?.sessionBasedTrigger || message?.sessionBasedTrigger;




        if (isSessionBasedTrigger) {

          return true;
        }

        if (triggerMatchedKeyword) {

          const keywordHandleId = `keyword-${triggerMatchedKeyword.toLowerCase().replace(/\s+/g, '-')}`;
          const result = edge.sourceHandle === keywordHandleId;

          return result;
        } else {

          const currentNodeId = context.getVariable('currentNode.id');
          const currentNodeType = context.getVariable('currentNode.type');
          const currentNodeCondition = context.getVariable('currentNode.conditionType');

          

          if (currentNodeType === 'trigger' && currentNodeCondition === 'any') {

            return true;
          }



          return this.evaluateMessageNodeKeywordEdge(edge, context);
        }
      }


      if (edge.sourceHandle === 'no-match') {
        return this.evaluateMessageNodeNoMatchEdge(edge, context);
      }

      if (!edge.data?.condition && !edge.data?.conditionType) {
        return true;
      }

      const condition = edge.data.condition || edge.data.conditionType;
      const conditionValue = edge.data.conditionValue || edge.data.value || '';

      switch (condition?.toLowerCase()) {
        case 'always':
        case 'true':
          return true;

        case 'never':
        case 'false':
          return false;

        case 'equals':
          const variable = context.getVariable(edge.data.variable || 'selectedOption');
          return variable === conditionValue;

        case 'contains':
          const textVariable = context.getVariable(edge.data.variable || 'message.content') || '';
          return textVariable.toLowerCase().includes(conditionValue.toLowerCase());

        default:
          return true;
      }
    } catch (error) {
      console.error('Error evaluating edge condition:', error);
      return true;
    }
  }

  /**
   * Evaluate Quick Reply node edge based on user selection
   * Also used for WhatsApp Poll nodes
   */
  private evaluateQuickReplyEdge(edge: any, context: FlowExecutionContext): boolean {
    try {
      const sourceHandle = edge.sourceHandle;
      

      if (sourceHandle === 'go-back') {
        const isGoBackSelected = context.getVariable('isGoBackSelected');

        return isGoBackSelected === true;
      }


      if (sourceHandle === 'invalid-response') {
        const pollInvalidResponse = context.getVariable('poll.invalidResponse');
        const quickReplyInvalidResponse = context.getVariable('quickReply.invalidResponse');
        const isInvalidResponse = pollInvalidResponse || quickReplyInvalidResponse;

        return isInvalidResponse === true;
      }


      const optionMatch = sourceHandle.match(/option-(\d+)/);

      if (!optionMatch) {

        return false;
      }

      const edgeOptionNumber = parseInt(optionMatch[1], 10);
      const selectedOptionIndex = context.getVariable('selectedOptionIndex');



      if (selectedOptionIndex === null || selectedOptionIndex === undefined || selectedOptionIndex === -1) {

        return false;
      }

      const selectedOptionNumber = selectedOptionIndex + 1;
      const shouldTraverse = edgeOptionNumber === selectedOptionNumber;



      return shouldTraverse;
    } catch (error) {
      console.error('Error evaluating Quick Reply edge:', error);
      return false;
    }
  }

  /**
   * Evaluate Message Node keyword edge based on matched keyword
   */
  private evaluateMessageNodeKeywordEdge(edge: any, context: FlowExecutionContext): boolean {
    try {
      const sourceHandle = edge.sourceHandle;
      const matchType = context.getVariable('messageNode.matchType');


      if (matchType !== 'keyword') {
        return false;
      }

      const matchedKeyword = context.getVariable('messageNode.matchedKeyword');
      if (!matchedKeyword) {
        return false;
      }


      const keywordPrefix = 'keyword-';
      if (!sourceHandle.startsWith(keywordPrefix)) {
        return false;
      }

      const handleKeywordValue = sourceHandle.substring(keywordPrefix.length);
      const matchedKeywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');

      return handleKeywordValue === matchedKeywordValue;
    } catch (error) {
      console.error('Error evaluating Message Node keyword edge:', error);
      return false;
    }
  }

  /**
   * Evaluate Message Node no-match edge
   */
  private evaluateMessageNodeNoMatchEdge(edge: any, context: FlowExecutionContext): boolean {
    try {
      const matchType = context.getVariable('messageNode.matchType');
      return matchType === 'no-match';
    } catch (error) {
      console.error('Error evaluating Message Node no-match edge:', error);
      return false;
    }
  }

  /**
   * Handle user input for waiting executions
   */
  private async handleUserInputForExecution(
    execution: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {

      if (!this.isValidIndividualContact(contact)) {
        return false;
      }
      const baseFlow = await storage.getFlow(execution.flowId);
      if (!baseFlow) return false;

      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
      const { nodes, edges } = await this.parseFlowDefinition(flow);

      const currentNode = nodes.find((node: any) => node.id === execution.currentNodeId);
      if (!currentNode) return false;

      const inputMatches = await this.checkUserInputMatch(currentNode, message, execution.context);

      if (inputMatches) {
        const completeMessage = execution.context.getVariable('message.content') || message.content || '';
        const inputType = execution.context.getVariable('user.inputType') || 'text';

        execution.context.setUserInput(completeMessage, inputType);

        const updatedMessage = { ...message, content: completeMessage };
        execution.context.setMessageVariables(updatedMessage);

        this.executionManager.resumeExecution(execution.id, completeMessage);

        await this.continueExecutionFromNode(
          execution.id,
          currentNode,
          nodes,
          edges,
          updatedMessage,
          conversation,
          contact,
          channelConnection
        );

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error handling user input for execution:', error);
      return false;
    }
  }

  /**
   * Process new flow triggers with concurrency protection
   */
  private async processNewFlowTriggers(
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    


    if (!this.isValidIndividualContact(contact)) {

      return;
    }



    const flowAssignments = await storage.getFlowAssignments(channelConnection.id);
    const activeAssignments = flowAssignments.filter(assignment => assignment.isActive);

    

    if (activeAssignments.length === 0) {

      return;
    }


    const conversationKey = `flow_trigger_${conversation.id}`;
    if (this.processingConversations.has(conversationKey)) {

      return;
    }

    this.processingConversations.add(conversationKey);

    try {

      for (const assignment of activeAssignments) {
        try {
          await this.executeFlow(assignment, message, conversation, contact, channelConnection);
        } catch (error) {
          console.error(`Error executing flow ${assignment.flowId} for conversation ${conversation.id}:`, error);

        }
      }
    } finally {

      this.processingConversations.delete(conversationKey);
    }
  }

  /**
   * Parse flow definition to extract nodes and edges
   */
  private async parseFlowDefinition(flow: Flow): Promise<{ nodes: any[], edges: any[] }> {
    let nodes: any[] = [];
    let edges: any[] = [];

    if (flow.definition) {
      try {
        const definition = typeof flow.definition === 'string'
          ? JSON.parse(flow.definition)
          : flow.definition;

        if (definition.nodes && Array.isArray(definition.nodes)) {
          nodes = definition.nodes;
        }

        if (definition.edges && Array.isArray(definition.edges)) {
          edges = definition.edges;
        }
      } catch (error) {
        console.error('Error parsing flow definition:', error);
      }
    }

    if (nodes.length === 0) {
      try {
        if (typeof flow.nodes === 'string') {
          nodes = JSON.parse(flow.nodes);
        } else if (flow.nodes && Array.isArray(flow.nodes)) {
          nodes = flow.nodes;
        }
      } catch (error) {
        console.error('Error parsing flow nodes:', error);
        nodes = [];
      }
    }

    if (edges.length === 0) {
      try {
        if (typeof flow.edges === 'string') {
          edges = JSON.parse(flow.edges);
        } else if (flow.edges && Array.isArray(flow.edges)) {
          edges = flow.edges;
        }
      } catch (error) {
        console.error('Error parsing flow edges:', error);
        edges = [];
      }
    }

    return { nodes, edges };
  }

  /**
   * Check if user input matches expected input for a node
   */
  private async checkUserInputMatch(node: any, message: Message, context: FlowExecutionContext): Promise<boolean> {
    try {
      const nodeType = NodeTypeUtils.normalizeNodeType(node.type || '', node.data?.label);

      if (!nodeType) {

        return true;
      }

      switch (nodeType) {
        case NodeType.QUICK_REPLY:
          return this.handleQuickReplyInput(node, message, context);

        case NodeType.WHATSAPP_POLL:
          return await this.handleWhatsAppPollInput(node, message, context);

        case NodeType.WHATSAPP_INTERACTIVE_BUTTONS:
          return this.handleWhatsAppInteractiveButtonsInput(node, message, context);

        case NodeType.WHATSAPP_INTERACTIVE_LIST:
          return this.handleWhatsAppInteractiveListInput(node, message, context);

        case NodeType.MESSAGE:
          return this.handleMessageNodeKeywordInput(node, message, context);

        case NodeType.IMAGE:
          return this.handleMessageNodeKeywordInput(node, message, context);

        case NodeType.VIDEO:
          return this.handleMessageNodeKeywordInput(node, message, context);

        case NodeType.DOCUMENT:
          return this.handleMessageNodeKeywordInput(node, message, context);

        case NodeType.AUDIO:
          return this.handleMessageNodeKeywordInput(node, message, context);

        case NodeType.CONDITION:
          return true;

        case NodeType.INPUT:
          return true;

        default:
          return NodeTypeUtils.requiresUserInput(nodeType);
      }
    } catch (error) {
      console.error('Flow executor: Error checking user input match:', error);
      return true;
    }
  }

  /**
   * Handle quick reply input matching
   */
  private handleQuickReplyInput(node: any, message: Message, context: FlowExecutionContext): boolean {
    try {
      const options = node.data?.options || [];
      const messageContent = message.content?.toLowerCase() || '';


      const enableGoBack = node.data?.enableGoBack !== false;
      const goBackValue = (node.data?.goBackValue || 'go_back').toLowerCase();
      const goBackText = node.data?.goBackText || '← Go Back';

      if (enableGoBack && messageContent === goBackValue) {
        context.setVariable('selectedOption', { text: goBackText, value: goBackValue });
        context.setVariable('selectedOptionIndex', -1); // Special index for go back
        context.setVariable('selectedOptionText', goBackText);
        context.setVariable('isGoBackSelected', true);

        const questionText = context.getVariable('quickReply.questionText') || '';
        const completeMessage = questionText
          ? `${questionText} [User selected: ${goBackText}]`
          : `[User selected: ${goBackText}]`;

        context.setVariable('message.content', completeMessage);
        context.setVariable('message.originalContent', message.content);
        context.setVariable('quickReply.completeInteraction', completeMessage);
        context.setVariable('user.input', completeMessage);
        context.setVariable('user.lastInput', completeMessage);
        context.setVariable('user.inputType', 'quickreply_goback');

        return true;
      }


      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const optionText = (option.text || option.label || '').toLowerCase();
        const optionValue = (option.value || '').toLowerCase();
        const optionIndex = (i + 1).toString();

        if (messageContent === optionText || messageContent === optionValue || messageContent === optionIndex) {
          context.setVariable('selectedOption', option);
          context.setVariable('selectedOptionIndex', i);
          context.setVariable('selectedOptionText', option.text || option.label);
          context.setVariable('isGoBackSelected', false);

          const questionText = context.getVariable('quickReply.questionText') || '';
          const selectedText = option.text || option.label || '';

          const completeMessage = questionText
            ? `${questionText} [User selected: ${selectedText}]`
            : `[User selected: ${selectedText}]`;

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('quickReply.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);
          context.setVariable('user.inputType', 'quickreply');

          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Flow executor: Error handling quick reply input:', error);
      return false;
    }
  }

  /**
   * Handle WhatsApp Poll input matching
   * Similar to Quick Reply but also handles poll vote messages
   */
  private async handleWhatsAppPollInput(node: any, message: Message, context: FlowExecutionContext): Promise<boolean> {
    try {

      const baseOptions = node.data?.options || [];
      const contextOptions = context.getVariable('poll.options') || baseOptions;
      const options = contextOptions.length > 0 ? contextOptions : baseOptions;
      
      const messageContent = message.content?.toLowerCase() || '';










      if (message.type === 'poll_vote') {
        let selectedOptionIndex = 0; // Default to first option


        if (messageContent.startsWith('poll_vote_selected:')) {
          const indexStr = messageContent.split(':')[1];
          const parsedIndex = parseInt(indexStr, 10);
          if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < options.length) {
            selectedOptionIndex = parsedIndex;

          } else {

          }
        } else {

          try {
            const messageMetadata = typeof message.metadata === 'string'
              ? JSON.parse(message.metadata)
              : message.metadata || {};
            const pollVoteData = messageMetadata.pollVote;




            if (pollVoteData && typeof pollVoteData.selectedIndex === 'number') {

              selectedOptionIndex = pollVoteData.selectedIndex;

            } else if (pollVoteData && pollVoteData.encPayload && options.length > 0) {


              try {

                const payloadArray = Object.values(pollVoteData.encPayload) as number[];
                const payloadSum = payloadArray.reduce((sum, val, idx) => sum + val * (idx + 1), 0);
                selectedOptionIndex = Math.abs(payloadSum) % options.length;

              } catch (extractError) {
                console.error('Error extracting from poll payload:', extractError);
                selectedOptionIndex = 0;
              }
            } else {

              selectedOptionIndex = 0;
            }
          } catch (error) {
            console.error('Error decrypting poll vote from metadata:', error);

            selectedOptionIndex = 0;
          }
        }

        if (options.length > 0 && selectedOptionIndex < options.length) {
          const option = options[selectedOptionIndex];





          const goBackValue = (node.data?.goBackValue || 'go_back').toLowerCase();
          const isGoBackOption = option.value && option.value.toLowerCase() === goBackValue;
          
          if (isGoBackOption) {

            context.setVariable('isGoBackSelected', true);
            context.setVariable('user.inputType', 'poll_goback');
          } else {
            context.setVariable('isGoBackSelected', false);
            context.setVariable('user.inputType', 'poll_vote');
          }

          context.setVariable('selectedOption', option);
          context.setVariable('selectedOptionIndex', selectedOptionIndex);
          context.setVariable('selectedOptionText', option.text || option.label);

          const questionText = context.getVariable('poll.questionText') || '';
          const selectedText = option.text || option.label || '';
          const completeMessage = questionText
            ? `${questionText} [User voted in poll: ${selectedText}]`
            : `[User voted in poll: ${selectedText}]`;




          context.setVariable('quickReply.selectedOption', option);
          context.setVariable('quickReply.selectedOptionIndex', selectedOptionIndex);
          context.setVariable('quickReply.selectedOptionText', selectedText);

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('poll.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);

          return true;
        }
      }



      const enableGoBack = node.data?.enableGoBack !== false;
      const goBackValue = (node.data?.goBackValue || 'go_back').toLowerCase();
      const goBackText = node.data?.goBackText || '← Go Back';

      if (enableGoBack && messageContent === goBackValue) {
        context.setVariable('selectedOption', { text: goBackText, value: goBackValue });
        context.setVariable('selectedOptionIndex', -1); // Special index for go back
        context.setVariable('selectedOptionText', goBackText);
        context.setVariable('isGoBackSelected', true);

        const questionText = context.getVariable('poll.questionText') || '';
        const completeMessage = questionText
          ? `${questionText} [User selected: ${goBackText}]`
          : `[User selected: ${goBackText}]`;

        context.setVariable('message.content', completeMessage);
        context.setVariable('message.originalContent', message.content);
        context.setVariable('poll.completeInteraction', completeMessage);
        context.setVariable('user.input', completeMessage);
        context.setVariable('user.lastInput', completeMessage);
        context.setVariable('user.inputType', 'poll_goback');





        return true;
      }


      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const optionText = (option.text || option.label || '').toLowerCase();
        const optionValue = (option.value || '').toLowerCase();
        const optionIndex = (i + 1).toString();

        if (messageContent === optionText || messageContent === optionValue || messageContent === optionIndex) {
          context.setVariable('selectedOption', option);
          context.setVariable('selectedOptionIndex', i);
          context.setVariable('selectedOptionText', option.text || option.label);

          const questionText = context.getVariable('quickReply.questionText') || '';
          const selectedText = option.text || option.label || '';

          const completeMessage = questionText
            ? `${questionText} [User selected: ${selectedText}]`
            : `[User selected: ${selectedText}]`;

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('quickReply.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);
          context.setVariable('user.inputType', 'whatsapp_poll');







          return true;
        }
      }


      context.setVariable('poll.invalidResponse', true);
      context.setVariable('poll.invalidResponseMessage', messageContent);



      return false;
    } catch (error) {
      console.error('Error handling WhatsApp poll input:', error);
      return false;
    }
  }

  /**
   * Decrypt poll vote to determine which option was selected
   * This is a simplified implementation - for now it returns a random option
   * TODO: Implement proper poll vote decryption using the encryption data
   */
  private async decryptPollVote(pollVoteData: any, options: any[]): Promise<number> {
    try {

      let encPayload = pollVoteData.encPayload;


      if (typeof encPayload === 'object' && encPayload !== null) {

        const bufferArray = Object.values(encPayload) as number[];
        const buffer = Buffer.from(bufferArray);
        encPayload = buffer.toString('base64');
      } else if (typeof encPayload !== 'string') {
        encPayload = String(encPayload || '');
      }



      const hash = encPayload.slice(-4); 
      let hashValue = 0;


      for (let i = 0; i < hash.length; i++) {
        hashValue += hash.charCodeAt(i);
      }

      const selectedIndex = hashValue % options.length;

      return selectedIndex;
    } catch (error) {
      console.error('Error in poll vote decryption:', error);
      return 0; 
    }
  }
  /**
   * Handle WhatsApp Interactive Buttons input matching
   */
  private handleWhatsAppInteractiveButtonsInput(node: any, message: Message, context: FlowExecutionContext): boolean {
    try {
      const buttons = node.data?.buttons || [];
      const messageContent = message.content?.toLowerCase() || '';




      let messageMetadata: any = {};
      if (message.metadata) {
        if (typeof message.metadata === 'string') {
          try {
            messageMetadata = JSON.parse(message.metadata);
          } catch (error) {
            console.error('Error parsing message metadata:', error);
            messageMetadata = {};
          }
        } else if (typeof message.metadata === 'object') {
          messageMetadata = message.metadata;
        }
      }
      const isInteractiveResponse = messageMetadata?.messageType === 'interactive' ||
                                   messageMetadata?.type === 'button';


      if (isInteractiveResponse && messageMetadata?.button) {
        const buttonPayload = messageMetadata.button.payload;
        const buttonText = messageMetadata.button.text;


        const matchedButton = buttons.find((btn: any) => btn.payload === buttonPayload);

        if (matchedButton) {
          context.setVariable('selectedButton', matchedButton);
          context.setVariable('selectedButtonPayload', buttonPayload);
          context.setVariable('selectedButtonTitle', buttonText || matchedButton.title);

          const bodyText = context.getVariable('whatsappInteractive.bodyText') || '';
          const completeMessage = bodyText
            ? `${bodyText} [User selected: ${buttonText || matchedButton.title}]`
            : `[User selected: ${buttonText || matchedButton.title}]`;

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('whatsappInteractive.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);
          context.setVariable('user.inputType', 'whatsapp_interactive_button');

          return true;
        }
      }


      for (const button of buttons) {
        const buttonTitle = (button.title || '').toLowerCase();
        const buttonPayload = (button.payload || '').toLowerCase();

        if (messageContent === buttonTitle || messageContent === buttonPayload) {
          context.setVariable('selectedButton', button);
          context.setVariable('selectedButtonPayload', button.payload);
          context.setVariable('selectedButtonTitle', button.title);

          const bodyText = context.getVariable('whatsappInteractive.bodyText') || '';
          const completeMessage = bodyText
            ? `${bodyText} [User selected: ${button.title}]`
            : `[User selected: ${button.title}]`;

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('whatsappInteractive.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);
          context.setVariable('user.inputType', 'whatsapp_interactive_button');

          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Flow executor: Error handling WhatsApp interactive buttons input:', error);
      return false;
    }
  }

  /**
   * Handle WhatsApp Interactive List input matching
   */
  private handleWhatsAppInteractiveListInput(node: any, message: Message, context: FlowExecutionContext): boolean {
    try {
      const sections = node.data?.sections || [];
      const messageContent = message.content?.toLowerCase() || '';


      let messageMetadata: any = {};
      if (message.metadata) {
        if (typeof message.metadata === 'string') {
          try {
            messageMetadata = JSON.parse(message.metadata);
          } catch (error) {
            console.error('Error parsing message metadata:', error);
            messageMetadata = {};
          }
        } else if (typeof message.metadata === 'object') {
          messageMetadata = message.metadata;
        }
      }

      const isInteractiveResponse = messageMetadata?.messageType === 'interactive' ||
                                   messageMetadata?.type === 'list';


      if (isInteractiveResponse && messageMetadata?.list) {
        const listPayload = messageMetadata.list.payload;
        const listText = messageMetadata.list.text;
        const listDescription = messageMetadata.list.description;


        let matchedRow = null;
        let matchedSection = null;

        for (const section of sections) {
          const foundRow = section.rows?.find((row: any) => row.payload === listPayload);
          if (foundRow) {
            matchedRow = foundRow;
            matchedSection = section;
            break;
          }
        }

        if (matchedRow) {
          context.setVariable('selectedListItem', matchedRow);
          context.setVariable('selectedListPayload', listPayload);
          context.setVariable('selectedListTitle', listText || matchedRow.title);
          context.setVariable('selectedListDescription', listDescription || matchedRow.description);
          context.setVariable('selectedListSection', matchedSection);

          const bodyText = context.getVariable('whatsappInteractive.bodyText') || '';
          const completeMessage = bodyText
            ? `${bodyText} [User selected: ${listText || matchedRow.title}]`
            : `[User selected: ${listText || matchedRow.title}]`;

          context.setVariable('message.content', completeMessage);
          context.setVariable('message.originalContent', message.content);
          context.setVariable('whatsappInteractive.completeInteraction', completeMessage);
          context.setVariable('user.input', completeMessage);
          context.setVariable('user.lastInput', completeMessage);
          context.setVariable('user.inputType', 'whatsapp_interactive_list');

          return true;
        }
      }


      for (const section of sections) {
        for (const row of section.rows || []) {
          const rowTitle = (row.title || '').toLowerCase();
          const rowPayload = (row.payload || '').toLowerCase();

          if (messageContent === rowTitle || messageContent === rowPayload) {
            context.setVariable('selectedListItem', row);
            context.setVariable('selectedListPayload', row.payload);
            context.setVariable('selectedListTitle', row.title);
            context.setVariable('selectedListDescription', row.description);
            context.setVariable('selectedListSection', section);

            const bodyText = context.getVariable('whatsappInteractive.bodyText') || '';
            const completeMessage = bodyText
              ? `${bodyText} [User selected: ${row.title}]`
              : `[User selected: ${row.title}]`;

            context.setVariable('message.content', completeMessage);
            context.setVariable('message.originalContent', message.content);
            context.setVariable('whatsappInteractive.completeInteraction', completeMessage);
            context.setVariable('user.input', completeMessage);
            context.setVariable('user.lastInput', completeMessage);
            context.setVariable('user.inputType', 'whatsapp_interactive_list');

            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Flow executor: Error handling WhatsApp interactive list input:', error);
      return false;
    }
  }

  /**
   * Handle Message Node keyword input matching
   */
  private handleMessageNodeKeywordInput(node: any, message: Message, context: FlowExecutionContext): boolean {
    try {

      const enableKeywordTriggers = node.data?.enableKeywordTriggers;
      if (!enableKeywordTriggers) {

        return true;
      }

      const keywords = node.data?.keywords || [];
      if (keywords.length === 0) {

        context.setVariable('messageNode.matchedKeyword', null);
        context.setVariable('messageNode.matchType', 'no-match');
        context.setVariable('messageNode.userInput', message.content);
        return true;
      }

      const messageContent = message.content || '';


      for (const keyword of keywords) {
        const keywordValue = keyword.value || '';
        const caseSensitive = keyword.caseSensitive || false;

        if (!keywordValue) continue;

        const userInput = caseSensitive ? messageContent : messageContent.toLowerCase();
        const matchValue = caseSensitive ? keywordValue : keywordValue.toLowerCase();


        if (userInput === matchValue || userInput.includes(matchValue)) {

          context.setVariable('messageNode.matchedKeyword', keyword);
          context.setVariable('messageNode.matchType', 'keyword');
          context.setVariable('messageNode.matchedKeywordValue', keyword.value);
          context.setVariable('messageNode.matchedKeywordText', keyword.text);
          context.setVariable('messageNode.userInput', message.content);


          context.setVariable('selectedKeyword', keyword);
          context.setVariable('selectedKeywordValue', keyword.value);
          context.setVariable('user.input', message.content);
          context.setVariable('user.lastInput', message.content);
          context.setVariable('user.inputType', 'message_keyword');

          return true;
        }
      }


      context.setVariable('messageNode.matchedKeyword', null);
      context.setVariable('messageNode.matchType', 'no-match');
      context.setVariable('messageNode.userInput', message.content);
      context.setVariable('user.input', message.content);
      context.setVariable('user.lastInput', message.content);
      context.setVariable('user.inputType', 'message_no_match');

      return true;
    } catch (error) {
      console.error('Flow executor: Error handling message node keyword input:', error);

      context.setVariable('messageNode.matchType', 'no-match');
      return true;
    }
  }

  /**
   * Continue execution from a specific node
   */
  private async continueExecutionFromNode(
    executionId: string,
    currentNode: any,
    nodes: any[],
    edges: any[],
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const execution = this.executionManager.getExecution(executionId);
    if (!execution) return;

    await this.executeConnectedNodesWithExecution(
      executionId,
      currentNode,
      nodes,
      edges,
      message,
      conversation,
      contact,
      channelConnection
    );
  }

  /**
   * Execute a specific flow for an incoming message - Enhanced Session-Aware Style
   */
  async executeFlow(
    assignment: FlowAssignment,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    

    try {
      const isBotDisabled = await this.isBotDisabled(conversation.id);
      if (isBotDisabled) {

        return;
      }

      const baseFlow = await storage.getFlow(assignment.flowId);

      if (!baseFlow) {
        console.error(`❌ Flow ${assignment.flowId} not found`);
        return;
      }



      const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };


      const { nodes, edges } = await this.parseFlowDefinition(flow);

      if (nodes.length === 0) {
        return;
      }

      const triggerNodes = nodes.filter((node: any) =>
        node.type === 'triggerNode' ||
        node.type === 'trigger' ||
        (node.data && node.data.label === 'Message Trigger')
      );


      if (triggerNodes.length === 0) {

        return;
      }

      for (const triggerNode of triggerNodes) {
        

        if (await this.matchesTriggerWithSession(triggerNode, message, conversation, contact, channelConnection)) {

          const existingSession = await this.getActiveTriggerSession(triggerNode.id, conversation.id, contact.id);

          let sessionId: string;
          let session: FlowSessionState | null;

          if (existingSession) {
            sessionId = existingSession.sessionId;
            session = existingSession;
          } else {

            const originalMatchedKeyword = (message.metadata as any)?.matchedKeyword || (message as any).matchedKeyword;
            const enhancedTriggerData = {
              ...triggerNode.data,
              originalMatchedKeyword: originalMatchedKeyword
            };



            sessionId = await this.createSession(
              flow.id,
              conversation.id,
              contact.id,
              conversation.companyId || 0,
              triggerNode.id,
              {
                message,
                contact,
                conversation,
                channelConnection
              },
              enhancedTriggerData
            );
            session = this.activeSessions.get(sessionId) || null;
          }

          if (!session) {
            console.error(`Failed to get or create session for flow ${flow.id}`);
            return;
          }

          const context = new FlowExecutionContext();
          context.setContactVariables(contact);
          context.setMessageVariables(message);
          context.setConversationVariables(conversation);

          context.setVariable('flow.id', flow.id);
          context.setVariable('flow.companyId', conversation.companyId || 0);
          context.setVariable('session.id', sessionId);


          const messageMetadata = message.metadata as any;
          if (messageMetadata?.pipelineTrigger && messageMetadata?.triggerData) {
            const triggerData = messageMetadata.triggerData;
            context.setVariable('pipeline.previousPipelineId', triggerData.previousPipelineId || null);
            context.setVariable('pipeline.currentPipelineId', triggerData.pipelineId || null);
            context.setVariable('pipeline.previousStageId', triggerData.previousStageId || null);
            context.setVariable('pipeline.currentStageId', triggerData.stageId || null);
            context.setVariable('pipeline.pipelineChanged', triggerData.previousPipelineId !== triggerData.pipelineId);
            context.setVariable('pipeline.stageChanged', triggerData.previousStageId !== triggerData.stageId);
          } else {

            context.setVariable('pipeline.previousPipelineId', null);
            context.setVariable('pipeline.currentPipelineId', null);
            context.setVariable('pipeline.previousStageId', null);
            context.setVariable('pipeline.currentStageId', null);
            context.setVariable('pipeline.pipelineChanged', false);
            context.setVariable('pipeline.stageChanged', false);
          }

          const allVariables = context.getAllVariables();
          for (const [key, value] of Object.entries(allVariables)) {
            session.variables.set(key, value);

            if (value !== null && value !== undefined) {
              try {
                await storage.upsertFlowSessionVariable({
                  sessionId: session.sessionId,
                  variableKey: key,
                  variableValue: JSON.stringify(value),
                  variableType: typeof value,
                  scope: 'session',
                  createdAt: new Date(),
                  updatedAt: new Date()
                });
              } catch (error) {
                console.error('Error persisting initial session variable:', error);
              }
            }
          }

          

          await this.executeConnectedNodesWithSession(
            session,
            triggerNode,
            nodes,
            edges,
            message,
            conversation,
            contact,
            channelConnection,
            context
          );



          const executionId = this.executionManager.startExecution(
            flow.id,
            conversation.id,
            contact.id,
            triggerNode.id,
            {
              message: message,
              contact: contact,
              conversation: conversation,
              channelConnection: channelConnection,
              sessionId: sessionId
            }
          );

          const execution = this.executionManager.getExecution(executionId);
          if (execution) {
            execution.context.setContactVariables(contact);
            execution.context.setMessageVariables(message);
            execution.context.setConversationVariables(conversation);
            execution.context.setVariable('flow.id', flow.id);
            execution.context.setVariable('session.id', sessionId);
          }

          break;
        }
      }

    } catch (error) {
      console.error(`Error executing flow ${assignment.flowId}:`, error);
    }
  }

  /**
   * Emit pipeline trigger event to start flows
   */
  private async emitPipelineTriggerEvent(
    triggerType: 'deal_enters_pipeline' | 'deal_moves_between_pipelines' | 'deal_stage_changed',
    triggerData: {
      dealId: number;
      contactId: number;
      pipelineId: number;
      stageId?: number;
      previousPipelineId?: number;
      previousStageId?: number;
      triggeredBy: 'user' | 'automation' | 'flow';
    },
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const flowAssignments = await storage.getFlowAssignments(channelConnection.id);
      const activeAssignments = flowAssignments.filter(assignment => assignment.isActive);

      if (activeAssignments.length === 0) {
        return;
      }


      const syntheticMessage: Message = {
        id: 0,
        conversationId: conversation.id,
        externalId: null,
        direction: 'inbound',
        type: 'text',
        content: `Pipeline trigger: ${triggerType}`,
        metadata: {
          pipelineTrigger: true,
          triggerType,
          triggerData
        },
        senderId: contact.id,
        senderType: 'contact',
        status: 'received',
        sentAt: new Date(),
        readAt: null,
        isFromBot: false,
        mediaUrl: null,
        createdAt: new Date(),
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };


      for (const assignment of activeAssignments) {
        try {
          await this.executeFlow(assignment, syntheticMessage, conversation, contact, channelConnection);
        } catch (error) {
          console.error(`Error executing flow ${assignment.flowId} for pipeline trigger ${triggerType}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error emitting pipeline trigger event ${triggerType}:`, error);
    }
  }

  /**
   * Check if a message matches a trigger node's conditions
   */
  /**
   * Check if a trigger node matches the incoming message with session-based logic
   */
  async matchesTriggerWithSession(
    triggerNode: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    const data = triggerNode.data || {};
    const enableSessionPersistence = data.enableSessionPersistence !== false;

    

    if (!this.triggerSupportsChannel(triggerNode, channelConnection.channelType)) {

      return false;
    }

    if (!enableSessionPersistence) {

      return this.matchesTrigger(triggerNode, message, channelConnection);
    }

    

    const existingSession = await this.getActiveTriggerSession(triggerNode.id, conversation.id, contact.id);

    if (existingSession) {


      await this.updateSession(existingSession.sessionId, {
        lastActivityAt: new Date()
      });



      if (data.conditionType === 'multiple_keywords') {


        if (message.metadata && typeof message.metadata === 'object') {
          (message.metadata as any).sessionBasedTrigger = true;
        } else {
          (message as any).sessionBasedTrigger = true;
        }
      }

      return true;
    } else {

    }


    const conditionMatches = this.matchesTrigger(triggerNode, message, channelConnection);

    if (conditionMatches) {

      return true;
    }


    return false;
  }

  /**
   * Get active trigger session for a specific trigger node and contact
   */
  private async getActiveTriggerSession(
    triggerNodeId: string,
    conversationId: number,
    contactId: number
  ): Promise<FlowSessionState | null> {
    try {
     

      for (const [sessionId, session] of Array.from(this.activeSessions.entries())) {
        

        if (session.triggerNodeId === triggerNodeId &&
            session.conversationId === conversationId &&
            session.contactId === contactId &&
            (session.status === 'active' || session.status === 'waiting')) {

          if (session.expiresAt && new Date() > session.expiresAt) {

            await this.expireSession(sessionId);
            return null;
          }


          return session;
        }
      }

      const dbSessions = await storage.getActiveFlowSessionsForConversation(conversationId);
      for (const dbSession of dbSessions) {
        if (dbSession.triggerNodeId === triggerNodeId &&
            dbSession.contactId === contactId) {

          if (dbSession.expiresAt && new Date() > dbSession.expiresAt) {
            await storage.expireFlowSession(dbSession.sessionId);
            return null;
          }

          const session = await this.loadSession(dbSession.sessionId);
          return session;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if trigger node supports the given channel type
   * Enhanced to support all channel types properly
   */
  private triggerSupportsChannel(triggerNode: any, channelType: string): boolean {
    const data = triggerNode.data || {};
    const supportedChannels = data.channelTypes || data.channels;


    if (!supportedChannels || supportedChannels.length === 0) {
      const allSupportedChannels = [
        'whatsapp_unofficial',
        'whatsapp_official',
        'messenger',
        'instagram',
        'email',
        'webchat'
      ];
      return allSupportedChannels.includes(channelType);
    }


    if (typeof supportedChannels === 'string') {
      return supportedChannels === channelType;
    }


    if (Array.isArray(supportedChannels)) {
      return supportedChannels.includes(channelType);
    }


    return channelType === 'whatsapp_unofficial' || channelType === 'whatsapp';
  }

  /**
   * Enhanced trigger matching with channel-specific logic
   */
  matchesTrigger(triggerNode: any, message: Message, channelConnection?: ChannelConnection): boolean {
    const data = triggerNode.data || {};
    const triggerType = data.triggerType || 'message_received';
    const conditionType = data.conditionType || data.condition || 'any';
    const conditionValue = data.conditionValue || data.value || '';
    const channelType = channelConnection?.channelType || 'whatsapp_unofficial';


    if (triggerType === 'deal_enters_pipeline' || 
        triggerType === 'deal_moves_between_pipelines' || 
        triggerType === 'deal_stage_changed') {

      const messageMetadata = message.metadata as any;
      if (messageMetadata?.pipelineTrigger && messageMetadata?.triggerType === triggerType) {

        const triggerData = messageMetadata.triggerData;
        if (data.pipelineId && triggerData?.pipelineId !== data.pipelineId) {
          return false;
        }
        if (data.stageId && triggerData?.stageId !== data.stageId) {
          return false;
        }
        return true;
      }
      return false;
    }


    if (!this.isConditionSupportedByChannel(conditionType, channelType)) {
      return false;
    }


    if (message.type !== 'text' &&
        conditionType.toLowerCase() !== 'any' &&
        conditionType.toLowerCase() !== 'media' &&
        conditionType.toLowerCase() !== 'has_media') {
      return false;
    }

    const condition = conditionType.toLowerCase();

    if (condition === 'any' || condition === 'any message') {
      return true;
    }


    if (condition === 'contains' || condition === 'contains word') {
      return this.matchesContainsCondition(message.content, conditionValue);
    }

    if (condition === 'exact' || condition === 'exact match') {
      return message.content.toLowerCase() === conditionValue.toLowerCase();
    }

    if (condition === 'regex' || condition === 'regex pattern') {
      return this.matchesRegexCondition(message.content, conditionValue);
    }


    if (condition === 'multiple_keywords') {

      const matchedKeyword = this.matchesMultipleKeywordsCondition(triggerNode, message);
      if (matchedKeyword) {

        if (message.metadata && typeof message.metadata === 'object') {
          (message.metadata as any).matchedKeyword = matchedKeyword;
        } else {
          (message as any).matchedKeyword = matchedKeyword;
        }
        return true;
      }

      return false;
    }


    if (condition === 'media' || condition === 'has media') {
      return message.mediaUrl !== null && message.mediaUrl !== undefined;
    }


    if (channelType === 'email') {
      return this.matchesEmailCondition(condition, conditionValue, message);
    }

    return false;
  }

  /**
   * Check if condition type is supported by channel
   * Enhanced to support all channel types properly
   */
  private isConditionSupportedByChannel(conditionType: string, channelType: string): boolean {
    const condition = conditionType.toLowerCase();


    const universalConditions = ['any', 'contains', 'exact', 'multiple_keywords', 'regex'];
    if (universalConditions.includes(condition)) {
      return true;
    }


    if (condition === 'media' || condition === 'has_media') {
      const mediaChannels = [
        'whatsapp_unofficial',
        'whatsapp_official',
        'messenger',
        'instagram',
        'webchat'
      ];
      return mediaChannels.includes(channelType);
    }


    const emailConditions = ['subject_contains', 'from_domain', 'has_attachment'];
    if (emailConditions.includes(condition)) {
      return channelType === 'email';
    }


    const whatsappConditions = ['poll_response', 'button_click'];
    if (whatsappConditions.includes(condition)) {
      return channelType === 'whatsapp_unofficial' ||
             channelType === 'whatsapp_official';
    }


    const socialMediaConditions = ['quick_reply', 'postback'];
    if (socialMediaConditions.includes(condition)) {
      return channelType === 'messenger' || channelType === 'instagram';
    }


    return false;
  }

  /**
   * Enhanced contains condition matching
   */
  private matchesContainsCondition(content: string, conditionValue: string): boolean {
    const messageContent = content.toLowerCase();

    if (conditionValue.includes(',')) {
      const keywords = conditionValue.split(',')
        .map((word: string) => word.trim().toLowerCase())
        .filter((word: string) => word.length > 0);
      return keywords.some((keyword: string) => messageContent.includes(keyword));
    } else {
      return messageContent.includes(conditionValue.toLowerCase());
    }
  }

  /**
   * Enhanced regex condition matching with error handling
   */
  private matchesRegexCondition(content: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(content);
    } catch (error) {
      console.error('Invalid regex pattern:', pattern, error);
      return false;
    }
  }

  /**
   * Email-specific condition matching
   */
  private matchesEmailCondition(condition: string, conditionValue: string, message: Message): boolean {
    const emailMetadata = message.emailHeaders && typeof message.emailHeaders === 'string'
      ? JSON.parse(message.emailHeaders)
      : (message.emailHeaders || {});

    switch (condition) {
      case 'subject_contains':
        const subject = message.emailSubject || emailMetadata.subject || '';
        return subject.toLowerCase().includes(conditionValue.toLowerCase());

      case 'from_domain':
        const fromHeader = emailMetadata.from || '';
        const domain = fromHeader.split('@')[1]?.toLowerCase() || '';
        return domain === conditionValue.toLowerCase();

      case 'has_attachment':
        return message.mediaUrl !== null || (emailMetadata.attachments && emailMetadata.attachments.length > 0);

      default:
        return false;
    }
  }

  /**
   * Multiple keywords condition matching - returns the matched keyword or null
   */
  private matchesMultipleKeywordsCondition(triggerNode: any, message: Message): string | null {
    const data = triggerNode.data || {};
    let keywordsArray = data.keywordsArray || [];
    const caseSensitive = data.keywordsCaseSensitive || false;



    if (!keywordsArray || keywordsArray.length === 0) {
      const multipleKeywords = data.multipleKeywords || '';
      if (multipleKeywords) {
        keywordsArray = multipleKeywords
          .split(',')
          .map((keyword: string) => keyword.trim())
          .filter((keyword: string) => keyword.length > 0);

      }
    }

    if (!keywordsArray || keywordsArray.length === 0) {
      console.warn('❌ Multiple keywords condition has no keywords to match against');
      return null;
    }


    if (!message.content || typeof message.content !== 'string') {
      return null;
    }

    const messageContent = caseSensitive ? message.content : message.content.toLowerCase();

    for (const keyword of keywordsArray) {
      if (!keyword || typeof keyword !== 'string') {
        continue;
      }
      const searchKeyword = caseSensitive ? keyword.trim() : keyword.trim().toLowerCase();
      const matches = searchKeyword.length > 0 && messageContent.includes(searchKeyword);

      if (matches) {
        return keyword.trim(); // Return the original keyword
      }
    }
    return null;
  }

  /**
   * Get availability data from the flow context
   * This implementation uses data stored by the GoogleCalendarAvailabilityNode
   */
  getAvailabilityData(message: Message): string {
    try {


      const today = new Date();
      const formattedDate = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const extendedMessage = message as Message & {
        flowContext?: {
          availabilityData?: string
        }
      };

      if (extendedMessage.flowContext && extendedMessage.flowContext.availabilityData) {
        return extendedMessage.flowContext.availabilityData;
      }

      const availableTimes = [
        '9:00 AM - 10:00 AM',
        '11:30 AM - 12:30 PM',
        '2:00 PM - 3:00 PM',
        '4:30 PM - 5:30 PM'
      ];

      return `Available times on ${formattedDate}:\n\n${availableTimes.join('\n')}`;
    } catch (error) {
      console.error('Error getting availability data:', error);
      return 'No availability data found. Please try again later.';
    }
  }

  /**
   * Replace variables in a message with values from the context
   */
  replaceVariables(template: string, message: Message, contact: Contact): string {
    try {
      const contactVars: Record<string, string> = {
        'contact.id': contact.id?.toString() || '',
        'contact.name': contact.name || '',
        'contact.identifier': contact.identifier || '',
        'contact.phone': contact.phone || '',
        'contact.email': contact.email || '',
      };

      const messageVars: Record<string, string> = {
        'message.content': message.content || '',
        'message.type': message.type || '',
      };

      const calendarVars: Record<string, string> = {
        'availability': this.getAvailabilityData(message)
      };

      const dateVars: Record<string, string> = {
        'date.today': new Date().toLocaleDateString(),
        'time.now': new Date().toLocaleTimeString()
      };

      const allVars = { ...contactVars, ...messageVars, ...calendarVars, ...dateVars };

      let result = template;
      for (const [key, value] of Object.entries(allVars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value.toString());
      }

      return result;
    } catch (error) {
      console.error('Error replacing variables:', error);
      return template;
    }
  }










  /**
   * Execute nodes connected to the current node with execution tracking
   */
  async executeConnectedNodesWithExecution(
    executionId: string,
    currentNode: any,
    allNodes: any[],
    edges: any[],
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    visitedNodes: Set<string> = new Set(),
    maxDepth: number = 100,
    pathId?: string
  ): Promise<void> {
    const execution = this.executionManager.getExecution(executionId);
    if (!execution) {
      console.error(`Execution ${executionId} not found`);
      return;
    }


    if (visitedNodes.has(currentNode.id)) {
      console.warn(`Cycle detected: Node ${currentNode.id} already visited in execution ${executionId}`);
      this.executionManager.failExecution(executionId, `Infinite loop detected at node ${currentNode.id}`);
      return;
    }

    if (visitedNodes.size >= maxDepth) {
      console.warn(`Maximum execution depth (${maxDepth}) reached in execution ${executionId}`);
      this.executionManager.failExecution(executionId, `Maximum execution depth exceeded`);
      return;
    }


    const newVisitedNodes = new Set(visitedNodes);
    newVisitedNodes.add(currentNode.id);



    const currentPathId = pathId || Array.from(newVisitedNodes).join('-');

    const connectedEdges = edges.filter((edge: any) => edge.source === currentNode.id);


    const nodeType = currentNode.type || '';
    const nodeLabel = (currentNode.data && currentNode.data.label) || '';
    const isConditionNode = nodeType === 'conditionNode' ||
                           nodeType === 'condition' ||
                           nodeLabel === 'Condition Node';

    const isQuickReplyNode = nodeType === 'quickreplyNode' ||
                            nodeType === 'quickreply' ||
                            nodeType === 'whatsapp_poll' ||
                            nodeLabel === 'Quickreply Node' ||
                            nodeLabel === 'Quick Reply Options' ||
                            nodeLabel === 'WhatsApp Poll' ||
                            nodeLabel === 'WhatsApp Poll Node';

    const isWhatsAppInteractiveButtonsNode = nodeType === 'whatsapp_interactive_buttons' ||
                                           nodeType === 'whatsappInteractiveButtons' ||
                                           nodeLabel === 'WhatsApp Interactive Buttons';

    const isWhatsAppInteractiveListNode = nodeType === 'whatsapp_interactive_list' ||
                                         nodeType === 'whatsappInteractiveList' ||
                                         nodeLabel === 'WhatsApp Interactive List';

    const isWebhookNode = nodeType === 'webhook' ||
                         nodeType === 'webhookNode' ||
                         nodeLabel === 'Webhook' ||
                         nodeLabel === 'Webhook Node';

    let edgesToExecute = connectedEdges;

    if (isConditionNode) {
      const conditionResult = await this.executeConditionNodeWithContext(currentNode, execution.context);

      const yesEdges = connectedEdges.filter((edge: any) =>
        edge.sourceHandle === 'yes' ||
        edge.sourceHandle === 'true' ||
        edge.sourceHandle === 'success' ||
        edge.sourceHandle === 'positive'
      );

      const noEdges = connectedEdges.filter((edge: any) =>
        edge.sourceHandle === 'no' ||
        edge.sourceHandle === 'false' ||
        edge.sourceHandle === 'failure' ||
        edge.sourceHandle === 'negative'
      );

      if (conditionResult) {
        edgesToExecute = yesEdges.length > 0 ? yesEdges : [];
      } else {
        edgesToExecute = noEdges.length > 0 ? noEdges : [];
      }

      if (yesEdges.length === 0 && noEdges.length === 0) {

        edgesToExecute = connectedEdges;
      }
    } else if (isQuickReplyNode) {
      const selectedOptionIndex = execution.context.getVariable('selectedOptionIndex');

      if (selectedOptionIndex !== null && selectedOptionIndex !== undefined) {
        const selectedOptionNumber = selectedOptionIndex + 1;
        const selectedEdges = connectedEdges.filter((edge: any) => {
          if (edge.sourceHandle && edge.sourceHandle.startsWith('option-')) {
            const optionMatch = edge.sourceHandle.match(/option-(\d+)/);
            if (optionMatch) {
              const edgeOptionNumber = parseInt(optionMatch[1], 10);
              return edgeOptionNumber === selectedOptionNumber;
            }
          }
          return false;
        });

        edgesToExecute = selectedEdges;
      } else {

        edgesToExecute = [];
      }
    } else if (isWhatsAppInteractiveButtonsNode) {
      const selectedButtonPayload = execution.context.getVariable('selectedButtonPayload');

      if (selectedButtonPayload) {

        const selectedEdges = connectedEdges.filter((edge: any) => {
          return edge.sourceHandle === selectedButtonPayload;
        });

        edgesToExecute = selectedEdges;
      } else {

        edgesToExecute = [];
      }
    } else if (isWhatsAppInteractiveListNode) {
      const selectedListPayload = execution.context.getVariable('selectedListPayload');

      if (selectedListPayload) {

        const selectedEdges = connectedEdges.filter((edge: any) => {
          return edge.sourceHandle === selectedListPayload;
        });

        edgesToExecute = selectedEdges;
      } else {

        edgesToExecute = [];
      }
    } else if (nodeType === 'message' && currentNode.data?.enableKeywordTriggers) {

      const matchType = execution.context.getVariable('messageNode.matchType');
      const matchedKeyword = execution.context.getVariable('messageNode.matchedKeyword');

      if (matchType === 'keyword' && matchedKeyword) {

        const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
        const keywordHandleId = `keyword-${keywordValue}`;
        const keywordEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

        if (keywordEdges.length > 0) {
          edgesToExecute = keywordEdges;
        } else {

          const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        }
      } else if (matchType === 'no-match') {

        const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
        edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
      } else {

        edgesToExecute = connectedEdges;
      }
    } else if (nodeType === 'image' && currentNode.data?.enableKeywordTriggers) {

      const matchType = execution.context.getVariable('messageNode.matchType');
      const matchedKeyword = execution.context.getVariable('messageNode.matchedKeyword');

      if (matchType === 'keyword' && matchedKeyword) {

        const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
        const keywordHandleId = `keyword-${keywordValue}`;
        const keywordEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

        if (keywordEdges.length > 0) {
          edgesToExecute = keywordEdges;
        } else {

          const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        }
      } else if (matchType === 'no-match') {

        const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
        edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
      } else {

        edgesToExecute = connectedEdges;
      }
    } else if (nodeType === 'video' && currentNode.data?.enableKeywordTriggers) {

      const matchType = execution.context.getVariable('messageNode.matchType');
      const matchedKeyword = execution.context.getVariable('messageNode.matchedKeyword');

      if (matchType === 'keyword' && matchedKeyword) {

        const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
        const keywordHandleId = `keyword-${keywordValue}`;
        const keywordEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

        if (keywordEdges.length > 0) {
          edgesToExecute = keywordEdges;
        } else {

          const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        }
      } else if (matchType === 'no-match') {

        const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
        edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
      } else {

        edgesToExecute = connectedEdges;
      }
    } else if (nodeType === 'document' && currentNode.data?.enableKeywordTriggers) {

      const matchType = execution.context.getVariable('messageNode.matchType');
      const matchedKeyword = execution.context.getVariable('messageNode.matchedKeyword');

      if (matchType === 'keyword' && matchedKeyword) {

        const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
        const keywordHandleId = `keyword-${keywordValue}`;
        const keywordEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

        if (keywordEdges.length > 0) {
          edgesToExecute = keywordEdges;
        } else {

          const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        }
      } else if (matchType === 'no-match') {

        const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
        edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
      } else {

        edgesToExecute = connectedEdges;
      }
    } else if (nodeType === 'audio' && currentNode.data?.enableKeywordTriggers) {

      const matchType = execution.context.getVariable('messageNode.matchType');
      const matchedKeyword = execution.context.getVariable('messageNode.matchedKeyword');

      if (matchType === 'keyword' && matchedKeyword) {

        const keywordValue = (matchedKeyword.value || '').toLowerCase().replace(/\s+/g, '-');
        const keywordHandleId = `keyword-${keywordValue}`;
        const keywordEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === keywordHandleId);

        if (keywordEdges.length > 0) {
          edgesToExecute = keywordEdges;
        } else {

          const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
          edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
        }
      } else if (matchType === 'no-match') {

        const noMatchEdges = connectedEdges.filter((edge: any) => edge.sourceHandle === 'no-match');
        edgesToExecute = noMatchEdges.length > 0 ? noMatchEdges : [];
      } else {

        edgesToExecute = connectedEdges;
      }
    }

    for (const edge of edgesToExecute) {
      const targetNode = allNodes.find((node: any) => node.id === edge.target);

      if (!targetNode) {

        continue;
      }

      this.executionManager.updateExecution(executionId, targetNode.id, 'running');


      const nodeResult = await this.executeNodeWithExecution(
        executionId,
        targetNode,
        message,
        conversation,
        contact,
        channelConnection,
        currentPathId
      );

      if (!nodeResult.success) {
        console.error(`Node execution failed: ${nodeResult.error}`);
        this.executionManager.failExecution(executionId, nodeResult.error || 'Node execution failed');
        return;
      }


      const targetNodeType = targetNode.type || '';
      const targetNodeLabel = (targetNode.data && targetNode.data.label) || '';
      const isTargetWebhookNode = targetNodeType === 'webhook' ||
                                 targetNodeType === 'webhookNode' ||
                                 targetNodeLabel === 'Webhook' ||
                                 targetNodeLabel === 'Webhook Node';

      if (nodeResult.waitForUserInput && !isTargetWebhookNode) {
        this.executionManager.setWaitingForInput(executionId, targetNode.id);
        return;
      }

      if (nodeResult.shouldContinue) {
        await this.executeConnectedNodesWithExecution(
          executionId,
          targetNode,
          allNodes,
          edges,
          message,
          conversation,
          contact,
          channelConnection,
          newVisitedNodes,
          maxDepth,
          currentPathId
        );
      }
    }

    if (edgesToExecute.length === 0) {
      this.executionManager.completeExecution(executionId, { endNode: currentNode.id });
    } else if (connectedEdges.length === 0) {
      this.executionManager.completeExecution(executionId, { endNode: currentNode.id });
    }
  }

  /**
   * Execute a single node with execution context
   */
  private async executeNodeWithExecution(
    executionId: string,
    node: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    pathId?: string
  ): Promise<NodeExecutionResult> {
    const execution = this.executionManager.getExecution(executionId);
    if (!execution) {
      return { success: false, shouldContinue: false, error: 'Execution not found' };
    }

    const nodeType = node.type || '';
    const nodeLabel = (node.data && node.data.label) || '';

    const nodeStartTime = Date.now();
    const inputData = {
      nodeType,
      nodeLabel,
      nodeData: node.data,
      messageContent: message.content,
      contactId: contact.id
    };

    try {
      if (
        nodeType === 'messageNode' ||
        nodeType === 'message' ||
        nodeLabel === 'Message Node' ||
        nodeLabel === 'Send Message'
      ) {
        await this.executeMessageNodeWithContext(node, execution.context, conversation, contact, channelConnection, 'text');

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'message',
          duration,
          'completed',
          inputData,
          { messageType: 'text' },
          undefined
        );


        const enableKeywordTriggers = node.data?.enableKeywordTriggers;
        if (enableKeywordTriggers) {
          return { success: true, shouldContinue: false, waitForUserInput: true };
        }

        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'imageNode' || nodeType === 'image' ||
        nodeLabel === 'Image Node' || nodeLabel === 'Send Image'
      ) {
        await this.executeMessageNodeWithContext(node, execution.context, conversation, contact, channelConnection, 'image');

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'image',
          duration,
          'completed',
          inputData,
          { messageType: 'image' },
          undefined
        );


        const enableKeywordTriggers = node.data?.enableKeywordTriggers;
        if (enableKeywordTriggers) {
          return { success: true, shouldContinue: false, waitForUserInput: true };
        }

        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'videoNode' || nodeType === 'video' ||
        nodeLabel === 'Video Node' || nodeLabel === 'Send Video'
      ) {
        await this.executeMessageNodeWithContext(node, execution.context, conversation, contact, channelConnection, 'video');

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'video',
          duration,
          'completed',
          inputData,
          { messageType: 'video' },
          undefined
        );


        const enableKeywordTriggers = node.data?.enableKeywordTriggers;
        if (enableKeywordTriggers) {
          return { success: true, shouldContinue: false, waitForUserInput: true };
        }

        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'documentNode' || nodeType === 'document' ||
        nodeLabel === 'Document Node' || nodeLabel === 'Send Document'
      ) {
        await this.executeMessageNodeWithContext(node, execution.context, conversation, contact, channelConnection, 'document');

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'document',
          duration,
          'completed',
          inputData,
          { messageType: 'document' },
          undefined
        );


        const enableKeywordTriggers = node.data?.enableKeywordTriggers;
        if (enableKeywordTriggers) {
          return { success: true, shouldContinue: false, waitForUserInput: true };
        }

        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'audioNode' || nodeType === 'audio' ||
        nodeLabel === 'Audio Node' || nodeLabel === 'Send Audio'
      ) {
        await this.executeMessageNodeWithContext(node, execution.context, conversation, contact, channelConnection, 'audio');

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'audio',
          duration,
          'completed',
          inputData,
          { messageType: 'audio' },
          undefined
        );


        const enableKeywordTriggers = node.data?.enableKeywordTriggers;
        if (enableKeywordTriggers) {
          return { success: true, shouldContinue: false, waitForUserInput: true };
        }

        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'quickreplyNode' ||
        nodeType === 'quickreply' ||
        nodeLabel === 'Quickreply Node'
      ) {
        await this.executeQuickReplyNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false, waitForUserInput: true };
      }
      else if (
        nodeType === 'whatsapp_poll' ||
        nodeLabel === 'WhatsApp Poll' ||
        nodeLabel === 'WhatsApp Poll Node'
      ) {
        await this.executeWhatsAppPollNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false, waitForUserInput: true };
      }

      else if (
        nodeType === 'whatsapp_interactive_buttons' ||
        nodeType === 'whatsappInteractiveButtons' ||
        nodeLabel === 'WhatsApp Interactive Buttons'
      ) {
        await this.executeWhatsAppInteractiveButtonsNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false, waitForUserInput: true };
      }

      else if (
        nodeType === 'whatsapp_interactive_list' ||
        nodeType === 'whatsappInteractiveList' ||
        nodeLabel === 'WhatsApp Interactive List'
      ) {
        await this.executeWhatsAppInteractiveListNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false, waitForUserInput: true };
      }

      else if (
        nodeType === 'whatsapp_cta_url' ||
        nodeType === 'whatsappCTAURL' ||
        nodeLabel === 'WhatsApp CTA URL'
      ) {
        await this.executeWhatsAppCTAURLNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true, waitForUserInput: false };
      }

      else if (
        nodeType === 'whatsapp_location_request' ||
        nodeType === 'whatsappLocationRequest' ||
        nodeLabel === 'WhatsApp Location Request'
      ) {
        await this.executeWhatsAppLocationRequestNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true, waitForUserInput: true };
      }

      else if (
        nodeType === 'followUpNode' ||
        nodeType === 'follow_up' ||
        nodeType === 'followup' ||
        nodeLabel === 'Follow Up Node' ||
        nodeLabel === 'Follow-up Node'
      ) {
        await this.executeFollowUpNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'conditionNode' ||
        nodeType === 'condition' ||
        nodeLabel === 'Condition Node'
      ) {
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'waitNode' ||
        nodeType === 'wait' ||
        nodeLabel === 'Wait Node'
      ) {
        await this.executeWaitNodeWithContext(node, execution.context);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'aiAssistantNode' ||
        nodeType === 'aiAssistant' ||
        nodeType === 'ai_assistant' ||
        nodeLabel === 'AI Assistant' ||
        nodeLabel === 'AI Response' ||
        nodeLabel === 'Ai_assistant Node'
      ) {
        await this.executeAIAssistantNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'translationNode' ||
        nodeType === 'translation' ||
        nodeLabel === 'Translation' ||
        nodeLabel === 'Translation Node'
      ) {
        await this.executeTranslationNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'updatePipelineStageNode' ||
        nodeType === 'update_pipeline_stage' ||
        nodeLabel === 'Pipeline' ||
        nodeLabel === 'Move to Pipeline Stage'
      ) {
        await this.executeUpdatePipelineStageNode(node, execution.context.getVariable('message'), execution.context.getVariable('conversation'), contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'webhook' || nodeType === 'webhookNode' ||
        nodeLabel === 'Webhook' || nodeLabel === 'Webhook Node'
      ) {

        if (!this.hasWebhookBeenExecuted(node.id, execution.context, pathId)) {
          await this.executeWebhookNodeWithContext(node, execution.context, conversation, contact, channelConnection, pathId);
        }
        return { success: true, shouldContinue: true, waitForUserInput: false };
      }

      else if (
        nodeType === 'contact_notification' || nodeType === 'contactNotificationNode' ||
        nodeLabel === 'Contact Notification' || nodeLabel === 'Contact Notification Node'
      ) {
        if (!execution.context.isContactNotificationExecuted(node.id, pathId)) {
          await this.executeContactNotificationNodeWithContext(node, execution.context, conversation, contact, channelConnection, pathId);
        }
        return { success: true, shouldContinue: true, waitForUserInput: false };
      }

      else if (
        nodeType === 'http_request' || nodeType === 'httpRequestNode' ||
        nodeLabel === 'HTTP Request' || nodeLabel === 'HTTP Request Node'
      ) {
        if (!this.hasHttpBeenExecuted(node.id, execution.context, pathId)) {
          await this.executeHttpRequestNodeWithContext(node, execution.context, conversation, contact, channelConnection, pathId);
        }
        return { success: true, shouldContinue: true, waitForUserInput: false };
      }

      else if (
        nodeType === 'code_execution' || nodeType === 'codeExecutionNode' ||
        nodeLabel === 'Code Execution' || nodeLabel === 'Code Execution Node'
      ) {
        await this.executeCodeExecutionNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'input' || nodeType === 'inputNode' ||
        nodeLabel === 'Input' || nodeLabel === 'Input Node'
      ) {
        await this.executeInputNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false, waitForUserInput: true };
      }

      else if (
        nodeType === 'action' || nodeType === 'actionNode' ||
        nodeLabel === 'Action' || nodeLabel === 'Action Node'
      ) {
        await this.executeActionNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'shopify' || nodeType === 'shopifyNode' ||
        nodeLabel === 'Shopify' || nodeLabel === 'Shopify Node'
      ) {
        await this.executeShopifyNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'woocommerce' || nodeType === 'woocommerceNode' ||
        nodeLabel === 'WooCommerce' || nodeLabel === 'WooCommerce Node'
      ) {
        await this.executeWooCommerceNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'whatsapp_flows' || nodeType === 'whatsappFlowsNode' ||
        nodeLabel === 'WhatsApp Flows' || nodeLabel === 'WhatsApp Flows Node'
      ) {
        await this.executeWhatsAppFlowsNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'typebot' || nodeType === 'typebotNode' ||
        nodeLabel === 'Typebot' || nodeLabel === 'Typebot Node'
      ) {
        await this.executeTypebotNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'flowise' || nodeType === 'flowiseNode' ||
        nodeLabel === 'Flowise' || nodeLabel === 'Flowise Node'
      ) {
        await this.executeFlowiseNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'n8n' || nodeType === 'n8nNode' ||
        nodeLabel === 'n8n' || nodeLabel === 'n8n Node'
      ) {
        await this.executeN8nNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'make' || nodeType === 'makeNode' ||
        nodeLabel === 'make' || nodeLabel === 'Make.com' || nodeLabel === 'Make Node'
      ) {
        await this.executeMakeNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'bot_disable' || nodeType === 'botDisableNode' ||
        nodeLabel === 'Agent Handoff' || nodeLabel === 'Bot Disable' || nodeLabel === 'Disable Bot'
      ) {
        await this.executeBotDisableNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: false };
      }

      else if (
        nodeType === 'bot_reset' || nodeType === 'botResetNode' ||
        nodeLabel === 'Reset Bot' || nodeLabel === 'Bot Reset' || nodeLabel === 'Re-enable Bot'
      ) {
        await this.executeBotResetNodeWithContext(node, execution.context, conversation, contact, channelConnection);
        return { success: true, shouldContinue: true };
      }

      else if (
        nodeType === 'googleSheets' || nodeType === 'google_sheets' || nodeType === 'googleSheetsNode' ||
        nodeLabel === 'Google Sheets' || nodeLabel === 'Google Sheets Node'
      ) {
        await this.executeGoogleSheetsNodeWithContext(node, execution.context, conversation, contact, channelConnection);

        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          'google_sheets',
          duration,
          'completed',
          inputData,
          { operation: node.data?.operation || 'append_row' },
          undefined
        );

        return { success: true, shouldContinue: false };
      }

      else {


        const duration = Date.now() - nodeStartTime;
        this.executionManager.trackNodeExecution(
          executionId,
          node.id,
          nodeType || 'unknown',
          duration,
          'completed',
          inputData,
          { nodeType, nodeLabel },
          undefined
        );

        return { success: true, shouldContinue: true };
      }

    } catch (error) {
      console.error(`Error executing node ${node.id}:`, error);

      const duration = Date.now() - nodeStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.executionManager.trackNodeExecution(
        executionId,
        node.id,
        nodeType || 'unknown',
        duration,
        'failed',
        inputData,
        undefined,
        errorMessage
      );

      return {
        success: false,
        shouldContinue: false,
        error: errorMessage
      };
    }
  }

  /**
   * Safe WebSocket broadcasting with error handling and retry logic
   */
  private async safeBroadcast(eventType: string, data: any, companyId: string, retries: number = 2): Promise<void> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if ((global as any).broadcastToCompany) {
          (global as any).broadcastToCompany({
            type: eventType,
            data: data,
            timestamp: new Date().toISOString()
          }, companyId);
          return; // Success, exit retry loop
        } else {
          console.warn('WebSocket broadcast function not available');
          return;
        }
      } catch (error) {
        console.error(`WebSocket broadcast attempt ${attempt + 1} failed:`, error);

        if (attempt === retries) {
          console.error(`Failed to broadcast ${eventType} after ${retries + 1} attempts`);

          this.storeFailedBroadcast(eventType, data, companyId);
        } else {

          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }
  }

  /**
   * Store failed broadcasts for potential retry
   */
  private storeFailedBroadcast(eventType: string, data: any, companyId: string): void {


  }

  /**
   * Reset AI session state to prevent inconsistencies
   */
  private async resetAISessionState(session: FlowSessionState): Promise<void> {
    try {

      session.aiSessionActive = false;
      session.aiNodeId = null;
      session.aiStopKeyword = null;
      session.aiExitOutputHandle = null;


      await this.updateSession(session.sessionId, {
        aiSessionActive: false,
        aiNodeId: null,
        aiStopKeyword: null,
        aiExitOutputHandle: null
      });


    } catch (error) {
      console.error(`Failed to reset AI session state for ${session.sessionId}:`, error);
    }
  }

  /**
   * Validate if contact is an individual (not a group chat)
   * Uses existing WhatsApp group chat detection logic
   */
  private isValidIndividualContact(contact: Contact): boolean {
    if (!contact.phone) {
      return false;
    }


    if (isWhatsAppGroupChatId(contact.phone)) {
      return false;
    }


    const phoneDigits = contact.phone.replace(/\D/g, '');
    if (phoneDigits.length > 14) {
      return false;
    }

    return true;
  }



  /**
   * Execute message node with execution context
   */
  private async executeMessageNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    messageType: string = 'text'
  ): Promise<void> {
    try {

      const data = node.data || {};

      let content = '';
      let mediaUrl = '';

      if (messageType === 'text') {
        content = data.messageContent || data.message || data.text || '';
        content = context.replaceVariables(content);
      } else {
        mediaUrl = data.mediaUrl || data.url || '';
        content = data.caption || '';
        content = context.replaceVariables(content);


        if (mediaUrl && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {


          const basePort = parseInt(process.env.PORT || "9000", 10);
          const port = process.env.NODE_ENV === 'development' ? basePort + 100 : basePort;
          const baseUrl = process.env.NODE_ENV === 'production'
            ? (process.env.BASE_URL || `http://localhost:${port}`)
            : `http://localhost:${port}`;

          if (mediaUrl.startsWith('/')) {
            mediaUrl = `${baseUrl}${mediaUrl}`;
          } else {
            mediaUrl = `${baseUrl}/${mediaUrl}`;
          }
        }


        


        if (!mediaUrl || (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://'))) {
          throw new Error(`Invalid media URL for ${messageType} node: "${mediaUrl}". Media URL must be a valid HTTP/HTTPS URL.`);
        }
      }


      try {
        if (messageType === 'text') {
     

          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            content,
            conversation,
            true
          );


        } else {
          

          await this.sendMediaThroughChannel(
            channelConnection,
            contact,
            mediaUrl,
            messageType as "image" | "video" | "audio" | "document",
            content,
            undefined,
            conversation,
            true
          );


        }
      } catch (channelError) {
        const error = channelError as Error;
        console.error(`❌ Error sending ${messageType} through ${channelConnection.channelType}:`, {
          nodeId: node.id,
          error: error.message,
          stack: error.stack,
          mediaUrl: messageType !== 'text' ? mediaUrl : undefined
        });


        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          senderId: channelConnection.userId,
          channelType: channelConnection.channelType,
          type: messageType,
          content: content,
          direction: 'outbound',
          status: 'failed', // Mark as failed instead of sent
          mediaUrl: messageType === 'text' ? null : mediaUrl,
          timestamp: new Date(),
          metadata: {
            error: channelError instanceof Error ? channelError.message : String(channelError),
            failureReason: 'channel_send_error',
            nodeId: node.id,
            retryable: true
          }
        };

        const failedMessage = await storage.createMessage(insertMessage);


        if ((global as any).broadcastToCompany) {
          (global as any).broadcastToCompany({
            type: 'messageFailed',
            data: {
              message: failedMessage,
              error: channelError instanceof Error ? channelError.message : String(channelError),
              conversationId: conversation.id
            }
          }, channelConnection.companyId);
        }


        throw new Error(`Failed to send message through ${channelConnection.channelType}: ${channelError instanceof Error ? channelError.message : String(channelError)}`);
      }
    } catch (error) {
      console.error(`Error executing ${messageType} message node with context:`, error);
    }
  }
  /**
   * Execute WhatsApp Poll node with execution context
   * Mirrors Quick Reply behavior but sends a poll via Baileys on unofficial WA; falls back to text list
   */
  private async executeWhatsAppPollNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const questionTextRaw = data.question || data.message || data.text || 'Please vote:';
      const questionText = context.replaceVariables(questionTextRaw);
      const options = (data.options || []).map((opt: any) => ({
        text: opt.text || opt.label || '',
        value: opt.value || ''
      })).filter((o: any) => o.text && o.value);


      const enableGoBack = data.enableGoBack !== false;
      const goBackText = data.goBackText || '← Go Back';
      const goBackValue = data.goBackValue || 'go_back';


      let formattedMessage = `${questionText}\n\n`;
      options.forEach((option: any, index: number) => {
        const optionText = option.text || `Option ${index + 1}`;
        formattedMessage += `${index + 1}. ${optionText}\n`;
      });


      if (enableGoBack) {
        formattedMessage += `\n${goBackText}`;
      }

      context.setVariable('quickReply.questionText', questionText);
      context.setVariable('quickReply.formattedMessage', formattedMessage);
      context.setVariable('quickReplyOptions', options);
      context.setVariable('waitingForQuickReply', true);



      const pollOptions = [...options];
      if (enableGoBack) {
        pollOptions.push({
          text: goBackText,
          value: goBackValue
        });
      }


      context.setVariable('poll.questionText', questionText);
      context.setVariable('poll.options', pollOptions); // Include Go Back option
      context.setVariable('poll.enableGoBack', enableGoBack);
      context.setVariable('poll.goBackText', goBackText);
      context.setVariable('poll.goBackValue', goBackValue);


      if (channelConnection.channelType === 'whatsapp_unofficial') {
        try {
          const pollName = questionText || 'Poll';
          const pollValues = pollOptions.map((o: any) => o.text); // Use extended options including Go Back
          const selectableCount = 1;

          const whatsAppSvc: any = whatsAppService as any;

          if (typeof whatsAppSvc.sendPoll === 'function') {
                        await whatsAppSvc.sendPoll(
              channelConnection.id,
              channelConnection.userId,
              contact.identifier || contact.phone,
              { name: pollName, values: pollValues, selectableCount }
            );

          } else {

            await this.sendMessageThroughChannel(channelConnection, contact, formattedMessage, conversation, true);
          }
        } catch (e) {
          await this.sendMessageThroughChannel(channelConnection, contact, formattedMessage, conversation, true);
        }
      } else {

        await this.sendMessageThroughChannel(channelConnection, contact, formattedMessage, conversation, true);
      }
    } catch (error) {
      console.error('Error executing WhatsApp Poll node:', error);
    }
  }


  /**
   * Execute quick reply node with execution context
   */
  private async executeQuickReplyNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};

      let questionText = data.question || data.messageContent || data.text || data.message || data.prompt || '';
      questionText = context.replaceVariables(questionText);

      const options = data.options || [];

      let formattedMessage = `${questionText}\n\n`;

      options.forEach((option: any, index: number) => {
        const optionText = option.text || option.label || `Option ${index + 1}`;
        formattedMessage += `${index + 1}. ${optionText}\n`;
      });


      const enableGoBack = data.enableGoBack !== false;
      const goBackText = data.goBackText || '← Go Back';
      
      if (enableGoBack) {
        formattedMessage += `\n${goBackText}`;
      }

      context.setVariable('quickReply.questionText', questionText);
      context.setVariable('quickReply.formattedMessage', formattedMessage);
      context.setVariable('quickReplyOptions', options);
      context.setVariable('waitingForQuickReply', true);

      try {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          formattedMessage,
          conversation,
          true
        );
      } catch (channelError) {
        console.error('Error sending condition message through channel:', channelError);


        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          senderId: channelConnection.userId,
          channelType: channelConnection.channelType,
          type: 'text',
          content: formattedMessage,
          direction: 'outbound',
          status: 'failed',
          mediaUrl: null,
          timestamp: new Date(),
          metadata: {
            error: channelError instanceof Error ? channelError.message : String(channelError),
            failureReason: 'channel_send_error',
            nodeType: 'condition',
            retryable: true
          }
        };

        const failedMessage = await storage.createMessage(insertMessage);


        if (channelConnection.companyId) {
          await this.safeBroadcast('messageFailed', {
            message: failedMessage,
            error: channelError instanceof Error ? channelError.message : String(channelError),
            conversationId: conversation.id
          }, channelConnection.companyId.toString());
        }


        console.warn('Condition message failed to send but flow will continue');
      }

    } catch (error) {
      console.error('Error executing quick reply node with context:', error);
    }
  }

  /**
   * Execute WhatsApp Interactive Buttons node with execution context
   */
  private async executeWhatsAppInteractiveButtonsNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      

      const data = node.data || {};

      if (channelConnection.channelType !== 'whatsapp_official') {
        console.warn('WhatsApp Interactive Buttons node can only be used with Official WhatsApp API connections');

        const fallbackMessage = context.replaceVariables(data.bodyText || 'Please select an option:');
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }


      const headerText = data.headerText ? context.replaceVariables(data.headerText) : undefined;
      const bodyText = context.replaceVariables(data.bodyText || 'Please select an option:');
      const footerText = data.footerText ? context.replaceVariables(data.footerText) : undefined;
      const buttons = data.buttons || [];


      const validButtons = buttons
        .filter((btn: any) => btn.title && btn.payload)
        .slice(0, 3) // WhatsApp API limit
        .map((btn: any, index: number) => ({
          type: 'reply',
          reply: {
            id: btn.payload,
            title: btn.title.substring(0, 20) // WhatsApp API limit
          }
        }));

      if (validButtons.length === 0) {
        console.warn('No valid buttons found for WhatsApp Interactive Buttons node');
        await this.sendMessageThroughChannel(channelConnection, contact, bodyText, conversation, true);
        return;
      }


      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(headerText && {
            header: {
              type: 'text',
              text: headerText
            }
          }),
          body: {
            text: bodyText
          },
          ...(footerText && {
            footer: {
              text: footerText
            }
          }),
          action: {
            buttons: validButtons
          }
        }
      };


      context.setVariable('whatsappInteractive.headerText', headerText);
      context.setVariable('whatsappInteractive.bodyText', bodyText);
      context.setVariable('whatsappInteractive.footerText', footerText);
      context.setVariable('whatsappInteractive.buttons', validButtons);
      context.setVariable('waitingForInteractiveResponse', true);

      try {
        

        await this.sendWhatsAppInteractiveMessage(channelConnection, interactiveMessage, conversation);


      } catch (channelError) {
        console.error('Error sending WhatsApp interactive message, falling back to text:', channelError);


        let fallbackMessage = bodyText + '\n\n';
        validButtons.forEach((btn: any, index: number) => {
          fallbackMessage += `${index + 1}. ${btn.reply.title}\n`;
        });

        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
      }

    } catch (error) {
      console.error('Error executing WhatsApp Interactive Buttons node:', error);
    }
  }

  /**
   * Execute WhatsApp Interactive List node with execution context
   */
  private async executeWhatsAppInteractiveListNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      

      const data = node.data || {};

      if (channelConnection.channelType !== 'whatsapp_official') {
        console.warn('WhatsApp Interactive List node can only be used with Official WhatsApp API connections');

        const fallbackMessage = context.replaceVariables(data.bodyText || 'Please select an option:');
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }

      const headerText = data.headerText ? context.replaceVariables(data.headerText) : undefined;
      const bodyText = context.replaceVariables(data.bodyText || 'Please select an option:');
      const footerText = data.footerText ? context.replaceVariables(data.footerText) : undefined;
      const buttonText = context.replaceVariables(data.buttonText || 'View Options');
      const sections = data.sections || [];


      const validSections = sections
        .filter((section: any) => section.title && section.rows && section.rows.length > 0)
        .slice(0, 10) // WhatsApp API limit
        .map((section: any) => ({
          title: section.title.substring(0, 24), // WhatsApp API limit
          rows: section.rows
            .filter((row: any) => row.title && row.payload)
            .slice(0, 10) // WhatsApp API limit per section
            .map((row: any) => ({
              id: row.payload,
              title: row.title.substring(0, 24), // WhatsApp API limit
              ...(row.description && { description: row.description.substring(0, 72) }) // WhatsApp API limit
            }))
        }))
        .filter((section: any) => section.rows.length > 0);


      const totalRows = validSections.reduce((total: number, section: any) => total + section.rows.length, 0);
      if (totalRows > 10) {

        let remainingRows = 10;
        const trimmedSections = [];
        for (const section of validSections) {
          if (remainingRows <= 0) break;
          const rowsToTake = Math.min(section.rows.length, remainingRows);
          trimmedSections.push({
            ...section,
            rows: section.rows.slice(0, rowsToTake)
          });
          remainingRows -= rowsToTake;
        }
        validSections.splice(0, validSections.length, ...trimmedSections);
      }

      if (validSections.length === 0) {
        console.warn('No valid sections found for WhatsApp Interactive List node');
        await this.sendMessageThroughChannel(channelConnection, contact, bodyText, conversation, true);
        return;
      }

      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(headerText && {
            header: {
              type: 'text',
              text: headerText
            }
          }),
          body: {
            text: bodyText
          },
          ...(footerText && {
            footer: {
              text: footerText
            }
          }),
          action: {
            button: buttonText,
            sections: validSections
          }
        }
      };


      context.setVariable('whatsappInteractive.headerText', headerText);
      context.setVariable('whatsappInteractive.bodyText', bodyText);
      context.setVariable('whatsappInteractive.footerText', footerText);
      context.setVariable('whatsappInteractive.buttonText', buttonText);
      context.setVariable('whatsappInteractive.sections', validSections);
      context.setVariable('waitingForInteractiveResponse', true);

      try {
   

        await this.sendWhatsAppInteractiveMessage(channelConnection, interactiveMessage, conversation);


      } catch (channelError) {
        console.error('Error sending WhatsApp interactive list message, falling back to text:', channelError);


        let fallbackMessage = bodyText + '\n\n';
        let optionNumber = 1;
        validSections.forEach((section: any) => {
          fallbackMessage += `${section.title}:\n`;
          section.rows.forEach((row: any) => {
            fallbackMessage += `${optionNumber}. ${row.title}`;
            if (row.description) {
              fallbackMessage += ` - ${row.description}`;
            }
            fallbackMessage += '\n';
            optionNumber++;
          });
          fallbackMessage += '\n';
        });

        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
      }

    } catch (error) {
      console.error('Error executing WhatsApp Interactive List node:', error);
    }
  }

  /**
   * Execute WhatsApp CTA URL node with execution context
   */
  private async executeWhatsAppCTAURLNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      

      const data = node.data || {};

      if (channelConnection.channelType !== 'whatsapp_official') {
        console.warn('WhatsApp CTA URL node can only be used with Official WhatsApp API connections');

        const fallbackMessage = context.replaceVariables(data.bodyText || 'Click the link: ' + (data.url || 'https://example.com'));
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }

      const headerText = data.headerText ? context.replaceVariables(data.headerText) : undefined;
      const bodyText = context.replaceVariables(data.bodyText || 'Click the button below to visit our website.');
      const footerText = data.footerText ? context.replaceVariables(data.footerText) : undefined;
      const displayText = context.replaceVariables(data.displayText || 'Visit Website');
      const url = context.replaceVariables(data.url || 'https://example.com');


      try {
        new URL(url);
      } catch (urlError) {
        console.error('Invalid URL provided for WhatsApp CTA URL node:', url);
        const fallbackMessage = bodyText + '\n\n' + url;
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }


      if (new Blob([displayText]).size > 20) {
        console.warn('Display text exceeds 20 bytes limit, truncating:', displayText);
      }

      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(headerText && {
            header: {
              type: 'text',
              text: headerText
            }
          }),
          body: {
            text: bodyText
          },
          ...(footerText && {
            footer: {
              text: footerText
            }
          }),
          action: {
            name: 'cta_url',
            parameters: {
              display_text: displayText.substring(0, 20), // Ensure 20 byte limit
              url: url
            }
          }
        }
      };


      context.setVariable('whatsappCTAURL.headerText', headerText);
      context.setVariable('whatsappCTAURL.bodyText', bodyText);
      context.setVariable('whatsappCTAURL.footerText', footerText);
      context.setVariable('whatsappCTAURL.displayText', displayText);
      context.setVariable('whatsappCTAURL.url', url);

      try {
        

        await this.sendWhatsAppInteractiveMessage(channelConnection, interactiveMessage, conversation);


      } catch (channelError) {
        console.error('Error sending WhatsApp CTA URL message, falling back to text:', channelError);


        let fallbackMessage = bodyText + '\n\n';
        fallbackMessage += `${displayText}: ${url}`;

        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
      }

    } catch (error) {
      console.error('Error executing WhatsApp CTA URL node:', error);
    }
  }

  /**
   * Execute WhatsApp Location Request node with execution context
   */
  private async executeWhatsAppLocationRequestNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      

      const data = node.data || {};

      if (channelConnection.channelType !== 'whatsapp_official') {
        console.warn('WhatsApp Location Request node can only be used with Official WhatsApp API connections');

        const fallbackMessage = context.replaceVariables(data.bodyText || 'Please share your location so we can assist you better.');
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }

      const bodyText = context.replaceVariables(data.bodyText || 'Please share your location so we can assist you better.');


      if (bodyText.length > 1024) {
        console.warn('Body text exceeds 1024 characters limit, truncating:', bodyText.length);
      }

      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: {
            text: bodyText.substring(0, 1024) // Ensure 1024 character limit
          },
          action: {
            name: 'send_location'
          }
        }
      };


      context.setVariable('whatsappLocationRequest.bodyText', bodyText);

      try {
    

        await this.sendWhatsAppInteractiveMessage(channelConnection, interactiveMessage, conversation);


      } catch (channelError) {
        console.error('Error sending WhatsApp Location Request message, falling back to text:', channelError);


        const fallbackMessage = bodyText + '\n\n' + 'Please share your location.';

        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
      }

    } catch (error) {
      console.error('Error executing WhatsApp Location Request node:', error);
    }
  }

  /**
   * Execute condition node with execution context
   */
  private async executeConditionNodeWithContext(
    node: any,
    context: FlowExecutionContext
  ): Promise<boolean> {
    try {

      const data = node.data || {};

      const conditionType = data.conditionType || 'contains';
      const conditionValue = data.conditionValue || '';

      const userInput = context.getVariable('user.input') || context.getVariable('message.content') || '';


      switch (conditionType.toLowerCase()) {
        case 'contains':
        case 'message contains':
          const lowerUserInput = userInput.toLowerCase();

          if (conditionValue.includes(',')) {
            const keywords = conditionValue.split(',').map((word: string) => word.trim().toLowerCase()).filter((word: string) => word.length > 0);
            return keywords.some((keyword: string) => lowerUserInput.includes(keyword));
          } else {
            return lowerUserInput.includes(conditionValue.toLowerCase());
          }

        case 'exact match':
          return userInput.toLowerCase() === conditionValue.toLowerCase();

        case 'starts with':
          return userInput.toLowerCase().startsWith(conditionValue.toLowerCase());

        case 'ends with':
          return userInput.toLowerCase().endsWith(conditionValue.toLowerCase());

        case 'has media':
          return !!context.getVariable('message.mediaUrl');

        default:
          const defaultLowerInput = userInput.toLowerCase();

          if (conditionValue.includes(',')) {
            const keywords = conditionValue.split(',').map((word: string) => word.trim().toLowerCase()).filter((word: string) => word.length > 0);
            return keywords.some((keyword: string) => defaultLowerInput.includes(keyword));
          } else {
            return defaultLowerInput.includes(conditionValue.toLowerCase());
          }
      }

    } catch (error) {
      console.error('Error executing condition node with context:', error);
      return false;
    }
  }

  /**
   * Execute wait node with execution context
   */
  private async executeWaitNodeWithContext(
    node: any,
    context: FlowExecutionContext
  ): Promise<void> {
    try {

      const data = node.data || {};

      const waitMode = data.waitMode || 'duration';

      if (waitMode === 'duration') {
        const timeValue = data.timeValue || data.duration || 5;
        const timeUnit = data.timeUnit || data.durationUnit || 'seconds';

        let waitMs = timeValue;
        switch (timeUnit.toLowerCase()) {
          case 'milliseconds':
          case 'ms':
            waitMs = timeValue;
            break;
          case 'seconds':
          case 'sec':
          case 's':
            waitMs = timeValue * 1000;
            break;
          case 'minutes':
          case 'min':
          case 'm':
            waitMs = timeValue * 60 * 1000;
            break;
          case 'hours':
          case 'hour':
          case 'h':
            waitMs = timeValue * 60 * 60 * 1000;
            break;
          default:
            waitMs = timeValue * 1000;
        }


        context.setVariable('wait.lastDuration', timeValue);
        context.setVariable('wait.lastUnit', timeUnit);
        context.setVariable('wait.lastMs', waitMs);
        context.setVariable('wait.startTime', new Date().toISOString());

        await new Promise(resolve => setTimeout(resolve, waitMs));

        context.setVariable('wait.endTime', new Date().toISOString());

      } else if (waitMode === 'datetime') {
        const waitDate = data.waitDate ? new Date(data.waitDate) : null;
        const waitTime = data.waitTime || '';

        if (waitDate) {
          if (waitTime) {
            const [hours, minutes] = waitTime.split(':').map(Number);
            waitDate.setHours(hours, minutes, 0, 0);
          }

          const now = new Date();
          const waitMs = waitDate.getTime() - now.getTime();

          if (waitMs > 0) {

            context.setVariable('wait.targetDate', waitDate.toISOString());
            context.setVariable('wait.waitMs', waitMs);
            context.setVariable('wait.startTime', now.toISOString());

            await new Promise(resolve => setTimeout(resolve, waitMs));

            context.setVariable('wait.endTime', new Date().toISOString());
          } else {
            context.setVariable('wait.skipped', true);
            context.setVariable('wait.reason', 'Target time in past');
          }
        } else {

          context.setVariable('wait.error', 'Invalid wait date');
        }
      }

    } catch (error) {
      console.error('Error executing wait node with context:', error);
      context.setVariable('wait.error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Execute Follow-up node with execution context
   */
  private async executeFollowUpNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};

      const scheduleId = `followup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const messageType = data.messageType || 'text';
      const messageContent = data.messageContent || data.message || '';
      const mediaUrl = data.mediaUrl || '';
      const caption = data.caption || '';
      const templateId = data.templateId || null;

      const triggerEvent = data.triggerEvent || 'conversation_start';
      const triggerNodeId = data.triggerNodeId || null;
      const delayAmount = data.delayAmount || 1;
      const delayUnit = data.delayUnit || 'hours';
      const specificDatetime = data.specificDatetime ? new Date(data.specificDatetime) : null;
      const timezone = data.timezone || 'UTC';

      let scheduledFor: Date;

      const { calculateFollowUpTime } = await import('../utils/timezone');

      scheduledFor = calculateFollowUpTime(
        triggerEvent,
        specificDatetime?.toISOString(),
        timezone,
        delayAmount,
        delayUnit
      );

      const expiresAt = new Date(scheduledFor.getTime() + (30 * 24 * 60 * 60 * 1000));

      const variables = {
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email
        },
        conversation: {
          id: conversation.id,
          status: conversation.status
        },
        flow: {
          id: context.getVariable('flow.id'),
          nodeId: node.id
        },
        trigger: {
          event: triggerEvent,
          nodeId: triggerNodeId,
          scheduledAt: scheduledFor.toISOString()
        }
      };

      const executionContext = {
        sessionId: context.getVariable('session.id'),
        executionPath: context.getVariable('execution.path') || [],
        currentVariables: context.getAllVariables()
      };

      const followUpSchedule = {
        scheduleId,
        sessionId: context.getVariable('session.id'),
        flowId: context.getVariable('flow.id'),
        conversationId: conversation.id,
        contactId: contact.id,
        companyId: conversation.companyId || 0,
        nodeId: node.id,
        messageType,
        messageContent: context.replaceVariables(messageContent),
        mediaUrl: context.replaceVariables(mediaUrl),
        caption: context.replaceVariables(caption),
        templateId,
        triggerEvent,
        triggerNodeId,
        delayAmount,
        delayUnit,
        scheduledFor,
        specificDatetime,
        timezone,
        status: 'scheduled' as const,
        maxRetries: data.maxRetries || 3,
        channelType: channelConnection.channelType,
        channelConnectionId: channelConnection.id,
        variables,
        executionContext,
        expiresAt
      };

      await storage.createFollowUpSchedule(followUpSchedule);

      context.setVariable('followUp.scheduleId', scheduleId);
      context.setVariable('followUp.scheduledFor', scheduledFor.toISOString());
      context.setVariable('followUp.triggerEvent', triggerEvent);
      context.setVariable('followUp.delayAmount', delayAmount);
      context.setVariable('followUp.delayUnit', delayUnit);
      context.setVariable('followUp.messageType', messageType);



    } catch (error) {
      console.error('Error executing Follow-up node with context:', error);
      context.setVariable('followUp.error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Execute AI Assistant node with execution context
   */
  private async executeAIAssistantNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const userMessage = context.getVariable('message.content') || '';

      const tempMessage: Message = {
        id: 0,
        content: userMessage,
        type: 'text',
        direction: 'inbound',
        status: 'delivered',
        createdAt: new Date(),
        conversationId: conversation.id,
        mediaUrl: null,
        externalId: null,
        senderId: null,
        senderType: null,
        isFromBot: false,
        metadata: {},
        sentAt: null,
        readAt: null,
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };

      const data = node.data || {};
      if (data.enableTaskExecution && data.tasks && data.tasks.length > 0) {
        try {
          const aiAssistantServiceModule = await import('../services/ai-assistant');
          const aiAssistantService = aiAssistantServiceModule.default;

          const provider = data.provider || 'openai';
          let model = data.model || 'gpt-4o-mini';
          const apiKey = data.apiKey || '';


          const { injectDateTimeContext } = await import('../utils/timezone-utils');
          const timezone = data.timezone || 'UTC';
          const baseSystemPrompt = data.prompt || 'You are a helpful assistant.';
          const systemPrompt = injectDateTimeContext(baseSystemPrompt, timezone);

          const enableHistory = data.enableHistory !== undefined ? data.enableHistory : true;
          const historyLimit = data.historyLimit || 5;
          const enableAudio = data.enableAudio || false;

          let conversationHistory: Message[] = [];
          if (enableHistory) {
            conversationHistory = await storage.getMessagesByConversation(conversation.id);
          }

          const language = data.language || 'en';
          const aiConfig = {
            provider,
            model,
            apiKey,
            systemPrompt,
            enableHistory,
            historyLimit,
            enableAudio,
            enableImage: data.enableImage || false,
            enableVideo: data.enableVideo || false,
            enableVoiceProcessing: data.enableVoiceProcessing || false,
            enableTextToSpeech: data.enableTextToSpeech || false,
            ttsVoice: data.ttsVoice || 'alloy',
            voiceResponseMode: data.voiceResponseMode || 'always',
            enableFunctionCalling: data.enableTaskExecution || false,
            enableTaskExecution: data.enableTaskExecution || false,
            tasks: data.tasks || [],

            enableMCPServers: data.enableMCPServers || false,
            mcpServers: data.mcpServers || [],

            nodeId: node.id,
            knowledgeBaseEnabled: data.knowledgeBaseEnabled || false,
            knowledgeBaseConfig: data.knowledgeBaseConfig || {},
            language
          };

          const aiResponse = await aiAssistantService.processMessage(
            tempMessage,
            conversation,
            contact,
            channelConnection,
            aiConfig,
            conversationHistory,
            conversation.companyId ?? undefined
          );

          if (aiResponse.text) {
            const responseText = this.replaceVariables(aiResponse.text, tempMessage, contact);

            if (aiResponse.audioUrl && (channelConnection.channelType === 'whatsapp' || channelConnection.channelType === 'whatsapp_unofficial' || channelConnection.channelType === 'whatsapp_official') && contact.identifier) {
              try {
                const audioPath = aiResponse.audioUrl.startsWith('/') ? aiResponse.audioUrl.slice(1) : aiResponse.audioUrl;
                const fullAudioPath = path.join(process.cwd(), audioPath);


                if (channelConnection.channelType === 'whatsapp_unofficial') {
                  await whatsAppService.sendWhatsAppAudioMessage(
                    channelConnection.id,
                    channelConnection.userId,
                    contact.identifier,
                    fullAudioPath
                  );
                } else {

                  await this.sendMessageThroughChannel(
                    channelConnection,
                    contact,
                    responseText,
                    conversation,
                    true
                  );
                }
              } catch (error) {
                try {

                  await this.sendMessageThroughChannel(
                    channelConnection,
                    contact,
                    responseText,
                    conversation,
                    true
                  );
                } catch (textError) {
                  console.error('Error sending fallback text message:', textError);
                }
              }
            } else {

              try {
                await this.sendMessageThroughChannel(
                  channelConnection,
                  contact,
                  responseText,
                  conversation,
                  true
                );
              } catch (error) {
                console.error('Error sending AI response through channel:', error);
              }
            }
          }

          if (aiResponse.triggeredTasks && aiResponse.triggeredTasks.length > 0) {
            context.setVariable('ai.triggeredTasks', aiResponse.triggeredTasks);

          } else {

          }


          if (aiResponse.mcpResults && aiResponse.mcpResults.length > 0) {
            for (const mcpResult of aiResponse.mcpResults) {
              if (mcpResult.success) {
                context.setVariable(`mcp.${mcpResult.tool}.result`, mcpResult.result);
                context.setVariable(`mcp.${mcpResult.tool}.server`, mcpResult.server);
              } else {
                context.setVariable(`mcp.${mcpResult.tool}.error`, mcpResult.error);
              }
            }
          }

        } catch (error) {
          console.error('Error getting AI response with task execution:', error);
          await this.executeAIAssistantNode(node, tempMessage, conversation, contact, channelConnection);
        }
      } else {
        await this.executeAIAssistantNode(node, tempMessage, conversation, contact, channelConnection);
      }

      context.setVariable('ai.lastExecution', new Date().toISOString());

    } catch (error) {
    }
  }

  /**
   * Execute Webhook node with execution context
   */
  private async executeWebhookNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection,
    pathId?: string
  ): Promise<void> {
    try {
      const nodeId = node.id;


      if (this.hasWebhookBeenExecuted(nodeId, context, pathId)) {

        const cachedResponse = context.getWebhookCachedResponse(nodeId, pathId);
        if (cachedResponse) {
          context.setWebhookResponse(cachedResponse);
          if (cachedResponse.data) {
            context.setVariable('webhook.lastResponse', cachedResponse.data);
            if (typeof cachedResponse.data === 'object') {
              Object.entries(cachedResponse.data).forEach(([key, value]) => {
                context.setVariable(`webhook.${key}`, value);
              });
            }
          }
        }
        return;
      }

      const data = node.data || {};

      const webhookUrl = context.replaceVariables(data.url || '');
      const method = data.method || 'POST';
      const headers = data.headers || {};
      const timeoutValue = data.timeout || 30;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      let payload: any = {};


      const bodyOrPayload = data.body || data.payload;

      if (bodyOrPayload) {
        if (typeof bodyOrPayload === 'string') {
          payload = context.replaceVariables(bodyOrPayload);
          try {
            payload = JSON.parse(payload);
          } catch {
          }
        } else {
          payload = this.replaceVariablesInObject(bodyOrPayload, context);
        }
      } else {
        payload = {
          contact: context.getVariable('contact'),
          message: context.getVariable('message'),
          conversation: context.getVariable('conversation'),
          timestamp: new Date().toISOString(),
          executionId: context.getVariable('execution.id'),
          flowId: context.getVariable('flow.id')
        };
      }

      const response = await this.makeHttpRequest({
        url: webhookUrl,
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PowerChatPlus-FlowExecutor/1.0',
          ...headers
        },
        body: method !== 'GET' ? JSON.stringify(payload) : undefined,
        timeout
      });
      
      const responseData = {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
        url: webhookUrl,
        method,
        timestamp: new Date().toISOString()
      };

      context.setWebhookResponse(responseData);

      if (response.data) {
        context.setVariable('webhook.lastResponse', response.data);

        if (typeof response.data === 'object') {
          Object.entries(response.data).forEach(([key, value]) => {
            context.setVariable(`webhook.${key}`, value);
          });
        }
      }


      this.markWebhookAsExecuted(nodeId, context, responseData, pathId);

    } catch (error) {
      console.error('Error executing Webhook node with context:', error);

      context.setVariable('webhook.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Execute Contact Notification node with execution context
   */
  private async executeContactNotificationNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection,
    pathId?: string
  ): Promise<void> {
    try {
      const nodeId = node.id;


      if (context.isContactNotificationExecuted(nodeId, pathId)) {

        const keySuffix = pathId ? `${nodeId}.${pathId}` : nodeId;
        const cachedResponse = context.getVariable(`contactNotification.cachedResponse.${keySuffix}`);
        if (cachedResponse) {
          context.setContactNotificationResponse(cachedResponse);
          if (cachedResponse.data) {
            context.setVariable('contactNotification.lastResponse', cachedResponse.data);
            if (typeof cachedResponse.data === 'object') {
              Object.entries(cachedResponse.data).forEach(([key, value]) => {
                context.setVariable(`contactNotification.${key}`, value);
              });
            }
          }
        }
        return;
      }

      const data = node.data || {};


      let companyId: number | undefined = conversation.companyId || undefined;
      

      if (!companyId) {
        const contextCompanyId = context.getVariable('flow.companyId');
        if (contextCompanyId) {
          companyId = parseInt(String(contextCompanyId), 10);
        }
      }



      const channelType = conversation.channelType || 
                         context.getVariable('conversation.channelType') || 
                         data.channelType || 
                         'whatsapp_official';


      const result = await executeContactNotificationNode(
        {
          phoneNumber: data.phoneNumber || '',
          channelType: channelType as 'whatsapp_official' | 'whatsapp_unofficial' | 'twilio_sms',
          messageContent: data.messageContent || ''
        },
        context,
        companyId
      );


      const responseData = {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        data: result.data,
        timestamp: new Date().toISOString()
      };

      context.markContactNotificationExecuted(nodeId, responseData, pathId);


      if (!result.success && data.errorHandling === 'stop') {
        throw new Error(result.error || 'Contact notification failed');
      }

    } catch (error) {
      console.error('Error executing Contact Notification node with context:', error);

      context.setVariable('contactNotification.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });


      const data = node.data || {};
      if (data.errorHandling === 'stop') {
        throw error;
      }
    }
  }

  /**
   * Check if a webhook node has already been executed in the current execution context
   * @param nodeId The ID of the webhook node
   * @param context The execution context
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the webhook has been executed, false otherwise
   */
  private hasWebhookBeenExecuted(nodeId: string, context: FlowExecutionContext, pathId?: string): boolean {
    return context.isWebhookExecuted(nodeId, pathId);
  }

  /**
   * Mark a webhook node as executed in the current execution context
   * @param nodeId The ID of the webhook node
   * @param context The execution context
   * @param responseData The response data to cache
   * @param pathId Optional path identifier to track execution per path
   */
  private markWebhookAsExecuted(nodeId: string, context: FlowExecutionContext, responseData?: any, pathId?: string): void {
    context.markWebhookExecuted(nodeId, responseData, pathId);
  }

  /**
   * Check if an HTTP request node has already been executed in the current execution context
   * 
   * NOTE: Single-execution semantics
   * HTTP request nodes execute only once per flow execution path. The execution state
   * is tracked in-memory and persists across variable clearing operations. If variables
   * are saved to storage and loaded in subsequent sessions, the execution state will
   * also persist, preventing re-execution across session boundaries.
   * 
   * @param nodeId The ID of the HTTP request node
   * @param context The execution context
   * @param pathId Optional path identifier to check execution per path
   * @returns True if the HTTP request has been executed, false otherwise
   */
  private hasHttpBeenExecuted(nodeId: string, context: FlowExecutionContext, pathId?: string): boolean {
    return context.isHttpExecuted(nodeId, pathId);
  }

  /**
   * Mark an HTTP request node as executed in the current execution context
   * 
   * NOTE: Single-execution semantics
   * This marks the HTTP request node as executed and caches its response (or error state).
   * Subsequent visits to this node in the same execution context will use the cached
   * response instead of making a new HTTP request.
   * 
   * @param nodeId The ID of the HTTP request node
   * @param context The execution context
   * @param responseData The response data to cache (can be success response or error payload)
   * @param pathId Optional path identifier to track execution per path
   */
  private markHttpAsExecuted(nodeId: string, context: FlowExecutionContext, responseData?: any, pathId?: string): void {
    context.markHttpExecuted(nodeId, responseData, pathId);
  }

  /**
   * Execute HTTP Request node with execution context
   */
  private async executeHttpRequestNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection,
    pathId?: string
  ): Promise<void> {
    const nodeId = node.id;

    try {

      if (this.hasHttpBeenExecuted(nodeId, context, pathId)) {

        const cachedResponse = context.getHttpCachedResponse(nodeId, pathId);
        if (cachedResponse) {

          if (cachedResponse.error) {

            context.setVariable('http.error', cachedResponse.error);
          } else {

            context.setHttpResponse(cachedResponse);
            if (cachedResponse.data) {
              context.setVariable('http.lastResponse', cachedResponse.data);
              if (typeof cachedResponse.data === 'object') {
                Object.entries(cachedResponse.data).forEach(([key, value]) => {
                  context.setVariable(`http.${key}`, value);
                });
              }
            }
          }
        }
        return;
      }

      const data = node.data || {};

      const url = context.replaceVariables(data.url || '');
      const method = (data.method || 'GET').toUpperCase();
      const headers = data.headers || {};
      const timeoutValue = data.timeout || 30;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      let body: string | undefined;
      if (method !== 'GET' && data.body) {
        if (typeof data.body === 'string') {
          body = context.replaceVariables(data.body);
        } else {
          body = JSON.stringify(this.replaceVariablesInObject(data.body, context));
        }
      }

      let finalUrl = url;
      if (method === 'GET' && data.params) {
        const params = new URLSearchParams();
        Object.entries(data.params).forEach(([key, value]) => {
          params.append(key, context.replaceVariables(String(value)));
        });
        finalUrl = `${url}${url.includes('?') ? '&' : '?'}${params.toString()}`;
      }


      const response = await this.makeHttpRequest({
        url: finalUrl,
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PowerChatPlus-FlowExecutor/1.0',
          ...headers
        },
        body,
        timeout
      });

      context.setHttpResponse({
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
        url: finalUrl,
        method,
        timestamp: new Date().toISOString()
      });

      if (response.data) {
        context.setVariable('http.lastResponse', response.data);

        if (typeof response.data === 'object') {
          Object.entries(response.data).forEach(([key, value]) => {
            context.setVariable(`http.${key}`, value);
          });
        }
      }


      const responseData = {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
        url: finalUrl,
        method,
        timestamp: new Date().toISOString()
      };
      this.markHttpAsExecuted(nodeId, context, responseData, pathId);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorResponse = {
        error: {
          message: errorMessage,
          timestamp: new Date().toISOString()
        }
      };

      context.setVariable('http.error', errorResponse.error);


      this.markHttpAsExecuted(nodeId, context, errorResponse, pathId);

      throw error;
    }
  }

  /**
   * Execute CallAgent node with execution state tracking
   */
  private async executeCallAgentNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection,
    pathId?: string
  ): Promise<void> {
    const nodeId = node.id;

    try {

      if (this.hasCallAgentBeenExecuted(nodeId, context, pathId)) {

        const cachedResponse = context.getCallAgentCachedResponse(nodeId, pathId);
        if (cachedResponse) {

          if (cachedResponse.callSid) {
            context.setVariable('callAgent.callSid', cachedResponse.callSid);
          }
          if (cachedResponse.status) {
            context.setVariable('callAgent.status', cachedResponse.status);
          }
          if (cachedResponse.transcript) {
            context.setVariable('callAgent.transcript', cachedResponse.transcript);
          }
          if (cachedResponse.conversation) {
            context.setVariable('callAgent.conversation', cachedResponse.conversation);
          }
          if (cachedResponse.duration !== undefined) {
            context.setVariable('callAgent.duration', cachedResponse.duration);
          }
          if (cachedResponse.startTime) {
            context.setVariable('callAgent.startTime', cachedResponse.startTime);
          }
          if (cachedResponse.endTime) {
            context.setVariable('callAgent.endTime', cachedResponse.endTime);
          }
          if (cachedResponse.recordingUrl) {
            context.setVariable('callAgent.recordingUrl', cachedResponse.recordingUrl);
          }
          if (cachedResponse.outcome) {
            context.setVariable('callAgent.outcome', cachedResponse.outcome);
          }
          context.setCallAgentResponse(cachedResponse);
        }
        return;
      }

      const data = node.data || {};


      const twilioAccountSid = context.replaceVariables(data.twilioAccountSid || '');
      const twilioAuthToken = context.replaceVariables(data.twilioAuthToken || '');
      const twilioFromNumber = context.replaceVariables(data.twilioFromNumber || '');


      const elevenLabsApiKey = context.replaceVariables(data.elevenLabsApiKey || '');
      const elevenLabsAgentId = data.elevenLabsAgentId ? context.replaceVariables(data.elevenLabsAgentId) : undefined;
      const elevenLabsPrompt = data.elevenLabsPrompt ? context.replaceVariables(data.elevenLabsPrompt) : undefined;
      const voiceSettings = data.voiceSettings || {};
      const elevenLabsVoiceId = voiceSettings.voiceId ? context.replaceVariables(voiceSettings.voiceId) : undefined;
      const elevenLabsModel = voiceSettings.model ? context.replaceVariables(voiceSettings.model) : undefined;



      const rawToNumber = data.toPhoneNumber || data.toNumber || '';
      const toNumber = context.replaceVariables(rawToNumber);


      const timeout = data.timeout ? parseInt(context.replaceVariables(String(data.timeout))) : 30;
      const maxDuration = data.maxDuration ? parseInt(context.replaceVariables(String(data.maxDuration))) : 300;
      const recordCall = data.recordCall === true || data.recordCall === 'true';


      const executionMode = data.executionMode || 'blocking';


      if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
        throw new Error('Missing Twilio credentials: accountSid, authToken, and fromNumber are required');
      }
      if (!elevenLabsApiKey) {
        throw new Error('Missing ElevenLabs API key');
      }
      if (!elevenLabsAgentId && !elevenLabsPrompt) {
        throw new Error('Either elevenLabsAgentId or elevenLabsPrompt must be provided');
      }
      if (!toNumber) {
        throw new Error('Missing toNumber parameter');
      }


      const callAgentService = await import('./call-agent-service');



      let webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 
                            process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
                            'localhost:3000';

      webhookBaseUrl = webhookBaseUrl.replace(/^https?:\/\//, '');


      const config: CallAgentConfig = {
        twilioAccountSid,
        twilioAuthToken,
        twilioFromNumber,
        elevenLabsApiKey,
        elevenLabsAgentId,
        elevenLabsPrompt,
        elevenLabsVoiceId,
        elevenLabsModel,
        toNumber,
        timeout,
        maxDuration,
        recordCall,
        executionMode: executionMode as 'blocking' | 'async'
      };


      const callResult = await callAgentService.initiateOutboundCall(config, webhookBaseUrl);
      const callSid = callResult.callSid;


      const { callLogsService } = await import('./call-logs-service');
      const { CallLogsEventEmitter } = await import('../utils/websocket');
      
      const savedCall = await callLogsService.upsertCallLog({
        companyId: _conversation?.companyId || context.getVariable('flow.companyId') as number || 0,
        channelId: _channelConnection?.id,
        contactId: _contact?.id,
        conversationId: _conversation?.id,
        flowId: context.getVariable('flow.id') as number,
        nodeId: nodeId,
        direction: 'outbound',
        status: 'initiated',
        from: callResult.from,
        to: callResult.to,
        twilioCallSid: callSid,
        startedAt: callResult.startTime,
        agentConfig: {
          agentId: config.elevenLabsAgentId,
          prompt: config.elevenLabsPrompt,
          voiceId: config.elevenLabsVoiceId,
          model: config.elevenLabsModel
        },
        metadata: callResult.metadata
      });


      if (savedCall) {
        const companyId = _conversation?.companyId || context.getVariable('flow.companyId') as number || 0;
        CallLogsEventEmitter.emitCallStatusUpdate(savedCall.id, companyId, 'initiated', {
          callSid,
          from: callResult.from,
          to: callResult.to
        });
      }


      context.setVariable('callAgent.callSid', callSid);
      context.setVariable('callAgent.status', 'initiated');
      context.setVariable('callAgent.from', callResult.from);
      context.setVariable('callAgent.to', callResult.to);
      context.setVariable('callAgent.startTime', callResult.startTime.toISOString());
      if (savedCall) {
        context.setVariable('callAgent.callId', savedCall.id);
      }

      if (executionMode === 'blocking') {

        const startTime = Date.now();
        const maxWaitTime = maxDuration * 1000; // Convert to milliseconds
        const pollInterval = 2000; // Poll every 2 seconds

        let callStatus: CallStatus;
        let isTerminal = false;


        while (!isTerminal && (Date.now() - startTime) < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          callStatus = await callAgentService.trackCallStatus(callSid, config);


          context.setVariable('callAgent.status', callStatus.status);


          isTerminal = ['completed', 'failed', 'busy', 'no-answer'].includes(callStatus.status);

          if (isTerminal) {
            break;
          }
        }


        callStatus = await callAgentService.trackCallStatus(callSid, config);


        const transcript = callAgentService.extractTranscript(callSid);


        const callId = context.getVariable('callAgent.callId');
        if (callId) {
          const { calculateCallCost, trackCallCost } = await import('./call-cost-tracker');
          const cost = calculateCallCost({
            duration: callStatus.duration || 0,
            direction: 'outbound'
          });
          
          await callLogsService.upsertCallLog({
            twilioCallSid: callSid as string,
            status: callStatus.status,
            durationSec: callStatus.duration,
            startedAt: callStatus.startTime,
            endedAt: callStatus.endTime,
            recordingUrl: callStatus.recordingUrl,
            transcript: transcript.turns,
            conversationData: transcript.turns,
            cost: cost.cost.toString(),
            costCurrency: cost.currency
          });


          const failureStates = ['failed', 'busy', 'no-answer', 'canceled'];
          const companyId = _conversation?.companyId || context.getVariable('flow.companyId') as number || 0;
          if (failureStates.includes(callStatus.status)) {
            CallLogsEventEmitter.emitCallFailed(
              callId as number,
              companyId,
              `Call ${callStatus.status}`
            );
          } else {
            CallLogsEventEmitter.emitCallCompleted(callId as number, companyId, {
              status: callStatus.status,
              duration: callStatus.duration,
              transcript: transcript.fullText
            });
          }
        }


        context.setVariable('callAgent.status', callStatus.status);
        context.setVariable('callAgent.duration', callStatus.duration || 0);
        context.setVariable('callAgent.transcript', transcript.fullText);
        context.setVariable('callAgent.conversation', JSON.stringify(transcript.turns));
        context.setVariable('callAgent.userUtterances', JSON.stringify(transcript.userUtterances));
        context.setVariable('callAgent.aiResponses', JSON.stringify(transcript.aiResponses));
        
        if (callStatus.startTime) {
          context.setVariable('callAgent.startTime', callStatus.startTime.toISOString());
        }
        if (callStatus.endTime) {
          context.setVariable('callAgent.endTime', callStatus.endTime.toISOString());
        }
        if (callStatus.recordingUrl) {
          context.setVariable('callAgent.recordingUrl', callStatus.recordingUrl);
        }


        let outcome = 'answered';
        if (callStatus.status === 'no-answer') {
          outcome = 'no-answer';
        } else if (callStatus.status === 'busy') {
          outcome = 'busy';
        } else if (callStatus.status === 'failed') {
          outcome = 'failed';
        }
        context.setVariable('callAgent.outcome', outcome);


        const responseData = {
          callSid,
          status: callStatus.status,
          duration: callStatus.duration,
          transcript: transcript.fullText,
          conversation: transcript.turns,
          userUtterances: transcript.userUtterances,
          aiResponses: transcript.aiResponses,
          startTime: callStatus.startTime?.toISOString(),
          endTime: callStatus.endTime?.toISOString(),
          recordingUrl: callStatus.recordingUrl,
          outcome
        };

        context.setCallAgentResponse(responseData);


        this.markCallAgentAsExecuted(nodeId, context, responseData, pathId);


        callAgentService.removeActiveCall(callSid);
      } else {

        context.setVariable('callAgent.status', 'initiated');
        
        const responseData = {
          callSid,
          status: 'initiated',
          from: callResult.from,
          to: callResult.to,
          startTime: callResult.startTime.toISOString()
        };

        context.setCallAgentResponse(responseData);


        this.markCallAgentAsExecuted(nodeId, context, responseData, pathId);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorResponse = {
        error: {
          message: errorMessage,
          timestamp: new Date().toISOString()
        }
      };

      context.setVariable('callAgent.error', errorResponse.error);


      this.markCallAgentAsExecuted(nodeId, context, errorResponse, pathId);

      console.error('[CallAgent] Error executing CallAgent node:', error);
      throw error;
    }
  }

  /**
   * Check if CallAgent node has been executed
   */
  private hasCallAgentBeenExecuted(nodeId: string, context: FlowExecutionContext, pathId?: string): boolean {
    return context.isCallAgentExecuted(nodeId, pathId);
  }

  /**
   * Mark CallAgent node as executed
   */
  private markCallAgentAsExecuted(nodeId: string, context: FlowExecutionContext, responseData?: any, pathId?: string): void {
    context.markCallAgentExecuted(nodeId, responseData, pathId);
  }

  /**
   * Execute Code Execution node inside a secure sandbox
   */
  private async executeCodeExecutionNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const data = node.data || {};
    const userCode: string = data.code || '';
    const timeoutValue = data.timeout || 5000;
    const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;


    const initialVariables = context.getAllVariables();
    const sandboxVariables: Record<string, any> = { ...initialVariables };


    const safeFetch = async (input: string, init: any = {}) => {
      const controller = new AbortController();
      const perRequestTimeout = Math.min(Math.max(100, Number(init?.timeout) || timeout), 30000);
      const t = setTimeout(() => controller.abort(), perRequestTimeout);
      try {
        const { timeout: _omitTimeout, ...rest } = init || {};
        const res = await fetch(input, { ...rest, signal: controller.signal });
        return res;
      } finally {
        clearTimeout(t);
      }
    };

    try {

      const ivm = await import('isolated-vm');


      const isolate = new ivm.Isolate({ memoryLimit: 32 }); // 32MB memory limit
      const vmContext = await isolate.createContext();


      const jail = vmContext.global;


      await jail.set('variables', new ivm.ExternalCopy(sandboxVariables).copyInto());


      await jail.set('console', new ivm.ExternalCopy({
        log: () => {},
        error: () => {},
        warn: () => {}
      }).copyInto());


      await jail.set('fetch', new ivm.Reference(async (input: string, init: any = {}) => {
        try {
          const response = await safeFetch(input, init);
          const text = await response.text();
          return new ivm.ExternalCopy({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            text: () => Promise.resolve(text),
            json: () => Promise.resolve(JSON.parse(text))
          }).copyInto();
        } catch (error) {
          throw new Error(`Fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }));


      const wrappedCode = `
        (async () => {
          try {
            ${userCode}
            return typeof variables !== 'undefined' ? variables : undefined;
          } catch (error) {
            throw new Error('Code execution error: ' + error.message);
          }
        })()
      `;


      const result = await Promise.race([
        vmContext.eval(wrappedCode, { timeout }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Code execution timeout after ${timeout}ms`)), timeout)
        )
      ]);


      isolate.dispose();


      const finalVars = (result && typeof result === 'object') ? result : sandboxVariables;
      Object.entries(finalVars).forEach(([key, value]) => {
        if (key && /^[a-zA-Z0-9_.-]+$/.test(key)) {
          context.setVariable(key, value);
        }
      });


      if (finalVars && Object.prototype.hasOwnProperty.call(finalVars, 'result')) {
        context.setVariable('code.result', finalVars['result']);
      }


      context.setVariable('code_execution_output', finalVars);

      context.setVariable('code.lastRunAt', new Date().toISOString());


      if (finalVars && finalVars.wiki_summary) {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          finalVars.wiki_summary,
          conversation,
          true
        );
      }

    } catch (error: any) {
      const message = error?.message || 'Code execution error';
      context.setVariable('code.error', {
        message,
        timestamp: new Date().toISOString()
      });
      

      console.error('Code execution error:', message);
      
      throw error;
    }
  }

  /**
   * Helper method to make HTTP requests
   */
  private async makeHttpRequest(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }): Promise<{
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
  }> {
    const { url, method, headers = {}, body, timeout = 30000 } = options;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data: any;
      const contentType = response.headers.get('content-type') || '';

      const responseText = await response.text();

      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = responseText;
        }
      } else {
        data = responseText;
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        data,
        headers: responseHeaders
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`HTTP request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Helper method to replace variables in nested objects
   */
  private replaceVariablesInObject(obj: any, context: FlowExecutionContext): any {
    if (typeof obj === 'string') {
      return context.replaceVariables(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.replaceVariablesInObject(item, context));
    }

    if (obj && typeof obj === 'object') {
      const result: any = {};
      Object.entries(obj).forEach(([key, value]) => {
        result[key] = this.replaceVariablesInObject(value, context);
      });
      return result;
    }

    return obj;
  }

  /**
   * Get nested value from object using dot notation path
   */
  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Execute Input node with execution context
   */
  private async executeInputNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};

      let promptText = data.prompt || data.message || 'Please provide your input:';
      promptText = context.replaceVariables(promptText);

      const inputType = data.inputType || 'text';
      const isRequired = data.required !== false;
      const placeholder = data.placeholder || '';

      let formattedMessage = promptText;
      if (placeholder) {
        formattedMessage += `\n\n${placeholder}`;
      }

      context.setVariable('inputNode.type', inputType);
      context.setVariable('inputNode.required', isRequired);
      context.setVariable('inputNode.prompt', promptText);
      context.setVariable('waitingForInput', true);

      try {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          formattedMessage,
          conversation,
          true
        );
      } catch (channelError) {
        console.error('Error sending input prompt through channel:', channelError);


        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          senderId: channelConnection.userId,
          channelType: channelConnection.channelType,
          type: 'text',
          content: formattedMessage,
          direction: 'outbound',
          status: 'failed',
          mediaUrl: null,
          timestamp: new Date(),
          metadata: {
            error: channelError instanceof Error ? channelError.message : String(channelError),
            failureReason: 'channel_send_error',
            nodeType: 'input',
            retryable: true
          }
        };

        const failedMessage = await storage.createMessage(insertMessage);


        if ((global as any).broadcastToCompany) {
          (global as any).broadcastToCompany({
            type: 'messageFailed',
            data: {
              message: failedMessage,
              error: channelError instanceof Error ? channelError.message : String(channelError),
              conversationId: conversation.id
            }
          }, channelConnection.companyId);
        }


        console.warn('Input prompt failed to send but flow will wait for user input');
      }

    } catch (error) {
      console.error('Error executing Input node with context:', error);
    }
  }

  /**
   * Execute Action node with execution context
   */
  private async executeActionNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const actionType = data.actionType || data.action || 'log';

      switch (actionType.toLowerCase()) {
        case 'log':
          const logMessage = context.replaceVariables(data.message || 'Action executed');
          context.setVariable('action.lastLog', logMessage);
          break;

        case 'set_variable':
          const variableName = data.variableName || 'actionResult';
          const variableValue = context.replaceVariables(data.variableValue || '');
          context.setVariable(variableName, variableValue);
          break;

        case 'api_call':
          if (data.apiUrl) {
            const timeoutValue = data.timeout || 30;
            const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

            const response = await this.makeHttpRequest({
              url: context.replaceVariables(data.apiUrl),
              method: data.apiMethod || 'GET',
              headers: data.apiHeaders || {},
              body: data.apiBody ? JSON.stringify(this.replaceVariablesInObject(data.apiBody, context)) : undefined,
              timeout
            });

            context.setVariable('action.apiResponse', response.data);
            context.setVariable('action.apiStatus', response.status);
          }
          break;

        case 'delay':
          const delayValue = data.delayValue || data.delay || data.delayMs || 1;
          const delayUnit = data.delayUnit || 'seconds';

          let delayMs = delayValue;
          switch (delayUnit.toLowerCase()) {
            case 'milliseconds':
            case 'ms':
              delayMs = delayValue;
              break;
            case 'seconds':
            case 'sec':
            case 's':
              delayMs = delayValue * 1000;
              break;
            case 'minutes':
            case 'min':
            case 'm':
              delayMs = delayValue * 60 * 1000;
              break;
            case 'hours':
            case 'hour':
            case 'h':
              delayMs = delayValue * 60 * 60 * 1000;
              break;
            default:
              if (data.delayMs) {
                delayMs = data.delayMs;
              } else {
                delayMs = delayValue * 1000;
              }
          }


          await new Promise(resolve => setTimeout(resolve, delayMs));

          context.setVariable('action.lastDelay', delayMs);
          context.setVariable('action.lastDelayValue', delayValue);
          context.setVariable('action.lastDelayUnit', delayUnit);
          break;

        default:
          context.setVariable('action.error', `Unknown action type: ${actionType}`);
      }

      context.setVariable('action.lastExecution', new Date().toISOString());
      context.setVariable('action.lastType', actionType);

    } catch (error) {
      console.error('Error executing Action node with context:', error);
      context.setVariable('action.error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Execute Shopify node with execution context
   */
  private async executeShopifyNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const operation = data.operation || 'get_products';
      const shopifyConfig = data.shopifyConfig || {};

      const shopUrl = context.replaceVariables(shopifyConfig.shopUrl || '');
      const accessToken = context.replaceVariables(shopifyConfig.accessToken || '');

      if (!shopUrl || !accessToken) {
        throw new Error('Shopify configuration missing: shopUrl and accessToken required');
      }

      let apiUrl = '';
      let method = 'GET';
      let body: any = undefined;

      switch (operation) {
        case 'get_products':
          apiUrl = `${shopUrl}/admin/api/2023-10/products.json`;
          break;

        case 'get_product':
          const productId = context.replaceVariables(data.productId || '');
          apiUrl = `${shopUrl}/admin/api/2023-10/products/${productId}.json`;
          break;

        case 'get_orders':
          apiUrl = `${shopUrl}/admin/api/2023-10/orders.json`;
          break;

        case 'get_customer':
          const customerId = context.replaceVariables(data.customerId || '');
          apiUrl = `${shopUrl}/admin/api/2023-10/customers/${customerId}.json`;
          break;

        case 'create_customer':
          apiUrl = `${shopUrl}/admin/api/2023-10/customers.json`;
          method = 'POST';
          body = JSON.stringify({
            customer: this.replaceVariablesInObject(data.customerData || {}, context)
          });
          break;

        default:
          throw new Error(`Unknown Shopify operation: ${operation}`);
      }


      const timeoutValue = data.timeout || 30;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      const response = await this.makeHttpRequest({
        url: apiUrl,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
          'User-Agent': 'PowerChatPlus-FlowExecutor/1.0'
        },
        body,
        timeout
      });


      context.setVariable('shopify.lastResponse', response.data);
      context.setVariable('shopify.lastOperation', operation);
      context.setVariable('shopify.lastStatus', response.status);

      if (response.data) {
        switch (operation) {
          case 'get_products':
            context.setVariable('shopify.products', response.data.products || []);
            break;
          case 'get_product':
            context.setVariable('shopify.product', response.data.product || {});
            break;
          case 'get_orders':
            context.setVariable('shopify.orders', response.data.orders || []);
            break;
          case 'get_customer':
            context.setVariable('shopify.customer', response.data.customer || {});
            break;
          case 'create_customer':
            context.setVariable('shopify.createdCustomer', response.data.customer || {});
            break;
        }
      }

    } catch (error) {
      console.error('Error executing Shopify node with context:', error);
      context.setVariable('shopify.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute WooCommerce node with execution context
   */
  private async executeWooCommerceNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const operation = data.operation || 'get_products';
      const wooConfig = data.wooConfig || {};

      const siteUrl = context.replaceVariables(wooConfig.siteUrl || '');
      const consumerKey = context.replaceVariables(wooConfig.consumerKey || '');
      const consumerSecret = context.replaceVariables(wooConfig.consumerSecret || '');

      if (!siteUrl || !consumerKey || !consumerSecret) {
        throw new Error('WooCommerce configuration missing: siteUrl, consumerKey, and consumerSecret required');
      }

      let apiUrl = '';
      let method = 'GET';
      let body: any = undefined;

      const baseUrl = `${siteUrl}/wp-json/wc/v3`;

      switch (operation) {
        case 'get_products':
          apiUrl = `${baseUrl}/products`;
          break;

        case 'get_product':
          const productId = context.replaceVariables(data.productId || '');
          apiUrl = `${baseUrl}/products/${productId}`;
          break;

        case 'get_orders':
          apiUrl = `${baseUrl}/orders`;
          break;

        case 'get_customer':
          const customerId = context.replaceVariables(data.customerId || '');
          apiUrl = `${baseUrl}/customers/${customerId}`;
          break;

        case 'create_customer':
          apiUrl = `${baseUrl}/customers`;
          method = 'POST';
          body = JSON.stringify(this.replaceVariablesInObject(data.customerData || {}, context));
          break;

        default:
          throw new Error(`Unknown WooCommerce operation: ${operation}`);
      }

      const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');


      const timeoutValue = data.timeout || 30;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      const response = await this.makeHttpRequest({
        url: apiUrl,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'PowerChatPlus-FlowExecutor/1.0'
        },
        body,
        timeout
      });


      context.setVariable('woocommerce.lastResponse', response.data);
      context.setVariable('woocommerce.lastOperation', operation);
      context.setVariable('woocommerce.lastStatus', response.status);

      if (response.data) {
        switch (operation) {
          case 'get_products':
            context.setVariable('woocommerce.products', Array.isArray(response.data) ? response.data : []);
            break;
          case 'get_product':
            context.setVariable('woocommerce.product', response.data);
            break;
          case 'get_orders':
            context.setVariable('woocommerce.orders', Array.isArray(response.data) ? response.data : []);
            break;
          case 'get_customer':
            context.setVariable('woocommerce.customer', response.data);
            break;
          case 'create_customer':
            context.setVariable('woocommerce.createdCustomer', response.data);
            break;
        }
      }

    } catch (error) {
      console.error('Error executing WooCommerce node with context:', error);
      context.setVariable('woocommerce.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute WhatsApp Flows node with execution context
   */
  private async executeWhatsAppFlowsNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      

      const data = node.data || {};


      if (channelConnection.channelType !== 'whatsapp_official') {
        console.warn('WhatsApp Flows node can only be used with Official WhatsApp API connections');

        const fallbackMessage = context.replaceVariables(data.bodyText || 'Please interact with our flow to continue.');
        await this.sendMessageThroughChannel(channelConnection, contact, fallbackMessage, conversation, true);
        return;
      }


      const flowId = context.replaceVariables(data.flowId || '');

      

      if (!flowId) {
        throw new Error('Flow ID is required. Please specify an existing WhatsApp Flow ID.');
      }

      


      await this.sendWhatsAppFlow(
        flowId,
        contact,
        conversation,
        channelConnection,
        context,
        data
      );


      context.setVariable('whatsapp_flows.flowId', flowId);
      context.setVariable('whatsapp_flows.sentAt', new Date().toISOString());

    } catch (error) {
      console.error('Error executing WhatsApp Flows node with context:', error);
      context.setVariable('whatsapp_flows.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Send WhatsApp Flow to contact
   */
  private async sendWhatsAppFlow(
    flowId: string,
    contact: Contact,
    conversation: Conversation,
    channelConnection: ChannelConnection,
    context: FlowExecutionContext,
    nodeData: any
  ): Promise<void> {
    try {


      if (!contact.phone) {
        throw new Error('Contact phone number is required to send WhatsApp Flow');
      }




      const bodyText = context.replaceVariables(nodeData.bodyText || 'Please interact with our flow to continue.');
      

      const ctaText = context.replaceVariables(nodeData.ctaText || 'Open Flow');
      
      const interactiveMessage = {
        messaging_product: 'whatsapp',
        to: contact.phone,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: {
            text: bodyText
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: `flow_${Date.now()}`,
              flow_id: flowId,
              flow_action: 'navigate',
              flow_cta: ctaText
            }
          }
        }
      };

      


      await this.sendWhatsAppInteractiveMessage(channelConnection, interactiveMessage, conversation);




      context.setVariable('whatsapp_flows.flowId', flowId);
      context.setVariable('whatsapp_flows.bodyText', nodeData.bodyText);
      context.setVariable('whatsapp_flows.ctaText', nodeData.ctaText);
      context.setVariable('whatsapp_flows.sentAt', new Date().toISOString());

    } catch (error) {
      console.error('Error sending WhatsApp Flow:', error);
      context.setVariable('whatsapp_flows.sendError', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute Typebot node with execution context
   */
  private async executeTypebotNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const operation = data.operation || 'start_conversation';
      const typebotConfig = data.typebotConfig || {};

      const typebotUrl = context.replaceVariables(typebotConfig.typebotUrl || '');
      const typebotId = context.replaceVariables(typebotConfig.typebotId || '');
      const apiKey = context.replaceVariables(typebotConfig.apiKey || '');

      if (!typebotUrl || !typebotId) {
        throw new Error('Typebot configuration missing: typebotUrl and typebotId required');
      }

      let apiUrl = '';
      let method = 'POST';
      let body: any = {};

      const baseUrl = `${typebotUrl}/api/v1/typebots/${typebotId}`;

      switch (operation) {
        case 'start_conversation':
          apiUrl = `${baseUrl}/startChat`;
          body = {
            prefilledVariables: this.replaceVariablesInObject(data.prefilledVariables || {}, context)
          };
          break;

        case 'send_message':
          const sessionId = context.getVariable('typebot.session.id') || data.sessionId;
          apiUrl = `${baseUrl}/continueChat`;
          body = {
            sessionId: context.replaceVariables(sessionId),
            message: context.replaceVariables(data.message || context.getVariable('message.content') || '')
          };
          break;

        case 'get_response':
          const getSessionId = context.getVariable('typebot.session.id') || data.sessionId;
          apiUrl = `${baseUrl}/getMessages`;
          method = 'GET';
          apiUrl += `?sessionId=${encodeURIComponent(context.replaceVariables(getSessionId))}`;
          body = undefined;
          break;

        case 'manage_session':
          const manageSessionId = context.getVariable('typebot.session.id') || data.sessionId;
          const action = data.action || 'close';
          apiUrl = `${baseUrl}/sessions/${encodeURIComponent(context.replaceVariables(manageSessionId))}`;
          method = action === 'close' ? 'DELETE' : 'PUT';
          body = action !== 'close' ? { status: action } : undefined;
          break;

        default:
          throw new Error(`Unknown Typebot operation: ${operation}`);
      }


      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'PowerChatPlus-FlowExecutor/1.0'
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const timeoutValue = data.timeout || 30;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      const response = await this.makeHttpRequest({
        url: apiUrl,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        timeout
      });


      context.setVariable('typebot.lastResponse', response.data);
      context.setVariable('typebot.lastOperation', operation);
      context.setVariable('typebot.lastStatus', response.status);

      if (response.data) {
        switch (operation) {
          case 'start_conversation':
            if (response.data.sessionId) {
              context.setVariable('typebot.session.id', response.data.sessionId);
            }
            if (response.data.messages) {
              context.setVariable('typebot.messages', response.data.messages);
            }
            break;

          case 'send_message':
            if (response.data.messages) {
              context.setVariable('typebot.messages', response.data.messages);
              context.setVariable('typebot.lastMessages', response.data.messages);
            }
            break;

          case 'get_response':
            if (response.data.messages) {
              context.setVariable('typebot.messages', response.data.messages);
            }
            break;
        }
      }

    } catch (error) {
      console.error('Error executing Typebot node with context:', error);
      context.setVariable('typebot.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute Flowise node with execution context
   */
  private async executeFlowiseNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const operation = data.operation || 'start_chatflow';
      const flowiseConfig = data.flowiseConfig || {};

      const flowiseUrl = context.replaceVariables(flowiseConfig.flowiseUrl || '');
      const chatflowId = context.replaceVariables(flowiseConfig.chatflowId || '');
      const apiKey = context.replaceVariables(flowiseConfig.apiKey || '');

      if (!flowiseUrl || !chatflowId) {
        throw new Error('Flowise configuration missing: flowiseUrl and chatflowId required');
      }

      let apiUrl = '';
      let method = 'POST';
      let body: any = {};

      const baseUrl = `${flowiseUrl}/api/v1`;

      switch (operation) {
        case 'start_chatflow':
        case 'send_message':
          apiUrl = `${baseUrl}/prediction/${chatflowId}`;
          body = {
            question: context.replaceVariables(data.question || context.getVariable('message.content') || ''),
            overrideConfig: this.replaceVariablesInObject(data.overrideConfig || {}, context),
            history: context.getVariable('flowise.history') || []
          };

          const sessionId = context.getVariable('flowise.session.id') || data.sessionId;
          if (sessionId) {
            body.sessionId = context.replaceVariables(sessionId);
          }

          if (data.streaming !== undefined) {
            body.streaming = data.streaming;
          }
          break;

        case 'get_response':
          const getSessionId = context.getVariable('flowise.session.id') || data.sessionId;
          apiUrl = `${baseUrl}/chatmessage/${chatflowId}`;
          method = 'GET';
          if (getSessionId) {
            apiUrl += `?sessionId=${encodeURIComponent(context.replaceVariables(getSessionId))}`;
          }
          body = undefined;
          break;

        case 'get_chatflows':
          apiUrl = `${baseUrl}/chatflows`;
          method = 'GET';
          body = undefined;
          break;

        default:
          throw new Error(`Unknown Flowise operation: ${operation}`);
      }


      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'PowerChatPlus-FlowExecutor/1.0'
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const timeoutValue = data.timeout || 60;
      const timeout = typeof timeoutValue === 'number' && timeoutValue < 1000 ? timeoutValue * 1000 : timeoutValue;

      const response = await this.makeHttpRequest({
        url: apiUrl,
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        timeout
      });


      context.setVariable('flowise.lastResponse', response.data);
      context.setVariable('flowise.lastOperation', operation);
      context.setVariable('flowise.lastStatus', response.status);

      if (response.data) {
        switch (operation) {
          case 'start_chatflow':
          case 'send_message':
            if (response.data.text) {
              context.setVariable('flowise.response', response.data.text);
              context.setVariable('ai.response', response.data.text);
            }

            if (response.data.sessionId) {
              context.setVariable('flowise.session.id', response.data.sessionId);
            }

            const currentHistory = context.getVariable('flowise.history') || [];
            const newHistory = [
              ...currentHistory,
              {
                role: 'user',
                content: body.question,
                timestamp: new Date().toISOString()
              },
              {
                role: 'assistant',
                content: response.data.text || '',
                timestamp: new Date().toISOString()
              }
            ];
            context.setVariable('flowise.history', newHistory);
            break;

          case 'get_response':
            if (Array.isArray(response.data)) {
              context.setVariable('flowise.messages', response.data);
            }
            break;

          case 'get_chatflows':
            if (Array.isArray(response.data)) {
              context.setVariable('flowise.chatflows', response.data);
            }
            break;
        }
      }

    } catch (error) {
      console.error('Error executing Flowise node with context:', error);
      context.setVariable('flowise.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute n8n node with execution context
   */
  private async executeN8nNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const operation = data.operation || 'webhook_trigger';

      if (data.chatWebhookUrl && data.chatWebhookUrl.trim()) {
        const userMessage = context.getVariable('message.content') || 'Hello';
        const messageType = context.getVariable('message.type') || 'text';
        const messageObject = context.getVariable('message') || {};
        const mediaUrl = context.getVariable('message.mediaUrl') || context.getVariable('message.media_url') || messageObject.mediaUrl;



        const sessionId = `conv_${_conversation.id}_contact_${_contact.id}`;

        const chatBody = this.buildN8nMessagePayload(
          userMessage,
          messageType,
          mediaUrl,
          sessionId,
          data,
          context
        );

        try {
          const response = await axios({
            method: 'POST',
            url: data.chatWebhookUrl.trim(),
            headers: {
              'Content-Type': 'application/json'
            },
            data: chatBody,
            timeout: 30000
          });

          if (response?.data) {
            const processedResponse = this.processN8nResponse(response.data, data);

            if (processedResponse.text && processedResponse.text.trim()) {
              let formattedText = processedResponse.text;
              if ((_channelConnection.channelType === 'whatsapp' || _channelConnection.channelType === 'whatsapp_unofficial' || _channelConnection.channelType === 'whatsapp_official')) {
                formattedText = this.formatResponseForWhatsApp(processedResponse.text);
              }

              try {

                try {
                  await this.sendMessageThroughChannel(
                    _channelConnection,
                    _contact,
                    formattedText,
                    _conversation,
                    true
                  );

                  if (processedResponse.media && processedResponse.media.length > 0) {
                    await this.sendN8nMediaResponses(
                      processedResponse.media,
                      _channelConnection,
                      _contact,
                      _conversation,
                      node.id,
                      data.chatWebhookUrl
                    );
                  }

                  const recentMessages = await storage.getMessagesByConversationPaginated(_conversation.id, 1, 0);
                  if (recentMessages.length > 0) {
                    const savedMessage = recentMessages[0];
                    const existingMetadata = savedMessage.metadata
                      ? (typeof savedMessage.metadata === 'string'
                         ? JSON.parse(savedMessage.metadata)
                         : savedMessage.metadata)
                      : {};
                    const updatedMetadata = {
                      ...existingMetadata,
                      source: 'n8n_direct_webhook',
                      nodeId: node.id,
                      webhookUrl: data.chatWebhookUrl,
                      hasMediaResponse: processedResponse.media && processedResponse.media.length > 0
                    };

                    await storage.updateMessage(savedMessage.id, {
                      metadata: JSON.stringify(updatedMetadata)
                    });
                  }

                } catch (error) {
                  console.error('Error sending direct webhook AI response via channel:', error);

                  const insertMessage = {
                    conversationId: _conversation.id,
                    contactId: _contact.id,
                    content: formattedText,
                    messageType: 'text' as const,
                    direction: 'outbound' as const,
                    status: 'failed' as const,
                    timestamp: new Date(),
                    metadata: {
                      source: 'n8n_direct_webhook',
                      nodeId: node.id,
                      webhookUrl: data.chatWebhookUrl,
                      error: 'Failed to send via channel'
                    }
                  };

                  await storage.createMessage(insertMessage);
                }
              } catch (error) {
                console.error('Error processing direct webhook AI response:', error);
              }

              context.setVariable('n8n.response', {
                message: formattedText,
                aiResponse: formattedText,
                mediaResponse: processedResponse.media
              });
              context.setVariable('n8n.status', response.status);
              context.setVariable('n8n.lastExecution', new Date().toISOString());

              return;
            }
          }
        } catch (directWebhookError: any) {
        }
      }

      const n8nConfig = data.n8nConfig || {};

      const webhookUrl = context.replaceVariables(data.webhookUrl || n8nConfig.webhookUrl || '');
      const apiKey = context.replaceVariables(data.apiKey || n8nConfig.apiKey || '');
      const workflowId = context.replaceVariables(data.workflowId || data.workflowName || n8nConfig.workflowId || '');
      const instanceUrl = context.replaceVariables(data.instanceUrl || n8nConfig.instanceUrl || '');



      if (!webhookUrl && !workflowId) {
        throw new Error('n8n configuration missing: webhookUrl or workflowId required');
      }

      let apiUrl = '';
      let method = 'POST';
      let body: any = {};
      let headers: any = {
        'Content-Type': 'application/json'
      };

      switch (operation) {
        case 'webhook_trigger':
          if (!webhookUrl) {
            throw new Error('Webhook URL is required for webhook_trigger operation');
          }
          apiUrl = webhookUrl;
          body = this.replaceVariablesInObject(data.payload || {}, context);

          if (Object.keys(body).length === 0) {
            body = {
              message: context.getVariable('message.content') || '',
              contact: {
                id: context.getVariable('contact.id'),
                name: context.getVariable('contact.name'),
                phone: context.getVariable('contact.phone')
              },
              timestamp: new Date().toISOString()
            };
          }
          break;

        case 'execute_workflow':
          if (!workflowId || !instanceUrl) {
            throw new Error('Workflow ID and instance URL are required for execute_workflow operation');
          }
          apiUrl = `${instanceUrl}/api/v1/workflows/${workflowId}/run`;
          if (apiKey) {
            headers['X-N8N-API-KEY'] = apiKey;
          }
          body = this.replaceVariablesInObject(data.inputData || {}, context);

          if (Object.keys(body).length === 0) {
            body = {
              message: context.getVariable('message.content') || '',
              contact: {
                id: context.getVariable('contact.id'),
                name: context.getVariable('contact.name'),
                phone: context.getVariable('contact.phone')
              },
              timestamp: new Date().toISOString(),
              source: 'PowerChatPlus_Flow'
            };
          }
          break;

        case 'get_workflow_status':
          if (!workflowId || !instanceUrl) {
            throw new Error('Workflow ID and instance URL are required for get_workflow_status operation');
          }
          const executionId = context.getVariable('n8n.execution.id') || data.executionId;
          if (!executionId) {
            throw new Error('Execution ID is required for get_workflow_status operation');
          }
          apiUrl = `${instanceUrl}/api/v1/executions/${executionId}`;
          method = 'GET';
          if (apiKey) {
            headers['X-N8N-API-KEY'] = apiKey;
          }
          break;

        case 'get_workflows':
          if (!instanceUrl) {
            throw new Error('Instance URL is required for get_workflows operation');
          }
          apiUrl = `${instanceUrl}/api/v1/workflows`;
          method = 'GET';
          if (apiKey) {
            headers['X-N8N-API-KEY'] = apiKey;
          }
          break;

        default:
          throw new Error(`Unsupported n8n operation: ${operation}`);
      }



      let response;
      try {
        response = await axios({
          method,
          url: apiUrl,
          headers,
          data: method !== 'GET' ? body : undefined,
          timeout: 30000
        });
      } catch (firstError: any) {
        if (operation === 'execute_workflow' && firstError.response?.status === 404) {


          try {
            const listResponse = await axios.get(`${instanceUrl}/api/v1/workflows`, {
              headers: {
                'X-N8N-API-KEY': apiKey,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });

            const workflows = listResponse.data?.data || [];


            let matchingWorkflow = workflows.find((w: any) =>
              w.id === workflowId ||
              w.name === workflowId ||
              w.id?.toString() === workflowId
            );

            if (matchingWorkflow && matchingWorkflow.id === workflowId) {


              if (!matchingWorkflow.active) {
                ;
                const activeWorkflows = workflows.filter((w: any) => w.active);


                if (activeWorkflows.length > 0) {
                  matchingWorkflow = activeWorkflows[0];

                }
              }
            }

            if (matchingWorkflow) {


              let executionSuccess = false;

              const hasChatTrigger = matchingWorkflow.nodes?.some((node: any) =>
                node.type === '@n8n/n8n-nodes-langchain.chatTrigger'
              );

              if (hasChatTrigger) {
                const chatTriggerNode = matchingWorkflow.nodes.find((node: any) =>
                  node.type === '@n8n/n8n-nodes-langchain.chatTrigger'
                );

                if (chatTriggerNode?.webhookId) {
                  if (!matchingWorkflow.active) {
                    try {
                      await axios({
                        method: 'POST',
                        url: `${instanceUrl}/api/v1/workflows/${matchingWorkflow.id}/activate`,
                        headers,
                        timeout: 30000
                      });
                    } catch (activationError: any) {
                    }
                  }

                  try {
                    const userMessage = context.getVariable('message.content') || 'Hello';

                    const sessionId = `conv_${_conversation.id}_contact_${_contact.id}`;



                    const chatBodyFormats = [
                      { chatInput: userMessage, sessionId: sessionId },
                      { input: userMessage, sessionId: sessionId },
                      { message: userMessage, sessionId: sessionId },
                      { text: userMessage, sessionId: sessionId },
                      userMessage,
                      { query: userMessage }
                    ];

                    let webhookSuccess = false;

                    for (const chatBody of chatBodyFormats) {
                      try {
                        const webhookUrl = `${instanceUrl}/webhook/${chatTriggerNode.webhookId}`;


                        response = await axios({
                          method: 'POST',
                          url: webhookUrl,
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          data: chatBody,
                          timeout: 30000
                        });

                        executionSuccess = true;
                        webhookSuccess = true;
                        break;
                      } catch (webhookError: any) {
                      }
                    }

                    if (!webhookSuccess) {
                      for (const chatBody of chatBodyFormats) {
                        try {
                          const testWebhookUrl = `${instanceUrl}/webhook-test/${chatTriggerNode.webhookId}`;

                          response = await axios({
                            method: 'POST',
                            url: testWebhookUrl,
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            data: chatBody,
                            timeout: 30000
                          });

                          executionSuccess = true;
                          webhookSuccess = true;
                          break;
                        } catch (testWebhookError: any) {
                        }
                      }
                    }

                  } catch (error: any) {
                  }
                }
              }

              if (!executionSuccess) {
                const endpoints = [
                  `/api/v1/workflows/${matchingWorkflow.id}/run`,
                  `/api/v1/workflows/${matchingWorkflow.id}/execute`,
                  `/webhook/${matchingWorkflow.id}`
                ];
              for (const endpoint of endpoints) {
                try {
                  const retryUrl = `${instanceUrl}${endpoint}`;
                  response = await axios({
                    method: 'POST',
                    url: retryUrl,
                    headers,
                    data: body,
                    timeout: 30000
                  });

                  executionSuccess = true;
                  break;
                } catch (endpointError: any) {
                }
              }

              if (!executionSuccess) {
                throw firstError;
              }
            }
            } else {
              throw firstError;
            }
          } catch (listError: any) {

            throw firstError;
          }
        } else {
          throw firstError;
        }
      }

      let processedData = response?.data;

      if (response?.data) {

        let aiResponse = null;

        if (typeof response.data === 'string') {
          aiResponse = response.data;
        } else if (response.data.output) {
          aiResponse = response.data.output;
        } else if (response.data.text) {
          aiResponse = response.data.text;
        } else if (response.data.response) {
          aiResponse = response.data.response;
        } else if (response.data.message) {
          aiResponse = response.data.message;
        } else if (response.data.chatResponse) {
          aiResponse = response.data.chatResponse;
        } else if (response.data.data) {
          if (typeof response.data.data === 'string') {
            aiResponse = response.data.data;
          } else if (Array.isArray(response.data.data) && response.data.data.length > 0) {
            const firstItem = response.data.data[0];
            if (firstItem.output) {
              aiResponse = firstItem.output;
            } else if (firstItem.text) {
              aiResponse = firstItem.text;
            } else if (firstItem.response) {
              aiResponse = firstItem.response;
            } else if (firstItem.message) {
              aiResponse = firstItem.message;
            } else if (firstItem.chatResponse) {
              aiResponse = firstItem.chatResponse;
            } else if (typeof firstItem === 'string') {
              aiResponse = firstItem;
            }
          } else if (response.data.data.output) {
            aiResponse = response.data.data.output;
          } else if (response.data.data.text) {
            aiResponse = response.data.data.text;
          } else if (response.data.data.response) {
            aiResponse = response.data.data.response;
          } else if (response.data.data.message) {
            aiResponse = response.data.data.message;
          } else if (response.data.data.chatResponse) {
            aiResponse = response.data.data.chatResponse;
          }
        }

        if (!aiResponse && response.data.id && response.data.name && response.data.active) {
          aiResponse = null;
        }

        if (aiResponse && aiResponse.trim()) {
          processedData = { message: aiResponse, aiResponse: aiResponse };

          try {

            try {
              await this.sendMessageThroughChannel(
                _channelConnection,
                _contact,
                aiResponse,
                _conversation,
                true
              );

              const recentMessages = await storage.getMessagesByConversationPaginated(_conversation.id, 1, 0);
              if (recentMessages.length > 0) {
                const savedMessage = recentMessages[0];
                const existingMetadata = savedMessage.metadata
                  ? (typeof savedMessage.metadata === 'string'
                     ? JSON.parse(savedMessage.metadata)
                     : savedMessage.metadata)
                  : {};
                const updatedMetadata = {
                  ...existingMetadata,
                  source: 'n8n_ai_agent',
                  nodeId: node.id,
                  workflowName: data.workflowName || 'Unknown',
                  n8nWorkflowId: data.workflowId,
                  n8nWebhookUrl: data.chatWebhookUrl
                };

                await storage.updateMessage(savedMessage.id, {
                  metadata: JSON.stringify(updatedMetadata)
                });
              }

            } catch (error) {
              console.error('Error sending n8n AI response via channel:', error);

              const insertMessage = {
                conversationId: _conversation.id,
                contactId: _contact.id,
                content: aiResponse,
                messageType: 'text' as const,
                direction: 'outbound' as const,
                status: 'failed' as const,
                timestamp: new Date(),
                metadata: {
                  source: 'n8n_ai_agent',
                  nodeId: node.id,
                  workflowName: data.workflowName || 'Unknown',
                  error: 'Failed to send via channel'
                }
              };

              await storage.createMessage(insertMessage);
            }
          } catch (error) {
            console.error('Error processing n8n AI response:', error);
          }
        } else {
          processedData = response.data;
        }
      }

      context.setVariable('n8n.response', processedData);
      context.setVariable('n8n.status', response?.status);
      context.setVariable('n8n.lastExecution', new Date().toISOString());

      if (response?.data) {
        switch (operation) {
          case 'webhook_trigger':
            if (response.data.data) {
              context.setVariable('n8n.webhook.data', response.data.data);
            }
            if (response.data.executionId) {
              context.setVariable('n8n.execution.id', response.data.executionId);
            }
            break;

          case 'execute_workflow':
            if (response.data.data) {
              context.setVariable('n8n.workflow.result', response.data.data);
            }
            if (response.data.executionId) {
              context.setVariable('n8n.execution.id', response.data.executionId);
            }
            break;

          case 'get_workflow_status':
            context.setVariable('n8n.execution.status', response.data.finished ? 'completed' : 'running');
            if (response.data.data) {
              context.setVariable('n8n.execution.data', response.data.data);
            }
            break;

          case 'get_workflows':
            if (Array.isArray(response.data.data)) {
              context.setVariable('n8n.workflows', response.data.data);
            }
            break;
        }
      }


    } catch (error: any) {
      console.error('Error executing n8n node with context:', error);

      if (error.response) {
        console.error('N8n API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url
        });
      }

      context.setVariable('n8n.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Convert relative media URL to full absolute URL
   */
  private convertToFullMediaUrl(mediaUrl: string): string {
    if (!mediaUrl) return '';

    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      return mediaUrl;
    }

    let baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

    if (!baseUrl) {
      const basePort = process.env.PORT || '9000';
      const host = process.env.HOST || 'localhost';

      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

      let port = basePort;
      if (process.env.NODE_ENV === 'development') {
        port = basePort;
      }

      if (host === 'localhost' || host === '127.0.0.1') {
        baseUrl = `${protocol}://${host}:${port}`;
      } else {
        baseUrl = `${protocol}://${host}`;
      }
    }

    const normalizedMediaUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;

    const fullUrl = `${baseUrl.replace(/\/$/, '')}${normalizedMediaUrl}`;


    return fullUrl;
  }

  /**
   * Build N8n message payload with multimedia support
   */
  private buildN8nMessagePayload(
    userMessage: string,
    messageType: string,
    mediaUrl: string | null,
    sessionId: string,
    nodeData: any,
    context: FlowExecutionContext
  ): any {
    const basePayload = {
      chatInput: userMessage,
      sessionId: sessionId
    };

    if (!nodeData.enableMediaSupport) {
      return basePayload;
    }

    const enhancedPayload: any = {
      ...basePayload,
      messageType: messageType,
      isMediaMessage: messageType !== 'text' && !!mediaUrl,

      message: {
        content: userMessage,
        type: messageType,
        timestamp: new Date().toISOString()
      },

      contact: {
        id: context.getVariable('contact.id'),
        name: context.getVariable('contact.name'),
        phone: context.getVariable('contact.phone'),
        email: context.getVariable('contact.email')
      },

      conversation: {
        id: context.getVariable('conversation.id'),
        channelType: context.getVariable('conversation.channelType')
      }
    };

    if (mediaUrl && messageType !== 'text') {
      const fullMediaUrl = this.convertToFullMediaUrl(mediaUrl);

      enhancedPayload.media = {
        url: fullMediaUrl,
        type: messageType
      };



      if (nodeData.includeFileMetadata) {
        const metadata = context.getVariable('message.metadata');
        if (metadata) {
          try {
            const parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            enhancedPayload.media.metadata = {
              filename: parsedMetadata.filename,
              mimeType: parsedMetadata.mimeType,
              fileSize: parsedMetadata.fileSize,
              originalName: parsedMetadata.originalName
            };
          } catch (error) {
            console.warn('Failed to parse message metadata for N8n node:', error);
          }
        }
      }

      const supportedTypes = nodeData.supportedMediaTypes || ['image', 'video', 'audio', 'document'];
      if (!supportedTypes.includes(messageType)) {
        console.warn(`Media type ${messageType} not supported by N8n node. Supported types: ${supportedTypes.join(', ')}`);
        enhancedPayload.media.unsupported = true;
        enhancedPayload.media.supportedTypes = supportedTypes;
      }
    }


    return enhancedPayload;
  }

  /**
   * Process N8n response with multimedia support
   */
  private processN8nResponse(responseData: any, nodeData: any): {
    text: string | null;
    media: Array<{
      type: string;
      url: string;
      caption?: string;
      filename?: string;
      metadata?: any;
    }>;
  } {
    const result = {
      text: null as string | null,
      media: [] as Array<{
        type: string;
        url: string;
        caption?: string;
        filename?: string;
        metadata?: any;
      }>
    };

    if (typeof responseData === 'string') {
      result.text = responseData;
    } else if (responseData.output) {
      result.text = responseData.output;
    } else if (responseData.text) {
      result.text = responseData.text;
    } else if (responseData.response) {
      result.text = responseData.response;
    } else if (responseData.message) {
      result.text = responseData.message;
    } else if (responseData.chatResponse) {
      result.text = responseData.chatResponse;
    }

    if (nodeData.enableMediaSupport && responseData.media) {
      if (Array.isArray(responseData.media)) {
        result.media = responseData.media
          .filter((item: any) => item.url && item.type)
          .map((item: any) => ({
            type: this.normalizeMediaType(item.type),
            url: item.url,
            caption: item.caption || item.text || '',
            filename: item.filename || item.name,
            metadata: item.metadata
          }));
      } else if (responseData.media.url && responseData.media.type) {
        result.media.push({
          type: this.normalizeMediaType(responseData.media.type),
          url: responseData.media.url,
          caption: responseData.media.caption || responseData.media.text || '',
          filename: responseData.media.filename || responseData.media.name,
          metadata: responseData.media.metadata
        });
      }
    }

    if (nodeData.enableMediaSupport) {
      ['image', 'video', 'audio', 'document'].forEach(mediaType => {
        if (responseData[mediaType]) {
          const mediaItem = responseData[mediaType];
          if (typeof mediaItem === 'string') {
            result.media.push({
              type: mediaType,
              url: mediaItem,
              caption: responseData[`${mediaType}Caption`] || ''
            });
          } else if (mediaItem.url) {
            result.media.push({
              type: mediaType,
              url: mediaItem.url,
              caption: mediaItem.caption || responseData[`${mediaType}Caption`] || '',
              filename: mediaItem.filename,
              metadata: mediaItem.metadata
            });
          }
        }
      });

      if (responseData.attachments && Array.isArray(responseData.attachments)) {
        responseData.attachments.forEach((attachment: any) => {
          if (attachment.url) {
            result.media.push({
              type: this.detectMediaTypeFromUrl(attachment.url) || 'document',
              url: attachment.url,
              caption: attachment.caption || attachment.description || '',
              filename: attachment.filename || attachment.name,
              metadata: attachment.metadata
            });
          }
        });
      }
    }

    return result;
  }

  /**
   * Execute Make.com node with execution context
   */
  private async executeMakeNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    _conversation: Conversation,
    _contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const operation = data.operation || 'execute_scenario';

      if (data.webhookUrl && data.webhookUrl.trim()) {
        const userMessage = context.getVariable('message.content') || 'Hello';
        const messageType = context.getVariable('message.type') || 'text';
        const messageObject = context.getVariable('message') || {};
        const mediaUrl = context.getVariable('message.mediaUrl') || context.getVariable('message.media_url') || messageObject.mediaUrl;

        const sessionId = `conv_${_conversation.id}_contact_${_contact.id}`;

        const chatBody = this.buildMakeMessagePayload(
          userMessage,
          messageType,
          mediaUrl,
          sessionId,
          data,
          context
        );

        try {
          const response = await axios({
            method: 'POST',
            url: data.webhookUrl.trim(),
            headers: {
              'Content-Type': 'application/json'
            },
            data: chatBody,
            timeout: (data.timeout || 30) * 1000
          });

          if (response?.data) {
            const processedResponse = this.processMakeResponse(response.data, data);

            if (processedResponse.text && processedResponse.text.trim()) {
              let formattedText = processedResponse.text;
              if ((_channelConnection.channelType === 'whatsapp' || _channelConnection.channelType === 'whatsapp_unofficial' || _channelConnection.channelType === 'whatsapp_official')) {
                formattedText = this.formatResponseForWhatsApp(processedResponse.text);
              }

              try {

                try {
                  await this.sendMessageThroughChannel(
                    _channelConnection,
                    _contact,
                    formattedText,
                    _conversation,
                    true
                  );

                  if (processedResponse.media && processedResponse.media.length > 0) {
                    await this.sendMakeMediaResponses(
                      processedResponse.media,
                      _channelConnection,
                      _contact,
                      _conversation,
                      node.id,
                      data.webhookUrl
                    );
                  }

                  const recentMessages = await storage.getMessagesByConversationPaginated(_conversation.id, 1, 0);
                  if (recentMessages.length > 0) {
                    const savedMessage = recentMessages[0];
                    const existingMetadata = savedMessage.metadata
                      ? (typeof savedMessage.metadata === 'string'
                         ? JSON.parse(savedMessage.metadata)
                         : savedMessage.metadata)
                      : {};
                    const updatedMetadata = {
                      ...existingMetadata,
                      source: 'make_webhook',
                      nodeId: node.id,
                      webhookUrl: data.webhookUrl,
                      hasMediaResponse: processedResponse.media && processedResponse.media.length > 0
                    };

                    await storage.updateMessage(savedMessage.id, {
                      metadata: JSON.stringify(updatedMetadata)
                    });
                  }

                } catch (error) {
                  console.error('Error sending Make.com webhook response via channel:', error);

                  const insertMessage = {
                    conversationId: _conversation.id,
                    contactId: _contact.id,
                    content: formattedText,
                    messageType: 'text' as const,
                    direction: 'outbound' as const,
                    status: 'failed' as const,
                    timestamp: new Date(),
                    metadata: {
                      source: 'make_webhook',
                      nodeId: node.id,
                      webhookUrl: data.webhookUrl,
                      error: 'Failed to send via channel'
                    }
                  };

                  await storage.createMessage(insertMessage);
                }
              } catch (error) {
                console.error('Error processing Make.com webhook response:', error);
              }
            }
          }
        } catch (error) {
          console.error('Error calling Make.com webhook:', error);
        }
      }
      else if (data.apiToken && (data.scenarioId || data.scenarioName)) {
        const userMessage = context.getVariable('message.content') || 'Hello';
        const messageType = context.getVariable('message.type') || 'text';
        const messageObject = context.getVariable('message') || {};
        const mediaUrl = context.getVariable('message.mediaUrl') || context.getVariable('message.media_url') || messageObject.mediaUrl;

        const sessionId = `conv_${_conversation.id}_contact_${_contact.id}`;

        const scenarioBody = this.buildMakeMessagePayload(
          userMessage,
          messageType,
          mediaUrl,
          sessionId,
          data,
          context
        );

        try {
          const targetScenarioId = data.scenarioId || data.scenarioName;


          const validRegions = ['eu1', 'eu2', 'us1', 'us2'];
          const makeRegion = validRegions.includes(data.region) ? data.region : 'eu2';
          const baseUrl = `https://${makeRegion}.make.com/api/v2`;

          const response = await axios({
            method: 'POST',
            url: `${baseUrl}/scenarios/${targetScenarioId}/run`,
            headers: {
              'Authorization': `Token ${data.apiToken}`,
              'Content-Type': 'application/json'
            },
            data: scenarioBody,
            timeout: (data.timeout || 30) * 1000
          });



          const insertMessage = {
            conversationId: _conversation.id,
            contactId: _contact.id,
            content: `Make.com scenario executed: ${data.scenarioName || data.scenarioId}`,
            messageType: 'text' as const,
            direction: 'outbound' as const,
            status: 'sent' as const,
            timestamp: new Date(),
            metadata: {
              source: 'make_api',
              nodeId: node.id,
              scenarioId: targetScenarioId,
              executionId: response.data?.executionId || response.data?.id
            }
          };

          await storage.createMessage(insertMessage);

        } catch (error: any) {
          console.error('Error executing Make.com scenario via API:', error);


          if (error.response?.data) {
            console.error('Make.com API Error Details:', JSON.stringify(error.response.data, null, 2));
          }


          console.error('Payload sent to Make.com:', JSON.stringify(scenarioBody, null, 2));
        }
      }

    } catch (error) {
      console.error('Error in executeMakeNodeWithContext:', error);
    }
  }

  /**
   * Build Make.com message payload with multimedia support
   */
  private buildMakeMessagePayload(
    userMessage: string,
    messageType: string,
    mediaUrl: string | null,
    sessionId: string,
    nodeData: any,
    context: FlowExecutionContext
  ): any {

    if (nodeData.customParameters && Object.keys(nodeData.customParameters).length > 0) {

      const customPayload: any = {};

      for (const [key, value] of Object.entries(nodeData.customParameters)) {
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {

          const variableName = value.slice(2, -2);
          customPayload[key] = this.resolveVariable(variableName, userMessage, context);
        } else {
          customPayload[key] = value;
        }
      }

      return customPayload;
    }


    if (nodeData.emptyPayload) {
      return {};
    }


    const basePayload: any = {

      message: userMessage,
      messageType: messageType,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),


      contact: {
        name: context.getVariable('contact.name') || 'Unknown',
        phone: context.getVariable('contact.phone'),
        email: context.getVariable('contact.email') || ''
      },


      variables: {
        'contact.name': context.getVariable('contact.name'),
        'contact.phone': context.getVariable('contact.phone'),
        'contact.email': context.getVariable('contact.email'),
        'message.content': userMessage,
        'message.type': messageType,
        'conversation.id': context.getVariable('conversation.id'),
        'timestamp': new Date().toISOString()
      }
    };


    if (mediaUrl && nodeData.enableMediaSupport) {
      const fullMediaUrl = this.convertToFullMediaUrl(mediaUrl);
      basePayload.mediaUrl = fullMediaUrl;
      basePayload.hasMedia = true;


      basePayload.variables['message.mediaUrl'] = fullMediaUrl;
      basePayload.variables['message.hasMedia'] = true;
    }

    return basePayload;
  }

  private resolveVariable(variableName: string, userMessage: string, context: FlowExecutionContext): any {

    switch (variableName) {
      case 'message':
      case 'message.content':
        return userMessage;
      case 'timestamp':
        return new Date().toISOString();
      case 'sessionId':
        return context.getVariable('session.id') || 'unknown';
      default:
        return context.getVariable(variableName) || '';
    }
  }

  /**
   * Process Make.com response with multimedia support
   */
  private processMakeResponse(responseData: any, nodeData: any): {
    text: string | null;
    media: Array<{
      type: string;
      url: string;
      caption?: string;
      filename?: string;
      metadata?: any;
    }>;
  } {
    const result = {
      text: null as string | null,
      media: [] as Array<{
        type: string;
        url: string;
        caption?: string;
        filename?: string;
        metadata?: any;
      }>
    };

    if (typeof responseData === 'string') {
      result.text = responseData;
    } else if (responseData.output) {
      result.text = responseData.output;
    } else if (responseData.text) {
      result.text = responseData.text;
    } else if (responseData.response) {
      result.text = responseData.response;
    } else if (responseData.message) {
      result.text = responseData.message;
    } else if (responseData.content) {
      result.text = responseData.content;
    } else if (responseData.result) {
      result.text = responseData.result;
    }

    if (nodeData.enableMediaSupport && responseData.media) {
      if (Array.isArray(responseData.media)) {
        result.media = responseData.media
          .filter((item: any) => item.url && item.type)
          .map((item: any) => ({
            type: this.normalizeMediaType(item.type),
            url: item.url,
            caption: item.caption || item.text || '',
            filename: item.filename || item.name,
            metadata: item.metadata
          }));
      } else if (responseData.media.url && responseData.media.type) {
        result.media.push({
          type: this.normalizeMediaType(responseData.media.type),
          url: responseData.media.url,
          caption: responseData.media.caption || responseData.media.text || '',
          filename: responseData.media.filename || responseData.media.name,
          metadata: responseData.media.metadata
        });
      }
    }

    if (nodeData.enableMediaSupport) {
      ['image', 'video', 'audio', 'document'].forEach(mediaType => {
        if (responseData[mediaType]) {
          const mediaItem = responseData[mediaType];
          if (typeof mediaItem === 'string') {
            result.media.push({
              type: mediaType,
              url: mediaItem,
              caption: responseData[`${mediaType}Caption`] || ''
            });
          } else if (mediaItem.url) {
            result.media.push({
              type: mediaType,
              url: mediaItem.url,
              caption: mediaItem.caption || responseData[`${mediaType}Caption`] || '',
              filename: mediaItem.filename,
              metadata: mediaItem.metadata
            });
          }
        }
      });

      if (responseData.attachments && Array.isArray(responseData.attachments)) {
        responseData.attachments.forEach((attachment: any) => {
          if (attachment.url) {
            result.media.push({
              type: this.detectMediaTypeFromUrl(attachment.url) || 'document',
              url: attachment.url,
              caption: attachment.caption || attachment.description || '',
              filename: attachment.filename || attachment.name,
              metadata: attachment.metadata
            });
          }
        });
      }
    }

    return result;
  }

  /**
   * Send Make.com media responses
   */
  private async sendMakeMediaResponses(
    mediaItems: Array<{
      type: string;
      url: string;
      caption?: string;
      filename?: string;
      metadata?: any;
    }>,
    channelConnection: ChannelConnection,
    contact: Contact,
    conversation: Conversation,
    nodeId: string,
    webhookUrl: string
  ): Promise<void> {
    for (const mediaItem of mediaItems) {
      try {
        if (channelConnection.channelType === 'whatsapp' || channelConnection.channelType === 'whatsapp_unofficial') {
          const normalizedMediaType = this.normalizeMediaType(mediaItem.type);
          if (channelConnection.channelType === 'whatsapp_unofficial') {
            await whatsAppService.sendMediaMessage(
              channelConnection.id,
              channelConnection.userId,
              contact.identifier!,
              normalizedMediaType as 'image' | 'video' | 'audio' | 'document',
              mediaItem.url,
              mediaItem.caption || '',
              mediaItem.filename || ''
            );
          } else {
            await whatsAppService.sendWhatsAppMediaMessage(
              channelConnection.id,
              channelConnection.userId,
              contact.identifier!,
              normalizedMediaType as 'image' | 'video' | 'audio' | 'document',
              mediaItem.url,
              mediaItem.caption || '',
              mediaItem.filename || '',
              true,
              conversation.id
            );
          }
        } else {
          const insertMessage = {
            conversationId: conversation.id,
            contactId: contact.id,
            content: mediaItem.caption || `Media: ${mediaItem.filename || 'file'}`,
            messageType: mediaItem.type as any,
            direction: 'outbound' as const,
            status: 'sent' as const,
            timestamp: new Date(),
            mediaUrl: mediaItem.url,
            metadata: {
              source: 'make_media_response',
              nodeId: nodeId,
              webhookUrl: webhookUrl,
              filename: mediaItem.filename,
              originalMetadata: mediaItem.metadata
            }
          };

          await storage.createMessage(insertMessage);
        }
      } catch (error) {
        console.error('Error sending Make.com media response:', error);
      }
    }
  }



  /**
   * Send media responses from N8n
   */
  private async sendN8nMediaResponses(
    mediaItems: Array<{
      type: string;
      url: string;
      caption?: string;
      filename?: string;
      metadata?: any;
    }>,
    channelConnection: ChannelConnection,
    contact: Contact,
    conversation: Conversation,
    nodeId: string,
    webhookUrl: string
  ): Promise<void> {
    for (const mediaItem of mediaItems) {
      try {
        if (channelConnection.channelType === 'whatsapp_unofficial') {
          await whatsAppService.sendMedia(
            channelConnection.id,
            channelConnection.userId,
            contact.identifier || contact.phone || '',
            mediaItem.type as 'image' | 'video' | 'audio' | 'document',
            mediaItem.url,
            mediaItem.caption || '',
            mediaItem.filename || '',
            false,
            conversation.id
          );
        } else if (channelConnection.channelType === 'whatsapp') {
          await whatsAppService.sendWhatsAppMediaMessage(
            channelConnection.id,
            channelConnection.userId,
            contact.identifier || contact.phone || '',
            mediaItem.type as 'image' | 'video' | 'audio' | 'document',
            mediaItem.url,
            mediaItem.caption || '',
            mediaItem.filename || '',
            false,
            conversation.id
          );
        }

        const recentMessages = await storage.getMessagesByConversationPaginated(conversation.id, 1, 0);
        if (recentMessages.length > 0) {
          const savedMessage = recentMessages[0];
          const existingMetadata = savedMessage.metadata
            ? (typeof savedMessage.metadata === 'string'
               ? JSON.parse(savedMessage.metadata)
               : savedMessage.metadata)
            : {};
          const updatedMetadata = {
            ...existingMetadata,
            source: 'n8n_media_response',
            nodeId: nodeId,
            webhookUrl: webhookUrl,
            mediaType: mediaItem.type,
            originalUrl: mediaItem.url
          };

          await storage.updateMessage(savedMessage.id, {
            metadata: JSON.stringify(updatedMetadata)
          });
        }
      } catch (error) {
        console.error(`Error sending N8n media response (${mediaItem.type}):`, error);

        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          content: `[${mediaItem.type.toUpperCase()}] ${mediaItem.caption || 'Media file'}`,
          type: mediaItem.type,
          direction: 'outbound' as const,
          status: 'failed' as const,
          mediaUrl: mediaItem.url,
          timestamp: new Date(),
          metadata: JSON.stringify({
            source: 'n8n_media_response',
            nodeId: nodeId,
            webhookUrl: webhookUrl,
            error: 'Failed to send media response',
            originalUrl: mediaItem.url
          })
        };

        await storage.createMessage(insertMessage);
      }
    }
  }

  /**
   * Normalize media type to standard format
   */
  private normalizeMediaType(type: string): string {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('image') || lowerType.includes('photo') || lowerType.includes('picture')) {
      return 'image';
    }
    if (lowerType.includes('video') || lowerType.includes('movie') || lowerType.includes('clip')) {
      return 'video';
    }
    if (lowerType.includes('audio') || lowerType.includes('voice') || lowerType.includes('sound')) {
      return 'audio';
    }
    return 'document';
  }

  /**
   * Detect media type from URL
   */
  private detectMediaTypeFromUrl(url: string): string | null {
    const extension = url.split('.').pop()?.toLowerCase();
    if (!extension) return null;

    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
    const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', '3gp'];
    const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

    if (imageExtensions.includes(extension)) return 'image';
    if (videoExtensions.includes(extension)) return 'video';
    if (audioExtensions.includes(extension)) return 'audio';
    return 'document';
  }

  /**
   * Execute a Google Calendar Event node to create a calendar event
   */
  async executeGoogleCalendarEventNode(
    node: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};

      const eventTitle = this.replaceVariables(data.eventTitle || 'New Event', message, contact);
      const eventDescription = this.replaceVariables(data.eventDescription || '', message, contact);
      const eventLocation = this.replaceVariables(data.eventLocation || '', message, contact);

      let startDateTime = data.startDateTime;
      let endDateTime = data.endDateTime;
      let duration = data.duration || 30;

      if (typeof startDateTime === 'string') {
        startDateTime = new Date(startDateTime);
      }

      if (!endDateTime && startDateTime && duration) {
        endDateTime = new Date(startDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(duration));
      }

      const startDateTimeISO = startDateTime instanceof Date ? startDateTime.toISOString() : startDateTime;
      const endDateTimeISO = endDateTime instanceof Date ? endDateTime.toISOString() : endDateTime;

      const attendees: string[] = [];
      if (contact.email) {
        attendees.push(contact.email);
      }

      const eventData = {
        summary: eventTitle,
        description: eventDescription,
        location: eventLocation,
        start: {
          dateTime: startDateTimeISO,
          timeZone: data.timeZone || 'UTC',
        },
        end: {
          dateTime: endDateTimeISO,
          timeZone: data.timeZone || 'UTC',
        },
        attendees: attendees,
      };

      const userId = channelConnection.userId;
      const companyId = channelConnection.companyId || 1;

      const eventResult = await googleCalendarService.createCalendarEvent(userId, companyId, eventData);

      if (eventResult && eventResult.success && eventResult.eventId) {
        const confirmationMessage = `✅ Calendar event created!
Title: ${eventTitle}
Time: ${new Date(startDateTimeISO).toLocaleString()}
${eventResult.eventLink ? `\nView event: ${eventResult.eventLink}` : ''}`;



        try {
          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            confirmationMessage,
            conversation,
            true
          );
        } catch (channelError) {
          console.error('Error sending confirmation message:', channelError);
        }
      } else {

        let errorMessage = 'Lo siento, no pude crear el evento del calendario. Por favor intenta de nuevo.';
        
        if (eventResult.error && (eventResult.error.includes('not available') || eventResult.error.includes('conflict'))) {
          errorMessage = '⚠️ El horario solicitado ya está reservado. Por favor usa el verificador de disponibilidad para encontrar un horario abierto, o elige un horario diferente para tu cita.';
        }

        try {
          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            errorMessage,
            conversation,
            true
          );
        } catch (channelError) {
          console.error('Error sending error message:', channelError);
        }
      }
    } catch (error) {
    }
  }

  /**
   * Execute a Google Calendar Availability node to check calendar availability
   * and store the results for downstream nodes
   */
  async executeGoogleCalendarAvailabilityNode(
    node: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<any> {
    try {

      const data = node.data || {};

      const singleDate = data.date;
      const useDateRange = data.useDateRange || false;
      const startDate = data.startDate;
      const endDate = data.endDate;
      const durationMinutes = data.durationMinutes || 60;

      const userId = channelConnection.userId;
      const companyId = channelConnection.companyId || 1;


      const businessHours = data.calendarBusinessHours || { start: '09:00', end: '17:00' };
      const businessHoursStart = parseInt(businessHours.start.split(':')[0]) || 9;
      const businessHoursEnd = parseInt(businessHours.end.split(':')[0]) || 17;


      const timeZone = data.calendarTimeZone || 'UTC';
      const bufferMinutes = data.calendarBufferMinutes || 0;

      const availabilityResult = await googleCalendarService.getAvailableTimeSlots(
        userId,
        companyId,
        useDateRange ? undefined : singleDate,
        durationMinutes,
        useDateRange ? startDate : undefined,
        useDateRange ? endDate : undefined,
        businessHoursStart,
        businessHoursEnd,
        timeZone,
        bufferMinutes
      );

      if (!availabilityResult.success) {

        const availabilityData = {
          success: false,
          error: availabilityResult.error || 'Error al verificar la disponibilidad del calendario',
          events: [],
          timeSlots: []
        };

        await this.updateNodeData(node.id, { availabilityResults: availabilityData });

        const errorMessage = `📅 *Calendar Availability Check*\n\nSorry, I couldn't check the calendar availability: ${availabilityResult.error}`;

        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          channelType: channelConnection.channelType,
          type: 'text',
          content: errorMessage,
          direction: 'outbound',
          status: 'sent',
          mediaUrl: null,
          timestamp: new Date()
        };

        await storage.createMessage(insertMessage);

        if (channelConnection.channelType === 'whatsapp' && contact.identifier) {
          await whatsAppService.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            contact.identifier,
            errorMessage
          );
        }

        return;
      }

      const timeSlots = availabilityResult.timeSlots || [];

      let availabilityMessage = '📅 *Verificación de Disponibilidad del Calendario*\n\n';

      if (timeSlots.length === 0) {
        availabilityMessage += 'No se encontraron horarios disponibles en el calendario para el período especificado.';
      } else {
        if (useDateRange) {
          availabilityMessage += `Encontré horarios disponibles para una reunión de ${durationMinutes} minutos en ${timeSlots.length} día(s):\n\n`;

          for (let i = 0; i < Math.min(timeSlots.length, 3); i++) {
            const dateData = timeSlots[i];
            availabilityMessage += `*${dateData.date}*\n`;

            if (dateData.slots.length === 0) {
              availabilityMessage += `No hay horarios disponibles en este día.\n\n`;
            } else {
              for (let j = 0; j < Math.min(dateData.slots.length, 5); j++) {
                availabilityMessage += `⏰ ${dateData.slots[j]}\n`;
              }

              if (dateData.slots.length > 5) {
                availabilityMessage += `...y ${dateData.slots.length - 5} horarios más.\n`;
              }

              availabilityMessage += '\n';
            }
          }

          if (timeSlots.length > 3) {
            availabilityMessage += `...y ${timeSlots.length - 3} días más con horarios disponibles.\n`;
          }
        } else {
          const dateData = timeSlots[0];
          availabilityMessage += `Encontré ${dateData.slots.length} horarios disponibles para una reunión de ${durationMinutes} minutos el ${dateData.date}:\n\n`;

          for (let i = 0; i < Math.min(dateData.slots.length, 8); i++) {
            availabilityMessage += `⏰ ${dateData.slots[i]}\n`;
          }

          if (dateData.slots.length > 8) {
            availabilityMessage += `...y ${dateData.slots.length - 8} horarios más disponibles.\n`;
          }
        }
      }

      const availabilityData = {
        success: true,
        timeSlots: timeSlots,
        mode: useDateRange ? 'dateRange' : 'singleDate',
        date: singleDate,
        startDate: useDateRange ? startDate : null,
        endDate: useDateRange ? endDate : null,
        durationMinutes: durationMinutes
      };



      if (channelConnection.channelType === 'whatsapp' && contact.identifier) {
        await whatsAppService.sendMessage(
          channelConnection.id,
          channelConnection.userId,
          contact.identifier,
          availabilityMessage
        );
      }

      const formattedAvailability = availabilityMessage;

      await this.updateNodeData(node.id, {
        ...node.data,
        availabilityResults: availabilityData,
        formattedAvailability: formattedAvailability
      });


      const extendedMessage = message as Message & {
        flowContext?: {
          availabilityData?: string
        }
      };

      if (!extendedMessage.flowContext) {
        extendedMessage.flowContext = {};
      }

      extendedMessage.flowContext.availabilityData = formattedAvailability;


      return availabilityData;
    } catch (error: unknown) {
      const errorMessage = 'Lo siento, no pude verificar la disponibilidad del calendario. Por favor intenta de nuevo.';


      let errorDetail = 'Ocurrió un error desconocido';
      if (error instanceof Error) {
        errorDetail = error.message;
      } else if (typeof error === 'string') {
        errorDetail = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorDetail = String(error.message);
      }



      if (channelConnection.channelType === 'whatsapp' && contact.identifier) {
        await whatsAppService.sendMessage(
          channelConnection.id,
          channelConnection.userId,
          contact.identifier,
          errorMessage
        );
      }

      await this.updateNodeData(node.id, {
        ...node.data,
        availabilityResults: {
          success: false,
          error: errorDetail
        }
      });

      return {
        success: false,
        error: errorDetail
      };
    }
  }

  /**
   * Update the data of a node in the flow
   */
  private async updateNodeData(_nodeId: string, _newData: any): Promise<void> {
    try {
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error updating node data:', errorMessage);
    }
  }

  /**
   * Execute a node to update pipeline stage for a contact/deal
   */
  async executeUpdatePipelineStageNode(
    node: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const operation = data.operation || 'update_stage';
      const errorHandling = data.errorHandling || 'continue';


      try {

        const flowId = (conversation as any).flowId || null;

        switch (operation) {
          case 'create_stage':
            await this.executeCreateStageOperation(data, message, contact, channelConnection);
            break;
          case 'create_deal':
            await this.executeCreateDealOperation(data, message, conversation, contact, channelConnection, flowId);
            break;
          case 'update_deal':
            await this.executeUpdateDealOperation(data, message, contact, channelConnection, flowId);
            break;
          case 'manage_tags':
            await this.executeManageTagsOperation(data, message, contact, channelConnection);
            break;
          case 'update_stage':
          default:
            await this.executeUpdateStageOperation(data, message, contact, channelConnection, flowId);
            break;
        }

      } catch (operationError) {
        console.error(`[Pipeline Node] Operation ${operation} failed:`, operationError);

        if (errorHandling === 'stop') {
          throw operationError;
        }
      }
    } catch (error) {
      console.error(`[Pipeline Node] Critical error:`, error);
      throw error;
    }
  }

  /**
   * Execute create stage operation
   */
  private async executeCreateStageOperation(
    data: any,
    message: Message,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const stageName = this.replaceVariables(data.stageName || '', message, contact);
    const stageColor = data.stageColor || '#3a86ff';

    if (!stageName.trim()) {
      throw new Error('Stage name is required for create_stage operation');
    }

    const user = await storage.getUser(channelConnection.userId);
    if (!user?.companyId) {
      throw new Error('User must be associated with a company to create stages');
    }


    const defaultPipeline = await storage.getDefaultPipelineForCompany(user.companyId);
    if (!defaultPipeline) {
      throw new Error('No default pipeline found for company. Please create a pipeline first.');
    }

    const newStage = await storage.createPipelineStage({
      companyId: user.companyId,
      pipelineId: defaultPipeline.id,
      name: stageName,
      color: stageColor,
      order: 0
    });

    ;
  }

  /**
   * Execute create deal operation with duplicate prevention
   */
  private async executeCreateDealOperation(
    data: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    flowId?: number | null
  ): Promise<any> {
    const user = await storage.getUser(channelConnection.userId);
    if (!user?.companyId) {
      throw new Error('User must be associated with a company to create deals');
    }


    let pipelineId: number | null = null;
    if (data.pipelineId) {
      pipelineId = typeof data.pipelineId === 'string' ? parseInt(data.pipelineId) : data.pipelineId;
    } else if (data.stageId) {
      const stageId = typeof data.stageId === 'string' ? parseInt(data.stageId) : data.stageId;
      if (!isNaN(stageId)) {
        const stage = await storage.getPipelineStage(stageId);
        if (stage) {
          pipelineId = stage.pipelineId;
        }
      }
    }


    const existingActiveDeal = await storage.getActiveDealByContact(contact.id, user.companyId, pipelineId || undefined);

    if (existingActiveDeal) {



      const updates: any = {};
      let hasUpdates = false;

      const dealTitle = this.replaceVariables(data.dealTitle || `${contact.name} - New Deal`, message, contact);
      if (dealTitle && dealTitle !== existingActiveDeal.title) {
        updates.title = dealTitle;
        hasUpdates = true;
      }

      const dealValue = data.dealValue ? parseInt(this.replaceVariables(data.dealValue, message, contact)) : null;
      if (dealValue && dealValue !== existingActiveDeal.value) {
        updates.value = dealValue;
        hasUpdates = true;
      }

      const dealPriority = data.dealPriority || 'medium';
      if (dealPriority && dealPriority !== existingActiveDeal.priority) {
        updates.priority = dealPriority as 'low' | 'medium' | 'high';
        hasUpdates = true;
      }

      const dealDescription = this.replaceVariables(data.dealDescription || '', message, contact);
      if (dealDescription && dealDescription !== existingActiveDeal.description) {
        updates.description = dealDescription;
        hasUpdates = true;
      }

      const stageId = data.stageId ? parseInt(data.stageId) : null;
      if (stageId && stageId !== existingActiveDeal.stageId) {
        updates.stageId = stageId;
        hasUpdates = true;
      }

      if (data.tagsToAdd && data.tagsToAdd.length > 0) {
        const currentTags = existingActiveDeal.tags || [];
        const newTags = [...currentTags];
        let tagsChanged = false;

        for (const tag of data.tagsToAdd) {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
            tagsChanged = true;
          }
        }

        if (tagsChanged) {
          updates.tags = newTags;
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        const updatedDeal = await storage.updateDeal(existingActiveDeal.id, updates);

        await storage.createDealActivity({
          dealId: existingActiveDeal.id,
          userId: channelConnection.userId,
          type: 'update',
          content: `Deal "${updatedDeal.title}" updated via flow automation (prevented duplicate creation)`,
          metadata: {
            updatedBy: 'flow',
            flowNodeId: data.id,
            conversationId: conversation.id,
            preventedDuplicate: true,
            changes: updates
          }
        });


        return updatedDeal;
      } else {

        return existingActiveDeal;
      }
    }




    const dealTitle = this.replaceVariables(data.dealTitle || `${contact.name} - New Deal`, message, contact);
    const dealValue = data.dealValue ? parseInt(this.replaceVariables(data.dealValue, message, contact)) : null;
    const dealPriority = data.dealPriority || 'medium';
    const dealDescription = this.replaceVariables(data.dealDescription || '', message, contact);
    const stageId = data.stageId ? parseInt(data.stageId) : null;

    const dealData = {
      companyId: user.companyId,
      contactId: contact.id,
      pipelineId: data.pipelineId || null,
      title: dealTitle,
      value: dealValue,
      priority: dealPriority as 'low' | 'medium' | 'high',
      description: dealDescription,
      stageId: stageId,
      assignedToUserId: channelConnection.userId,
      tags: data.tagsToAdd || []
    };

    try {
      const newDeal = await storage.createDeal(dealData);

      await storage.createDealActivity({
        dealId: newDeal.id,
        userId: channelConnection.userId,
        type: 'create',
        content: `Deal "${newDeal.title}" created via flow automation`,
        metadata: {
          createdBy: 'flow',
          flowNodeId: data.id,
          conversationId: conversation.id
        }
      });


      if (newDeal.stageId && data.enableStageRevert && data.revertToStageId && data.revertTimeAmount && data.revertTimeUnit) {
        try {
          await this.scheduleStageRevert(
            newDeal.id,
            newDeal.stageId,
            parseInt(data.revertToStageId),
            data.revertTimeAmount,
            data.revertTimeUnit,
            data.revertOnlyIfNoActivity || false,
            flowId || null,
            data.id,
            user.companyId,
            contact.id
          );
        } catch (error) {
          console.error('Error scheduling stage revert for new deal:', error);
        }
      }

      return newDeal;
    } catch (error: any) {


      const isUniqueConstraintError = error.message && (
        error.message.includes('unique_active_contact_deal') ||
        error.message.includes('idx_unique_active_contact_deal_pipeline') ||
        error.code === '23505' // PostgreSQL unique violation error code
      );

      if (isUniqueConstraintError) {

        let pipelineId: number | null = null;
        if (data.pipelineId) {
          pipelineId = typeof data.pipelineId === 'string' ? parseInt(data.pipelineId) : data.pipelineId;
        } else if (data.stageId) {
          const stageId = typeof data.stageId === 'string' ? parseInt(data.stageId) : data.stageId;
          if (!isNaN(stageId)) {
            const stage = await storage.getPipelineStage(stageId);
            if (stage) {
              pipelineId = stage.pipelineId;
            }
          }
        }
        

        const raceConditionDeals = await storage.getDealsByContact(contact.id);
        const raceConditionActiveDeal = raceConditionDeals.find(deal =>
          deal.status === 'active' &&
          deal.companyId === user.companyId &&
          (pipelineId === null || deal.pipelineId === pipelineId)
        );

        if (raceConditionActiveDeal) {

          return raceConditionActiveDeal;
        }
      }

      console.error(`[Pipeline Node] Error creating deal for contact ${contact.id}:`, error);
      throw error;
    }
  }

  /**
   * Execute update deal operation
   */
  private async executeUpdateDealOperation(
    data: any,
    message: Message,
    contact: Contact,
    channelConnection: ChannelConnection,
    flowId?: number | null
  ): Promise<void> {
    const dealIdVar = data.dealIdVariable || '{{contact.phone}}';
    const dealId = this.replaceVariables(dealIdVar, message, contact);

    const user = await storage.getUser(channelConnection.userId);
    const companyId = user?.companyId || undefined;

    let deal = await this.findDealByIdOrContact(dealId, contact.id, companyId);

    if (!deal && data.createDealIfNotExists) {

      let pipelineId: number | null = null;
      if (data.pipelineId) {
        pipelineId = typeof data.pipelineId === 'string' ? parseInt(data.pipelineId) : data.pipelineId;
      } else if (data.stageId) {
        const stageId = typeof data.stageId === 'string' ? parseInt(data.stageId) : data.stageId;
        if (!isNaN(stageId)) {
          const stage = await storage.getPipelineStage(stageId);
          if (stage) {
            pipelineId = stage.pipelineId;
          }
        }
      }


      const existingActiveDeal = await storage.getActiveDealByContact(contact.id, companyId, pipelineId || undefined);

      if (existingActiveDeal) {

        deal = existingActiveDeal;
      } else {

        deal = await this.executeCreateDealOperation(data, message, { id: 0 } as any, contact, channelConnection);

      }
    }

    if (!deal) {
      throw new Error(`No deal found for ID/variable: ${dealId}`);
    }

    const updates: any = {};
    let hasUpdates = false;

    if (data.dealTitle) {
      updates.title = this.replaceVariables(data.dealTitle, message, contact);
      hasUpdates = true;
    }

    if (data.dealValue) {
      const value = parseInt(this.replaceVariables(data.dealValue, message, contact));
      if (!isNaN(value)) {
        updates.value = value;
        hasUpdates = true;
      }
    }

    if (data.dealPriority && data.dealPriority !== 'keep_current') {
      updates.priority = data.dealPriority;
      hasUpdates = true;
    }

    if (data.stageId && data.stageId !== 'keep_current') {
      const stageIdNum = parseInt(data.stageId);
      if (!isNaN(stageIdNum)) {
        updates.stageId = stageIdNum;
        hasUpdates = true;
      }
    }

    if (data.dealDescription) {
      updates.description = this.replaceVariables(data.dealDescription, message, contact);
      hasUpdates = true;
    }

    if (hasUpdates) {
      const previousStageId = deal.stageId;
      const previousPipelineId = deal.pipelineId;
      

      if (data.pipelineId && data.pipelineId !== deal.pipelineId) {
        updates.pipelineId = data.pipelineId;
        

        if (updates.stageId) {
          const validation = await this.validatePipelineStageCombo(
            data.pipelineId,
            updates.stageId,
            companyId!
          );
          if (!validation.valid) {
            throw new Error(validation.error);
          }
        } else {


          if (deal.stageId) {
            const currentStage = await storage.getPipelineStage(deal.stageId);
            if (currentStage && currentStage.pipelineId !== data.pipelineId) {

              const newPipelineStages = await storage.getPipelineStagesByPipeline(data.pipelineId);
              const defaultStage = newPipelineStages[0];
              if (defaultStage) {
                updates.stageId = defaultStage.id;

                const validation = await this.validatePipelineStageCombo(
                  data.pipelineId,
                  defaultStage.id,
                  companyId!
                );
                if (!validation.valid) {
                  throw new Error(validation.error);
                }
              } else {
                throw new Error(`No stages found for pipeline ${data.pipelineId}. Cannot move deal without a valid stage.`);
              }
            } else if (currentStage) {

              const validation = await this.validatePipelineStageCombo(
                data.pipelineId,
                deal.stageId,
                companyId!
              );
              if (!validation.valid) {
                throw new Error(validation.error);
              }
            }
          }
        }
        

        await storage.createDealActivity({
          dealId: deal.id,
          userId: channelConnection.userId,
          type: 'pipeline_change',
          content: `Deal moved from pipeline ${previousPipelineId} to ${data.pipelineId}`,
          metadata: {
            previousPipelineId,
            targetPipelineId: data.pipelineId,
            changedBy: 'flow',
            flowNodeId: data.id
          }
        });
      } else if (updates.stageId && companyId) {

        const validation = await this.validatePipelineStageCombo(
          deal.pipelineId,
          updates.stageId,
          companyId
        );
        if (!validation.valid) {
          throw new Error(validation.error);
        }
      }
      
      const updatedDeal = await storage.updateDeal(deal.id, updates);


      const pipelineChanged = previousPipelineId !== updatedDeal.pipelineId;
      const stageChanged = previousStageId !== updatedDeal.stageId;
      

      const conversations = await storage.getConversationsByContact(contact.id);
      const conversation = conversations[0] || null;
      
      if (pipelineChanged && conversation) {
        await this.emitPipelineTriggerEvent('deal_moves_between_pipelines', {
          dealId: deal.id,
          contactId: contact.id,
          pipelineId: updatedDeal.pipelineId,
          stageId: updatedDeal.stageId ?? undefined,
          previousPipelineId,
          previousStageId,
          triggeredBy: 'flow'
        }, conversation, contact, channelConnection);
      } else if (stageChanged && conversation) {
        await this.emitPipelineTriggerEvent('deal_stage_changed', {
          dealId: deal.id,
          contactId: contact.id,
          pipelineId: updatedDeal.pipelineId,
          stageId: updatedDeal.stageId ?? undefined,
          previousPipelineId,
          previousStageId,
          triggeredBy: 'flow'
        }, conversation, contact, channelConnection);
      }

      await storage.createDealActivity({
        dealId: deal.id,
        userId: channelConnection.userId,
        type: 'update',
        content: `Deal "${updatedDeal.title}" updated via flow automation`,
        metadata: {
          updatedBy: 'flow',
          flowNodeId: data.id,
          changes: updates
        }
      });


      if (updates.stageId && data.enableStageRevert && data.revertToStageId && data.revertTimeAmount && data.revertTimeUnit) {
        try {

          await this.cancelExistingReverts(deal.id);


          const user = await storage.getUser(channelConnection.userId);
          await this.scheduleStageRevert(
            deal.id,
            updates.stageId,
            parseInt(data.revertToStageId),
            data.revertTimeAmount,
            data.revertTimeUnit,
            data.revertOnlyIfNoActivity || false,
            flowId || null,
            data.id,
            user?.companyId || null,
            contact.id
          );
        } catch (error) {
          console.error('Error scheduling stage revert:', error);
        }
      }

      ;
    } else {
      ;
    }
  }

  /**
   * Execute manage tags operation
   * Updates contact tags first, which automatically syncs to all associated deals
   */
  private async executeManageTagsOperation(
    data: any,
    message: Message,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const dealIdVar = data.dealIdVariable || '{{contact.phone}}';
    const dealId = this.replaceVariables(dealIdVar, message, contact);

    const user = await storage.getUser(channelConnection.userId);
    const companyId = user?.companyId || undefined;


    const deal = await this.findDealByIdOrContact(dealId, contact.id, companyId);
    if (!deal) {
      throw new Error(`No deal found for ID/variable: ${dealId}`);
    }


    const currentContact = await storage.getContact(contact.id);
    if (!currentContact) {
      throw new Error(`Contact ${contact.id} not found`);
    }

    const currentTags = currentContact.tags || [];
    let newTags = [...currentTags];
    let hasChanges = false;


    if (data.tagsToAdd && data.tagsToAdd.length > 0) {
      for (const tag of data.tagsToAdd) {
        const processedTag = this.replaceVariables(tag, message, contact).trim();
        if (processedTag && !newTags.includes(processedTag)) {
          newTags.push(processedTag);
          hasChanges = true;
        }
      }
    }


    if (data.tagsToRemove && data.tagsToRemove.length > 0) {
      for (const tag of data.tagsToRemove) {
        const processedTag = this.replaceVariables(tag, message, contact).trim();
        const index = newTags.indexOf(processedTag);
        if (index > -1) {
          newTags.splice(index, 1);
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {

      const updatedContact = await storage.updateContact(contact.id, { tags: newTags });


      await storage.createDealActivity({
        dealId: deal.id,
        userId: channelConnection.userId,
        type: 'update',
        content: `Contact tags updated via flow automation (synced to all deals)`,
        metadata: {
          updatedBy: 'flow',
          flowNodeId: data.id,
          oldTags: currentTags,
          newTags: newTags,
          tagsAdded: data.tagsToAdd || [],
          tagsRemoved: data.tagsToRemove || [],
          syncedToDeals: true
        }
      });

      ;
    } else {
      ;
    }
  }

  /**
   * Helper method to schedule a stage revert
   */
  private async scheduleStageRevert(
    dealId: number,
    currentStageId: number,
    revertToStageId: number | null,
    timeAmount: number,
    timeUnit: 'hours' | 'days',
    onlyIfNoActivity: boolean,
    flowId: number | null,
    nodeId: string,
    companyId: number | null,
    contactId: number
  ): Promise<string | null> {
    if (!revertToStageId) {
      return null;
    }

    try {
      const scheduleId = randomUUID();
      const now = new Date();
      const scheduledFor = new Date(
        now.getTime() + (timeUnit === 'hours' ? timeAmount * 60 * 60 * 1000 : timeAmount * 24 * 60 * 60 * 1000)
      );

      await storage.createPipelineStageRevert({
        scheduleId,
        companyId: companyId || null,
        dealId,
        contactId,
        flowId: flowId || null,
        nodeId,
        currentStageId,
        revertToStageId,
        scheduledFor,
        revertTimeAmount: timeAmount,
        revertTimeUnit: timeUnit,
        onlyIfNoActivity,
        status: 'scheduled'
      });

      return scheduleId;
    } catch (error) {
      console.error('Error scheduling pipeline stage revert:', error);
      return null;
    }
  }

  /**
   * Helper method to cancel existing reverts for a deal
   */
  private async cancelExistingReverts(dealId: number): Promise<void> {
    try {
      const scheduledReverts = await storage.getScheduledPipelineStageReverts(1000);
      const dealReverts = scheduledReverts.filter((revert: any) => revert.dealId === dealId && revert.status === 'scheduled');
      
      for (const revert of dealReverts) {
        await storage.cancelPipelineStageRevert(revert.scheduleId);
      }
    } catch (error) {
      console.error('Error cancelling existing reverts:', error);
    }
  }

  /**
   * Validate that a pipeline and stage combination is valid
   * Ensures the stage belongs to the pipeline and both belong to the company
   */
  private async validatePipelineStageCombo(
    pipelineId: number | null,
    stageId: number | null,
    companyId: number
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      if (!pipelineId || !stageId) {
        return { valid: false, error: 'Pipeline ID and Stage ID are required' };
      }


      const stage = await storage.getPipelineStage(stageId);
      if (!stage) {
        return { valid: false, error: `Stage ${stageId} not found` };
      }


      if (stage.pipelineId !== pipelineId) {
        return { valid: false, error: `Stage ${stageId} does not belong to pipeline ${pipelineId}` };
      }


      const pipeline = await storage.getPipeline(pipelineId);
      if (!pipeline) {
        return { valid: false, error: `Pipeline ${pipelineId} not found` };
      }


      if (pipeline.companyId !== companyId) {
        return { valid: false, error: `Pipeline ${pipelineId} does not belong to company ${companyId}` };
      }

      return { valid: true };
    } catch (error) {
      console.error('Error validating pipeline/stage combo:', error);
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error during validation' };
    }
  }

  /**
   * Execute update stage operation (original functionality)
   */
  private async executeUpdateStageOperation(
    data: any,
    message: Message,
    contact: Contact,
    channelConnection: ChannelConnection,
    flowId?: number | null
  ): Promise<void> {
    const stageId = data.stageId;
    if (!stageId) {
      throw new Error('No stage ID specified for update_stage operation');
    }

    const dealIdVar = data.dealIdVariable || '{{contact.phone}}';
    const dealId = this.replaceVariables(dealIdVar, message, contact);

    const user = await storage.getUser(channelConnection.userId);
    const companyId = user?.companyId || undefined;

    let deal = await this.findDealByIdOrContact(dealId, contact.id, companyId);

    if (!deal && data.createDealIfNotExists) {

      let pipelineId: number | null = null;
      const stageIdNum = typeof stageId === 'string' ? parseInt(stageId) : stageId;
      if (!isNaN(stageIdNum)) {
        const stage = await storage.getPipelineStage(stageIdNum);
        if (stage) {
          pipelineId = stage.pipelineId;
        }
      }


      const existingActiveDeal = await storage.getActiveDealByContact(contact.id, companyId, pipelineId || undefined);

      if (existingActiveDeal) {

        deal = existingActiveDeal;
      } else {

        deal = await this.executeCreateDealOperation(data, message, { id: 0 } as any, contact, channelConnection);

      }
    }

    if (!deal) {
      throw new Error(`No deal found for ID/variable: ${dealId}`);
    }

    const stageIdNum = parseInt(stageId);
    if (isNaN(stageIdNum)) {
      throw new Error(`Invalid stage ID: ${stageId}`);
    }

    let stage = await storage.getPipelineStage(stageIdNum);
    

    const pipelineId = data.pipelineId || deal.pipelineId || null;
    if (!stage && data.createStageIfNotExists && data.stageName) {
      const user = await storage.getUser(channelConnection.userId);
      if (user?.companyId) {
        if (!pipelineId) {
          throw new Error('Pipeline ID is required when creating a new stage');
        }
        stage = await storage.createPipelineStage({
          companyId: user.companyId,
          pipelineId: pipelineId,
          name: this.replaceVariables(data.stageName, message, contact),
          color: data.stageColor || '#3a86ff',
          order: 0
        });
        ;
      }
    }

    if (!stage) {
      throw new Error(`Stage with ID ${stageIdNum} not found`);
    }


    if (pipelineId && companyId) {
      const validation = await this.validatePipelineStageCombo(
        pipelineId,
        stageIdNum,
        companyId
      );
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    } else if (deal.pipelineId && companyId) {

      const validation = await this.validatePipelineStageCombo(
        deal.pipelineId,
        stageIdNum,
        companyId
      );
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    const previousStageId = deal.stageId;
    const previousPipelineId = deal.pipelineId;
    
    const updatedDeal = await storage.updateDeal(deal.id, { stageId: stageIdNum });

    await storage.createDealActivity({
      dealId: deal.id,
      userId: channelConnection.userId,
      type: 'stage_change',
      content: `Deal moved to stage: ${stage.name}`,
      metadata: {
        oldStageId: previousStageId,
        newStageId: stageIdNum,
        changedBy: 'flow',
        flowNodeId: data.id
      }
    });


    if (previousStageId !== stageIdNum) {
      const conversations = await storage.getConversationsByContact(contact.id);
      const conversation = conversations[0] || null;
      
      if (conversation) {
        await this.emitPipelineTriggerEvent('deal_stage_changed', {
          dealId: deal.id,
          contactId: contact.id,
          pipelineId: updatedDeal.pipelineId,
          stageId: stageIdNum,
          previousPipelineId,
          previousStageId,
          triggeredBy: 'flow'
        }, conversation, contact, channelConnection);
      }
    }


    if (data.enableStageRevert && data.revertToStageId && data.revertTimeAmount && data.revertTimeUnit) {
      try {

        await this.cancelExistingReverts(deal.id);


        const user = await storage.getUser(channelConnection.userId);
        await this.scheduleStageRevert(
          deal.id,
          stageIdNum,
          parseInt(data.revertToStageId),
          data.revertTimeAmount,
          data.revertTimeUnit,
          data.revertOnlyIfNoActivity || false,
          flowId || null,
          data.id,
          user?.companyId || null,
          contact.id
        );
      } catch (error) {
        console.error('Error scheduling stage revert:', error);

      }
    }

    ;
  }

  /**
   * Helper method to find deal by ID, phone number, or contact with improved logic
   */
  private async findDealByIdOrContact(dealId: string, contactId: number, companyId?: number): Promise<any> {
    try {



      const dealIdNum = parseInt(dealId);
      if (!isNaN(dealIdNum) && dealIdNum > 0 && dealIdNum <= 2147483647) {

        try {
          const deal = await storage.getDeal(dealIdNum);
          if (deal && (!companyId || deal.companyId === companyId)) {

            return deal;
          }
        } catch (error) {

        }
      }


      if (contactId && contactId > 0) {

        try {
          const deals = await storage.getDealsByContact(contactId);
          const activeDeal = deals.find(deal =>
            deal.status === 'active' &&
            (!companyId || deal.companyId === companyId)
          );
          if (activeDeal) {

            return activeDeal;
          }

          if (deals.length > 0) {
            const recentDeal = deals.find(deal => !companyId || deal.companyId === companyId);
            if (recentDeal) {

              return recentDeal;
            }
          }
        } catch (error) {

        }
      }


      if (dealId && this.isPhoneNumberLike(dealId)) {

        const filter: any = { contactPhone: dealId };
        if (companyId) {
          filter.companyId = companyId;
        }
        const deals = await storage.getDeals(filter);
        const activeDeal = deals.find(deal => deal.status === 'active');
        if (activeDeal) {

          return activeDeal;
        }
        if (deals.length > 0) {

          return deals[0];
        }
      }


      const contactIdFromDealId = parseInt(dealId);
      if (!isNaN(contactIdFromDealId) && contactIdFromDealId > 0 && contactIdFromDealId !== dealIdNum) {

        try {
          const deals = await storage.getDealsByContact(contactIdFromDealId);
          const activeDeal = deals.find(deal =>
            deal.status === 'active' &&
            (!companyId || deal.companyId === companyId)
          );
          if (activeDeal) {

            return activeDeal;
          }
        } catch (error) {

        }
      }


      return null;
    } catch (error) {
      console.error(`[Pipeline Node] Error finding deal by ID/contact: ${dealId}`, error);
      return null;
    }
  }

  /**
   * Helper method to check if a string looks like a phone number
   */
  private isPhoneNumberLike(value: string): boolean {

    const cleanedValue = value.replace(/\D/g, '');
    return value.length > 8 &&
           cleanedValue.length >= 10 &&
           cleanedValue.length <= 15 &&
           (value.includes('+') ||
            value.includes('-') ||
            value.includes(' ') ||
            value.includes('(') ||
            /^\d{10,15}$/.test(cleanedValue));
  }

  /**
   * Execute an AI Assistant node to generate AI responses from multiple providers
   */
  /**
   * Get canonical calendar function definitions for Google Calendar
   * These are server-enforced schemas to avoid UI drift
   */
  private getCanonicalCalendarFunctions(
    calendarDefaultDuration: number = 60,
    calendarBusinessHours: { start: string; end: string } = { start: '09:00', end: '17:00' }
  ): any[] {
    return [
      {
        id: `calendar_check_availability_canonical`,
        name: 'Check Availability',
        description: 'Check available time slots in Google Calendar',
        functionDefinition: {
          name: 'check_availability',
          description: 'Check available time slots in Google Calendar for scheduling appointments. Use this to find free time slots before booking.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date to check availability for (YYYY-MM-DD format)'
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration of the appointment in minutes',
                default: calendarDefaultDuration
              },
              start_time: {
                type: 'string',
                description: 'Earliest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.start
              },
              end_time: {
                type: 'string',
                description: 'Latest time to consider (HH:MM format, optional)',
                default: calendarBusinessHours.end
              }
            },
            required: ['date']
          }
        },
        outputHandle: 'calendar_availability',
        enabled: true
      },
      {
        id: `calendar_book_appointment_canonical`,
        name: 'Book Appointment',
        description: 'Book a new appointment in Google Calendar',
        functionDefinition: {
          name: 'book_appointment',
          description: 'Create a new calendar event/appointment in Google Calendar. Use this when the user wants to schedule a meeting or appointment. IMPORTANT: Always convert user-provided dates and times to ISO format (YYYY-MM-DDTHH:MM:SS) before calling this function. Extract information from conversation history - if the user has already provided service name, date, time, name, or email in previous messages, use that information. Do not ask for information that has already been provided.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title/summary of the appointment'
              },
              description: {
                type: 'string',
                description: 'Detailed description of the appointment'
              },
              start_datetime: {
                type: 'string',
                description: 'Start date and time in ISO format (YYYY-MM-DDTHH:MM:SS). Convert user input like "November 10 at 4:15 PM" to "2025-11-10T16:15:00" before calling.'
              },
              end_datetime: {
                type: 'string',
                description: 'End date and time in ISO format (YYYY-MM-DDTHH:MM:SS). Convert user input to this format before calling.'
              },
              time_zone: {
                type: 'string',
                description: 'Timezone for the event (e.g., America/New_York, UTC). Defaults to node configuration timezone.'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              attendee_emails: {
                type: 'array',
                items: { type: 'string' },
                description: 'Email addresses of attendees (optional, legacy format)'
              },
              location: {
                type: 'string',
                description: 'Location of the appointment (optional)'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees. Defaults to true.',
                default: true
              },
              organizer_email: {
                type: 'string',
                description: 'Email of the event organizer (optional, defaults to calendar owner)'
              }
            },
            required: ['title', 'start_datetime', 'end_datetime']
          }
        },
        outputHandle: 'calendar_book',
        enabled: true
      },
      {
        id: `calendar_list_events_canonical`,
        name: 'List Events',
        description: 'List existing events from Google Calendar',
        functionDefinition: {
          name: 'list_calendar_events',
          description: 'Retrieve existing calendar events from Google Calendar for a specific date range. Use this to check what appointments are already scheduled.',
          parameters: {
            type: 'object',
            properties: {
              start_date: {
                type: 'string',
                description: 'Start date for the range (YYYY-MM-DD format)'
              },
              end_date: {
                type: 'string',
                description: 'End date for the range (YYYY-MM-DD format)'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of events to return',
                default: 10
              }
            },
            required: ['start_date', 'end_date']
          }
        },
        outputHandle: 'calendar_list',
        enabled: true
      },
      {
        id: `calendar_update_event_canonical`,
        name: 'Update Event',
        description: 'Update an existing event in Google Calendar',
        functionDefinition: {
          name: 'update_calendar_event',
          description: 'Modify an existing calendar event in Google Calendar. Use this to change appointment details like time, title, or attendees.',
          parameters: {
            type: 'object',
            properties: {
              event_id: {
                type: 'string',
                description: 'ID of the event to update'
              },
              title: {
                type: 'string',
                description: 'New title/summary of the appointment (optional)'
              },
              description: {
                type: 'string',
                description: 'New description of the appointment (optional)'
              },
              start_datetime: {
                type: 'string',
                description: 'New start date and time in ISO format (optional)'
              },
              end_datetime: {
                type: 'string',
                description: 'New end date and time in ISO format (optional)'
              },
              time_zone: {
                type: 'string',
                description: 'Timezone for the event (e.g., America/New_York, UTC). Defaults to node configuration timezone.'
              },
              location: {
                type: 'string',
                description: 'New location of the appointment (optional)'
              },
              attendees: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    email: { type: 'string', description: 'Attendee email address' },
                    displayName: { type: 'string', description: 'Attendee display name (optional)' }
                  },
                  required: ['email']
                },
                description: 'Array of attendee objects with email and optional displayName (optional)'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send email notifications to attendees about the update. Defaults to true.',
                default: true
              }
            },
            required: ['event_id']
          }
        },
        outputHandle: 'calendar_update',
        enabled: true
      },
      {
        id: `calendar_cancel_event_canonical`,
        name: 'Cancel Event',
        description: 'Cancel/delete an event from Google Calendar',
        functionDefinition: {
          name: 'cancel_calendar_event',
          description: 'Cancel or delete a calendar event from Google Calendar. CRITICAL: First check if the user\'s message contains a Google Calendar event link (URL with "calendar/event?eid="). If found, extract the FULL URL and pass it as event_link - this is the MOST RELIABLE method. If no link is found, you can use event_id OR date/time/email to find and cancel the event. Always normalize dates to YYYY-MM-DD and times to HH:MM (24-hour) format before calling this function.',
          parameters: {
            type: 'object',
            properties: {
              event_link: {
                type: 'string',
                description: 'The FULL Google Calendar event link URL. CRITICAL: Scan the user\'s message for URLs containing "calendar/event?eid=" or "calendar.google.com/calendar/event?eid=" and extract the complete URL. This is the PREFERRED and MOST RELIABLE cancellation method. The URL may appear anywhere in the user\'s message. Example: https://www.google.com/calendar/event?eid=abc123def456'
              },
              event_id: {
                type: 'string',
                description: 'ID of the event to cancel/delete. If not provided, event_link or date and time must be provided to find the event.'
              },
              date: {
                type: 'string',
                description: 'Date of the appointment to cancel. MUST be in YYYY-MM-DD format (e.g., "2025-11-10"). Convert user input like "10/11/2025", "November 10", or "tomorrow" to this format before calling. Required if event_id or event_link is not provided.'
              },
              time: {
                type: 'string',
                description: 'Time of the appointment to cancel. MUST be in HH:MM format using 24-hour notation (e.g., "16:15" for 4:15 PM). Convert user input like "4:15 PM", "4:15 pm", or "16:15" to this format before calling. Required if event_id or event_link is not provided.'
              },
              attendee_email: {
                type: 'string',
                description: 'Email address of an attendee to help identify the correct event. Recommended when canceling by date/time to ensure the correct appointment is found.'
              },
              send_updates: {
                type: 'boolean',
                description: 'Whether to send cancellation notifications to attendees',
                default: true
              }
            },
            required: []
          }
        },
        outputHandle: 'calendar_cancel',
        enabled: true
      }
    ];
  }

  async executeAIAssistantNode(
    node: any,
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};

      const provider = data.provider || 'openai';

      let model = data.model || 'gpt-4o-mini';

      let apiKey = '';
      const credentialSource = data.credentialSource || 'auto';

      if (credentialSource === 'company' || credentialSource === 'system' || credentialSource === 'auto') {
        try {
          const { aiCredentialsService } = await import('../services/ai-credentials-service');
          const { aiTokenBillingService } = await import('../services/ai-token-billing-service');
          const companyId = channelConnection.companyId;



          if (!companyId) {
            throw new Error('Company ID not found in channel connection');
          }

          const estimatedTokens = Math.ceil((message.content?.length || 0) / 4) + 100;
          const usageCheck = await aiTokenBillingService.checkUsageAllowed(companyId, provider, estimatedTokens);

          if (!usageCheck.allowed) {
            const errorMessage = `AI usage blocked: ${usageCheck.warning || 'Token limit exceeded'}`;


            const insertMessage = {
              conversationId: conversation.id,
              contactId: contact.id,
              channelType: channelConnection.channelType,
              type: 'text',
              content: errorMessage,
              direction: 'outbound',
              status: 'sent',
              mediaUrl: null,
              timestamp: new Date()
            };

            await storage.createMessage(insertMessage);


            try {
              await this.sendMessageThroughChannel(
                channelConnection,
                contact,
                errorMessage,
                conversation,
                true
              );
            } catch (error) {
              console.error('Error sending usage check error message through channel:', error);
            }

            return;
          }

          if (usageCheck.warning && usageCheck.overageTokens) {

          }

          const credentialData = await aiCredentialsService.getCredentialWithPreference(companyId, provider, credentialSource as 'company' | 'system' | 'auto');

          if (credentialData) {
            apiKey = credentialData.apiKey;

          } else {
            throw new Error(`No valid ${provider} ${credentialSource} credential found. Please configure ${credentialSource} credentials for ${provider}.`);
          }
        } catch (credentialError) {
          console.error('Error resolving AI credential:', credentialError);

          const errorMessage = `Error: Unable to resolve AI credentials. ${credentialError instanceof Error ? credentialError.message : 'Please check your AI credentials configuration.'}`;

          const insertMessage = {
            conversationId: conversation.id,
            contactId: contact.id,
            channelType: channelConnection.channelType,
            type: 'text',
            content: errorMessage,
            direction: 'outbound',
            status: 'sent',
            mediaUrl: null,
            timestamp: new Date()
          };

          await storage.createMessage(insertMessage);


          try {
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
          } catch (error) {
            console.error('Error sending credential error message through channel:', error);
          }

          return;
        }
      } else {
        apiKey = data.apiKey || '';
      }


      const { injectDateTimeContext } = await import('../utils/timezone-utils');


      const timezone = (data.enableGoogleCalendar || data.enableZohoCalendar) 
        ? (data.calendarTimeZone || data.timezone || 'UTC')
        : (data.timezone || 'UTC');
      const baseSystemPrompt = data.prompt || 'You are a helpful assistant.';


      let calendarSystemDirectives = '';
      if (data.enableGoogleCalendar) {

        let availabilityInfo = '';
        if (data.calendarAdvancedMode && data.calendarAdvancedSettings) {
          const advancedSettings = data.calendarAdvancedSettings;
          const offDays = advancedSettings.offDays || [];
          const weeklySchedule = advancedSettings.weeklySchedule || [];
          

          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const offDayNames = offDays.map((dayIndex: number) => dayNames[dayIndex]).filter(Boolean);
          

          const enabledDays = weeklySchedule
            .filter((day: any) => day.enabled && !offDays.includes(day.dayIndex))
            .map((day: any) => `${day.dayName}: ${day.startTime} - ${day.endTime}`);
          
          availabilityInfo = `
📅 AVAILABILITY SCHEDULE:
${offDayNames.length > 0 ? `❌ OFF-DAYS (No appointments available): ${offDayNames.join(', ')}` : '✅ All days are available'}
${enabledDays.length > 0 ? `✅ Available days and hours:\n${enabledDays.map((s: string) => `   - ${s}`).join('\n')}` : ''}

⚠️ CRITICAL: If a user requests an appointment on an off-day (${offDayNames.length > 0 ? offDayNames.join(', ') : 'none'}), you MUST inform them that this day is not available and suggest an alternative day from the available schedule above.`;
        } else {
          const businessHours = data.calendarBusinessHours || { start: '09:00', end: '17:00' };
          availabilityInfo = `
📅 AVAILABILITY SCHEDULE:
✅ Business hours: ${businessHours.start} - ${businessHours.end} (all days)
⚠️ Note: Standard business hours apply to all days of the week.`;
        }

        calendarSystemDirectives = `

CALENDAR SYSTEM DIRECTIVES (ENFORCED):
You have access to Google Calendar integration. Follow these canonical steps for calendar operations:

${availabilityInfo}

⚠️ CRITICAL DATE/TIME FORMAT RULES (APPLY TO ALL CALENDAR FUNCTIONS):
Before calling ANY calendar function, you MUST normalize all dates and times to standard formats:
- **Dates**: ALWAYS use YYYY-MM-DD format (e.g., "2025-11-10")
- **Times**: ALWAYS use HH:MM format in 24-hour notation (e.g., "16:15" for 4:15 PM)
- **DateTime**: For ISO datetime, use YYYY-MM-DDTHH:MM:SS format

**Common conversions you MUST perform:**
- "10/11/2025" → Determine if MM/DD or DD/MM from context → "2025-11-10"
- "November 10, 2025" → "2025-11-10"
- "Nov 10" → Add current year → "2025-11-10"
- "tomorrow" → Calculate date → "2025-11-11"
- "4:15 PM" or "4:15 pm" → "16:15"
- "4:15:00 PM" → "16:15"
- "4 PM" → "16:00"
- "10/11/2025, 4:15:00 pm" → Split to date="2025-11-10" and time="16:15"

⚠️ CRITICAL CANCELLATION RULE:
When a user wants to cancel an appointment and provides date/time information,
you MUST call cancel_calendar_event DIRECTLY with normalized date/time/email parameters.
DO NOT call list_calendar_events first. The cancel function will find and cancel the event automatically.

1. CHECK_AVAILABILITY: Always check availability before booking appointments.
   - Use check_availability function with date (YYYY-MM-DD format) and duration_minutes
   - The check_availability function automatically filters out off-days, so if it returns slots for a date, that date IS available
   - Present available time slots to the user
   - Wait for user to select a preferred time
   - IMPORTANT: If check_availability returns slots for a date, that date is valid for booking - do not reject it later

2. BOOK_APPOINTMENT: Create new calendar events only after confirming details.
   - CRITICAL: If you have already shown available time slots for a specific date using check_availability, and the user selects a time from those slots, that date IS available. DO NOT reject bookings for dates where you've already shown available slots.
   - The availability check function automatically filters out off-days, so if slots are shown for a date, that date is valid for booking.
   - Only check off-days if the user requests a booking WITHOUT first checking availability, or if the date is different from what was shown in availability results.
   - Required: title, start_datetime (ISO format: YYYY-MM-DDTHH:MM:SS), end_datetime
   - Optional: description, location, attendees, time_zone
   - IMPORTANT: Use conversation history to extract information that has already been provided:
     * If the user mentioned a service (e.g., "hair cut", "haircut"), use it as the title
     * If the user mentioned a name (e.g., "abid", "John"), you can use it in the title or description (e.g., "Haircut for Abid")
     * If the user mentioned an email, use it in the attendees parameter
     * If the user selected a time from available slots (e.g., "2pm", "02pm", "14:00"), use that time with the date from the availability check
     * If the user said "tomorrow" or a date, calculate the actual date (YYYY-MM-DD format)
     * If you've already shown availability for a date and the user selects a time, you have both date and time - proceed with booking
   - BOOKING WORKFLOW:
     * Step 1: Check availability for the requested date (if not already done)
     * Step 2: Show available slots to the user
     * Step 3: When user selects a time, extract: date (from availability check), time (from user selection), service (from conversation), name (from conversation)
     * Step 4: If you have date, time, and service, call book_appointment immediately - do not ask for more information
   - Once you have all required information (title, start_datetime, end_datetime), proceed with booking immediately
   - DO NOT ask for information that has already been provided in the conversation
   - DO NOT repeatedly ask for the same information
   - DO NOT ask for confirmation if you already have all required fields
   - If information is missing, ask for it ONCE, then proceed when provided
   - Convert user's date/time to ISO format before calling
   - If a booking attempt fails due to unavailability, immediately offer to check available time slots for the same day or nearby dates
   - Always acknowledge the conflict politely and provide alternative options

3. UPDATE_CALENDAR_EVENT: Modify existing appointments.
   - Required: event_id
   - If event_id is not provided, first ask for the date and time (or event ID) of the appointment
   - Use conversation history to infer recent bookings (e.g., "the one we just scheduled")
   - If privacy requires it (e.g., past event), then ask for the associated email to confirm involvement
   - Confirm changes with user before updating
   - Normalize all date/time values before calling

4. CANCEL_CALENDAR_EVENT: Remove appointments from calendar.
   
   **CANCELLATION WORKFLOW PRIORITY:**
   1. First, scan the user's message for Google Calendar event links (URLs containing 'calendar/event?eid=')
   2. If found, use event_link parameter (most reliable method) - DO NOT ASK ANY QUESTIONS
   3. If no link found, check for event_id in the message
   4. If neither found, use date/time/email from message or conversation history
   5. Only ask for additional information if none of the above are available
   
   **EVENT LINK EXTRACTION - CRITICAL:**
   - Always scan the user's message for Google Calendar event URLs before asking for date/time
   - Look for URLs matching these patterns:
     * https://www.google.com/calendar/event?eid=
     * https://calendar.google.com/calendar/event?eid=
   - Extract the FULL URL and pass it as the event_link parameter
   - URLs may appear on the same line or on a separate line in the message
   - Examples:
     * User: "cancel this event https://www.google.com/calendar/event?eid=abc123" 
       → AI: Immediately calls cancel_calendar_event with event_link parameter. NO questions asked.
     * User: "I want to cancel https://calendar.google.com/..." 
       → AI: Immediately extracts link and cancels. NO questions asked.
   - This is the PREFERRED and MOST RELIABLE cancellation method
   - ⚠️ CRITICAL: Never ask for email confirmation when the user has provided an event link. The link contains all necessary information for cancellation.
   
   - CRITICAL: You can call cancel_calendar_event with EITHER event_link (preferred), event_id, OR date/time/email
   - When user provides date/time information, call cancel_calendar_event directly with: date, time, attendee_email
   - The function will automatically find and cancel the matching event
   - Use conversation history to infer recent bookings (e.g., "the appointment we just booked")

   **DATE/TIME FORMAT REQUIREMENTS - CRITICAL:**
   - ALWAYS normalize dates to YYYY-MM-DD format before calling the function
   - ALWAYS normalize times to HH:MM format (24-hour) before calling the function
   - Convert user input formats to standard format:
     * "10/11/2025" or "11/10/2025" → "2025-11-10" (use context to determine MM/DD vs DD/MM)
     * "November 10, 2025" → "2025-11-10"
     * "4:15 PM" or "4:15 pm" → "16:15"
     * "4:15:00 PM" → "16:15"
     * "16:15" → "16:15" (already correct)
   - If user provides combined date-time like "10/11/2025, 4:15:00 pm", split it and normalize:
     * date: "2025-11-10"
     * time: "16:15"
   - Pass normalized values in separate parameters: date="2025-11-10", time="16:15"
   - If the user provides their email, pass it in the attendee_email parameter
   - DO NOT call list_calendar_events before canceling - call cancel_calendar_event directly
   - The system will handle finding the event by date/time automatically

5. LIST_CALENDAR_EVENTS: Retrieve scheduled appointments.
   - Required: start_date, end_date
   - Use YYYY-MM-DD format for dates
   - If the user asks for previous appointments and their email is unknown, ask for their email before listing results. Only show events where that email is organizer or attendee.
   - Respect privacy: only show events where user is involved
   - For specific actions like cancel or update, follow action-specific sequencing above

PRIVACY & OWNERSHIP RULES:
- Only access events where the user is the organizer or an attendee
- Never expose attendee lists unless the user is involved in the event
- Always respect send_updates preferences for notifications
- Default to sending notifications unless explicitly told not to
- For cancel/update: If event_link or event_id is provided, use it directly without asking for additional information. Only prompt for email if using date/time lookup and multiple events exist. Avoid listing without a time range.

IMPORTANT: These calendar behaviors are enforced and cannot be overridden by user prompts.
`;
      }


      const mergedPrompt = baseSystemPrompt + calendarSystemDirectives;
      let systemPrompt = injectDateTimeContext(mergedPrompt, timezone);
      

    

      const enableHistory = data.enableHistory !== undefined ? data.enableHistory : true;
      const historyLimit = data.historyLimit || 5;
      const enableAudio = data.enableAudio || false;

      if (data.knowledgeBaseEnabled !== false && channelConnection.companyId) {
        try {
          const { default: knowledgeBaseService } = await import('./knowledge-base-service');

          const enhancement = await knowledgeBaseService.enhancePromptWithContext(
            channelConnection.companyId,
            node.id,
            systemPrompt,
            message.content || ''
          );

          if (enhancement.contextUsed.length > 0) {
            systemPrompt = enhancement.enhancedPrompt;


          }
        } catch (knowledgeBaseError) {
          console.error('Knowledge Base integration error:', knowledgeBaseError);
        }
      }

      if (!apiKey) {

        const errorMessage = 'Error: AI Assistant is not configured with an API key. Please set up the API key in the flow builder or configure company AI credentials.';

        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          channelType: channelConnection.channelType,
          type: 'text',
          content: errorMessage,
          direction: 'outbound',
          status: 'sent',
          mediaUrl: null,
          timestamp: new Date()
        };

        await storage.createMessage(insertMessage);


        try {
          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            errorMessage,
            conversation,
            true
          );
        } catch (error) {
          console.error('Error sending API key error message through channel:', error);
        }

        return;
      }

      let conversationHistory: Message[] = [];
      if (enableHistory) {
        conversationHistory = await storage.getMessagesByConversation(conversation.id);
      }


      let aiResponse: {
        text: string;
        audioUrl?: string;
        functionCalls?: any[];
        triggeredTasks?: string[];
        triggeredCalendarFunctions?: any[];
        triggeredZohoCalendarFunctions?: any[];
      };

      try {
        const aiAssistantServiceModule = await import('../services/ai-assistant');
        const aiAssistantService = aiAssistantServiceModule.default;


        let isGoogleCalendarConnected = false;
        if (data.enableGoogleCalendar) {
          const userId = channelConnection.userId;
          const companyId = channelConnection.companyId || 1;
          const connectionStatus = await googleCalendarService.checkCalendarConnectionStatus(userId, companyId);
          isGoogleCalendarConnected = connectionStatus.connected;

          if (!isGoogleCalendarConnected) {
            console.warn(`[Flow Executor] Google Calendar is enabled but not connected for user ${userId}, company ${companyId}. Calendar functions will be disabled.`);
          }
        }



        let mergedCalendarFunctions: any[] = [];
        if (data.enableGoogleCalendar && isGoogleCalendarConnected) {
          const calendarDefaultDuration = data.calendarDefaultDuration || 60;
          const calendarBusinessHours = data.calendarBusinessHours || { start: '09:00', end: '17:00' };


          const canonicalFunctions = this.getCanonicalCalendarFunctions(
            calendarDefaultDuration,
            calendarBusinessHours
          );


          mergedCalendarFunctions = [...canonicalFunctions];



          const clientFunctions = data.calendarFunctions || [];

        

          for (const clientFunc of clientFunctions) {
            const functionName = clientFunc.functionDefinition?.name;
            if (functionName) {
              const existingIndex = mergedCalendarFunctions.findIndex(
                f => f.functionDefinition?.name === functionName
              );

              if (existingIndex === -1) {
                mergedCalendarFunctions.push(clientFunc);
              }
            }
          }
        }

        const aiConfig = {
          provider,
          model,
          apiKey,
          systemPrompt,
          enableHistory,
          historyLimit,
          enableAudio: true,
          enableImage: true,
          enableVideo: true,
          enableVoiceProcessing: provider === 'openai',
          enableTextToSpeech: data.enableTextToSpeech || false,
          ttsProvider: data.ttsProvider || 'openai',
          ttsVoice: data.ttsVoice || 'alloy',
          voiceResponseMode: data.voiceResponseMode || 'always',
          maxAudioDuration: data.maxAudioDuration || 30,
          enableFunctionCalling: data.enableTaskExecution || (data.enableGoogleCalendar && isGoogleCalendarConnected) || data.enableZohoCalendar || false,
          enableTaskExecution: data.enableTaskExecution || false,
          tasks: data.tasks || [],
          enableGoogleCalendar: data.enableGoogleCalendar && isGoogleCalendarConnected,
          calendarFunctions: mergedCalendarFunctions,
          enableZohoCalendar: data.enableZohoCalendar || false,
          zohoCalendarFunctions: data.zohoCalendarFunctions || [],
          elevenLabsApiKey: data.elevenLabsApiKey,
          elevenLabsVoiceId: data.elevenLabsVoiceId,
          elevenLabsCustomVoiceId: data.elevenLabsCustomVoiceId,
          elevenLabsModel: data.elevenLabsModel || 'eleven_monolingual_v1',
          elevenLabsStability: data.elevenLabsStability ?? 0.5,
          elevenLabsSimilarityBoost: data.elevenLabsSimilarityBoost ?? 0.75,
          elevenLabsStyle: data.elevenLabsStyle ?? 0.0,
          elevenLabsUseSpeakerBoost: data.elevenLabsUseSpeakerBoost ?? true,

          nodeId: node.id,
          knowledgeBaseEnabled: data.knowledgeBaseEnabled || false,
          knowledgeBaseConfig: data.knowledgeBaseConfig || {}
        };

        aiResponse = await aiAssistantService.processMessage(
          message,
          conversation,
          contact,
          channelConnection,
          aiConfig,
          conversationHistory,
          conversation.companyId ?? undefined
        );

        if (channelConnection.companyId) {
          try {
            const inputTokens = Math.ceil((message.content?.length || 0) / 4);
            const outputTokens = Math.ceil((aiResponse.text?.length || 0) / 4);


            if (credentialSource === 'company' || credentialSource === 'system' || credentialSource === 'auto') {
              const { aiTokenBillingService } = await import('../services/ai-token-billing-service');
              await aiTokenBillingService.recordUsage(
                channelConnection.companyId,
                provider,
                inputTokens,
                outputTokens,
                conversation.id,
                undefined,
                node.id
              );
            }

            const { aiCredentialsService } = await import('../services/ai-credentials-service');

            let credentialInfo = null;
            let actualCredentialType = 'environment';
            let actualCredentialId = null;

            if (credentialSource === 'company' || credentialSource === 'system' || credentialSource === 'auto') {
              credentialInfo = await aiCredentialsService.getCredentialWithPreference(channelConnection.companyId, provider, credentialSource as 'company' | 'system' | 'auto');
              if (credentialInfo) {
                actualCredentialType = credentialInfo.type;
                actualCredentialId = credentialInfo.credential?.id || null;
              }
            } else if (credentialSource === 'manual') {
              actualCredentialType = 'environment';
              actualCredentialId = null;
            }

            await aiCredentialsService.trackUsageWithCost({
              companyId: channelConnection.companyId,
              credentialType: actualCredentialType,
              credentialId: actualCredentialId,
              provider: provider,
              model: model || 'unknown',
              tokensInput: inputTokens,
              tokensOutput: outputTokens,
              tokensTotal: inputTokens + outputTokens,
              requestCount: 1,
              conversationId: conversation.id,
              flowId: undefined,
              nodeId: node.id
            });

          } catch (usageError) {
            console.error('Error recording AI token usage:', usageError);
          }
        }

      } catch (error) {

        aiResponse = {
          text: `I'm sorry, I encountered an error while processing your request: "${error instanceof Error ? error.message : 'Unknown error'}". Please try again with a different question.`,
          functionCalls: [],
          triggeredTasks: [],
          triggeredCalendarFunctions: [],
          triggeredZohoCalendarFunctions: []
        };

      }




      const responseText = this.replaceVariables(aiResponse.text, message, contact);

      if (aiResponse.audioUrl && (channelConnection.channelType === 'whatsapp' || channelConnection.channelType === 'whatsapp_unofficial' || channelConnection.channelType === 'whatsapp_official') && contact.identifier) {
        try {
          const audioPath = aiResponse.audioUrl.startsWith('/') ? aiResponse.audioUrl.slice(1) : aiResponse.audioUrl;
          const fullAudioPath = path.join(process.cwd(), audioPath);


          if (channelConnection.channelType === 'whatsapp_unofficial') {
            await whatsAppService.sendWhatsAppAudioMessage(
              channelConnection.id,
              channelConnection.userId,
              contact.identifier,
              fullAudioPath
            );
          } else {

            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              responseText,
              conversation,
              true
            );
          }
        } catch (error) {
          try {

            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              responseText,
              conversation,
              true
            );
          } catch (textError) {
            console.error('Error sending fallback text message:', textError);
          }
        }
      } else if (responseText && responseText.trim()) {
        try {
          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            responseText,
            conversation,
            true
          );
        } catch (error) {
          console.error('Error sending AI response through channel:', error);

          const insertMessage = {
            conversationId: conversation.id,
            contactId: contact.id,
            channelType: channelConnection.channelType,
            type: 'text',
            content: responseText,
            direction: 'outbound',
            status: 'failed',
            isFromBot: true,
            mediaUrl: null,
            timestamp: new Date()
          };

          await storage.createMessage(insertMessage);
        }
      }

      if (data.enableTaskExecution && aiResponse.functionCalls && aiResponse.functionCalls.length > 0) {
      }

      if (data.enableGoogleCalendar && aiResponse.triggeredCalendarFunctions && aiResponse.triggeredCalendarFunctions.length > 0) {
        for (const calendarFunction of aiResponse.triggeredCalendarFunctions) {
          try {
            await this.executeCalendarFunction(calendarFunction, conversation, contact, channelConnection, data, conversationHistory);
          } catch (error) {

            const language = data.language || 'en';
            let errorMessage: string;
            if (calendarFunction.name === 'book_appointment') {
              errorMessage = error instanceof Error && error.message 
                ? error.message 
                : await serverI18n.t('calendar.bot_slot_not_available_short', language);
            } else {
              errorMessage = error instanceof Error && error.message 
                ? error.message 
                : await serverI18n.t('calendar.bot_generic_calendar_error', language);
            }
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
          }
        }
      }


      if (data.enableZohoCalendar && aiResponse.triggeredZohoCalendarFunctions && aiResponse.triggeredZohoCalendarFunctions.length > 0) {
        for (const zohoCalendarFunction of aiResponse.triggeredZohoCalendarFunctions) {
          try {
            await this.executeZohoCalendarFunction(zohoCalendarFunction, conversation, contact, channelConnection, data);
          } catch (error) {

            const language = data.zohoCalendarLanguage || data.language || 'en';
            let errorMessage: string;
            if (zohoCalendarFunction.name === 'zoho_book_appointment') {
              errorMessage = error instanceof Error && error.message 
                ? error.message 
                : await serverI18n.t('calendar.bot_slot_not_available_short', language);
            } else {
              errorMessage = error instanceof Error && error.message 
                ? error.message 
                : await serverI18n.t('calendar.bot_generic_calendar_error', language);
            }
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
          }
        }
      }

    } catch (error) {
    }
  }

  /**
   * Helper function to normalize date format to YYYY-MM-DD
   * Handles various input formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
   */
  private normalizeDateFormat(dateStr: string): string | null {
    try {

      dateStr = dateStr.trim();


      let parsedDate: Date | null = null;


      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        parsedDate = new Date(dateStr);
      }

      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [month, day, year] = dateStr.split('/');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }

      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      }

      else if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
        parsedDate = new Date(dateStr.replace(/\//g, '-'));
      }

      else {
        parsedDate = new Date(dateStr);
      }


      if (parsedDate && !isNaN(parsedDate.getTime())) {

        const year = parsedDate.getFullYear();
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const day = String(parsedDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      return null;
    } catch (error) {
      console.error('[normalizeDateFormat] Error parsing date:', dateStr, error);
      return null;
    }
  }

  /**
   * Helper function to normalize time format to HH:MM (24-hour)
   * Handles various input formats: 12-hour with AM/PM, 24-hour, etc.
   */
  private normalizeTimeFormat(timeStr: string): string | null {
    try {


      timeStr = timeStr.trim();


      if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        if (h >= 0 && h <= 23) {
          const result = `${hours.padStart(2, '0')}:${minutes}`;

          return result;
        }
      }


      if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        if (h >= 0 && h <= 23) {
          const result = `${hours.padStart(2, '0')}:${minutes}`;

          return result;
        }
      }


      const ampmSecondsMatch = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$/i);
      if (ampmSecondsMatch) {
        let hours = parseInt(ampmSecondsMatch[1]);
        const minutes = ampmSecondsMatch[2];
        const period = ampmSecondsMatch[4].toLowerCase();


        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }

        const result = `${String(hours).padStart(2, '0')}:${minutes}`;

        return result;
      }


      const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = ampmMatch[2];
        const period = ampmMatch[3].toLowerCase();


        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }

        const result = `${String(hours).padStart(2, '0')}:${minutes}`;

        return result;
      }


      const ampmNoMinMatch = timeStr.match(/^(\d{1,2})\s*(am|pm)$/i);
      if (ampmNoMinMatch) {
        let hours = parseInt(ampmNoMinMatch[1]);
        const period = ampmNoMinMatch[2].toLowerCase();

        if (period === 'pm' && hours !== 12) {
          hours += 12;
        } else if (period === 'am' && hours === 12) {
          hours = 0;
        }

        return `${String(hours).padStart(2, '0')}:00`;
      }

      return null;
    } catch (error) {
      console.error('[normalizeTimeFormat] Error parsing time:', timeStr, error);
      return null;
    }
  }

  /**
   * Helper function to parse combined date-time strings
   * Handles formats like "10/11/2025, 4:15:00 pm" or "2025-11-10 16:15"
   */
  private parseDateTimeString(dateTimeStr: string): { date: string | null, time: string | null } {
    try {

      dateTimeStr = dateTimeStr.trim();


      let datePart: string | null = null;
      let timePart: string | null = null;


      if (dateTimeStr.includes(',')) {
        const parts = dateTimeStr.split(',');
        datePart = parts[0].trim();
        timePart = parts[1].trim();

      }

      else if (dateTimeStr.includes(' ')) {
        const parts = dateTimeStr.split(' ');
        datePart = parts[0].trim();

        timePart = parts.slice(1).join(' ').trim();

      }

      else if (dateTimeStr.includes('T')) {
        const parts = dateTimeStr.split('T');
        datePart = parts[0].trim();
        timePart = parts[1].split('.')[0].trim(); // Remove milliseconds if present

      }

      const normalizedDate = datePart ? this.normalizeDateFormat(datePart) : null;
      const normalizedTime = timePart ? this.normalizeTimeFormat(timePart) : null;



      return {
        date: normalizedDate,
        time: normalizedTime
      };
    } catch (error) {
      console.error('[parseDateTimeString] Error parsing date-time:', dateTimeStr, error);
      return { date: null, time: null };
    }
  }

  /**
   * Helper function to extract recent booking details from conversation history
   */
  private extractRecentBookingFromHistory(conversationHistory: Message[], withinHours: number = 24): any | null {
    if (!conversationHistory || conversationHistory.length === 0) {
      return null;
    }

    const cutoffTime = new Date(Date.now() - withinHours * 60 * 60 * 1000);


    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];


      if (!message.createdAt || new Date(message.createdAt) < cutoffTime) {
        break;
      }


      if (message.direction === 'outbound' && message.content) {
        try {

          const content = message.content;


          if (content.includes('book_appointment') || content.includes('appointment') || content.includes('scheduled')) {

            const dateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
            const timeMatch = content.match(/(\d{1,2}:\d{2})/);
            const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

            if (dateMatch || timeMatch) {
              return {
                date: dateMatch ? dateMatch[1] : null,
                time: timeMatch ? timeMatch[1] : null,
                attendee_email: emailMatch ? emailMatch[1] : null,
                source: 'history_extraction'
              };
            }
          }
        } catch (error) {

          continue;
        }
      }
    }

    return null;
  }

  /**
   * Execute a calendar function call from AI Assistant
   */
  async executeCalendarFunction(
    calendarFunction: any,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    nodeData: any,
    conversationHistory?: Message[]
  ): Promise<void> {
    const { name, arguments: args } = calendarFunction;
    const language = nodeData.language || 'en';



    try {
      const googleCalendarModule = await import('../services/google-calendar');
      const googleCalendarService = googleCalendarModule.default;

      let userId = conversation.assignedToUserId;

      if (!userId) {
        userId = channelConnection.userId;
      }

      if (!userId && conversation.companyId) {
        const companyUsers = await storage.getUsersByCompany(conversation.companyId);
        const adminUser = companyUsers.find(user => user.role === 'admin') || companyUsers[0];
        userId = adminUser?.id || 1;
      }

      const companyId = conversation.companyId;
      const timeZone = nodeData.calendarTimeZone || 'UTC';

      if (!companyId) {
        throw new Error('Company ID is required for calendar operations');
      }

      if (!userId) {
        throw new Error('Could not resolve user ID for calendar operations');
      }

      let result: any;
      let successMessage = '';

      switch (name) {
        case 'check_availability':

          const businessHours = nodeData.calendarBusinessHours || { start: '09:00', end: '17:00' };
          let businessHoursStart = parseInt(businessHours.start.split(':')[0]) || 9;
          let businessHoursEnd = parseInt(businessHours.end.split(':')[0]) || 17;
          

          if (args.start_time) {
            const startTimeParts = args.start_time.split(':');
            businessHoursStart = parseInt(startTimeParts[0]) || businessHoursStart;
          }
          if (args.end_time) {
            const endTimeParts = args.end_time.split(':');
            businessHoursEnd = parseInt(endTimeParts[0]) || businessHoursEnd;
          }
          
          const bufferMinutes = nodeData.calendarBufferMinutes || 0;


          const advancedSettings = nodeData.calendarAdvancedMode && nodeData.calendarAdvancedSettings
            ? nodeData.calendarAdvancedSettings
            : undefined;

          result = await googleCalendarService.getAvailableTimeSlots(
            userId,
            companyId,
            args.date,
            args.duration_minutes || args.duration || nodeData.calendarDefaultDuration || 30,
            undefined, // startDate
            undefined, // endDate
            businessHoursStart,
            businessHoursEnd,
            timeZone,
            bufferMinutes,
            advancedSettings
          );

          if (result.success) {
            const timeSlots = result.timeSlots || [];
            if (timeSlots.length > 0 && timeSlots[0].slots.length > 0) {
              const slotList = timeSlots[0].slots.join('\n');
              const headerMessage = await serverI18n.t('calendar.bot_available_slots_for', language, undefined, { date: args.date });
              successMessage = `${headerMessage}\n${slotList}`;
            } else {
              successMessage = await serverI18n.t('calendar.bot_no_available_slots', language, undefined, { date: args.date });
            }
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_checking_availability', language);
            throw new Error(result.error || errorMsg);
          }
          break;

        case 'book_appointment': {
          let processedAttendees = args.attendees || args.attendee_emails || [];


          let startDateTime = args.start_datetime || args.start_time || args.startDateTime;
          let endDateTime = args.end_datetime || args.end_time || args.endDateTime;



          if (startDateTime && !startDateTime.includes('T') && !startDateTime.match(/^\d{4}-\d{2}-\d{2}/)) {

            const bookingDate = args.date;
            
            if (!bookingDate) {
              const errorMsg = await serverI18n.t('calendar.bot_date_required', language);
              throw new Error(errorMsg);
            }
            

            const timeMatch = startDateTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2]);
              const period = timeMatch[3]?.toUpperCase();
              

              if (period === 'PM' && hours !== 12) {
                hours += 12;
              } else if (period === 'AM' && hours === 12) {
                hours = 0;
              }
              



              

              const timeZoneToUse = args.time_zone || timeZone;
              
              try {

                const { convertToUTC } = await import('../utils/timezone');
                

                const dateTimeStr = `${bookingDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
                

                const utcDate = convertToUTC(dateTimeStr, timeZoneToUse);
                startDateTime = utcDate.toISOString();
                

                const duration = args.duration_minutes || args.duration || nodeData.calendarDefaultDuration || 30;
                const endDate = new Date(utcDate);
                endDate.setMinutes(endDate.getMinutes() + duration);
                endDateTime = endDate.toISOString();
              } catch (error) {
                console.error('Error converting time for booking:', error);
                const errorMsg = await serverI18n.t('calendar.bot_failed_parse_time', language, undefined, { time: startDateTime });
                throw new Error(errorMsg);
              }
            } else {
              const errorMsg = await serverI18n.t('calendar.bot_invalid_time_format', language, undefined, { time: startDateTime });
              throw new Error(errorMsg);
            }
          }


          if (!startDateTime || !endDateTime) {
            const errorMsg = await serverI18n.t('calendar.bot_start_end_required', language);
            throw new Error(errorMsg);
          }



          const timeZoneToUse = args.time_zone || timeZone;
          const { convertToUTC, validateTimezone, normalizeTimezone } = await import('../utils/timezone');
          


          const naiveStartPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
          if (typeof startDateTime === 'string' && naiveStartPattern.test(startDateTime) && !startDateTime.endsWith('Z') && !startDateTime.includes('+') && !startDateTime.match(/[+-]\d{2}:\d{2}$/)) {

            const normalizedTz = normalizeTimezone(timeZoneToUse);
            if (validateTimezone(normalizedTz)) {
           
              const utcStart = convertToUTC(startDateTime, normalizedTz);
              startDateTime = utcStart.toISOString();
            }
          }
          

          if (typeof endDateTime === 'string' && naiveStartPattern.test(endDateTime) && !endDateTime.endsWith('Z') && !endDateTime.includes('+') && !endDateTime.match(/[+-]\d{2}:\d{2}$/)) {

            const normalizedTz = normalizeTimezone(timeZoneToUse);
            if (validateTimezone(normalizedTz)) {
             
              const utcEnd = convertToUTC(endDateTime, normalizedTz);
              endDateTime = utcEnd.toISOString();
            }
          }


          const startDate = new Date(startDateTime);
          const endDate = new Date(endDateTime);
          
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            const errorMsg = await serverI18n.t('calendar.bot_invalid_datetime_format', language, undefined, { start: startDateTime, end: endDateTime });
            throw new Error(errorMsg);
          }

          if (startDate >= endDate) {
            const errorMsg = await serverI18n.t('calendar.bot_start_before_end', language);
            throw new Error(errorMsg);
          }

          const eventData = {
            summary: args.title || args.summary,
            description: args.description || '',
            location: args.location || 'Virtual',
            start: {
              dateTime: startDateTime,
              timeZone: args.time_zone || timeZone
            },
            end: {
              dateTime: endDateTime,
              timeZone: args.time_zone || timeZone
            },
            attendees: processedAttendees,
            send_updates: args.send_updates !== undefined ? args.send_updates : true,
            organizer_email: args.organizer_email,
            time_zone: args.time_zone || timeZone,
            bufferMinutes: nodeData.calendarBufferMinutes || 0
          };





          const bufferMinutes = eventData.bufferMinutes || 0;
        
          


          
          const preBookingAvailability = await googleCalendarService.getAvailableTimeSlots(
            userId,
            companyId,
            startDateTime.split('T')[0], // Extract date
            args.duration_minutes || args.duration || nodeData.calendarDefaultDuration || 30,
            undefined,
            undefined,
            parseInt((nodeData.calendarBusinessHours || { start: '09:00' }).start.split(':')[0]) || 9,
            parseInt((nodeData.calendarBusinessHours || { end: '17:00' }).end.split(':')[0]) || 17,
            timeZone,
            bufferMinutes, // Use explicit bufferMinutes variable to ensure consistency
            nodeData.calendarAdvancedMode && nodeData.calendarAdvancedSettings
              ? nodeData.calendarAdvancedSettings
              : undefined
          );
          
          if (preBookingAvailability.success && preBookingAvailability.timeSlots) {
            const requestedDate = startDateTime.split('T')[0];
            const dateSlots = preBookingAvailability.timeSlots.find(ts => ts.date === requestedDate);
            if (dateSlots) {

              const parseTimeString = (timeStr: string): { hours: number, minutes: number } | null => {

                const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
                if (!match) return null;
                
                let hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const period = match[3]?.toUpperCase();
                

                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                
                return { hours, minutes };
              };
              

              const requestedDateObj = new Date(startDateTime);
              const requestedHours = parseInt(requestedDateObj.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone }));
              const requestedMinutes = parseInt(requestedDateObj.toLocaleString('en-US', { minute: '2-digit', timeZone }));
              const requestedTotalMinutes = requestedHours * 60 + requestedMinutes;
              

              const requestedTime = requestedDateObj.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: timeZone
              });
              

              let isAvailable = false;
              let matchedSlot: string | null = null;
              
              for (const slot of dateSlots.slots) {
                const parsed = parseTimeString(slot);
                if (parsed) {
                  const slotTotalMinutes = parsed.hours * 60 + parsed.minutes;
                  if (slotTotalMinutes === requestedTotalMinutes) {
                    isAvailable = true;
                    matchedSlot = slot;
                    break;
                  }
                }
              }
              

              if (!isAvailable) {

                const normalizedRequested = requestedTime.trim().replace(/\s+/g, ' ').toUpperCase();
                for (const slot of dateSlots.slots) {
                  const normalizedSlot = slot.trim().replace(/\s+/g, ' ').toUpperCase();
                  if (normalizedSlot === normalizedRequested) {
                    isAvailable = true;
                    matchedSlot = slot;
                    break;
                  }
                }
              }
              
              if (!isAvailable) {

                const slotList = dateSlots.slots.length > 0 
                  ? dateSlots.slots.join('\n')
                  : 'No available slots';
                
                const bufferMinutes = eventData.bufferMinutes || 0;
                const duration = args.duration_minutes || args.duration || nodeData.calendarDefaultDuration || 30;
                const bufferNote = bufferMinutes > 0 
                  ? await serverI18n.t('calendar.bot_buffer_warning', language, undefined, { buffer: bufferMinutes })
                  : '';
                const bufferNoteText = bufferMinutes > 0 
                  ? await serverI18n.t('calendar.bot_buffer_note', language, undefined, { buffer: bufferMinutes })
                  : '';
                const durationNote = await serverI18n.t('calendar.bot_slots_duration_note', language, undefined, { 
                  duration, 
                  bufferNote: bufferNoteText
                });
                const slotUnavailableMsg = await serverI18n.t('calendar.bot_slot_no_longer_available', language, undefined, { time: requestedTime, date: requestedDate });
                const selectTimeMsg = await serverI18n.t('calendar.bot_select_time_from_options', language);
                const followUpMessage = `${slotUnavailableMsg}\n\n${slotList}\n\n${durationNote}${bufferNote ? '\n\n' + bufferNote : ''}\n${selectTimeMsg}`;
                

                await this.sendMessageThroughChannel(channelConnection, contact, followUpMessage, conversation);
                return; // End the tool run after sending the message
              }
            }
          }
          
          result = await googleCalendarService.createCalendarEvent(
            userId,
            companyId,
            eventData
          );

          if (result.success) {
           
            
            const { formatDateTimeForUser } = await import('../utils/timezone');
            const eventDate = formatDateTimeForUser(new Date(eventData.start.dateTime), timeZone, { includeTimezone: true });
            const duration = args.duration_minutes || args.duration || 30;

            const scheduledMsg = await serverI18n.t('calendar.bot_appointment_scheduled', language);
            const detailsMsg = await serverI18n.t('calendar.bot_appointment_details', language, undefined, {
              summary: eventData.summary,
              date: eventDate,
              duration: duration,
              location: eventData.location || 'Virtual'
            });
            const linkMsg = result.eventLink ? await serverI18n.t('calendar.bot_event_link', language, undefined, { link: result.eventLink }) : '';
            const invitationMsg = await serverI18n.t('calendar.bot_calendar_invitation', language);
            successMessage = `${scheduledMsg}\n\n${detailsMsg}${linkMsg ? '\n\n' + linkMsg : ''}\n\n${invitationMsg}`;
          } else {
            const errorMsgKey = await serverI18n.t('calendar.bot_error_booking_appointment', language);
            const errorMsg = result.error || errorMsgKey;
            

            if (errorMsg.includes('not available') || errorMsg.includes('conflict') || errorMsg.includes('time slot')) {

              const bookingDate = args.start_datetime || args.start_time || args.startDateTime || args.date;
              let checkDate: string | undefined;
              
              if (bookingDate) {
                if (bookingDate.includes('T')) {
                  checkDate = bookingDate.split('T')[0];
                } else if (bookingDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  checkDate = bookingDate;
                } else {

                  const dateMatch = bookingDate.match(/(\d{4}-\d{2}-\d{2})/);
                  checkDate = dateMatch ? dateMatch[1] : undefined;
                }
              }
              
              if (checkDate) {

                const businessHours = nodeData.calendarBusinessHours || { start: '09:00', end: '17:00' };
                let businessHoursStart = parseInt(businessHours.start.split(':')[0]) || 9;
                let businessHoursEnd = parseInt(businessHours.end.split(':')[0]) || 17;
                const bufferMinutes = nodeData.calendarBufferMinutes || 0;
                

                const advancedSettings = nodeData.calendarAdvancedMode && nodeData.calendarAdvancedSettings
                  ? nodeData.calendarAdvancedSettings
                  : undefined;
                
                const availabilityResult = await googleCalendarService.getAvailableTimeSlots(
                  userId,
                  companyId,
                  checkDate,
                  args.duration_minutes || args.duration || nodeData.calendarDefaultDuration || 30,
                  undefined,
                  undefined,
                  businessHoursStart,
                  businessHoursEnd,
                  timeZone,
                  bufferMinutes,
                  advancedSettings
                );
                
                if (availabilityResult.success && availabilityResult.timeSlots && availabilityResult.timeSlots.length > 0) {
                  const timeSlots = availabilityResult.timeSlots[0].slots;
                  if (timeSlots.length > 0) {
                    const slotList = timeSlots.join('\n');
                    const slotUnavailableMsg = await serverI18n.t('calendar.bot_slot_no_longer_available', language, undefined, { time: '', date: checkDate });
                    const selectTimeMsg = await serverI18n.t('calendar.bot_select_time_from_options', language);
                    const followUpMessage = `${slotUnavailableMsg}\n\n${slotList}\n\n${selectTimeMsg}`;
                    await this.sendMessageThroughChannel(channelConnection, contact, followUpMessage, conversation);
                    return; // End the tool run after sending the message
                  }
                }
              }
              

              const fallbackMsg = await serverI18n.t('calendar.bot_slot_not_available_fallback', language);
              throw new Error(fallbackMsg);
            }
            
            throw new Error(errorMsg);
          }
          break;
        }

        case 'update_calendar_event':

          let updateEventId = args.event_id || args.eventId;

          if (!updateEventId && (args.date || args.start_datetime)) {
            try {

              let searchDate: string;
              let searchTime: string;

              if (args.date && args.time) {
                searchDate = args.date;
                searchTime = args.time;
              } else if (args.start_datetime) {
                const dateTime = new Date(args.start_datetime);
                searchDate = dateTime.toISOString().split('T')[0];
                searchTime = dateTime.toTimeString().split(' ')[0].substring(0, 5);
              } else {
                throw new Error('Unable to determine date/time for event lookup');
              }

              const attendeeEmail = args.attendee_email || (args.attendees && args.attendees[0]?.email) || contact.email;
              const findResult = await googleCalendarService.findAppointmentByDateTime(
                userId,
                companyId,
                searchDate,
                searchTime,
                attendeeEmail
              );

              if (findResult.success && findResult.eventId) {
                updateEventId = findResult.eventId;
              } else {
                const clarificationMessage = await serverI18n.t('calendar.bot_appointment_not_found', language, undefined, { date: searchDate, time: searchTime });
                await this.sendMessageThroughChannel(
                  channelConnection,
                  contact,
                  clarificationMessage,
                  conversation,
                  true
                );
                return;
              }
            } catch (findError) {
              console.error('Error finding event by date/time:', findError);
              const errorMessage = await serverI18n.t('calendar.bot_need_event_id_to_update', language);
              await this.sendMessageThroughChannel(
                channelConnection,
                contact,
                errorMessage,
                conversation,
                true
              );
              return;
            }
          }

          if (!updateEventId) {
            const errorMessage = await serverI18n.t('calendar.bot_need_event_id_or_datetime_to_update', language);
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
            return;
          }

          const updateData = {
            summary: args.title || args.summary,
            description: args.description || '',
            location: args.location || '',
            start: args.start_datetime || args.start_time || args.startDateTime ? {
              dateTime: args.start_datetime || args.start_time || args.startDateTime,
              timeZone: args.time_zone || timeZone
            } : undefined,
            end: args.end_datetime || args.end_time || args.endDateTime ? {
              dateTime: args.end_datetime || args.end_time || args.endDateTime,
              timeZone: args.time_zone || timeZone
            } : undefined,
            attendees: args.attendees,
            send_updates: args.send_updates !== undefined ? args.send_updates : true,
            time_zone: args.time_zone || timeZone
          };

          result = await googleCalendarService.updateCalendarEvent(
            userId,
            companyId,
            updateEventId,
            updateData
          );

          if (result.success) {
            const { formatDateTimeForUser } = await import('../utils/timezone');
            const newEventDate = updateData.start 
              ? formatDateTimeForUser(new Date(updateData.start.dateTime), timeZone, { includeTimezone: true })
              : 'updated time';
            const updatedMsg = await serverI18n.t('calendar.bot_appointment_updated', language);
            const detailsMsg = await serverI18n.t('calendar.bot_appointment_updated_details', language, undefined, {
              summary: updateData.summary || 'Your appointment',
              date: newEventDate
            });
            successMessage = `${updatedMsg}\n\n${detailsMsg}`;
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_updating_appointment', language);
            throw new Error(result.error || errorMsg);
          }
          break;

        case 'cancel_calendar_event':

          let cancelEventId = args.event_id || args.eventId;
          let eventLink = args.event_link || args.eventLink;



          if (eventLink) {
            try {
              const booking = await googleCalendarService.getBookingByEventLink(userId, companyId, eventLink);
              if (booking && booking.eventId) {
                cancelEventId = booking.eventId;


              } else {


                if (!cancelEventId) {
                  const sendUpdates = args.send_updates !== undefined ? args.send_updates : true;
                  

                  const directCancelResult = await googleCalendarService.deleteCalendarEvent(
                    userId,
                    companyId,
                    undefined,
                    sendUpdates,
                    eventLink
                  );
                  
                  if (directCancelResult.success) {

                    const successMessage = await serverI18n.t('calendar.bot_appointment_cancelled_via_link', language);
                    await this.sendMessageThroughChannel(
                      channelConnection,
                      contact,
                      successMessage,
                      conversation,
                      true
                    );
                    return;
                  } else {

                    const notFoundMsg = await serverI18n.t('calendar.bot_appointment_not_found', language, undefined, { date: '', time: '' });
                    await this.sendMessageThroughChannel(
                      channelConnection,
                      contact,
                      notFoundMsg,
                      conversation,
                      true
                    );
                    return;
                  }
                }

              }
            } catch (error) {
              console.error('Error getting booking by event link:', error);

              if (!cancelEventId) {

                const sendUpdates = args.send_updates !== undefined ? args.send_updates : true;
                
                const directCancelResult = await googleCalendarService.deleteCalendarEvent(
                  userId,
                  companyId,
                  undefined,
                  sendUpdates,
                  eventLink
                );
                
                if (directCancelResult.success) {

                  const successMessage = await serverI18n.t('calendar.bot_appointment_cancelled_via_link', language);
                  await this.sendMessageThroughChannel(
                    channelConnection,
                    contact,
                    successMessage,
                    conversation,
                    true
                  );
                  return;
                } else {

                  const errorMsg = await serverI18n.t('calendar.bot_cancellation_failed', language, undefined, { error: error instanceof Error ? error.message : 'Unknown error' });
                  await this.sendMessageThroughChannel(
                    channelConnection,
                    contact,
                    errorMsg,
                    conversation,
                    true
                  );
                  return;
                }
              }

            }
          }




          if (!cancelEventId) {

            let searchDate: string | undefined = args.date;
            let searchTime: string | undefined = args.time;
            let attendeeEmail: string | undefined = args.attendee_email || (args.attendees && args.attendees[0]?.email);




            if (searchDate && !searchTime && (searchDate.includes(',') || searchDate.includes(' '))) {

              const parsed = this.parseDateTimeString(searchDate);

              if (parsed.date && parsed.time) {
                searchDate = parsed.date;
                searchTime = parsed.time;

              } else {
                console.warn('[cancel_calendar_event] Failed to parse combined string. Date:', parsed.date, 'Time:', parsed.time);
              }
            }


            if ((!searchDate || !searchTime) && conversationHistory) {
              const recentBooking = this.extractRecentBookingFromHistory(conversationHistory, 24);
              if (recentBooking) {

                searchDate = searchDate || recentBooking.date;
                searchTime = searchTime || recentBooking.time;
                attendeeEmail = attendeeEmail || recentBooking.attendee_email;
              }
            }


            if (searchDate || args.start_datetime) {
              try {

                if (!searchDate && args.start_datetime) {
                  const dateTime = new Date(args.start_datetime);
                  searchDate = dateTime.toISOString().split('T')[0];
                  searchTime = dateTime.toTimeString().split(' ')[0].substring(0, 5);
                }


                if (searchDate) {
                  const normalizedDate = this.normalizeDateFormat(searchDate);
                  if (normalizedDate) {

                    searchDate = normalizedDate;
                  } else {
                    console.warn('[cancel_calendar_event] Failed to normalize date:', searchDate);
                  }
                }

                if (searchTime) {
                  const normalizedTime = this.normalizeTimeFormat(searchTime);
                  if (normalizedTime) {

                    searchTime = normalizedTime;
                  } else {
                    console.warn('[cancel_calendar_event] Failed to normalize time:', searchTime);
                  }
                }

                if (!searchDate || !searchTime) {
                  throw new Error('Unable to determine date/time for event lookup');
                }


                attendeeEmail = attendeeEmail || contact.email || undefined;

                

                const findResult = await googleCalendarService.findAppointmentByDateTime(
                  userId,
                  companyId,
                  searchDate,
                  searchTime,
                  attendeeEmail,
                  timeZone
                );



                if (findResult.success && findResult.eventId) {
                  cancelEventId = findResult.eventId;

                } else {
                  const clarificationMessage = await serverI18n.t('calendar.bot_appointment_not_found', language, undefined, { date: searchDate, time: searchTime });

                  await this.sendMessageThroughChannel(
                    channelConnection,
                    contact,
                    clarificationMessage,
                    conversation,
                    true
                  );
                  return;
                }
              } catch (findError) {
                console.error('Error finding event by date/time:', findError);
                const errorMessage = await serverI18n.t('calendar.bot_need_event_id_or_datetime', language);
                await this.sendMessageThroughChannel(
                  channelConnection,
                  contact,
                  errorMessage,
                  conversation,
                  true
                );
                return;
              }
            }
          }

          if (!cancelEventId) {
            const errorMessage = await serverI18n.t('calendar.bot_need_event_id_or_datetime_short', language);
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
            return;
          }

          const sendUpdates = args.send_updates !== undefined ? args.send_updates : true;

          result = await googleCalendarService.deleteCalendarEvent(
            userId,
            companyId,
            cancelEventId || undefined, // Normalize empty string to undefined
            sendUpdates,
            eventLink
          );

          if (result.success) {
            if (eventLink) {
              successMessage = await serverI18n.t('calendar.bot_appointment_cancelled_via_link', language);
            } else {
              successMessage = await serverI18n.t('calendar.bot_appointment_cancelled', language);
            }
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_cancelling_appointment', language);
            throw new Error(result.error || errorMsg);
          }
          break;

        case 'list_calendar_events': {
          const requesterEmail = contact.email || undefined;


          let normalizedStartDate = args.start_date;
          let normalizedEndDate = args.end_date;

          if (normalizedStartDate) {
            const normalized = this.normalizeDateFormat(normalizedStartDate);
            if (normalized) {

              normalizedStartDate = normalized;
            }
          }

          if (normalizedEndDate) {
            const normalized = this.normalizeDateFormat(normalizedEndDate);
            if (normalized) {

              normalizedEndDate = normalized;
            }
          }

          let startDateTime = normalizedStartDate ? `${normalizedStartDate}T00:00:00Z` : args.time_min || args.timeMin;
          let endDateTime = normalizedEndDate ? `${normalizedEndDate}T23:59:59Z` : args.time_max || args.timeMax;


          let usingDefaultRange = false;
          if (!startDateTime || !endDateTime) {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            startDateTime = startDateTime || thirtyDaysAgo.toISOString();
            endDateTime = endDateTime || thirtyDaysLater.toISOString();
            usingDefaultRange = true;


          }

          result = await googleCalendarService.listCalendarEvents(
            userId,
            companyId,
            startDateTime,
            endDateTime,
            args.max_results || args.maxResults || 10,
            requesterEmail
          );

          if (result.success) {
            const events = result.items || [];
            if (events.length > 0) {

              const eventListPromises = events.map(async (event: any) => {
                let eventSummary = `• ${event.summary} - ${new Date(event.start.dateTime).toLocaleString()}`;


                if (requesterEmail && event.attendees && Array.isArray(event.attendees)) {
                  const isRequesterInvolved =
                    event.organizer?.email === requesterEmail ||
                    event.attendees.some((attendee: any) =>
                      attendee.email?.toLowerCase() === requesterEmail.toLowerCase()
                    );

                  if (isRequesterInvolved) {
                    const attendeeNames = event.attendees
                      .map((a: any) => a.email || a.displayName)
                      .filter(Boolean)
                      .join(', ');
                    if (attendeeNames) {
                      const attendeesLabel = await serverI18n.t('calendar.bot_attendees', language, undefined, { attendees: attendeeNames });
                      eventSummary += `\n  ${attendeesLabel}`;
                    }
                  }
                }

                return eventSummary;
              });
              const eventList = (await Promise.all(eventListPromises)).join('\n');
              const upcomingMsg = await serverI18n.t('calendar.bot_upcoming_appointments', language);
              successMessage = `${upcomingMsg}\n${eventList}`;
            } else {
              successMessage = usingDefaultRange
                ? await serverI18n.t('calendar.bot_no_appointments_default', language)
                : await serverI18n.t('calendar.bot_no_appointments_period', language);
            }
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_listing_appointments', language);
            throw new Error(result.error || errorMsg);
          }
          break;
        }

        default:
          throw new Error(`Unknown calendar function: ${name}`);
      }

      if (successMessage) {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          successMessage,
          conversation,
          true
        );
      }

    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute a Zoho Calendar function call from AI Assistant
   */
  async executeZohoCalendarFunction(
    calendarFunction: any,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    nodeData: any
  ): Promise<void> {
    const { name, arguments: args } = calendarFunction;
    const language = nodeData.zohoCalendarLanguage || nodeData.language || 'en';

    try {
      const zohoCalendarModule = await import('../services/zoho-calendar');
      const zohoCalendarService = zohoCalendarModule.default;

      let userId = conversation.assignedToUserId;

      if (!userId) {
        userId = channelConnection.userId;
      }

      if (!userId && conversation.companyId) {
        const companyUsers = await storage.getUsersByCompany(conversation.companyId);
        const adminUser = companyUsers.find(user => user.role === 'admin') || companyUsers[0];
        userId = adminUser?.id || 1;
      }

      const companyId = conversation.companyId;
      const timeZone = nodeData.zohoCalendarTimeZone || 'UTC';

      if (!companyId) {
        throw new Error('Company ID is required for Zoho Calendar operations');
      }

      if (!userId) {
        throw new Error('Could not resolve user ID for Zoho Calendar operations');
      }

      let result: any;
      let successMessage = '';

      switch (name) {
        case 'zoho_check_availability': {
          const zohoBusinessHours = nodeData.zohoCalendarBusinessHours || { start: '09:00', end: '17:00' };
          let zohoBusinessHoursStart = parseInt(zohoBusinessHours.start.split(':')[0]) || 9;
          let zohoBusinessHoursEnd = parseInt(zohoBusinessHours.end.split(':')[0]) || 17;
          

          if (args.start_time) {
            const startTimeParts = args.start_time.split(':');
            zohoBusinessHoursStart = parseInt(startTimeParts[0]) || zohoBusinessHoursStart;
          }
          if (args.end_time) {
            const endTimeParts = args.end_time.split(':');
            zohoBusinessHoursEnd = parseInt(endTimeParts[0]) || zohoBusinessHoursEnd;
          }
          

          const zohoAdvancedSettings = nodeData.zohoCalendarAdvancedMode && nodeData.zohoCalendarAdvancedSettings
            ? nodeData.zohoCalendarAdvancedSettings
            : undefined;
          

          const zohoBufferMinutes = nodeData.zohoCalendarBufferMinutes || 0;
          
          result = await zohoCalendarService.getAvailableTimeSlots(
            userId,
            companyId,
            args.date,
            args.duration_minutes || args.duration || 30,
            undefined, // startDate
            undefined, // endDate
            zohoBusinessHoursStart,
            zohoBusinessHoursEnd,
            timeZone,
            zohoBufferMinutes, // Pass bufferMinutes to ensure consistency with booking behavior
            zohoAdvancedSettings
          );

          if (result.success) {
            const timeSlots = result.timeSlots || [];
            if (timeSlots.length > 0 && timeSlots[0].slots.length > 0) {
              const slotList = timeSlots[0].slots.join('\n');
              const message = await serverI18n.t('calendar.bot_available_slots_for', language, undefined, { date: args.date });
              successMessage = `${message}\n${slotList}`;
            } else {
              successMessage = await serverI18n.t('calendar.bot_no_available_slots', language, undefined, { date: args.date });
            }
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_checking_availability', language);
            throw new Error(result.error || errorMsg);
          }
          break;
        }

        case 'zoho_book_appointment': {
          const startDateTime = args.start_datetime || args.start_time || args.startDateTime;
          const endDateTime = args.end_datetime || args.end_time || args.endDateTime;
          
          const eventData = {
            summary: args.title || args.summary,
            description: args.description || '',
            location: args.location || 'Virtual',
            start: {
              dateTime: startDateTime,
              timeZone: timeZone
            },
            end: {
              dateTime: endDateTime,
              timeZone: timeZone
            },
            attendees: args.attendee_emails || args.attendees || [],
            bufferMinutes: nodeData.calendarBufferMinutes || 0
          };





          const bufferMinutes = eventData.bufferMinutes || 0;


          if (bufferMinutes === 0) {
            console.warn('[Zoho Calendar Booking] Warning: Calendar buffer is not configured (0 minutes). This may cause back-to-back bookings without spacing.');
          } else {

          }

          
          
          
          
          const zohoBusinessHours = nodeData.zohoCalendarBusinessHours || { start: '09:00', end: '17:00' };
          let zohoBusinessHoursStart = parseInt(zohoBusinessHours.start.split(':')[0]) || 9;
          let zohoBusinessHoursEnd = parseInt(zohoBusinessHours.end.split(':')[0]) || 17;
          

          const zohoAdvancedSettings = nodeData.zohoCalendarAdvancedMode && nodeData.zohoCalendarAdvancedSettings
            ? nodeData.zohoCalendarAdvancedSettings
            : undefined;
          
          const preBookingAvailability = await zohoCalendarService.getAvailableTimeSlots(
            userId,
            companyId,
            startDateTime.split('T')[0], // Extract date
            args.duration_minutes || args.duration || 30,
            undefined,
            undefined,
            zohoBusinessHoursStart,
            zohoBusinessHoursEnd,
            timeZone,
            bufferMinutes, // Use explicit bufferMinutes variable to ensure consistency
            zohoAdvancedSettings
          );
          
          
          
          if (preBookingAvailability.success && preBookingAvailability.timeSlots) {
            const requestedDate = startDateTime.split('T')[0];
            const dateSlots = preBookingAvailability.timeSlots.find(ts => ts.date === requestedDate);
            if (dateSlots) {

              const parseTimeString = (timeStr: string): { hours: number, minutes: number } | null => {

                const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
                if (!match) return null;
                
                let hours = parseInt(match[1]);
                const minutes = parseInt(match[2]);
                const period = match[3]?.toUpperCase();
                

                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                
                return { hours, minutes };
              };
              

              const requestedDateObj = new Date(startDateTime);
              const requestedHours = parseInt(requestedDateObj.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone }));
              const requestedMinutes = parseInt(requestedDateObj.toLocaleString('en-US', { minute: '2-digit', timeZone }));
              const requestedTotalMinutes = requestedHours * 60 + requestedMinutes;
              

              const requestedTime = requestedDateObj.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: timeZone
              });
              

              let isAvailable = false;
              let matchedSlot: string | null = null;
              
              for (const slot of dateSlots.slots) {
                const parsed = parseTimeString(slot);
                if (parsed) {
                  const slotTotalMinutes = parsed.hours * 60 + parsed.minutes;
                  if (slotTotalMinutes === requestedTotalMinutes) {
                    isAvailable = true;
                    matchedSlot = slot;
                    break;
                  }
                }
              }
              

              if (!isAvailable) {

                const normalizedRequested = requestedTime.trim().replace(/\s+/g, ' ').toUpperCase();
                for (const slot of dateSlots.slots) {
                  const normalizedSlot = slot.trim().replace(/\s+/g, ' ').toUpperCase();
                  if (normalizedSlot === normalizedRequested) {
                    isAvailable = true;
                    matchedSlot = slot;
                    break;
                  }
                }
              }
              
              console.log('[Zoho Calendar Booking] Time comparison:', { 
                requestedTime, 
                requestedDate: requestedDateObj.toISOString(),
                requestedDateObjISO: requestedDateObj.toISOString(),
                requestedDateObjLocale: requestedDateObj.toLocaleString('en-US', { timeZone }),
                timeZone,
                requestedTotalMinutes,
                availableSlots: dateSlots.slots, 
                isAvailable,
                matchedSlot
              });
              
              if (!isAvailable) {

                const slotList = dateSlots.slots.length > 0 
                  ? dateSlots.slots.join('\n')
                  : 'No available slots';
                
                const bufferMinutes = eventData.bufferMinutes || 0;
                const duration = args.duration_minutes || args.duration || 30;
                const bufferNote = bufferMinutes > 0 
                  ? await serverI18n.t('calendar.bot_buffer_warning', language, undefined, { buffer: bufferMinutes })
                  : '';
                const bufferNoteText = bufferMinutes > 0 
                  ? await serverI18n.t('calendar.bot_buffer_note', language, undefined, { buffer: bufferMinutes })
                  : '';
                const durationNote = await serverI18n.t('calendar.bot_slots_duration_note', language, undefined, { 
                  duration, 
                  bufferNote: bufferNoteText
                });
                const slotUnavailableMsg = await serverI18n.t('calendar.bot_slot_no_longer_available', language, undefined, { time: requestedTime, date: requestedDate });
                const selectTimeMsg = await serverI18n.t('calendar.bot_select_time_from_options', language);
                const followUpMessage = `${slotUnavailableMsg}\n\n${slotList}\n\n${durationNote}${bufferNote ? '\n\n' + bufferNote : ''}\n${selectTimeMsg}`;
                

                await this.sendMessageThroughChannel(channelConnection, contact, followUpMessage, conversation);
                return; // End the tool run after sending the message
              }
            }
          }

          
          
          result = await zohoCalendarService.createCalendarEvent(
            userId,
            companyId,
            eventData
          );
          
          

          if (result.success) {
            const { formatDateTimeForUser } = await import('../utils/timezone');
            const eventDate = formatDateTimeForUser(new Date(eventData.start.dateTime), timeZone, { includeTimezone: true });
            const duration = args.duration_minutes || args.duration || 30;

            const scheduledMsg = await serverI18n.t('calendar.bot_appointment_scheduled', language);
            const detailsMsg = await serverI18n.t('calendar.bot_appointment_details', language, undefined, {
              summary: eventData.summary,
              date: eventDate,
              duration: duration,
              location: eventData.location || 'Virtual'
            });
            const linkMsg = result.eventLink ? await serverI18n.t('calendar.bot_event_link', language, undefined, { link: result.eventLink }) : '';
            const invitationMsg = await serverI18n.t('calendar.bot_calendar_invitation', language);
            successMessage = `${scheduledMsg}\n\n${detailsMsg}${linkMsg ? '\n\n' + linkMsg : ''}\n\n${invitationMsg}`;
          } else {
            const errorMsgKey = await serverI18n.t('calendar.bot_error_booking_appointment', language);
            const errorMsg = result.error || errorMsgKey;
            

            if (errorMsg.includes('not available') || errorMsg.includes('conflict')) {
              const fallbackMsg = await serverI18n.t('calendar.bot_slot_not_available_short', language);
              throw new Error(fallbackMsg);
            }
            

            const fallbackMsg = await serverI18n.t('calendar.bot_slot_not_available_short', language);
            throw new Error(fallbackMsg);
          }
          break;
        }

        case 'zoho_update_calendar_event': {
          const updateData = {
            summary: args.title || args.summary,
            description: args.description || '',
            location: args.location || '',
            start: {
              dateTime: args.start_datetime || args.start_time || args.startDateTime,
              timeZone: timeZone
            },
            end: {
              dateTime: args.end_datetime || args.end_time || args.endDateTime,
              timeZone: timeZone
            },
            attendees: args.attendee_emails || args.attendees || []
          };

          result = await zohoCalendarService.updateCalendarEvent(
            userId,
            companyId,
            args.event_id || args.eventId,
            updateData
          );

          if (result.success) {
            const { formatDateTimeForUser } = await import('../utils/timezone');
            const newEventDate = formatDateTimeForUser(new Date(updateData.start.dateTime), timeZone, { includeTimezone: true });
            const updatedMsg = await serverI18n.t('calendar.bot_appointment_updated', language);
            const detailsMsg = await serverI18n.t('calendar.bot_appointment_updated_details', language, undefined, {
              summary: updateData.summary,
              date: newEventDate
            });
            successMessage = `${updatedMsg}\n\n${detailsMsg}`;
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_updating_appointment', language);
            throw new Error(result.error || errorMsg);
          }
          break;
        }

        case 'zoho_cancel_calendar_event': {
          result = await zohoCalendarService.deleteCalendarEvent(
            userId,
            companyId,
            args.event_id || args.eventId
          );

          if (result.success) {
            successMessage = await serverI18n.t('calendar.bot_appointment_cancelled', language);
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_cancelling_appointment', language);
            throw new Error(result.error || errorMsg);
          }
          break;
        }

        case 'zoho_list_calendar_events': {
          const startDateTime = args.start_date ? `${args.start_date}T00:00:00Z` : args.time_min || args.timeMin;
          const endDateTime = args.end_date ? `${args.end_date}T23:59:59Z` : args.time_max || args.timeMax;

          result = await zohoCalendarService.listCalendarEvents(
            userId,
            companyId,
            startDateTime,
            endDateTime,
            args.max_results || args.maxResults || 10
          );

          if (result.success) {
            const { formatDateTimeForUser } = await import('../utils/timezone');
            const events = result.items || [];
            if (events.length > 0) {
              const eventList = events.map((event: any) =>
                `• ${event.summary} - ${formatDateTimeForUser(new Date(event.start.dateTime), timeZone, { includeTimezone: true })}`
              ).join('\n');
              const upcomingMsg = await serverI18n.t('calendar.bot_upcoming_appointments', language);
              successMessage = `${upcomingMsg}\n${eventList}`;
            } else {
              successMessage = await serverI18n.t('calendar.bot_no_appointments_period', language);
            }
          } else {
            const errorMsg = await serverI18n.t('calendar.bot_error_listing_appointments', language);
            throw new Error(result.error || errorMsg);
          }
          break;
        }

        default:
          throw new Error(`Unknown Zoho Calendar function: ${name}`);
      }

      if (successMessage) {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          successMessage,
          conversation,
          true
        );
      }

    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute Bot Disable node with execution context
   */
  private async executeBotDisableNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};

      const triggerMethod = data.triggerMethod || 'always';
      let shouldDisable = false;

      if (triggerMethod === 'always') {
        shouldDisable = true;
      } else if (triggerMethod === 'keyword') {
        const keyword = data.keyword || 'agent';
        const caseSensitive = data.caseSensitive || false;
        const userInput = context.getVariable('message.content') || '';

        if (caseSensitive) {
          shouldDisable = userInput.includes(keyword);
        } else {
          shouldDisable = userInput.toLowerCase().includes(keyword.toLowerCase());
        }
      }

      if (shouldDisable) {
        let durationMinutes: number | null = null;
        const disableDuration = data.disableDuration || '30';

        if (disableDuration === 'manual') {
          durationMinutes = null;
        } else if (disableDuration === 'custom') {
          const customDuration = data.customDuration || 60;
          const customDurationUnit = data.customDurationUnit || 'minutes';

          switch (customDurationUnit) {
            case 'minutes':
              durationMinutes = customDuration;
              break;
            case 'hours':
              durationMinutes = customDuration * 60;
              break;
            case 'days':
              durationMinutes = customDuration * 60 * 24;
              break;
            default:
              durationMinutes = customDuration;
          }
        } else {
          durationMinutes = parseInt(disableDuration);
        }

        const assignToAgent = data.assignToAgent;
        let assignToUserId: number | null = null;

        if (assignToAgent && assignToAgent !== 'auto') {
          const parsedUserId = parseInt(assignToAgent);
          if (!isNaN(parsedUserId)) {
            assignToUserId = parsedUserId;
          }
        }

        await this.disableBot(
          conversation.id,
          durationMinutes || undefined,
          `Triggered by ${triggerMethod === 'keyword' ? `keyword "${data.keyword}"` : 'flow node'}`,
          assignToUserId || undefined
        );

        const handoffMessage = data.handoffMessage || 'Your request has been forwarded to our support team. An agent will assist you shortly.';

        if (handoffMessage) {
          const insertMessage = {
            conversationId: conversation.id,
            contactId: contact.id,
            channelType: channelConnection.channelType,
            type: 'text',
            content: context.replaceVariables(handoffMessage),
            direction: 'outbound',
            status: 'sent',
            mediaUrl: null,
            timestamp: new Date()
          };

          await storage.createMessage(insertMessage);


          try {
            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              context.replaceVariables(handoffMessage),
              conversation,
              true
            );
          } catch (error) {
            console.error('Error sending handoff message through channel:', error);
          }
        }

        context.setVariable('bot.disabled', true);
        context.setVariable('bot.disabledAt', new Date().toISOString());
        context.setVariable('bot.disableDuration', durationMinutes);
        context.setVariable('bot.assignedAgent', assignToUserId);

      } else {
        context.setVariable('bot.disableTriggerMet', false);
      }

    } catch (error) {
      context.setVariable('bot.disableError', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Execute Stripe node with execution context
   */
  private async executeStripeNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      context.updateCurrentTimeVariables();

      const data = node.data || {};


      const apiKey = context.replaceVariables(data.apiKey || '');
      const operation = data.operation || '';
      const resource = data.resource || '';

      if (!apiKey) {
        throw new Error('Stripe API key is required');
      }

      if (!operation) {
        throw new Error('Stripe operation is required');
      }

      if (!resource) {
        throw new Error('Stripe resource type is required');
      }


      const stripe = new Stripe(apiKey, { apiVersion: '2025-09-30.clover' as any });


      const idempotencyKey = randomUUID();
      context.setVariable('stripe.idempotencyKey', idempotencyKey);


      const metadata: Record<string, string> = {};
      if (data.metadata && Array.isArray(data.metadata)) {
        data.metadata.forEach((item: { key?: string; value?: string }) => {
          if (item.key && item.value !== undefined) {
            const key = context.replaceVariables(item.key);
            const value = context.replaceVariables(item.value);
            metadata[key] = value;
          }
        });
      }

      let response: any;


      switch (resource) {
        case 'customer': {
          switch (operation) {
            case 'create': {
              const customerData: Stripe.CustomerCreateParams = {
                email: data.email ? context.replaceVariables(data.email) : undefined,
                name: data.name ? context.replaceVariables(data.name) : undefined,
                phone: data.phone ? context.replaceVariables(data.phone) : undefined,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
              };
              response = await stripe.customers.create(customerData, {
                idempotencyKey
              });
              break;
            }
            case 'get': {
              const customerId = context.replaceVariables(data.customerId || '');
              if (!customerId) {
                throw new Error('Customer ID is required for get operation');
              }
              response = await stripe.customers.retrieve(customerId);
              break;
            }
            case 'update': {
              const customerId = context.replaceVariables(data.customerId || '');
              if (!customerId) {
                throw new Error('Customer ID is required for update operation');
              }
              const updateData: Stripe.CustomerUpdateParams = {};
              if (data.email) updateData.email = context.replaceVariables(data.email);
              if (data.name) updateData.name = context.replaceVariables(data.name);
              if (data.phone) updateData.phone = context.replaceVariables(data.phone);
              if (Object.keys(metadata).length > 0) updateData.metadata = metadata;
              response = await stripe.customers.update(customerId, updateData);
              break;
            }
            case 'delete': {
              const customerId = context.replaceVariables(data.customerId || '');
              if (!customerId) {
                throw new Error('Customer ID is required for delete operation');
              }
              response = await stripe.customers.del(customerId);
              break;
            }
            default:
              throw new Error(`Unsupported customer operation: ${operation}`);
          }
          break;
        }

        case 'payment': {
          switch (operation) {
            case 'createCharge': {
              let amount: number;
              const amountValue = context.replaceVariables(data.amount || '');
              const amountFormat = data.amountFormat || 'cents';

              if (amountFormat === 'decimal') {
                const decimalAmount = parseFloat(amountValue);
                if (isNaN(decimalAmount) || decimalAmount <= 0) {
                  throw new Error('Invalid amount: must be a positive number');
                }
                amount = Math.round(decimalAmount * 100);
              } else {
                amount = parseInt(amountValue);
                if (isNaN(amount) || amount <= 0) {
                  throw new Error('Invalid amount: must be a positive integer');
                }
              }

              const chargeData: Stripe.ChargeCreateParams = {
                amount,
                currency: context.replaceVariables(data.currency || 'usd'),
                source: data.source ? context.replaceVariables(data.source) : undefined,
                customer: data.customer ? context.replaceVariables(data.customer) : undefined,
                description: data.description ? context.replaceVariables(data.description) : undefined,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
              };
              response = await stripe.charges.create(chargeData, {
                idempotencyKey
              });
              break;
            }
            case 'createPaymentIntent': {
              let amount: number;
              const amountValue = context.replaceVariables(data.amount || '');
              const amountFormat = data.amountFormat || 'cents';

              if (amountFormat === 'decimal') {
                const decimalAmount = parseFloat(amountValue);
                if (isNaN(decimalAmount) || decimalAmount <= 0) {
                  throw new Error('Invalid amount: must be a positive number');
                }
                amount = Math.round(decimalAmount * 100);
              } else {
                amount = parseInt(amountValue);
                if (isNaN(amount) || amount <= 0) {
                  throw new Error('Invalid amount: must be a positive integer');
                }
              }

              const paymentIntentData: Stripe.PaymentIntentCreateParams = {
                amount,
                currency: context.replaceVariables(data.currency || 'usd'),
                customer: data.customer ? context.replaceVariables(data.customer) : undefined,
                payment_method: data.paymentMethod ? context.replaceVariables(data.paymentMethod) : undefined,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
              };
              response = await stripe.paymentIntents.create(paymentIntentData, {
                idempotencyKey
              });
              break;
            }
            case 'refund': {
              const refundData: Stripe.RefundCreateParams = {
                charge: data.charge ? context.replaceVariables(data.charge) : undefined,
                payment_intent: data.paymentIntent ? context.replaceVariables(data.paymentIntent) : undefined,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined
              };

              if (data.amount) {
                let amount: number;
                const amountValue = context.replaceVariables(data.amount);
                const amountFormat = data.amountFormat || 'cents';

                if (amountFormat === 'decimal') {
                  const decimalAmount = parseFloat(amountValue);
                  if (isNaN(decimalAmount) || decimalAmount <= 0) {
                    throw new Error('Invalid refund amount: must be a positive number');
                  }
                  amount = Math.round(decimalAmount * 100);
                } else {
                  amount = parseInt(amountValue);
                  if (isNaN(amount) || amount <= 0) {
                    throw new Error('Invalid refund amount: must be a positive integer');
                  }
                }
                refundData.amount = amount;
              }

              if (!refundData.charge && !refundData.payment_intent) {
                throw new Error('Either charge or payment_intent is required for refund operation');
              }

              response = await stripe.refunds.create(refundData, {
                idempotencyKey
              });
              break;
            }
            default:
              throw new Error(`Unsupported payment operation: ${operation}`);
          }
          break;
        }

        case 'subscription': {
          switch (operation) {
            case 'create': {
              const customerId = context.replaceVariables(data.customer || '');
              if (!customerId) {
                throw new Error('Customer ID is required for subscription creation');
              }

              const subscriptionData: Stripe.SubscriptionCreateParams = {
                customer: customerId,
                items: []
              };

              if (data.priceId) {
                subscriptionData.items = [{
                  price: context.replaceVariables(data.priceId)
                }];
              } else if (data.plan) {
                subscriptionData.items = [{
                  plan: context.replaceVariables(data.plan)
                }];
              } else {
                throw new Error('Either priceId or plan is required for subscription creation');
              }

              if (Object.keys(metadata).length > 0) {
                subscriptionData.metadata = metadata;
              }

              response = await stripe.subscriptions.create(subscriptionData, {
                idempotencyKey
              });
              break;
            }
            case 'get': {
              const subscriptionId = context.replaceVariables(data.subscriptionId || '');
              if (!subscriptionId) {
                throw new Error('Subscription ID is required for get operation');
              }
              response = await stripe.subscriptions.retrieve(subscriptionId);
              break;
            }
            case 'update': {
              const subscriptionId = context.replaceVariables(data.subscriptionId || '');
              if (!subscriptionId) {
                throw new Error('Subscription ID is required for update operation');
              }
              const updateData: Stripe.SubscriptionUpdateParams = {};
              if (data.priceId) {
                updateData.items = [{
                  price: context.replaceVariables(data.priceId)
                }];
              }
              if (Object.keys(metadata).length > 0) {
                updateData.metadata = metadata;
              }
              response = await stripe.subscriptions.update(subscriptionId, updateData);
              break;
            }
            case 'cancel': {
              const subscriptionId = context.replaceVariables(data.subscriptionId || '');
              if (!subscriptionId) {
                throw new Error('Subscription ID is required for cancel operation');
              }
              response = await stripe.subscriptions.cancel(subscriptionId);
              break;
            }
            default:
              throw new Error(`Unsupported subscription operation: ${operation}`);
          }
          break;
        }

        case 'balance': {
          switch (operation) {
            case 'getBalance': {
              response = await stripe.balance.retrieve();
              break;
            }
            case 'listTransactions': {
              const listParams: Stripe.BalanceTransactionListParams = {};
              if (data.limit) {
                listParams.limit = parseInt(context.replaceVariables(data.limit.toString()));
              }
              if (data.startingAfter) {
                listParams.starting_after = context.replaceVariables(data.startingAfter);
              }
              response = await stripe.balanceTransactions.list(listParams);
              break;
            }
            default:
              throw new Error(`Unsupported balance operation: ${operation}`);
          }
          break;
        }

        default:
          throw new Error(`Unsupported resource type: ${resource}`);
      }


      context.setVariable('stripe.lastResponse', response);
      context.setVariable('stripe.response', {
        data: response,
        timestamp: new Date().toISOString()
      });


      if (response && typeof response === 'object') {
        Object.entries(response).forEach(([key, value]) => {
          context.setVariable(`stripe.${key}`, value);
        });
      }


      context.setVariable('stripe.operation', operation);
      context.setVariable('stripe.resource', resource);


      if (data.successMessage) {
        const successMessage = context.replaceVariables(data.successMessage);
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          successMessage,
          conversation,
          true
        );
      }

    } catch (error: any) {

      const errorMessage = error instanceof Error ? error.message : 'Stripe operation failed';


      const errorDetails: any = {
        message: errorMessage,
        timestamp: new Date().toISOString()
      };

      if (error.code) {
        errorDetails.code = error.code;
      }
      if (error.type) {
        errorDetails.type = error.type;
      }

      context.setVariable('stripe.error', errorDetails);


      const userMessage = `Stripe Error: ${errorMessage}. Please contact support.`;
      await this.sendMessageThroughChannel(
        channelConnection,
        contact,
        userMessage,
        conversation,
        true
      );


      context.setVariable('stripe.errorMessageSent', true);
    }
  }

  /**
   * Execute Bot Reset node with execution context
   */
  private async executeBotResetNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {

      const data = node.data || {};
      const resetScope = data.resetScope || 'bot_only';

      await this.enableBot(conversation.id);

      if (resetScope === 'bot_and_context' || resetScope === 'full_reset') {
        if (data.clearVariables) {
          if (typeof (context as any).variables?.clear === 'function') {
            (context as any).variables.clear();
          } else {
            const allVars = context.getAllVariables();
            Object.keys(allVars).forEach(key => context.setVariable(key, undefined));
          }
        }

        if (data.resetFlowPosition) {
          context.setVariable('flow.resetToStart', true);
        }
      }

      if (resetScope === 'full_reset') {
        context.setVariable('conversation.fullReset', true);
      }

      if (data.sendConfirmation && data.confirmationMessage) {
        const confirmationMessage = context.replaceVariables(data.confirmationMessage);

        const insertMessage = {
          conversationId: conversation.id,
          contactId: contact.id,
          channelType: channelConnection.channelType,
          type: 'text',
          content: confirmationMessage,
          direction: 'outbound',
          status: 'sent',
          mediaUrl: null,
          timestamp: new Date()
        };

        await storage.createMessage(insertMessage);


        try {
          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            confirmationMessage,
            conversation,
            true
          );
        } catch (error) {
          console.error('Error sending confirmation message through channel:', error);
        }
      }

      context.setVariable('bot.enabled', true);
      context.setVariable('bot.resetAt', new Date().toISOString());
      context.setVariable('bot.resetScope', resetScope);


    } catch (error) {
      console.error('Error executing Bot Reset node with context:', error);
      context.setVariable('bot.resetError', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check if bot is disabled for a conversation
   */
  async isBotDisabled(conversationId: number): Promise<boolean> {
    try {
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return false;

      if (!conversation.botDisabled) return false;

      if (conversation.disableDuration && conversation.disabledAt) {
        const disabledAt = new Date(conversation.disabledAt);
        const expiresAt = new Date(disabledAt.getTime() + (conversation.disableDuration * 60 * 1000));
        const now = new Date();

        if (now > expiresAt) {
          await this.enableBot(conversationId);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking bot disabled status:', error);
      return false;
    }
  }

  /**
   * Disable bot for a conversation
   */
  async disableBot(
    conversationId: number,
    duration?: number,
    reason?: string,
    assignToUserId?: number
  ): Promise<void> {
    try {
      await storage.updateConversation(conversationId, {
        botDisabled: true,
        disabledAt: new Date(),
        disableDuration: duration || null,
        disableReason: reason || null,
        assignedToUserId: assignToUserId || null
      });

    } catch (error) {
      console.error('Error disabling bot:', error);
    }
  }

  /**
   * Enable bot for a conversation
   */
  async enableBot(conversationId: number): Promise<void> {
    try {
      await storage.updateConversation(conversationId, {
        botDisabled: false,
        disabledAt: null,
        disableDuration: null,
        disableReason: null
      });

    } catch (error) {
      console.error('Error enabling bot:', error);
    }
  }

  /**
   * Check if incoming message matches any hard reset keyword from active flows
   */
  private async checkHardResetKeyword(
    message: Message,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<boolean> {
    try {

      if (!this.isValidIndividualContact(contact)) {
        return false;
      }
      if (message.type !== 'text' || !message.content) {
        return false;
      }

      const messageContent = message.content.trim();
      if (!messageContent) {
        return false;
      }

      const flowAssignments = await storage.getFlowAssignments(channelConnection.id);
      const activeAssignments = flowAssignments.filter(assignment => assignment.isActive);

      for (const assignment of activeAssignments) {
        const baseFlow = await storage.getFlow(assignment.flowId);
        if (!baseFlow) continue;

        const flow: Flow = { ...baseFlow, definition: (baseFlow as any).definition || null };
        const { nodes } = await this.parseFlowDefinition(flow);

        const triggerNodes = nodes.filter((node: any) =>
          node.type === 'triggerNode' ||
          node.type === 'trigger' ||
          (node.data && node.data.label === 'Message Trigger')
        );

        for (const triggerNode of triggerNodes) {
          const data = triggerNode.data || {};
          const hardResetKeyword = data.hardResetKeyword;

          if (hardResetKeyword && hardResetKeyword.trim()) {
            const keyword = hardResetKeyword.trim().toLowerCase();
            const userMessage = messageContent.toLowerCase();

            if (userMessage === keyword) {


              await this.performHardReset(conversation, contact, channelConnection, flow, triggerNode);
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking hard reset keyword:', error);
      return false;
    }
  }

  /**
   * Perform hard reset: re-enable bot, clear session state, and start fresh flow execution
   */
  private async performHardReset(
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection,
    flow: Flow,
    triggerNode: any
  ): Promise<void> {
    try {


      await this.enableBot(conversation.id);

      await this.clearConversationSessions(conversation.id);

      const waitingExecutions = this.executionManager.getWaitingExecutionsForConversation(conversation.id);
      for (const execution of waitingExecutions) {
        this.executionManager.completeExecution(execution.id);
      }

      const data = triggerNode.data || {};
      const confirmationMessage = data.hardResetConfirmationMessage ||
        'Bot has been reactivated. Starting fresh conversation...';

      if (confirmationMessage && confirmationMessage.trim()) {
        try {

          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            confirmationMessage,
            conversation,
            true
          );

          const recentMessages = await storage.getMessagesByConversationPaginated(conversation.id, 1, 0);
          if (recentMessages.length > 0) {
            const savedMessage = recentMessages[0];
            const existingMetadata = savedMessage.metadata
              ? (typeof savedMessage.metadata === 'string'
                 ? JSON.parse(savedMessage.metadata)
                 : savedMessage.metadata)
              : {};
            const updatedMetadata = {
              ...existingMetadata,
              hardReset: true
            };

            await storage.updateMessage(savedMessage.id, {
              metadata: JSON.stringify(updatedMetadata)
            });
          }
        } catch (channelError) {
          console.error('Error sending hard reset confirmation through channel:', channelError);

          const insertMessage = {
            conversationId: conversation.id,
            externalId: null,
            direction: 'outbound' as const,
            type: 'text',
            content: confirmationMessage,
            metadata: { hardReset: true },
            senderId: null,
            senderType: null,
            status: 'sent',
            sentAt: new Date(),
            readAt: null,
            isFromBot: true,
            mediaUrl: null,
            createdAt: new Date()
          };

          await storage.createMessage(insertMessage);
        }
      }

      const resetMessage: Message = {
        id: 0,
        conversationId: conversation.id,
        externalId: null,
        direction: 'inbound',
        type: 'text',
        content: data.hardResetKeyword || 'reset',
        metadata: { hardReset: true },
        senderId: contact.id,
        senderType: 'contact',
        status: 'received',
        sentAt: new Date(),
        readAt: null,
        isFromBot: false,
        mediaUrl: null,
        createdAt: new Date(),
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };

      if (this.matchesTrigger(triggerNode, resetMessage)) {
        const sessionId = await this.createSession(
          flow.id,
          conversation.id,
          contact.id,
          conversation.companyId || 0,
          triggerNode.id,
          {
            message: resetMessage,
            contact,
            conversation,
            channelConnection
          }
        );

        const session = this.activeSessions.get(sessionId);
        if (session) {
          session.variables.set('hardReset', true);
          session.variables.set('hardResetAt', new Date().toISOString());
          session.variables.set('hardResetKeyword', data.hardResetKeyword || 'reset');

          const { nodes, edges } = await this.parseFlowDefinition(flow);

          const resetContext = new FlowExecutionContext();
          resetContext.setMessageVariables(resetMessage);
          resetContext.setContactVariables(contact);
          resetContext.setVariable('hardReset', true);
          resetContext.setVariable('hardResetAt', new Date().toISOString());

          await this.executeConnectedNodesWithSession(
            session,
            triggerNode,
            nodes,
            edges,
            resetMessage,
            conversation,
            contact,
            channelConnection,
            resetContext
          );
        }
      }


    } catch (error) {
      console.error('Error performing hard reset:', error);
    }
  }

  /**
   * Clear all active sessions for a conversation
   */
  private async clearConversationSessions(conversationId: number): Promise<void> {
    try {
      const activeSessions = await this.getActiveSessionsForConversation(conversationId);

      for (const session of activeSessions) {
        await this.updateSession(session.sessionId, {
          status: 'completed'
        });

        this.activeSessions.delete(session.sessionId);

        try {

        } catch (error) {
          console.error(`Error clearing variables for session ${session.sessionId}:`, error);
        }
      }


    } catch (error) {
      console.error('Error clearing conversation sessions:', error);
    }
  }

  /**
   * Execute Google Sheets node with execution context
   */
  private async executeGoogleSheetsNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    _contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      context.updateCurrentTimeVariables();

      const data = node.data || {};
      const operation = data.operation || 'append_row';

      const serviceAccountJson = context.replaceVariables(data.serviceAccountJson || '');
      const spreadsheetId = context.replaceVariables(data.spreadsheetId || '');
      const sheetName = context.replaceVariables(data.sheetName || 'Sheet1');

      if (!spreadsheetId) {
        throw new Error('Google Sheets configuration missing: spreadsheetId required');
      }


      const flowId = context.getVariable('flow.id');
      let userId = channelConnection.userId;
      let companyId = conversation.companyId || channelConnection.companyId;


      if (flowId) {
        try {
          const flow = await storage.getFlow(flowId);
          if (flow && flow.userId) {

            userId = flow.userId;
            companyId = flow.companyId || companyId;
          }
        } catch (error) {
          console.warn('Could not fetch flow owner, falling back to channel connection user:', error);
        }
      }

      let result;
      let useOAuth = false;


      if (userId && companyId) {
        try {
          await (googleSheetsService as any).getSheetsClientWithOAuth(userId, companyId);
          useOAuth = true;
        } catch (oauthError) {
          console.warn(`Google Sheets node: OAuth authentication failed for user ${userId}:`, oauthError);
        }
      }


      if (!useOAuth && !serviceAccountJson) {
        throw new Error('Google Sheets authentication required: Please connect your Google account or provide Service Account JSON');
      }

      switch (operation) {
        case 'append_row':
          const columnMappings: Record<string, any> = {};
          if (data.config && data.config.columnMappings) {
            Object.entries(data.config.columnMappings).forEach(([columnName, value]) => {
              if (columnName && value !== undefined) {
                columnMappings[columnName] = context.replaceVariables(value as string);
              }
            });
          }

          const appendOptions: any = { columnMappings };
          if (data.config?.duplicateCheck?.enabled) {
            appendOptions.duplicateCheck = {
              enabled: true,
              columns: data.config.duplicateCheck.columns || [],
              caseSensitive: data.config.duplicateCheck.caseSensitive !== false,
              onDuplicate: data.config.duplicateCheck.onDuplicate || 'skip'
            };
          }

          if (useOAuth && userId && companyId) {
            result = await googleSheetsService.appendRowWithOAuth(userId, companyId, spreadsheetId, sheetName, appendOptions);
          } else {
            const config = { serviceAccountJson, spreadsheetId, sheetName };
            result = await googleSheetsService.appendRow(config, appendOptions);
          }
          break;

        case 'read_rows':
          const readOptions: any = {};
          if (data.config?.filterColumn) {
            readOptions.filterColumn = context.replaceVariables(data.config.filterColumn);
          }
          if (data.config?.filterValue !== undefined) {
            readOptions.filterValue = context.replaceVariables(data.config.filterValue);
          }
          if (data.config?.startRow) {
            readOptions.startRow = parseInt(context.replaceVariables(data.config.startRow.toString()));
          }
          if (data.config?.maxRows) {
            readOptions.maxRows = parseInt(context.replaceVariables(data.config.maxRows.toString()));
          }

          if (useOAuth && userId && companyId) {
            result = await googleSheetsService.readRowsWithOAuth(userId, companyId, spreadsheetId, sheetName, readOptions);
          } else {
            const config = { serviceAccountJson, spreadsheetId, sheetName };
            result = await googleSheetsService.readRows(config, readOptions);
          }
          break;

        case 'update_row':
          const matchColumn = context.replaceVariables(data.config?.matchColumn || '');
          const matchValue = context.replaceVariables(data.config?.matchValue || '');

          if (!matchColumn || matchValue === undefined) {
            throw new Error('Match column and match value are required for update_row operation');
          }

          const updateMappings: Record<string, any> = {};
          if (data.config && data.config.columnMappings) {
            Object.entries(data.config.columnMappings).forEach(([columnName, value]) => {
              if (columnName && value !== undefined) {
                updateMappings[columnName] = context.replaceVariables(value as string);
              }
            });
          }

          const updateOptions = {
            matchColumn,
            matchValue,
            columnMappings: updateMappings
          };

          if (useOAuth && userId && companyId) {
            result = await googleSheetsService.updateRowWithOAuth(userId, companyId, spreadsheetId, sheetName, updateOptions);
          } else {
            const config = { serviceAccountJson, spreadsheetId, sheetName };
            result = await googleSheetsService.updateRow(config, updateOptions);
          }
          break;

        case 'get_sheet_info':
          if (useOAuth && userId && companyId) {
            result = await googleSheetsService.getSheetInfoWithOAuth(userId, companyId, spreadsheetId, sheetName);
          } else {
            const config = { serviceAccountJson, spreadsheetId, sheetName };
            result = await googleSheetsService.getSheetInfo(config);
          }
          break;

        default:
          throw new Error(`Unsupported Google Sheets operation: ${operation}`);
      }

      context.setVariable('google_sheets.response', result);
      context.setVariable('google_sheets.success', result.success);
      context.setVariable('google_sheets.lastExecution', new Date().toISOString());

      if (result.success) {
        context.setVariable('google_sheets.data', result.data);
        if (result.rowsAffected !== undefined) {
          context.setVariable('google_sheets.rowsAffected', result.rowsAffected);
        }

        switch (operation) {
          case 'read_rows':
            if (result.data?.rows) {

              context.setVariable('google_sheets.rows', result.data.rows);
              context.setVariable('google_sheets.headers', result.data.headers || []);
              context.setVariable('google_sheets.totalRows', result.data.totalRows || 0);
              context.setVariable('google_sheets.range', result.data.range || '');


              result.data.rows.forEach((row: any, index: number) => {
                context.setVariable(`google_sheets.row_${index + 1}`, row);
              });


              if (result.data.headers && result.data.rows.length > 0) {
                result.data.headers.forEach((header: string) => {
                  const columnData = result.data.rows.map((row: any) => row[header] || '');
                  const variableName = `google_sheets.column_${header}`;
                  context.setVariable(variableName, columnData);

                });
              }
            }
            break;

          case 'get_sheet_info':
            if (result.data?.headers) {
              context.setVariable('google_sheets.headers', result.data.headers);
              context.setVariable('google_sheets.sheetName', result.data.sheetName || '');
              context.setVariable('google_sheets.title', result.data.title || '');
              context.setVariable('google_sheets.rowCount', result.data.rowCount || 0);
              context.setVariable('google_sheets.columnCount', result.data.columnCount || 0);
            }
            break;

          case 'append_row':
            if (result.data?.range) {
              context.setVariable('google_sheets.appendedRange', result.data.range);
              context.setVariable('google_sheets.rowsAdded', result.data.rowsAdded || 0);
            }
            break;

          case 'update_row':
            if (result.data) {
              context.setVariable('google_sheets.matchingRows', result.data.matchingRows || 0);
              context.setVariable('google_sheets.updatedRows', result.data.updatedRows || 0);
            }
            break;
        }
      } else {
        context.setVariable('google_sheets.error', result.error);
      }

      if (data.variableMappings && Array.isArray(data.variableMappings)) {
        data.variableMappings.forEach((mapping: any) => {
          if (mapping.responseField && mapping.variableName) {
            const value = this.getNestedValue(result, mapping.responseField);
            if (value !== undefined) {
              context.setVariable(mapping.variableName, value);
            }
          }
        });
      }

    } catch (error) {
      console.error('Error executing Google Sheets node with context:', error);
      context.setVariable('google_sheets.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute Data Capture node with execution context
   */
  private async executeDataCaptureNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    _channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      context.updateCurrentTimeVariables();

      const data = node.data || {};
      const captureRules = data.captureRules || [];
      const storageScope = data.storageScope || 'session';
      const overwriteExisting = data.overwriteExisting || false;
      const enableValidation = data.enableValidation !== false;

      if (!captureRules || captureRules.length === 0) {
        console.warn('Data Capture node has no capture rules configured');
        context.setVariable('data_capture.warning', 'No capture rules configured');
        return;
      }


      const messageContent = context.getVariable('message.content') || '';


      const sessionId = context.getVariable('session.id') || context.getVariable('flow.id') || 'default';


      const captureContext = {
        sessionId: String(sessionId),
        messageContent,
        contact: {
          ...contact,
          name: contact.name || undefined,
          phone: contact.phone || undefined,
          email: contact.email || undefined,
          company: contact.company || undefined
        },
        nodeId: node.id
      };


      const result = await dataCaptureService.captureData({
        captureRules,
        storageScope,
        overwriteExisting,
        enableValidation
      }, captureContext);


      context.setVariable('data_capture.success', result.success);
      context.setVariable('data_capture.capturedVariables', result.capturedVariables);
      context.setVariable('data_capture.capturedCount', Object.keys(result.capturedVariables).length);

      if (result.errors.length > 0) {
        context.setVariable('data_capture.errors', result.errors);
        context.setVariable('data_capture.errorCount', result.errors.length);
      }

      if (result.skipped.length > 0) {
        context.setVariable('data_capture.skipped', result.skipped);
        context.setVariable('data_capture.skippedCount', result.skipped.length);
      }


      Object.entries(result.capturedVariables).forEach(([key, value]) => {
        context.setVariable(key, value);
      });


    } catch (error) {
      console.error('Error executing Data Capture node with context:', error);
      context.setVariable('data_capture.error', {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Execute Documind node with execution context - Enhanced with error handling, URL processing, and conversation history
   */
  private async executeDocumindNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const apiKey = data.apiKey || '';
      const selectedFolder = data.selectedFolder || '';
      const operation = data.operation || 'ask_question';
      const rawQuestion = context.getVariable('message.content') || '';


      const enableHistory = data.enableHistory !== undefined ? data.enableHistory : false;
      const historyLimit = data.historyLimit || 5;


      const rawSystemPrompt = data.systemPrompt || '';
      const systemPrompt = context.replaceVariables(rawSystemPrompt);

      let question = rawQuestion;


      if (enableHistory) {
        try {
          const conversationHistory = await storage.getMessagesByConversationPaginated(conversation.id, historyLimit, 0);
          if (conversationHistory && conversationHistory.length > 0) {

            const historyText = conversationHistory
              .reverse()
              .map(msg => {
                const role = msg.direction === 'inbound' ? 'User' : 'Assistant';
                return `${role}: ${msg.content || ''}`;
              })
              .join('\n');

            question = `Previous conversation:\n${historyText}\n\nCurrent question: ${rawQuestion}`;
          }
        } catch (historyError) {
          console.warn('Failed to fetch conversation history for Documind:', historyError);
        }
      }


      if (systemPrompt) {
        question = `${systemPrompt}\n\n${question}`;
      }


      context.setVariable('documind.systemPrompt', systemPrompt || '');
      context.setVariable('documind.userQuestion', rawQuestion);
      context.setVariable('documind.finalQuestion', question);
      context.setVariable('documind.historyEnabled', enableHistory);
      context.setVariable('documind.historyLimit', historyLimit);


      if (!apiKey) {
        const errorMessage = 'Error: Documind node is not configured with an API key.';
        context.setVariable('documind.error', errorMessage);
        context.setVariable('documind.hasError', true);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      if (!selectedFolder) {
        const errorMessage = 'Error: No folder selected for Documind analysis.';
        context.setVariable('documind.error', errorMessage);
        context.setVariable('documind.hasError', true);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      if (!question.trim()) {
        const errorMessage = 'Error: No question provided for document analysis.';
        context.setVariable('documind.error', errorMessage);
        context.setVariable('documind.hasError', true);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const folderFormData = new FormData();
        folderFormData.append('secretkey', apiKey);
        folderFormData.append('question', question);
        folderFormData.append('folder_id', selectedFolder);

        const response = await fetch('https://documind.onrender.com/api-ask-from-collection-stream', {
          method: 'POST',
          body: folderFormData,
          signal: controller.signal
        });

        if (response.ok) {
          if (!response.body) {
            const errorMessage = 'Documind API error: No response body received';
            context.setVariable('documind.error', errorMessage);
            context.setVariable('documind.hasError', true);
            await this.sendMessageThroughChannel(channelConnection, contact, errorMessage, conversation, true);
            clearTimeout(timeoutId);
            return;
          }


          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullAnswer = '';
          let documents: any[] = [];
          let status = 200;
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                break;
              }


              buffer += decoder.decode(value, { stream: true });


              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data:')) {
                  try {
                    const jsonStr = trimmedLine.substring(5).trim(); // Remove 'data:' prefix
                    if (jsonStr) {
                      const chunkData = JSON.parse(jsonStr);
                      

                      if (chunkData.status !== undefined) {
                        status = chunkData.status;
                      }


                      if (chunkData.data && chunkData.data.answer !== undefined) {
                        fullAnswer += chunkData.data.answer;
                      }


                      if (chunkData.data && chunkData.data.documents && documents.length === 0) {
                        documents = chunkData.data.documents;
                      }
                    }
                  } catch (parseError) {
                    console.warn('Failed to parse SSE chunk:', parseError);

                  }
                }
              }
            }


            buffer += decoder.decode(new Uint8Array(), { stream: false });


            if (buffer.trim().startsWith('data:')) {
              try {
                const jsonStr = buffer.substring(5).trim();
                if (jsonStr) {
                  const chunkData = JSON.parse(jsonStr);
                  if (chunkData.status !== undefined) {
                    status = chunkData.status;
                  }
                  if (chunkData.data && chunkData.data.answer !== undefined) {
                    fullAnswer += chunkData.data.answer;
                  }
                  if (chunkData.data && chunkData.data.documents && documents.length === 0) {
                    documents = chunkData.data.documents;
                  }
                }
              } catch (parseError) {
                console.warn('Failed to parse final SSE chunk:', parseError);
              }
            }


            if (status !== 200) {
              const errorMessage = `Documind API error: Failed to process question (status: ${status})`;
              context.setVariable('documind.error', errorMessage);
              context.setVariable('documind.hasError', true);
              await this.sendMessageThroughChannel(channelConnection, contact, errorMessage, conversation, true);
              clearTimeout(timeoutId);
              return;
            }


            if (fullAnswer && fullAnswer !== 'No results found') {
              let answer = fullAnswer;

              const urlsFound = await this.detectAndProcessUrls(answer, channelConnection, contact, conversation);

              let finalAnswer = answer;
              if (urlsFound.length > 0) {
                finalAnswer = this.removeUrlsFromText(answer, urlsFound);
              }

              if (channelConnection.channelType === 'whatsapp' || channelConnection.channelType === 'whatsapp_unofficial') {
                finalAnswer = this.formatResponseForWhatsApp(finalAnswer);
              }

              context.setVariable('documind.response', finalAnswer);
              context.setVariable('documind.originalResponse', answer);
              context.setVariable('documind.urlsFound', urlsFound);
              context.setVariable('documind.question', question);
              context.setVariable('documind.operation', operation);
              context.setVariable('documind.folder', selectedFolder);
              context.setVariable('documind.document', ''); // No specific document when querying folder
              context.setVariable('documind.lastExecution', new Date().toISOString());
              context.setVariable('documind.hasError', false);

              if (finalAnswer.trim()) {
                await this.sendMessageThroughChannel(
                  channelConnection,
                  contact,
                  finalAnswer,
                  conversation,
                  true
                );
              }

              clearTimeout(timeoutId);
              return;
            } else {
              const errorMessage = 'No results found for your question in the selected folder.';
              context.setVariable('documind.error', errorMessage);
              context.setVariable('documind.hasError', true);

              await this.sendMessageThroughChannel(
                channelConnection,
                contact,
                errorMessage,
                conversation,
                true
              );
              clearTimeout(timeoutId);
              return;
            }
          } catch (streamError) {

            const errorMessage = `Documind API stream error: ${streamError instanceof Error ? streamError.message : 'Unknown error'}`;
            context.setVariable('documind.error', errorMessage);
            context.setVariable('documind.hasError', true);
            await this.sendMessageThroughChannel(channelConnection, contact, errorMessage, conversation, true);
            clearTimeout(timeoutId);
            return;
          }
        } else {
          let errorMessage = `Documind API request failed with status ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = `Documind API error: ${errorData.message}`;
            }
          } catch (parseError) {

          }

          context.setVariable('documind.error', errorMessage);
          context.setVariable('documind.hasError', true);

          await this.sendMessageThroughChannel(channelConnection, contact, errorMessage, conversation, true);
          clearTimeout(timeoutId);
          return;
        }

      } catch (apiError) {
        clearTimeout(timeoutId);
        const errorMessage = `Documind API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`;
        context.setVariable('documind.error', errorMessage);
        context.setVariable('documind.hasError', true);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
      }

    } catch (error) {
      console.error('Error executing Documind node with context:', error);
      const errorMessage = `Documind execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      context.setVariable('documind.error', errorMessage);
      context.setVariable('documind.hasError', true);

      try {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  }

  /**
   * Detect URLs in text and process them as media messages
   * Returns array of URLs that were processed
   */
  private async detectAndProcessUrls(
    text: string,
    channelConnection: ChannelConnection,
    contact: Contact,
    conversation: Conversation
  ): Promise<string[]> {

    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const rawUrls = text.match(urlRegex) || [];
    const processedUrls: string[] = [];

    for (const rawUrl of rawUrls) {
      try {

        const url = rawUrl.replace(/[)\]}>.,;!?]+$/, '');

        const mediaType = await this.detectMediaType(url);

        if (mediaType) {
          try {
            switch (mediaType) {
              case 'image':
                await this.sendImageMessage(channelConnection, contact, url, conversation);
                processedUrls.push(rawUrl); // Use original URL for text removal
                break;

              case 'video':
                await this.sendVideoMessage(channelConnection, contact, url, conversation);
                processedUrls.push(rawUrl); // Use original URL for text removal
                break;

              case 'audio':
                await this.sendAudioMessage(channelConnection, contact, url, conversation);
                processedUrls.push(rawUrl); // Use original URL for text removal
                break;

              case 'document':
                await this.sendDocumentMessage(channelConnection, contact, url, conversation);
                processedUrls.push(rawUrl); // Use original URL for text removal
                break;
            }
          } catch (sendError) {
            console.error(`Failed to send ${mediaType} message for ${url}:`, sendError);

          }
        }
      } catch (error) {
        console.warn(`Failed to process URL ${rawUrl}:`, error);

      }
    }
    return processedUrls;
  }

  /**
   * Detect media type of a URL based on file extension and content-type
   */
  private async detectMediaType(url: string): Promise<string | null> {
    try {


      if (url.includes('youtube.com/watch') || url.includes('youtu.be/') || url.includes('youtube.com/shorts/')) {
        return null; // Don't process as media, keep as text link
      }



      if (url.includes('img.youtube.com') || url.includes('i.ytimg.com')) {
        return null; // Don't process as media, let WhatsApp handle the preview
      }


      const urlPath = new URL(url).pathname.toLowerCase();


      if (/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(urlPath)) {
        return 'image';
      }


      if (/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)$/i.test(urlPath)) {
        return 'video';
      }


      if (/\.(mp3|wav|ogg|aac|flac|m4a|wma)$/i.test(urlPath)) {
        return 'audio';
      }


      if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/i.test(urlPath)) {
        return 'document';
      }


      try {
        const headController = new AbortController();
        const headTimeoutId = setTimeout(() => headController.abort(), 5000); // 5 second timeout

        const response = await fetch(url, {
          method: 'HEAD',
          signal: headController.signal
        });

        clearTimeout(headTimeoutId);

        const contentType = response.headers.get('content-type')?.toLowerCase() || '';

        if (contentType.startsWith('image/')) {
          return 'image';
        } else if (contentType.startsWith('video/')) {
          return 'video';
        } else if (contentType.startsWith('audio/')) {
          return 'audio';
        } else if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('text/')) {
          return 'document';
        }



        if (url.includes('documind') || url.includes('image') || url.includes('photo') || url.includes('picture')) {
          return 'image';
        }
      } catch (headError) {
        console.warn(`Failed to check content-type for ${url}:`, headError);


        if (url.includes('documind') || url.includes('image') || url.includes('photo') || url.includes('picture')) {
          return 'image';
        }
      }

      return null; // Unknown type
    } catch (error) {
      console.warn(`Failed to detect media type for ${url}:`, error);
      return null;
    }
  }

  /**
   * Send image message via channel
   */
  private async sendImageMessage(
    channelConnection: ChannelConnection,
    contact: Contact,
    imageUrl: string,
    conversation: Conversation
  ): Promise<void> {
    try {
      await this.sendMediaThroughChannel(
        channelConnection,
        contact,
        imageUrl,
        'image',
        undefined, // caption
        undefined, // filename
        conversation,
        true
      );
    } catch (error) {
      console.error('Failed to send image message:', error);
      throw error;
    }
  }

  /**
   * Send video message via channel
   */
  private async sendVideoMessage(
    channelConnection: ChannelConnection,
    contact: Contact,
    videoUrl: string,
    conversation: Conversation
  ): Promise<void> {
    try {
      await this.sendMediaThroughChannel(
        channelConnection,
        contact,
        videoUrl,
        'video',
        undefined, // caption
        undefined, // filename
        conversation,
        true
      );
    } catch (error) {
      console.error('Failed to send video message:', error);
      throw error;
    }
  }

  /**
   * Send audio message via channel
   */
  private async sendAudioMessage(
    channelConnection: ChannelConnection,
    contact: Contact,
    audioUrl: string,
    conversation: Conversation
  ): Promise<void> {
    try {
      await this.sendMediaThroughChannel(
        channelConnection,
        contact,
        audioUrl,
        'audio',
        undefined, // caption
        undefined, // filename
        conversation,
        true
      );
    } catch (error) {
      console.error('Failed to send audio message:', error);
      throw error;
    }
  }

  /**
   * Send document message via channel
   */
  private async sendDocumentMessage(
    channelConnection: ChannelConnection,
    contact: Contact,
    documentUrl: string,
    conversation: Conversation
  ): Promise<void> {
    try {
      await this.sendMediaThroughChannel(
        channelConnection,
        contact,
        documentUrl,
        'document',
        undefined, // caption
        undefined, // filename
        conversation,
        true
      );
    } catch (error) {
      console.error('Failed to send document message:', error);
      throw error;
    }
  }

  /**
   * Remove processed URLs from text response while preserving formatting
   */
  private removeUrlsFromText(text: string, urlsToRemove: string[]): string {
    let cleanedText = text;

    for (const url of urlsToRemove) {

      const urlRegex = new RegExp(`\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'gi');
      cleanedText = cleanedText.replace(urlRegex, ' ');
    }


    cleanedText = cleanedText
      .replace(/[ \t]+/g, ' ')  // Replace multiple spaces/tabs with single space
      .replace(/[ \t]*\n[ \t]*/g, '\n')  // Clean spaces around line breaks
      .replace(/\n{3,}/g, '\n\n')  // Limit consecutive line breaks to max 2
      .trim();

    return cleanedText;
  }

  /**
   * Format response text for WhatsApp by cleaning up markdown and formatting
   */
  private formatResponseForWhatsApp(text: string): string {
    if (!text) return text;

    let formattedAnswer = text
      .replace(/\*\*/g, '*')
      .replace(/###/g, '')
      .replace(/!\[image\]\(https?:\/\/[^\s]+\)/g, '')
      .replace(/!\[video\]\(https?:\/\/[^\s]+\)/g, '')
      .replace(/!\[document\]\(https?:\/\/[^\s]+\)/g, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1')
      .replace(/(https?:\/\/[^\s]+(?:\.jpg|\.jpeg|\.png|\.gif))/g, '')
      .replace(/(https?:\/\/[^\s]+(?:\.mp4|\.mov|\.avi|\.mkv|\.webm))/g, '')
      .replace(/(https?:\/\/[^\s]+\.pdf)/g, '')
      .replace(/\$\*\d+\.\*/g, '')
      .replace(/\n\{3,\}/g, '\n\n')
      .trim();

    return formattedAnswer;
  }

  /**
   * Execute Chat PDF node with execution context
   */
  private async executeChatPdfNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const apiKey = data.apiKey || '';
      const selectedDocument = data.selectedDocument || '';
      const operation = data.operation || 'ask_question';
      const gptModel = data.gptModel || 'gpt-4o';
      const question = context.getVariable('message.content') || '';

      if (!apiKey) {
        const errorMessage = 'Error: Chat PDF node is not configured with an API key.';
        context.setVariable('chatpdf.error', errorMessage);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      if (!selectedDocument) {
        const errorMessage = 'Error: No document selected for Chat PDF analysis.';
        context.setVariable('chatpdf.error', errorMessage);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      try {
        const documentsResponse = await fetch('https://pdf.ai/api/v1/documents', {
          method: 'GET',
          headers: {
            'X-API-Key': apiKey
          }
        });

        if (documentsResponse.ok) {
          const documentsData = await documentsResponse.json();
          const documents = documentsData.data || [];
          const documentExists = documents.some((doc: any) => doc.id === selectedDocument);

          if (!documentExists) {
            const errorMessage = `Error: Selected document (${selectedDocument}) not found in your PDF.ai account. Please reconfigure the Chat PDF node.`;
            context.setVariable('chatpdf.error', errorMessage);

            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
            return;
          }
        }
      } catch (validationError) {
        console.error('Error validating document:', validationError);
      }

      if (!question.trim() && operation === 'ask_question') {
        const errorMessage = 'Error: No question provided for document analysis.';
        context.setVariable('chatpdf.error', errorMessage);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        let response;
        let result;

        if (operation === 'summarize') {
          response = await fetch('https://pdf.ai/api/v1/summary', {
            method: 'POST',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              docId: selectedDocument
            }),
            signal: controller.signal
          });
        } else {
          const message = operation === 'analyze_content'
            ? 'Please provide a comprehensive analysis of this document, including key insights, main topics, and important findings.'
            : question;

          response = await fetch('https://pdf.ai/api/v1/chat', {
            method: 'POST',
            headers: {
              'X-API-Key': apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              docId: selectedDocument,
              message: message,
              save_chat: true,
              use_gpt4: true,
              model: gptModel
            }),
            signal: controller.signal
          });
        }

        if (response.ok) {
          result = await response.json();

          if (result.content) {
            let answer = result.content;

            if (channelConnection.channelType === 'whatsapp' || channelConnection.channelType === 'whatsapp_unofficial') {
              answer = this.formatResponseForWhatsApp(answer);
            }

            context.setVariable('chatpdf.response', answer);
            context.setVariable('chatpdf.question', question);
            context.setVariable('chatpdf.operation', operation);
            context.setVariable('chatpdf.document', selectedDocument);
            context.setVariable('chatpdf.model', gptModel);
            context.setVariable('chatpdf.lastExecution', new Date().toISOString());

            if (result.references && Array.isArray(result.references)) {
              context.setVariable('chatpdf.references', result.references);
            }

            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              answer,
              conversation,
              true
            );

            clearTimeout(timeoutId);
            return;
          } else {
            const errorMessage = 'No content received from Chat PDF API.';
            context.setVariable('chatpdf.error', errorMessage);

            await this.sendMessageThroughChannel(
              channelConnection,
              contact,
              errorMessage,
              conversation,
              true
            );
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = `Chat PDF API error: ${errorData.error || `HTTP ${response.status}`}`;

          if (errorData.error && errorData.error.includes('Document with given docId not found')) {
            errorMessage = `Document not found! The selected document may have been deleted from your PDF.ai account. Please reconfigure the Chat PDF node with a valid document.`;
          } else if (response.status === 401) {
            errorMessage = `Authentication failed! Please check your PDF.ai API key in the Chat PDF node configuration.`;
          } else if (response.status === 403) {
            errorMessage = `Access denied! Your PDF.ai API key may not have permission to access this document.`;
          } else if (response.status === 429) {
            errorMessage = `Rate limit exceeded! Please wait a moment before trying again.`;
          }

          context.setVariable('chatpdf.error', errorMessage);

          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            errorMessage,
            conversation,
            true
          );
        }

        clearTimeout(timeoutId);

      } catch (apiError) {
        const errorMessage = `Chat PDF API request failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`;
        context.setVariable('chatpdf.error', errorMessage);

        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
      }

    } catch (error) {
      console.error('Error executing Chat PDF node with context:', error);
      const errorMessage = `Chat PDF execution error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      context.setVariable('chatpdf.error', errorMessage);

      try {
        await this.sendMessageThroughChannel(
          channelConnection,
          contact,
          errorMessage,
          conversation,
          true
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  }

  /**
   * Execute Google Calendar node with execution context
   */
  private async executeGoogleCalendarNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const calendarAction = data.action || data.calendarAction || 'create_event';

      const tempMessage: Message = {
        id: 0,
        conversationId: conversation.id,
        externalId: null,
        direction: 'inbound',
        type: 'text',
        content: context.getVariable('message.content') || '',
        metadata: null,
        senderId: contact.id,
        senderType: 'contact',
        status: 'received',
        sentAt: new Date(),
        readAt: null,
        isFromBot: false,
        mediaUrl: null,
        createdAt: new Date(),
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };

      switch (calendarAction) {
        case 'create_event':
          await this.executeGoogleCalendarEventNode(node, tempMessage, conversation, contact, channelConnection);
          context.setVariable('calendar.action', 'create_event');
          context.setVariable('calendar.lastAction', 'create_event');
          break;

        case 'check_availability':
          await this.executeGoogleCalendarAvailabilityNode(node, tempMessage, conversation, contact, channelConnection);
          context.setVariable('calendar.action', 'check_availability');
          context.setVariable('calendar.lastAction', 'check_availability');
          break;

        default:

          context.setVariable('calendar.error', `Unknown action: ${calendarAction}`);
      }

      context.setVariable('calendar.lastExecution', new Date().toISOString());

    } catch (error) {
      context.setVariable('calendar.error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Execute Update Pipeline Stage node with execution context
   */
  private async executeUpdatePipelineStageNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const tempMessage: Message = {
        id: 0,
        conversationId: conversation.id,
        externalId: null,
        direction: 'inbound',
        type: 'text',
        content: context.getVariable('message.content') || '',
        metadata: null,
        senderId: contact.id,
        senderType: 'contact',
        status: 'received',
        sentAt: new Date(),
        readAt: null,
        isFromBot: false,
        mediaUrl: null,
        createdAt: new Date(),
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };

      const data = node.data || {};
      const errorHandling = data.errorHandling || 'continue';

      try {

        const user = await storage.getUser(channelConnection.userId);
        const companyId = user?.companyId;
        if (!companyId) {
          throw new Error('User must be associated with a company');
        }

        let previousPipelineId: number | null = null;
        let previousStageId: number | null = null;
        let deal = null;
        
        if (companyId) {
          deal = await storage.getActiveDealByContact(contact.id, companyId);
          if (deal) {
            previousPipelineId = deal.pipelineId;
            previousStageId = deal.stageId;
          }
        }


        const stageId = data.stageId;
        const pipelineId = data.pipelineId || (deal?.pipelineId || null);
        
        if (stageId && pipelineId && deal) {
          const stageIdNum = typeof stageId === 'string' ? parseInt(stageId) : stageId;
          if (!isNaN(stageIdNum)) {
            const validation = await this.validatePipelineStageCombo(
              pipelineId,
              stageIdNum,
              companyId
            );
            if (!validation.valid) {
              throw new Error(validation.error);
            }
          }
        } else if (stageId && deal) {

          const stageIdNum = typeof stageId === 'string' ? parseInt(stageId) : stageId;
          if (!isNaN(stageIdNum) && deal.pipelineId) {
            const validation = await this.validatePipelineStageCombo(
              deal.pipelineId,
              stageIdNum,
              companyId
            );
            if (!validation.valid) {
              throw new Error(validation.error);
            }
          }
        }

        await this.executeUpdatePipelineStageNode(node, tempMessage, conversation, contact, channelConnection);


        let updatedDeal = null;
        if (companyId) {
          updatedDeal = await storage.getActiveDealByContact(contact.id, companyId);
        }


        const pipelineChanged = previousPipelineId !== (data.pipelineId || updatedDeal?.pipelineId || null);
        
        context.setVariable('pipeline.currentPipelineId', data.pipelineId || updatedDeal?.pipelineId || null);
        context.setVariable('pipeline.previousPipelineId', previousPipelineId);
        context.setVariable('pipeline.currentStageId', updatedDeal?.stageId || null);
        context.setVariable('pipeline.movedBetweenPipelines', pipelineChanged);
      } catch (operationError) {
        console.error('Error executing Update Pipeline Stage node operation:', operationError);
        const errorMessage = operationError instanceof Error ? operationError.message : 'Unknown error';
        context.setVariable('pipeline.error', errorMessage);
        context.setVariable('pipeline.lastExecution', new Date().toISOString());
        

        if (errorHandling === 'stop') {
          throw operationError;
        }

      }

    } catch (error) {
      console.error('Error executing Update Pipeline Stage node with context:', error);
      context.setVariable('pipeline.error', error instanceof Error ? error.message : 'Unknown error');

    }
  }

  /**
   * Execute Move Deal to Pipeline node
   */
  private async executeMoveDealToPipelineNode(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const data = node.data || {};
    const errorHandling = data.errorHandling || 'continue';

    try {

      const tempMessage: Message = {
        id: 0,
        conversationId: conversation.id,
        externalId: null,
        direction: 'inbound',
        type: 'text',
        content: context.getVariable('message.content') || '',
        metadata: null,
        senderId: contact.id,
        senderType: 'contact',
        status: 'received',
        sentAt: new Date(),
        readAt: null,
        isFromBot: false,
        mediaUrl: null,
        createdAt: new Date(),
        groupParticipantJid: null,
        groupParticipantName: null,
        emailMessageId: null,
        emailInReplyTo: null,
        emailReferences: null,
        emailSubject: null,
        emailFrom: null,
        emailTo: null,
        emailCc: null,
        emailBcc: null,
        emailHtml: null,
        emailPlainText: null,
        emailHeaders: null,
        isHistorySync: false,
        historySyncBatchId: null
      };


      const dealIdVariable = data.dealIdVariable || '{{contact.phone}}';
      const targetPipelineId = data.targetPipelineId;
      const targetStageId = data.targetStageId;
      const sourcePipelineId = data.sourcePipelineId;
      const createDealIfNotExists = data.createDealIfNotExists || false;
      const preserveDealData = data.preserveDealData !== false; // Default to true


      const dealId = context.replaceVariables(dealIdVariable);

      const user = await storage.getUser(channelConnection.userId);
      if (!user?.companyId) {
        throw new Error('User must be associated with a company to move deals');
      }
      const companyId = user.companyId;


      let deal = await this.findDealByIdOrContact(dealId, contact.id, companyId);


      if (!deal && createDealIfNotExists) {

        deal = await this.executeCreateDealOperation({
          ...data,
          pipelineId: targetPipelineId,
          stageId: targetStageId
        }, tempMessage, conversation, contact, channelConnection);
      }

      if (!deal) {
        throw new Error(`No deal found for ID/variable: ${dealId}`);
      }


      const targetStage = await storage.getPipelineStage(targetStageId);
      if (!targetStage || targetStage.pipelineId !== targetPipelineId || targetStage.companyId !== companyId) {
        throw new Error(`Target stage ${targetStageId} does not belong to pipeline ${targetPipelineId} or company ${companyId}`);
      }


      const validation = await this.validatePipelineStageCombo(
        targetPipelineId,
        targetStageId,
        companyId
      );
      if (!validation.valid) {
        throw new Error(validation.error);
      }


      const previousPipelineId = deal.pipelineId;
      const previousStageId = deal.stageId;


      if (sourcePipelineId !== null && sourcePipelineId !== undefined) {
        if (deal.pipelineId !== sourcePipelineId) {
          throw new Error(`Deal is not in the specified source pipeline ${sourcePipelineId}`);
        }
      }


      if (!preserveDealData) {



      }


      const updatedDeal = await storage.updateDealPipelineAndStage(
        deal.id,
        targetPipelineId,
        targetStageId
      );


      const pipelineChanged = previousPipelineId !== targetPipelineId;
      const movedBetweenPipelines = pipelineChanged;


      await storage.createDealActivity({
        dealId: deal.id,
        userId: channelConnection.userId,
        type: 'pipeline_change',
        content: `Moved to pipeline ${targetPipelineId}`,
        metadata: {
          previousPipelineId,
          targetPipelineId: targetPipelineId,
          previousStageId,
          targetStageId: targetStageId,
          changedBy: 'flow',
          flowNodeId: node.id
        }
      });


      context.setVariable('pipeline.currentPipelineId', targetPipelineId);
      context.setVariable('pipeline.previousPipelineId', previousPipelineId);
      context.setVariable('pipeline.currentStageId', targetStageId);
      context.setVariable('pipeline.movedBetweenPipelines', movedBetweenPipelines);



      if (movedBetweenPipelines) {
        await this.emitPipelineTriggerEvent('deal_moves_between_pipelines', {
          dealId: deal.id,
          contactId: contact.id,
          pipelineId: targetPipelineId,
          stageId: targetStageId,
          previousPipelineId,
          previousStageId,
          triggeredBy: 'flow'
        }, conversation, contact, channelConnection);
      } else {
        await this.emitPipelineTriggerEvent('deal_stage_changed', {
          dealId: deal.id,
          contactId: contact.id,
          pipelineId: targetPipelineId,
          stageId: targetStageId,
          previousPipelineId,
          previousStageId,
          triggeredBy: 'flow'
        }, conversation, contact, channelConnection);
      }

    } catch (error) {
      console.error('Error executing Move Deal to Pipeline node:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.setVariable('pipeline.error', errorMessage);
      context.setVariable('pipeline.lastExecution', new Date().toISOString());

      if (errorHandling === 'stop') {
        throw error;
      }

    }
  }

  /**
   * Execute Manage Contact node with execution context
   */
  private async executeManageContactNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    const data = node.data || {};
    const errorHandling = data.errorHandling || 'continue';

    try {
      const operation = data.operation || 'update_contact';


      const contactIdVariable = data.contactIdVariable || '{{contact.id}}';
      let contactIdValue = context.replaceVariables(contactIdVariable);
      

      contactIdValue = contactIdValue.replace(/[{}]/g, '').trim();
      
      let targetContactId: number | null = null;


      const companyId = contact.companyId;
      if (!companyId) {
        throw new Error('Contact companyId is required but was null');
      }


      if (contactIdVariable.includes('contact.id') || contactIdValue === contact.id?.toString()) {
        targetContactId = contact.id || null;
      } else if (contactIdVariable.includes('contact.phone') || contactIdValue) {

        const foundContact = await storage.getContactByPhone(contactIdValue, companyId);
        if (foundContact) {
          targetContactId = foundContact.id;
        } else {

          const parsedId = parseInt(contactIdValue, 10);
          if (!isNaN(parsedId)) {
            targetContactId = parsedId;
          }
        }
      } else {

        const parsedId = parseInt(contactIdValue, 10);
        if (!isNaN(parsedId)) {
          targetContactId = parsedId;
        }
      }

      if (!targetContactId) {
        throw new Error(`Could not resolve contact ID from variable: ${contactIdVariable}`);
      }

      if (operation === 'update_contact') {

        const updateFields = data.updateFields || {};
        const skipEmptyValues = data.skipEmptyValues !== false; // Default to true

        const updates: any = {};


        if (updateFields.name !== undefined) {
          const nameValue = context.replaceVariables(updateFields.name || '');
          if (!skipEmptyValues || nameValue.trim()) {
            updates.name = nameValue.trim() || null;
          }
        }

        if (updateFields.email !== undefined) {
          const emailValue = context.replaceVariables(updateFields.email || '');
          if (!skipEmptyValues || emailValue.trim()) {
            updates.email = emailValue.trim() || null;
          }
        }

        if (updateFields.phone !== undefined) {
          const phoneValue = context.replaceVariables(updateFields.phone || '');
          if (!skipEmptyValues || phoneValue.trim()) {
            updates.phone = phoneValue.trim() || null;
          }
        }

        if (updateFields.company !== undefined) {
          const companyValue = context.replaceVariables(updateFields.company || '');
          if (!skipEmptyValues || companyValue.trim()) {
            updates.company = companyValue.trim() || null;
          }
        }

        if (updateFields.tags !== undefined && Array.isArray(updateFields.tags)) {
          updates.tags = updateFields.tags;
        }

        if (updateFields.notes !== undefined) {
          const notesValue = context.replaceVariables(updateFields.notes || '');
          if (!skipEmptyValues || notesValue.trim()) {
            updates.notes = notesValue.trim() || null;
          }
        }

        if (updateFields.isActive !== undefined) {
          updates.isActive = updateFields.isActive;
        }

        if (updateFields.isArchived !== undefined) {
          updates.isArchived = updateFields.isArchived;
        }


        const updatedContact = await storage.updateContact(targetContactId, updates);

        context.setVariable('contact.updated', true);
        context.setVariable('contact.lastUpdateTime', new Date().toISOString());
        context.setVariable('contact.updatedId', updatedContact.id.toString());
        context.setVariable('contact.updatedName', updatedContact.name || '');

      } else if (operation === 'delete_contact') {

        if (!data.deleteConfirmation) {
          throw new Error('Delete confirmation is required to delete a contact');
        }


        const deleteResult = await storage.deleteContact(targetContactId);

        if (!deleteResult.success) {
          throw new Error(deleteResult.error || 'Failed to delete contact');
        }

        context.setVariable('contact.deleted', true);
        context.setVariable('contact.lastDeleteTime', new Date().toISOString());
        context.setVariable('contact.deletedId', targetContactId.toString());
      }

      context.setVariable('contact.lastExecution', new Date().toISOString());
      context.setVariable('contact.operation', operation);

    } catch (error) {
      console.error('Error executing Manage Contact node with context:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      context.setVariable('contact.error', errorMessage);
      context.setVariable('contact.lastExecution', new Date().toISOString());


      if (errorHandling === 'stop') {
        throw error;
      }

    }
  }

  /**
   * Execute Translation node with execution context
   */
  private async executeTranslationNodeWithContext(
    node: any,
    context: FlowExecutionContext,
    conversation: Conversation,
    contact: Contact,
    channelConnection: ChannelConnection
  ): Promise<void> {
    try {
      const data = node.data || {};
      const message = context.getVariable('message') as Message;

      if (!message || !message.content) {

        return;
      }


      if (!data.enabled) {

        return;
      }

      const apiKey = data.apiKey || process.env.OPENAI_API_KEY || '';
      const targetLanguage = data.targetLanguage || 'en';
      const translationMode = data.translationMode || 'separate';
      const detectLanguage = data.detectLanguage !== undefined ? data.detectLanguage : true;


      if (!apiKey) {
        console.error('Translation Node: No OpenAI API key provided');
        context.setVariable('translation.error', 'No API key provided');
        return;
      }


      const aiAssistantService = (await import('./ai-assistant')).default;
      const translationService = (aiAssistantService as any).translationService;

      if (!translationService) {
        console.error('Translation Node: Translation service not available');
        return;
      }


      const translationResult = await translationService.processTranslation(
        message.content,
        targetLanguage,
        'openai',
        apiKey
      );

      if (!translationResult.needsTranslation) {

        context.setVariable('translation.skipped', true);
        context.setVariable('translation.reason', 'already_target_language');
        return;
      }

      if (!translationResult.translatedText) {

        context.setVariable('translation.error', 'Translation failed');
        return;
      }


      context.setVariable('translation.originalText', message.content);
      context.setVariable('translation.translatedText', translationResult.translatedText);
      context.setVariable('translation.detectedLanguage', translationResult.detectedLanguage);
      context.setVariable('translation.targetLanguage', targetLanguage);
      context.setVariable('translation.mode', translationMode);
      context.setVariable('translation.lastExecution', new Date().toISOString());


      if (translationMode === 'replace') {

        const updatedMessage = { ...message, content: translationResult.translatedText };
        context.setVariable('message', updatedMessage);


      } else if (translationMode === 'append') {

        const appendedContent = `${message.content}\n\n🌐 Translation: ${translationResult.translatedText}`;
        const updatedMessage = { ...message, content: appendedContent };
        context.setVariable('message', updatedMessage);


      } else if (translationMode === 'separate') {

        const translationText = `🌐 Translation: ${translationResult.translatedText}`;

        try {

          await this.sendMessageThroughChannel(
            channelConnection,
            contact,
            translationText,
            conversation,
            true
          );
        } catch (sendError) {
          console.error('Translation Node: Error sending translation message:', sendError);
          context.setVariable('translation.sendError', sendError instanceof Error ? sendError.message : 'Unknown error');
        }
      }

    } catch (error) {
      console.error('Error executing Translation node with context:', error);
      context.setVariable('translation.error', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Send WhatsApp Interactive Message through Official WhatsApp API
   */
  private async sendWhatsAppInteractiveMessage(
    channelConnection: ChannelConnection,
    interactiveMessage: any,
    conversation: Conversation
  ): Promise<void> {
    try {
      

      const { sendInteractiveMessage } = await import('./channels/whatsapp-official');


      const result = await sendInteractiveMessage(channelConnection.id, interactiveMessage);




      const insertMessage = {
        conversationId: conversation.id,
        contactId: conversation.contactId,
        channelType: 'whatsapp_official',
        type: 'interactive',
        content: interactiveMessage.interactive.body.text,
        direction: 'outbound',
        status: 'sent',
        mediaUrl: null,
        timestamp: new Date(),
        metadata: JSON.stringify({
          messageType: 'interactive',
          interactiveType: 'button',
          headerText: interactiveMessage.interactive.header?.text,
          footerText: interactiveMessage.interactive.footer?.text,
          buttons: interactiveMessage.interactive.action.buttons,
          whatsappMessageId: result?.messageId
        })
      };

      await storage.createMessage(insertMessage);



    } catch (error) {
      console.error('Error sending WhatsApp interactive message:', error);
      throw error;
    }
  }
}

const flowExecutor = new FlowExecutor();
export default flowExecutor;
