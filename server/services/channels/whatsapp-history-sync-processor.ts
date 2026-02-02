import { storage } from '../../storage';
import { ChannelConnection, InsertContact, InsertConversation, InsertMessage } from '@shared/schema';
import { broadcastToCompany } from '../../utils/websocket';

function normalizePhoneToE164(phone: string): string {
  if (!phone) return phone;


  let normalized = phone.replace(/[^\d+]/g, '');


  if (normalized.startsWith('+')) {
    return normalized;
  }


  return '+' + normalized;
}

/**
 * WhatsApp History Sync Processor
 * Processes history sync webhooks from Meta WhatsApp Business API
 */
export class WhatsAppHistorySyncProcessor {
  /**
   * Process a history chunk from Meta WhatsApp webhook
   * @param historyData The history data from the webhook
   * @param connection The channel connection
   */
  async processHistoryChunk(historyData: any, connection: ChannelConnection): Promise<void> {
    try {
      if (!historyData.metadata || !historyData.threads) {
        console.warn('[HISTORY SYNC] Invalid history data structure:', {
          hasMetadata: !!historyData.metadata,
          hasThreads: !!historyData.threads
        });
        return;
      }

      const { phase, chunk_order, progress } = historyData.metadata;
      const batchId = `${connection.id}-phase-${phase}-chunk-${chunk_order}`;




      let batch = await storage.getHistorySyncBatch(batchId);
      if (!batch) {
        batch = await storage.createHistorySyncBatch({
          batchId,
          connectionId: connection.id,
          companyId: connection.companyId!,
          syncType: 'initial',
          status: 'processing',
          processedMessages: 0,
          processedChats: 0,
          processedContacts: 0,
          totalMessages: 0,
          totalChats: Array.isArray(historyData.threads) ? historyData.threads.length : 0,
          totalContacts: 0,
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null
        });
      } else {
        batch = await storage.updateHistorySyncBatch(batchId, {
          status: 'processing'
        });
      }

      if (!batch) {
        console.error('[HISTORY SYNC] Failed to create or update batch');
        return;
      }

      const connData = connection.connectionData as any;
      const businessPhoneNumber = normalizePhoneToE164(connData?.phoneNumber || '');

      let processedMessages = batch.processedMessages || 0;
      let processedChats = batch.processedChats || 0;
      let processedContacts = batch.processedContacts || 0;


      for (const thread of historyData.threads || []) {
        if (!thread.id || !thread.messages || !Array.isArray(thread.messages)) {
          console.warn('[HISTORY SYNC] Invalid thread structure:', {
            hasId: !!thread.id,
            hasMessages: !!thread.messages,
            isArray: Array.isArray(thread.messages)
          });
          continue;
        }

        const contactPhoneNumber = thread.id;
        const normalizedPhone = normalizePhoneToE164(contactPhoneNumber);


        const contactData: InsertContact = {
          companyId: connection.companyId!,
          name: normalizedPhone,
          phone: normalizedPhone,
          email: null,
          avatarUrl: null,
          identifier: normalizedPhone,
          identifierType: 'whatsapp',
          source: 'whatsapp_official',
          notes: null,
          isHistorySync: true,
          historySyncBatchId: batchId
        };

        const contact = await storage.getOrCreateContact(contactData);
        if (!contact.isHistorySync) {

          await storage.updateContact(contact.id, {
            isHistorySync: true,
            historySyncBatchId: batchId
          });
        }


        let conversation = await storage.getConversationByContactAndChannel(
          contact.id,
          connection.id
        );

        if (!conversation) {
          const conversationData: InsertConversation = {
            companyId: connection.companyId!,
            contactId: contact.id,
            channelId: connection.id,
            channelType: 'whatsapp_official',
            status: 'open',
            assignedToUserId: connection.userId,
            lastMessageAt: null,
            isHistorySync: true,
            historySyncBatchId: batchId
          };

          conversation = await storage.createConversation(conversationData);
        } else if (!conversation.isHistorySync) {

          await storage.updateConversation(conversation.id, {
            isHistorySync: true,
            historySyncBatchId: batchId
          });
        }


        for (const message of thread.messages) {
          if (!message.id || !message.timestamp) {
            console.warn('[HISTORY SYNC] Invalid message structure:', {
              hasId: !!message.id,
              hasTimestamp: !!message.timestamp
            });
            continue;
          }


          const existingMessage = await storage.getMessageByExternalId(
            message.id,
            connection.companyId ?? undefined
          );
          if (existingMessage) {
            continue; // Skip duplicate messages
          }


          const normalizedFrom = normalizePhoneToE164(message.from);
          const normalizedTo = normalizePhoneToE164(message.to);
          const normalizedBusiness = businessPhoneNumber;

          const direction = (normalizedBusiness && normalizedFrom === normalizedBusiness)
            ? 'outbound'
            : 'inbound';

          if (normalizedBusiness && normalizedFrom !== normalizedBusiness && normalizedTo && normalizedTo !== normalizedBusiness) {
            console.warn('[HISTORY SYNC] Sender/recipient did not match business number', {
              from: normalizedFrom,
              to: normalizedTo,
              business: normalizedBusiness
            });
          }


          let messageType = 'text';
          let messageContent = '';
          const msgMetadata: any = {
            messageId: message.id,
            timestamp: message.timestamp,
            isHistorySync: true,
            historySyncBatchId: batchId
          };

          if (message.type === 'text' && message.text) {
            messageType = 'text';
            messageContent = message.text.body || '';
          } else if (message.type === 'image' && message.image) {
            messageType = 'image';
            messageContent = message.image.caption || '';
            msgMetadata.mediaId = message.image.id;
          } else if (message.type === 'video' && message.video) {
            messageType = 'video';
            messageContent = message.video.caption || '';
            msgMetadata.mediaId = message.video.id;
          } else if (message.type === 'audio' && message.audio) {
            messageType = 'audio';
            messageContent = 'Audio message';
            msgMetadata.mediaId = message.audio.id;
          } else if (message.type === 'document' && message.document) {
            messageType = 'document';
            messageContent = message.document.caption || message.document.filename || 'Document';
            msgMetadata.mediaId = message.document.id;
            msgMetadata.filename = message.document.filename;
          } else if (message.type === 'location' && message.location) {
            messageType = 'location';
            messageContent = `Location: ${message.location.latitude}, ${message.location.longitude}`;
            msgMetadata.location = message.location;
          } else if (message.type === 'contacts' && message.contacts) {
            messageType = 'contact';
            messageContent = 'Contact shared';
            msgMetadata.contacts = message.contacts;
          } else {
            messageType = message.type || 'unknown';
            messageContent = `Unsupported message type: ${message.type}`;
          }


          let status = 'delivered';
          if (message.history_context?.status) {
            const historyStatus = message.history_context.status.toLowerCase();
            if (historyStatus === 'sent') {
              status = 'sent';
            } else if (historyStatus === 'delivered') {
              status = 'delivered';
            } else if (historyStatus === 'read') {
              status = 'read';
            } else if (historyStatus === 'failed') {
              status = 'failed';
            }
          }


          const messageTimestamp = parseInt(message.timestamp) * 1000; // Convert to milliseconds
          const messageData: InsertMessage = {
            conversationId: conversation.id,
            content: messageContent,
            type: messageType,
            direction: direction,
            status: status,
            metadata: JSON.stringify(msgMetadata),
            mediaUrl: null,
            externalId: message.id,
            isHistorySync: true,
            historySyncBatchId: batchId,
            createdAt: new Date(messageTimestamp)
          };

          await storage.createMessage(messageData);
          processedMessages++;


          if (!conversation.lastMessageAt || 
              new Date(messageTimestamp) > new Date(conversation.lastMessageAt)) {
            await storage.updateConversation(conversation.id, {
              lastMessageAt: new Date(messageTimestamp)
            });
          }
        }

        processedChats++;
      }

      processedContacts = new Set(historyData.threads?.map((t: any) => t.id) || []).size;


      await storage.updateHistorySyncBatch(batchId, {
        processedMessages,
        processedChats,
        processedContacts
      });


      await storage.updateChannelConnection(connection.id, {
        connectionData: {
          ...connData,
          historySyncProgress: progress,
          historySyncPhase: phase
        }
      });


      if (connection.companyId) {
        broadcastToCompany({
          type: 'historySyncProgress',
          data: {
            connectionId: connection.id,
            phase: phase,
            progress: progress,
            processedMessages: processedMessages,
            totalMessages: batch.totalMessages || 0,
            processedChats: processedChats,
            processedContacts: processedContacts
          }
        }, connection.companyId);
      }


      if (progress === 100) {
        await storage.updateHistorySyncBatch(batchId, {
          status: 'completed',
          completedAt: new Date()
        });

        await storage.updateChannelConnection(connection.id, {
          connectionData: {
            ...connData,
            historySyncStatus: 'completed',
            lastHistorySyncAt: new Date()
          }
        });


        if (connection.companyId) {
          broadcastToCompany({
            type: 'whatsappHistorySyncComplete',
            data: {
              connectionId: connection.id,
              totalChats: processedChats,
              totalMessages: processedMessages,
              totalContacts: processedContacts
            }
          }, connection.companyId);
        }


      }


    } catch (error) {
      console.error('[HISTORY SYNC] Error processing history chunk:', error);
      throw error;
    }
  }
}

