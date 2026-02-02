import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { migrationSystem } from "./migration-system";
import path from "path";
import { logger } from "./utils/logger";
import { runtimeProtection } from "./utils/runtime-protection";
import { setupSecurityMiddleware, setupSecurityReporting } from "./middleware/security";
import { serveStatic } from "./static-server";
import { ensureUploadDirectories } from "./utils/file-system";
import dotenv from "dotenv";
import { registerWebhookRoutes } from "./webhook-routes";
import "./services/message-scheduler"; // Import message scheduler (but don't auto-start)
import { licenseValidator } from "./services/license-validator";
import { ensureLicenseValid } from "./middleware/license-guard";


dotenv.config();


if (process.env.NODE_ENV === 'production') {
  if (!runtimeProtection.isSecureEnvironment()) {
    console.error('🚨 Insecure environment detected');
    process.exit(1);
  }
}

const app = express();





app.set('trust proxy', true);

if (process.env.NODE_ENV === 'production') {
  setupSecurityMiddleware(app);
}

registerWebhookRoutes(app);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      logger.info(
        "api",
        `${req.method} ${path} ${res.statusCode} in ${duration}ms`,
        capturedJsonResponse,
      );
    }
  });

  next();
});

(async () => {

  await ensureUploadDirectories();

  const server = await registerRoutes(app);


  setupSecurityReporting(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";


    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    

    console.error('Error handler:', err);
  });


  if (process.env.NODE_ENV === 'production') {

    app.use(ensureLicenseValid);
    serveStatic(app);
  }


  const basePort = parseInt(process.env.PORT || "9000", 10);
  const port = process.env.NODE_ENV === 'development' ? basePort + 100 : basePort;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    logger.info('server', `Server running on port ${port}`);

    setTimeout(async () => {
      try {



        logger.info('migration', 'Running database migrations...');
        try {
          await migrationSystem.runPendingMigrations();
          logger.info('migration', 'Database migrations completed successfully');
        } catch (error) {
        
        }

        logger.info('twilio-voice', 'Checking Twilio Voice SDK credentials configuration...');
        try {
          const { storage } = await import('./storage');
          const { db } = await import('./db');
          const { sql } = await import('drizzle-orm');
          

          const missingCredentials = await db.execute(sql`
            SELECT id, company_id, account_name, status
            FROM channel_connections
            WHERE channel_type = 'twilio_voice'
              AND status = 'active'
              AND (
                connection_data->>'apiKey' IS NULL 
                OR connection_data->>'apiKey' = ''
                OR connection_data->>'apiSecret' IS NULL 
                OR connection_data->>'apiSecret' = ''
                OR connection_data->>'twimlAppSid' IS NULL 
                OR connection_data->>'twimlAppSid' = ''
              )
            LIMIT 20
          `);
          
          if (missingCredentials.rows && missingCredentials.rows.length > 0) {
            const count = missingCredentials.rows.length;
            logger.warn('twilio-voice', `⚠️  Found ${count} Twilio Voice connection(s) missing Voice SDK credentials`);
            logger.warn('twilio-voice', 'These connections will need to be reconfigured with API Key, API Secret, and TwiML App SID');
            logger.warn('twilio-voice', 'Direct calls will fail until Voice SDK credentials are added');
            logger.warn('twilio-voice', 'See docs/TWILIO_VOICE_SDK_SETUP.md for configuration instructions');
            

            const connectionsToLog = Math.min(5, count);
            for (let i = 0; i < connectionsToLog; i++) {
              const conn = missingCredentials.rows[i];
              logger.warn('twilio-voice', `  - Connection ID: ${conn.id}, Company ID: ${conn.company_id}, Name: ${conn.account_name || 'N/A'}`);
            }
            
            if (count > connectionsToLog) {
              logger.warn('twilio-voice', `  ... and ${count - connectionsToLog} more connection(s)`);
            }
          } else {
            logger.info('twilio-voice', '✅ All active Twilio Voice connections have Voice SDK credentials configured');
          }
        } catch (error) {
          logger.error('twilio-voice', '❌ Failed to check Twilio Voice SDK credentials:', error);
        }


        logger.info('whatsapp', 'Starting WhatsApp auto-reconnection...');
        try {
          const { autoReconnectWhatsAppSessions, checkAndRecoverConnections } = await import('./services/channels/whatsapp');
          await autoReconnectWhatsAppSessions();

          setInterval(async () => {
            try {
              await checkAndRecoverConnections();
            } catch (error) {
              logger.error('whatsapp', 'Error during periodic connection check', error);
            }
          }, 5 * 60 * 1000);
          logger.info('whatsapp', '✅ WhatsApp auto-reconnection completed successfully');
        } catch (error) {
          logger.error('whatsapp', '❌ WhatsApp auto-reconnection failed:', error);
        }

        logger.info('email', 'Auto-reconnecting email connections...');
        try {
          const { autoReconnectEmailConnections } = await import('./services/channels/email');
          await autoReconnectEmailConnections();
          logger.info('email', '✅ Email auto-reconnection completed successfully');
        } catch (error) {
          logger.error('email', '❌ Email auto-reconnection failed:', error);
        }

        logger.info('email', 'Starting database-driven email polling...');
        try {
          const { startAllEmailPolling } = await import('./services/channels/email');
          await startAllEmailPolling();
          logger.info('email', '✅ Email polling startup completed successfully');
        } catch (error) {
          logger.error('email', '❌ Email polling startup failed:', error);
        }

        logger.info('messenger', 'Initializing Messenger health monitoring...');
        try {
          const { initializeHealthMonitoring } = await import('./services/channels/messenger');
          await initializeHealthMonitoring();
          logger.info('messenger', '✅ Messenger health monitoring initialized successfully');
        } catch (error) {
          logger.error('messenger', '❌ Messenger health monitoring initialization failed:', error);
        }

        logger.info('tiktok', 'Initializing TikTok connections...');
        try {
          const TikTokService = await import('./services/channels/tiktok');
          await TikTokService.default.initializeAllConnections();
          logger.info('tiktok', '✅ TikTok connections initialized successfully');
        } catch (error) {
          logger.error('tiktok', '❌ TikTok initialization failed:', error);
        }

        logger.info('webchat', 'Initializing WebChat connections...');
        try {
          const { default: webchatService } = await import('./services/channels/webchat');
          await webchatService.initializeAllConnections();
          logger.info('webchat', '✅ WebChat connections initialized successfully');
        } catch (error) {
          logger.error('webchat', '❌ WebChat initialization failed:', error);
        }

        logger.info('instagram', 'Initializing Instagram health monitoring...');
          try {
            const { initializeHealthMonitoring } = await import('./services/channels/instagram');
            await initializeHealthMonitoring();
            logger.info('instagram', '✅ Instagram health monitoring initialized successfully');
          } catch (error) {
            logger.error('instagram', '❌ Instagram health monitoring initialization failed:', error);
          }

        logger.info('messenger', 'Ensuring Messenger channels are active...');
        try {
          const { storage } = await import('./storage');
          const updatedCount = await storage.ensureMessengerChannelsActive();
          logger.info('messenger', `✅ Ensured ${updatedCount} Messenger channels are active`);
        } catch (error) {
          logger.error('messenger', '❌ Failed to ensure Messenger channels are active:', error);
        }

        logger.info('instagram', 'Ensuring Instagram channels are active...');
        try {
          const { storage } = await import('./storage');
          const updatedCount = await storage.ensureInstagramChannelsActive();
          logger.info('instagram', `✅ Ensured ${updatedCount} Instagram channels are active`);
        } catch (error) {
          logger.error('instagram', '❌ Failed to ensure Instagram channels are active:', error);
        }


        const retryEmailPolling = async (attempt: number = 1, maxAttempts: number = 3) => {
          try {
            logger.info('email', `🔄 Email polling retry attempt ${attempt}/${maxAttempts}...`);
            const { startAllEmailPolling } = await import('./services/channels/email');
            await startAllEmailPolling();
            logger.info('email', `✅ Email polling retry ${attempt} completed successfully`);
          } catch (error) {
            logger.error('email', `❌ Email polling retry ${attempt} failed:`, error);
            if (attempt < maxAttempts) {
              setTimeout(() => retryEmailPolling(attempt + 1, maxAttempts), 15000 * attempt); // Exponential backoff
            }
          }
        };


        setTimeout(() => retryEmailPolling(1, 3), 10000);


        setTimeout(() => retryEmailPolling(2, 3), 30000);


        setTimeout(() => retryEmailPolling(3, 3), 60000);


        setInterval(async () => {
          try {
            const emailService = await import('./services/channels/email');
            const connectionsStatus = await emailService.getEmailConnectionsStatus();
            const activePolling = connectionsStatus.filter(c => c.pollingActive).length;
            logger.debug('email', `Email health check: ${connectionsStatus.length} total connections, ${activePolling} actively polling`);
          } catch (error) {
            logger.error('email', 'Error during periodic email health check', error);
          }
        }, 10 * 60 * 1000); // Check every 10 minutes


        logger.info('backup', 'Initializing inbox backup scheduler...');
        try {
          const { inboxBackupSchedulerService } = await import('./services/inbox-backup-scheduler');
          await inboxBackupSchedulerService.initializeScheduler();
          logger.info('backup', '✅ Inbox backup scheduler initialized successfully');
        } catch (error) {
          logger.error('backup', '❌ Inbox backup scheduler initialization failed:', error);
        }

        logger.info('backup', 'Checking PostgreSQL tools availability...');
        try {
          const { BackupService } = await import('./services/backup-service');
          const { storage } = await import('./storage');
          const backupService = new BackupService();
          const tools = await backupService.checkPostgresTools();


          await storage.saveAppSetting('postgres_tools_status', tools);


          if (tools.pg_dump.available) {
            logger.info('backup', `✅ pg_dump available: ${tools.pg_dump.version}`);
          } else {
            logger.warn('backup', `⚠️ pg_dump not available: ${tools.pg_dump.error}`);
          }

          if (tools.psql.available) {
            logger.info('backup', `✅ psql available: ${tools.psql.version}`);
          } else {
            logger.warn('backup', `⚠️ psql not available: ${tools.psql.error}`);
          }

          if (tools.pg_restore.available) {
            logger.info('backup', `✅ pg_restore available: ${tools.pg_restore.version}`);
          } else {
            logger.warn('backup', `⚠️ pg_restore not available: ${tools.pg_restore.error}`);
          }
        } catch (error) {
          logger.error('backup', '❌ Failed to check PostgreSQL tools:', error);
        }

        logger.info('backup', 'Starting database backup scheduler...');
        try {
          const { backupScheduler } = await import('./services/backup-scheduler');
          await backupScheduler.start();
          logger.info('backup', '✅ Database backup scheduler started successfully');
        } catch (error) {
          logger.error('backup', '❌ Database backup scheduler failed to start:', error);
        }

        logger.info('conference-cleanup', 'Starting Conference Cleanup Scheduler...');
        try {
          const { conferenceCleanupScheduler } = await import('./services/conference-cleanup-scheduler');
          await conferenceCleanupScheduler.start();
          logger.info('conference-cleanup', '✅ Conference Cleanup Scheduler started successfully');
          conferenceCleanupScheduler.on('cleanup-completed', (data: any) => {
            logger.info('conference-cleanup', 'Cleanup completed', data);
          });
          conferenceCleanupScheduler.on('cleanup-failed', (data: any) => {
            logger.error('conference-cleanup', 'Cleanup failed', data);
          });
          conferenceCleanupScheduler.on('conference-terminated', (data: any) => {
            logger.info('conference-cleanup', 'Conference terminated', data);
          });
        } catch (error) {
          logger.error('conference-cleanup', '❌ Conference Cleanup Scheduler failed to start:', error);
        }

        logger.info('campaigns', 'Starting campaign queue processor...');
        try {
          const { CampaignQueueService } = await import('./services/campaignQueueService');
          const campaignQueueService = new CampaignQueueService();
          campaignQueueService.startQueueProcessor();
          logger.info('campaigns', '✅ Campaign queue processor started successfully');
        } catch (error) {
          logger.error('campaigns', '❌ Campaign queue processor failed to start:', error);
        }

        logger.info('campaign-scheduler', 'Starting Campaign Scheduler...');
        try {
          const { CampaignScheduler } = await import('./services/campaign-scheduler');
          const campaignScheduler = CampaignScheduler.getInstance();
          campaignScheduler.start();
          logger.info('campaign-scheduler', '✅ Campaign Scheduler started successfully');
        } catch (error) {
          logger.error('campaign-scheduler', '❌ Campaign Scheduler failed to start:', error);
        }

        logger.info('message-scheduler', 'Starting Message Scheduler...');
        try {
          const messageScheduler = (await import('./services/message-scheduler')).default;
          messageScheduler.start();
          logger.info('message-scheduler', '✅ Message Scheduler started successfully');
        } catch (error) {
          logger.error('message-scheduler', '❌ Message Scheduler failed to start:', error);
        }

        logger.info('flow-analytics', 'Initializing Flow Analytics Service...');
        try {
          const { FlowAnalyticsService } = await import('./services/flow-analytics-service');
          const { storage } = await import('./storage');
          FlowAnalyticsService.getInstance(storage);
          logger.info('flow-analytics', '✅ Flow Analytics Service initialized successfully');
        } catch (error) {
          logger.error('flow-analytics', '❌ Flow Analytics Service initialization failed:', error);
        }

        logger.info('follow-ups', 'Starting Follow-up Scheduler...');
        try {
          const FollowUpScheduler = (await import('./services/follow-up-scheduler')).default;
          const followUpScheduler = FollowUpScheduler.getInstance();
          followUpScheduler.start();
          logger.info('follow-ups', '✅ Follow-up Scheduler started successfully');
        } catch (error) {
          logger.error('follow-ups', '❌ Follow-up Scheduler failed to start:', error);
        }

        logger.info('pipeline-reverts', 'Starting Pipeline Stage Revert Scheduler...');
        try {
          const PipelineStageRevertScheduler = (await import('./services/pipeline-stage-revert-scheduler')).default;
          const pipelineStageRevertScheduler = PipelineStageRevertScheduler.getInstance();
          pipelineStageRevertScheduler.start();
          
          pipelineStageRevertScheduler.on('started', () => {
            logger.info('pipeline-reverts', 'Pipeline Stage Revert Scheduler started');
          });
          
          pipelineStageRevertScheduler.on('revertExecuted', ({ scheduleId, dealId }) => {
            logger.info('pipeline-reverts', `Pipeline stage revert executed: ${scheduleId} for deal ${dealId}`);
          });
          
          pipelineStageRevertScheduler.on('revertFailed', ({ scheduleId, error }) => {
            logger.error('pipeline-reverts', `Pipeline stage revert failed: ${scheduleId} - ${error}`);
          });
          
          pipelineStageRevertScheduler.on('revertSkipped', ({ scheduleId, reason }) => {
            logger.info('pipeline-reverts', `Pipeline stage revert skipped: ${scheduleId} - ${reason}`);
          });
          
          logger.info('pipeline-reverts', '✅ Pipeline Stage Revert Scheduler started successfully');
        } catch (error) {
          logger.error('pipeline-reverts', '❌ Pipeline Stage Revert Scheduler failed to start:', error);
        }

        logger.info('follow-up-cleanup', 'Starting Follow-up Cleanup Service...');
        try {
          const FollowUpCleanupService = (await import('./services/follow-up-cleanup')).default;
          const followUpCleanupService = FollowUpCleanupService.getInstance();
          followUpCleanupService.start();
          logger.info('follow-up-cleanup', '✅ Follow-up Cleanup Service started successfully');
        } catch (error) {
          logger.error('follow-up-cleanup', '❌ Follow-up Cleanup Service failed to start:', error);
        }

        logger.info('trials', 'Trial management available via API endpoints');

        logger.info('license', 'Checking license status...');
        try {

          const licenseInfo = licenseValidator.getLicenseInfo();
          if (licenseInfo === null) {

            logger.info('license', 'ℹ️  Regular build detected - License enforcement is disabled');
            logger.info('license', 'ℹ️  To enable license enforcement, rebuild with: npm run build:licensed');
          } else {


            await licenseValidator.initializeIpDetection();
            
            const licenseValidation = await licenseValidator.validateLicense();
            if (licenseValidation.valid) {
              logger.info('license', `✅ License valid - Expires: ${licenseInfo.expiryDate?.toISOString().split('T')[0]}, Days remaining: ${licenseInfo.daysRemaining}, Allowed IPs: ${licenseInfo.allowedIps?.length || 0}`);
            } else {
              logger.warn('license', `⚠️ License validation failed: ${licenseValidation.reason}`);
              if (licenseValidation.reason === 'License expired') {
                const daysExpired = licenseValidation.expiryDate 
                  ? Math.ceil((Date.now() - licenseValidation.expiryDate.getTime()) / (1000 * 60 * 60 * 24))
                  : 0;
                if (daysExpired > 30) {
                  logger.error('license', '🚨 License expired more than 30 days ago. Server may be limited.');
                }
              } else if (licenseValidation.reason === 'Server IP address is not authorized') {
                logger.warn('license', '💡 Tip: The system will automatically detect your public IP address');
              }
            }
          }
        } catch (error) {
          logger.error('license', '❌ License validation error:', error);
        }

        logger.info('subscription', 'Starting Enhanced Subscription Scheduler...');
        try {
          const { subscriptionScheduler } = await import('./services/subscription-scheduler');
          subscriptionScheduler.start();
          logger.info('subscription', '✅ Subscription Scheduler started successfully');
        } catch (error) {
          logger.error('subscription', '❌ Subscription Scheduler failed to start:', error);
        }

        logger.info('template-status-sync', 'Starting WhatsApp Template Status Sync...');
        try {
          const { startTemplateStatusSync } = await import('./services/template-status-sync');
          startTemplateStatusSync();
          logger.info('template-status-sync', '✅ WhatsApp Template Status Sync started successfully');
        } catch (error) {
          logger.error('template-status-sync', '❌ WhatsApp Template Status Sync failed to start:', error);
        }

        logger.info('tiktok-retention', 'Starting TikTok Data Retention Policy Worker...');
        try {
          const TikTokService = (await import('./services/channels/tiktok')).default;
          const runTikTokRetentionWorker = async () => {
            try {
              logger.info('tiktok-retention', 'TikTok Data Retention Policy Worker running');
              const result = await TikTokService.applyDataRetentionPolicy();
              logger.info('tiktok-retention', 'TikTok Data Retention Policy Worker completed', {
                companiesProcessed: result.companiesProcessed,
                contactsProcessed: result.contactsProcessed,
                errors: result.errors.length
              });
            } catch (error) {
              logger.error('tiktok-retention', 'TikTok Data Retention Policy Worker error', error);
            }
          };
          const ONE_DAY_MS = 24 * 60 * 60 * 1000;
          const scheduleNext2AM = () => {
            const now = new Date();
            const next = new Date(now);
            next.setHours(2, 0, 0, 0);
            if (next <= now) next.setDate(next.getDate() + 1);
            const ms = next.getTime() - now.getTime();
            setTimeout(() => {
              runTikTokRetentionWorker();
              setInterval(runTikTokRetentionWorker, ONE_DAY_MS);
            }, ms);
          };
          scheduleNext2AM();
          logger.info('tiktok-retention', '✅ TikTok Data Retention Policy Worker scheduled (daily at 2 AM)');
        } catch (error) {
          logger.error('tiktok-retention', '❌ TikTok Data Retention Policy Worker failed to start:', error);
        }

      } catch (error) {
        logger.error('startup', 'Error during service initialization', error);
      }
    }, 1000);
  });

  process.on('SIGTERM', async () => {
    logger.info('server', 'SIGTERM received, shutting down TikTok health monitoring...');
    try {
      const TikTokService = (await import('./services/channels/tiktok')).default;
      TikTokService.stopAllHealthMonitoring();
      logger.info('tiktok', 'TikTok health monitoring stopped');
    } catch (error) {
      logger.error('tiktok', 'Error stopping TikTok health monitoring:', error);
    }
    await new Promise((r) => setTimeout(r, 5000));
    logger.info('server', 'Shutdown grace period complete');
  });
})();
