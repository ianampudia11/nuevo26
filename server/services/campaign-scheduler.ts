import { db } from '../db';
import { campaigns, channelConnections, campaignRecipients } from '../../shared/schema';
import { eq, and, lte, or, inArray, ne, sql, asc } from 'drizzle-orm';
import { CampaignService } from './campaignService';
import { format, addDays, isAfter, isBefore, parseISO } from 'date-fns';
import { campaignLogger } from '../utils/campaign-logger';
import { campaignSchedulerConfig } from '../config/campaign-config';

/**
 * Campaign Scheduler Service
 * Periodically checks for scheduled campaigns and starts them when their scheduled time arrives
 */
export class CampaignScheduler {
  private static instance: CampaignScheduler;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL = campaignSchedulerConfig.CHECK_INTERVAL;
  private campaignService: CampaignService;
  private readonly BATCH_SIZE = campaignSchedulerConfig.BATCH_SIZE;
  private readonly MAX_CAMPAIGNS_PER_COMPANY = campaignSchedulerConfig.MAX_CAMPAIGNS_PER_COMPANY;
  private processingCompanies: Set<number> = new Set();

  private constructor() {
    this.campaignService = new CampaignService();
    campaignLogger.info(undefined, undefined, 'init', `Campaign scheduler initialized with config: CHECK_INTERVAL=${this.CHECK_INTERVAL}ms, BATCH_SIZE=${this.BATCH_SIZE}, MAX_CAMPAIGNS_PER_COMPANY=${this.MAX_CAMPAIGNS_PER_COMPANY}`);
  }

  static getInstance(): CampaignScheduler {
    if (!CampaignScheduler.instance) {
      CampaignScheduler.instance = new CampaignScheduler();
    }
    return CampaignScheduler.instance;
  }

  /**
   * Start the campaign scheduler
   */
  start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    


    this.processScheduledCampaigns();


