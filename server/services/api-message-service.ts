import { storage } from '../storage';
import { ChannelConnection, InsertMessage, InsertConversation, InsertContact } from '@shared/schema';
import whatsAppService from './channels/whatsapp';
import whatsAppOfficialService from './channels/whatsapp-official';
import whatsAppMetaPartnerService from './channels/whatsapp-meta-partner';
import telegramService from './channels/telegram';
import instagramService from './channels/instagram';
import messengerService from './channels/messenger';
import twilioSmsService from './channels/twilio-sms';

export interface SendMessageRequest {
  channelId: number;
  to: string;
  message: string;
  messageType?: 'text';
}

export interface SendMediaRequest {
  channelId: number;
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export interface MessageResponse {
  id: number;
  externalId?: string;
  status: string;
  timestamp: Date;
  channelType: string;
  conversationId: number;
  error?: string;
}

export interface ChannelInfo {
  id: number;
  name: string;
  type: string;
  status: string;
  phoneNumber?: string;
  displayName?: string;
}

/**
 * API Message Service
 * Handles programmatic message sending through various channel types
 */
class ApiMessageService {

  /**
   * Get available channels for a company
   */
  async getChannels(companyId: number): Promise<ChannelInfo[]> {
    try {
      const connections = await storage.getChannelConnectionsByCompany(companyId);

      const activeConnections = connections.filter(conn => conn.status === 'active');

      return activeConnections.map(conn => ({
        id: conn.id,
        name: conn.accountName,
        type: conn.channelType,
        status: conn.status || 'unknown',
        phoneNumber: this.extractPhoneNumber(conn),
        displayName: this.extractDisplayName(conn)
      }));
    } catch (error) {
      console.error('Error getting channels for company:', error);
      throw new Error('Failed to retrieve channels');
    }
  }

