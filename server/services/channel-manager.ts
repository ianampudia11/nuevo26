import { storage } from '../storage';
import whatsAppService, { deleteWhatsAppMessage } from './channels/whatsapp';
import whatsAppOfficialService from './channels/whatsapp-official';
import messengerService from './channels/messenger';
import instagramService from './channels/instagram';
import TikTokService from './channels/tiktok';
import emailService from './channels/email';
import twilioSmsService from './channels/twilio-sms';
import webchatService from './channels/webchat';
import { Message } from '@shared/schema';

export interface ChannelCapabilities {
  supportsReply: boolean;
  supportsDelete: boolean;
  supportsQuotedMessages: boolean;
  deleteTimeLimit?: number;
  replyFormat: 'quoted' | 'threaded' | 'mention';
  supportsTypingIndicator?: boolean;
  supportsReadReceipts?: boolean;
  supportsReactions?: boolean;
  supportsRichMedia?: boolean;
  supportedMediaTypes?: string[];
  hasMessagingWindow?: boolean;
  messagingWindowDuration?: number;
  maxMessageLength?: number;
  requiresBusinessAccount?: boolean;
}

export interface ReplyOptions {
  originalMessageId: string;
  originalContent: string;
  originalSender: string;
  quotedMessage?: any;
}

export interface DeleteOptions {
  messageId: string;
  externalId?: string;
  forEveryone?: boolean;
}

export interface ChannelServiceResult {
  success: boolean;
  messageId?: string;
  error?: string;
  data?: any;
}

class ChannelManager {
  private getChannelCapabilities(channelType: string): ChannelCapabilities {
    switch (channelType) {
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return {
          supportsReply: true,
          supportsDelete: true,
          supportsQuotedMessages: true,
          deleteTimeLimit: 4320, 
          replyFormat: 'quoted'
        };
      
      case 'whatsapp_official':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: true,
          replyFormat: 'quoted'
        };
      
      case 'messenger':
        return {
          supportsReply: true,
          supportsDelete: false, 
          supportsQuotedMessages: false,
          replyFormat: 'mention'
        };
      
      case 'instagram':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: false,
          replyFormat: 'mention'
        };

