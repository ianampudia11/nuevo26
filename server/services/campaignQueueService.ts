import {
  campaignQueue,
  campaignRecipients,
  campaigns,
  campaignTemplates,
  channelConnections,
  contacts
} from '@shared/schema';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import path from 'path';
import { getDb } from '../db';
import {
  Campaign,
  CampaignProcessingResult,
  CampaignQueueMetadata, CampaignStats
} from '../types/campaign';
import { CampaignEventEmitter } from '../utils/websocket';
import { CampaignService } from './campaignService';
import { logger } from '../utils/logger';
import whatsappService from './channels/whatsapp';
import whatsappOfficialService from './channels/whatsapp-official';
import axios from 'axios';
import FormData from 'form-data';
import { storage } from '../storage';


import { normalizePhoneToE164 } from '../../shared/utils/phone';

interface QueueItem {
  id: number;
  campaign_id: number;
  recipient_id: number;
  account_id: number | null;
  scheduled_for: Date;
  attempts: number | null;
  max_attempts: number | null;
  metadata: unknown;
  priority: number | null;
  campaign_status: string | null;
  campaign_company_id: number | null;
}

interface ChannelConnection {
  id: number;
  userId: number;
  companyId: number | null;
  channelType: string;
  status: string;
}

interface RecipientData {
  id: number;
  contactId: number;
  variables: Record<string, any> | null;
  phone: string | null;
  name: string | null;
  email: string | null;
}





interface ConnectionProcessingPool {
  connectionId: number;
  isProcessing: boolean;
  lastProcessedAt: Date;
  rateLimiter: {
    lastSentAt: Date;
    sentCount: number;
    hourlyCount: number;
    dailyCount: number;
    lastHourReset: Date;
    lastDayReset: Date;
  };
  queue: QueueItem[];
  processingPromise: Promise<void> | null;
}

export class CampaignQueueService {
  private static globalProcessingEnabled: boolean = true;
  private campaignService: CampaignService;
  private isGlobalProcessing: boolean;
  private processingInterval: NodeJS.Timeout | null;
  private analyticsInterval: NodeJS.Timeout | null;
  private cleanupInterval: NodeJS.Timeout | null;
  private accountRotation: Map<string, number>;
  private connectionPools: Map<number, ConnectionProcessingPool>;
  private maxConcurrentConnections: number;
  private activeProcessingPromises: Map<number, Promise<void>>;

  /**
   * Build WhatsApp Official API template components (body parameters)
   * Handles variable mapping by position (1..N) to logical variable names
   * 
   * @param templateData Template data containing variables and optional mapping
   * @param allVariables All available variables (name, phone, email, company, etc.)
   * @returns Array of component objects for WhatsApp API
   */
  private buildWhatsappTemplateComponents(
    templateData: any,
    allVariables: Record<string, any>
  ): any[] {
    const components: any[] = [];
    const templateVariables = (templateData.variables as string[]) || [];

    if (templateVariables.length > 0) {
      const variableMapping = (templateData.whatsappTemplateVariableMapping as Record<string, string>) || {};
      const allVarsMap = allVariables as Record<string, any>;
      
      const bodyParameters = templateVariables.map((varName: string, index: number) => {


        const mappedVarName = variableMapping[String(index + 1)] || varName;
        const value = allVarsMap[mappedVarName] || '';

        return {
          type: 'text',
          text: String(value) // Ensure string type
        };
      });

      components.push({
        type: 'body',
        parameters: bodyParameters
      });
    }

    return components;
  }

  constructor() {
    this.campaignService = new CampaignService();
    this.isGlobalProcessing = false;
    this.processingInterval = null;
    this.analyticsInterval = null;
    this.cleanupInterval = null;
    this.accountRotation = new Map<string, number>();
    this.connectionPools = new Map<number, ConnectionProcessingPool>();
    this.maxConcurrentConnections = 5; // Process up to 5 connections concurrently
    this.activeProcessingPromises = new Map<number, Promise<void>>();
  }

  
  
  