  /**
   * Send a text message through the specified channel
   */
  async sendMessage(companyId: number, request: SendMessageRequest): Promise<MessageResponse> {
    try {

      const connection = await this.validateChannelAccess(companyId, request.channelId);
      

      const contact = await this.findOrCreateContact(companyId, request.to, connection.channelType);
      

      const conversation = await this.findOrCreateConversation(contact.id, connection);
      

      const sentMessage = await this.sendThroughChannel(
        connection,
        request.to,
        request.message,
        conversation.id
      );

      return {
        id: sentMessage.id,
        externalId: sentMessage.externalId || undefined,
        status: sentMessage.status || 'sent',
        timestamp: sentMessage.createdAt || new Date(),
        channelType: connection.channelType,
        conversationId: conversation.id
      };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send a media message through the specified channel
   */
  async sendMedia(companyId: number, request: SendMediaRequest): Promise<MessageResponse> {
    try {

      const connection = await this.validateChannelAccess(companyId, request.channelId);
      

      const contact = await this.findOrCreateContact(companyId, request.to, connection.channelType);
      

      const conversation = await this.findOrCreateConversation(contact.id, connection);
      

      const sentMessage = await this.sendMediaThroughChannel(
        connection,
        request.to,
        request.mediaType,
        request.mediaUrl,
        request.caption || '',
        request.filename,
        conversation.id
      );

      if (!sentMessage) {
        throw new Error('Failed to send media message - no response from channel service');
      }

      return {
        id: sentMessage.id,
        externalId: sentMessage.externalId || undefined,
        status: sentMessage.status || 'sent',
        timestamp: sentMessage.createdAt || new Date(),
        channelType: connection.channelType,
        conversationId: conversation.id
      };
    } catch (error) {
      console.error('Error sending media:', error);
      throw error;
    }
  }

  /**
   * Get message status by ID
   */
  async getMessageStatus(companyId: number, messageId: number): Promise<{ status: string; timestamp: Date } | null> {
    try {
      const message = await storage.getMessageById(messageId);
      if (!message) {
        return null;
      }


      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== companyId) {
        throw new Error('Message not found or access denied');
      }

      return {
        status: message.status || 'unknown',
        timestamp: message.createdAt || new Date()
      };
    } catch (error) {
      console.error('Error getting message status:', error);
      throw error;
    }
  }

  /**
   * Send batch messages
   */
  async sendBatchMessages(companyId: number, messages: SendMessageRequest[]): Promise<MessageResponse[]> {
    if (messages.length > 100) {
      const error = new Error('Batch size cannot exceed 100 messages');
      error.name = 'BatchSizeExceededError';
      throw error;
    }

    const results: MessageResponse[] = [];
    
    for (const messageRequest of messages) {
      try {
        const result = await this.sendMessage(companyId, messageRequest);
        results.push(result);
      } catch (error: any) {
        results.push({
          id: 0,
          status: 'failed',
          timestamp: new Date(),
          channelType: 'unknown',
          conversationId: 0,
          error: error.message || 'Failed to send message'
        });
      }
    }

    return results;
  }

  /**
   * Send template message (WhatsApp official/meta only)
   */
  async sendTemplateMessage(
    companyId: number,
    request: {
      channelId: number;
      to: string;
      templateName: string;
      templateLanguage: string;
      components?: Array<{
        type: 'header' | 'body' | 'button';
        parameters: Array<string | { type: 'text'; text: string }>;
      }>;
    }
  ): Promise<MessageResponse> {
    const connection = await this.validateChannelAccess(companyId, request.channelId);
    
    if (connection.channelType !== 'whatsapp_official' && connection.channelType !== 'whatsapp_meta') {
      throw new Error('Template messages are only supported on WhatsApp official and meta channels');
    }

    const contact = await this.findOrCreateContact(companyId, request.to, connection.channelType);
    const conversation = await this.findOrCreateConversation(contact.id, connection);
    const systemUserId = 1;

    let sentMessage;
    if (connection.channelType === 'whatsapp_official') {
      if (!connection.companyId) {
        throw new Error('Company ID is required for WhatsApp Official template messages');
      }
      const { sendTemplateMessage } = await import('./channels/whatsapp-official');

      const convertedComponents = (request.components || []).map(comp => ({
        type: comp.type,
        parameters: comp.parameters.map(param => 
          typeof param === 'string' 
            ? { type: 'text' as const, text: param }
            : param
        )
      }));
      sentMessage = await sendTemplateMessage(
        connection.id,
        systemUserId,
        connection.companyId,
        request.to,
        request.templateName,
        request.templateLanguage,
        convertedComponents
      );
    } else {

      throw new Error('Template messages are not supported on WhatsApp Meta Partner channels via API');
    }

    return {
      id: sentMessage.id,
      externalId: sentMessage.externalId || undefined,
      status: sentMessage.status || 'sent',
      timestamp: sentMessage.createdAt || new Date(),
      channelType: connection.channelType,
      conversationId: conversation.id
    };
  }

  /**
   * Send interactive message (WhatsApp only)
   */
  async sendInteractiveMessage(
    companyId: number,
    request: {
      channelId: number;
      to: string;
      interactiveType: 'button' | 'list';
      content: {
        header?: {
          type: 'text' | 'image' | 'video' | 'document';
          text?: string;
          mediaUrl?: string;
        };
        body: {
          text: string;
        };
        footer?: {
          text: string;
        };
      };
      options: {
        type: 'button';
        buttons: Array<{ id: string; title: string }>;
      } | {
        type: 'list';
        button: string;
        sections: Array<{
          title?: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }>;
      };
    }
  ): Promise<MessageResponse> {
    const connection = await this.validateChannelAccess(companyId, request.channelId);
    
    if (connection.channelType !== 'whatsapp_official' && connection.channelType !== 'whatsapp_meta') {
      throw new Error('Interactive messages are only supported on WhatsApp official and meta channels');
    }

    const contact = await this.findOrCreateContact(companyId, request.to, connection.channelType);
    const conversation = await this.findOrCreateConversation(contact.id, connection);
    const systemUserId = 1;

    let sentMessage;
    if (connection.channelType === 'whatsapp_official') {
      if (!connection.companyId) {
        throw new Error('Company ID is required for WhatsApp Official interactive messages');
      }
      const { sendInteractiveMessage } = await import('./channels/whatsapp-official');

      const interactiveMessage: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: request.to,
        type: 'interactive',
        interactive: {
          type: request.interactiveType,
          ...(request.content.header && {
            header: request.content.header.type === 'text' 
              ? { type: 'text', text: request.content.header.text }
              : { type: request.content.header.type, [request.content.header.type]: { link: request.content.header.mediaUrl } }
          }),
          body: request.content.body,
          ...(request.content.footer && { footer: request.content.footer }),
          action: request.options.type === 'button'
            ? { buttons: request.options.buttons.map(btn => ({ type: 'reply', reply: { id: btn.id, title: btn.title } })) }
            : { button: request.options.button, sections: request.options.sections }
        }
      };
      
      const result = await sendInteractiveMessage(connection.id, interactiveMessage);

      const messageData: InsertMessage = {
        conversationId: conversation.id,
        senderId: systemUserId,
        content: request.content.body.text,
        type: 'interactive',
        direction: 'outbound',
        status: result.success ? 'sent' : 'failed',
        externalId: result.messageId,
        metadata: { interactiveType: request.interactiveType, options: request.options } as any
      };
      sentMessage = await storage.createMessage(messageData);
    } else {

      throw new Error('Interactive messages are not supported on WhatsApp Meta Partner channels via API');
    }

    return {
      id: sentMessage.id,
      externalId: sentMessage.externalId || undefined,
      status: sentMessage.status || 'sent',
      timestamp: sentMessage.createdAt || new Date(),
      channelType: connection.channelType,
      conversationId: conversation.id
    };
  }