    this.intervalId = setInterval(() => {
      this.processScheduledCampaigns();
    }, this.CHECK_INTERVAL);

    
  }

  /**
   * Stop the campaign scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    
  }

  /**
   * Process scheduled campaigns that are ready to start
   */
  private async processScheduledCampaigns() {
    try {
      const now = new Date();
      campaignLogger.info(undefined, undefined, 'check', `Running scheduled campaign check at ${now.toISOString()}`);


      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

      if (memoryUsagePercent > campaignSchedulerConfig.MEMORY_WARNING_THRESHOLD) {
        campaignLogger.warn(undefined, undefined, 'memory', `Memory usage high: ${(memoryUsagePercent * 100).toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`);
      }


      const scheduledCampaigns = await db
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.status, 'scheduled'),
            eq(campaigns.campaignType, 'scheduled'),
            lte(campaigns.scheduledAt, now)
          )
        );

      if (scheduledCampaigns.length > 0) {
        campaignLogger.info(undefined, undefined, 'scheduled', `Found ${scheduledCampaigns.length} scheduled campaign(s) ready to start`);
        for (const campaign of scheduledCampaigns) {
          try {
            await this.campaignService.startCampaign(campaign.companyId, campaign.id);
          } catch (error) {
            campaignLogger.error(campaign.id, campaign.companyId, 'start', `Failed to start campaign`, error);
          }
        }
      }


      await this.processRecurringDailyCampaigns(now);
      
      campaignLogger.info(undefined, undefined, 'check', `Campaign check complete`);
    } catch (error) {
      campaignLogger.error(undefined, undefined, 'check', `Error processing scheduled campaigns`, error);
    }
  }

  /**
   * Process recurring daily campaigns with company-level batching and isolation
   */
  private async processRecurringDailyCampaigns(currentDateTime: Date) {
    try {
      campaignLogger.debug(undefined, undefined, 'check', `Checking for recurring daily campaigns at ${currentDateTime.toISOString()}`);
      

      const companyIdsResult = await db
        .select({ companyId: campaigns.companyId })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.status, 'scheduled'),
            eq(campaigns.campaignType, 'recurring_daily')
          )
        );


      const companyIdsSet = new Set<number>();
      for (const row of companyIdsResult) {
        if (row.companyId !== null) {
          companyIdsSet.add(row.companyId);
        }
      }
      const companyIds = Array.from(companyIdsSet);

      if (companyIds.length === 0) {
        return;
      }

      campaignLogger.debug(undefined, undefined, 'check', `Found ${companyIds.length} company(ies) with recurring campaigns`);


      for (let i = 0; i < companyIds.length; i += campaignSchedulerConfig.MAX_CONCURRENT_COMPANIES) {
        const companyBatch = companyIds.slice(i, i + campaignSchedulerConfig.MAX_CONCURRENT_COMPANIES);
        

        for (const companyId of companyBatch) {
          await this.processCompanyRecurringCampaigns(companyId, currentDateTime);
        }
      }
    } catch (error) {
      campaignLogger.error(undefined, undefined, 'process', `Error processing recurring daily campaigns`, error);
    }
  }

  /**
   * Process recurring campaigns for a specific company with pagination
   * Ensures all campaigns are eventually processed over multiple cycles
   */
  private async processCompanyRecurringCampaigns(companyId: number, currentDateTime: Date) {

    if (this.processingCompanies.has(companyId)) {
      campaignLogger.debug(undefined, companyId, 'skip', `Company already being processed, skipping`);
      return;
    }

    this.processingCompanies.add(companyId);

    try {
      let processedCount = 0;
      let lastProcessedCampaignId = 0;
      let hasMoreCampaigns = true;


      while (hasMoreCampaigns && processedCount < this.MAX_CAMPAIGNS_PER_COMPANY) {

        const whereConditions = [
          eq(campaigns.status, 'scheduled'),
          eq(campaigns.campaignType, 'recurring_daily'),
          eq(campaigns.companyId, companyId)
        ];


        if (lastProcessedCampaignId > 0) {
          whereConditions.push(sql`${campaigns.id} > ${lastProcessedCampaignId}`);
        }



        const recurringCampaigns = await db
          .select()
          .from(campaigns)
          .where(and(...whereConditions))
          .orderBy(asc(campaigns.scheduledAt), asc(campaigns.id))
          .limit(this.BATCH_SIZE);

        if (recurringCampaigns.length === 0) {
          hasMoreCampaigns = false;
          break;
        }

        campaignLogger.debug(undefined, companyId, 'process', `Processing batch of ${recurringCampaigns.length} recurring campaign(s) for company (total processed: ${processedCount})`);

        for (const campaign of recurringCampaigns) {

        if (processedCount >= this.MAX_CAMPAIGNS_PER_COMPANY) {
          campaignLogger.warn(undefined, companyId, 'limit', `Reached MAX_CAMPAIGNS_PER_COMPANY limit (${this.MAX_CAMPAIGNS_PER_COMPANY}), skipping remaining campaigns`);
          break;
        }
        try {
          campaignLogger.debug(campaign.id, companyId, 'evaluate', `Evaluating recurring campaign ${campaign.name || 'Unnamed'}`);
          

          if (campaign.scheduledAt) {
            const scheduledTime = new Date(campaign.scheduledAt);
            const timeDiff = currentDateTime.getTime() - scheduledTime.getTime();
            const fiveMinutes = 5 * 60 * 1000;
            

            if (timeDiff > fiveMinutes) {
              campaignLogger.debug(campaign.id, companyId, 'recalculate', `scheduledAt is ${Math.round(timeDiff / 60000)} minutes in the past, recalculating next send time`);
              const nextSendTime = this.campaignService.calculateNextRecurringSendTime(
                campaign.dripSettings,
                currentDateTime,
                campaign.timezone || 'UTC'
              );
              
              if (nextSendTime) {
                await db.update(campaigns)
                  .set({
                    scheduledAt: nextSendTime,
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaign.id));
                campaignLogger.debug(campaign.id, companyId, 'update', `Updated scheduledAt to ${nextSendTime.toISOString()}`);

                campaign.scheduledAt = nextSendTime;
              } else {
                campaignLogger.info(campaign.id, companyId, 'complete', `No valid next send time found, marking as completed`);
                await db.update(campaigns)
                  .set({
                    status: 'completed',
                    updatedAt: new Date()
                  })
                  .where(eq(campaigns.id, campaign.id));
                continue;
              }
            }
          }
          
          const shouldProcess = this.shouldProcessRecurringCampaign(campaign, currentDateTime);
          
          if (shouldProcess) {


            const updateResult = await db.update(campaigns)
              .set({
                status: 'running',
                startedAt: new Date()
              })
              .where(
                and(
                  eq(campaigns.id, campaign.id),
                  eq(campaigns.status, 'scheduled')
                )
              )
              .returning();
            
            if (updateResult.length === 0) {
              campaignLogger.debug(campaign.id, companyId, 'skip', `Status was already changed by another process, skipping`);
              continue;
            }
            
            campaignLogger.info(campaign.id, companyId, 'process', `Processing recurring daily campaign at scheduled time`);
            

            const channelIds = (campaign.channelIds as number[]) || [];
            const singleChannelId = campaign.channelId;
            const availableChannelIds = channelIds.length > 0 ? channelIds : (singleChannelId ? [singleChannelId] : []);

            if (availableChannelIds.length === 0) {
              campaignLogger.error(campaign.id, companyId, 'validate', `No channel connections configured for recurring campaign`);

              await db.update(campaigns)
                .set({ status: 'scheduled' })
                .where(eq(campaigns.id, campaign.id));
              continue;
            }


            const channels = await db.select()
              .from(channelConnections)
              .where(inArray(channelConnections.id, availableChannelIds));

            const disconnectedChannels = channels.filter(ch => ch.status !== 'active');
            if (disconnectedChannels.length > 0) {
              campaignLogger.error(campaign.id, companyId, 'validate', `Cannot process: ${disconnectedChannels.length} channel(s) are not active`);

              await db.update(campaigns)
                .set({ status: 'scheduled' })
                .where(eq(campaigns.id, campaign.id));
              continue;
            }




            await db.update(campaignRecipients)
              .set({
                status: 'pending'
              })
              .where(
                and(
                  eq(campaignRecipients.campaignId, campaign.id),
                  ne(campaignRecipients.status, 'pending')
                )
              );


            const queuedCount = await this.campaignService.queueCampaignRecipients(campaign.id);
            
            campaignLogger.info(campaign.id, companyId, 'queue', `Queued ${queuedCount} recipients for recurring campaign. Next occurrence will be scheduled after completion by queue service.`);
            processedCount++;
          } else {
            campaignLogger.debug(campaign.id, companyId, 'skip', `Should not be processed at this time`);
          }
        } catch (error) {
          campaignLogger.error(campaign.id, companyId, 'process', `Failed to process recurring campaign`, error);
        }


        lastProcessedCampaignId = campaign.id;
      }


      if (recurringCampaigns.length < this.BATCH_SIZE) {
        hasMoreCampaigns = false;
      }
      } // End pagination while loop
    } finally {

      this.processingCompanies.delete(companyId);
    }
  }

  /**
   * Check if a recurring campaign should be processed now
   */
  private shouldProcessRecurringCampaign(campaign: any, currentDateTime: Date): boolean {
    campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `Checking if campaign should be processed, currentDateTime: ${currentDateTime.toISOString()}`);
    
    if (!campaign.dripSettings) {
      campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `No dripSettings found, returning false`);
      return false;
    }



    const matchesSendTime = this.verifyRecurringCampaignConditions(campaign, currentDateTime);
    
    if (matchesSendTime) {
      campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `Current time matches a send time, processing`);
      return true;
    }



    if (campaign.scheduledAt) {
      const scheduledTime = new Date(campaign.scheduledAt);
      const timeDiff = Math.abs(currentDateTime.getTime() - scheduledTime.getTime());
      const twoMinutes = 2 * 60 * 1000; // 2 minute window
      

      if (timeDiff <= twoMinutes) {
        campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `scheduledAt is within window, verifying conditions`);
        const shouldProcess = this.verifyRecurringCampaignConditions(campaign, currentDateTime);
        if (shouldProcess) {
          campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `scheduledAt matches current time, all conditions met`);
        } else {
          campaignLogger.debug(campaign.id, campaign.companyId, 'shouldProcess', `scheduledAt matches but conditions not met`);
        }
        return shouldProcess;
      }
    }


    return false;
  }

  /**
   * Verify that recurring campaign conditions are met (send times, off days, date range)
   */
  private verifyRecurringCampaignConditions(campaign: any, currentDateTime: Date): boolean {
    const settings = campaign.dripSettings;
    const timezone = settings.timezone || campaign.timezone || 'UTC';

    try {

      const currentTimeInTz = new Date(currentDateTime.toLocaleString('en-US', { timeZone: timezone }));
      const currentDay = currentTimeInTz.getDay(); // 0 = Sunday, 6 = Saturday
      const currentHour = currentTimeInTz.getHours();
      const currentMinute = currentTimeInTz.getMinutes();
      const currentTimeStr = format(currentTimeInTz, 'HH:mm');

      campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current time in ${timezone}: ${currentTimeStr} (Day: ${currentDay}, Hour: ${currentHour}, Minute: ${currentMinute})`);


      if (settings.offDays && Array.isArray(settings.offDays)) {
        if (settings.offDays.includes(currentDay)) {
          campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current day (${currentDay}) is in offDays, skipping`);
          return false;
        }
      }


      if (settings.startDate) {
        const startDate = parseISO(settings.startDate);
        if (isBefore(currentDateTime, startDate)) {
          campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current date is before startDate`);
          return false;
        }
      }

      if (settings.endDate) {
        const endDate = parseISO(settings.endDate);
        if (isAfter(currentDateTime, endDate)) {
          campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current date is after endDate`);
          return false;
        }
      }



      if (settings.sendTimes && Array.isArray(settings.sendTimes)) {
        for (const sendTime of settings.sendTimes) {
          const [sendHour, sendMinute] = sendTime.split(':').map(Number);



          if (currentHour === sendHour && currentMinute === sendMinute) {
            campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current time exactly matches sendTime ${sendTime}`);
            return true;
          }
        }
        campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `Current time ${currentTimeStr} does not match any sendTimes`);
      } else {
        campaignLogger.debug(campaign.id, campaign.companyId, 'verify', `No sendTimes configured`);
      }

      return false;
    } catch (error) {
      campaignLogger.error(campaign.id, campaign.companyId, 'verify', `Error verifying recurring campaign conditions`, error);
      return false;
    }
  }

  /**
   * Schedule the next occurrence of a recurring daily campaign
   */
  private async scheduleNextRecurringOccurrence(campaign: any) {
    try {

      const now = new Date();
      const nextSendTime = this.getNextRecurringSendTime(campaign.dripSettings, now, campaign.timezone);
      
      if (nextSendTime) {
        await db
          .update(campaigns)
          .set({
            status: 'scheduled',
            scheduledAt: nextSendTime,
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));

        campaignLogger.info(campaign.id, campaign.companyId, 'schedule', `Scheduled next occurrence at ${nextSendTime.toISOString()}`);
      } else {

        await db
          .update(campaigns)
          .set({
            status: 'completed',
            updatedAt: new Date()
          })
          .where(eq(campaigns.id, campaign.id));

        campaignLogger.info(campaign.id, campaign.companyId, 'complete', `No valid next occurrence found, marking as completed`);
      }
    } catch (error) {
      campaignLogger.error(campaign.id, campaign.companyId, 'schedule', `Error scheduling next occurrence`, error);
    }
  }

  /**
   * Get the next valid send time for a recurring daily campaign
   * Delegates to CampaignService to ensure consistent timezone handling
   */
  private getNextRecurringSendTime(recurringSettings: any, currentDateTime: Date, timezone: string = 'UTC'): Date | null {
    return this.campaignService.calculateNextRecurringSendTime(recurringSettings, currentDateTime, timezone);
  }
}

export default CampaignScheduler.getInstance();