  public startQueueProcessor(): void {
    if (this.isGlobalProcessing) {

      return;
    }

    CampaignQueueService.globalProcessingEnabled = true;
    this.isGlobalProcessing = true;



    this.processingInterval = setInterval(async () => {
      try {
        await this.processConcurrentQueue();
        await this.checkCampaignCompletion();
      } catch (error) {
        console.error('[Campaign Queue] Queue processing error:', error);
      }
    }, 3000); // Reduced interval for more responsive processing




    this.analyticsInterval = setInterval(async () => {
      try {
        await this.recordAnalyticsSnapshots();
      } catch (error) {
        console.error('[Campaign Queue] Analytics recording error:', error);
      }
    }, 300000);




    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePools();
    }, 60000); // Cleanup every minute



  }

  public async stopQueueProcessor(): Promise<void> {

    CampaignQueueService.globalProcessingEnabled = false;


    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }


    if (this.analyticsInterval) {
      clearInterval(this.analyticsInterval);
      this.analyticsInterval = null;
    }


    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isGlobalProcessing = false;


    if (this.activeProcessingPromises.size > 0) {
      
      try {
        await Promise.all(Array.from(this.activeProcessingPromises.values()));
      } catch (error) {
        console.error('[Campaign Queue] Error waiting for processing to complete:', error);
      }
    }

    this.connectionPools.clear();
    this.activeProcessingPromises.clear();
    
  }

  private async processQueue(): Promise<void> {
    try {

      const queueItems = await getDb().select({
        id: campaignQueue.id,
        campaign_id: campaignQueue.campaignId,
        recipient_id: campaignQueue.recipientId,
        account_id: campaignQueue.accountId,
        scheduled_for: campaignQueue.scheduledFor,
        attempts: campaignQueue.attempts,
        max_attempts: campaignQueue.maxAttempts,
        metadata: campaignQueue.metadata,
        priority: campaignQueue.priority,
        campaign_status: campaigns.status,
        campaign_company_id: campaigns.companyId
      })
      .from(campaignQueue)
      .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
      .where(and(
        eq(campaignQueue.status, 'pending'),
        lte(campaignQueue.scheduledFor, new Date()),
        eq(campaigns.status, 'running')
      ))
      .orderBy(asc(campaignQueue.priority), asc(campaignQueue.scheduledFor))
      .limit(50);


      if (queueItems.length === 0) {
        return;
      }


      
      const itemsByCompany = this.groupItemsByCompany(queueItems);


      for (const [companyId, items] of Array.from(itemsByCompany.entries())) {
        await this.processCompanyItems(companyId, items);
      }

    } catch (error) {
      console.error('Failed to process queue:', error);
    }
  }

  private groupItemsByCompany(queueItems: QueueItem[]): Map<number, QueueItem[]> {
    const itemsByCompany = new Map<number, QueueItem[]>();

    queueItems.forEach(item => {
      const companyId = item.campaign_company_id;
      if (companyId !== null) {
        if (!itemsByCompany.has(companyId)) {
          itemsByCompany.set(companyId, []);
        }
        itemsByCompany.get(companyId)!.push(item);
      }
    });

    return itemsByCompany;
  }

  private groupItemsByCampaign(queueItems: QueueItem[]): Map<number, QueueItem[]> {
    const itemsByCampaign = new Map<number, QueueItem[]>();

    queueItems.forEach(item => {
      const campaignId = item.campaign_id;
      if (!itemsByCampaign.has(campaignId)) {
        itemsByCampaign.set(campaignId, []);
      }
      itemsByCampaign.get(campaignId)!.push(item);
    });

    return itemsByCampaign;
  }

  private async getCampaignChannelConnection(campaignId: number): Promise<ChannelConnection | null> {
    try {
      
      const [campaign] = await getDb().select({
        id: campaigns.id,
        channelId: campaigns.channelId,
        channelIds: campaigns.channelIds,
        channelType: campaigns.channelType,
        companyId: campaigns.companyId,
        antiBanSettings: campaigns.antiBanSettings
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

      if (!campaign) {
        return null;
      }

      const channelIds = campaign.channelIds as number[] || [];
      const antiBanSettings = campaign.antiBanSettings as any || {};

      
     
      
      if (channelIds.length > 0 && antiBanSettings.accountRotation) {
      
        const selectedChannelId = await this.selectOptimalAccount(channelIds, campaign.companyId, antiBanSettings);

        if (!selectedChannelId) {
    
          
          if (campaign.channelId) {
            const [fallbackConnection] = await getDb().select()
              .from(channelConnections)
              .where(and(
                eq(channelConnections.id, campaign.channelId),
                eq(channelConnections.status, 'active')
              ));

            if (fallbackConnection && fallbackConnection.channelType.includes('whatsapp')) {
              return fallbackConnection as ChannelConnection;
            }
          }

          return null;
        }

        
        const [channelConnection] = await getDb().select()
          .from(channelConnections)
          .where(and(
            eq(channelConnections.id, selectedChannelId),
            eq(channelConnections.status, 'active')
          ));

        if (!channelConnection) {
          return null;
        }

        return channelConnection as ChannelConnection;
      }

      
      if (!campaign.channelId) {
        return null;
      }

      
      const [channelConnection] = await getDb().select()
        .from(channelConnections)
        .where(and(
          eq(channelConnections.id, campaign.channelId),
          eq(channelConnections.status, 'active')
        ));

      if (!channelConnection) {
        return null;
      }

      
      if (!channelConnection.channelType.includes('whatsapp')) {
        return null;
      }

      return channelConnection as ChannelConnection;
    } catch (error) {
      console.error(`Failed to get channel connection for campaign ${campaignId}:`, error);
      return null;
    }
  }

  private async selectOptimalAccount(channelIds: number[], companyId: number, antiBanSettings: any): Promise<number | null> {
    try {

      if (!channelIds || channelIds.length === 0) {
        
        return null;
      }


      const availableAccounts: Array<{
        id: number;
        accountName: string;
        status: string;
        updatedAt: Date;
      }> = [];

      for (const channelId of channelIds) {
        try {
          const account = await getDb().select()
            .from(channelConnections)
            .where(and(
              eq(channelConnections.id, channelId),
              eq(channelConnections.channelType, 'whatsapp_unofficial'),
              eq(channelConnections.status, 'active')
            ))
            .limit(1);

          if (account.length > 0) {
            availableAccounts.push({
              id: account[0].id,
              accountName: account[0].accountName || '',
              status: account[0].status || '',
              updatedAt: account[0].updatedAt || new Date()
            });
          }
        } catch (error) {
          console.error(`Failed to fetch account ${channelId}:`, error);
        }
      }

      if (availableAccounts.length === 0) {
        
        return null;
      }


      
      if (!antiBanSettings.mode || antiBanSettings.mode === 'simple') {
        const selectedAccount = availableAccounts[Math.floor(Math.random() * availableAccounts.length)];
        return selectedAccount.id;
      }

      
      const accountsWithStats = await Promise.all(
        availableAccounts.map(async (account) => {
          try {
            
            const allMessages = await getDb().select({
              completedAt: campaignQueue.completedAt
            })
            .from(campaignQueue)
            .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
            .where(and(
              eq(campaignQueue.accountId, account.id),
              eq(campaignQueue.status, 'completed'),
              eq(campaigns.companyId, companyId)
            ));

            
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

            let messageCountToday = 0;
            let messageCountHour = 0;
            let lastMessageAt: Date | null = null;

            for (const message of allMessages) {
              if (message.completedAt) {
                const completedAt = new Date(message.completedAt);

                
                if (completedAt >= todayStart) {
                  messageCountToday++;
                }

                
                if (completedAt >= hourStart) {
                  messageCountHour++;
                }

                
                if (!lastMessageAt || completedAt > lastMessageAt) {
                  lastMessageAt = completedAt;
                }
              }
            }

            return {
              ...account,
              messageCountToday,
              messageCountHour,
              lastMessageAt
            };
          } catch (error) {
            console.error(`Failed to get stats for account ${account.id}:`, error);
            return {
              ...account,
              messageCountToday: 0,
              messageCountHour: 0,
              lastMessageAt: null
            };
          }
        })
      );

      if (accountsWithStats.length === 0) {
        
        return null;
      }

      
      const scoredAccounts = accountsWithStats.map(account => {
        let score = 100; 

        const messageCountToday = account.messageCountToday || 0;
        const messageCountHour = account.messageCountHour || 0;
        const lastMessageAt = account.lastMessageAt ? new Date(account.lastMessageAt) : null;

        
        const rateLimits = this.getRateLimitsForMode(antiBanSettings.mode);


        
        if (messageCountToday > rateLimits.maxPerDay * 0.8) {
          score -= 50; 
        } else if (messageCountToday > rateLimits.maxPerDay * 0.6) {
          score -= 25; 
        }

        
        if (messageCountHour > rateLimits.maxPerHour * 0.8) {
          score -= 40;
        } else if (messageCountHour > rateLimits.maxPerHour * 0.6) {
          score -= 20;
        }

        
        if (lastMessageAt) {
          const timeSinceLastMessage = Date.now() - lastMessageAt.getTime();
          const cooldownPeriod = (antiBanSettings.cooldownPeriod || 30) * 60 * 1000; 

          if (timeSinceLastMessage > cooldownPeriod) {
            score += 20; 
          } else if (timeSinceLastMessage < cooldownPeriod * 0.5) {
            score -= 15; 
          }
        } else {
          score += 30; 
        }

        return {
          ...account,
          score,
          messageCountToday,
          messageCountHour,
          lastMessageAt
        };
      });

      
      const eligibleAccounts = scoredAccounts.filter(account => {
        const rateLimits = this.getRateLimitsForMode(antiBanSettings.mode);
        return account.messageCountToday < rateLimits.maxPerDay &&
               account.messageCountHour < rateLimits.maxPerHour;
      });

      if (eligibleAccounts.length === 0) {
        

        
        if (scoredAccounts.length > 0) {
          scoredAccounts.sort((a, b) => a.messageCountToday - b.messageCountToday);
          const fallbackAccount = scoredAccounts[0];

          return fallbackAccount.id;
        }

        return null;
      }

      
      eligibleAccounts.sort((a, b) => b.score - a.score);
      const selectedAccount = eligibleAccounts[0];


      return selectedAccount.id;
    } catch (error) {
      console.error('❌ Failed to select optimal account:', error);

      
      try {

        
        for (const channelId of channelIds) {
          try {
            const fallbackAccount = await getDb().select()
              .from(channelConnections)
              .where(and(
                eq(channelConnections.id, channelId),
                eq(channelConnections.channelType, 'whatsapp_unofficial'),
                eq(channelConnections.status, 'active')
              ))
              .limit(1);

            if (fallbackAccount.length > 0) {
              const account = fallbackAccount[0];
              return account.id;
            }
          } catch (singleAccountError) {
            console.error(`Failed to check account ${channelId}:`, singleAccountError);
          }
        }

      } catch (fallbackError) {
        console.error('Emergency fallback also failed:', fallbackError);
      }

      return null;
    }
  }

  private getRateLimitsForMode(mode: string): { maxPerDay: number; maxPerHour: number; maxPerMinute: number } {
    switch (mode) {
      case 'conservative':
        return { maxPerDay: 500, maxPerHour: 50, maxPerMinute: 2 };
      case 'moderate':
        return { maxPerDay: 1000, maxPerHour: 100, maxPerMinute: 5 };
      case 'aggressive':
        return { maxPerDay: 2000, maxPerHour: 200, maxPerMinute: 10 };
      default:
        return { maxPerDay: 1000, maxPerHour: 100, maxPerMinute: 5 };
    }
  }

  private async processCompanyItems(companyId: number, items: QueueItem[]): Promise<void> {
    try {

      
      const itemsByCampaign = this.groupItemsByCampaign(items);


      for (const [campaignId, campaignItems] of Array.from(itemsByCampaign.entries())) {
        await this.processCampaignItemsBatch(campaignId, campaignItems);
      }

    } catch (error) {
      console.error(`Failed to process company ${companyId} items:`, error);
    }
  }

  /**
   * Process campaign items in batches to improve performance and reduce database load
   */
  private async processCampaignItemsBatch(campaignId: number, items: QueueItem[]): Promise<void> {
    const BATCH_SIZE = 10;
    const BATCH_DELAY = 1000;


    try {


      const channelConnection = await this.getCampaignChannelConnection(campaignId);
      if (!channelConnection) {
        await this.markItemsAsFailed(items.map(item => item.id), 'No channel connection available');
        return;
      }


      if (channelConnection.status !== 'active') {
        await this.markItemsAsFailed(items.map(item => item.id), 'WhatsApp connection is not active');
        return;
      }


      
      const recipientIds = items.map(item => item.recipient_id);
      const recipientData = await this.getRecipientsData(recipientIds);
      const recipientMap = new Map(recipientData.map(r => [r.id, r]));

      
      const [campaignForSettings] = await getDb().select({
        antiBanSettings: campaigns.antiBanSettings
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

      const antiBanSettings = campaignForSettings?.antiBanSettings as any || {};

      
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);


        
        for (const item of batch) {
          try {
            const recipient = recipientMap.get(item.recipient_id);
            if (!recipient) {
              
              await this.markItemAsFailed(item.id, 'Recipient not found');
              continue;
            }

            
            await getDb().update(campaignQueue)
              .set({
                accountId: channelConnection.id,
                status: 'processing',
                startedAt: new Date()
              })
              .where(eq(campaignQueue.id, item.id));

            
            await this.processQueueItemWithData({
              ...item,
              account_id: channelConnection.id
            }, channelConnection, recipient);

            
            await this.addConnectionDelay(channelConnection.id, antiBanSettings);

          } catch (error) {
            console.error(`Error processing queue item ${item.id}:`, error);
            await this.handleItemFailure(item, error instanceof Error ? error.message : 'Unknown error');
          }
        }

        
        if (i + BATCH_SIZE < items.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }

    } catch (error) {
      console.error(`Failed to process campaign ${campaignId} items in batches:`, error);

      await this.markItemsAsFailed(items.map(item => item.id), `Batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processQueueItem(queueItem: QueueItem): Promise<CampaignProcessingResult> {
    try {

      const [claimed] = await getDb().update(campaignQueue)
        .set({ 
          status: 'processing',
          startedAt: new Date()
        })
        .where(and(
          eq(campaignQueue.id, queueItem.id),
          eq(campaignQueue.status, 'pending') // Only update if still pending
        ))
        .returning();

      if (!claimed) {

        return {
          success: false,
          error: 'Item already being processed',
          timestamp: new Date()
        };
      }

      const [campaign] = await getDb().select()
        .from(campaigns)
        .where(eq(campaigns.id, queueItem.campaign_id));

      const [recipient] = await getDb().select({
        id: campaignRecipients.id,
        contactId: campaignRecipients.contactId,
        variables: campaignRecipients.variables,
        phone: contacts.phone,
        name: contacts.name,
        email: contacts.email
      })
        .from(campaignRecipients)
        .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
        .where(eq(campaignRecipients.id, queueItem.recipient_id));

      if (!campaign || !recipient) {
        throw new Error('Campaign or recipient not found');
      }

      const campaignData = campaign;
      const recipientData = recipient as RecipientData;





      const allVariables = {

        name: recipientData.name || '',
        phone: recipientData.phone || '',
        email: recipientData.email || '',

        ...(recipientData.variables || {})
      };


      let personalizedContent = await this.campaignService.personalizeMessage(
        campaignData.content,
        allVariables
      );

      
      const updatedMetadata: CampaignQueueMetadata = {
        ...(queueItem.metadata as CampaignQueueMetadata || {}),
        content: personalizedContent,
        recipient_phone: recipientData.phone || '',
        recipient_name: recipientData.name || ''
      };

      await getDb().update(campaignQueue)
        .set({ metadata: updatedMetadata })
        .where(eq(campaignQueue.id, queueItem.id));


      const [channelConnection] = await getDb().select()
        .from(channelConnections)
        .where(eq(channelConnections.id, queueItem.account_id!));

      if (!channelConnection) {
        console.error(`[Campaign Queue] Channel connection not found: ${queueItem.account_id}`);
        throw new Error(`Channel connection not found for connection ${queueItem.account_id}`);
      }

      const connection = channelConnection as ChannelConnection;


      let templateData: any = null;
      if (campaignData.templateId && connection.channelType === 'whatsapp_official') {

        const [template] = await getDb().select()
          .from(campaignTemplates)
          .where(eq(campaignTemplates.id, campaignData.templateId));

        if (template && template.whatsappTemplateName) {
          templateData = template;

        } else {
          console.warn(`[Campaign Queue] Template ${campaignData.templateId} not found or missing WhatsApp template name`);
        }
      }

      const mediaUrls = (campaignData.mediaUrls as string[]) || [];
      const hasMedia = mediaUrls.length > 0;
      let result: any;


      if (templateData && connection.channelType === 'whatsapp_official') {

        if (!connection.companyId) {
          console.error(`[Campaign Queue] Company ID missing for connection ${connection.id}`);
          throw new Error('Company ID is required for WhatsApp Official template messages');
        }



        const components = this.buildWhatsappTemplateComponents(templateData, allVariables);





        try {
          result = await whatsappOfficialService.sendTemplateMessage(
            connection.id,
            connection.userId,
            connection.companyId,
            normalizePhoneToE164(recipientData.phone || ''),
            templateData.whatsappTemplateName,
            templateData.whatsappTemplateLanguage || 'en',
            components.length > 0 ? components : undefined,
            true // skipBroadcast - avoid duplicate client updates
          );

        } catch (error) {
          console.error(`[Campaign Queue] Error sending template message:`, error);
          throw error;
        }
      } else if (hasMedia) {


        for (const mediaUrl of mediaUrls) {
          const mediaType = this.getMediaTypeFromUrl(mediaUrl);
          const mediaPath = this.getMediaPathFromUrl(mediaUrl);


          if (connection.channelType === 'whatsapp_unofficial') {
            result = await whatsappService.sendMedia(
              connection.id,
              connection.userId,
              recipientData.phone || '',
              mediaType,
              mediaPath,
              personalizedContent,
              path.basename(mediaPath)
            );
          } else if (connection.channelType === 'whatsapp_official') {
            if (!connection.companyId) {
              throw new Error('Company ID is required for WhatsApp Official media messages');
            }
            result = await whatsappOfficialService.sendMedia(
              connection.id,
              connection.userId,
              connection.companyId,
              normalizePhoneToE164(recipientData.phone || ''),
              mediaType,
              mediaUrl,
              personalizedContent,
              undefined,
              undefined,
              true, // isFromBot = true for campaign messages
              true  // skipBroadcast - avoid duplicate client updates
            );
          } else {
            throw new Error(`Unsupported channel type: ${connection.channelType}`);
          }

          
          personalizedContent = '';
        }


        if (personalizedContent.trim()) {

          if (connection.channelType === 'whatsapp_unofficial') {
            result = await whatsappService.sendWhatsAppMessage(
              connection.id,
              connection.userId,
              recipientData.phone || '',
              personalizedContent
            );
          } else if (connection.channelType === 'whatsapp_official') {
            if (!connection.companyId) {
              throw new Error('Company ID is required for WhatsApp Official messages');
            }
            result = await whatsappOfficialService.sendMessage(
              connection.id,
              connection.userId,
              connection.companyId,
              normalizePhoneToE164(recipientData.phone || ''),
              personalizedContent
            );
          }

        }
      } else {

        if (connection.channelType === 'whatsapp_unofficial') {
          result = await whatsappService.sendWhatsAppMessage(
            connection.id,
            connection.userId,
            recipientData.phone || '',
            personalizedContent
          );
        } else if (connection.channelType === 'whatsapp_official') {
          if (!connection.companyId) {
            throw new Error('Company ID is required for WhatsApp Official messages');
          }
          result = await whatsappOfficialService.sendMessage(
            connection.id,
            connection.userId,
            connection.companyId,
            normalizePhoneToE164(recipientData.phone || ''),
            personalizedContent
          );
        } else {
          throw new Error(`Unsupported channel type: ${connection.channelType}`);
        }

      }



      await getDb().update(campaignQueue)
        .set({
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(campaignQueue.id, queueItem.id));


      await getDb().update(campaignRecipients)
        .set({
          status: 'sent',
          sentAt: new Date()
        })
        .where(eq(campaignRecipients.id, queueItem.recipient_id));


      await this.updateCampaignStatistics(queueItem.campaign_id);


      const progressStats = await this.getCampaignProgress(queueItem.campaign_id);


      CampaignEventEmitter.emitMessageSent(
        queueItem.campaign_id,
        campaignData.companyId,
        progressStats,
        {
          campaignName: campaignData.name,
          recipientPhone: recipientData.phone || '',
          recipientName: recipientData.name || '',
          messageId: result?.messageId || result?.id,
          sentAt: new Date()
        }
      );


      return {
        success: true,
        messageId: result?.messageId || result?.id,
        timestamp: new Date(),
        accountId: queueItem.account_id || undefined,
        recipientPhone: recipientData.phone || ''
      };

    } catch (error) {
      console.error(`Failed to process queue item ${queueItem.id}:`, error);
      throw error;
    }
  }

  /**
   * Process queue item with pre-fetched data to improve performance
   */
  private async processQueueItemWithData(
    queueItem: QueueItem,
    channelConnection: ChannelConnection,
    recipientData: RecipientData
  ): Promise<CampaignProcessingResult> {
    try {


      const [campaign] = await getDb().select()
        .from(campaigns)
        .where(eq(campaigns.id, queueItem.campaign_id));

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const campaignData = campaign;



      const allVariables = {

        name: recipientData.name || '',
        phone: recipientData.phone || '',
        email: recipientData.email || '',

        ...(recipientData.variables || {})
      };


      let templateData: any = null;
      if (campaignData.templateId && channelConnection.channelType === 'whatsapp_official') {


        const [template] = await getDb().select()
          .from(campaignTemplates)
          .where(eq(campaignTemplates.id, campaignData.templateId));

        if (template && template.whatsappTemplateName) {
          templateData = template;

        } else {

        }
      }


      if (templateData && channelConnection.channelType === 'whatsapp_official') {


        if (!channelConnection.companyId) {
          throw new Error('Company ID is required for WhatsApp Official template messages');
        }


        const components: any[] = [];
        const templateVariables = (templateData.variables as string[]) || [];
        

        let templateMediaUrls = (templateData.mediaUrls as string[]) || [];
        const campaignMediaUrls = (campaignData.mediaUrls as string[]) || [];
        

        const mediaUrls = campaignMediaUrls.length > 0 ? campaignMediaUrls : templateMediaUrls;
        const mediaHandle = templateData.mediaHandle; // Get stored media handle from template

        


        const hasMediaHandle = !!mediaHandle;
        const hasMediaUrls = mediaUrls.length > 0;
        const hasCampaignMedia = campaignMediaUrls.length > 0;
        const hasAnyMedia = hasMediaHandle || hasMediaUrls || hasCampaignMedia;






        if (hasAnyMedia) {

          let headerFormat = 'IMAGE'; // Default to IMAGE
          

          if (mediaUrls.length > 0) {
            const urlLower = mediaUrls[0].toLowerCase();

            if (urlLower.includes('/video/') || urlLower.match(/\.(mp4|mov|avi|webm)$/)) {
              headerFormat = 'VIDEO';
            } else if (urlLower.includes('/document/') || urlLower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/)) {
              headerFormat = 'DOCUMENT';
            } else if (urlLower.includes('/image/') || urlLower.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
              headerFormat = 'IMAGE';
            }
          }




          const isMediaHandleUrl = mediaHandle && (mediaHandle.startsWith('http://') || mediaHandle.startsWith('https://'));
          
          if (isMediaHandleUrl) {
            console.warn('[Campaign Queue] mediaHandle is a URL, not a media ID. Moving to mediaUrls for upload.');

            if (!mediaUrls.includes(mediaHandle)) {
              mediaUrls.unshift(mediaHandle); // Add to beginning
            }
          }

          if (mediaHandle && !isMediaHandleUrl) {



            
            components.push({
              type: 'header',
              parameters: [{
                type: headerFormat.toLowerCase(),
                [headerFormat.toLowerCase()]: {
                  id: mediaHandle  // Use the stored media handle
                }
              }]
            });


          } else if (mediaUrls.length > 0) {


            let mediaUrl = mediaUrls[0];


            if (!mediaUrl.startsWith('http://') && !mediaUrl.startsWith('https://')) {
              const baseUrl = process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

              if (baseUrl) {
                const cleanBaseUrl = baseUrl.replace(/\/$/, '');
                const cleanMediaUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
                mediaUrl = `${cleanBaseUrl}${cleanMediaUrl}`;
              } else {
                const basePort = process.env.PORT || '9000';
                const host = process.env.HOST || 'localhost';
                const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

                if (host === 'localhost' || host === '127.0.0.1') {
                  mediaUrl = `${protocol}://${host}:${basePort}${mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`}`;
                } else {
                  mediaUrl = `${protocol}://${host}${mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`}`;
                }
              }
            }



            try {
              const mediaId = await this.uploadMediaToWhatsApp(mediaUrl, headerFormat, channelConnection);



              components.push({
                type: 'header',
                parameters: [{
                  type: headerFormat.toLowerCase(),
                  [headerFormat.toLowerCase()]: {
                    id: mediaId
                  }
                }]
              });

            } catch (uploadError: any) {
              console.error('[Campaign Queue] Failed to upload media, trying with link as fallback:', uploadError.message);
              

              components.push({
                type: 'header',
                parameters: [{
                  type: headerFormat.toLowerCase(),
                  [headerFormat.toLowerCase()]: {
                    link: mediaUrl
                  }
                }]
              });
            }
          } else {

            console.error('[Campaign Queue] Template requires media header but no media URL or handle found!');
            console.error('[Campaign Queue] Template data:', {
              id: templateData.id,
              name: templateData.whatsappTemplateName,
              mediaUrls: templateData.mediaUrls,
              mediaHandle: templateData.mediaHandle
            });
            
            throw new Error(`Template "${templateData.whatsappTemplateName}" requires media in header, but no media URL or media handle is configured. Please upload media for this template or select a different template.`);
          }
        }



        const bodyComponents = this.buildWhatsappTemplateComponents(templateData, allVariables);
        components.push(...bodyComponents);



      

        try {
          const result = await whatsappOfficialService.sendTemplateMessage(
            channelConnection.id,
            channelConnection.userId,
            channelConnection.companyId,
            normalizePhoneToE164(recipientData.phone || ''),
            templateData.whatsappTemplateName,
            templateData.whatsappTemplateLanguage || 'en',
            components.length > 0 ? components : undefined,
            true // skipBroadcast - avoid duplicate client updates
          );




          await getDb().update(campaignQueue)
            .set({
              status: 'completed',
              completedAt: new Date()
            })
            .where(eq(campaignQueue.id, queueItem.id));

          await getDb().update(campaignRecipients)
            .set({
              status: 'sent',
              sentAt: new Date()
            })
            .where(eq(campaignRecipients.id, queueItem.recipient_id));

          await this.updateCampaignStatistics(queueItem.campaign_id);
          const progressStats = await this.getCampaignProgress(queueItem.campaign_id);

          CampaignEventEmitter.emitMessageSent(
            queueItem.campaign_id,
            campaignData.companyId,
            progressStats,
            {
              campaignName: campaignData.name,
              recipientPhone: recipientData.phone || '',
              recipientName: recipientData.name || '',
              messageId: result?.messageId || result?.id,
              sentAt: new Date()
            }
          );

          return {
            success: true,
            messageId: result?.messageId || result?.id,
            timestamp: new Date(),
            accountId: queueItem.account_id || undefined,
            recipientPhone: recipientData.phone || ''
          };
        } catch (error: any) {
          console.error(`[Campaign Queue] Error sending template message:`, error);
          

          if (error.response?.data) {
            console.error('[Campaign Queue] WhatsApp API Error Response:', JSON.stringify(error.response.data, null, 2));
          }
          

          console.error('[Campaign Queue] Failed template payload:', JSON.stringify({
            templateName: templateData.whatsappTemplateName,
            language: templateData.whatsappTemplateLanguage || 'en',
            recipientPhone: recipientData.phone,
            componentsCount: components.length,
            hasMediaComponent: components.some((c: any) => c.type === 'header'),
            components: components
          }, null, 2));
          

          const errorMessage = error.message || '';
          const errorDetails = error.response?.data?.error?.error_data?.details || '';
          
          if (errorMessage.includes('#132012') || errorDetails.includes('Format mismatch')) {

            console.error('\n❌ MEDIA HEADER MISSING ERROR DETECTED ❌');
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.error(`Template "${templateData.whatsappTemplateName}" requires media in the header.`);
            console.error('\nCurrent configuration:');
            console.error(`  - Template ID: ${templateData.id}`);
            console.error(`  - Media URLs in template: ${(templateData.mediaUrls as string[])?.length || 0}`);
            console.error(`  - Media handle: ${templateData.mediaHandle || 'Not configured'}`);
            console.error(`  - Campaign media URLs: ${(campaignData.mediaUrls as string[])?.length || 0}`);
            console.error('\n📝 HOW TO FIX:');
            console.error('1. Upload media to WhatsApp and get media handle:');
            console.error('   https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media');
            console.error('\n2. Update your template with media handle:');
            console.error(`   UPDATE campaign_templates SET media_handle = 'YOUR_MEDIA_ID' WHERE id = ${templateData.id};`);
            console.error('\nOR add media URL to template:');
            console.error(`   UPDATE campaign_templates SET media_urls = '["https://your-domain.com/image.jpg"]'::jsonb WHERE id = ${templateData.id};`);
            console.error('\nOR add media to campaign:');
            console.error(`   UPDATE campaigns SET media_urls = '["https://your-domain.com/image.jpg"]'::jsonb WHERE id = ${queueItem.campaign_id};`);
            console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            

            throw new Error(
              `Template "${templateData.whatsappTemplateName}" requires media header but none configured. ` +
              `Please add media_handle or media_urls to template ID ${templateData.id} or add media to campaign ${queueItem.campaign_id}. ` +
              `See logs above for detailed instructions.`
            );
          }
          
          throw error;
        }
      }




      let personalizedContent = await this.campaignService.personalizeMessage(
        campaignData.content,
        allVariables
      );


      const updatedMetadata: CampaignQueueMetadata = {
        ...(queueItem.metadata as CampaignQueueMetadata || {}),
        content: personalizedContent,
        recipient_phone: recipientData.phone || '',
        recipient_name: recipientData.name || ''
      };

      await getDb().update(campaignQueue)
        .set({ metadata: updatedMetadata })
        .where(eq(campaignQueue.id, queueItem.id));


      const mediaUrls = (campaignData.mediaUrls as string[]) || [];
      const hasMedia = mediaUrls.length > 0;
      let result: any;

      if (hasMedia) {

        for (const mediaUrl of mediaUrls) {
          const mediaType = this.getMediaTypeFromUrl(mediaUrl);
          const mediaPath = this.getMediaPathFromUrl(mediaUrl);


          if (channelConnection.channelType === 'whatsapp_unofficial') {
            result = await whatsappService.sendMedia(
              channelConnection.id,
              channelConnection.userId,
              recipientData.phone || '',
              mediaType,
              mediaPath,
              personalizedContent,
              path.basename(mediaPath)
            );
          } else if (channelConnection.channelType === 'whatsapp_official') {
            if (!channelConnection.companyId) {
              throw new Error('Company ID is required for WhatsApp Official media messages');
            }
            result = await whatsappOfficialService.sendMedia(
              channelConnection.id,
              channelConnection.userId,
              channelConnection.companyId,
              normalizePhoneToE164(recipientData.phone || ''),
              mediaType,
              mediaUrl,
              personalizedContent,
              undefined,
              undefined,
              true, // isFromBot = true for campaign messages
              true  // skipBroadcast - avoid duplicate client updates
            );
          } else {
            throw new Error(`Unsupported channel type: ${channelConnection.channelType}`);
          }

          personalizedContent = '';
        }

        
        if (personalizedContent.trim()) {
          if (channelConnection.channelType === 'whatsapp_unofficial') {
            result = await whatsappService.sendWhatsAppMessage(
              channelConnection.id,
              channelConnection.userId,
              recipientData.phone || '',
              personalizedContent
            );
          } else if (channelConnection.channelType === 'whatsapp_official') {
            if (!channelConnection.companyId) {
              throw new Error('Company ID is required for WhatsApp Official messages');
            }
            result = await whatsappOfficialService.sendMessage(
              channelConnection.id,
              channelConnection.userId,
              channelConnection.companyId,
              normalizePhoneToE164(recipientData.phone || ''),
              personalizedContent
            );
          }
        }
      } else {

        if (channelConnection.channelType === 'whatsapp_unofficial') {
          result = await whatsappService.sendWhatsAppMessage(
            channelConnection.id,
            channelConnection.userId,
            recipientData.phone || '',
            personalizedContent
          );
        } else if (channelConnection.channelType === 'whatsapp_official') {
          if (!channelConnection.companyId) {
            throw new Error('Company ID is required for WhatsApp Official messages');
          }
          result = await whatsappOfficialService.sendMessage(
            channelConnection.id,
            channelConnection.userId,
            channelConnection.companyId,
            normalizePhoneToE164(recipientData.phone || ''),
            personalizedContent
          );
        } else {
          throw new Error(`Unsupported channel type: ${channelConnection.channelType}`);
        }
      }


      
      await getDb().update(campaignQueue)
        .set({
          status: 'completed',
          completedAt: new Date()
        })
        .where(eq(campaignQueue.id, queueItem.id));

      
      await getDb().update(campaignRecipients)
        .set({
          status: 'sent',
          sentAt: new Date()
        })
        .where(eq(campaignRecipients.id, queueItem.recipient_id));

      
      await this.updateCampaignStatistics(queueItem.campaign_id);

      
      const progressStats = await this.getCampaignProgress(queueItem.campaign_id);


      CampaignEventEmitter.emitMessageSent(
        queueItem.campaign_id,
        campaignData.companyId,
        progressStats,
        {
          campaignName: campaignData.name,
          recipientPhone: recipientData.phone || '',
          recipientName: recipientData.name || '',
          messageId: result?.messageId || result?.id,
          sentAt: new Date()
        }
      );

      return {
        success: true,
        messageId: result?.messageId || result?.id,
        timestamp: new Date(),
        accountId: queueItem.account_id || undefined,
        recipientPhone: recipientData.phone || ''
      };

    } catch (error) {
      console.error(`Failed to process queue item ${queueItem.id}:`, error);
      throw error;
    }
  }

  /**
   * Get recipient data for multiple recipients in a single query
   */
  private async getRecipientsData(recipientIds: number[]): Promise<RecipientData[]> {
    try {
      if (recipientIds.length === 0) return [];

      const recipients = await getDb().select({
        id: campaignRecipients.id,
        contactId: campaignRecipients.contactId,
        variables: campaignRecipients.variables,
        phone: contacts.phone,
        name: contacts.name,
        email: contacts.email
      })
      .from(campaignRecipients)
      .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
      .where(inArray(campaignRecipients.id, recipientIds));

      return recipients.map(r => ({
        id: r.id,
        contactId: r.contactId,
        variables: r.variables as Record<string, any> | null,
        phone: r.phone || '',
        name: r.name || '',
        email: r.email || ''
      }));
    } catch (error) {
      console.error('Error fetching recipients data:', error);
      return [];
    }
  }

  /**
   * Mark multiple items as failed in a single query
   */
  private async markItemsAsFailed(itemIds: number[], errorMessage: string): Promise<void> {
    try {
      if (itemIds.length === 0) return;

      await getDb().update(campaignQueue)
        .set({
          status: 'failed',
          errorMessage: errorMessage,
          completedAt: new Date(),
          attempts: sql`attempts + 1`
        })
        .where(inArray(campaignQueue.id, itemIds));

    } catch (error) {
      console.error('Error marking items as failed:', error);
    }
  }

  /**
   * Mark a single item as failed
   */
  private async markItemAsFailed(itemId: number, errorMessage: string): Promise<void> {
    await this.markItemsAsFailed([itemId], errorMessage);
  }

  private async handleItemFailure(queueItem: QueueItem, errorMessage: string): Promise<void> {
    try {
      const attempts = (queueItem.attempts || 0) + 1;
      const maxAttempts = queueItem.max_attempts || 3;

      if (attempts >= maxAttempts) {
        
        await getDb().update(campaignQueue)
          .set({
            status: 'failed',
            errorMessage: errorMessage,
            attempts: attempts,
            lastErrorAt: new Date()
          })
          .where(eq(campaignQueue.id, queueItem.id));

        
        await getDb().update(campaignRecipients)
          .set({
            status: 'failed',
            failedAt: new Date(),
            errorMessage: errorMessage
          })
          .where(eq(campaignRecipients.id, queueItem.recipient_id));

        
        await this.updateCampaignStatistics(queueItem.campaign_id);

        
        const [campaignData] = await getDb().select({
          id: campaigns.id,
          name: campaigns.name,
          companyId: campaigns.companyId
        })
        .from(campaigns)
        .where(eq(campaigns.id, queueItem.campaign_id));

        if (campaignData) {
          
          const progressStats = await this.getCampaignProgress(queueItem.campaign_id);


          CampaignEventEmitter.emitMessageFailed(
            queueItem.campaign_id,
            campaignData.companyId,
            progressStats,
            errorMessage,
            {
              campaignName: campaignData.name
            }
          );
        }

      } else {
        
        const retryDelay = Math.pow(2, attempts) * 60000; 
        const retryTime = new Date(Date.now() + retryDelay);

        await getDb().update(campaignQueue)
          .set({
            status: 'pending',
            scheduledFor: retryTime,
            errorMessage: errorMessage,
            attempts: attempts,
            lastErrorAt: new Date()
          })
          .where(eq(campaignQueue.id, queueItem.id));
      }

    } catch (error) {
      console.error('Failed to handle item failure:', error);
    }
  }

  private async addConnectionDelay(_connectionId: number, antiBanSettings?: any): Promise<void> {
    try {
      let baseDelay = 6000; 
      let randomRange = [1000, 3000]; 

      
      if (antiBanSettings) {
        if (antiBanSettings.randomizeDelay) {
          const minDelay = (antiBanSettings.minDelay || 3) * 1000; 
          const maxDelay = (antiBanSettings.maxDelay || 15) * 1000; 
          randomRange = [minDelay, maxDelay];
          baseDelay = 0; 
        }

        
        switch (antiBanSettings.mode) {
          case 'conservative':
            baseDelay = Math.max(baseDelay, 10000); 
            break;
          case 'moderate':
            baseDelay = Math.max(baseDelay, 6000); 
            break;
          case 'aggressive':
            baseDelay = Math.max(baseDelay, 3000); 
            break;
        }

        
        if (antiBanSettings.businessHoursOnly) {
          const now = new Date();
          const hour = now.getHours();

          
          if (hour < 9 || hour >= 18) {
            baseDelay += 300000; 
          }
        }

        
        if (antiBanSettings.respectWeekends) {
          const now = new Date();
          const dayOfWeek = now.getDay();

          
          if (dayOfWeek === 0 || dayOfWeek === 6) {
            baseDelay += 600000; 
          }
        }
      }

      const randomDelay = Math.floor(
        Math.random() * (randomRange[1] - randomRange[0] + 1)
      ) + randomRange[0];

      const totalDelay = baseDelay + randomDelay;

      await new Promise<void>(resolve => setTimeout(resolve, totalDelay));
    } catch (error) {
      console.error('Failed to add connection delay:', error);
    }
  }

  
  
  

  private async recordAnalyticsSnapshots(): Promise<void> {

    if (!this.isGlobalProcessing || !CampaignQueueService.globalProcessingEnabled) {
      
      return;
    }

    try {
      
      const runningCampaigns = await getDb().select()
        .from(campaigns)
        .where(eq(campaigns.status, 'running'));

      for (const campaign of runningCampaigns) {
        try {
          await this.campaignService.recordAnalyticsSnapshot(campaign.id);
        } catch (error) {
          console.error(`Failed to record analytics for campaign ${campaign.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Failed to record analytics snapshots:', error);
    }
  }

  public async checkCampaignCompletion(): Promise<void> {

    if (!this.isGlobalProcessing || !CampaignQueueService.globalProcessingEnabled) {
      
      return;
    }

    try {


      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      

      const potentiallyCompletedCampaigns = await getDb().select({
        id: campaigns.id,
        companyId: campaigns.companyId,
        campaignType: campaigns.campaignType,
        name: campaigns.name,
        dripSettings: campaigns.dripSettings,
        timezone: campaigns.timezone,
        startedAt: campaigns.startedAt
      })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.status, 'running'),

            sql`EXISTS (
              SELECT 1 FROM campaign_queue 
              WHERE campaign_queue.campaign_id = campaigns.id 
              AND campaign_queue.updated_at > ${fiveMinutesAgo}
            )`
          )
        )
        .limit(100); // Limit to prevent loading too many campaigns at once

      if (potentiallyCompletedCampaigns.length === 0) {
        return;
      }


      const campaignsByCompany = new Map<number, typeof potentiallyCompletedCampaigns>();
      for (const campaign of potentiallyCompletedCampaigns) {
        if (campaign.companyId) {
          if (!campaignsByCompany.has(campaign.companyId)) {
            campaignsByCompany.set(campaign.companyId, []);
          }
          campaignsByCompany.get(campaign.companyId)!.push(campaign);
        }
      }


      const companyIds = Array.from(campaignsByCompany.keys());
      const concurrencyLimit = 5;
      
      for (let i = 0; i < companyIds.length; i += concurrencyLimit) {
        const companyBatch = companyIds.slice(i, i + concurrencyLimit);
        await Promise.allSettled(
          companyBatch.map(companyId => 
            this.checkCompanyCampaignsCompletion(campaignsByCompany.get(companyId)!)
          )
        );
      }
    } catch (error) {
      logger.error('Campaign Queue', 'Failed to check campaign completion', error);
    }
  }

  /**
   * Check completion for campaigns belonging to a specific company
   */
  private async checkCompanyCampaignsCompletion(companyCampaigns: Array<{ 
    id: number; 
    companyId: number | null; 
    campaignType: string | null; 
    name: string | null;
    dripSettings: any;
    timezone: string | null;
    startedAt: Date | null;
  }>): Promise<void> {
    for (const campaign of companyCampaigns) {
      try {
        const queueStats = await getDb().select({
          total: sql`COUNT(*)`,
          pending: sql`COUNT(*) FILTER (WHERE status = 'pending')`,
          processing: sql`COUNT(*) FILTER (WHERE status = 'processing')`,
          completed: sql`COUNT(*) FILTER (WHERE status = 'completed')`,
          failed: sql`COUNT(*) FILTER (WHERE status = 'failed')`,
          cancelled: sql`COUNT(*) FILTER (WHERE status = 'cancelled')`
        })
        .from(campaignQueue)
        .where(eq(campaignQueue.campaignId, campaign.id));

        const stats = queueStats[0];
        if (!stats) {
          continue; // Skip if no stats found
        }

        const totalItems = parseInt(String(stats.total));
        const pendingItems = parseInt(String(stats.pending));
        const processingItems = parseInt(String(stats.processing));
        const completedItems = parseInt(String(stats.completed));
        const failedItems = parseInt(String(stats.failed));

        const activePendingItems = pendingItems + processingItems;

        if (totalItems > 0 && activePendingItems === 0) {

          if (campaign.campaignType === 'recurring_daily') {
            await this.handleRecurringCampaignCompletion(campaign);
          } else {

            await getDb().update(campaigns)
              .set({
                status: 'completed',
                completedAt: new Date()
              })
              .where(eq(campaigns.id, campaign.id));

            await this.campaignService.recordAnalyticsSnapshot(campaign.id);

            CampaignEventEmitter.emitCampaignCompleted(
              campaign.id,
              campaign.companyId || 0,
              campaign.name || '',
              {
                totalRecipients: totalItems,
                successfulSends: completedItems,
                failedSends: failedItems
              }
            );
          }
        }
      } catch (error) {
        logger.error('Campaign Queue', `Failed to check completion for campaign ${campaign.id}`, error);
      }
    }
  }

  /**
   * Handle completion of a recurring daily campaign occurrence
   */
  private async handleRecurringCampaignCompletion(campaign: any) {
    try {
      if (!campaign.dripSettings) {

        await getDb().update(campaigns)
          .set({
            status: 'completed',
            completedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
        return;
      }

      const settings = campaign.dripSettings;
      const currentDate = new Date();


      if (settings.endDate) {
        const endDate = parseISO(settings.endDate);
        if (isAfter(currentDate, endDate)) {

          await getDb().update(campaigns)
            .set({
              status: 'completed',
              completedAt: new Date()
            })
            .where(eq(campaigns.id, campaign.id));
          return;
        }
      }




      const timezone = settings.timezone || campaign.timezone || 'UTC';
      const bufferMinutes = 2;
      

      let referenceTime: Date;
      if (campaign.startedAt) {
        referenceTime = new Date(new Date(campaign.startedAt).getTime() + bufferMinutes * 60 * 1000);
      } else {

        referenceTime = new Date(currentDate.getTime() + bufferMinutes * 60 * 1000);
      }
      
      const nextSendTime = this.getNextRecurringSendTime(settings, referenceTime, campaign.timezone);

      if (nextSendTime) {

        await getDb().update(campaigns)
          .set({
            status: 'scheduled',
            scheduledAt: nextSendTime,
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
      } else {

        await getDb().update(campaigns)
          .set({
            status: 'completed',
            completedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));
      }
    } catch (error) {
      logger.error('Campaign Queue', `Error handling recurring campaign completion for campaign ${campaign.id}`, error);
    }
  }

  /**
   * Get the next valid send time for a recurring daily campaign
   * Delegates to CampaignService to ensure consistent timezone handling
   */
  private getNextRecurringSendTime(recurringSettings: any, currentDateTime: Date, timezone: string = 'UTC'): Date | null {
    return this.campaignService.calculateNextRecurringSendTime(recurringSettings, currentDateTime, timezone);
  }

  public async getQueueStats(companyId: number): Promise<CampaignStats> {
    try {
      const stats = await getDb().select({
        total: sql`COUNT(*)`,
        pending: sql`COUNT(*) FILTER (WHERE status = 'pending')`,
        processing: sql`COUNT(*) FILTER (WHERE status = 'processing')`,
        completed: sql`COUNT(*) FILTER (WHERE status = 'completed')`,
        failed: sql`COUNT(*) FILTER (WHERE status = 'failed')`,
        cancelled: sql`COUNT(*) FILTER (WHERE status = 'cancelled')`
      })
      .from(campaignQueue)
      .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
      .where(eq(campaigns.companyId, companyId));

      const result = stats[0];
      if (!result) {
        return {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          paused: 0
        };
      }

      return {
        total: parseInt(String(result.total)),
        pending: parseInt(String(result.pending)),
        processing: parseInt(String(result.processing)),
        completed: parseInt(String(result.completed)),
        failed: parseInt(String(result.failed)),
        cancelled: parseInt(String(result.cancelled)),
        paused: 0
      };
    } catch (error) {
      throw new Error(`Failed to get queue stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async clearFailedQueueItems(companyId: number, olderThanDays: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);


      const companyCampaigns = await getDb().select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.companyId, companyId));

      const campaignIds = companyCampaigns.map(c => c.id);

      if (campaignIds.length === 0) {
        return 0;
      }

      const result = await getDb().delete(campaignQueue)
        .where(and(
          eq(campaignQueue.status, 'failed'),
          inArray(campaignQueue.campaignId, campaignIds),
          sql`${campaignQueue.lastErrorAt} IS NOT NULL AND ${campaignQueue.lastErrorAt} < ${cutoffDate}`
        ));

      return (result as any).rowCount || 0;
    } catch (error) {
      throw new Error(`Failed to clear failed queue items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async pauseCampaignQueue(campaignId: number): Promise<void> {
    try {

      await getDb().update(campaigns)
        .set({
          status: 'paused',
          pausedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));

    } catch (error) {
      throw new Error(`Failed to pause campaign queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async resumeCampaignQueue(campaignId: number): Promise<void> {
    try {

      await getDb().update(campaigns)
        .set({
          status: 'running',
          pausedAt: null
        })
        .where(eq(campaigns.id, campaignId));

    } catch (error) {
      throw new Error(`Failed to resume campaign queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async cancelCampaignQueue(campaignId: number): Promise<void> {
    try {

      await getDb().update(campaignQueue)
        .set({
          status: 'cancelled'
        })
        .where(and(
          eq(campaignQueue.campaignId, campaignId),
          eq(campaignQueue.status, 'pending')
        ));


      await getDb().update(campaigns)
        .set({
          status: 'cancelled'
        })
        .where(eq(campaigns.id, campaignId));

    } catch (error) {
      throw new Error(`Failed to cancel campaign queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  
  
  

  private async updateCampaignStatistics(campaignId: number): Promise<void> {
    try {
      
      const recipientStats = await getDb().select({
        total: sql`COUNT(*)`,
        sent: sql`COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))`,
        failed: sql`COUNT(*) FILTER (WHERE status = 'failed')`,
        pending: sql`COUNT(*) FILTER (WHERE status IN ('pending', 'processing'))`
      })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));

      const stats = recipientStats[0];
      const totalRecipients = parseInt(String(stats.total)) || 0;
      const successfulSends = parseInt(String(stats.sent)) || 0;
      const failedSends = parseInt(String(stats.failed)) || 0;
      const processedRecipients = successfulSends + failedSends;

      
      await getDb().update(campaigns)
        .set({
          totalRecipients,
          processedRecipients,
          successfulSends,
          failedSends,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaignId));

    } catch (error) {
      console.error(`Failed to update campaign statistics for campaign ${campaignId}:`, error);
    }
  }

  
  
  

  private async getCampaignProgress(campaignId: number): Promise<{
    totalRecipients: number;
    processedRecipients: number;
    successfulSends: number;
    failedSends: number;
    progressPercentage: number;
  }> {
    try {
      
      const [campaign] = await getDb().select({
        totalRecipients: campaigns.totalRecipients,
        processedRecipients: campaigns.processedRecipients,
        successfulSends: campaigns.successfulSends,
        failedSends: campaigns.failedSends
      })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const totalRecipients = campaign.totalRecipients || 0;
      const processedRecipients = campaign.processedRecipients || 0;
      const successfulSends = campaign.successfulSends || 0;
      const failedSends = campaign.failedSends || 0;

      const progressPercentage = totalRecipients > 0
        ? Math.round((processedRecipients / totalRecipients) * 100)
        : 0;

      return {
        totalRecipients,
        processedRecipients,
        successfulSends,
        failedSends,
        progressPercentage
      };
    } catch (error) {
      console.error('Failed to get campaign progress:', error);
      return {
        totalRecipients: 0,
        processedRecipients: 0,
        successfulSends: 0,
        failedSends: 0,
        progressPercentage: 0
      };
    }
  }

  
  
  
  

  
  
  

  /**
   * NEW: Concurrent queue processing method
   */
  private async processConcurrentQueue(): Promise<void> {

    if (!this.isGlobalProcessing || !CampaignQueueService.globalProcessingEnabled) {
      
      return;
    }

    try {


      const queueItems = await getDb().select({
        id: campaignQueue.id,
        campaign_id: campaignQueue.campaignId,
        recipient_id: campaignQueue.recipientId,
        account_id: campaignQueue.accountId,
        scheduled_for: campaignQueue.scheduledFor,
        attempts: campaignQueue.attempts,
        max_attempts: campaignQueue.maxAttempts,
        metadata: campaignQueue.metadata,
        priority: campaignQueue.priority,
        campaign_status: campaigns.status,
        campaign_company_id: campaigns.companyId
      })
      .from(campaignQueue)
      .leftJoin(campaigns, eq(campaignQueue.campaignId, campaigns.id))
      .where(and(
        eq(campaignQueue.status, 'pending'),
        lte(campaignQueue.scheduledFor, new Date()),
        eq(campaigns.status, 'running')
      ))
      .orderBy(asc(campaignQueue.priority), asc(campaignQueue.scheduledFor))
      .limit(100); // Increased limit for concurrent processing



      if (queueItems.length === 0) {
        return;
      }




      const itemsByConnection = await this.groupItemsByConnection(queueItems);
      

      const connectionIds = Array.from(itemsByConnection.keys());
      const connectionBatches = [];
      
      for (let i = 0; i < connectionIds.length; i += this.maxConcurrentConnections) {
        connectionBatches.push(connectionIds.slice(i, i + this.maxConcurrentConnections));
      }


      for (const batch of connectionBatches) {
        const processingPromises = batch.map(connectionId => 
          this.processConnectionItems(connectionId, itemsByConnection.get(connectionId)!)
        );
        
        try {
          await Promise.allSettled(processingPromises);
        } catch (error) {
          console.error('Error in concurrent batch processing:', error);
        }
      }

    } catch (error) {
      console.error('Failed to process concurrent queue:', error);
    }
  }

  /**
   * Group queue items by their assigned or potential connection ID
   */
  private async groupItemsByConnection(queueItems: QueueItem[]): Promise<Map<number, QueueItem[]>> {
    const itemsByConnection = new Map<number, QueueItem[]>();




    for (const item of queueItems) {
      if (item.account_id) {

        const connectionId = item.account_id;


        if (!itemsByConnection.has(connectionId)) {
          itemsByConnection.set(connectionId, []);
        }
        itemsByConnection.get(connectionId)!.push(item);
      } else {


        try {
          const connection = await this.getCampaignChannelConnection(item.campaign_id);
          if (connection) {
            const connectionId = connection.id;


            if (!itemsByConnection.has(connectionId)) {
              itemsByConnection.set(connectionId, []);
            }
            itemsByConnection.get(connectionId)!.push(item);
          } else {
            console.error(`[Campaign Queue] No connection found for campaign ${item.campaign_id}`);
          }
        } catch (error) {
          console.error(`[Campaign Queue] Error getting connection for campaign ${item.campaign_id}:`, error);
        }
      }
    }


    return itemsByConnection;
  }

  /**
   * Process items for a specific connection with rate limiting
   */
  private async processConnectionItems(connectionId: number, items: QueueItem[]): Promise<void> {
    try {


      let pool = this.connectionPools.get(connectionId);
      if (!pool) {

        pool = this.createConnectionPool(connectionId);
        this.connectionPools.set(connectionId, pool);
      }


      if (pool.isProcessing) {

        return;
      }


      if (!this.canProcessConnection(pool)) {

        return;
      }


      pool.isProcessing = true;
      pool.lastProcessedAt = new Date();





      const processingPromise = this.processConnectionBatch(connectionId, items, pool);
      this.activeProcessingPromises.set(connectionId, processingPromise);


      await processingPromise;


    } catch (error) {
      console.error(`[Campaign Queue] Error processing connection ${connectionId}:`, error);
    } finally {

      const pool = this.connectionPools.get(connectionId);
      if (pool) {
        pool.isProcessing = false;
      }
      this.activeProcessingPromises.delete(connectionId);
    }
  }

  /**
   * Create a new connection processing pool
   */
  private createConnectionPool(connectionId: number): ConnectionProcessingPool {
    return {
      connectionId,
      isProcessing: false,
      lastProcessedAt: new Date(0),
      rateLimiter: {
        lastSentAt: new Date(0),
        sentCount: 0,
        hourlyCount: 0,
        dailyCount: 0,
        lastHourReset: new Date(),
        lastDayReset: new Date()
      },
      queue: [],
      processingPromise: null
    };
  }

  /**
   * Check if a connection can process based on rate limits
   */
  private canProcessConnection(pool: ConnectionProcessingPool): boolean {
    const now = new Date();
    const rateLimiter = pool.rateLimiter;
    

    if (now.getTime() - rateLimiter.lastHourReset.getTime() > 3600000) {
      rateLimiter.hourlyCount = 0;
      rateLimiter.lastHourReset = now;
    }
    

    if (now.getTime() - rateLimiter.lastDayReset.getTime() > 86400000) {
      rateLimiter.dailyCount = 0;
      rateLimiter.lastDayReset = now;
    }
    

    const maxPerMinute = 10;
    const maxPerHour = 300;
    const maxPerDay = 5000;
    const minDelayBetweenMessages = 2000; // 2 seconds
    

    const timeSinceLastMessage = now.getTime() - rateLimiter.lastSentAt.getTime();
    if (timeSinceLastMessage < minDelayBetweenMessages) {
      return false;
    }
    

    if (rateLimiter.hourlyCount >= maxPerHour || rateLimiter.dailyCount >= maxPerDay) {
      return false;
    }
    
    return true;
  }

  /**
   * Process a batch of items for a specific connection
   */
  private async processConnectionBatch(
    connectionId: number,
    items: QueueItem[],
    pool: ConnectionProcessingPool
  ): Promise<void> {
    const BATCH_SIZE = 5; // Smaller batches for concurrent processing



    try {

      const [connection] = await getDb().select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connectionId));

      if (!connection || connection.status !== 'active') {
        console.error(`[Campaign Queue] Connection ${connectionId} not available or inactive`);
        await this.markItemsAsFailed(items.map(item => item.id), 'Connection not available or inactive');
        return;
      }



      const recipientIds = items.map(item => item.recipient_id);
      const recipientData = await this.getRecipientsData(recipientIds);
      const recipientMap = new Map(recipientData.map(r => [r.id, r]));



      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);


        for (const item of batch) {
          try {


            const recipient = recipientMap.get(item.recipient_id);
            if (!recipient) {
              console.error(`[Campaign Queue] Recipient ${item.recipient_id} not found`);
              await this.markItemAsFailed(item.id, 'Recipient not found');
              continue;
            }



            await getDb().update(campaignQueue)
              .set({
                accountId: connectionId,
                status: 'processing',
                startedAt: new Date()
              })
              .where(eq(campaignQueue.id, item.id));


            await this.processQueueItemWithData(
              { ...item, account_id: connectionId },
              connection as any,
              recipient
            );


            pool.rateLimiter.sentCount++;
            pool.rateLimiter.hourlyCount++;
            pool.rateLimiter.dailyCount++;
            pool.rateLimiter.lastSentAt = new Date();


            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (error) {
            console.error(`Error processing item ${item.id}:`, error);
            await this.handleItemFailure(item, error instanceof Error ? error.message : 'Unknown error');
          }
        }
        

        if (i + BATCH_SIZE < items.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }


      
    } catch (error) {
      console.error(`Error in connection batch processing for connection ${connectionId}:`, error);
      await this.markItemsAsFailed(
        items.map(item => item.id), 
        `Connection batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean up inactive connection pools
   */
  private cleanupInactivePools(): void {
    const now = new Date();
    const maxInactiveTime = 300000; // 5 minutes
    
    const poolsToDelete: number[] = [];
    
    this.connectionPools.forEach((pool, connectionId) => {
      const timeSinceLastProcessing = now.getTime() - pool.lastProcessedAt.getTime();
      
      if (!pool.isProcessing && timeSinceLastProcessing > maxInactiveTime) {
        poolsToDelete.push(connectionId);
      }
    });
    
    poolsToDelete.forEach(connectionId => {
      this.connectionPools.delete(connectionId);

    });
  }

  public getProcessingStatus(): { 
    isProcessing: boolean; 
    accountRotationSize: number;
    concurrentConnections: number;
    activePools: number;
  } {
    return {
      isProcessing: this.isGlobalProcessing,
      accountRotationSize: this.accountRotation.size,
      concurrentConnections: this.activeProcessingPromises.size,
      activePools: this.connectionPools.size
    };
  }

  public clearAccountRotation(): void {
    this.accountRotation.clear();
  }

  
  
  

  private getMediaTypeFromUrl(mediaUrl: string): 'image' | 'video' | 'audio' | 'document' {
    const urlPath = mediaUrl.toLowerCase();

    if (urlPath.includes('/image/') || urlPath.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      return 'image';
    } else if (urlPath.includes('/video/') || urlPath.match(/\.(mp4|avi|mov|wmv|3gp)$/)) {
      return 'video';
    } else if (urlPath.includes('/audio/') || urlPath.match(/\.(mp3|wav|ogg|m4a|aac)$/)) {
      return 'audio';
    } else {
      return 'document';
    }
  }

  private getMediaPathFromUrl(mediaUrl: string): string {
    
    
    
    const relativePath = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;
    return path.join(process.cwd(), relativePath);
  }

  /**
   * Upload media to WhatsApp and get media ID
   * This is more reliable than using direct links
   */
  private async uploadMediaToWhatsApp(
    mediaUrl: string,
    mediaType: string,
    channelConnection: ChannelConnection
  ): Promise<string> {
    try {
      const connection = await storage.getChannelConnection(channelConnection.id);
      if (!connection) {
        throw new Error('Channel connection not found');
      }

      const connectionData = connection.connectionData as any;
      const accessToken = connectionData?.accessToken || connection.accessToken;
      const phoneNumberId = connectionData?.phoneNumberId;

      if (!accessToken || !phoneNumberId) {
        throw new Error('Missing WhatsApp connection credentials');
      }




      const mediaResponse = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });


      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      
      const fileExtension = this.getFileExtension(mediaUrl);
      const contentType = mediaResponse.headers['content-type'] || this.getContentTypeFromExtension(fileExtension);
      
      formData.append('file', Buffer.from(mediaResponse.data), {
        filename: `campaign_media.${fileExtension}`,
        contentType: contentType
      });


      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            ...formData.getHeaders()
          },
          maxBodyLength: Infinity,
          timeout: 60000
        }
      );

      if (!uploadResponse.data?.id) {
        throw new Error('Failed to get media ID from WhatsApp');
      }


      return uploadResponse.data.id;

    } catch (error: any) {
      console.error('[Campaign Queue] Failed to upload media to WhatsApp:', error.message);
      if (error.response?.data) {
        console.error('[Campaign Queue] WhatsApp upload error:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Media upload failed: ${error.message}`);
    }
  }

  /**
   * Get file extension from URL
   */
  private getFileExtension(url: string): string {
    const urlLower = url.toLowerCase();
    if (urlLower.match(/\.(jpg|jpeg)$/)) return 'jpg';
    if (urlLower.match(/\.png$/)) return 'png';
    if (urlLower.match(/\.gif$/)) return 'gif';
    if (urlLower.match(/\.webp$/)) return 'webp';
    if (urlLower.match(/\.mp4$/)) return 'mp4';
    if (urlLower.match(/\.mov$/)) return 'mov';
    if (urlLower.match(/\.pdf$/)) return 'pdf';
    if (urlLower.match(/\.doc$/)) return 'doc';
    if (urlLower.match(/\.docx$/)) return 'docx';
    return 'jpg'; // default
  }

  /**
   * Get content type from file extension
   */
  private getContentTypeFromExtension(extension: string): string {
    const types: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[extension] || 'application/octet-stream';
  }
}