  /**
   * Get conversations with pagination and filters
   */
  async getConversations(
    companyId: number,
    options: {
      page: number;
      limit: number;
      channelId?: number;
      status?: string;
      isGroup?: boolean;
    }
  ): Promise<{ conversations: any[]; total: number }> {

    const result = await storage.getConversations({
      companyId,
      page: options.page,
      limit: options.limit
    });


    let filteredConversations = result.conversations;
    if (options.channelId) {
      filteredConversations = filteredConversations.filter((conv: any) => conv.channelId === options.channelId);
    }
    if (options.status) {
      filteredConversations = filteredConversations.filter((conv: any) => conv.status === options.status);
    }
    if (options.isGroup !== undefined) {
      filteredConversations = filteredConversations.filter((conv: any) => conv.isGroup === options.isGroup);
    }


    const total = await storage.getConversationsCountByCompany(companyId);

    return {
      conversations: filteredConversations.map((conv: any) => ({
        id: conv.id,
        contactId: conv.contactId,
        channelId: conv.channelId,
        channelType: conv.channelType,
        status: conv.status,
        isGroup: conv.isGroup,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt
      })),
      total
    };
  }

  /**
   * Get contacts with pagination and search
   */
  async getContacts(
    companyId: number,
    options: {
      page: number;
      limit: number;
      search?: string;
    }
  ): Promise<{ contacts: any[]; total: number }> {

    const result = await storage.getContacts({
      companyId,
      page: options.page,
      limit: options.limit,
      search: options.search
    });

    return {
      contacts: result.contacts.map((contact: any) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        identifier: contact.identifier,
        createdAt: contact.createdAt
      })),
      total: result.total
    };
  }

  /**
   * Validate that a channel belongs to the company
   */
  private async validateChannelAccess(companyId: number, channelId: number): Promise<ChannelConnection> {
    const connection = await storage.getChannelConnection(channelId);
    if (!connection) {
      throw new Error('Channel not found');
    }

    if (connection.companyId !== companyId) {
      throw new Error('Access denied to this channel');
    }

    if (connection.status !== 'active') {
      throw new Error('Channel is not active');
    }

    return connection;
  }

  /**
   * Find or create a contact for the given phone number
   */
  private async findOrCreateContact(companyId: number, phoneNumber: string, _channelType: string) {

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    

    let contact = await storage.getContactByPhone(normalizedPhone, companyId);
    
    if (!contact) {

      const contactData: InsertContact = {
        companyId,
        name: phoneNumber, // Use phone number as default name
        phone: normalizedPhone,
        identifier: normalizedPhone,
        source: 'api'
      };
      
      contact = await storage.getOrCreateContact(contactData);
    }

    return contact;
  }

  /**
   * Find or create a conversation for the contact and channel
   */
  private async findOrCreateConversation(contactId: number, connection: ChannelConnection) {

    let conversation = await storage.getConversationByContactAndChannel(contactId, connection.id);
    
    if (!conversation) {

      const conversationData: InsertConversation = {
        contactId,
        channelId: connection.id,
        channelType: connection.channelType,
        companyId: connection.companyId!,
        status: 'active'
      };
      
      conversation = await storage.createConversation(conversationData);
    }

    return conversation;
  }

  /**
   * Send message through the appropriate channel service
   */
  private async sendThroughChannel(
    connection: ChannelConnection,
    to: string,
    message: string,
    conversationId: number
  ) {

    const systemUserId = 1; // This should be a configurable system user

    switch (connection.channelType) {
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return await whatsAppService.sendMessage(connection.id, systemUserId, to, message);
      
      case 'whatsapp_official':
        if (!connection.companyId) {
          throw new Error('Company ID is required for WhatsApp Official messages');
        }
        return await whatsAppOfficialService.sendMessage(connection.id, systemUserId, connection.companyId, to, message);
      
      case 'whatsapp_meta':
        return await whatsAppMetaPartnerService.sendMessage(connection.id, systemUserId, to, message);

      case 'twilio_sms':
        return await twilioSmsService.sendMessage(connection.id, systemUserId, to, message);

      case 'telegram':
        const telegramResult = await telegramService.sendMessage(connection.id, to, message, systemUserId);
        if (telegramResult.success && telegramResult.messageId) {
          const messageData: InsertMessage = {
            conversationId,
            senderId: systemUserId,
            content: message,
            type: 'text',
            direction: 'outbound',
            status: 'sent',
            externalId: telegramResult.messageId,
            metadata: {
              messageId: telegramResult.messageId,
              timestamp: Date.now(),
              sentViaApi: true
            }
          };
          return await storage.createMessage(messageData);
        } else {
          throw new Error(telegramResult.error || 'Failed to send Telegram message');
        }

      case 'instagram':
        if (!connection.companyId) {
          throw new Error('Company ID is required for Instagram messages');
        }

        const { sendMessage: instagramSendMessage } = await import('./channels/instagram');
        return await instagramSendMessage(connection.id, systemUserId, connection.companyId, to, message);

      case 'messenger':
        if (!connection.companyId) {
          throw new Error('Company ID is required for Messenger messages');
        }

        const { sendMessage: messengerSendMessage } = await import('./channels/messenger');
        return await messengerSendMessage(connection.id, systemUserId, connection.companyId, to, message);

      case 'tiktok':
        if (!conversationId) {
          throw new Error('Conversation ID is required for TikTok messages');
        }
        const TikTokService = await import('./channels/tiktok');
        return await TikTokService.default.sendAndSaveMessage(
          connection.id,
          conversationId,
          to,
          message,
          'text'
        );

      case 'email':
        const emailService = await import('./channels/email');
        return await emailService.sendMessage(
          connection.id,
          systemUserId,
          to,
          'API Message',
          message,
          { isHtml: false }
        );

      case 'webchat':
        const webchatService = await import('./channels/webchat');
        return await webchatService.default.sendMessage(
          connection.id,
          to, // sessionId
          message
        );

      default:
        throw new Error(`Unsupported channel type: ${connection.channelType}`);
    }
  }

  /**
   * Send media through the appropriate channel service
   */
  private async sendMediaThroughChannel(
    connection: ChannelConnection,
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption: string,
    filename: string | undefined,
    _conversationId: number
  ) {
    const systemUserId = 1; // System user for API messages

    switch (connection.channelType) {
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return await whatsAppService.sendMedia(connection.id, systemUserId, to, mediaType, mediaUrl, caption, filename);
      
      case 'whatsapp_official':
        if (!connection.companyId) {
          throw new Error('Company ID is required for WhatsApp Official media messages');
        }
        return await whatsAppOfficialService.sendMedia(connection.id, systemUserId, connection.companyId, to, mediaType, mediaUrl, caption, filename, undefined, true);
      
      case 'whatsapp_meta':
        return await whatsAppMetaPartnerService.sendMessage(connection.id, systemUserId, to, caption, mediaUrl, mediaType);

      case 'telegram':
        const telegramMediaType = mediaType === 'image' ? 'photo' :
                                 mediaType === 'video' ? 'video' :
                                 mediaType === 'audio' ? 'audio' : 'document';
        return await telegramService.sendMedia(connection.id, to, mediaUrl, telegramMediaType, caption, systemUserId);

      case 'instagram':

        if (mediaType === 'image' || mediaType === 'video') {
          return await instagramService.sendMedia(connection.id, to, mediaUrl, mediaType, caption, systemUserId);
        } else {
          throw new Error(`Instagram does not support ${mediaType} media type`);
        }

      case 'messenger':


        const messengerMediaType = mediaType === 'document' ? 'file' : mediaType;
        return await messengerService.sendMedia(connection.id, to, mediaUrl, messengerMediaType as 'image' | 'video' | 'audio' | 'file');

      case 'twilio_sms':
        return await twilioSmsService.sendMedia(connection.id, systemUserId, to, mediaType, mediaUrl, caption);

      case 'tiktok':

        if (mediaType !== 'image' && mediaType !== 'video') {
          throw new Error(`TikTok only supports image and video media types, not ${mediaType}`);
        }
        if (!_conversationId) {
          throw new Error('Conversation ID is required for TikTok media messages');
        }


        const TikTokService = await import('./channels/tiktok');
        const messageContent = mediaUrl ? `${caption || ''} [Media: ${mediaUrl}]` : (caption || '');
        const messageType = mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : 'text';
        return await TikTokService.default.sendAndSaveMessage(
          connection.id,
          _conversationId,
          to,
          messageContent,
          messageType
        );

      case 'email':


        const emailService = await import('./channels/email');
        const emailContent = caption || `Media: ${mediaUrl}`;
        return await emailService.sendMessage(
          connection.id,
          systemUserId,
          to,
          'API Media Message',
          emailContent,
          { isHtml: false }
        );

      case 'webchat':

        const webchatService = await import('./channels/webchat');
        const webchatMessageType = mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'document';
        return await webchatService.default.sendMessage(
          connection.id,
          to, // sessionId
          caption || '',
          webchatMessageType,
          mediaUrl
        );

      default:
        throw new Error(`Unsupported channel type for media: ${connection.channelType}`);
    }
  }

  /**
   * Extract phone number from connection data
   */
  private extractPhoneNumber(connection: ChannelConnection): string | undefined {
    if (connection.connectionData && typeof connection.connectionData === 'object') {
      const data = connection.connectionData as any;
      const phoneNumber = data.phoneNumber || data.phone || data.number;
      if (phoneNumber) return phoneNumber;
    }


    if (connection.accountId && /^\+?\d+$/.test(connection.accountId)) {
      return connection.accountId;
    }

    return undefined;
  }

  /**
   * Extract display name from connection data
   */
  private extractDisplayName(connection: ChannelConnection): string | undefined {
    if (connection.connectionData && typeof connection.connectionData === 'object') {
      const data = connection.connectionData as any;
      const displayName = data.displayName || data.name;
      if (displayName) return displayName;
    }


    return connection.accountName;
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(phoneNumber: string): string {

    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    

    if (!normalized.startsWith('+')) {
      normalized = '+' + normalized;
    }
    
    return normalized;
  }
}

export default new ApiMessageService();