      case 'tiktok':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: false,
          replyFormat: 'mention',
          supportsTypingIndicator: false,
          supportsReadReceipts: false,
          supportsReactions: false,
          supportsRichMedia: true,
          supportedMediaTypes: ['text', 'image', 'video', 'sticker'],
          hasMessagingWindow: true,
          messagingWindowDuration: 48 * 60 * 60 * 1000,
          maxMessageLength: 2000,
          requiresBusinessAccount: true
        };

      case 'email':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: true,
          replyFormat: 'threaded'
        };

      case 'twilio_sms':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: false,
          replyFormat: 'threaded'
        };

      case 'webchat':
        return {
          supportsReply: true,
          supportsDelete: false,
          supportsQuotedMessages: false,
          replyFormat: 'threaded'
        };

      default:
        return {
          supportsReply: false,
          supportsDelete: false,
          supportsQuotedMessages: false,
          replyFormat: 'mention'
        };
    }
  }

  async sendReply(
    conversationId: number,
    content: string,
    replyOptions: ReplyOptions,
    userId: number,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }


      if (companyId && conversation.companyId !== companyId) {
        return { success: false, error: 'Access denied: Conversation does not belong to your company' };
      }

      const channelConnection = await storage.getChannelConnection(conversation.channelId);
      if (!channelConnection) {
        return { success: false, error: 'Channel connection not found' };
      }


      if (companyId && channelConnection.companyId !== companyId) {
        return { success: false, error: 'Access denied: Channel connection does not belong to your company' };
      }

      let contact = null;
      let recipient = '';

      if (conversation.isGroup) {
        if (!conversation.groupJid) {
          return { success: false, error: 'Group conversation missing group JID' };
        }
        recipient = conversation.groupJid;
        
      } else {
        if (!conversation.contactId) {
          return { success: false, error: 'Contact ID not found in conversation' };
        }
        contact = await storage.getContact(conversation.contactId);
        if (!contact) {
          return { success: false, error: 'Contact not found' };
        }
        recipient = contact.identifier || contact.phone || '';
        if (!recipient) {
          return { success: false, error: 'No phone number found for contact' };
        }
      }

      const capabilities = this.getChannelCapabilities(conversation.channelType);

      if (!capabilities.supportsReply) {
        return { success: false, error: 'Channel does not support replies' };
      }

      let messageContent = content;
      try {

        let agentSignatureEnabled = true; // Default to enabled

        if (conversation.companyId) {
          const agentSignatureSetting = await storage.getCompanySetting(
            conversation.companyId,
            'inbox_agent_signature_enabled'
          );
          agentSignatureEnabled = agentSignatureSetting?.value !== undefined && agentSignatureSetting?.value !== null
            ? Boolean(agentSignatureSetting.value)
            : true;
        }

        if (agentSignatureEnabled) {
          const user = await storage.getUser(userId);
          if (user) {
            const nameCandidates = [
              (user as any).fullName,
              (user as any).name,
              [ (user as any).firstName, (user as any).lastName ].filter(Boolean).join(' ').trim(),
              (user as any).displayName,
              typeof (user as any).email === 'string' ? (user as any).email.split('@')[0] : undefined
            ].filter((v: any) => typeof v === 'string' && v.trim().length > 0);
            const signatureName = nameCandidates[0];
            if (signatureName) {
              messageContent = `> *${signatureName}*\n\n${content}`;
            }
          }
        }
      } catch (userError) {
        console.error('Error fetching user for signature in reply:', userError);
      }

      switch (conversation.channelType) {
        case 'whatsapp_unofficial':
        case 'whatsapp':
          return await this.sendWhatsAppReply(
            conversation.channelId,
            userId,
            recipient,
            messageContent,
            replyOptions,
            capabilities,
            conversationId
          );

        case 'whatsapp_official':
          if (conversation.isGroup) {
            return { success: false, error: 'WhatsApp Official does not support group chat replies' };
          }
          return await this.sendWhatsAppOfficialReply(
            conversation.channelId,
            userId,
            recipient,
            messageContent,
            replyOptions,
            companyId
          );

        case 'messenger':
          if (conversation.isGroup) {
            return { success: false, error: 'Messenger does not support group chat replies' };
          }
          return await this.sendMessengerReply(
            conversation.channelId,
            recipient,
            messageContent,
            replyOptions
          );

        case 'instagram':
          if (conversation.isGroup) {
            return { success: false, error: 'Instagram does not support group chat replies' };
          }
          return await this.sendInstagramReply(
            conversation.channelId,
            recipient,
            messageContent,
            replyOptions,
            companyId
          );

        case 'tiktok':
          if (conversation.isGroup) {
            return { success: false, error: 'TikTok does not support group chat replies' };
          }
          return await this.sendTikTokReply(
            conversation.channelId,
            conversationId,
            recipient,
            messageContent,
            replyOptions,
            companyId ?? conversation.companyId!,
            userId
          );

        case 'email':
          if (conversation.isGroup) {
            return { success: false, error: 'Email does not support group chat replies' };
          }
          return await this.sendEmailReply(
            conversation.channelId,
            userId,
            recipient,
            messageContent,
            replyOptions
          );

        case 'twilio_sms':
          if (conversation.isGroup) {
            return { success: false, error: 'SMS does not support group chat replies' };
          }
          try {
            const message = await twilioSmsService.sendMessage(
              conversation.channelId,
              userId,
              recipient,
              content
            );
            return { success: true, messageId: message.id?.toString(), data: message };
          } catch (err: any) {
            return { success: false, error: err?.message || 'Failed to send SMS reply' };
          }

        case 'webchat':
          if (conversation.isGroup) {
            return { success: false, error: 'WebChat does not support group chat replies' };
          }
          return await this.sendWebChatReply(
            conversation.channelId,
            recipient,
            content,
            replyOptions
          );

        default:
          return { success: false, error: 'Unsupported channel type for replies' };
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
      return { success: false, error: error.message || 'Failed to send reply' };
    }
  }

  async deleteMessage(
    messageId: number,
    userId: number,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {
      
      const message = await storage.getMessageById(messageId);
      if (!message) {
        return { success: false, error: 'Message not found' };
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }


      if (companyId && conversation.companyId !== companyId) {
        return { success: false, error: 'Access denied: Message does not belong to your company' };
      }


      if (companyId && conversation.companyId !== companyId) {
        return { success: false, error: 'Access denied: Conversation does not belong to your company' };
      }

      const capabilities = this.getChannelCapabilities(conversation.channelType);
      
      if (!capabilities.supportsDelete) {
        return { 
          success: false, 
          error: 'Message deletion is not supported for this channel' 
        };
      }

      
      if (capabilities.deleteTimeLimit) {
        const dateValue = message.sentAt ?? message.createdAt;
        if (!dateValue) {
          return { success: false, error: 'Message timestamp is missing' };
        }
        const messageAge = Date.now() - new Date(dateValue).getTime();
        const timeLimitMs = capabilities.deleteTimeLimit * 60 * 1000;
        
        if (messageAge > timeLimitMs) {
          return { 
            success: false, 
            error: 'Message is too old to be deleted' 
          };
        }
      }

      
      switch (conversation.channelType) {
        case 'whatsapp_unofficial':
        case 'whatsapp':
          return await this.deleteWhatsAppMessage(
            conversation.channelId,
            userId,
            message.externalId || '',
            message,
            companyId
          );
        
        default:
          
          const deleted = await storage.deleteMessage(messageId);
          if (deleted) {
            
            if ((global as any).broadcastToAllClients) {
              (global as any).broadcastToAllClients({
                type: 'messageDeleted',
                data: { messageId, conversationId: message.conversationId }
              });
            }
            return { success: true };
          } else {
            return { success: false, error: 'Failed to delete message from database' };
          }
      }
    } catch (error: any) {
      console.error('Error deleting message:', error);
      return { success: false, error: error.message || 'Failed to delete message' };
    }
  }

  private async sendWhatsAppReply(
    connectionId: number,
    userId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions,
    capabilities: ChannelCapabilities,
    conversationId?: number
  ): Promise<ChannelServiceResult> {
    try {
      if (!replyOptions.quotedMessage) {
        return { success: false, error: 'No quoted message object provided for WhatsApp reply' };
      }

      const quotedMessageData = {
        text: content,
        quoted: replyOptions.quotedMessage
      };

      const result = await whatsAppService.sendQuotedMessage(connectionId, userId, to, quotedMessageData, false, conversationId);

      if (result) {
        return { success: true, messageId: result.id?.toString(), data: result };
      } else {
        return { success: false, error: 'Failed to send WhatsApp quoted reply - sendQuotedMessage returned null' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendWhatsAppOfficialReply(
    connectionId: number,
    userId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {
      
      
      const truncatedContent = replyOptions.originalContent.substring(0, 50);
      const ellipsis = replyOptions.originalContent.length > 50 ? '...' : '';
      const replyContent = `↩️ Replying to: "${truncatedContent}${ellipsis}"\n\n${content}`;
      
      const result = await whatsAppOfficialService.sendMessage(connectionId, userId, companyId || 0, to, replyContent);

      if (result) {
        return {
          success: true,
          messageId: result.externalId || result.id?.toString(),
          data: result
        };
      } else {
        return {
          success: false,
          error: 'Failed to send WhatsApp Official reply'
        };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendMessengerReply(
    connectionId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions
  ): Promise<ChannelServiceResult> {
    try {

      const replyContent = `@${replyOptions.originalSender} ${content}`;

      const result = await messengerService.sendMessage(connectionId, to, replyContent);

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendInstagramReply(
    connectionId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {

      const replyContent = `@${replyOptions.originalSender} ${content}`;

      const result = await instagramService.sendMessage(connectionId, to, replyContent);

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendTikTokReply(
    connectionId: number,
    conversationId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions,
    companyId: number,
    userId: number
  ): Promise<ChannelServiceResult> {
    try {
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }
      const tiktokConversationId = (conversation.groupMetadata as any)?.tiktokConversationId;
      if (!tiktokConversationId) {
        return { success: false, error: 'TikTok conversation ID not found' };
      }


      const windowCheck = await TikTokService.checkMessagingWindow(conversationId);
      if (!windowCheck.isOpen) {
        return {
          success: false,
          error: 'Messaging window has closed. User must send a message to reopen the conversation.',
          data: {
            windowStatus: windowCheck.status,
            expiresAt: windowCheck.expiresAt,
            lastInteractionAt: windowCheck.lastInteractionAt
          }
        };
      }

      const replyContent = `@${replyOptions.originalSender} ${content}`;


      const message = await TikTokService.sendAndSaveMessage(
        connectionId,
        companyId,
        tiktokConversationId,
        to,
        userId,
        'text',
        replyContent
      );

      return {
        success: true,
        messageId: message.id.toString(),
        data: message
      };
    } catch (error: any) {
      console.error('Error sending TikTok reply:', error);
      const message =
        (error?.error?.message != null && typeof error.error.message === 'string')
          ? error.error.message
          : (error?.message != null && typeof error.message === 'string')
            ? error.message
            : 'Failed to send message';
      return { success: false, error: message };
    }
  }

  private async sendEmailReply(
    connectionId: number,
    userId: number,
    to: string,
    content: string,
    replyOptions: ReplyOptions
  ): Promise<ChannelServiceResult> {
    try {
      const originalMessage = await storage.getMessageById(parseInt(replyOptions.originalMessageId));
      if (!originalMessage) {
        return { success: false, error: 'Original message not found for reply' };
      }

      const originalSubject = originalMessage.emailSubject || '(No Subject)';
      const replySubject = originalSubject.startsWith('Re: ') ? originalSubject : `Re: ${originalSubject}`;

      const inReplyTo = originalMessage.emailMessageId;
      const references = originalMessage.emailReferences
        ? `${originalMessage.emailReferences} ${originalMessage.emailMessageId}`
        : originalMessage.emailMessageId;

      const result = await emailService.sendMessage(
        connectionId,
        userId,
        to,
        replySubject,
        content,
        {
          inReplyTo: inReplyTo || undefined,
          references: references || undefined,
          isHtml: false
        }
      );

      return {
        success: true,
        messageId: result.id?.toString(),
        data: result
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendWebChatReply(
    connectionId: number,
    sessionId: string,
    content: string,
    replyOptions: ReplyOptions
  ): Promise<ChannelServiceResult> {
    try {
      const message = await webchatService.sendMessage(connectionId, sessionId, content);
      return { success: true, messageId: message?.id?.toString(), data: message };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async deleteWhatsAppMessage(
    connectionId: number,
    userId: number,
    externalId: string,
    message: Message,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation) {
        return { success: false, error: 'Conversation not found' };
      }


      if (companyId && conversation.companyId !== companyId) {
        return { success: false, error: 'Access denied: Conversation does not belong to your company' };
      }

      let recipient = '';
      if (conversation.isGroup) {
        if (!conversation.groupJid) {
          return { success: false, error: 'Group conversation missing group JID' };
        }
        recipient = conversation.groupJid;
      } else {
        if (!conversation.contactId) {
          return { success: false, error: 'Contact ID not found in conversation' };
        }
        const contact = await storage.getContact(conversation.contactId);
        if (!contact) {
          return { success: false, error: 'Contact not found' };
        }
        recipient = contact.phone || contact.identifier || '';
        if (!recipient) {
          return { success: false, error: 'Contact phone number not found' };
        }
      }

      const messageCreatedAt = message.createdAt ? new Date(message.createdAt) : new Date();
      const messageAge = Date.now() - messageCreatedAt.getTime();
      const maxAge = 72 * 60 * 1000;

      if (messageAge > maxAge) {
        return {
          success: false,
          error: 'Message is too old to be deleted. WhatsApp only allows deletion within 72 minutes of sending.'
        };
      }

      let messageKey: { remoteJid?: string; fromMe?: boolean; id: string } = {
        id: externalId
      };

      if (message.metadata) {
        try {
          const metadata = typeof message.metadata === 'string'
            ? JSON.parse(message.metadata)
            : message.metadata;

          if (metadata.whatsappMessage?.key) {
            messageKey = metadata.whatsappMessage.key;
          } else if (metadata.remoteJid) {
            messageKey.remoteJid = metadata.remoteJid;
            messageKey.fromMe = metadata.fromMe;
          }
        } catch (error) {
          
        }
      }

      const whatsappResult = await deleteWhatsAppMessage(
        connectionId,
        userId,
        recipient,
        messageKey
      );

      if (!whatsappResult.success) {
        return {
          success: false,
          error: whatsappResult.error || 'Failed to delete message from WhatsApp'
        };
      }

      const deleted = await storage.deleteMessage(message.id);

      if (deleted) {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'messageDeleted',
            data: { messageId: message.id, conversationId: message.conversationId }
          });
        }
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Message deleted from WhatsApp but failed to delete from database'
        };
      }
    } catch (error: any) {
      console.error('Error in deleteWhatsAppMessage:', error);
      return { success: false, error: error.message || 'Failed to delete message' };
    }
  }

  getCapabilities(channelType: string): ChannelCapabilities {
    return this.getChannelCapabilities(channelType);
  }

  /**
   * Send a direct message to a specific phone number/contact via a channel
   * This method is used by the Contact Notification Node to send messages
   * to contacts that may not have an existing conversation
   */
  async sendDirectMessage(
    channelType: string,
    phoneNumber: string,
    messageType: string,
    content: string,
    mediaUrl?: string,
    subject?: string,
    companyId?: number
  ): Promise<ChannelServiceResult> {
    try {

      const { storage } = await import('../storage');
      
      if (!companyId) {
        return { success: false, error: 'Company ID is required' };
      }


      const connections = await storage.getChannelConnections(null, companyId);
      const channelConnection = connections.find(
        (conn: any) => conn.channelType === channelType && conn.status === 'active'
      );

      if (!channelConnection) {
        return { success: false, error: `No active ${channelType} channel connection found` };
      }


      const identifierType = channelType === 'whatsapp_official' ? 'whatsapp' : 
                             channelType === 'whatsapp_unofficial' ? 'whatsapp' :
                             channelType === 'email' ? 'email' :
                             channelType === 'messenger' ? 'messenger' :
                             channelType === 'instagram' ? 'instagram' :
                             channelType === 'tiktok' ? 'tiktok' :
                             channelType === 'webchat' ? 'webchat' :
                             'phone';


      let contact = await storage.getContactByPhone(phoneNumber, companyId);
      if (!contact) {

        contact = await storage.getContactByIdentifier(phoneNumber, identifierType);
        if (contact && contact.companyId !== companyId) {
          contact = undefined; // Don't use contact from different company
        }
      }

      if (!contact) {

        const contactData: any = {
          identifier: phoneNumber,
          identifierType: identifierType,
          phone: channelType === 'email' ? null : phoneNumber,
          email: channelType === 'email' ? phoneNumber : null,
          companyId: companyId,
          name: phoneNumber,
          source: channelType
        };
        contact = await storage.getOrCreateContact(contactData);
      }


      let conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        channelConnection.id
      );

      if (!conversation) {
        conversation = await storage.createConversation({
          contactId: contact.id,
          channelId: channelConnection.id,
          companyId: companyId || 0,
          channelType: channelType,
          status: 'open'
        });
      }



      let userId = channelConnection.userId || 0;
      if (!userId || userId === 0) {

        const companyUsers = await storage.getUsersByCompany(companyId);
        if (companyUsers && companyUsers.length > 0) {
          userId = companyUsers[0].id;
        }
      }


      if (!userId || userId === 0) {
        return { success: false, error: 'No valid user found for sending message' };
      }


      let messageResult: ChannelServiceResult;

      switch (channelType) {
        case 'whatsapp_unofficial':
        case 'whatsapp':
          if (messageType === 'text') {
            const result = await whatsAppService.sendMessage(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              phoneNumber,
              content,
              false,
              conversation.id
            );
            messageResult = { success: !!result, messageId: result?.id?.toString(), data: result };
          } else if (mediaUrl) {

            if (messageType !== 'image' && messageType !== 'video' && messageType !== 'audio' && messageType !== 'document') {
              messageResult = { success: false, error: `Unsupported message type: ${messageType}` };
              break;
            }



            const typedMediaType: 'image' | 'video' | 'audio' | 'document' = messageType as any;
            const result = await whatsAppService.sendMediaMessage(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              phoneNumber,
              typedMediaType,
              mediaUrl,
              content || undefined, // caption
              undefined, // fileName (optional)
              false, // isFromBot
              conversation.id // conversationId (optional)
            );
            messageResult = { success: !!result, messageId: result?.id?.toString(), data: result };
          } else {
            messageResult = { success: false, error: 'Media URL required for media messages' };
          }
          break;

        case 'whatsapp_official':
          if (messageType === 'text') {
            const result = await whatsAppOfficialService.sendMessage(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              companyId || 0,
              phoneNumber,
              content
            );
            messageResult = { success: !!result, messageId: result?.externalId || result?.id?.toString(), data: result };
          } else if (mediaUrl && (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'document')) {
            const result = await whatsAppOfficialService.sendMedia(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              companyId || 0,
              phoneNumber,
              messageType as 'image' | 'video' | 'audio' | 'document',
              mediaUrl,
              content
            );
            messageResult = { success: !!result, messageId: result?.externalId || result?.id?.toString(), data: result };
          } else {
            messageResult = { success: false, error: 'Media URL required for media messages' };
          }
          break;

        case 'messenger':
          if (messageType === 'text') {
            const result = await messengerService.sendMessage(channelConnection.id, phoneNumber, content);
            messageResult = { success: result.success, messageId: result.messageId, error: result.error };
          } else if (mediaUrl && (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'document')) {



            messageResult = { success: false, error: 'Media messages via URL are not yet supported for Messenger. Please use text messages.' };
          } else {
            messageResult = { success: false, error: 'Media URL required for media messages' };
          }
          break;

        case 'instagram':
          if (messageType === 'text') {
            const result = await instagramService.sendMessage(channelConnection.id, phoneNumber, content);
            messageResult = { success: result.success, messageId: result.messageId, error: result.error };
          } else if (mediaUrl && (messageType === 'image' || messageType === 'video')) {
            const result = await instagramService.sendMedia(
              channelConnection.id,
              phoneNumber,
              mediaUrl,
              messageType as 'image' | 'video',
              content
            );
            messageResult = { success: result.success, messageId: result.messageId, error: result.error };
          } else {
            messageResult = { success: false, error: 'Media URL required for media messages. Instagram only supports image and video.' };
          }
          break;

        case 'tiktok': {
          const tiktokConversationId = (conversation.groupMetadata as any)?.tiktokConversationId;
          const tiktokCompanyId = conversation.companyId;
          if (!tiktokConversationId || !tiktokCompanyId) {
            messageResult = { success: false, error: 'TikTok conversation or company not found' };
            break;
          }
          if (messageType === 'text') {
            const message = await TikTokService.sendAndSaveMessage(
              channelConnection.id,
              tiktokCompanyId,
              tiktokConversationId,
              phoneNumber,
              userId,
              'text',
              content
            );
            messageResult = { success: true, messageId: message.id.toString(), data: message };
          } else if (mediaUrl && (messageType === 'image' || messageType === 'video')) {
            const message = await TikTokService.sendAndSaveMessage(
              channelConnection.id,
              tiktokCompanyId,
              tiktokConversationId,
              phoneNumber,
              userId,
              messageType as 'image' | 'video',
              mediaUrl
            );
            messageResult = { success: true, messageId: message.id.toString(), data: message };
          } else {
            messageResult = { success: false, error: 'Media URL required for media messages. TikTok only supports text, image, and video.' };
          }
          break;
        }

        case 'email':
          if (!subject) {
            messageResult = { success: false, error: 'Subject is required for email messages' };
            break;
          }
          try {



            const result = await emailService.sendMessage(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              phoneNumber,
              subject,
              content,
              {
                isHtml: false


              }
            );
            messageResult = { success: true, messageId: result.id?.toString(), data: result };
          } catch (err: any) {
            messageResult = { success: false, error: err?.message || 'Failed to send email' };
          }
          break;

        case 'twilio_sms':
          if (messageType !== 'text') {
            messageResult = { success: false, error: 'Twilio SMS only supports text messages' };
            break;
          }
          try {
            const message = await twilioSmsService.sendMessage(
              channelConnection.id,
              userId, // Use valid user ID instead of 0
              phoneNumber,
              content
            );
            messageResult = { success: true, messageId: message.id?.toString(), data: message };
          } catch (err: any) {
            messageResult = { success: false, error: err?.message || 'Failed to send SMS' };
          }
          break;

        case 'webchat':
          if (messageType === 'text') {
            const message = await webchatService.sendMessage(channelConnection.id, phoneNumber, content);
            messageResult = { success: true, messageId: message?.id?.toString(), data: message };
          } else {


            messageResult = { success: false, error: 'Media messages are not yet supported for WebChat via direct message. Please use text messages.' };
          }
          break;

        default:
          messageResult = { success: false, error: `Unsupported channel type: ${channelType}` };
      }

      return messageResult;
    } catch (error: any) {
      console.error('Error sending direct message:', error);
      return { success: false, error: error.message || 'Failed to send direct message' };
    }
  }
}

export const channelManager = new ChannelManager();
export default channelManager;
