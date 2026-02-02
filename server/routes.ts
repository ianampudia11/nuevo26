import {
  contacts,
  conversations,
  insertChannelConnectionSchema,
  InsertContact,
  insertContactSchema,
  InsertContactTask,
  InsertConversation,
  insertConversationSchema,
  insertFlowAssignmentSchema,
  insertFlowSchema,
  insertMessageSchema,
  insertNoteSchema,
  invitationStatusTypes,
  messages,
  scheduledMessages,
  PERMISSIONS,
  User,
  campaignTemplates,
  Pipeline,
  InsertPipeline,
  PipelineStage,
  InsertPipelineStage
} from "@shared/schema";
import crypto, { randomBytes, scrypt, timingSafeEqual } from "crypto";
import dns from "dns";
import { eq, and } from "drizzle-orm";
import { EventEmitter } from "events";
import type { Express, Request, Response } from "express";
import type { NextFunction } from "express";
import type { CallAgentConfig } from "./services/call-agent-service";
import {
  validateTwilioCredentialsWithAPI,
  configureElevenLabsAgent,
  sanitizeCredential,
  getTwilioAuthHeader
} from "./services/call-agent-service";
import express from "express";
import axios from "axios";
import { getLinkPreview } from 'link-preview-js';
import fs from "fs";
import fsExtra from "fs-extra";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type Stripe from "stripe";
import { registerAdminRoutes } from "./admin-routes";
import { setupAuth } from "./auth";
import { setupSocialAuth } from "./social-auth";
import { db } from "./db";
import { setupLanguageRoutes } from "./language-routes";
import { ensureAuthenticated, getUserPermissions, requireAnyPermission, requirePermission, ensureActiveSubscription, apiSubscriptionGuard } from "./middleware";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

import { affiliateTrackingMiddleware } from "./middleware/affiliate-tracking";
import { requireSubdomainAuth, subdomainMiddleware } from "./middleware/subdomain";
import { isWhatsAppGroupChatId } from "./utils/whatsapp-group-filter";
import { validatePhoneNumber as validatePhoneNumberUtil } from "./utils/phone-validation";
import { getCachedInitialPipelineStage, getCachedCompanySetting, getCachedPipelinesByCompany } from "./utils/pipeline-cache";
import { insertCompanyPageSchema } from "@shared/schema";
import { registerPaymentRoutes } from "./payment-routes";
import { registerPlanRoutes } from "./plan-routes";
import { setupPlanAiProviderRoutes } from "./routes/admin/plan-ai-provider-routes";
import { setupTrialRoutes } from "./trial-routes";
import campaignRoutes from "./routes/campaigns";
import templateMediaRoutes from "./routes/template-media";
import autoUpdateRoutes from "./routes/auto-update";
import followUpRoutes from "./routes/follow-ups";
import subscriptionDataFixRoutes from "./routes/subscription-data-fix";
import emailTemplateRoutes from "./routes/email-templates";
import flowVariablesRoutes from "./routes/flow-variables";
import { setupAffiliateEarningsRoutes } from "./routes/affiliate-earnings-routes";
import { setupCouponRoutes } from "./routes/admin/coupon-routes";
import emailSignatureRoutes from "./routes/email-signatures";
import knowledgeBaseRoutes from "./routes/knowledge-base";
import enhancedSubscriptionRoutes from "./routes/enhanced-subscription";
import paymentCallbackRoutes from "./routes/payment-callbacks";
import planRenewalRoutes from "./routes/plan-renewal";
import companyAiCredentialsRoutes from "./routes/company-ai-credentials";
import companyDataUsageRoutes from "./routes/company-data-usage";
import quickReplyRoutes from "./routes/quick-replies";
import openRouterRoutes from "./routes/openrouter";
import whatsappTemplatesRoutes from "./routes/whatsapp-templates";
import callAgentRoutes from "./routes/call-agent-routes";
import instagramService from "./services/channels/instagram";
import telegramService from "./services/channels/telegram";
import messengerService from "./services/channels/messenger";
import TikTokService from "./services/channels/tiktok";
import emailService from "./services/channels/email";
import webchatService from "./services/channels/webchat";
import whatsAppService, { downloadAndSaveMedia, getConnection as getWhatsAppConnection } from "./services/channels/whatsapp";
import whatsAppOfficialService, { downloadAndSaveMedia as downloadWhatsAppOfficialMedia } from "./services/channels/whatsapp-official";
import whatsAppMetaPartnerService from "./services/channels/whatsapp-meta-partner";
import { configureWebhookForWABA, subscribeToWebhookFields, retryWebhookConfiguration } from "./services/meta-webhook-configurator";
import * as metaGraphAPI from "./services/meta-graph-api";
import { generateApiKey, hashApiKey } from "./middleware/api-auth";
import apiV1Routes from "./routes/api-v1";
import channelManager from "./services/channel-manager";
import {
  sendTeamInvitation,
  testSmtpConfig,
  type SmtpConfig
} from "./services/email";
import flowExecutor from "./services/flow-executor";
import googleCalendarService from "./services/google-calendar";
import zohoCalendarService from "./services/zoho-calendar";
import { calendlyCalendarService } from "./services/calendly-calendar";
import googleSheetsService from "./services/google-sheets";
import { GOOGLE_MAPS_SCRAPE_MAX_RESULTS } from "./services/google-maps-scraper";
import { storage, logContactAudit } from "./storage";
import { logger } from "./utils/logger";
import { eventEmitterMonitor } from "./utils/event-emitter-monitor";
import { inboxBackupService } from "./services/inbox-backup";
import { inboxBackupSchedulerService } from "./services/inbox-backup-scheduler";
import { dataUsageTracker } from "./services/data-usage-tracker";

import { smartWebSocketBroadcaster } from "./utils/smart-websocket-broadcaster";


const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

const validateBody = (schema: any, body: any) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new Error(`Validation error: ${result.error.message}`);
  }
  return result.data;
};

const linkPreviewSchema = z.object({
  url: z.string().url({ message: "Invalid URL format" }).min(1, "URL is required")
});


function isPrivateOrReservedIP(ip: string): boolean {

  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;

    const [a, b, c, d] = parts.map(Number);


    if (a === 127) return true;


    if (a === 10) return true;


    if (a === 172 && b >= 16 && b <= 31) return true;


    if (a === 192 && b === 168) return true;


    if (a === 169 && b === 254) return true;


    if (a === 0 && b === 0 && c === 0 && d === 0) return true;


    if (a >= 224 && a <= 239) return true;


    if (a >= 240) return true;

    return false;
  }


  if (ip.includes(':')) {
    const lower = ip.toLowerCase();


    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;


    if (lower.startsWith('fe80:') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;


    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;


    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;


    if (lower.startsWith('::ffff:')) {
      const ipv4Part = lower.substring(7);
      return isPrivateOrReservedIP(ipv4Part);
    }

    return false;
  }

  return false;
}


const linkPreviewRateLimitStore = new Map<string, { count: number; resetTime: number }>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function getWidgetsBasePath(): string {
  if (process.env.NODE_ENV === 'production') {
    return path.resolve(__dirname, 'widgets');
  }
  return path.resolve(process.cwd(), 'server', 'widgets');
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);
  setupSocialAuth(app);


  if (!(global as any).flowAssignmentEventEmitter) {
    (global as any).flowAssignmentEventEmitter = new EventEmitter();
  }

  app.get('/public/branding', async (req, res) => {

    try {
      const settings = await storage.getAllAppSettings();


      const brandingSettings = settings.filter(s =>
        s.key === 'branding' ||
        s.key === 'branding_logo' ||
        s.key === 'branding_favicon' ||
        s.key === 'branding_admin_auth_background' ||
        s.key === 'branding_user_auth_background' ||
        s.key === 'auth_background_config'
      );


      res.set('Cache-Control', 'public, max-age=60');
      res.json(brandingSettings);

    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch branding settings' });
    }
  });


  app.get('/public/custom-scripts', async (req, res) => {
    try {
      const customScriptsSetting = await storage.getAppSetting('custom_scripts');

      if (!customScriptsSetting) {
        const defaultConfig = {
          enabled: false,
          scripts: '',
          lastModified: new Date().toISOString()
        };
        res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
        return res.json(defaultConfig);
      }


      const settingValue = customScriptsSetting.value as any;
      const publicConfig = {
        enabled: settingValue?.enabled || false,
        scripts: settingValue?.enabled ? (settingValue?.scripts || '') : '',
        lastModified: settingValue?.lastModified || new Date().toISOString()
      };

      res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
      res.json(publicConfig);
    } catch (error) {
      console.error("Error fetching public custom scripts:", error);
      res.status(500).json({ error: "Failed to fetch custom scripts" });
    }
  });

  app.get('/public/custom-css', async (req, res) => {
    try {
      const customCssSetting = await storage.getAppSetting('custom_css');

      if (!customCssSetting) {
        const defaultConfig = {
          enabled: false,
          css: '',
          lastModified: new Date().toISOString()
        };
        res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
        return res.json(defaultConfig);
      }

      const settingValue = customCssSetting.value as any;
      const publicConfig = {
        enabled: settingValue?.enabled || false,
        css: settingValue?.enabled ? (settingValue?.css || '') : '',
        lastModified: settingValue?.lastModified || new Date().toISOString()
      };

      res.set('Cache-Control', 'public, max-age=60'); // Cache for 1 minute
      res.json(publicConfig);
    } catch (error) {
      console.error("Error fetching public custom CSS:", error);
      res.status(500).json({ error: "Failed to fetch custom CSS" });
    }
  });

  app.get('/api/public/website/:slug', async (req, res) => {
    const { slug } = req.params;

    try {
      const website = await storage.getWebsiteBySlug(slug);

      if (!website || website.status !== 'published') {
        return res.status(404).json({ error: 'Website not found' });
      }

      res.json(website);
    } catch (error) {
      console.error('Error fetching website:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/website', async (req, res) => {
    try {
      const publishedWebsite = await storage.getPublishedWebsite();

      if (!publishedWebsite) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Website Not Found</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
            </head>
            <body>
              <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
                <h1>Website Not Found</h1>
                <p>No published website is currently available.</p>
              </div>
            </body>
          </html>
        `);
      }

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${publishedWebsite.metaTitle || publishedWebsite.title}</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="description" content="${publishedWebsite.metaDescription || publishedWebsite.description || ''}">
            <meta name="keywords" content="${publishedWebsite.metaKeywords || ''}">
            ${publishedWebsite.favicon ? `<link rel="icon" href="${publishedWebsite.favicon}">` : ''}
            ${publishedWebsite.googleAnalyticsId ? `
              <!-- Google Analytics -->
              <script async src="https://www.googletagmanager.com/gtag/js?id=${publishedWebsite.googleAnalyticsId}"></script>
              <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${publishedWebsite.googleAnalyticsId}');
              </script>
            ` : ''}
            ${publishedWebsite.facebookPixelId ? `
              <!-- Facebook Pixel -->
              <script>
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');
                fbq('init', '${publishedWebsite.facebookPixelId}');
                fbq('track', 'PageView');
              </script>
              <noscript><img height="1" width="1" style="display:none"
                src="https://www.facebook.com/tr?id=${publishedWebsite.facebookPixelId}&ev=PageView&noscript=1"
              /></noscript>
            ` : ''}
            <style>
              ${publishedWebsite.grapesCss || ''}
              ${publishedWebsite.customCss || ''}
            </style>
            ${publishedWebsite.customHead || ''}
          </head>
          <body>
            ${publishedWebsite.grapesHtml || ''}
            <script>
              ${publishedWebsite.grapesJs || ''}
              ${publishedWebsite.customJs || ''}
            </script>
          </body>
        </html>
      `;

      res.set('Cache-Control', 'public, max-age=300');
      res.send(html);
    } catch (error) {
      console.error('Error serving published website:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Error</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
              <h1>Error</h1>
              <p>An error occurred while loading the website.</p>
            </div>
          </body>
        </html>
      `);
    }
  });






  app.use(subdomainMiddleware);


  app.use(affiliateTrackingMiddleware);



  registerAdminRoutes(app);

  app.use('/api/v1', apiV1Routes);

  registerPlanRoutes(app);

  setupPlanAiProviderRoutes(app);

  setupTrialRoutes(app);

  setupAffiliateEarningsRoutes(app);

  setupCouponRoutes(app);

  registerPaymentRoutes(app);

  setupLanguageRoutes(app);

  app.use('/api/campaigns', requireSubdomainAuth, ensureAuthenticated, campaignRoutes);


  const callLogsRoutes = (await import('./routes/call-logs-routes')).default;
  app.use('/api/call-logs', requireSubdomainAuth, ensureAuthenticated, callLogsRoutes);


  app.use('/api/webchat', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use('/api/templates', templateMediaRoutes);

  app.use('/api/auto-update', autoUpdateRoutes);


  app.get('/api/public/website-enabled', async (req: Request, res: Response) => {
    try {
      const generalSettings = await storage.getAppSetting('general_settings');
      const settingsValue = generalSettings?.value as any;
      const enabled = settingsValue?.frontendWebsiteEnabled === true;
      res.json({ enabled });
    } catch (error) {
      console.error('Error checking website enabled status:', error);
      res.json({ enabled: false });
    }
  });


  app.get('/api/public/general-settings', async (req: Request, res: Response) => {
    try {
      const generalSettings = await storage.getAppSetting('general_settings');
      const settingsValue = generalSettings?.value as any;


      const publicSettings = {
        defaultCurrency: settingsValue?.defaultCurrency || 'USD',
        dateFormat: settingsValue?.dateFormat || 'MM/DD/YYYY',
        timeFormat: settingsValue?.timeFormat || '12h',
        subdomainAuthentication: settingsValue?.subdomainAuthentication || false,
        frontendWebsiteEnabled: settingsValue?.frontendWebsiteEnabled || false,
        planRenewalEnabled: settingsValue?.planRenewalEnabled !== undefined ? settingsValue.planRenewalEnabled : true,
        helpSupportUrl: settingsValue?.helpSupportUrl || '',
        customCurrencies: settingsValue?.customCurrencies || []
      };


      res.set('Cache-Control', 'public, max-age=60');
      res.json(publicSettings);
    } catch (error) {
      console.error('Error fetching general settings:', error);

      res.json({
        defaultCurrency: 'USD',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        subdomainAuthentication: false,
        frontendWebsiteEnabled: false,
        planRenewalEnabled: true, // Default to enabled for safety
        helpSupportUrl: '',
        customCurrencies: []
      });
    }
  });


  app.get('/api/debug/settings', async (req: Request, res: Response) => {
    try {
      const generalSettings = await storage.getAppSetting('general_settings');
      res.json({
        generalSettings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching debug settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch debug settings' });
    }
  });




  app.get('/api/webhooks/messenger', async (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];



    if (mode !== 'subscribe') {
      return res.status(403).send('Forbidden');
    }

    try {
      const messengerConnections = await storage.getChannelConnectionsByType('messenger');

      let matchingConnection = null;
      for (const connection of messengerConnections) {
        const connectionData = connection.connectionData as any;
        if (connectionData?.verifyToken === token) {
          matchingConnection = connection;
          break;
        }
      }

      const globalToken = process.env.MESSENGER_WEBHOOK_VERIFY_TOKEN;
      const isGlobalMatch = globalToken && token === globalToken;

      if (matchingConnection || isGlobalMatch) {
        res.status(200).send(challenge);
      } else {

        res.status(403).send('Forbidden');
      }
    } catch (error) {
      console.error('Error during Messenger webhook verification:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.post('/api/webhooks/messenger', async (req, res) => {
    try {
      const signature = req.headers['x-hub-signature-256'] as string;
      const body = req.body;



      let targetConnection = null;
      let pageId: string | null = null;

      if (body?.entry && Array.isArray(body.entry) && body.entry.length > 0) {
        const entry = body.entry[0];
        if (entry?.messaging && Array.isArray(entry.messaging) && entry.messaging.length > 0) {
          const messaging = entry.messaging[0];
          pageId = messaging?.recipient?.id;
        }

        if (pageId) {
          const messengerConnections = await storage.getChannelConnectionsByType('messenger');



          targetConnection = messengerConnections.find((conn: any) => {
            const connectionData = conn.connectionData as any;
            return connectionData?.pageId === pageId;
          });

          if (!targetConnection && messengerConnections.length === 1) {
            targetConnection = messengerConnections[0];
          }
        }
      }

      await messengerService.processWebhook(body, signature, targetConnection?.companyId || undefined, targetConnection);

      res.status(200).send('OK');
    } catch (error) {
      console.error('Error processing Messenger webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.post('/api/messenger/test-webhook', ensureAuthenticated, async (req: any, res) => {
    try {
      const { webhookUrl, verifyToken } = req.body;

      if (!webhookUrl || !verifyToken) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL and verify token are required'
        });
      }

      const testResult = await messengerService.testWebhookConfiguration(webhookUrl, verifyToken);

      if (testResult.success) {
        res.json({
          success: true,
          message: 'Webhook configuration is valid'
        });
      } else {
        res.status(400).json({
          success: false,
          message: testResult.error || 'Webhook test failed'
        });
      }
    } catch (error: any) {
      console.error('Error testing webhook configuration:', error.message);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });


  app.use('/api/follow-ups', ensureAuthenticated, followUpRoutes);

  app.use('/api/email-templates', ensureAuthenticated, emailTemplateRoutes);


  app.use('/api/flow-variables', ensureAuthenticated, flowVariablesRoutes);

  app.use('/api/email-signatures', ensureAuthenticated, emailSignatureRoutes);

  app.use('/api/quick-replies', ensureAuthenticated, quickReplyRoutes);

  app.use('/api/call-agent', ensureAuthenticated, callAgentRoutes);

  app.use('/api/whatsapp-templates', ensureAuthenticated, whatsappTemplatesRoutes);

  app.use('/api/enhanced-subscription', enhancedSubscriptionRoutes);

  app.use('/api/plan-renewal', planRenewalRoutes);

  app.use('/api/payment', paymentCallbackRoutes);

  app.use('/api/company/ai-credentials', ensureAuthenticated, companyAiCredentialsRoutes);

  app.use('/api/admin/companies', companyDataUsageRoutes);

  app.use('/api/knowledge-base', ensureAuthenticated, knowledgeBaseRoutes);

  app.use('/api/openrouter', openRouterRoutes);


  app.use('/api/subscription-data-fix', subscriptionDataFixRoutes);

  const aiFlowAssistantRoutes = (await import('./routes/ai-flow-assistant-routes')).default;
  app.use('/api/ai-flow-assistant', ensureAuthenticated, aiFlowAssistantRoutes);


  app.post('/api/flows/test-code', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { code, timeout, variables } = req.body || {};
      if (typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Code is required' });
      }

      const timeoutValue = typeof timeout === 'number' ? timeout : 5000;
      const effectiveTimeout = Math.min(Math.max(100, timeoutValue), 30000);

      const sandboxVariables: Record<string, any> = { ...(variables || {}) };

      const safeFetch = async (input: string, init: any = {}) => {
        const controller = new AbortController();
        const perRequestTimeout = Math.min(Math.max(100, Number(init?.timeout) || effectiveTimeout), 30000);
        const t = setTimeout(() => controller.abort(), perRequestTimeout);
        try {
          const { timeout: _omitTimeout, ...rest } = init || {};
          const resFetch = await fetch(input, { ...rest, signal: controller.signal });
          return resFetch;
        } finally {
          clearTimeout(t);
        }
      };

      const ivm = await import('isolated-vm');


      const isolate = new ivm.Isolate({ memoryLimit: 32 }); // 32MB memory limit
      const vmContext = await isolate.createContext();


      const jail = vmContext.global;


      await jail.set('variables', new ivm.ExternalCopy(sandboxVariables).copyInto());


      await jail.set('console', new ivm.ExternalCopy({
        log: () => { },
        error: () => { },
        warn: () => { }
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
            ${code}
            return typeof variables !== 'undefined' ? variables : undefined;
          } catch (error) {
            throw new Error('Code execution error: ' + error.message);
          }
        })()
      `;


      const result = await Promise.race([
        vmContext.eval(wrappedCode, { timeout: effectiveTimeout }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Code execution timeout after ${effectiveTimeout}ms`)), effectiveTimeout)
        )
      ]);


      isolate.dispose();

      const finalVars = (result && typeof result === 'object') ? result : sandboxVariables;
      const responsePayload = {
        success: true,
        result: Object.prototype.hasOwnProperty.call(finalVars, 'result') ? finalVars.result : null,
        variables: finalVars
      };
      return res.json(responsePayload);
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Execution error' });
    }
  });

  app.post('/api/test-stripe', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const Stripe = (await import('stripe')).default;
      const { randomUUID } = await import('crypto');

      const {
        apiKey,
        resource,
        operation,
        amountFormat = 'cents',
        metadata = [],
        email,
        name,
        phone,
        customerId,
        amount,
        currency = 'usd',
        customer,
        source,
        paymentMethod,
        description,
        charge,
        paymentIntent,
        subscriptionId,
        priceId,
        plan,
        limit,
        startingAfter
      } = req.body || {};

      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ success: false, error: 'Stripe API key is required' });
      }

      if (!resource || !operation) {
        return res.status(400).json({ success: false, error: 'Resource and operation are required' });
      }


      const stripe = new Stripe(apiKey, { apiVersion: '2025-09-30.clover' as any });


      const idempotencyKey = randomUUID();


      const metadataObj: Record<string, string> = {};
      if (Array.isArray(metadata)) {
        metadata.forEach((item: { key?: string; value?: string }) => {
          if (item.key && item.value !== undefined) {
            metadataObj[item.key] = item.value;
          }
        });
      }

      let response: any;


      switch (resource) {
        case 'customer': {
          switch (operation) {
            case 'create': {
              const customerData: Stripe.CustomerCreateParams = {
                email: email || undefined,
                name: name || undefined,
                phone: phone || undefined,
                metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined
              };
              response = await stripe.customers.create(customerData, { idempotencyKey });
              break;
            }
            case 'get': {
              if (!customerId) {
                return res.status(400).json({ success: false, error: 'Customer ID is required for get operation' });
              }
              response = await stripe.customers.retrieve(customerId);
              break;
            }
            case 'update': {
              if (!customerId) {
                return res.status(400).json({ success: false, error: 'Customer ID is required for update operation' });
              }
              const updateData: Stripe.CustomerUpdateParams = {};
              if (email) updateData.email = email;
              if (name) updateData.name = name;
              if (phone) updateData.phone = phone;
              if (Object.keys(metadataObj).length > 0) updateData.metadata = metadataObj;
              response = await stripe.customers.update(customerId, updateData);
              break;
            }
            case 'delete': {
              if (!customerId) {
                return res.status(400).json({ success: false, error: 'Customer ID is required for delete operation' });
              }
              response = await stripe.customers.del(customerId);
              break;
            }
            default:
              return res.status(400).json({ success: false, error: `Unsupported customer operation: ${operation}` });
          }
          break;
        }

        case 'payment': {
          switch (operation) {
            case 'createCharge': {
              if (!amount) {
                return res.status(400).json({ success: false, error: 'Amount is required for createCharge operation' });
              }
              let amountValue: number;
              if (amountFormat === 'decimal') {
                const decimalAmount = parseFloat(amount);
                if (isNaN(decimalAmount) || decimalAmount <= 0) {
                  return res.status(400).json({ success: false, error: 'Invalid amount: must be a positive number' });
                }
                amountValue = Math.round(decimalAmount * 100);
              } else {
                amountValue = parseInt(amount);
                if (isNaN(amountValue) || amountValue <= 0) {
                  return res.status(400).json({ success: false, error: 'Invalid amount: must be a positive integer' });
                }
              }
              const chargeData: Stripe.ChargeCreateParams = {
                amount: amountValue,
                currency: currency || 'usd',
                source: source || undefined,
                customer: customer || undefined,
                description: description || undefined,
                metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined
              };
              response = await stripe.charges.create(chargeData, { idempotencyKey });
              break;
            }
            case 'createPaymentIntent': {
              if (!amount) {
                return res.status(400).json({ success: false, error: 'Amount is required for createPaymentIntent operation' });
              }
              let amountValue: number;
              if (amountFormat === 'decimal') {
                const decimalAmount = parseFloat(amount);
                if (isNaN(decimalAmount) || decimalAmount <= 0) {
                  return res.status(400).json({ success: false, error: 'Invalid amount: must be a positive number' });
                }
                amountValue = Math.round(decimalAmount * 100);
              } else {
                amountValue = parseInt(amount);
                if (isNaN(amountValue) || amountValue <= 0) {
                  return res.status(400).json({ success: false, error: 'Invalid amount: must be a positive integer' });
                }
              }
              const paymentIntentData: Stripe.PaymentIntentCreateParams = {
                amount: amountValue,
                currency: currency || 'usd',
                customer: customer || undefined,
                payment_method: paymentMethod || undefined,
                metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined
              };
              response = await stripe.paymentIntents.create(paymentIntentData, { idempotencyKey });
              break;
            }
            case 'refund': {
              const refundData: Stripe.RefundCreateParams = {
                charge: charge || undefined,
                payment_intent: paymentIntent || undefined,
                metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined
              };

              if (amount) {
                let amountValue: number;
                if (amountFormat === 'decimal') {
                  const decimalAmount = parseFloat(amount);
                  if (isNaN(decimalAmount) || decimalAmount <= 0) {
                    return res.status(400).json({ success: false, error: 'Invalid refund amount: must be a positive number' });
                  }
                  amountValue = Math.round(decimalAmount * 100);
                } else {
                  amountValue = parseInt(amount);
                  if (isNaN(amountValue) || amountValue <= 0) {
                    return res.status(400).json({ success: false, error: 'Invalid refund amount: must be a positive integer' });
                  }
                }
                refundData.amount = amountValue;
              }

              if (!refundData.charge && !refundData.payment_intent) {
                return res.status(400).json({ success: false, error: 'Either charge or payment_intent is required for refund operation' });
              }

              response = await stripe.refunds.create(refundData, { idempotencyKey });
              break;
            }
            default:
              return res.status(400).json({ success: false, error: `Unsupported payment operation: ${operation}` });
          }
          break;
        }

        case 'subscription': {
          switch (operation) {
            case 'create': {
              if (!customer || (!priceId && !plan)) {
                return res.status(400).json({ success: false, error: 'Customer ID and Price ID or Plan are required for creating a subscription' });
              }
              const subscriptionData: Stripe.SubscriptionCreateParams = {
                customer: customer,
                items: priceId ? [{ price: priceId }] : plan ? [{ plan: plan }] : [],
                metadata: Object.keys(metadataObj).length > 0 ? metadataObj : undefined
              };
              response = await stripe.subscriptions.create(subscriptionData, { idempotencyKey });
              break;
            }
            case 'get': {
              if (!subscriptionId) {
                return res.status(400).json({ success: false, error: 'Subscription ID is required for get operation' });
              }
              response = await stripe.subscriptions.retrieve(subscriptionId);
              break;
            }
            case 'update': {
              if (!subscriptionId) {
                return res.status(400).json({ success: false, error: 'Subscription ID is required for update operation' });
              }
              const updateData: Stripe.SubscriptionUpdateParams = {};
              if (priceId) {
                updateData.items = [{ id: subscriptionId, price: priceId }];
              }
              if (Object.keys(metadataObj).length > 0) updateData.metadata = metadataObj;
              response = await stripe.subscriptions.update(subscriptionId, updateData);
              break;
            }
            case 'cancel': {
              if (!subscriptionId) {
                return res.status(400).json({ success: false, error: 'Subscription ID is required for cancel operation' });
              }
              response = await stripe.subscriptions.cancel(subscriptionId);
              break;
            }
            default:
              return res.status(400).json({ success: false, error: `Unsupported subscription operation: ${operation}` });
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
              const params: Stripe.BalanceTransactionListParams = {};
              if (limit) params.limit = parseInt(limit) || 10;
              if (startingAfter) params.starting_after = startingAfter;
              response = await stripe.balanceTransactions.list(params);
              break;
            }
            default:
              return res.status(400).json({ success: false, error: `Unsupported balance operation: ${operation}` });
          }
          break;
        }

        default:
          return res.status(400).json({ success: false, error: `Unsupported resource type: ${resource}` });
      }

      return res.json({
        success: true,
        data: response,
        idempotencyKey
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error?.message || error?.type || 'Stripe API error',
        code: error?.code,
        type: error?.type
      });
    }
  });

  const ensureSuperAdmin = (req: Request, res: Response, next: any) => {
    if (req.isAuthenticated() && req.user && (req.user as any).isSuperAdmin) {
      return next();
    }

    if (req.path === '/api/company-settings/google-maps' && req.method === 'POST') {
      return res.status(403).json({
        error: 'Only super administrators can configure app-level settings like the Google Maps API key'
      });
    }
    res.status(403).json({ message: 'Super admin access required' });
  };

  app.get('/api/admin/settings/landing-content', ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const heroTitle = await storage.getAppSetting('landing_hero_title');
      const heroSubtitle = await storage.getAppSetting('landing_hero_subtitle');
      const featuresTitle = await storage.getAppSetting('landing_features_title');
      const featuresSubtitle = await storage.getAppSetting('landing_features_subtitle');

      res.json({
        heroTitle: heroTitle?.value,
        heroSubtitle: heroSubtitle?.value,
        featuresTitle: featuresTitle?.value,
        featuresSubtitle: featuresSubtitle?.value
      });
    } catch (error) {
      console.error('Error fetching landing content:', error);
      res.status(500).json({ error: 'Failed to fetch landing content' });
    }
  });

  app.get('/api/branding', ensureAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getAllAppSettings();

      const brandingSettings = settings.filter(s =>
        s.key === 'branding' ||
        s.key === 'branding_logo' ||
        s.key === 'branding_favicon' ||
        s.key === 'branding_admin_auth_background' ||
        s.key === 'branding_user_auth_background' ||
        s.key === 'auth_background_config'
      );

      res.json(brandingSettings);
    } catch (error) {
      console.error('Error fetching branding settings:', error);
      res.status(500).json({ error: 'Failed to fetch branding settings' });
    }
  });

  app.get('/api/settings/api-keys', ensureAuthenticated, async (req: any, res) => {
    try {
      const apiKeys = await storage.getApiKeysByCompanyId(req.user.companyId);

      const sanitizedKeys = apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        permissions: key.permissions,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        rateLimitPerMinute: key.rateLimitPerMinute,
        rateLimitPerHour: key.rateLimitPerHour,
        rateLimitPerDay: key.rateLimitPerDay
      }));

      res.json(sanitizedKeys);
    } catch (error) {
      console.error('Error fetching API keys:', error);
      res.status(500).json({ error: 'Failed to fetch API keys' });
    }
  });


  const ensureCompanyAdmin = (req: any, res: Response, next: any) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const user = req.user as any;
      if (!user.companyId) {
        return res.status(400).json({ error: 'Company ID is required' });
      }
      if (user.isSuperAdmin || user.role === 'admin') {
        return next();
      }
      return res.status(403).json({ error: 'Admin access required' });
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };


  app.get('/api/company-settings/whatsapp-proxy', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const cfg = await storage.getWhatsAppProxyConfig(companyId);
      res.json(cfg || null);
    } catch (error: any) {
      console.error('Error fetching WhatsApp proxy config:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch proxy config' });
    }
  });


  app.put('/api/company-settings/whatsapp-proxy', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const { enabled, type, host, port, username, password, testStatus, lastTested } = req.body || {};


      const allowedTypes = ['http', 'https', 'socks5'];
      if (enabled === true) {
        if (!type || !allowedTypes.includes(String(type).toLowerCase())) {
          return res.status(400).json({ error: 'Invalid proxy type. Allowed: http, https, socks5' });
        }
        if (!host || typeof host !== 'string' || host.trim().length === 0) {
          return res.status(400).json({ error: 'Proxy host is required' });
        }
        const p = Number(port);
        if (!Number.isInteger(p) || p < 1 || p > 65535) {
          return res.status(400).json({ error: 'Proxy port must be an integer between 1 and 65535' });
        }
      }

      const cfgToSave: any = {
        enabled: Boolean(enabled),
        type: type ? String(type).toLowerCase() : 'http',
        host: host || '',
        port: port !== undefined && port !== null && port !== '' ? Number(port) : 0,
        username: (username === null || username === undefined || username === '') ? null : String(username),
        password: (password === null || password === undefined || password === '') ? null : String(password),
        testStatus: (testStatus === 'working' || testStatus === 'failed' || testStatus === 'untested') ? testStatus : 'untested',
        lastTested: lastTested ? new Date(lastTested) : null
      };

      const saved = await storage.saveWhatsAppProxyConfig(companyId, cfgToSave);
      res.json(saved);
    } catch (error: any) {
      console.error('Error saving WhatsApp proxy config:', error);
      res.status(500).json({ error: error?.message || 'Failed to save proxy config' });
    }
  });


  app.get('/api/company-settings/auto-add-to-pipeline', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const setting = await storage.getCompanySetting(companyId, 'autoAddContactToPipeline');
      const value = setting?.value !== undefined ? Boolean(setting.value) : false;
      res.json({ autoAddContactToPipeline: value });
    } catch (error: any) {
      console.error('Error fetching auto-add to pipeline setting:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch setting' });
    }
  });

  app.post('/api/company-settings/auto-add-to-pipeline', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const { autoAddContactToPipeline } = req.body;

      if (autoAddContactToPipeline === undefined) {
        return res.status(400).json({ error: 'autoAddContactToPipeline is required' });
      }

      await storage.saveCompanySetting(companyId, 'autoAddContactToPipeline', Boolean(autoAddContactToPipeline));


      const { invalidatePipelineStageCache } = await import('./utils/pipeline-cache');


      res.json({
        message: 'Auto-add to pipeline setting saved successfully',
        autoAddContactToPipeline: Boolean(autoAddContactToPipeline)
      });
    } catch (error: any) {
      console.error('Error saving auto-add to pipeline setting:', error);
      res.status(500).json({ error: error?.message || 'Failed to save setting' });
    }
  });

  app.get('/api/company-settings/custom-css', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const customCssSetting = await storage.getCompanySetting(companyId, 'custom_css');

      if (!customCssSetting) {
        const defaultConfig = {
          enabled: false,
          css: '',
          lastModified: new Date().toISOString()
        };
        return res.json(defaultConfig);
      }

      res.json(customCssSetting.value);
    } catch (error: any) {
      console.error('Error fetching company custom CSS:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch custom CSS settings' });
    }
  });

  app.post('/api/company-settings/custom-css', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const { enabled, css } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: "Enabled must be a boolean value" });
      }

      if (typeof css !== 'string') {
        return res.status(400).json({ error: "CSS must be a string" });
      }

      const customCssSettings = {
        enabled: Boolean(enabled),
        css: css || '',
        lastModified: new Date().toISOString()
      };

      await storage.saveCompanySetting(companyId, 'custom_css', customCssSettings);

      res.json({
        message: "Custom CSS settings saved successfully",
        settings: customCssSettings
      });
    } catch (error: any) {
      console.error('Error saving company custom CSS:', error);
      res.status(500).json({ error: error?.message || 'Failed to save custom CSS settings' });
    }
  });

  app.get('/api/company-settings/google-maps', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const setting = await storage.getAppSetting('google_maps_api_key');

      if (!setting || !setting.value) {
        return res.json({ apiKey: null, configured: false });
      }

      const apiKey = typeof setting.value === 'string'
        ? setting.value
        : (setting.value as any).apiKey || setting.value;


      if (typeof apiKey === 'string' && apiKey.length > 14) {
        const masked = apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 4);
        return res.json({ apiKey: masked, configured: true });
      }

      return res.json({ apiKey: '***', configured: true });
    } catch (error: any) {
      console.error('Error fetching Google Maps API key:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch API key' });
    }
  });


  app.post('/api/company-settings/google-maps', ensureAuthenticated, ensureSuperAdmin, async (req: any, res: Response) => {
    try {
      const user = req.user as any;
      const { apiKey } = req.body;




      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return res.status(400).json({ error: 'API key is required' });
      }

      await storage.saveAppSetting('google_maps_api_key', apiKey.trim());

      res.json({ success: true, message: 'Google Maps API key saved successfully' });
    } catch (error: any) {
      console.error('Error saving Google Maps API key:', error);
      res.status(500).json({ error: error?.message || 'Failed to save API key' });
    }
  });

  app.post('/api/company-settings/whatsapp-proxy/test', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const { type, host, port, username, password } = req.body || {};
      const allowedTypes = ['http', 'https', 'socks5'];
      if (!type || !allowedTypes.includes(String(type).toLowerCase())) {
        return res.status(400).json({ success: false, status: 'failed', error: 'Invalid proxy type' });
      }
      if (!host || typeof host !== 'string' || host.trim().length === 0) {
        return res.status(400).json({ success: false, status: 'failed', error: 'Proxy host is required' });
      }
      const p = Number(port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ success: false, status: 'failed', error: 'Proxy port must be 1-65535' });
      }

      const t = String(type).toLowerCase();
      const userEnc = encodeURIComponent(username || '');
      const passEnc = encodeURIComponent(password || '');
      const url = (username && password)
        ? `${t}://${userEnc}:${passEnc}@${host}:${p}`
        : `${t}://${host}:${p}`;

      const agent = (t === 'socks5') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);

      const response = await axios.get('https://web.whatsapp.com', {
        httpAgent: agent as any,
        httpsAgent: agent as any,
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (response && response.status < 400) {
        return res.json({ success: true, status: 'working', message: 'Proxy connection successful' });
      }

      return res.status(400).json({ success: false, status: 'failed', error: 'Non-success status from target site' });
    } catch (error: any) {
      console.error('Error testing company proxy:', error);
      return res.status(400).json({ success: false, status: 'failed', error: error?.message || 'Proxy test failed' });
    }
  });



  app.get('/api/whatsapp-proxy-servers', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const companyId = req.user.companyId;
      const servers = await storage.getWhatsappProxyServers(companyId);
      res.json(servers);
    } catch (error: any) {
      console.error('Error fetching proxy servers:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch proxy servers' });
    }
  });


  app.get('/api/whatsapp-proxy-servers/:id', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid proxy server ID' });
      }

      const server = await storage.getWhatsappProxyServer(id);
      if (!server) {
        return res.status(404).json({ error: 'Proxy server not found' });
      }

      if (server.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(server);
    } catch (error: any) {
      console.error('Error fetching proxy server:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch proxy server' });
    }
  });


  app.post('/api/whatsapp-proxy-servers', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const { name, enabled, type, host, port, username, password, description } = req.body;


      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Proxy name is required' });
      }

      const allowedTypes = ['http', 'https', 'socks5'];
      if (!type || !allowedTypes.includes(String(type).toLowerCase())) {
        return res.status(400).json({ error: 'Invalid proxy type. Allowed: http, https, socks5' });
      }

      if (!host || typeof host !== 'string' || host.trim().length === 0) {
        return res.status(400).json({ error: 'Proxy host is required' });
      }

      const p = Number(port);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return res.status(400).json({ error: 'Proxy port must be between 1 and 65535' });
      }

      const proxyData = {
        companyId: req.user.companyId,
        name: name.trim(),
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        type: String(type).toLowerCase(),
        host: host.trim(),
        port: p,
        username: username || null,
        password: password || null,
        description: description || null
      };

      const created = await storage.createWhatsappProxyServer(proxyData);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('Error creating proxy server:', error);
      res.status(500).json({ error: error?.message || 'Failed to create proxy server' });
    }
  });


  app.put('/api/whatsapp-proxy-servers/:id', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid proxy server ID' });
      }

      const server = await storage.getWhatsappProxyServer(id);
      if (!server) {
        return res.status(404).json({ error: 'Proxy server not found' });
      }

      if (server.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { name, enabled, type, host, port, username, password, testStatus, lastTested, description } = req.body;


      if (type !== undefined) {
        const allowedTypes = ['http', 'https', 'socks5'];
        if (!allowedTypes.includes(String(type).toLowerCase())) {
          return res.status(400).json({ error: 'Invalid proxy type' });
        }
      }

      if (port !== undefined) {
        const p = Number(port);
        if (!Number.isInteger(p) || p < 1 || p > 65535) {
          return res.status(400).json({ error: 'Proxy port must be between 1 and 65535' });
        }
      }

      const updates: any = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (enabled !== undefined) updates.enabled = Boolean(enabled);
      if (type !== undefined) updates.type = String(type).toLowerCase();
      if (host !== undefined) updates.host = String(host).trim();
      if (port !== undefined) updates.port = Number(port);
      if (username !== undefined) updates.username = username || null;
      if (password !== undefined) updates.password = password || null;
      if (testStatus !== undefined) updates.testStatus = testStatus;
      if (lastTested !== undefined) updates.lastTested = lastTested ? new Date(lastTested) : null;
      if (description !== undefined) updates.description = description || null;

      const updated = await storage.updateWhatsappProxyServer(id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating proxy server:', error);
      res.status(500).json({ error: error?.message || 'Failed to update proxy server' });
    }
  });


  app.delete('/api/whatsapp-proxy-servers/:id', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid proxy server ID' });
      }

      const server = await storage.getWhatsappProxyServer(id);
      if (!server) {
        return res.status(404).json({ error: 'Proxy server not found' });
      }

      if (server.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await storage.deleteWhatsappProxyServer(id);
      res.json({ success: true, message: 'Proxy server deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting proxy server:', error);
      res.status(500).json({ error: error?.message || 'Failed to delete proxy server' });
    }
  });


  app.post('/api/whatsapp-proxy-servers/:id/test', ensureAuthenticated, ensureCompanyAdmin, async (req: any, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid proxy server ID', status: 'failed' });
      }

      const server = await storage.getWhatsappProxyServer(id);
      if (!server) {
        return res.status(404).json({ success: false, error: 'Proxy server not found', status: 'failed' });
      }

      if (server.companyId !== req.user.companyId) {
        return res.status(403).json({ success: false, error: 'Access denied', status: 'failed' });
      }

      const t = String(server.type).toLowerCase();
      const userEnc = encodeURIComponent(server.username || '');
      const passEnc = encodeURIComponent(server.password || '');
      const url = (server.username && server.password)
        ? `${t}://${userEnc}:${passEnc}@${server.host}:${server.port}`
        : `${t}://${server.host}:${server.port}`;

      const agent = (t === 'socks5') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);

      try {
        const response = await axios.get('https://web.whatsapp.com', {
          httpAgent: agent as any,
          httpsAgent: agent as any,
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (s) => s >= 200 && s < 400,
        });

        if (response && response.status < 400) {
          await storage.updateWhatsappProxyServer(id, {
            testStatus: 'working',
            lastTested: new Date()
          });
          return res.json({ success: true, status: 'working', message: 'Proxy connection successful' });
        }

        await storage.updateWhatsappProxyServer(id, {
          testStatus: 'failed',
          lastTested: new Date()
        });
        return res.status(400).json({ success: false, status: 'failed', error: 'Non-success status from target site' });
      } catch (err: any) {
        await storage.updateWhatsappProxyServer(id, {
          testStatus: 'failed',
          lastTested: new Date()
        });
        return res.status(400).json({ success: false, status: 'failed', error: err?.message || 'Proxy test failed' });
      }
    } catch (error: any) {
      console.error('Error testing proxy server:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Internal server error', status: 'failed' });
    }
  });


  app.put('/api/channel-connections/:id/proxy', ensureAuthenticated, async (req: any, res: Response) => {
    try {
      const connectionId = parseInt(req.params.id);
      if (isNaN(connectionId)) {
        return res.status(400).json({ error: 'Invalid connection ID' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      const user = req.user as any;
      if (!user.isSuperAdmin && connection.userId !== user.id && connection.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { proxyServerId } = req.body;

      if (proxyServerId !== null && proxyServerId !== undefined) {
        const proxyServer = await storage.getWhatsappProxyServer(proxyServerId);
        if (!proxyServer || proxyServer.companyId !== connection.companyId) {
          return res.status(400).json({ error: 'Invalid proxy server' });
        }
      }

      const updated = await storage.updateChannelConnection(connectionId, {
        proxyServerId: proxyServerId || null
      });

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating connection proxy:', error);
      res.status(500).json({ error: error?.message || 'Failed to update connection proxy' });
    }
  });

  app.post('/api/settings/api-keys', ensureAuthenticated, async (req: any, res) => {
    try {
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'API key name is required' });
      }

      const { key, hash, prefix } = generateApiKey();

      const apiKeyData = {
        companyId: req.user.companyId,
        userId: req.user.id,
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        permissions: ['messages:send', 'channels:read', 'messages:read', 'media:upload'],
        isActive: true,
        rateLimitPerMinute: 60,
        rateLimitPerHour: 1000,
        rateLimitPerDay: 10000,
        allowedIps: [],
        metadata: {}
      };

      const createdKey = await storage.createApiKey(apiKeyData);

      res.status(201).json({
        id: createdKey.id,
        key: key,
        name: createdKey.name,
        keyPrefix: createdKey.keyPrefix,
        permissions: createdKey.permissions,
        isActive: createdKey.isActive,
        createdAt: createdKey.createdAt
      });
    } catch (error) {
      console.error('Error creating API key:', error);
      res.status(500).json({ error: 'Failed to create API key' });
    }
  });

  app.patch('/api/settings/api-keys/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const keyId = parseInt(req.params.id);
      const { isActive, name } = req.body;

      if (isNaN(keyId)) {
        return res.status(400).json({ error: 'Invalid API key ID' });
      }

      const existingKey = await storage.getApiKeysByCompanyId(req.user.companyId);
      const keyToUpdate = existingKey.find(k => k.id === keyId);

      if (!keyToUpdate) {
        return res.status(404).json({ error: 'API key not found' });
      }

      const updateData: any = {};
      if (typeof isActive === 'boolean') updateData.isActive = isActive;
      if (typeof name === 'string' && name.trim().length > 0) updateData.name = name.trim();

      const updatedKey = await storage.updateApiKey(keyId, updateData);

      res.json({
        id: updatedKey.id,
        name: updatedKey.name,
        keyPrefix: updatedKey.keyPrefix,
        permissions: updatedKey.permissions,
        isActive: updatedKey.isActive,
        lastUsedAt: updatedKey.lastUsedAt,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt
      });
    } catch (error) {
      console.error('Error updating API key:', error);
      res.status(500).json({ error: 'Failed to update API key' });
    }
  });

  app.delete('/api/settings/api-keys/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const keyId = parseInt(req.params.id);

      if (isNaN(keyId)) {
        return res.status(400).json({ error: 'Invalid API key ID' });
      }

      const existingKeys = await storage.getApiKeysByCompanyId(req.user.companyId);
      const keyToDelete = existingKeys.find(k => k.id === keyId);

      if (!keyToDelete) {
        return res.status(404).json({ error: 'API key not found' });
      }

      await storage.deleteApiKey(keyId);

      res.json({ message: 'API key deleted successfully' });
    } catch (error) {
      console.error('Error deleting API key:', error);
      res.status(500).json({ error: 'Failed to delete API key' });
    }
  });

  app.get('/api/settings/api-usage-stats', ensureAuthenticated, async (req: any, res) => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const stats = await storage.getApiUsageStats(req.user.companyId, startDate, endDate);

      res.json(stats);
    } catch (error) {
      console.error('Error fetching API usage stats:', error);
      res.status(500).json({ error: 'Failed to fetch API usage statistics' });
    }
  });

  app.get('/api/settings/inbox', ensureAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.user.companyId;

      const groupChatSetting = await storage.getCompanySetting(companyId, 'inbox_show_group_chats');
      const showGroupChats = groupChatSetting?.value || false;

      const browserNotificationSetting = await storage.getCompanySetting(companyId, 'inbox_browser_notifications');
      const browserNotifications = browserNotificationSetting?.value || false;

      const agentSignatureSetting = await storage.getCompanySetting(companyId, 'inbox_agent_signature_enabled');
      const agentSignatureEnabled = agentSignatureSetting?.value !== undefined ? agentSignatureSetting.value : true;

      res.json({
        showGroupChats,
        browserNotifications,
        agentSignatureEnabled
      });
    } catch (error) {
      console.error('Error fetching inbox settings:', error);
      res.status(500).json({ error: 'Failed to fetch inbox settings' });
    }
  });

  app.patch('/api/settings/inbox', ensureAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.user.companyId;
      const { showGroupChats, browserNotifications, agentSignatureEnabled } = req.body;


      if (showGroupChats !== undefined) {
        if (typeof showGroupChats !== 'boolean') {
          return res.status(400).json({ error: 'showGroupChats must be a boolean value' });
        }
        await storage.saveCompanySetting(companyId, 'inbox_show_group_chats', showGroupChats);
      }


      if (browserNotifications !== undefined) {
        if (typeof browserNotifications !== 'boolean') {
          return res.status(400).json({ error: 'browserNotifications must be a boolean value' });
        }
        await storage.saveCompanySetting(companyId, 'inbox_browser_notifications', browserNotifications);
      }


      if (agentSignatureEnabled !== undefined) {
        if (typeof agentSignatureEnabled !== 'boolean') {
          return res.status(400).json({ error: 'agentSignatureEnabled must be a boolean value' });
        }
        await storage.saveCompanySetting(companyId, 'inbox_agent_signature_enabled', agentSignatureEnabled);
      }


      const groupChatSetting = await storage.getCompanySetting(companyId, 'inbox_show_group_chats');
      const currentShowGroupChats = groupChatSetting?.value || false;

      const browserNotificationSetting = await storage.getCompanySetting(companyId, 'inbox_browser_notifications');
      const currentBrowserNotifications = browserNotificationSetting?.value || false;

      const agentSignatureSetting = await storage.getCompanySetting(companyId, 'inbox_agent_signature_enabled');
      const currentAgentSignatureEnabled = agentSignatureSetting?.value !== undefined ? agentSignatureSetting.value : true;

      res.json({
        success: true,
        showGroupChats: currentShowGroupChats,
        browserNotifications: currentBrowserNotifications,
        agentSignatureEnabled: currentAgentSignatureEnabled
      });
    } catch (error) {
      console.error('Error updating inbox settings:', error);
      res.status(500).json({ error: 'Failed to update inbox settings' });
    }
  });


  app.get('/api/webchat/preview/:token', async (req: Request, res: Response) => {
    const token = req.params.token;
    try {
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) {
        return res.status(404).send('<!DOCTYPE html><html><body><h2>Invalid WebChat token</h2></body></html>');
      }
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .preview-info { max-width: 800px; margin: 0 auto 20px; padding: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .preview-info h2 { margin: 0 0 10px; font-size: 18px; }
    .preview-info p { margin: 0; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <script src="/api/webchat/widget.js?token=${token}" async></script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!DOCTYPE html><html><body><h2>WebChat preview error</h2></body></html>');
    }
  });


  app.get('/api/webchat/embed/:token', async (req: Request, res: Response) => {
    const token = req.params.token;
    try {
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) {
        return res.status(404).send('<!DOCTYPE html><html><body><h2>Invalid WebChat token</h2></body></html>');
      }
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; background: transparent; }
  </style>
</head>
<body>
  <script src="/api/webchat/widget.js?token=${token}" async></script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (e) {
      res.status(500).send('<!DOCTYPE html><html><body><h2>WebChat embed error</h2></body></html>');
    }
  });


  app.get('/api/webchat/widget.js', async (req: Request, res: Response) => {
    try {

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');


      const widgetJsPath = path.join(getWidgetsBasePath(), 'webchat-widget.js');
      if (await fsExtra.pathExists(widgetJsPath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(widgetJsPath);
      } else {
        res.status(404).send('// Widget JavaScript file not found');
      }
    } catch (e) {
      res.status(500).send('// Error loading widget JavaScript');
    }
  });


  app.get('/api/webchat/widget/:token', async (req: Request, res: Response) => {
    const token = req.params.token;
    try {
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) {
        return res.status(404).send('// Invalid WebChat token');
      }


      const redirectUrl = `/api/webchat/widget.js?token=${encodeURIComponent(token)}`;
      res.redirect(302, redirectUrl);
    } catch (e) {
      res.status(500).send('// Error loading widget');
    }
  });


  app.get('/api/webchat/widget/:token/legacy', async (req: Request, res: Response) => {
    const token = req.params.token;
    try {
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) {
        return res.status(404).send('// Invalid WebChat token');
      }


      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');


      const widgetJsPath = path.join(getWidgetsBasePath(), 'webchat-widget.js');
      if (await fsExtra.pathExists(widgetJsPath)) {
        let script = await fsExtra.readFile(widgetJsPath, 'utf-8');

        script = script.replace('__TOKEN__', token);
        res.setHeader('Content-Type', 'application/javascript');
        res.send(script);
      } else {

        if (process.env.NODE_ENV === 'production') {
          logger.error('webchat', 'Widget JS not found at', widgetJsPath);
        }

        const script = `(()=>{const TOKEN=${JSON.stringify(token)};const API=location.origin;const s=document.createElement('style');s.textContent=` +
          JSON.stringify(`
.pc-widget-button{position:fixed;right:20px;bottom:20px;background:#6366f1;color:#fff;border-radius:9999px;padding:12px 16px;font:14px/1.2 system-ui,Segoe UI,Arial;box-shadow:0 6px 20px rgba(0,0,0,.15);cursor:pointer;z-index:2147483000}
.pc-widget-window{position:fixed;right:20px;bottom:76px;width:320px;max-width:95vw;height:420px;max-height:70vh;background:#fff;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:2147483000}
.pc-widget-header{background:#6366f1;color:#fff;padding:10px 12px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
.pc-widget-messages{flex:1;overflow:auto;padding:10px;background:#f8fafc}
.pc-widget-input{display:flex;gap:6px;padding:8px;border-top:1px solid #e5e7eb}
.pc-widget-input input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px}
.pc-msg{max-width:80%;margin:6px 0;padding:8px 10px;border-radius:10px;font:13px/1.35 system-ui,Segoe UI,Arial;white-space:pre-wrap}
.pc-in{background:#fff;border:1px solid #e5e7eb}
.pc-out{background:#eef2ff;color:#111827;margin-left:auto}
`) + `;document.head.appendChild(s);
const btn=document.createElement('button');btn.className='pc-widget-button';btn.textContent='Chat';document.body.appendChild(btn);
const win=document.createElement('div');win.className='pc-widget-window';win.innerHTML=` + JSON.stringify(`
  <div class="pc-widget-header">Chat <span id="pc-close" style="cursor:pointer;opacity:.9">✕</span></div>
  <div id="pc-messages" class="pc-widget-messages"></div>
  <div class="pc-widget-input">
    <input id="pc-input" placeholder="Type a message" />
    <button id="pc-send">Send</button>
  </div>
`) + `;document.body.appendChild(win);
const elMsgs=win.querySelector('#pc-messages');
const elInput=win.querySelector('#pc-input');
const elSend=win.querySelector('#pc-send');
const elClose=win.querySelector('#pc-close');
const SID_KEY='pc_webchat_sid_'+TOKEN;let sid=localStorage.getItem(SID_KEY);let pollInterval=null;let lastPoll=null;const shownMsgIds=new Set();
async function ensureSession(){if(!sid){const r=await fetch(API+'/api/webchat/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN})});const j=await r.json();sid=j.sessionId;localStorage.setItem(SID_KEY,sid);}}
function push(type,content,msgId){if(msgId&&shownMsgIds.has(msgId))return;const div=document.createElement('div');div.className='pc-msg '+(type==='out'?'pc-out':'pc-in');div.textContent=content;elMsgs.appendChild(div);elMsgs.scrollTop=elMsgs.scrollHeight;if(msgId)shownMsgIds.add(msgId);}
async function pollMessages(){if(!sid)return;try{const url=API+'/api/webchat/messages/'+sid+'?token='+TOKEN+(lastPoll?'&since='+lastPoll:'');const r=await fetch(url);const data=await r.json();if(data.messages){data.messages.forEach(m=>{if(m.direction==='outbound'&&m.content){push('in',m.content,m.id);}});if(data.timestamp)lastPoll=data.timestamp;}}catch(e){}}
function startPolling(){if(pollInterval)return;pollMessages();pollInterval=setInterval(pollMessages,3000);}
function stopPolling(){if(pollInterval){clearInterval(pollInterval);pollInterval=null;}}
btn.onclick=()=>{win.style.display=win.style.display==='flex'?'none':'flex';if(win.style.display==='flex'){ensureSession().then(startPolling);}else{stopPolling();}}
elClose.onclick=()=>{win.style.display='none';stopPolling();}
elSend.onclick=async()=>{const v=(elInput).value.trim();if(!v)return;push('out',v);(elInput).value='';await ensureSession();try{await fetch(API+'/api/webchat/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,sessionId:sid,message:v,messageType:'text'})});}catch(e){}}
})();`;
        res.setHeader('Content-Type', 'application/javascript');
        res.send(script);
      }
    } catch (e) {
      res.setHeader('Content-Type', 'application/javascript');
      res.status(500).send('// WebChat widget error');
    }
  });


  app.get('/api/webchat/config/:token', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) return res.status(404).json({ error: 'Not found' });
      const data = (connection.connectionData || {}) as any;


      const teamAvatars = [];
      if (connection.companyId) {
        const users = await storage.getUsersByCompany(connection.companyId);

        for (const user of users.slice(0, 3)) {
          teamAvatars.push({
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            initials: user.fullName?.split(' ').map((n: string) => n[0]).join('') || 'U'
          });
        }
      }

      const cfg = {
        token,
        widgetColor: data.widgetColor || '#6366f1',
        welcomeMessage: data.welcomeMessage || 'Hi! How can we help?',
        position: data.position || 'bottom-right',
        showAvatar: data.showAvatar !== false,
        companyName: data.companyName || 'Support',
        allowFileUpload: !!data.allowFileUpload,
        collectEmail: !!data.collectEmail,
        collectName: data.collectName !== false,
        teamAvatars,
      };
      res.json(cfg);
    } catch (e) {
      res.status(500).json({ error: 'Failed to load config' });
    }
  });


  app.post('/api/webchat/session', async (req: Request, res: Response) => {
    try {
      const { token, visitorName, visitorEmail, visitorPhone, metadata } = req.body || {};
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) return res.status(401).json({ error: 'Invalid token' });
      const sessionId = 's_' + crypto.randomBytes(16).toString('hex');
      await webchatService.registerSession(connection.id, connection.companyId, sessionId, visitorName, visitorEmail, visitorPhone);

      await webchatService.processWebhook({
        token,
        eventType: 'session_start',
        data: { sessionId, visitorName, visitorEmail, visitorPhone, metadata }
      }, connection.companyId);
      res.json({ sessionId });
    } catch (e) {
      res.status(500).json({ error: 'Failed to initialize session' });
    }
  });


  app.post('/api/webchat/message', async (req: Request, res: Response) => {
    try {
      const payload = req.body || {};
      const { token, sessionId, message, messageType, visitorName, visitorEmail } = payload;
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) return res.status(401).json({ error: 'Invalid token' });
      const savedMessage = await webchatService.processWebhook({
        token,
        eventType: 'message',
        data: { sessionId, message, messageType, visitorName, visitorEmail }
      }, connection.companyId);

      res.json({
        success: true,
        message: savedMessage ? {
          id: savedMessage.id,
          createdAt: savedMessage.createdAt,
          sentAt: savedMessage.sentAt
        } : null
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to process message' });
    }
  });


  app.get('/api/webchat/messages/:sessionId', async (req: Request, res: Response) => {
    try {
      const sessionId = req.params.sessionId;
      const token = String(req.query.token || '');
      const connection = await webchatService.verifyWidgetToken(token);
      if (!connection) return res.status(401).json({ error: 'Invalid token' });


      const contact = await storage.getContactByIdentifier?.(sessionId, 'webchat');
      if (!contact) return res.json({ messages: [] });
      const conversation = await storage.getConversationByContactAndChannel(contact.id, connection.id);
      if (!conversation) return res.json({ messages: [] });

      const all = await storage.getMessagesByConversationPaginated(conversation.id, 50, 0);

      const since = req.query.since ? new Date(String(req.query.since)) : null;
      const filtered = since ? all.filter((x: any) => new Date(x.createdAt) > since) : all;
      res.json({ messages: filtered.reverse(), timestamp: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });


  app.get('/api/users/me', async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
      const user = req.user as any;
      let responseUser = { ...user };


      if (user.companyId) {
        const company = await storage.getCompany(user.companyId);
        if (company) {
          responseUser.company = {
            id: company.id,
            name: company.name,
            slug: company.slug,
            plan: company.plan,
            registerNumber: company.registerNumber,
            companyEmail: company.companyEmail,
            contactPerson: company.contactPerson,
            iban: company.iban,
            logo: company.logo,
            primaryColor: company.primaryColor,
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
          };
        }
      }

      res.json(responseUser);
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: error.message || 'Error fetching profile' });
    }
  });


  const validateIBAN = (iban: string): boolean => {
    if (!iban) return true; // Allow empty IBAN


    const cleanIban = iban.replace(/\s/g, '').toUpperCase();



    if (cleanIban.length !== 24) {
      return false;
    }


    if (!/^SA[0-9]{2}/.test(cleanIban)) {
      return false;
    }


    if (!/^SA[0-9]{22}$/.test(cleanIban)) {
      return false;
    }


    try {

      const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);


      const numericString = rearranged.replace(/[A-Z]/g, (char) =>
        (char.charCodeAt(0) - 55).toString()
      );


      let remainder = 0;
      for (let i = 0; i < numericString.length; i++) {
        remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
      }

      return remainder === 1;
    } catch {
      return false;
    }
  };


  app.patch('/api/companies/me', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(400).json({ message: 'User is not associated with a company' });
      }


      if (user.role !== 'admin' && !user.isSuperAdmin) {
        return res.status(403).json({ message: 'Only company administrators can update company information' });
      }

      const { name, companyEmail, contactPerson, registerNumber, iban, primaryColor } = req.body;
      const updates: any = {};


      if (name) {
        if (name.length < 2) {
          return res.status(400).json({ message: 'Company name must be at least 2 characters' });
        }
        updates.name = name;
      }

      if (companyEmail !== undefined) {
        if (companyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
          return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        updates.companyEmail = companyEmail;
      }

      if (contactPerson !== undefined) {
        if (contactPerson && contactPerson.length < 2) {
          return res.status(400).json({ message: 'Contact person must be at least 2 characters' });
        }
        updates.contactPerson = contactPerson;
      }

      if (registerNumber !== undefined) {
        if (registerNumber && !/^[0-9]{10}$/.test(registerNumber)) {
          return res.status(400).json({ message: 'Commercial Registration Number must be exactly 10 digits' });
        }
        updates.registerNumber = registerNumber;
      }

      if (iban !== undefined) {
        if (iban && !validateIBAN(iban)) {
          return res.status(400).json({ message: 'Please enter a valid KSA IBAN (24 characters: SA + 22 digits)' });
        }

        updates.iban = iban ? iban.replace(/\s/g, '').toUpperCase() : iban;
      }

      if (primaryColor) {
        if (!/^#[0-9A-F]{6}$/i.test(primaryColor)) {
          return res.status(400).json({ message: 'Please enter a valid hex color code' });
        }
        updates.primaryColor = primaryColor;
      }

      const updatedCompany = await storage.updateCompany(user.companyId, updates);

      res.json({
        message: 'Company information updated successfully',
        company: updatedCompany
      });
    } catch (error: any) {
      console.error('Error updating company information:', error);
      res.status(500).json({ message: error.message || 'Error updating company information' });
    }
  });

  app.get('/api/users/permissions', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const permissions = await getUserPermissions(user);
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  });

  app.get('/api/agents', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(400).json({ error: 'User not associated with a company' });
      }

      const userSummaries = await storage.getCompanyUserSummaries(user.companyId);

      const availableAgents = userSummaries.filter(agent =>
        (agent.role === 'agent' || agent.role === 'admin') && !agent.isSuperAdmin
      );

      res.json(availableAgents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      res.status(500).json({ error: 'Failed to fetch agents' });
    }
  });

  app.post('/api/conversations/:id/assign', ensureAuthenticated, requirePermission(PERMISSIONS.ASSIGN_CONVERSATIONS), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { agentId } = req.body;
      const user = req.user as any;

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== null && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (conversation.companyId === null) {
        await storage.updateConversation(conversationId, {
          companyId: user.companyId
        });
      }

      if (agentId) {
        const agent = await storage.getUser(agentId);
        if (!agent || agent.companyId !== user.companyId) {
          return res.status(400).json({ error: 'Invalid agent or agent not in same company' });
        }
      }

      const updatedConversation = await storage.updateConversation(conversationId, {
        assignedToUserId: agentId || null
      });

      broadcastToAll({
        type: 'conversationAssigned',
        data: {
          conversationId,
          agentId: agentId || null,
          assignedBy: user.id,
          conversation: updatedConversation
        }
      }, user.companyId);

      await broadcastConversationUpdate(updatedConversation, 'conversationUpdated');

      res.json(updatedConversation);
    } catch (error) {
      console.error('Error assigning conversation:', error);
      res.status(500).json({ error: 'Failed to assign conversation' });
    }
  });

  app.delete('/api/conversations/:id/assign', ensureAuthenticated, requirePermission(PERMISSIONS.ASSIGN_CONVERSATIONS), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== null && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (conversation.companyId === null) {
        await storage.updateConversation(conversationId, {
          companyId: user.companyId
        });
      }

      const updatedConversation = await storage.updateConversation(conversationId, {
        assignedToUserId: null
      });

      broadcastToAll({
        type: 'conversationUnassigned',
        data: {
          conversationId,
          unassignedBy: user.id,
          conversation: updatedConversation
        }
      }, user.companyId);

      await broadcastConversationUpdate(updatedConversation, 'conversationUpdated');

      res.json(updatedConversation);
    } catch (error) {
      console.error('Error unassigning conversation:', error);
      res.status(500).json({ error: 'Failed to unassign conversation' });
    }
  });


  app.post('/api/conversations/:conversationId/initiate-call',
    ensureAuthenticated,
    requirePermission(PERMISSIONS.MANAGE_CALL_LOGS),
    async (req, res) => {
      try {

        const conversationId = parseInt(req.params.conversationId);
        if (isNaN(conversationId)) {
          return res.status(400).json({ error: 'Invalid conversation ID' });
        }


        const conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }


        if (!req.user || conversation.companyId !== req.user.companyId) {
          return res.status(403).json({ error: 'Access denied' });
        }


        if (conversation.isGroup === true) {
          return res.status(400).json({ error: 'Cannot initiate calls to group conversations' });
        }


        const contact = await storage.getContact(conversation.contactId!);
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }

        const permissions = await getUserPermissions(req.user as any);
        if (!(req.user as any).isSuperAdmin && permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
          return res.status(403).json({ error: 'You do not have permission to view or use contact phone numbers' });
        }


        const phoneNumber = contact.phone;
        if (!phoneNumber || phoneNumber.trim() === '') {
          return res.status(400).json({ error: 'Contact does not have a phone number' });
        }


        if (!conversation.channelId) {
          return res.status(400).json({
            error: 'Conversation does not have an associated channel connection'
          });
        }

        const channelConnection = await storage.getChannelConnection(conversation.channelId);
        if (!channelConnection) {
          return res.status(404).json({
            error: 'Channel connection not found for this conversation'
          });
        }


        if (channelConnection.companyId !== req.user.companyId) {
          return res.status(403).json({
            error: 'Access denied: Channel connection does not belong to your company'
          });
        }

        if (channelConnection.status !== 'active') {
          return res.status(400).json({
            error: 'Channel connection is not active'
          });
        }


        if (channelConnection.channelType !== 'twilio_voice') {
          return res.status(400).json({
            error: 'This channel is not a Twilio Voice channel'
          });
        }


        const { callType } = req.body;


        const connectionData = channelConnection.connectionData as any;
        const {
          accountSid,
          authToken,
          fromNumber,
          elevenLabsApiKey,
          elevenLabsAgentId,
          elevenLabsPrompt,
          voiceId
        } = connectionData;


        if (!accountSid || !authToken || !fromNumber) {
          return res.status(400).json({
            error: 'Twilio Voice channel is missing required credentials (Account SID, Auth Token, or From Number)'
          });
        }


        const { initiateOutboundCall } = await import('./services/call-agent-service');
        const { callLogsService } = await import('./services/call-logs-service');
        const { CallLogsEventEmitter } = await import('./utils/websocket');


        const hasElevenLabs = !!(elevenLabsApiKey && elevenLabsApiKey.trim() !== '');


        let useElevenLabs = hasElevenLabs;
        let actualCallType = hasElevenLabs ? 'ai-powered' : 'direct';

        if (callType) {
          if (callType === 'direct') {
            useElevenLabs = false;
            actualCallType = 'direct';
          } else if (callType === 'ai-powered') {
            if (!hasElevenLabs) {
              return res.status(400).json({
                error: 'ElevenLabs credentials not configured for AI-powered calls'
              });
            }

            if (!elevenLabsAgentId && !elevenLabsPrompt) {
              return res.status(400).json({
                error: 'Either ElevenLabs Agent ID or custom prompt must be configured for AI-powered calls. Please configure an agent in your ElevenLabs dashboard or provide a custom prompt.',
                suggestion: 'Go to Settings > AI Credentials > ElevenLabs to configure your agent ID'
              });
            }
            if (!elevenLabsAgentId && elevenLabsPrompt) {
              console.warn('[Initiate Call] Using custom prompt with AI-powered call - signed URL authentication not available for custom prompts');
            }
            useElevenLabs = true;
            actualCallType = 'ai-powered';
          } else {
            return res.status(400).json({
              error: 'Invalid callType. Must be "direct" or "ai-powered"'
            });
          }
        }




        const config: CallAgentConfig = {
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken,
          twilioFromNumber: fromNumber,
          toNumber: phoneNumber,
          elevenLabsApiKey: useElevenLabs ? (elevenLabsApiKey || '') : '',
          elevenLabsAgentId: useElevenLabs ? elevenLabsAgentId : undefined,
          elevenLabsPrompt: useElevenLabs ? elevenLabsPrompt : undefined,
          elevenLabsVoiceId: useElevenLabs ? voiceId : undefined,
          timeout: 30,
          maxDuration: 300,
          recordCall: true,
          executionMode: 'async'
        };


        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL ||
          process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
          'localhost:3000';


        const result = await initiateOutboundCall(config, webhookBaseUrl);
        const { callSid, from, to, startTime, metadata } = result;


        if (metadata?.callType) {
          actualCallType = metadata.callType;
        }
        

        if (metadata?.elevenLabsFallback) {
          actualCallType = 'direct';
        }


        const savedCall = await callLogsService.upsertCallLog({
          companyId: req.user?.companyId || 0,
          channelId: channelConnection.id,
          contactId: contact.id,
          conversationId: conversationId,
          flowId: null,
          nodeId: null,
          direction: 'outbound',
          status: 'initiated',
          from: from,
          to: to,
          twilioCallSid: callSid,
          startedAt: startTime,
          agentConfig: elevenLabsAgentId ? {
            elevenLabsAgentId,
            elevenLabsPrompt,
            voiceId
          } : undefined,
          metadata: {
            ...metadata,
            hasElevenLabs: hasElevenLabs,
            callType: actualCallType,
            userSelectedCallType: !!callType,
            elevenLabsConversationId: result.metadata?.elevenLabsConversationId,
            conferenceName: result.metadata?.conferenceName
          }
        });


        CallLogsEventEmitter.emitCallStatusUpdate(
          savedCall.id,
          req.user?.companyId || 0,
          'initiated',
          { callSid, from, to }
        );

        const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;

        res.json({
          success: true,
          callSid: callSid,
          callId: savedCall.id,
          status: 'initiated',
          from: from,
          to: to,
          message: 'Call initiated successfully',
          conferenceName: result.metadata?.conferenceName,
          channelId: channelConnection.id,
          callType: actualCallType,
          contactName: contact.name,
          contactPhone: canViewPhone ? contact.phone : null,
          contactAvatar: contact.avatarUrl
        });

      } catch (error) {
        console.error('[Initiate Call]', error);


        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage?.includes('Invalid credentials') ||
          errorMessage?.includes('authentication')) {
          return res.status(400).json({ error: 'Invalid Twilio credentials' });
        }

        if (errorMessage?.includes('Twilio API')) {
          return res.status(500).json({ error: 'Twilio API error: ' + errorMessage });
        }


        res.status(500).json({ error: 'Failed to initiate call: ' + errorMessage });
      }
    }
  );

  /**
   * Generate Twilio Voice SDK Access Token
   * Used by the frontend to connect to Twilio Voice via WebRTC
   */
  app.get('/api/twilio/voice-token',
    ensureAuthenticated,
    requirePermission(PERMISSIONS.MANAGE_CALL_LOGS),
    async (req, res) => {
      try {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }


        const channelId = req.query.channelId ? parseInt(req.query.channelId as string) : null;
        
        if (!channelId) {
          return res.status(400).json({ 
            error: 'Channel ID is required for voice token generation',
            setup: {
              step1: 'Create API Key in Twilio Console > Account > API Keys',
              step2: 'Create TwiML App in Twilio Console > Voice > TwiML Apps',
              step3: 'Set Voice Request URL to: https://your-domain.com/api/twilio/voice-app-twiml',
              step4: 'Add API Key, API Secret, and TwiML App SID to channel connection settings'
            },
            documentation: 'https://www.twilio.com/docs/voice/sdks/javascript/get-started'
          });
        }


        const channelConnection = await storage.getChannelConnection(channelId);
        if (!channelConnection) {
          return res.status(404).json({ error: 'Channel connection not found' });
        }
        if (channelConnection.companyId !== user.companyId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (channelConnection.channelType !== 'twilio_voice') {
          return res.status(400).json({ error: 'Not a Twilio Voice channel' });
        }

        const connectionData = channelConnection.connectionData as any;
        const accountSid = connectionData?.accountSid;
        const apiKey = connectionData?.apiKey;
        const apiSecret = connectionData?.apiSecret;
        const twimlAppSid = connectionData?.twimlAppSid;


        if (!accountSid || !apiKey || !apiSecret) {
          return res.status(400).json({ 
            error: 'Twilio Voice SDK credentials not configured in channel connection',
            setup: {
              step1: 'Create API Key in Twilio Console > Account > API Keys',
              step2: 'Create TwiML App in Twilio Console > Voice > TwiML Apps',
              step3: 'Set Voice Request URL to: https://your-domain.com/api/twilio/voice-app-twiml',
              step4: 'Add API Key, API Secret, and TwiML App SID to channel connection settings'
            },
            documentation: 'https://www.twilio.com/docs/voice/sdks/javascript/get-started'
          });
        }


        if (!twimlAppSid) {
          return res.status(400).json({ 
            error: 'TwiML Application SID not configured in channel connection',
            setup: {
              step1: 'Create TwiML App in Twilio Console > Voice > TwiML Apps',
              step2: 'Set Voice Request URL to: https://your-domain.com/api/twilio/voice-app-twiml',
              step3: 'Add TwiML App SID to channel connection settings'
            },
            documentation: 'https://www.twilio.com/docs/voice/sdks/javascript/get-started'
          });
        }


        const twilioModule = await import('twilio');
        const twilio = twilioModule.default || twilioModule;
        const AccessToken = twilio.jwt?.AccessToken;
        

        if (!AccessToken) {
          return res.status(500).json({ 
            error: 'Failed to load Twilio AccessToken - Twilio module structure is invalid',
            details: 'The Twilio JWT AccessToken class could not be found. This may indicate a module compatibility issue.'
          });
        }
        
        const VoiceGrant = AccessToken.VoiceGrant;


        const identity = `agent-${user.id}-${user.companyId}`;


        const voiceGrant = new VoiceGrant({
          outgoingApplicationSid: twimlAppSid,
          incomingAllow: true
        });


        const token = new AccessToken(
          accountSid,
          apiKey,
          apiSecret,
          { identity, ttl: 3600 } // 1 hour TTL
        );
        token.addGrant(voiceGrant);



        res.json({
          token: token.toJwt(),
          identity
        });

      } catch (error) {
        console.error('[Twilio Voice Token] Error:', error);
        res.status(500).json({ 
          error: 'Failed to generate voice token',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * Voice SDK Setup Validation Endpoint
   * Validates Twilio Voice SDK configuration for a channel connection
   */
  app.post('/api/twilio/voice-setup/validate',
    ensureAuthenticated,
    requirePermission(PERMISSIONS.MANAGE_CALL_LOGS),
    async (req, res) => {
      try {
        const user = req.user;
        if (!user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const { channelId } = req.body;
        if (!channelId) {
          return res.status(400).json({ error: 'Channel ID is required' });
        }


        let channelConnection;
        try {
          channelConnection = await storage.getChannelConnection(channelId);
        } catch (error) {
          console.error('[Voice SDK Setup Validation] Database error:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch channel connection',
            details: error instanceof Error ? error.message : 'Database error',
            validationResults: {
              overallStatus: 'error',
              message: 'Could not access channel connection data'
            }
          });
        }

        if (!channelConnection) {
          return res.status(404).json({ error: 'Channel connection not found' });
        }
        if (channelConnection.companyId !== user.companyId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (channelConnection.channelType !== 'twilio_voice') {
          return res.status(400).json({ error: 'Not a Twilio Voice channel' });
        }

        const connectionData = channelConnection.connectionData as any;
        const accountSid = connectionData?.accountSid;
        const authToken = connectionData?.authToken;
        const apiKey = connectionData?.apiKey;
        const apiSecret = connectionData?.apiSecret;
        const twimlAppSid = connectionData?.twimlAppSid;
        const fromNumber = connectionData?.fromNumber;

        const validationResults: any = {
          channelId,
          timestamp: new Date().toISOString(),
          checks: {}
        };


        validationResults.checks.restApiCredentials = {
          status: 'unknown',
          message: ''
        };
        if (accountSid && authToken) {
          try {
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
              headers: {
                'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
              },
              signal: AbortSignal.timeout(5000)
            });
            validationResults.checks.restApiCredentials.status = response.ok ? 'valid' : 'invalid';
            validationResults.checks.restApiCredentials.message = response.ok 
              ? 'REST API credentials are valid'
              : 'REST API credentials are invalid';
          } catch (error) {
            validationResults.checks.restApiCredentials.status = 'error';
            validationResults.checks.restApiCredentials.message = 'Failed to validate REST API credentials';
          }
        } else {
          validationResults.checks.restApiCredentials.status = 'missing';
          validationResults.checks.restApiCredentials.message = 'REST API credentials not configured';
        }


        validationResults.checks.voiceSDKCredentials = {
          status: 'unknown',
          message: ''
        };
        if (apiKey && apiSecret && accountSid) {
          try {

            const twilioModule = await import('twilio');
            const twilio = twilioModule.default || twilioModule;
            const AccessToken = twilio.jwt?.AccessToken;
            

            if (!AccessToken) {
              validationResults.checks.voiceSDKCredentials.status = 'error';
              validationResults.checks.voiceSDKCredentials.message = 'Failed to load Twilio AccessToken - Twilio module structure is invalid';
            } else {
              const VoiceGrant = AccessToken.VoiceGrant;
              
              const voiceGrant = new VoiceGrant({
                outgoingApplicationSid: twimlAppSid || 'test',
                incomingAllow: true
              });
              
              const token = new AccessToken(
                accountSid,
                apiKey,
                apiSecret,
                { identity: 'validation-test', ttl: 60 }
              );
              token.addGrant(voiceGrant);
              
              const jwt = token.toJwt();
              validationResults.checks.voiceSDKCredentials.status = jwt && jwt.length > 0 ? 'valid' : 'invalid';
              validationResults.checks.voiceSDKCredentials.message = jwt && jwt.length > 0
                ? 'Voice SDK credentials can generate valid tokens'
                : 'Failed to generate Voice SDK token';
            }
          } catch (error) {
            validationResults.checks.voiceSDKCredentials.status = 'error';
            validationResults.checks.voiceSDKCredentials.message = error instanceof Error ? error.message : 'Voice SDK credential validation failed';
          }
        } else {
          validationResults.checks.voiceSDKCredentials.status = 'missing';
          validationResults.checks.voiceSDKCredentials.message = 'Voice SDK credentials (API Key, API Secret) not configured';
        }


        validationResults.checks.twimlApp = {
          status: 'unknown',
          message: ''
        };
        if (twimlAppSid && accountSid && authToken) {
          try {
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`, {
              headers: {
                'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
              },
              signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
              const appData = await response.json();
              validationResults.checks.twimlApp.status = 'valid';
              validationResults.checks.twimlApp.message = 'TwiML App exists and is accessible';
              validationResults.checks.twimlApp.voiceUrl = appData.voice_url;
              

              const protocol = req.protocol || (req.get('x-forwarded-proto') || 'https');
              const host = req.get('host') || req.get('x-forwarded-host');
              const actualServerUrl = host ? `${protocol}://${host}` : (process.env.PUBLIC_URL || process.env.WEBHOOK_BASE_URL || 'https://your-domain.com');
              const expectedVoiceUrl = `${actualServerUrl}/api/twilio/voice-app-twiml`;
              

              const configuredUrl = appData.voice_url || '';
              const normalizedConfigured = configuredUrl.replace(/\/$/, '');
              const normalizedExpected = expectedVoiceUrl.replace(/\/$/, '');
              const urlsMatch = normalizedConfigured === normalizedExpected;
              
              validationResults.checks.twimlApp.voiceUrlConfigured = urlsMatch;
              validationResults.checks.twimlApp.configuredVoiceUrl = configuredUrl;
              validationResults.checks.twimlApp.expectedVoiceUrl = expectedVoiceUrl;
              

              if (configuredUrl && !configuredUrl.startsWith('https://')) {
                validationResults.checks.twimlApp.warning = 'Voice URL should use HTTPS in production';
              }
              

              if (!urlsMatch) {
                validationResults.checks.twimlApp.message = `TwiML App Voice URL mismatch. Expected: ${expectedVoiceUrl}, Got: ${configuredUrl}`;
              } else {
                validationResults.checks.twimlApp.message = 'TwiML App Voice URL is correctly configured';
              }
            } else {
              validationResults.checks.twimlApp.status = 'invalid';
              validationResults.checks.twimlApp.message = 'TwiML App SID not found or not accessible';
            }
          } catch (error) {
            validationResults.checks.twimlApp.status = 'error';
            validationResults.checks.twimlApp.message = 'Failed to validate TwiML App';
          }
        } else {
          validationResults.checks.twimlApp.status = 'missing';
          validationResults.checks.twimlApp.message = 'TwiML App SID not configured';
        }


        validationResults.checks.accountBalance = {
          status: 'unknown',
          message: ''
        };
        if (accountSid && authToken) {
          try {
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
              headers: {
                'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
              },
              signal: AbortSignal.timeout(3000)
            });
            if (response.ok) {
              const accountData = await response.json();
              validationResults.checks.accountBalance.status = 'checked';
              validationResults.checks.accountBalance.balance = accountData.balance;
              validationResults.checks.accountBalance.currency = accountData.currency;
              validationResults.checks.accountBalance.message = accountData.balance && parseFloat(accountData.balance) > 0
                ? 'Account has sufficient balance'
                : 'Account balance is low or zero';
            }
          } catch (error) {
            validationResults.checks.accountBalance.status = 'error';
            validationResults.checks.accountBalance.message = 'Could not check account balance';
          }
        }


        validationResults.checks.phoneNumber = {
          status: fromNumber ? 'configured' : 'missing',
          message: fromNumber ? 'Phone number is configured' : 'Phone number not configured',
          fromNumber: fromNumber || null
        };


        const allChecks = Object.values(validationResults.checks);
        const criticalChecks = ['restApiCredentials', 'voiceSDKCredentials', 'twimlApp'];
        const criticalStatuses = criticalChecks.map(key => validationResults.checks[key]?.status);
        
        if (criticalStatuses.every(s => s === 'valid')) {
          validationResults.overallStatus = 'valid';
          validationResults.message = 'All critical checks passed';
        } else if (criticalStatuses.some(s => s === 'error' || s === 'invalid')) {
          validationResults.overallStatus = 'invalid';
          validationResults.message = 'Some critical checks failed';
        } else {
          validationResults.overallStatus = 'incomplete';
          validationResults.message = 'Configuration is incomplete';
        }


        validationResults.setup = {
          step1: 'Create API Key in Twilio Console > Account > API Keys',
          step2: 'Create TwiML App in Twilio Console > Voice > TwiML Apps',
          step3: `Set Voice Request URL to: ${process.env.PUBLIC_URL || process.env.WEBHOOK_BASE_URL || 'https://your-domain.com'}/api/twilio/voice-app-twiml`,
          step4: 'Add API Key, API Secret, and TwiML App SID to channel connection settings',
          documentation: 'https://www.twilio.com/docs/voice/sdks/javascript/get-started'
        };

        res.json(validationResults);

      } catch (error) {
        console.error('[Voice SDK Setup Validation] Error:', error);
        res.status(500).json({ 
          error: 'Failed to validate Voice SDK setup',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * TwiML Application endpoint for Twilio Voice SDK
   * Returns TwiML to connect the agent to a conference
   * Validates requests using Twilio signature verification (no session auth required)
   */
  app.post('/api/twilio/voice-app-twiml',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const { conferenceName } = req.body;
        const signature = req.headers['x-twilio-signature'] as string | undefined;
        
        if (!conferenceName) {
          console.error('[Voice App TwiML] Missing conferenceName parameter');
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
          );
        }


        const { callLogsService } = await import('./services/call-logs-service');
        const { callAgentService } = await import('./services/call-agent-service');
        const calls = await callLogsService.getCallLogsByConferenceName(conferenceName);
        
        if (!calls || calls.length === 0) {
          console.warn(`[Voice App TwiML] No call log found for conference: ${conferenceName}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
          );
        }


        const call = calls[0];
        

        let authToken: string | undefined;
        if (call.channelId) {
          const connection = await storage.getChannelConnection(call.channelId);
          if (connection && connection.connectionData) {
            const connectionData = connection.connectionData as any;
            authToken = connectionData.authToken;
          }
        }

        if (!authToken) {
          console.error(`[Voice App TwiML] No channel connection or auth token found for conference: ${conferenceName}`);
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
          );
        }


        if (signature) {
          const protocol = req.get('x-forwarded-proto') || req.protocol;
          const host = req.get('x-forwarded-host') || req.get('host');
          const fullUrl = `${protocol}://${host}${req.originalUrl}`;
          
          const isValid = callAgentService.verifyTwilioCallSignature(
            fullUrl,
            req.body as Record<string, string>,
            signature,
            authToken
          );
          
          if (!isValid) {
            console.error('[Voice App TwiML] Invalid Twilio signature');
            return res.type('text/xml').send(
              '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
            );
          }
        } else {
          console.warn('[Voice App TwiML] Missing X-Twilio-Signature header');
          return res.type('text/xml').send(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
          );
        }





        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference 
      startConferenceOnEnter="false" 
      endConferenceOnExit="true"
      beep="false"
      muted="false"
      waitUrl=""
      waitMethod="GET"
      statusCallbackEvent="start end join leave">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`;

        res.type('text/xml');
        res.send(twiml);

      } catch (error) {
        console.error('[Voice App TwiML] Error:', error);
        res.type('text/xml').send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
        );
      }
    }
  );

  /**
   * GET version of TwiML Application endpoint (for Twilio webhook verification)
   */
  app.get('/api/twilio/voice-app-twiml', (req, res) => {
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This endpoint is for Twilio Voice SDK connections.</Say>
</Response>`);
  });


  app.get('/api/admin/companies/:id/users', ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: 'Invalid company ID' });
      }

      const users = await storage.getUsersByCompany(companyId);
      res.json(users);
    } catch (error) {
      console.error('Error fetching company users:', error);
      res.status(500).json({ error: 'Failed to fetch company users' });
    }
  });

  app.patch('/api/users/me', ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { fullName, email, username, avatarUrl, languagePreference } = req.body;
      const updates: any = {};

      if (fullName) updates.fullName = fullName;
      if (email) updates.email = email;
      if (username) {
        const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ message: 'Username already taken' });
        }
        updates.username = username;
      }
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (languagePreference) updates.languagePreference = languagePreference;

      const updatedUser = await storage.updateUser(userId, updates);

      if (req.session && (req.session as any)['passport']) {
        (req.session as any).passport.user = updatedUser.id;
      }

      res.json(updatedUser);
    } catch (error: any) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ message: error.message || 'Error updating profile' });
    }
  });

  app.post('/api/users/change-password', ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { currentPassword, newPassword } = req.body;


      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' });
      }


      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters long' });
      }


      if (currentPassword === newPassword) {
        return res.status(400).json({ message: 'New password must be different from current password' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }


      const isPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }


      const success = await storage.updateUserPassword(userId, newPassword, false);

      if (!success) {
        console.error(`Failed to update password for user ${userId}`);
        return res.status(500).json({ message: 'Failed to update password. Please try again.' });
      }


      res.json({ message: 'Password updated successfully' });
    } catch (error: any) {
      console.error('Error changing password:', error);
      res.status(500).json({ message: error.message || 'Error changing password' });
    }
  });




  app.get('/api/users/me/notifications', ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }


      const defaultSettings = {
        emailNotifications: true,
        pushNotifications: false,
        marketingEmails: false,
        securityAlerts: true,
      };

      res.json(defaultSettings);
    } catch (error: any) {
      console.error('Error fetching notification settings:', error);
      res.status(500).json({ message: error.message || 'Error fetching notification settings' });
    }
  });

  app.patch('/api/users/me/notifications', ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { emailNotifications, pushNotifications, marketingEmails, securityAlerts } = req.body;




      res.json({
        message: 'Notification settings updated successfully',
        settings: {
          emailNotifications,
          pushNotifications,
          marketingEmails,
          securityAlerts,
        }
      });
    } catch (error: any) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({ message: error.message || 'Error updating notification settings' });
    }
  });


  app.put('/api/user/language', ensureAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { languageCode } = req.body;
      if (!languageCode) {
        return res.status(400).json({ message: 'Language code is required' });
      }

      const updatedUser = await storage.updateUser(userId, {
        languagePreference: languageCode
      });

      res.json({
        message: 'Language preference updated successfully',
        user: updatedUser
      });
    } catch (error: any) {
      console.error('Error updating language preference:', error);
      res.status(500).json({ message: error.message || 'Error updating language preference' });
    }
  });

  const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  fsExtra.ensureDirSync(UPLOAD_DIR);

  const BRANDING_DIR = path.join(UPLOAD_DIR, 'branding');
  fsExtra.ensureDirSync(BRANDING_DIR);

  const FLOW_MEDIA_DIR = path.join(UPLOAD_DIR, 'flow-media');
  fsExtra.ensureDirSync(FLOW_MEDIA_DIR);

  const EMAIL_MEDIA_DIR = path.join(UPLOAD_DIR, 'email-attachments');
  fsExtra.ensureDirSync(EMAIL_MEDIA_DIR);



  const flowMediaStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, FLOW_MEDIA_DIR)
    },
    filename: function (req, file, cb) {
      const uniqueId = crypto.randomBytes(16).toString('hex');
      const fileExt = path.extname(file.originalname);
      cb(null, `${uniqueId}${fileExt}`);
    }
  });

  const createSecureUpload = (options: {
    maxFileSize?: number,
    allowedMimeTypes?: string[],
    allowedExtensions?: string[],
    destination?: string
  } = {}) => {
    const {
      maxFileSize = 10 * 1024 * 1024,
      allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/webm', 'video/quicktime', 'video/avi',
        'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/webm', 'audio/aac', 'audio/mp4',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed'
      ],
      allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
        '.mp4', '.webm', '.mov', '.avi',
        '.mp3', '.wav', '.ogg',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.txt', '.csv', '.zip'
      ],
      destination = UPLOAD_DIR
    } = options;

    return multer({
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, destination);
        },
        filename: function (req, file, cb) {
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const fileExt = path.extname(file.originalname).toLowerCase();
          const timestamp = Date.now();
          cb(null, `${timestamp}-${uniqueId}${fileExt}`);
        }
      }),
      limits: {
        fileSize: maxFileSize,
        files: 5,
        fields: 10,
        fieldNameSize: 100,
        fieldSize: 1024 * 1024
      },
      fileFilter: function (req, file, cb) {


        const fileExt = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(fileExt)) {

          return cb(new Error(`File type not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`));
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {

          return cb(new Error(`File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`));
        }

        const filename = file.originalname.toLowerCase();

        const dangerousPatterns = [
          /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.com$/i, /\.pif$/i, /\.scr$/i,
          /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.php$/i, /\.asp$/i, /\.jsp$/i
        ];

        if (dangerousPatterns.some(pattern => pattern.test(filename))) {

          return cb(new Error('File type not allowed for security reasons'));
        }

        cb(null, true);
      }
    });
  };

  const upload = createSecureUpload();




  const WEBCHAT_UPLOAD_DIR = path.join(UPLOAD_DIR, 'webchat');
  fsExtra.ensureDirSync(WEBCHAT_UPLOAD_DIR);
  const webchatUpload = createSecureUpload({ destination: WEBCHAT_UPLOAD_DIR });



  const validateWebchatUploadToken = async (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.body;
    if (!token) {

      if (req.file) {
        try {
          await fsExtra.remove(req.file.path);
        } catch (e) {

        }
      }
      return res.status(400).json({ error: 'Token is required' });
    }
    const connection = await webchatService.verifyWidgetToken(token);
    if (!connection) {

      if (req.file) {
        try {
          await fsExtra.remove(req.file.path);
        } catch (e) {

        }
      }
      return res.status(401).json({ error: 'Invalid token' });
    }

    (req as any).webchatConnection = connection;
    next();
  };

  app.post('/api/webchat/upload', webchatUpload.single('file'), validateWebchatUploadToken, async (req: Request, res: Response) => {
    try {
      const { token, sessionId, caption } = req.body;
      const connection = (req as any).webchatConnection;
      if (!connection) return res.status(401).json({ error: 'Invalid token' });

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const mediaUrl = `/uploads/webchat/${req.file.filename}`;
      const isImage = req.file.mimetype.startsWith('image/');
      const isVideo = req.file.mimetype.startsWith('video/');


      const content = caption || '';

      const saved: any = await webchatService.processWebhook({
        token,
        eventType: 'message',
        data: {
          sessionId,
          message: content,
          messageType: isImage ? 'image' : isVideo ? 'video' : 'document',
          mediaUrl
        }
      }, connection.companyId);


      if (connection.companyId && req.file) {
        dataUsageTracker.trackFileUpload(connection.companyId, req.file.size).catch(err => {
          console.error('Failed to track webchat upload:', err);
        });
      }

      res.json({ success: true, mediaUrl, message: saved });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to upload file' });
    }
  });


  app.get('/api/webchat/widget.html', async (req: Request, res: Response) => {
    try {
      const widgetPath = path.join(getWidgetsBasePath(), 'webchat-widget.html');
      if (await fsExtra.pathExists(widgetPath)) {
        res.sendFile(widgetPath);
      } else {
        res.status(404).send('Widget HTML not found');
      }
    } catch (e) {
      res.status(500).send('Error loading widget HTML');
    }
  });


  app.get('/api/webchat/widget.css', async (req: Request, res: Response) => {
    logger.warn('webchat', 'DEPRECATED: /api/webchat/widget.css endpoint is deprecated. Use /public/webchat/widget.css for better caching/CDN support. This endpoint will be removed in a future release.');
    try {
      const cssPath = path.join(getWidgetsBasePath(), 'webchat-widget.css');
      if (await fsExtra.pathExists(cssPath)) {
        res.setHeader('Content-Type', 'text/css');
        res.sendFile(cssPath);
      } else {
        res.status(404).send('Widget CSS not found');
      }
    } catch (e) {
      res.status(500).send('Error loading widget CSS');
    }
  });

  app.post('/api/users/me/avatar', ensureAuthenticated, upload.single('avatar'), async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }


      const avatarUrl = `/uploads/${req.file.filename}`;


      const userBeforeUpdate = req.user;
      let previousAvatarSize = 0;


      if (userBeforeUpdate?.avatarUrl && userBeforeUpdate.avatarUrl.startsWith('/uploads/')) {
        try {
          const previousAvatarPath = path.join(process.cwd(), userBeforeUpdate.avatarUrl.substring(1));
          if (await fsExtra.pathExists(previousAvatarPath)) {
            const stats = await fsExtra.stat(previousAvatarPath);
            previousAvatarSize = stats.size;
          }
        } catch (error) {

        }
      }

      const updatedUser = await storage.updateUser(userId, { avatarUrl });


      if (userBeforeUpdate?.companyId && req.file) {

        dataUsageTracker.trackFileUpload(userBeforeUpdate.companyId, req.file.size).catch(err => {
          console.error('Failed to track avatar upload:', err);
        });


        if (previousAvatarSize > 0) {
          dataUsageTracker.trackFileDelete(userBeforeUpdate.companyId, previousAvatarSize).catch(err => {
            console.error('Failed to track avatar deletion:', err);
          });
        }
      }

      res.json({
        message: 'Avatar updated successfully',
        avatarUrl,
        user: updatedUser
      });
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      res.status(500).json({ message: error.message || 'Error uploading avatar' });
    }
  });

  app.post('/api/messages/:id/download-media', ensureAuthenticated, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      if (isNaN(messageId)) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }

      const message = await db.query.messages.findFirst({
        where: eq(messages.id, messageId)
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (message.mediaUrl) {
        const mediaPath = path.join(process.cwd(), 'public', message.mediaUrl.substring(1));
        if (await fsExtra.pathExists(mediaPath)) {

          const fetchedAt = Date.now();
          res.setHeader('X-Media-Fetched-At', fetchedAt.toString());
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.status(200).json({
            mediaUrl: message.mediaUrl,
            fetchedAt,
            cacheHint: 'local'
          });
        }
      }

      if (!message.metadata) {
        const simulatedMediaUrl = `/media/placeholder-${message.type || 'image'}.svg`;

        await db.update(messages)
          .set({ mediaUrl: simulatedMediaUrl })
          .where(eq(messages.id, messageId));

        const fetchedAt = Date.now();
        return res.status(200).json({
          mediaUrl: simulatedMediaUrl,
          simulated: true,
          fetchedAt
        });
      }

      let metadata;
      try {
        metadata = typeof message.metadata === 'string'
          ? JSON.parse(message.metadata)
          : message.metadata;
      } catch (error) {
        console.error('Error parsing message metadata:', error);

        const simulatedMediaUrl = `/media/placeholder-${message.type || 'image'}.svg`;

        await db.update(messages)
          .set({ mediaUrl: simulatedMediaUrl })
          .where(eq(messages.id, messageId));

        const fetchedAt = Date.now();
        return res.status(200).json({
          mediaUrl: simulatedMediaUrl,
          simulated: true,
          fetchedAt
        });
      }


      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, message.conversationId)
      });

      if (!conversation || !conversation.channelId) {
        return res.status(400).json({ error: 'Conversation not found or has no channel ID' });
      }



      if (conversation.channelType === 'whatsapp_official') {


        const connection = await storage.getChannelConnection(conversation.channelId);
        if (!connection) {
          console.error('❌ [DOWNLOAD MEDIA] Connection not found:', {
            channelId: conversation.channelId
          });
          return res.status(400).json({ error: 'WhatsApp connection not found' });
        }


        if (!metadata.mediaId) {
          console.error('❌ [DOWNLOAD MEDIA] No mediaId in metadata:', {
            messageId,
            metadataKeys: Object.keys(metadata)
          });
          return res.status(400).json({ error: 'Media ID not found in message metadata' });
        }


        const connectionData = connection.connectionData as any;
        const accessToken = connection.accessToken || connectionData?.accessToken;

        if (!accessToken) {
          console.error('❌ [DOWNLOAD MEDIA] Access token not found:', {
            connectionId: connection.id,
            hasConnectionAccessToken: !!connection.accessToken,
            hasConnectionDataAccessToken: !!connectionData?.accessToken,
            isEmbeddedSignup: !!connectionData?.partnerManaged
          });
          return res.status(400).json({ error: 'WhatsApp access token not available' });
        }



        const mediaUrl = await downloadWhatsAppOfficialMedia(
          metadata.mediaId,
          accessToken,
          message.type || 'image'
        );

        if (!mediaUrl) {
          console.error('❌ [DOWNLOAD MEDIA] Failed to download media:', {
            messageId,
            mediaId: metadata.mediaId
          });
          return res.status(202).json({
            error: 'Media download failed',
            message: 'The media file could not be downloaded from WhatsApp servers. This may be due to expired media or network issues.',
            canRetry: true,
            mediaType: message.type || 'unknown'
          });
        }




        await db.update(messages)
          .set({ mediaUrl })
          .where(eq(messages.id, messageId));

        const fetchedAt = Date.now();
        res.setHeader('X-Media-Fetched-At', fetchedAt.toString());
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return res.status(200).json({
          mediaUrl,
          fetchedAt,
          cacheHint: 'external'
        });
      }


      if (conversation.channelType === 'instagram' || conversation.channelType === 'messenger') {


        
        if (!message.mediaUrl || !message.mediaUrl.includes('lookaside.fbsbx.com')) {
          return res.status(400).json({ error: 'Instagram media URL not found or invalid' });
        }


        const connection = await storage.getChannelConnection(conversation.channelId);
        if (!connection) {
          return res.status(400).json({ error: 'Instagram connection not found' });
        }


        const instagramService = await import('./services/channels/instagram');
        const downloadedMediaUrl = await instagramService.downloadInstagramMedia(
          message.mediaUrl,
          connection.accessToken || '',
          message.type || 'image',
          messageId
        );

        if (!downloadedMediaUrl) {
          return res.status(404).json({ error: 'Failed to download Instagram media' });
        }


        await db.update(messages)
          .set({ mediaUrl: downloadedMediaUrl })
          .where(eq(messages.id, messageId));

        const fetchedAt = Date.now();
        res.setHeader('X-Media-Fetched-At', fetchedAt.toString());
        res.setHeader('Cache-Control', 'public, max-age=86400');

        return res.status(200).json({
          mediaUrl: downloadedMediaUrl,
          fetchedAt,
          cacheHint: 'local'
        });
      }


      const waMessage = metadata.waMessage ||
        metadata.message ||
        (metadata.messageData && metadata.messageData.message);

      if (!waMessage) {


        const simulatedMediaUrl = `/media/placeholder-${message.type || 'image'}.svg`;

        await db.update(messages)
          .set({ mediaUrl: simulatedMediaUrl })
          .where(eq(messages.id, messageId));

        const fetchedAt = Date.now();
        return res.status(200).json({
          mediaUrl: simulatedMediaUrl,
          simulated: true,
          fetchedAt
        });
      }

      if (conversation.channelType !== 'whatsapp' && conversation.channelType !== 'whatsapp_unofficial') {
        return res.status(400).json({ error: 'Media download only supported for WhatsApp channels' });
      }

      const sock = getWhatsAppConnection(conversation.channelId);

      if (!sock) {
        return res.status(400).json({ error: 'WhatsApp connection not active' });
      }

      const messageObj = metadata.waMessage ||
        metadata.message ||
        (metadata.messageData && metadata.messageData.message);

      const mediaUrl = await downloadAndSaveMedia(messageObj, sock, conversation.channelId);

      if (!mediaUrl) {

        return res.status(202).json({
          error: 'Media download failed',
          message: 'The media file could not be downloaded at this time. This may be due to missing media keys or network issues.',
          canRetry: true,
          mediaType: message.type || 'unknown'
        });
      }

      await db.update(messages)
        .set({ mediaUrl })
        .where(eq(messages.id, messageId));




      const fetchedAt = Date.now();
      res.setHeader('X-Media-Fetched-At', fetchedAt.toString());
      res.setHeader('Cache-Control', 'public, max-age=86400');

      return res.status(200).json({
        mediaUrl,
        fetchedAt,
        cacheHint: 'external'
      });
    } catch (error) {
      console.error('Error downloading media:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/messages/:id/stream-media', ensureAuthenticated, async (req, res) => {
    try {
      const messageId = parseInt(req.params.id);
      if (isNaN(messageId)) {
        return res.status(400).json({ error: 'Invalid message ID' });
      }

      const message = await db.query.messages.findFirst({
        where: eq(messages.id, messageId)
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      if (message.mediaUrl) {
        const mediaPath = path.join(process.cwd(), 'public', message.mediaUrl.substring(1));
        if (await fsExtra.pathExists(mediaPath)) {
          const stats = await fsExtra.stat(mediaPath);
          const filename = generateDownloadFilename(message, message.mediaUrl);


          const conversation = await db.query.conversations.findFirst({
            where: eq(conversations.id, message.conversationId)
          });


          if (conversation?.companyId) {
            dataUsageTracker.trackBandwidthUsage(conversation.companyId, stats.size).catch(err => {
              console.error('Failed to track bandwidth usage:', err);
            });
          }

          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.setHeader('Content-Length', stats.size);
          res.setHeader('Content-Type', getContentType(message.type || 'document', message.mediaUrl || ''));

          const fileStream = fs.createReadStream(mediaPath);
          fileStream.pipe(res);
          return;
        }
      }

      if (!message.metadata) {
        return res.status(404).json({ error: 'Media not available' });
      }

      let metadata;
      try {
        metadata = typeof message.metadata === 'string'
          ? JSON.parse(message.metadata)
          : message.metadata;
      } catch (error) {
        return res.status(400).json({ error: 'Invalid message metadata' });
      }

      const waMessage = metadata.waMessage ||
        metadata.message ||
        (metadata.messageData && metadata.messageData.message);

      if (!waMessage) {
        return res.status(404).json({ error: 'WhatsApp message data not found' });
      }

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, message.conversationId)
      });

      if (!conversation || !conversation.channelId) {
        return res.status(400).json({ error: 'Conversation not found or has no channel ID' });
      }


      if (conversation.channelType === 'whatsapp_official') {


        const connection = await storage.getChannelConnection(conversation.channelId);

        if (!connection) {
          return res.status(400).json({ error: 'WhatsApp connection not found' });
        }


        if (!metadata.mediaId) {
          return res.status(400).json({ error: 'Media ID not found in message metadata' });
        }


        const connectionData = connection.connectionData as any;
        const accessToken = connection.accessToken || connectionData?.accessToken;

        if (!accessToken) {
          return res.status(400).json({ error: 'WhatsApp access token not available' });
        }


        const mediaUrl = await downloadWhatsAppOfficialMedia(
          metadata.mediaId,
          accessToken,
          message.type || 'image'
        );

        if (!mediaUrl) {
          return res.status(404).json({ error: 'Failed to download media from WhatsApp servers' });
        }


        await db.update(messages)
          .set({ mediaUrl })
          .where(eq(messages.id, messageId));


        const mediaPath = path.join(process.cwd(), 'public', mediaUrl.substring(1));
        const stats = await fsExtra.stat(mediaPath);
        const filename = generateDownloadFilename(message, mediaUrl);


        if (conversation?.companyId) {
          dataUsageTracker.trackBandwidthUsage(conversation.companyId, stats.size).catch(err => {
            console.error('Failed to track bandwidth usage:', err);
          });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Type', getContentType(message.type || 'document', mediaUrl || ''));

        const fileStream = fs.createReadStream(mediaPath);
        fileStream.pipe(res);
        return;
      }

      if (conversation.channelType !== 'whatsapp' && conversation.channelType !== 'whatsapp_unofficial') {
        return res.status(400).json({ error: 'Media download only supported for WhatsApp channels' });
      }

      const sock = getWhatsAppConnection(conversation.channelId);
      if (!sock) {
        return res.status(400).json({ error: 'WhatsApp connection not active' });
      }

      const mediaUrl = await downloadAndSaveMedia(waMessage, sock, conversation.channelId);

      if (!mediaUrl) {
        return res.status(404).json({ error: 'Failed to download media' });
      }

      await db.update(messages)
        .set({ mediaUrl })
        .where(eq(messages.id, messageId));

      const mediaPath = path.join(process.cwd(), 'public', mediaUrl.substring(1));
      const stats = await fsExtra.stat(mediaPath);
      const filename = generateDownloadFilename(message, mediaUrl);


      if (conversation?.companyId) {
        dataUsageTracker.trackBandwidthUsage(conversation.companyId, stats.size).catch(err => {
          console.error('Failed to track bandwidth usage:', err);
        });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', getContentType(message.type || 'document', mediaUrl || ''));

      const fileStream = fs.createReadStream(mediaPath);
      fileStream.pipe(res);

    } catch (error) {
      console.error('Error streaming media:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  function generateDownloadFilename(message: any, mediaUrl: string): string {
    const timestamp = new Date(message.createdAt).toISOString().slice(0, 10);
    const extension = getFileExtensionFromUrl(mediaUrl);

    let baseName = '';

    if (message.type === 'document' && message.content) {
      const content = message.content.trim();
      if (content && !content.includes('\n') && content.length < 100) {
        baseName = content.replace(/[^a-zA-Z0-9.-]/g, '_');
      }
    }

    if (!baseName) {
      const typeMap: Record<string, string> = {
        image: 'image',
        video: 'video',
        audio: 'audio',
        document: 'document',
        sticker: 'sticker'
      };
      baseName = `${typeMap[message.type] || 'media'}_${timestamp}`;
    }

    return `${baseName}${extension}`;
  }

  function getFileExtensionFromUrl(url: string): string {
    try {
      const pathname = new URL(url, 'http://localhost').pathname;
      const extension = path.extname(pathname);
      return extension || '';
    } catch {
      return '';
    }
  }

  function getContentType(messageType: string, mediaUrl: string): string {
    const extension = getFileExtensionFromUrl(mediaUrl).toLowerCase();

    const typeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.avi': 'video/avi',
      '.mov': 'video/quicktime',
      '.ogg': 'audio/ogg', // Best WhatsApp Android compatibility (Opus codec)
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };

    if (typeMap[extension]) {
      return typeMap[extension];
    }

    switch (messageType) {
      case 'image': return 'image/jpeg';
      case 'video': return 'video/mp4';
      case 'audio':

        if (mediaUrl.includes('_ogg_') || mediaUrl.includes('.ogg')) {
          return 'audio/ogg';
        } else if (mediaUrl.includes('_m4a_') || mediaUrl.includes('.m4a')) {
          return 'audio/mp4';
        }
        return 'audio/mpeg';
      case 'document': return 'application/octet-stream';
      default: return 'application/octet-stream';
    }
  }


  app.use('/uploads', (req, res, next) => {
    express.static(UPLOAD_DIR, {
      setHeaders: (res, path) => {
        if (path.includes('/branding/')) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    })(req, res, next);
  });



  app.get('/api/admin/tiktok/health', ensureAuthenticated, ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const stats = TikTokService.getHealthMonitoringStats();
      const connections = await storage.getChannelConnectionsByType('tiktok');
      const byStatus: Record<string, number> = {};
      let avgTokenAgeMs = 0;
      const upcomingExpirations: { connectionId: number; expiresAt: number; accountName: string }[] = [];
      const now = Date.now();
      const twelveHours = 12 * 60 * 60 * 1000;
      for (const c of connections) {
        byStatus[c.status || 'unknown'] = (byStatus[c.status || 'unknown'] ?? 0) + 1;
        const data = c.connectionData as { tokenExpiresAt?: number; accountName?: string } | undefined;
        if (data?.tokenExpiresAt) {
          avgTokenAgeMs += data.tokenExpiresAt - now;
          if (data.tokenExpiresAt < now + twelveHours) {
            upcomingExpirations.push({
              connectionId: c.id,
              expiresAt: data.tokenExpiresAt,
              accountName: data.accountName || c.accountName || ''
            });
          }
        }
      }
      if (connections.length > 0) avgTokenAgeMs /= connections.length;
      res.json({
        ...stats,
        connectionsByStatus: byStatus,
        averageTokenAgeMs: avgTokenAgeMs,
        upcomingTokenExpirations: upcomingExpirations.slice(0, 20),
        totalConnections: connections.length
      });
    } catch (error) {
      console.error('Error fetching TikTok health:', error);
      res.status(500).json({ error: 'Failed to fetch TikTok health' });
    }
  });

  app.post('/api/tiktok/refresh-connection/:connectionId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (connection.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (connection.channelType !== 'tiktok') {
        return res.status(400).json({ error: 'Not a TikTok connection' });
      }


      await TikTokService.ensureValidToken(connectionId);


      const updatedConnection = await storage.getChannelConnection(connectionId);

      res.json({
        success: true,
        message: 'Connection refreshed successfully',
        connection: updatedConnection
      });
    } catch (error) {
      console.error('Error refreshing TikTok connection:', error);
      res.status(500).json({ error: 'Failed to refresh connection' });
    }
  });


  app.get('/api/tiktok/connections/:connectionId/diagnostics', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      const data = connection.connectionData as Record<string, unknown> | undefined;
      const tokenExpiresAt = (data?.tokenExpiresAt as number) || 0;
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      let status: 'connected' | 'token_expiring' | 'disconnected' | 'error' = 'connected';
      if ((connection as any).status === 'error' || (connection as any).status === 'disconnected') status = (connection as any).status === 'error' ? 'error' : 'disconnected';
      else if (tokenExpiresAt > 0 && tokenExpiresAt - now < sevenDays) status = 'token_expiring';
      const grantedScopes = (data?.grantedScopes as string[]) || [];
      const requiredScopes = ['user.info.basic', 'im.chat', 'business.management'];
      const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s));
      let healthScore = 0;
      if (status === 'connected') healthScore += 40;
      else if (status === 'token_expiring') healthScore += 25;
      if (data?.lastSyncAt && (data.lastSyncAt as number) > now - 3600000) healthScore += 30;
      else if (data?.lastSyncAt) healthScore += 15;
      const errCount = (data?.errorCount as number) || 0;
      if (errCount === 0) healthScore += 20;
      else if (errCount < 5) healthScore += 10;
      healthScore += 10;
      const health = {
        connectionId,
        status,
        healthScore: Math.min(100, healthScore),
        tokenExpiresAt: new Date(tokenExpiresAt || now),
        lastSuccessfulCall: data?.lastSyncAt ? new Date(data.lastSyncAt as number) : null,
        errorCount: (data?.errorCount as number) || 0,
        lastError: (data?.lastError as string) || null,
        grantedScopes,
        missingScopes,
        regionRestrictions: {
          isRestricted: !!(data?.regionRestricted),
          region: (data?.regionCode as string) || 'Unknown',
          unavailableFeatures: (data?.restrictedFeatures as string[]) || []
        }
      };
      res.json({ health });
    } catch (error) {
      console.error('Error fetching TikTok diagnostics:', error);
      res.status(500).json({ error: 'Failed to fetch diagnostics' });
    }
  });

  app.get('/api/tiktok/connections/:connectionId/window-status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      const convs = await storage.getConversationsByChannel(connectionId);
      const windowStatuses = (convs || []).map((c: any) => {
        const meta = (c.groupMetadata || {}) as Record<string, unknown>;
        const expiresAt = (meta.messagingWindowExpiresAt as number) || null;
        const now = Date.now();
        const remaining = expiresAt != null ? Math.max(0, expiresAt - now) : null;
        let status: 'active' | 'expiring_soon' | 'expired' = 'active';
        if (meta.messagingWindowStatus === 'closed' || meta.messagingWindowStatus === 'expired') status = 'expired';
        else if (remaining != null && remaining < 2 * 60 * 60 * 1000) status = 'expiring_soon';
        return {
          conversationId: c.id,
          isOpen: status !== 'expired',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          lastInteractionAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
          status,
          remainingTime: remaining ?? 0
        };
      });
      res.json({ windowStatuses });
    } catch (error) {
      console.error('Error fetching TikTok window status:', error);
      res.status(500).json({ error: 'Failed to fetch window status' });
    }
  });

  app.post('/api/tiktok/connections/:connectionId/refresh-token', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      await TikTokService.ensureValidToken(connectionId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error refreshing TikTok token:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  });

  app.get('/api/tiktok/connections/:connectionId/capabilities', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      const data = connection.connectionData as Record<string, unknown> | undefined;
      const grantedScopes = (data?.grantedScopes as string[]) || [];
      const capabilities = {
        supportsReply: true,
        supportsDelete: false,
        supportsQuotedMessages: false,
        replyFormat: 'mention' as const,
        supportsTypingIndicator: false,
        supportsReadReceipts: false,
        supportsReactions: false,
        supportsRichMedia: true,
        supportedMediaTypes: ['text', 'image', 'video', 'sticker'],
        hasMessagingWindow: true,
        messagingWindowDuration: 48 * 60 * 60 * 1000,
        maxMessageLength: 2000,
        requiresBusinessAccount: true,
        grantedScopes
      };
      res.json({ capabilities });
    } catch (error) {
      console.error('Error fetching TikTok capabilities:', error);
      res.status(500).json({ error: 'Failed to fetch capabilities' });
    }
  });

  app.post('/api/tiktok/connections/:connectionId/verify-account', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      const data = connection.connectionData as Record<string, unknown> | undefined;
      const isBusinessAccount = !!(data?.isBusinessAccount);
      res.json({ isBusinessAccount, verified: isBusinessAccount });
    } catch (error) {
      console.error('Error verifying TikTok account:', error);
      res.status(500).json({ error: 'Failed to verify account' });
    }
  });

  app.get('/api/tiktok/connections/:connectionId/region-info', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'tiktok') {
        return res.status(404).json({ error: 'Connection not found' });
      }
      const data = connection.connectionData as Record<string, unknown> | undefined;
      res.json({
        regionCode: data?.regionCode ?? null,
        isRestricted: !!(data?.regionRestricted),
        unavailableFeatures: (data?.restrictedFeatures as string[]) || []
      });
    } catch (error) {
      console.error('Error fetching TikTok region info:', error);
      res.status(500).json({ error: 'Failed to fetch region info' });
    }
  });

  app.post('/api/tiktok/conversations/:conversationId/typing', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const { isTyping } = req.body;
      const user = req.user as any;
      if (!user?.id || !user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
      if (conversation.companyId !== user.companyId) return res.status(403).json({ error: 'Access denied' });
      if (isTyping) TikTokService.startTypingIndicator(conversationId, user.id, user.companyId);
      else TikTokService.stopTypingIndicator(conversationId, user.id, user.companyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating typing indicator:', error);
      res.status(500).json({ error: 'Failed to update typing indicator' });
    }
  });

  app.post('/api/tiktok/typing/:conversationId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const { isTyping } = req.body;
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      if (isTyping) {
        TikTokService.startTypingIndicator(conversationId, user.id, user.companyId);
      } else {
        TikTokService.stopTypingIndicator(conversationId, user.id, user.companyId);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating typing indicator:', error);
      res.status(500).json({ error: 'Failed to update typing indicator' });
    }
  });


  app.post('/api/tiktok/presence/:conversationId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const { status } = req.body;
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!['online', 'offline', 'away'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      TikTokService.updatePresenceStatus(user.id, conversationId, status, user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating presence:', error);
      res.status(500).json({ error: 'Failed to update presence' });
    }
  });


  app.get('/api/tiktok/typing/:conversationId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const typingUsers = TikTokService.getTypingUsers(conversationId);

      res.json({ typingUsers });
    } catch (error) {
      console.error('Error getting typing users:', error);
      res.status(500).json({ error: 'Failed to get typing users' });
    }
  });


  app.post('/api/tiktok/messages/:messageId/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      await TikTokService.markMessageAsRead(messageId, user.id, user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  });

  app.post('/api/tiktok/conversations/:conversationId/messages/:messageId/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;
      if (!user?.id || !user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.companyId !== user.companyId) return res.status(403).json({ error: 'Access denied' });
      const message = await storage.getMessageById(messageId);
      if (!message || message.conversationId !== conversationId) return res.status(404).json({ error: 'Message not found' });
      await TikTokService.markMessageAsRead(messageId, user.id, user.companyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ error: 'Failed to mark message as read' });
    }
  });

  app.get('/api/tiktok/conversations/:conversationId/messages/:messageId/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.companyId !== user.companyId) return res.status(403).json({ error: 'Access denied' });
      const message = await storage.getMessageById(messageId);
      if (!message || message.conversationId !== conversationId) return res.status(404).json({ error: 'Message not found' });
      const status = await TikTokService.getMessageDeliveryStatus(messageId);
      res.json({ status });
    } catch (error) {
      console.error('Error getting message status:', error);
      res.status(500).json({ error: 'Failed to get message status' });
    }
  });

  app.get('/api/tiktok/conversations/:conversationId/messages/:messageId/receipts', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: 'User not authenticated' });
      const conversation = await storage.getConversation(conversationId);
      if (!conversation || conversation.companyId !== user.companyId) return res.status(403).json({ error: 'Access denied' });
      const message = await storage.getMessageById(messageId);
      if (!message || message.conversationId !== conversationId) return res.status(404).json({ error: 'Message not found' });
      const receipts = TikTokService.getMessageReadReceipts(messageId);
      res.json({ receipts: receipts || [] });
    } catch (error) {
      console.error('Error getting read receipts:', error);
      res.status(500).json({ error: 'Failed to get read receipts' });
    }
  });

  app.post('/api/tiktok/conversations/:conversationId/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      await TikTokService.markConversationAsRead(conversationId, user.id, user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking conversation as read:', error);
      res.status(500).json({ error: 'Failed to mark conversation as read' });
    }
  });


  app.get('/api/tiktok/messages/:messageId/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      const status = await TikTokService.getMessageDeliveryStatus(messageId);

      res.json({ status });
    } catch (error) {
      console.error('Error getting message status:', error);
      res.status(500).json({ error: 'Failed to get message status' });
    }
  });


  app.get('/api/tiktok/messages/:messageId/receipts', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      const receipts = TikTokService.getMessageReadReceipts(messageId);

      res.json({ receipts });
    } catch (error) {
      console.error('Error getting read receipts:', error);
      res.status(500).json({ error: 'Failed to get read receipts' });
    }
  });


  app.post('/api/tiktok/messages/:messageId/reactions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const { emoji } = req.body;
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!emoji) {
        return res.status(400).json({ error: 'Emoji is required' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      await TikTokService.addReaction(messageId, user.id, emoji, user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error adding reaction:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add reaction' });
    }
  });


  app.delete('/api/tiktok/messages/:messageId/reactions/:emoji', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const emoji = decodeURIComponent(req.params.emoji);
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      await TikTokService.removeReaction(messageId, user.id, emoji, user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing reaction:', error);
      res.status(500).json({ error: 'Failed to remove reaction' });
    }
  });


  app.get('/api/tiktok/messages/:messageId/reactions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }


      const message = await storage.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      const summary = TikTokService.getReactionSummary(messageId);

      res.json({ reactions: summary });
    } catch (error) {
      console.error('Error getting reactions:', error);
      res.status(500).json({ error: 'Failed to get reactions' });
    }
  });


  app.get('/api/tiktok/reactions/available', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      res.json({ emojis: TikTokService.AVAILABLE_REACTIONS });
    } catch (error) {
      console.error('Error getting available reactions:', error);
      res.status(500).json({ error: 'Failed to get available reactions' });
    }
  });


  app.get('/api/tiktok/mentions/unread', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      if (!user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const mentions = TikTokService.getUnreadMentions(user.id);

      res.json({ mentions });
    } catch (error) {
      console.error('Error getting unread mentions:', error);
      res.status(500).json({ error: 'Failed to get unread mentions' });
    }
  });


  app.post('/api/tiktok/mentions/:messageId/read', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = parseInt(req.params.messageId);
      const user = req.user as any;

      if (!user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      TikTokService.markMentionAsRead(user.id, messageId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking mention as read:', error);
      res.status(500).json({ error: 'Failed to mark mention as read' });
    }
  });


  app.delete('/api/tiktok/mentions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      if (!user?.id) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      TikTokService.clearUserMentions(user.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing mentions:', error);
      res.status(500).json({ error: 'Failed to clear mentions' });
    }
  });


  app.post('/api/tiktok/oauth/prepare', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { state, accountName } = req.body;

      if (!state || !accountName) {
        return res.status(400).json({ error: 'State and account name are required' });
      }


      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      

      const codeChallenge = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      if (!req.session) {
        req.session = {} as any;
      }
      (req.session as any).tiktokOAuthState = state;
      (req.session as any).tiktokAccountName = accountName;
      (req.session as any).tiktokCodeVerifier = codeVerifier;

      res.json({ 
        success: true,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
      });
    } catch (error) {
      console.error('Error preparing TikTok OAuth:', error);
      res.status(500).json({ error: 'Failed to prepare OAuth' });
    }
  });


  app.get('/api/tiktok/oauth/callback', ensureAuthenticated, ensureActiveSubscription, async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;
      const user = req.user as any;

      if (!user?.id || !user?.companyId) {
        return res.status(401).send(`
          <html>
            <body>
              <h1>Authentication Error</h1>
              <p>User not authenticated. Please log in and try again.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }


      if (error) {
        console.error('TikTok OAuth error:', error, error_description);
        return res.status(400).send(`
          <html>
            <body>
              <h1>TikTok Authorization Failed</h1>
              <p>${error_description || error}</p>
              <script>
                setTimeout(() => {
                  window.opener?.postMessage({ type: 'tiktok_oauth_error', error: '${error}' }, '*');
                  window.close();
                }, 2000);
              </script>
            </body>
          </html>
        `);
      }


      const savedState = (req.session as any)?.tiktokOAuthState;
      if (!state || state !== savedState) {
        console.error('TikTok OAuth state mismatch');
        return res.status(400).send(`
          <html>
            <body>
              <h1>Security Error</h1>
              <p>Invalid state parameter. Please try again.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }

      if (!code) {
        return res.status(400).send(`
          <html>
            <body>
              <h1>Authorization Error</h1>
              <p>No authorization code received from TikTok.</p>
              <script>window.close();</script>
            </body>
          </html>
        `);
      }


      const platformConfig = await TikTokService.getPlatformConfig();


      const codeVerifier: string | undefined = (req.session as any)?.tiktokCodeVerifier;







      const tokenResponse = await TikTokService.exchangeCodeForToken(
        code as string,
        platformConfig.redirectUrl || `${process.env.BASE_URL || 'http://localhost:5000'}/api/tiktok/oauth/callback`,
        codeVerifier
      );


      const userInfo = await TikTokService.getUserInfo(tokenResponse.access_token);


      const businessAccountVerification = await TikTokService.verifyBusinessAccount(tokenResponse.access_token);
      
      if (!businessAccountVerification.isBusinessAccount) {
        return res.status(400).send(`
          <html>
            <body>
              <h1>TikTok Business Account Required</h1>
              <p>TikTok Business Account required. Personal and Creator accounts are not supported for messaging. Please convert your account to a Business Account in TikTok settings.</p>
              <p><a href="https://www.tiktok.com/business/en-US" target="_blank">Learn how to convert to a Business Account →</a></p>
              <script>
                setTimeout(() => {
                  window.opener?.postMessage({ type: 'tiktok_oauth_error', error: 'TikTok Business Account Required' }, '*');
                  window.close();
                }, 3000);
              </script>
            </body>
          </html>
        `);
      }


      const grantedScopes = tokenResponse.scope?.split(',').map((s: string) => s.trim()) || [];
      const requiredScopes = ['user.info.basic', 'im.chat', 'business.management'];
      const missingScopes = requiredScopes.filter(scope => !grantedScopes.includes(scope));
      
      if (missingScopes.length > 0) {
        return res.status(400).send(`
          <html>
            <body>
              <h1>Required Permissions Not Granted</h1>
              <p>Required permissions not granted. Please authorize all requested permissions to enable messaging features.</p>
              <p>Missing scopes: ${missingScopes.join(', ')}</p>
              <script>
                setTimeout(() => {
                  window.opener?.postMessage({ type: 'tiktok_oauth_error', error: 'Required Permissions Not Granted' }, '*');
                  window.close();
                }, 3000);
              </script>
            </body>
          </html>
        `);
      }


      logger.info('tiktok', 'OAuth scopes granted:', { grantedScopes, userId: user.id, companyId: user.companyId });


      const regionInfo = await TikTokService.detectRegionRestrictions(tokenResponse.access_token, userInfo);

      const accountName = (req.session as any)?.tiktokAccountName || `TikTok - ${userInfo.display_name}`;

      const connectionData = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        accountId: userInfo.open_id,
        accountName: userInfo.display_name,
        accountHandle: userInfo.username,
        avatarUrl: userInfo.avatar_url,
        grantedScopes: grantedScopes,
        isBusinessAccount: businessAccountVerification.isBusinessAccount,
        businessAccountId: businessAccountVerification.businessAccountId,
        regionRestricted: regionInfo.regionRestricted,
        restrictedFeatures: regionInfo.restrictedFeatures,
        regionCode: regionInfo.regionCode,
        connectedAt: Date.now(),
        lastSyncAt: Date.now(),
        status: 'active' as const,
        lastError: regionInfo.regionRestricted 
          ? 'Messaging features unavailable in your region (EEA/UK/CH). Analytics and profile features remain available.'
          : undefined
      };

      const connection = await storage.createChannelConnection({
        companyId: user.companyId,
        userId: user.id,
        channelType: 'tiktok',
        accountId: userInfo.open_id,
        accountName: accountName,
        accessToken: tokenResponse.access_token,
        status: 'active',
        connectionData: connectionData
      });


      await TikTokService.initializeConnection(connection.id);


      if (req.session) {
        delete (req.session as any).tiktokOAuthState;
        delete (req.session as any).tiktokAccountName;
        delete (req.session as any).tiktokCodeVerifier;
      }


      res.send(`
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 1rem;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                text-align: center;
                max-width: 400px;
              }
              .success-icon {
                font-size: 4rem;
                margin-bottom: 1rem;
              }
              h1 {
                color: #333;
                margin-bottom: 0.5rem;
              }
              p {
                color: #666;
                margin-bottom: 1.5rem;
              }
              .account-info {
                background: #f7fafc;
                padding: 1rem;
                border-radius: 0.5rem;
                margin-bottom: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>TikTok Connected!</h1>
              <p>Your TikTok account has been successfully connected.</p>
              <div class="account-info">
                <strong>${userInfo.display_name}</strong>
                ${userInfo.username ? `<br/>@${userInfo.username}` : ''}
              </div>
              <p style="font-size: 0.875rem; color: #999;">Redirecting to settings...</p>
            </div>
            <script>

              window.opener?.postMessage({ type: 'tiktok_oauth_success' }, '*');
              

              setTimeout(() => {
                if (window.opener) {

                  window.opener.location.href = '/settings';
                  window.close();
                } else {

                  window.location.href = '/settings';
                }
              }, 1500);
            </script>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Error processing TikTok OAuth callback:', error);
      

      let errorTitle = 'Connection Error';
      let errorMessage = error.message || 'Failed to connect TikTok account';
      let actionableGuidance = '';
      
      if (error.message?.includes('Business Account') || error.response?.data?.error?.code === 'BUSINESS_ACCOUNT_REQUIRED') {
        errorTitle = 'TikTok Business Account Required';
        errorMessage = 'TikTok Business Account required. Personal and Creator accounts are not supported for messaging.';
        actionableGuidance = '<p><a href="https://www.tiktok.com/business/en-US" target="_blank">Learn how to convert to a Business Account →</a></p>';
      } else if (error.message?.includes('Required Permissions') || error.message?.includes('scope')) {
        errorTitle = 'Required Permissions Not Granted';
        errorMessage = 'Required permissions not granted. Please authorize all requested permissions to enable messaging features.';
        actionableGuidance = '<p>Please try connecting again and ensure you grant all requested permissions.</p>';
      } else if (error.message?.includes('region') || error.response?.data?.error?.code === 'REGION_NOT_SUPPORTED') {
        errorTitle = 'Messaging Unavailable in Your Region';
        errorMessage = 'Messaging features are not available in your region (EEA/UK/CH). Analytics and profile features remain available.';
        actionableGuidance = '<p>Your connection will be created with limited functionality.</p>';
      }
      

      logger.error('tiktok', 'OAuth callback error:', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        userId: (req.user as any)?.id,
        companyId: (req.user as any)?.companyId
      });
      
      res.status(500).send(`
        <html>
          <body>
            <h1>${errorTitle}</h1>
            <p>${errorMessage}</p>
            ${actionableGuidance}
            <script>
              setTimeout(() => {
                window.opener?.postMessage({ type: 'tiktok_oauth_error', error: '${errorMessage.replace(/'/g, "\\'")}' }, '*');
                window.close();
              }, 3000);
            </script>
          </body>
        </html>
      `);
    }
  });

  app.post('/api/channel-connections/whatsapp-embedded-signup', ensureAuthenticated, ensureActiveSubscription, async (req: Request, res: Response) => {


    try {
      const { code, connectionName } = req.body;
      const user = req.user as any;

      if (!code) {
        console.error('❌ [OLD EMBEDDED SIGNUP] Missing authorization code');
        return res.status(400).json({ message: 'Authorization code is required' });
      }

      if (!user?.id) {
        console.error('❌ [OLD EMBEDDED SIGNUP] User not authenticated');
        return res.status(401).json({ message: 'User not authenticated' });
      }


      const config = await storage.getPartnerConfiguration('meta');
      if (!config || !config.isActive) {
        return res.status(500).json({
          message: 'Meta partner configuration missing or inactive',
          error: 'Contact your administrator to configure Meta partner credentials in the admin panel (Settings → Partner Configurations → Meta)'
        });
      }

      if (!config.partnerApiKey) {
        return res.status(400).json({
          message: 'Meta partner configuration incomplete',
          error: 'App ID (partnerApiKey) is missing. Contact your administrator to configure Meta partner credentials in the admin panel.'
        });
      }

      if (!config.partnerSecret) {
        return res.status(400).json({
          message: 'Meta partner configuration incomplete',
          error: 'App Secret (partnerSecret) is missing. Contact your administrator to configure Meta partner credentials in the admin panel.'
        });
      }

      const tokenResponse = await fetch('https://graph.facebook.com/v24.0/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.partnerApiKey,
          client_secret: config.partnerSecret,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Token exchange failed:', errorData);
        return res.status(400).json({
          message: 'Failed to exchange authorization code for access token',
          error: errorData
        });
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;



      if (!accessToken) {
        console.error('❌ [OLD EMBEDDED SIGNUP] No access token received');
        return res.status(400).json({ message: 'No access token received' });
      }





      let wabaId: string | null = null;
      let businessAccountName: string | null = null;
      let phoneNumbers: any[] = [];


      try {
        const meResponse = await fetch(`https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`);
        if (meResponse.ok) {
          const meData = await meResponse.json();

        }
      } catch (e) {
        console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get user info:', e);
      }


      try {
        const wabaResponse = await fetch(`https://graph.facebook.com/v24.0/me?fields=owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${accessToken}`);

        if (wabaResponse.ok) {
          const wabaData = await wabaResponse.json();


          if (wabaData.owned_whatsapp_business_accounts?.data?.length > 0) {
            const businessAccount = wabaData.owned_whatsapp_business_accounts.data[0];
            wabaId = businessAccount.id;
            businessAccountName = businessAccount.name || 'WhatsApp Business Account';

            if (businessAccount.phone_numbers?.data?.length > 0) {
              phoneNumbers = businessAccount.phone_numbers.data;
            }
          }
        } else {
          const errorData = await wabaResponse.json();
          console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get owned WABAs:', errorData);
        }
      } catch (e) {
        console.warn('⚠️ [OLD EMBEDDED SIGNUP] Error getting owned WABAs:', e);
      }


      if (!wabaId) {
        try {
          const businessesResponse = await fetch(`https://graph.facebook.com/v24.0/me/businesses?access_token=${accessToken}`);
          if (businessesResponse.ok) {
            const businessesData = await businessesResponse.json();


            if (businessesData.data && businessesData.data.length > 0) {

              for (const business of businessesData.data) {
                try {
                  const wabaResponse = await fetch(
                    `https://graph.facebook.com/v24.0/${business.id}/owned_whatsapp_business_accounts?access_token=${accessToken}`
                  );
                  if (wabaResponse.ok) {
                    const wabaData = await wabaResponse.json();
                    if (wabaData.data && wabaData.data.length > 0) {
                      wabaId = wabaData.data[0].id;
                      businessAccountName = business.name || 'WhatsApp Business Account';
                      break;
                    }
                  }
                } catch (e) {
                  console.warn(`⚠️ [OLD EMBEDDED SIGNUP] Error getting WABA for business ${business.id}:`, e);
                }
              }
            }
          } else {
            const errorData = await businessesResponse.json();
            console.error('❌ [OLD EMBEDDED SIGNUP] Failed to get businesses:', errorData);
          }
        } catch (e) {
          console.error('❌ [OLD EMBEDDED SIGNUP] Error getting businesses:', e);
        }
      }


      if (!wabaId && config.partnerApiKey && config.partnerSecret) {
        try {

          const appAccessToken = `${config.partnerApiKey}|${config.partnerSecret}`;


          const appWabaResponse = await fetch(
            `https://graph.facebook.com/v24.0/${config.partnerApiKey}/whatsapp_business_accounts?access_token=${appAccessToken}`
          );

          if (appWabaResponse.ok) {
            const appWabaData = await appWabaResponse.json();


            if (appWabaData.data && appWabaData.data.length > 0) {

              const businessAccount = appWabaData.data[0];
              wabaId = businessAccount.id;
              businessAccountName = businessAccount.name || 'WhatsApp Business Account';


              try {
                const phoneNumbersResponse = await fetch(
                  `https://graph.facebook.com/v24.0/${wabaId}/phone_numbers?access_token=${accessToken}`
                );
                if (phoneNumbersResponse.ok) {
                  const phoneNumbersData = await phoneNumbersResponse.json();
                  if (phoneNumbersData.data && phoneNumbersData.data.length > 0) {
                    phoneNumbers = phoneNumbersData.data;
                  }
                }
              } catch (e) {
                console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get phone numbers with user token:', e);

                try {
                  const phoneNumbersResponse = await fetch(
                    `https://graph.facebook.com/v24.0/${wabaId}/phone_numbers?access_token=${appAccessToken}`
                  );
                  if (phoneNumbersResponse.ok) {
                    const phoneNumbersData = await phoneNumbersResponse.json();
                    if (phoneNumbersData.data && phoneNumbersData.data.length > 0) {
                      phoneNumbers = phoneNumbersData.data;
                    }
                  }
                } catch (e2) {
                  console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get phone numbers with app token either:', e2);
                }
              }
            }
          } else {
            const errorData = await appWabaResponse.json();
            console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get WABAs from app:', errorData);
          }
        } catch (e) {
          console.warn('⚠️ [OLD EMBEDDED SIGNUP] Error getting WABAs from app:', e);
        }
      }

      if (!wabaId) {
        console.error('❌ [OLD EMBEDDED SIGNUP] Could not find WhatsApp Business Account after all attempts');






        return res.status(400).json({
          message: 'Could not find WhatsApp Business Account. The embedded signup may not have completed successfully, or the access token does not have required permissions.',
          error: 'No WhatsApp Business Account found for this access token',
          suggestion: 'Please ensure the embedded signup completes and check if the message listener receives the signup data. The signup data should include business_account_id and phone_numbers.'
        });
      }




      if (phoneNumbers.length === 0) {
        try {
          const phoneNumbersResponse = await fetch(
            `https://graph.facebook.com/v24.0/${wabaId}/phone_numbers?access_token=${accessToken}`
          );

          if (phoneNumbersResponse.ok) {
            const phoneNumbersData = await phoneNumbersResponse.json();
            if (phoneNumbersData.data && phoneNumbersData.data.length > 0) {
              phoneNumbers = phoneNumbersData.data;
            }
          } else {
            const errorData = await phoneNumbersResponse.json();
            console.warn('⚠️ [OLD EMBEDDED SIGNUP] Could not get phone numbers:', errorData);
          }
        } catch (e) {
          console.warn('⚠️ [OLD EMBEDDED SIGNUP] Error getting phone numbers:', e);
        }
      }

      if (phoneNumbers.length === 0) {
        console.error('❌ [OLD EMBEDDED SIGNUP] No phone numbers found');
        return res.status(400).json({ message: 'No phone numbers found for this WhatsApp Business account' });
      }

      const phoneNumber = phoneNumbers[0];
      const phoneNumberId = phoneNumber.id;




      if (!user.companyId) {
        console.error('❌ [OLD EMBEDDED SIGNUP] Company ID is missing');
        return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
      }





      const signupData = {
        business_account_id: wabaId,
        business_account_name: businessAccountName,
        phone_numbers: phoneNumbers.map((pn: any) => ({
          phone_number_id: pn.id,
          phone_number: pn.display_phone_number || pn.phone_number || '',
          display_name: pn.verified_name || pn.display_phone_number || pn.phone_number,
          access_token: accessToken
        }))
      };




      const result = await whatsAppMetaPartnerService.processEmbeddedSignupCallback(
        user.companyId,
        signupData,
        connectionName
      );




      const connection = result.connections?.[0] || null;

      if (!connection) {
        console.warn('⚠️ [OLD EMBEDDED SIGNUP] No connection in result, but service completed:', {
          hasConnections: !!result.connections,
          connectionsCount: result.connections?.length || 0,
          hasPhoneNumbers: !!result.phoneNumbers,
          phoneNumbersCount: result.phoneNumbers?.length || 0
        });

        return res.status(201).json({
          client: result.client,
          phoneNumbers: result.phoneNumbers,
          connections: result.connections || [],
          message: 'WhatsApp Business account connected successfully. Please refresh to see the connection.'
        });
      }





      try {

        if (!req.user || !req.user.companyId) {
          throw new Error('Company ID is required for multi-tenant security');
        }

        await whatsAppOfficialService.initializeConnection(connection.id, req.user.companyId, {
          accessToken,
          phoneNumberId,
          wabaId,
          webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token'
        });
      } catch (initError) {
        console.error('Failed to initialize WhatsApp Official service:', initError);
      }


      broadcastToCompany({
        type: 'channelConnectionCreated',
        data: connection
      }, user.companyId);


      res.status(201).json({
        ...connection,
        client: result.client,
        phoneNumbers: result.phoneNumbers,
        message: 'WhatsApp Business account connected successfully'
      });
    } catch (error) {
      console.error('Error processing WhatsApp Business API signup:', error);
      res.status(500).json({
        message: 'Failed to process WhatsApp Business API signup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/channel-connections/meta-whatsapp-embedded-signup', ensureAuthenticated, async (req: Request, res: Response) => {
    let createdClientId: number | null = null;
    let createdPhoneNumberIds: number[] = [];




    try {
      const { connectionName, signupData, signupMode, enableHistorySync } = req.body;
      const user = req.user as any;



      if (!connectionName || !signupData) {

        return res.status(400).json({ message: 'Connection name and signup data are required' });
      }

      if (!user?.companyId) {

        return res.status(401).json({ message: 'User not authenticated or missing company' });
      }


      const { business_account_id } = signupData;
      if (business_account_id) {

        const existingClient = await storage.getMetaWhatsappClientByBusinessAccountId(business_account_id);
        if (existingClient) {


          if (existingClient.companyId === user.companyId) {
            const terminalStates = ['webhook_configured', 'completed', 'active'];

            if (existingClient.onboardingState && terminalStates.includes(existingClient.onboardingState)) {

              const existingPhoneNumbers = await storage.getMetaWhatsappPhoneNumbersByClientId(existingClient.id);





              const allConnections = await storage.getChannelConnections(null, user.companyId);


              const existingConnections = allConnections.filter(conn => {
                if (conn.channelType !== 'whatsapp_official') {

                  return false;
                }
                const connData = conn.connectionData as any;
                const phoneNumberId = connData?.phoneNumberId;
                const matches = existingPhoneNumbers.some(pn => pn.phoneNumberId === phoneNumberId);

                return matches;
              });


              if (existingConnections.length === 0 && existingPhoneNumbers.length > 0) {

                const createdConnections = [];

                const businessIdForConnection = signupData.businessId || signupData.data?.business_id;

                for (const phoneNumber of existingPhoneNumbers) {
                  try {


                    const connection = await whatsAppMetaPartnerService.createChannelConnection(
                      user.companyId,
                      phoneNumber,
                      connectionName,
                      businessIdForConnection // Add missing 4th parameter
                    );
                    createdConnections.push(connection);

                  } catch (error) {

                  }
                }


                for (const connection of createdConnections) {
                  broadcastToCompany({
                    type: 'channelConnectionCreated',
                    data: connection
                  }, user.companyId);

                }

                return res.status(200).json({
                  client: existingClient,
                  phoneNumbers: existingPhoneNumbers,
                  connections: createdConnections,
                  message: 'Meta WhatsApp Business account already onboarded. Connections created.',
                  idempotent: true
                });
              }

              return res.status(200).json({
                client: existingClient,
                phoneNumbers: existingPhoneNumbers,
                connections: existingConnections,
                message: 'Meta WhatsApp Business account already onboarded',
                idempotent: true
              });
            }

            if (existingClient.onboardingState === 'failed') {

            }
          } else {


            return res.status(403).json({
              message: 'This WhatsApp Business Account is already associated with another company'
            });
          }
        } else {

        }
      }



      const partnerConfigCheck = await storage.getPartnerConfiguration('meta');




      const result = await whatsAppMetaPartnerService.processEmbeddedSignupCallback(
        user.companyId,
        signupData,
        connectionName,
        signupMode,
        enableHistorySync
      );


      if (result.connections && result.connections.length > 0) {
        const connectionsWithBusinessId = result.connections.filter((c: any) => (c.connectionData as any)?.businessId);

      }


      createdClientId = result.client?.id || null;
      createdPhoneNumberIds = result.phoneNumbers?.map((p: any) => p.id) || [];


      if (result.client && result.phoneNumbers && result.phoneNumbers.length > 0) {
        try {
          const partnerConfig = await storage.getPartnerConfiguration('meta');
          if (partnerConfig && partnerConfig.partnerWebhookUrl && partnerConfig.webhookVerifyToken) {
            const wabaId = result.client.businessAccountId;
            const appId = partnerConfig.partnerApiKey;

            const appAccessToken = `${partnerConfig.partnerApiKey}|${partnerConfig.partnerSecret}`;


            const systemUserToken = partnerConfig.accessToken || undefined; // System User token if configured
            const webhookUrl = partnerConfig.partnerWebhookUrl;
            const verifyToken = partnerConfig.webhookVerifyToken;





            const webhookResult = await retryWebhookConfiguration(
              wabaId,
              appId,
              webhookUrl,
              verifyToken,
              appAccessToken, // App access token for /subscriptions endpoint
              3,
              systemUserToken // System User token for /subscribed_apps endpoint (optional)
            );

            if (webhookResult.success) {

              await storage.updateMetaWhatsappClient(result.client.id, {
                webhookConfiguredAt: new Date(),
                onboardingState: 'webhook_configured'
              });



            } else {

              const errorCode = webhookResult.error?.error?.code;
              const errorMessage = webhookResult.error?.error?.message || webhookResult.message || 'Webhook configuration failed';

              let userFriendlyMessage = errorMessage;
              if (errorCode === 2200) {
                userFriendlyMessage = 'Webhook callback verification timed out. Meta cannot reach your webhook URL. Please configure webhook manually in Meta App Dashboard or ensure your webhook URL is publicly accessible.';
              }



              await storage.updateMetaWhatsappClient(result.client.id, {
                onboardingState: 'webhook_failed',
                configurationErrors: {
                  webhook: userFriendlyMessage,
                  errorCode: errorCode || 'unknown'
                }
              });
            }
          }
        } catch (webhookError) {
          console.error('Error auto-configuring webhook during embedded signup:', webhookError);

          if (result.client?.id) {
            await storage.updateMetaWhatsappClient(result.client.id, {
              onboardingState: 'webhook_failed',
              configurationErrors: { webhook: (webhookError as Error).message }
            });
          }
        }
      }
      if (result.connections && result.connections.length > 0) {


        for (const connection of result.connections) {


          let connectionToBroadcast = connection;
          if (enableHistorySync && signupMode === 'coexistence') {
            const updatedConnection = await storage.updateChannelConnection(connection.id, {
              connectionData: {
                ...(connection.connectionData as any),
                historySyncEnabled: true,
                historySyncStatus: 'pending'
              }
            });
            connectionToBroadcast = updatedConnection;
          }

          broadcastToCompany({
            type: 'channelConnectionCreated',
            data: connectionToBroadcast
          }, user.companyId);


        }
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error processing Meta WhatsApp embedded signup:', error);


      if (createdClientId) {
        try {
          const errorDetails = {
            signup: error instanceof Error ? error.message : 'Unknown error during signup',
            timestamp: new Date().toISOString(),
            phoneNumbersCreated: createdPhoneNumberIds.length,
            stack: error instanceof Error ? error.stack : undefined
          };

          await storage.updateMetaWhatsappClient(createdClientId, {
            onboardingState: 'failed',
            status: 'suspended',
            configurationErrors: errorDetails
          });


          for (const phoneNumberId of createdPhoneNumberIds) {
            try {
              await storage.updateMetaWhatsappPhoneNumber(phoneNumberId, {
                status: 'failed',
                lastWebhookError: `Onboarding failed: ${errorDetails.signup}`
              });
            } catch (phoneError) {
              console.error(`Error updating phone number ${phoneNumberId} during rollback:`, phoneError);
            }
          }
        } catch (rollbackError) {
          console.error('Error during rollback:', rollbackError);

        }
      }

      res.status(500).json({
        message: 'Failed to process Meta WhatsApp embedded signup',
        error: error instanceof Error ? error.message : 'Unknown error',
        rollbackApplied: createdClientId ? true : false
      });
    }
  });


  app.post('/api/channel-connections/meta-messenger-embedded-signup', ensureAuthenticated, ensureActiveSubscription, async (req: Request, res: Response) => {
    try {
      const { accessToken, action, connectionName, pageId, pageName, pageAccessToken } = req.body;
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ message: 'User not authenticated or missing company' });
      }

      const config = await storage.getPartnerConfiguration('meta');
      if (!config || !config.isActive) {
        return res.status(500).json({
          message: 'Meta partner configuration missing or inactive',
          error: 'Contact your administrator to configure Meta partner credentials in the admin panel'
        });
      }

      if (!config.partnerApiKey || !config.partnerSecret) {
        return res.status(400).json({
          message: 'Meta partner configuration incomplete',
          error: 'App ID and App Secret are required'
        });
      }

      if (action === 'fetch_pages') {

        if (!accessToken) {
          return res.status(400).json({ message: 'Access token is required' });
        }

        try {
          const pages = await metaGraphAPI.getUserPages(accessToken);
          return res.json({ pages });
        } catch (error: any) {
          console.error('Error fetching Pages:', error);
          return res.status(500).json({
            message: 'Failed to fetch Facebook Pages',
            error: error.message || 'Unknown error'
          });
        }
      } else if (action === 'create_connection') {

        if (!pageId || !pageAccessToken || !connectionName) {
          return res.status(400).json({ message: 'Page ID, access token, and connection name are required' });
        }

        try {

          const longLivedToken = await metaGraphAPI.getPageAccessToken(
            pageId,
            pageAccessToken,
            config.partnerApiKey,
            config.partnerSecret
          );


          const pageInfo = await metaGraphAPI.getPageInfo(pageId, longLivedToken);


          const connection = await storage.createChannelConnection({
            userId: user.id,
            companyId: user.companyId,
            channelType: 'messenger',
            accountId: pageId,
            accountName: connectionName,
            accessToken: longLivedToken,
            connectionData: {
              pageId: pageId,
              appId: config.partnerApiKey,
              appSecret: config.partnerSecret,
              webhookUrl: config.partnerWebhookUrl || `${req.protocol}://${req.get('host')}/api/webhooks/messenger`,
              verifyToken: config.webhookVerifyToken || 'default_verify_token',
              pageInfo: pageInfo
            },
            status: 'active'
          });


          await messengerService.connect(connection.id, user.id, user.companyId);

          broadcastToCompany({
            type: 'channelConnectionCreated',
            data: connection
          }, user.companyId);

          return res.status(201).json({
            connection,
            message: 'Messenger connection created successfully'
          });
        } catch (error: any) {
          console.error('Error creating Messenger connection:', error);
          return res.status(500).json({
            message: 'Failed to create Messenger connection',
            error: error.message || 'Unknown error'
          });
        }
      } else {
        return res.status(400).json({ message: 'Invalid action' });
      }
    } catch (error: any) {
      console.error('Error in Messenger embedded signup:', error);
      return res.status(500).json({
        message: 'Failed to process Messenger embedded signup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  app.post('/api/channel-connections/meta-instagram-embedded-signup', ensureAuthenticated, ensureActiveSubscription, async (req: Request, res: Response) => {
    try {
      const { accessToken, action, connectionName, instagramAccountId, username } = req.body;
      const user = req.user as any;

      if (!user?.companyId) {
        return res.status(401).json({ message: 'User not authenticated or missing company' });
      }

      const config = await storage.getPartnerConfiguration('meta');
      if (!config || !config.isActive) {
        return res.status(500).json({
          message: 'Meta partner configuration missing or inactive',
          error: 'Contact your administrator to configure Meta partner credentials in the admin panel'
        });
      }

      if (!config.partnerApiKey || !config.partnerSecret) {
        return res.status(400).json({
          message: 'Meta partner configuration incomplete',
          error: 'App ID and App Secret are required'
        });
      }

      if (action === 'fetch_accounts') {

        if (!accessToken) {
          return res.status(400).json({ message: 'Access token is required' });
        }

        try {
          const accounts = await metaGraphAPI.getInstagramAccounts(accessToken);
          return res.json({ accounts });
        } catch (error: any) {
          console.error('Error fetching Instagram accounts:', error);
          return res.status(500).json({
            message: 'Failed to fetch Instagram accounts',
            error: error.message || 'Unknown error'
          });
        }
      } else if (action === 'create_connection') {

        if (!instagramAccountId || !connectionName || !accessToken) {
          return res.status(400).json({ message: 'Instagram account ID, connection name, and access token are required' });
        }

        try {

          const pages = await metaGraphAPI.getUserPages(accessToken);
          let instagramAccessToken = '';
          let linkedPageId = '';


          for (const page of pages) {
            try {
              const pageInfo = await metaGraphAPI.getPageInfo(page.id, page.access_token);
              if (pageInfo.instagram_business_account && pageInfo.instagram_business_account.id === instagramAccountId) {
                linkedPageId = page.id;
                instagramAccessToken = page.access_token;
                break;
              }
            } catch (err) {

            }
          }

          if (!instagramAccessToken) {

            try {
              const longLivedUserToken = await metaGraphAPI.getPageAccessToken(
                pages[0]?.id || '',
                accessToken,
                config.partnerApiKey,
                config.partnerSecret
              );
              instagramAccessToken = longLivedUserToken;
            } catch (err) {
              return res.status(400).json({
                message: 'Could not find access token for Instagram account',
                error: 'Please ensure your Instagram account is linked to a Facebook Page'
              });
            }
          }


          const accountInfo = await metaGraphAPI.getInstagramAccountInfo(instagramAccountId, instagramAccessToken);


          const connection = await storage.createChannelConnection({
            userId: user.id,
            companyId: user.companyId,
            channelType: 'instagram',
            accountId: instagramAccountId,
            accountName: connectionName,
            accessToken: instagramAccessToken,
            connectionData: {
              instagramAccountId: instagramAccountId,
              appId: config.partnerApiKey,
              appSecret: config.partnerSecret,
              webhookUrl: config.partnerWebhookUrl || `${req.protocol}://${req.get('host')}/api/webhooks/instagram`,
              verifyToken: config.webhookVerifyToken || 'default_verify_token',
              accountInfo: accountInfo,
              linkedPageId: linkedPageId
            },
            status: 'active'
          });


          await instagramService.connect(connection.id, user.id, user.companyId);

          broadcastToCompany({
            type: 'channelConnectionCreated',
            data: connection
          }, user.companyId);

          return res.status(201).json({
            connection,
            message: 'Instagram connection created successfully'
          });
        } catch (error: any) {
          console.error('Error creating Instagram connection:', error);
          return res.status(500).json({
            message: 'Failed to create Instagram connection',
            error: error.message || 'Unknown error'
          });
        }
      } else {
        return res.status(400).json({ message: 'Invalid action' });
      }
    } catch (error: any) {
      console.error('Error in Instagram embedded signup:', error);
      return res.status(500).json({
        message: 'Failed to process Instagram embedded signup',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/channel-connections/:connectionId/disconnect-embedded-signup', ensureAuthenticated, async (req: Request, res: Response) => {


    try {
      const connectionId = parseInt(req.params.connectionId, 10);
      const user = req.user as any;
      const companyId = user.companyId;

      if (isNaN(connectionId)) {
        return res.status(400).json({ message: 'Invalid connection ID' });
      }


      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        console.error('❌ [META DISCONNECT] Connection not found:', connectionId);
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.companyId !== companyId) {
        console.error('❌ [META DISCONNECT] Access denied:', {
          connectionId,
          connectionCompanyId: connection.companyId,
          userCompanyId: companyId
        });
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }


      const connectionData = connection.connectionData as any;
      if (!connectionData?.partnerManaged) {
        console.error('❌ [META DISCONNECT] Not an embedded signup connection:', connectionId);
        return res.status(400).json({ message: 'This connection is not an embedded signup connection' });
      }




      const result = await whatsAppMetaPartnerService.disconnectEmbeddedSignupConnection(connectionId, companyId);




      if (result.connection) {
        broadcastToCompany({ type: 'channelConnectionUpdated', data: result.connection }, companyId);
      }

      return res.status(200).json({
        success: true,
        message: result.message || 'WhatsApp number disconnected successfully',
        connection: result.connection
      });

    } catch (error: any) {
      console.error('❌ [META DISCONNECT] Error:', {
        connectionId: req.params.connectionId,
        error: error.message,
        stack: error.stack
      });

      const statusCode = error.message?.includes('not found') ? 404
        : error.message?.includes('Access denied') ? 403
          : error.message?.includes('not an embedded signup') ? 400
            : 500;

      return res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to disconnect WhatsApp number',
        error: error.message
      });
    }
  });


  app.post('/api/channel-connections/meta-whatsapp-configure-webhook', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { wabaId, phoneNumberIds } = req.body;
      const user = req.user as any;

      if (!wabaId) {
        return res.status(400).json({ message: 'WABA ID is required' });
      }

      if (!user?.companyId) {
        return res.status(401).json({ message: 'User not authenticated or missing company' });
      }

      const partnerConfig = await storage.getPartnerConfiguration('meta');
      if (!partnerConfig || !partnerConfig.isActive) {
        return res.status(404).json({ message: 'Meta partner configuration not found or inactive' });
      }

      if (!partnerConfig.partnerWebhookUrl || !partnerConfig.webhookVerifyToken) {
        return res.status(400).json({ message: 'Webhook URL and verify token must be configured' });
      }

      const appId = partnerConfig.partnerApiKey;
      const accessToken = partnerConfig.accessToken || `${partnerConfig.partnerApiKey}|${partnerConfig.partnerSecret}`;
      const webhookUrl = partnerConfig.partnerWebhookUrl;
      const verifyToken = partnerConfig.webhookVerifyToken;


      const result = await retryWebhookConfiguration(
        wabaId,
        appId,
        webhookUrl,
        verifyToken,
        accessToken,
        3
      );

      if (result.success) {

        const client = await storage.getMetaWhatsappClientByBusinessAccountId(wabaId);
        if (client) {
          await storage.updateMetaWhatsappClient(client.id, {
            webhookConfiguredAt: new Date(),
            onboardingState: 'webhook_configured'
          });
        }

        res.json({
          success: true,
          message: 'Webhook configured successfully',
          subscriptionId: result.subscriptionId
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.message,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Error configuring webhook:', error);
      res.status(500).json({
        message: 'Failed to configure webhook',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  app.get('/api/partner-configurations/meta/availability', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = await storage.getPartnerConfiguration('meta');

      if (!config || !config.isActive) {
        return res.json({
          isAvailable: false,
          message: 'Meta WhatsApp Business API Partner integration is not configured'
        });
      }

      const healthStatus = config.healthCheckStatus as any;

      res.json({
        isAvailable: true,
        message: 'Meta WhatsApp Business API Partner integration is available',
        config: {
          partnerApiKey: config.partnerApiKey,
          configId: config.configId,
          webhookUrl: config.partnerWebhookUrl,
          status: healthStatus?.status || 'unknown',
          lastValidatedAt: config.lastValidatedAt,
          apiVersion: config.apiVersion || 'v24.0'
        }
      });
    } catch (error) {
      console.error('Error checking Meta partner availability:', error);
      res.status(500).json({
        isAvailable: false,
        message: 'Failed to check Meta partner configuration'
      });
    }
  });


  app.get('/api/partner-configurations/meta/refresh', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = await storage.getPartnerConfiguration('meta');

      if (!config || !config.isActive) {
        return res.status(404).json({
          error: 'Meta WhatsApp Business API Partner integration is not configured'
        });
      }


      await storage.updatePartnerConfiguration(config.id, {
        healthCheckStatus: config.healthCheckStatus // Update with existing data to trigger refresh
      });

      const refreshedConfig = await storage.getPartnerConfiguration('meta');
      const healthStatus = refreshedConfig?.healthCheckStatus as any;

      res.json({
        success: true,
        config: {
          partnerApiKey: refreshedConfig?.partnerApiKey,
          configId: refreshedConfig?.configId,
          webhookUrl: refreshedConfig?.partnerWebhookUrl,
          status: healthStatus?.status || 'unknown',
          lastValidatedAt: refreshedConfig?.lastValidatedAt,
          apiVersion: refreshedConfig?.apiVersion || 'v24.0'
        }
      });
    } catch (error) {
      console.error('Error refreshing Meta partner configuration:', error);
      res.status(500).json({
        error: 'Failed to refresh Meta partner configuration'
      });
    }
  });

  app.get('/api/whatsapp/behavior-config', ensureAuthenticated, async (req: Request, res: Response) => {
    try {

      const typingConfig = whatsAppService.getTypingConfiguration();
      const messageSplittingConfig = whatsAppService.getMessageSplittingConfiguration();
      const messageDebouncingConfig = whatsAppService.getMessageDebouncingConfiguration();


      const whatsAppOfficialService = await import('./services/channels/whatsapp-official');
      const officialTypingConfig = whatsAppOfficialService.getTypingConfiguration();
      const officialMessageSplittingConfig = whatsAppOfficialService.getMessageSplittingConfiguration();

      res.json({
        typing: typingConfig,
        messageSplitting: messageSplittingConfig,
        messageDebouncing: messageDebouncingConfig,

        official: {
          typing: officialTypingConfig,
          messageSplitting: officialMessageSplittingConfig
        }
      });
    } catch (error) {
      console.error('Error getting WhatsApp behavior configuration:', error);
      res.status(500).json({
        message: 'Failed to get WhatsApp behavior configuration',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/whatsapp/behavior-config', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { typing, messageSplitting, messageDebouncing } = req.body;


      if (typing) {
        whatsAppService.configureTypingBehavior(typing);
      }

      if (messageSplitting) {
        whatsAppService.configureMessageSplitting(messageSplitting);
      }

      if (messageDebouncing) {
        whatsAppService.configureMessageDebouncing(messageDebouncing);
      }


      const whatsAppOfficialService = await import('./services/channels/whatsapp-official');
      
      if (typing) {
        whatsAppOfficialService.configureTypingBehavior(typing);
      }

      if (messageSplitting) {
        whatsAppOfficialService.configureMessageSplitting(messageSplitting);
      }

      res.json({
        message: 'WhatsApp behavior configuration updated successfully for both official and non-official services',
        typing: whatsAppService.getTypingConfiguration(),
        messageSplitting: whatsAppService.getMessageSplittingConfiguration(),
        messageDebouncing: whatsAppService.getMessageDebouncingConfiguration(),
        official: {
          typing: whatsAppOfficialService.getTypingConfiguration(),
          messageSplitting: whatsAppOfficialService.getMessageSplittingConfiguration()
        }
      });
    } catch (error) {
      console.error('Error updating WhatsApp behavior configuration:', error);
      res.status(500).json({
        message: 'Failed to update WhatsApp behavior configuration',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/whatsapp/debouncing-status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const status = whatsAppService.getDebouncingStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting WhatsApp debouncing status:', error);
      res.status(500).json({
        message: 'Failed to get WhatsApp debouncing status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/whatsapp/test-splitting-debug', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { message, phoneNumber } = req.body;
      const testMessage = message || "This is a test message that should be long enough to trigger message splitting functionality. It contains multiple sentences to test the splitting algorithm. The system should split this into multiple chunks and deliver them with appropriate delays. Each chunk should be delivered in sequence to ensure the user receives the complete message.";
      const testPhone = phoneNumber || "+1234567890";

      const result = whatsAppService.testMessageSplitting(testMessage);
      const queueStatus = whatsAppService.getQueueStatus(testPhone, 1);

      res.json({
        message: 'Message splitting test completed',
        testMessage,
        result,
        queueStatus,
        config: whatsAppService.getMessageSplittingConfiguration()
      });
    } catch (error) {
      console.error('Error testing message splitting:', error);
      res.status(500).json({
        message: 'Failed to test message splitting',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  const connectionCompanyCache = new Map<number, { companyId: number; timestamp: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

  /**
   * Update the connection company cache
   * @param connectionId - The channel connection ID
   * @param companyId - The company ID to cache
   */
  function updateConnectionCompanyCache(connectionId: number, companyId: number): void {
    connectionCompanyCache.set(connectionId, {
      companyId,
      timestamp: Date.now()
    });
  }

  /**
   * Verify if a channel connection belongs to a specific company
   * Uses in-memory cache to avoid repeated DB lookups
   * @param connectionId - The channel connection ID
   * @param companyId - The company ID to verify against
   * @returns Promise<boolean> - True if connection belongs to company, false otherwise
   */
  async function isConnectionOwnedByCompany(
    connectionId: number,
    companyId: number | undefined
  ): Promise<boolean> {

    if (companyId === null || companyId === undefined) return false;


    const cached = connectionCompanyCache.get(connectionId);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL) {
        return cached.companyId === companyId;
      } else {

        connectionCompanyCache.delete(connectionId);
      }
    }


    try {
      const connection = await storage.getChannelConnection(connectionId);
      if (connection && connection.companyId !== null) {

        updateConnectionCompanyCache(connectionId, connection.companyId);
        return connection.companyId === companyId;
      }
      return false;
    } catch (error) {
      console.error(`Error checking connection ownership: ${error}`);
      return false;
    }
  }

  const httpServer = createServer(app);

  const wsPort = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : undefined;
  const wss = wsPort
    ? new WebSocketServer({ port: wsPort, path: '/ws' })
    : new WebSocketServer({ noServer: true, path: '/ws' });

  if (wsPort) {
  }


  const clients = new Map<string, {
    socket: WebSocket,
    userId?: number,
    companyId?: number,
    isAuthenticated: boolean,
    lastActivity: Date,
    authTimeout?: NodeJS.Timeout,
    pingInterval?: NodeJS.Timeout,
    unsubscribeFunctions?: (() => void)[]
  }>();

  try {
    smartWebSocketBroadcaster.setClientMap(clients);
  } catch (e) {
    logger.warn('websocket', 'Failed to attach smartWebSocketBroadcaster to clients map:', e);
  }


  const CONNECTION_CLEANUP_INTERVAL = 30000;
  const CONNECTION_TIMEOUT = 300000;
  const PING_INTERVAL = 30000;

  const cleanupClient = (clientId: string) => {
    const client = clients.get(clientId);
    if (client) {
      if (client.unsubscribeFunctions) {
        client.unsubscribeFunctions.forEach(unsubscribe => {
          try {
            unsubscribe();
          } catch (error) {
            logger.error('websocket', `Error cleaning up event listener for client ${clientId}:`, error);
          }
        });
        client.unsubscribeFunctions = [];
      }

      if (client.authTimeout) {
        clearTimeout(client.authTimeout);
      }
      if (client.pingInterval) {
        clearInterval(client.pingInterval);
      }

      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.close();
      }

      clients.delete(clientId);
      logger.websocket(`Cleaned up client: ${clientId}`);
    }
  };

  const cleanupInterval = setInterval(() => {
    const now = new Date();
    const clientsToCleanup: string[] = [];

    clients.forEach((client, clientId) => {
      const timeSinceLastActivity = now.getTime() - client.lastActivity.getTime();

      if (timeSinceLastActivity > CONNECTION_TIMEOUT ||
        client.socket.readyState === WebSocket.CLOSED ||
        client.socket.readyState === WebSocket.CLOSING) {
        clientsToCleanup.push(clientId);
      }
    });

    clientsToCleanup.forEach(clientId => {
      logger.websocket(`Cleaning up inactive client: ${clientId}`);
      cleanupClient(clientId);
    });

    if (clientsToCleanup.length > 0) {
      logger.websocket(`Cleaned up ${clientsToCleanup.length} inactive connections. Active: ${clients.size}`);
    }
  }, CONNECTION_CLEANUP_INTERVAL);

  wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substring(2, 15);
    logger.websocket(`Client connected: ${clientId}`);

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL);

    const authTimeout = setTimeout(() => {
      const client = clients.get(clientId);
      if (client && !client.isAuthenticated) {
        logger.websocket(`Authentication timeout for client: ${clientId}`);
        ws.send(JSON.stringify({
          type: 'authError',
          message: 'Authentication timeout'
        }));
        cleanupClient(clientId);
        ws.close();
      }
    }, 10000);

    clients.set(clientId, {
      socket: ws,
      isAuthenticated: false,
      lastActivity: new Date(),
      authTimeout,
      pingInterval
    });

    const handleAuthentication = async (userId: number) => {
      try {
        const user = await storage.getUser(userId);
        if (!user) {
          ws.send(JSON.stringify({
            type: 'authError',
            message: 'User not found'
          }));
          cleanupClient(clientId);
          ws.close();
          return;
        }

        const client = clients.get(clientId);
        if (client) {
          client.isAuthenticated = true;
          client.userId = userId;
          client.companyId = user.companyId === null ? undefined : user.companyId;
          client.lastActivity = new Date();

          if (client.authTimeout) {
            clearTimeout(client.authTimeout);
            client.authTimeout = undefined;
          }
        }


        const conversations = await storage.getConversations({ companyId: user.companyId === null ? undefined : user.companyId });
        ws.send(JSON.stringify({
          type: 'authenticated',
          message: 'Successfully authenticated'
        }));

        ws.send(JSON.stringify({
          type: 'conversations',
          data: conversations
        }));


        const qrCache = new Map<number, { qrCode: string; timestamp: number }>();
        const QR_CACHE_TTL = 12000; // 12 seconds TTL

        const unsubscribeQrCode = whatsAppService.subscribeToEvents('qrCode', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (data.companyId !== undefined) {
              if (data.companyId !== client.companyId) return;
            } else {

              const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
              if (!isOwned) return;
            }

            const cached = qrCache.get(data.connectionId);
            const now = Date.now();
            const shouldSend = !cached ||
              cached.qrCode !== data.qrCode ||
              (now - cached.timestamp) > QR_CACHE_TTL;

            if (shouldSend) {
              const message = {
                type: 'whatsappQrCode',
                connectionId: data.connectionId,
                qrCode: data.qrCode
              };

              ws.send(JSON.stringify(message));
              qrCache.set(data.connectionId, { qrCode: data.qrCode, timestamp: now });
            }
          }
        });

        const unsubscribeQrCodeRequired = whatsAppService.subscribeToEvents('qrCodeRequired', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (data.companyId !== undefined) {
              if (data.companyId !== client.companyId) return;
            } else {

              const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
              if (!isOwned) return;
            }

            ws.send(JSON.stringify({
              type: 'whatsappQrCodeRequired',
              connectionId: data.connectionId,
              message: data.message
            }));
          }
        });

        const unsubscribeConnectionStatus = whatsAppService.subscribeToEvents('connectionStatusUpdate', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (data.companyId !== undefined) {
              if (data.companyId !== client.companyId) return;
            } else {

              const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
              if (!isOwned) return;
            }

            ws.send(JSON.stringify({
              type: 'whatsappConnectionStatus',
              connectionId: data.connectionId,
              status: data.status
            }));
          }
        });

        const unsubscribeConnectionError = whatsAppService.subscribeToEvents('connectionError', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (data.companyId !== undefined) {
              if (data.companyId !== client.companyId) return;
            } else {

              const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
              if (!isOwned) return;
            }

            ws.send(JSON.stringify({
              type: 'whatsappConnectionError',
              connectionId: data.connectionId,
              error: data.error
            }));
          }
        });

        const unsubscribeMessageReceived = whatsAppService.subscribeToEvents('messageReceived', (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            broadcastToAll({
              type: 'newMessage',
              data: data.message
            }, data.conversation?.companyId);

            broadcastConversationUpdate(data.conversation, 'conversationUpdated');
          }
        });

        const unsubscribeWhatsAppOfficialConnectionStatus = whatsAppOfficialService.subscribeToEvents('connectionStatusUpdate', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'whatsappOfficialConnectionStatus',
              connectionId: data.connectionId,
              status: data.status
            }));
          }
        });

        const unsubscribeWhatsAppOfficialConnectionError = whatsAppOfficialService.subscribeToEvents('connectionError', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'whatsappOfficialConnectionError',
              connectionId: data.connectionId,
              error: data.error
            }));
          }
        });

        const unsubscribeWhatsAppOfficialMessageReceived = whatsAppOfficialService.subscribeToEvents('newMessage', (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            broadcastToAll({
              type: 'newMessage',
              data: data.message
            }, data.conversation?.companyId);

            broadcastConversationUpdate(data.conversation, 'conversationUpdated');
          }
        });

        const unsubscribeInstagramConnectionStatus = instagramService.subscribeToEvents('connectionStatusUpdate', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'instagramConnectionStatus',
              connectionId: data.connectionId,
              status: data.status
            }));
          }
        });

        const unsubscribeInstagramConnectionError = instagramService.subscribeToEvents('connectionError', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'instagramConnectionError',
              connectionId: data.connectionId,
              error: data.error
            }));
          }
        });

        const unsubscribeInstagramMessageReceived = instagramService.subscribeToEvents('messageReceived', (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (!data.conversation || data.conversation.companyId !== client.companyId) {
              return;
            }

            broadcastToAll({
              type: 'newMessage',
              data: data.message
            }, data.conversation.companyId);

            broadcastConversationUpdate(data.conversation, 'conversationUpdated');
          }
        });

        const unsubscribeMessengerConnectionStatus = messengerService.subscribeToEvents('connectionStatusUpdate', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'messengerConnectionStatus',
              connectionId: data.connectionId,
              status: data.status
            }));
          }
        });

        const unsubscribeMessengerConnectionError = messengerService.subscribeToEvents('connectionError', async (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            const isOwned = await isConnectionOwnedByCompany(data.connectionId, client.companyId);
            if (!isOwned) return;

            ws.send(JSON.stringify({
              type: 'messengerConnectionError',
              connectionId: data.connectionId,
              error: data.error
            }));
          }
        });

        const unsubscribeMessengerMessageReceived = messengerService.subscribeToEvents('messageReceived', (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            const client = clients.get(clientId);

            if (!client || client.companyId === null || client.companyId === undefined) return;


            if (!data.conversation || data.conversation.companyId !== client.companyId) {
              return;
            }

            broadcastToAll({
              type: 'newMessage',
              data: data.message
            }, data.conversation.companyId);

            broadcastConversationUpdate(data.conversation, 'conversationUpdated');
          }
        });

        const unsubscribeEmailMessageReceived = emailService.subscribeToEvents('messageReceived', (data) => {
          if (data && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'newMessage',
              data: data.message
            }));

            ws.send(JSON.stringify({
              type: 'conversationUpdated',
              data: data.conversation
            }));
          }
        });

        const clientForCleanup = clients.get(clientId);
        if (clientForCleanup) {
          clientForCleanup.unsubscribeFunctions = [
            unsubscribeQrCode,
            unsubscribeQrCodeRequired,
            unsubscribeConnectionStatus,
            unsubscribeConnectionError,
            unsubscribeMessageReceived,
            unsubscribeWhatsAppOfficialConnectionStatus,
            unsubscribeWhatsAppOfficialConnectionError,
            unsubscribeWhatsAppOfficialMessageReceived,
            unsubscribeInstagramConnectionStatus,
            unsubscribeInstagramConnectionError,
            unsubscribeInstagramMessageReceived,
            unsubscribeMessengerConnectionStatus,
            unsubscribeMessengerConnectionError,
            unsubscribeMessengerMessageReceived,
            unsubscribeEmailMessageReceived
          ];
        }

        ws.on('close', () => {
          cleanupClient(clientId);
        });
      } catch (error) {
        console.error('Authentication error:', error);
        ws.send(JSON.stringify({
          type: 'authError',
          message: 'Authentication failed'
        }));
        ws.close();
      }
    };

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());

        const client = clients.get(clientId);
        if (client) {
          client.lastActivity = new Date();
        }

        if (data.type === 'authenticate') {
          const userId = data.userId;

          if (!userId) {
            ws.send(JSON.stringify({
              type: 'authError',
              message: 'Missing userId in authentication request'
            }));
            return;
          }

          await handleAuthentication(userId);
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (!client || !client.isAuthenticated) {
          ws.send(JSON.stringify({
            type: 'authError',
            message: 'Not authenticated'
          }));
          return;
        }

        if (data.type === 'sendMessage') {
          const { conversationId, content, isFromBot = false, activeChannelId } = data.message;
          const userId = client.userId;

          if (!userId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'User ID not available'
            }));
            return;
          }

          try {
            const conversation = await storage.getConversation(conversationId);
            if (!conversation) {
              throw new Error(`Conversation with ID ${conversationId} not found`);
            }

            let messageContent = content;
            if (!isFromBot) {
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
                      [(user as any).firstName, (user as any).lastName].filter(Boolean).join(' ').trim(),
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
                console.error('Error fetching user for signature:', userError);
              }
            }

            let savedMessage = null;

            let channelToUse = conversation.channelId;
            let channelTypeToUse = conversation.channelType;

            if (activeChannelId) {
              const activeChannel = await storage.getChannelConnection(activeChannelId);
              if (activeChannel && activeChannel.status === 'active') {
                channelToUse = activeChannelId;
                channelTypeToUse = activeChannel.channelType;

                await storage.updateConversation(conversationId, {
                  channelId: activeChannelId,
                  channelType: activeChannel.channelType
                });
              }
            }

            if (channelTypeToUse === 'whatsapp' || channelTypeToUse === 'whatsapp_unofficial') {
              let recipient: string;

              if (conversation.isGroup) {
                if (!conversation.groupJid) {
                  throw new Error('Group conversation missing group JID');
                }
                recipient = conversation.groupJid;

              } else {
                if (!conversation.contactId) {
                  throw new Error('Individual conversation missing contact ID');
                }
                const contact = await storage.getContact(conversation.contactId);
                if (!contact) {
                  throw new Error(`Contact with ID ${conversation.contactId} not found`);
                }

                const phoneNumber = contact.identifier || contact.phone;
                if (!phoneNumber) {
                  throw new Error('No phone number found for contact');
                }
                recipient = phoneNumber;

              }

              savedMessage = await whatsAppService.sendMessage(
                channelToUse,
                userId,
                recipient,
                messageContent,
                false,
                conversationId
              );

              if (!savedMessage) {
                throw new Error('Failed to send WhatsApp message');
              }
            } else if (channelTypeToUse === 'whatsapp_official') {
              if (!conversation.contactId) {
                throw new Error('Individual conversation missing contact ID');
              }
              const contact = await storage.getContact(conversation.contactId);
              if (!contact) {
                throw new Error(`Contact with ID ${conversation.contactId} not found`);
              }

              const phoneNumber = contact.identifier || contact.phone;
              if (!phoneNumber) {
                throw new Error('No phone number found for contact');
              }


              const user = await storage.getUser(userId);
              if (!user || !user.companyId) {
                throw new Error('Company ID is required for multi-tenant security');
              }

              savedMessage = await whatsAppOfficialService.sendMessage(
                channelToUse,
                userId,
                user.companyId,
                phoneNumber,
                messageContent,
                true // isFromBot - bot-initiated message from flow
              );

              if (!savedMessage) {
                throw new Error('Failed to send WhatsApp Business API message');
              }
            } else {
              savedMessage = await storage.createMessage({
                conversationId,
                direction: 'outbound',
                type: 'text',
                content: messageContent,
                senderId: userId,
                senderType: 'user',
                isFromBot,
                externalId: `msg-${Date.now()}`,
                metadata: { timestamp: new Date().toISOString() }
              });

              if (channelTypeToUse === 'instagram') {
                if (!conversation.contactId) {
                  throw new Error('Individual conversation missing contact ID');
                }
                const contact = await storage.getContact(conversation.contactId);
                if (!contact) {
                  throw new Error(`Contact with ID ${conversation.contactId} not found`);
                }

                const instagramId = contact.identifier;
                if (instagramId) {

                  instagramService.sendMessage(
                    channelToUse,
                    instagramId,
                    messageContent
                  ).catch(err => console.error('Error sending Instagram message:', err));
                }
              } else if (channelTypeToUse === 'messenger') {
                if (!conversation.contactId) {
                  throw new Error('Individual conversation missing contact ID');
                }
                const contact = await storage.getContact(conversation.contactId);
                if (!contact) {
                  throw new Error(`Contact with ID ${conversation.contactId} not found`);
                }

                const messengerId = contact.identifier;
                if (messengerId) {

                  messengerService.sendMessage(
                    channelToUse,
                    messengerId,
                    messageContent
                  ).catch(err => console.error('Error sending Messenger message:', err));
                }
              }
            }

            if (savedMessage) {
              if (conversation.channelType !== 'whatsapp' && conversation.channelType !== 'whatsapp_unofficial' && conversation.channelType !== 'whatsapp_official') {
                broadcastToAll({
                  type: 'newMessage',
                  data: savedMessage
                });

                await storage.updateConversation(conversationId, {
                  lastMessageAt: new Date()
                });

                const updatedConversation = await storage.getConversation(conversationId);
                if (updatedConversation) {
                  broadcastToAll({
                    type: 'conversationUpdated',
                    data: updatedConversation
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Failed to send message'
            }));
          }
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    });

    ws.on('close', (code, reason) => {
      logger.websocket(`Client disconnected: ${clientId}, code: ${code}, reason: ${reason}`);
      cleanupClient(clientId);
    });

    ws.on('error', (error) => {
      logger.error('websocket', `Error for client ${clientId}`, error);
      cleanupClient(clientId);
    });
  });

  function broadcastToAll(data: any, companyId?: number) {
    const message = JSON.stringify(data);
    let sentCount = 0;

    clients.forEach((client, clientId) => {
      if (client.isAuthenticated && client.userId && client.socket.readyState === WebSocket.OPEN) {
        if (companyId && client.companyId !== companyId) {
          return;
        }

        try {
          client.socket.send(message);
          sentCount++;
        } catch (error) {
          console.error(`Error sending message to client ${clientId}:`, error);
          cleanupClient(clientId);
        }
      }
    });

    logger.verbose('websocket', `Broadcasted message to ${sentCount} clients${companyId ? ` (company ${companyId})` : ''}`);
  }

  /**
   * Broadcast conversation updates with proper permission filtering
   */
  async function broadcastConversationUpdate(conversation: any, messageType: 'conversationUpdated' | 'newConversation' = 'conversationUpdated') {
    if (!conversation) return;

    const message = JSON.stringify({
      type: messageType,
      data: conversation
    });

    let sentCount = 0;
    const eligibleClients: string[] = [];

    const companyClients = Array.from(clients.entries()).filter(([_, client]) =>
      client.isAuthenticated &&
      client.userId &&
      client.socket.readyState === WebSocket.OPEN &&
      client.companyId === conversation.companyId
    );

    for (const [clientId, client] of companyClients) {
      try {
        if (!client.userId) continue;

        const user = await storage.getUser(client.userId);
        if (!user) continue;

        const userPermissions = await getUserPermissions(user);

        const canView = await canUserViewConversation(user, userPermissions, conversation);

        if (canView) {
          eligibleClients.push(clientId);
          client.socket.send(message);
          sentCount++;
        }
      } catch (error) {
        console.error(`Error checking permissions for client ${clientId}:`, error);
      }
    }

    logger.verbose('websocket', `Broadcasted ${messageType} to ${sentCount}/${companyClients.length} eligible clients (conversation ${conversation.id})`);
  }

  /**
   * Check if a user can view a specific conversation based on permissions
   */
  async function canUserViewConversation(user: any, userPermissions: any, conversation: any): Promise<boolean> {
    if (user.isSuperAdmin) {
      return true;
    }

    if (conversation.companyId !== null && conversation.companyId !== user.companyId) {
      return false;
    }

    if (userPermissions && userPermissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS]) {
      return true;
    } else if (userPermissions && userPermissions[PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]) {
      return conversation.assignedToUserId === user.id;
    }

    return false;
  }

  function broadcastToCompany(data: any, companyId: number) {
    broadcastToAll(data, companyId);
  }

  (global as any).broadcastToAllClients = broadcastToAll;
  (global as any).broadcastToCompany = broadcastToCompany;
  (global as any).broadcastConversationUpdate = broadcastConversationUpdate;


  let globalUnsubscribeFunctions: (() => void)[] = [];


  if ((global as any).globalWhatsAppListenersCleanup) {
    (global as any).globalWhatsAppListenersCleanup();
  }


  const unsubscribeWhatsAppMessageSent = whatsAppService.subscribeToEvents('messageSent', (data) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      }, data.conversation?.companyId);

      broadcastConversationUpdate(data.conversation, 'conversationUpdated');
    }
  });

  const unsubscribeHistorySyncProgress = whatsAppService.subscribeToEvents('historySyncProgress', (data) => {
    if (data) {
      broadcastToAll({
        type: 'whatsappHistorySyncProgress',
        data: {
          connectionId: data.connectionId,
          progress: data.progress,
          total: data.total,
          status: data.status
        }
      }, data.companyId);
    }
  });

  const unsubscribeHistorySyncComplete = whatsAppService.subscribeToEvents('historySyncComplete', (data) => {
    if (data) {
      broadcastToAll({
        type: 'whatsappHistorySyncComplete',
        data: {
          connectionId: data.connectionId,
          batchId: data.batchId,
          totalChats: data.totalChats,
          totalMessages: data.totalMessages,
          totalContacts: data.totalContacts
        }
      }, data.companyId);
    }
  });

  const unsubscribeWhatsAppOfficialNewMessage = whatsAppOfficialService.subscribeToEvents('newMessage', (data) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  const unsubscribeEmailMessageReceived = emailService.subscribeToEvents('messageReceived', (data) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  const unsubscribeMessengerMessageReceived = messengerService.subscribeToEvents('messageReceived', (data: any) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  const unsubscribeMessengerMessageSent = messengerService.subscribeToEvents('messageSent', (data: any) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  const unsubscribeInstagramMessageReceived = instagramService.subscribeToEvents('messageReceived', (data: any) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  const unsubscribeInstagramMessageSent = instagramService.subscribeToEvents('messageSent', (data: any) => {
    if (data) {
      broadcastToAll({
        type: 'newMessage',
        data: data.message
      });

      broadcastToAll({
        type: 'conversationUpdated',
        data: data.conversation
      });
    }
  });

  globalUnsubscribeFunctions = [
    unsubscribeWhatsAppMessageSent,
    unsubscribeWhatsAppOfficialNewMessage,
    unsubscribeEmailMessageReceived,
    unsubscribeMessengerMessageReceived,
    unsubscribeMessengerMessageSent,
    unsubscribeInstagramMessageReceived,
    unsubscribeInstagramMessageSent,
    unsubscribeHistorySyncProgress,
    unsubscribeHistorySyncComplete
  ];


  (global as any).globalWhatsAppListenersCleanup = () => {
    globalUnsubscribeFunctions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Error cleaning up global WhatsApp listener:', error);
      }
    });
    globalUnsubscribeFunctions = [];
  };

  eventEmitterMonitor.startMonitoring();
  logger.info('websocket', 'EventEmitter monitoring started');

  flowExecutor.setWebSocketClients(clients);


  const callAgentWss = new WebSocketServer({ noServer: true });


  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;


      if (pathname.startsWith('/call-agent/stream/')) {
        const callSidMatch = pathname.match(/\/call-agent\/stream\/(.+)/);
        if (callSidMatch) {
          const callSid = callSidMatch[1];

          callAgentWss.handleUpgrade(request, socket, head, async (ws) => {
            try {
              const callAgentService = await import('./services/call-agent-service');
              let callData = callAgentService.getActiveCall(callSid);
              let actualCallSid = callSid;


              if (callData && (callData as any)?.actualCallSid) {
                actualCallSid = (callData as any).actualCallSid;
                const realCallData = callAgentService.getActiveCall(actualCallSid);


                if (realCallData) {

                  if (callData.conversationData && callData.conversationData.length > 0) {
                    realCallData.conversationData = [
                      ...(realCallData.conversationData || []),
                      ...callData.conversationData
                    ];
                    callAgentService.setActiveCall(actualCallSid, realCallData);
                  }
                  callData = realCallData;
                } else {

                  const migratedData = {
                    ...callData,
                    conversationData: callData.conversationData || []
                  };
                  delete (migratedData as any).actualCallSid;
                  callAgentService.setActiveCall(actualCallSid, migratedData);
                  callData = migratedData;
                }


                callAgentService.removeActiveCall(callSid);
              }

              if (!callData) {
                console.error(`[CallAgent] No active call data found for ${callSid}`);
                ws.close();
                return;
              }


              const circuitState = callAgentService.getCircuitBreakerState();
              if (circuitState.state === 'open') {
                console.warn(`[CallAgent] Circuit breaker open for call ${callSid}, rejecting WebSocket upgrade`);
                ws.close(1011, 'Service temporarily unavailable (circuit breaker open)');
                return;
              }


              const agentConfig = await callAgentService.configureElevenLabsAgent(callData.config);



              let elevenLabsWsUrl: string;
              
              if ((callData.config as any).elevenLabsSignedUrl) {

                elevenLabsWsUrl = (callData.config as any).elevenLabsSignedUrl;

              } else if (callData.config.elevenLabsAgentId) {

                elevenLabsWsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${callData.config.elevenLabsAgentId}`;

              } else {

                elevenLabsWsUrl = `wss://api.elevenlabs.io/v1/convai/conversation`;

              }




              const stateToPersist = {
                ...callData,
                twilioWs: ws,
                streamSid: callData.streamSid,
                conversationData: callData.conversationData || [],
                audioChunksSent: (callData as any).audioChunksSent,
                audioChunksReceived: (callData as any).audioChunksReceived,
                lastActivityTime: Date.now()
              };
              callAgentService.setActiveCall(actualCallSid, stateToPersist as any);

              const elevenLabsOptions = {
                url: elevenLabsWsUrl,
                headers: { 'xi-api-key': callData.config.elevenLabsApiKey },
                agentConfig
              };


              await callAgentService.handleAudioStream(ws, actualCallSid, elevenLabsOptions);


            } catch (error) {
              console.error(`[CallAgent] Error setting up WebSocket for call ${callSid}:`, error);
              ws.close();
            }
          });
          return; // Explicitly return after handling CallAgent upgrade
        } else {

          socket.destroy();
          return;
        }
      }


      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      console.error('[WebSocket] Error handling upgrade:', error);
      socket.destroy();
    }
  });

  const cleanupAllConnections = () => {
    logger.info('websocket', `Cleaning up ${clients.size} WebSocket connections...`);

    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }

    clients.forEach((client, clientId) => {
      cleanupClient(clientId);
    });


    if ((global as any).globalWhatsAppListenersCleanup) {
      (global as any).globalWhatsAppListenersCleanup();
    }

    eventEmitterMonitor.stopMonitoring();

    logger.info('websocket', 'All WebSocket connections and global listeners cleaned up');
  };

  process.on('SIGTERM', cleanupAllConnections);
  process.on('SIGINT', cleanupAllConnections);



  app.get('/api/channel-connections', ensureAuthenticated, ensureActiveSubscription, requireAnyPermission([PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]), async (req: any, res) => {
    try {


      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
      }

      const user = req.user;
      const userPermissions = await getUserPermissions(user);



      const normalizeStatuses = (conns: any[]) => conns.map(c => ({
        ...c,
        status: (c.status === 'connected' || c.status === 'pending' || c.status === null) 
          ? 'active' 
          : (c.status === 'disconnected' ? 'inactive' : c.status)
      }));

      let connections: any[] = [];

      if (user.isSuperAdmin) {
        connections = await storage.getChannelConnections(null, undefined);
        return res.json(normalizeStatuses(connections));
      }

      if (userPermissions[PERMISSIONS.MANAGE_CHANNELS]) {

        connections = await storage.getChannelConnections(null, user.companyId);
        return res.json(normalizeStatuses(connections));
      }

      if (userPermissions[PERMISSIONS.VIEW_CHANNELS]) {

        connections = await storage.getChannelConnections(null, user.companyId);
        return res.json(normalizeStatuses(connections));
      }


      connections = await storage.getChannelConnections(user.id, user.companyId);
      res.json(normalizeStatuses(connections));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch channel connections' });
    }
  });

  app.get('/api/channels', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]), async (req: any, res) => {
    try {
      res.set('X-Deprecated', 'This endpoint is deprecated. Use /api/channel-connections instead.');

      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
      }

      const user = req.user;
      const userPermissions = await getUserPermissions(user);


      const normalizeStatuses = (conns: any[]) => conns.map(c => ({
        ...c,
        status: (c.status === 'connected' || c.status === 'pending' || c.status === null) 
          ? 'active' 
          : (c.status === 'disconnected' ? 'inactive' : c.status)
      }));

      if (user.isSuperAdmin) {
        const connections = await storage.getChannelConnections(null, undefined);
        return res.json(normalizeStatuses(connections));
      }


      if (userPermissions[PERMISSIONS.MANAGE_CHANNELS]) {
        const connections = await storage.getChannelConnections(null, user.companyId);
        return res.json(normalizeStatuses(connections));
      }


      if (userPermissions[PERMISSIONS.VIEW_CHANNELS]) {
        const connections = await storage.getChannelConnections(null, user.companyId);
        return res.json(normalizeStatuses(connections));
      }


      const connections = await storage.getChannelConnections(user.id, user.companyId);
      res.json(normalizeStatuses(connections));
    } catch (error) {
      console.error('Error fetching channels:', error);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });

  app.patch('/api/channel-connections/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Channel connection not found' });
      }

      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
      }

      if (connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied: Connection does not belong to your company' });
      }


      const permissions = await getUserPermissions(req.user);
      const hasManagePermission = req.user.isSuperAdmin || permissions[PERMISSIONS.MANAGE_CHANNELS] === true;
      const isOwner = connection.userId === req.user.id;

      if (!hasManagePermission && !isOwner) {
        return res.status(403).json({ error: 'Not authorized to update this connection' });
      }

      if (req.body.accountName) {
        const updatedConnection = await storage.updateChannelConnectionName(connectionId, req.body.accountName);

        broadcastToCompany({
          type: 'channelConnectionUpdated',
          data: updatedConnection
        }, req.user.companyId);

        return res.json(updatedConnection);
      }

      res.status(400).json({ error: 'Missing required fields' });
    } catch (error) {
      console.error('Error updating channel connection:', error);
      res.status(500).json({ error: 'Failed to update channel connection' });
    }
  });


  app.put('/api/channel-connections/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Channel connection not found' });
      }


      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
      }


      if (connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied: Connection does not belong to your company' });
      }


      const permissions = await getUserPermissions(req.user);
      const hasManagePermission = req.user.isSuperAdmin || permissions[PERMISSIONS.MANAGE_CHANNELS] === true;
      const isOwner = connection.userId === req.user.id;

      if (!hasManagePermission && !isOwner) {
        return res.status(403).json({ error: 'Not authorized to update this connection' });
      }


      const updateData: any = {};

      if (req.body.accountName) {
        updateData.accountName = req.body.accountName;
      }

      if (req.body.accountId) {
        updateData.accountId = req.body.accountId;
      }

      if (req.body.accessToken) {
        updateData.accessToken = req.body.accessToken;
      }

      if (req.body.connectionData) {

        updateData.connectionData = {
          ...(connection.connectionData || {}),
          ...req.body.connectionData
        };
      }


      if ('proxyEnabled' in req.body) {
        updateData.proxyEnabled = req.body.proxyEnabled;
      }
      if ('proxyType' in req.body) {
        updateData.proxyType = req.body.proxyType ?? null;
      }
      if ('proxyHost' in req.body) {
        updateData.proxyHost = req.body.proxyHost ?? null;
      }
      if ('proxyPort' in req.body) {
        const p = req.body.proxyPort;
        updateData.proxyPort = (p === null || p === undefined || p === '') ? null : parseInt(p, 10);
      }
      if ('proxyUsername' in req.body) {
        updateData.proxyUsername = req.body.proxyUsername ?? null;
      }
      if ('proxyPassword' in req.body) {

        const pw = req.body.proxyPassword;
        if (pw === null || (typeof pw === 'string' && pw.length > 0)) {
          updateData.proxyPassword = pw;
        }
      }

      const updatedConnection = await storage.updateChannelConnection(connectionId, updateData);


      if (connection.channelType === 'whatsapp_official' && (req.body.accessToken || req.body.connectionData)) {
        try {

          if (!req.user || !req.user.companyId) {
            throw new Error('Company ID is required for multi-tenant security');
          }

          const connectionData = updatedConnection.connectionData as any;
          await whatsAppOfficialService.initializeConnection(connectionId, req.user.companyId, {
            accessToken: req.body.accessToken || connection.accessToken || connectionData.accessToken,
            phoneNumberId: connectionData.phoneNumberId,
            wabaId: connectionData.wabaId || connectionData.businessAccountId,
            webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token'
          });
        } catch (initError) {
          console.error('Failed to reinitialize WhatsApp Official service:', initError);

        }
      }

      broadcastToCompany({
        type: 'channelConnectionUpdated',
        data: updatedConnection
      }, req.user.companyId);

      res.json(updatedConnection);
    } catch (error) {
      console.error('Error updating channel connection:', error);
      res.status(500).json({ error: 'Failed to update channel connection' });
    }
  });


  app.post('/api/channel-connections/:id/test-proxy', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      if (isNaN(connectionId)) {
        return res.status(400).json({ success: false, error: 'Invalid connection ID', status: 'failed' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ success: false, error: 'Connection not found', status: 'failed' });
      }

      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Unauthorized', status: 'failed' });
      }


      if (!user.isSuperAdmin) {
        const sameCompany = connection.companyId !== null && connection.companyId === user.companyId;
        const isOwner = connection.userId === user.id;
        if (!sameCompany && !isOwner) {
          return res.status(403).json({ success: false, error: 'Access denied', status: 'failed' });
        }
      }

      const { proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword } = req.body || {};

      const allowedTypes = ['http', 'https', 'socks5'];
      const portNum = Number(proxyPort);
      if (!proxyType || !allowedTypes.includes(proxyType)) {
        return res.status(400).json({ success: false, error: 'Invalid proxyType. Must be one of http, https, socks5', status: 'failed' });
      }
      if (!proxyHost || typeof proxyHost !== 'string' || proxyHost.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'proxyHost is required', status: 'failed' });
      }
      if (!Number.isInteger(portNum) || portNum <= 0) {
        return res.status(400).json({ success: false, error: 'proxyPort must be a positive integer', status: 'failed' });
      }

      const userEnc = encodeURIComponent(proxyUsername || '');
      const passEnc = encodeURIComponent(proxyPassword || '');
      let proxyUrl: string;
      if (proxyUsername && proxyPassword) {
        proxyUrl = `${proxyType}://${userEnc}:${passEnc}@${proxyHost}:${portNum}`;
      } else {
        proxyUrl = `${proxyType}://${proxyHost}:${portNum}`;
      }

      const agent = proxyType === 'socks5' ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);

      try {
        const response = await axios.get('https://web.whatsapp.com', {
          httpAgent: agent as any,
          httpsAgent: agent as any,
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400,
        });

        if (response && response.status < 400) {
          await storage.updateChannelConnection(connectionId, { proxyTestStatus: 'working', proxyLastTested: new Date() } as any);
          return res.json({ success: true, message: 'Proxy connection successful', status: 'working' });
        }

        await storage.updateChannelConnection(connectionId, { proxyTestStatus: 'failed', proxyLastTested: new Date() } as any);
        return res.status(400).json({ success: false, error: 'Non-success status from target site', status: 'failed' });
      } catch (err: any) {
        await storage.updateChannelConnection(connectionId, { proxyTestStatus: 'failed', proxyLastTested: new Date() } as any);
        return res.status(400).json({ success: false, error: err?.message || 'Proxy test failed', status: 'failed' });
      }
    } catch (error: any) {
      console.error('Error testing proxy:', error);
      return res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
    }
  });


  app.get('/api/channel-connections/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Channel connection not found' });
      }


      if (connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Not authorized to access this connection' });
      }



      const sanitizedConnection = {
        ...connection,
        accessToken: undefined,
        connectionData: {
          ...(connection.connectionData || {}),
          accessToken: undefined,
          appSecret: undefined

        }
      };

      res.json(sanitizedConnection);
    } catch (error) {
      console.error('Error retrieving channel connection:', error);
      res.status(500).json({ error: 'Failed to retrieve channel connection' });
    }
  });

  app.get('/api/channel-connections/:id/export', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) return res.status(404).json({ error: 'Connection not found' });
      if (connection.companyId !== req.user.companyId) return res.status(403).json({ error: 'Not authorized' });
      if (connection.channelType !== 'twilio_voice') return res.status(400).json({ error: 'Only Twilio Voice connections can be exported' });
      const data = connection.connectionData as any;
      const mask = (s: string, show = 4) => (s && s.length > show * 2 ? s.slice(0, show) + '*'.repeat(s.length - show * 2) + s.slice(-show) : s || '');
      const exportPayload = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        connectionType: 'twilio_voice',
        configuration: {
          accountName: connection.accountName,
          accountSid: mask(data?.accountSid),
          authToken: mask(data?.authToken ?? '', 0) || '****',
          fromNumber: data?.fromNumber,
          apiKey: mask(data?.apiKey),
          apiSecret: mask(data?.apiSecret ?? '', 0) || '****',
          twimlAppSid: mask(data?.twimlAppSid),
          callMode: data?.callMode ?? 'basic',
          elevenLabsApiKey: data?.elevenLabsApiKey ? '****' : '',
          elevenLabsAgentId: data?.elevenLabsAgentId,
          voiceId: data?.voiceId,
          audioFormat: data?.audioFormat ?? 'ulaw_8000',
          statusCallbackUrl: data?.statusCallbackUrl
        },
        metadata: {
          companyId: connection.companyId,
          createdAt: connection.createdAt,
          lastValidated: new Date().toISOString()
        }
      };
      res.setHeader('Content-Disposition', `attachment; filename="twilio-voice-${connectionId}-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json(exportPayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Export failed' });
    }
  });

  app.post('/api/channel-connections/import', ensureAuthenticated, async (req: any, res) => {
    try {
      if (!req.user?.companyId) return res.status(400).json({ message: 'Company ID required' });
      const body = req.body?.configuration ? req.body : { configuration: req.body, version: '1.0', connectionType: 'twilio_voice' };
      const config = body.configuration || {};
      if (body.connectionType !== 'twilio_voice') return res.status(400).json({ error: 'Invalid connection type' });
      const accountSid = config.accountSid ?? '';
      const authToken = config.authToken ?? '';
      const fromNumber = config.fromNumber ?? '';
      if (!accountSid || !authToken || !fromNumber) {
        return res.status(400).json({ error: 'Missing required fields: accountSid, authToken, fromNumber. Fill in masked credentials.' });
      }
      const connectionData = validateBody(insertChannelConnectionSchema, {
        channelType: 'twilio_voice',
        accountId: fromNumber,
        accountName: config.accountName || 'Imported Twilio Voice',
        connectionData: {
          accountSid,
          authToken,
          fromNumber,
          apiKey: config.apiKey ?? '',
          apiSecret: config.apiSecret ?? '',
          twimlAppSid: config.twimlAppSid ?? '',
          statusCallbackUrl: config.statusCallbackUrl ?? '',
          callMode: config.callMode ?? 'basic',
          ...(config.callMode === 'ai-powered' && {
            elevenLabsApiKey: config.elevenLabsApiKey ?? '',
            elevenLabsAgentId: config.elevenLabsAgentId,
            voiceId: config.voiceId,
            audioFormat: config.audioFormat ?? 'ulaw_8000'
          })
        },
        userId: req.user.id,
        companyId: req.user.companyId,
        status: 'active'
      });
      const connection = await storage.createChannelConnection(connectionData);
      broadcastToCompany({ type: 'channelConnectionCreated', data: connection }, req.user.companyId);
      res.status(201).json(connection);
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'Import failed' });
    }
  });

  app.post('/api/channel-connections/:id/rotate-credentials', ensureAuthenticated, async (req: any, res) => {
    const connectionId = parseInt(req.params.id);
    let connection = await storage.getChannelConnection(connectionId);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    if (connection.companyId !== req.user.companyId) return res.status(403).json({ error: 'Not authorized' });
    if (connection.channelType !== 'twilio_voice') return res.status(400).json({ error: 'Only Twilio Voice connections support rotation' });

    const newCreds = req.body?.connectionData ?? req.body;
    const newAccountSid = newCreds.accountSid ? sanitizeCredential(newCreds.accountSid) : '';
    const newAuthToken = newCreds.authToken ? sanitizeCredential(newCreds.authToken) : '';
    const newApiKey = newCreds.apiKey ?? '';
    const newApiSecret = newCreds.apiSecret ?? '';
    const newTwimlAppSid = newCreds.twimlAppSid ?? '';
    if (!newAccountSid || !newAuthToken) return res.status(400).json({ error: 'New Account SID and Auth Token required' });

    const currentData = (connection.connectionData as any) || {};
    const twimlAppSidToValidate = newTwimlAppSid || currentData.twimlAppSid || '';
    const apiKeyToValidate = newApiKey || currentData.apiKey || '';
    const apiSecretToValidate = newApiSecret || currentData.apiSecret || '';
    let updateApplied = false;

    try {

      const restValidation = await validateTwilioCredentialsWithAPI(newAccountSid, newAuthToken);
      if (!restValidation.valid) {
        return res.status(400).json({ error: 'New credentials failed validation', details: restValidation });
      }


      if (twimlAppSidToValidate && newAccountSid && newAuthToken) {
        try {
          await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${newAccountSid}/Applications/${twimlAppSidToValidate}.json`,
            { headers: { Authorization: getTwilioAuthHeader(newAccountSid, newAuthToken) }, timeout: 5000 }
          );
        } catch (err: any) {
          return res.status(400).json({
            error: 'TwiML App not accessible with new credentials',
            details: { twimlApp: err.response?.data?.message || err.message }
          });
        }
      }


      if (apiKeyToValidate && apiSecretToValidate && twimlAppSidToValidate) {
        try {
          const twilio = await import('twilio');
          const AccessToken = twilio.jwt.AccessToken;
          const VoiceGrant = AccessToken.VoiceGrant;
          const voiceGrant = new VoiceGrant({ outgoingApplicationSid: twimlAppSidToValidate, incomingAllow: true });
          const token = new AccessToken(newAccountSid, apiKeyToValidate, apiSecretToValidate, { identity: 'rotation-validation', ttl: 60 });
          token.addGrant(voiceGrant);
          const jwt = token.toJwt();
          if (!jwt?.length) {
            return res.status(400).json({ error: 'Voice SDK token generation failed with new API Key/Secret' });
          }
        } catch (err: any) {
          return res.status(400).json({
            error: 'Voice SDK credentials invalid (token generation failed)',
            details: { voiceSdk: err.message }
          });
        }
      }


      const stagedData = {
        ...currentData,
        accountSid: newAccountSid,
        authToken: newAuthToken,
        ...(newApiKey && { apiKey: newApiKey }),
        ...(newApiSecret && { apiSecret: newApiSecret }),
        ...(newTwimlAppSid && { twimlAppSid: newTwimlAppSid })
      };


      await storage.updateChannelConnection(connectionId, { connectionData: stagedData });
      updateApplied = true;

      const updated = await storage.getChannelConnection(connectionId);
      broadcastToCompany({ type: 'channelConnectionUpdated', data: updated }, req.user.companyId);
      broadcastToCompany({
        type: 'credentialsRotated',
        data: { connectionId, connection: updated, reconnectGraceful: true }
      }, req.user.companyId);
      return res.json({ success: true, message: 'Credentials rotated. Active calls can reconnect with new credentials.', connection: updated });
    } catch (err: any) {

      if (updateApplied) {
        await storage.updateChannelConnection(connectionId, { connectionData: currentData }).catch(() => {});
      }
      if (err.response) return res.status(err.response.status || 400).json(err.response.data || { error: err.message });
      return res.status(400).json({ error: err.message || 'Rotation failed' });
    }
  });


  const twilioVoiceValidationRateLimit = new Map<number, { count: number; resetAt: number }>();
  const TWILIO_VOICE_VALIDATION_MAX_PER_MINUTE = 5;

  app.post('/api/channel-connections/validate-twilio-voice', ensureAuthenticated, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      const userId = req.user.id;
      const now = Date.now();
      const windowMs = 60 * 1000;
      let bucket = twilioVoiceValidationRateLimit.get(userId);
      if (!bucket) {
        bucket = { count: 0, resetAt: now + windowMs };
        twilioVoiceValidationRateLimit.set(userId, bucket);
      }
      if (now >= bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + windowMs;
      }
      if (bucket.count >= TWILIO_VOICE_VALIDATION_MAX_PER_MINUTE) {
        return res.status(429).json({
          success: false,
          error: 'Too many validation attempts. Please try again in a minute.',
          retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
        });
      }
      bucket.count++;

      const body = req.body?.connectionData ?? req.body;
      const accountSid = sanitizeCredential(body?.accountSid ?? '');
      const authToken = sanitizeCredential(body?.authToken ?? '');
      const fromNumber = body?.fromNumber ?? '';
      const apiKey = body?.apiKey ?? '';
      const apiSecret = body?.apiSecret ?? '';
      const twimlAppSid = body?.twimlAppSid ?? '';
      const callMode = body?.callMode ?? 'basic';
      const elevenLabsApiKey = body?.elevenLabsApiKey ?? '';
      const elevenLabsAgentId = body?.elevenLabsAgentId ?? '';
      const voiceId = body?.voiceId ?? '';
      const audioFormat = body?.audioFormat ?? 'ulaw_8000';
      const statusCallbackUrl = body?.statusCallbackUrl ?? '';

      const report: {
        success: boolean;
        twilioRestApi: { valid: boolean; accountInfo?: any; error?: string; suggestions?: string[]; responseTime?: number };
        twimlApp: { valid: boolean; error?: string; appName?: string; responseTime?: number };
        voiceSdk?: { valid: boolean; error?: string; responseTime?: number };
        elevenLabs?: { valid: boolean; error?: string; responseTime?: number };
        webhooks?: { statusCallbackAccessible?: boolean; error?: string };
        recommendations: string[];
      } = {
        success: true,
        twilioRestApi: { valid: false },
        twimlApp: { valid: false },
        recommendations: []
      };


      if (!accountSid || !authToken) {
        report.twilioRestApi = { valid: false, error: 'Account SID and Auth Token are required' };
        report.recommendations.push('Provide Twilio Account SID (34 chars, starts with AC) and Auth Token.');
      } else {
        const twilioStart = Date.now();
        const twilioResult = await validateTwilioCredentialsWithAPI(accountSid, authToken);
        report.twilioRestApi = {
          valid: twilioResult.valid,
          responseTime: Date.now() - twilioStart,
          ...(twilioResult.accountInfo && { accountInfo: twilioResult.accountInfo }),
          ...(twilioResult.error && { error: twilioResult.error }),
          ...(twilioResult.suggestions && { suggestions: twilioResult.suggestions })
        };
        if (!twilioResult.valid) {
          report.success = false;
          report.recommendations.push(twilioResult.error || 'Fix Twilio credentials.');
          if (twilioResult.suggestions?.length) report.recommendations.push(...twilioResult.suggestions);
        }
      }


      if (report.twilioRestApi.valid && twimlAppSid && accountSid && authToken) {
        try {
          const appStart = Date.now();
          const appRes = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications/${twimlAppSid}.json`,
            { headers: { Authorization: getTwilioAuthHeader(accountSid, authToken) }, timeout: 5000 }
          );
          report.twimlApp = {
            valid: true,
            appName: appRes.data?.friendly_name,
            responseTime: Date.now() - appStart
          };
        } catch (err: any) {
          report.twimlApp = {
            valid: false,
            error: err.response?.data?.message || err.message || 'TwiML App not found or inaccessible',
            responseTime: 0
          };
          report.success = false;
          report.recommendations.push('Verify TwiML App SID in Twilio Console → Voice → TwiML Apps.');
        }
      } else if (twimlAppSid) {
        report.twimlApp = { valid: false, error: 'Validate Twilio account first.' };
      }


      if (report.twilioRestApi.valid && apiKey && apiSecret && twimlAppSid) {
        try {
          const voiceStart = Date.now();
          const twilio = await import('twilio');
          const AccessToken = twilio.jwt.AccessToken;
          const VoiceGrant = AccessToken.VoiceGrant;
          const voiceGrant = new VoiceGrant({ outgoingApplicationSid: twimlAppSid, incomingAllow: true });
          const token = new AccessToken(accountSid, apiKey, apiSecret, { identity: 'validation', ttl: 60 });
          token.addGrant(voiceGrant);
          const jwt = token.toJwt();
          report.voiceSdk = { valid: !!jwt?.length, responseTime: Date.now() - voiceStart };
          if (!report.voiceSdk.valid) {
            report.success = false;
            report.recommendations.push('Voice SDK credentials could not generate a token. Check API Key and Secret.');
          }
        } catch (err: any) {
          report.voiceSdk = { valid: false, error: err.message || 'Voice SDK test failed', responseTime: 0 };
          report.success = false;
          report.recommendations.push('Verify API Key and API Secret in Twilio Console → Account → API Keys.');
        }
      }


      if (callMode === 'ai-powered' && elevenLabsApiKey) {
        const config: CallAgentConfig = {
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken,
          twilioFromNumber: fromNumber || '+0000000000',
          elevenLabsApiKey,
          elevenLabsAgentId: elevenLabsAgentId || undefined,
          elevenLabsVoiceId: voiceId || undefined,
          audioFormat: audioFormat as 'ulaw_8000' | 'pcm_8000' | 'pcm_16000',
          toNumber: '+0000000000',
          executionMode: 'blocking'
        };
        try {
          const elStart = Date.now();
          await configureElevenLabsAgent(config);
          report.elevenLabs = { valid: true, responseTime: Date.now() - elStart };
        } catch (err: any) {
          report.elevenLabs = { valid: false, error: err.message || 'ElevenLabs validation failed', responseTime: 0 };
          report.success = false;
          report.recommendations.push(err.message || 'Verify ElevenLabs API key and Agent ID.');
        }
      }


      if (statusCallbackUrl && (statusCallbackUrl.startsWith('http://') || statusCallbackUrl.startsWith('https://'))) {
        try {
          const headRes = await axios.head(statusCallbackUrl, { timeout: 5000, validateStatus: () => true });
          report.webhooks = { statusCallbackAccessible: headRes.status < 500 };
          if (headRes.status >= 400) {
            report.recommendations.push('Ensure Status Callback URL is publicly accessible via HTTPS.');
          }
        } catch {
          report.webhooks = { statusCallbackAccessible: false, error: 'URL not reachable' };
          report.recommendations.push('Verify webhook URL is publicly accessible (HTTPS recommended).');
        }
      }

      return res.json(report);
    } catch (err: any) {
      console.error('[channel-connections] validate-twilio-voice error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Validation failed',
        recommendations: ['Check your credentials and try again.']
      });
    }
  });

  app.post('/api/channel-connections', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {

      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
      }

      const connectionData = validateBody(insertChannelConnectionSchema, {
        ...req.body,
        userId: req.user.id,
        companyId: req.user.companyId
      });

      const connection = await storage.createChannelConnection(connectionData);

      broadcastToCompany({
        type: 'channelConnectionCreated',
        data: connection
      }, req.user.companyId);

      if (connection.channelType === 'whatsapp_unofficial') {

        const autoConnect = req.body.autoConnect !== undefined ? req.body.autoConnect : true;
        if (autoConnect) {
          try {
            whatsAppService.connect(connection.id, req.user.id)
              .catch(err => console.error('Error connecting to WhatsApp:', err));

            res.status(201).json(connection);
          } catch (err: any) {
            console.error('Error initiating WhatsApp connection:', err);
            res.status(201).json(connection);
          }
        } else {
          res.status(201).json(connection);
        }
      } else if (connection.channelType === 'whatsapp_official') {
        try {

          if (!req.user || !req.user.companyId) {
            return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
          }

          whatsAppOfficialService.connect(connection.id, req.user.id, req.user.companyId)
            .catch(err => console.error('Error connecting to WhatsApp Business API:', err));

          res.status(201).json(connection);
        } catch (err: any) {
          console.error('Error initiating WhatsApp Business API connection:', err);
          res.status(201).json(connection);
        }
      } else if (connection.channelType === 'instagram') {
        try {
          instagramService.connect(connection.id, req.user.id, req.user.companyId)
            .catch(err => console.error('Error connecting to Instagram:', err));

          res.status(201).json(connection);
        } catch (err: any) {
          console.error('Error initiating Instagram connection:', err);
          res.status(201).json(connection);
        }
      } else if (connection.channelType === 'messenger') {
        try {
          messengerService.connect(connection.id, req.user.id)
            .catch(err => console.error('Error connecting to Messenger:', err));

          res.status(201).json(connection);
        } catch (err: any) {
          console.error('Error initiating Messenger connection:', err);
          res.status(201).json(connection);
        }
      } else if (connection.channelType === 'webchat') {
        try {

          const token = await webchatService.generateWidgetToken(connection.id);
          const updated = await storage.getChannelConnection(connection.id);
          const embedScript = `<script src="${req.protocol}://${req.get('host')}/api/webchat/widget.js?token=${encodeURIComponent(token)}" async></script>`;
          res.status(201).json({ ...updated, embedScript });
        } catch (err: any) {
          console.error('Error initializing WebChat connection:', err);
          res.status(201).json(connection);
        }
      } else {
        res.status(201).json(connection);
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/channel-connections/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }


      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
      }


      if (connection.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }


      const permissions = await getUserPermissions(req.user);
      const hasManagePermission = req.user.isSuperAdmin || permissions[PERMISSIONS.MANAGE_CHANNELS] === true;
      const isOwner = connection.userId === req.user.id;

      if (!hasManagePermission && !isOwner) {
        return res.status(403).json({ message: 'You do not have permission to delete this connection' });
      }

      if (connection.channelType === 'whatsapp_unofficial' || connection.channelType === 'whatsapp') {
        await whatsAppService.disconnect(connectionId, req.user.id);
      } else if (connection.channelType === 'whatsapp_official') {

        if (!req.user || !req.user.companyId) {
          return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
        }

        await whatsAppOfficialService.disconnect(connectionId, req.user.id, req.user.companyId);
      } else if (connection.channelType === 'instagram') {
        await instagramService.disconnect(connectionId, req.user.id);
      } else if (connection.channelType === 'messenger') {
        await messengerService.disconnect(connectionId, req.user.id);
      } else if (connection.channelType === 'tiktok') {
        await TikTokService.disconnectConnection(connectionId);
      } else if (connection.channelType === 'webchat') {
        await webchatService.disconnect(connectionId, req.user.id);
      }

      const deleted = await storage.deleteChannelConnection(connectionId);

      if (!deleted) {
        return res.status(500).json({ message: 'Failed to delete the connection' });
      }

      broadcastToCompany({
        type: 'channelConnectionDeleted',
        data: { id: connectionId }
      }, req.user.companyId);


      res.status(200).json({ message: 'Connection deleted successfully' });
    } catch (err: any) {
      console.error('Error deleting channel connection:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/channel-connections/:id/reconnect', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }


      if (connection.channelType !== 'whatsapp' && connection.channelType !== 'whatsapp_unofficial' && connection.channelType !== 'whatsapp_official') {
        return res.status(400).json({ error: 'Only WhatsApp connections can be reconnected' });
      }

      await whatsAppService.connect(connectionId, req.user.id);

      res.status(200).json({ message: 'Reconnection initiated' });
    } catch (err: any) {
      console.error('Error reconnecting to WhatsApp:', err);
      res.status(500).json({ message: err.message });
    }
  });


  app.post('/api/channel-connections/:id/regenerate-token', ensureAuthenticated, async (req: any, res: Response) => {
    try {
      const connectionId = parseInt(req.params.id);
      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) return res.status(404).json({ error: 'Connection not found' });
      if (connection.channelType !== 'webchat') return res.status(400).json({ error: 'Not a WebChat connection' });
      if (connection.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
      const token = await webchatService.generateWidgetToken(connectionId);
      const updated = await storage.getChannelConnection(connectionId);
      const embedScript = `<script src="${req.protocol}://${req.get('host')}/api/webchat/widget.js?token=${encodeURIComponent(token)}" async></script>`;
      res.json({ ...updated, embedScript });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to regenerate token' });
    }
  });

  app.put('/api/channel-connections/:id/history-sync', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be a boolean value' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (connection.userId !== req.user.id || connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Not authorized to modify this connection' });
      }

      if (connection.channelType !== 'whatsapp' && connection.channelType !== 'whatsapp_unofficial') {
        return res.status(400).json({ error: 'History sync is only available for WhatsApp connections' });
      }

      await storage.updateChannelConnection(connectionId, {
        historySyncEnabled: enabled,
        historySyncStatus: enabled ? 'pending' : 'disabled'
      });

      res.json({
        success: true,
        historySyncEnabled: enabled,
        historySyncStatus: enabled ? 'pending' : 'disabled'
      });
    } catch (error) {
      console.error('Error updating history sync setting:', error);
      res.status(500).json({ error: 'Failed to update history sync setting' });
    }
  });

  app.post('/api/channel-connections/:id/sync-history', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.id);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      if (connection.userId !== req.user.id || connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Not authorized to modify this connection' });
      }

      if (connection.channelType !== 'whatsapp' && connection.channelType !== 'whatsapp_unofficial') {
        return res.status(400).json({ error: 'History sync is only available for WhatsApp connections' });
      }

      if (!connection.historySyncEnabled) {
        return res.status(400).json({ error: 'History sync is not enabled for this connection' });
      }

      if (connection.historySyncStatus === 'syncing') {
        return res.status(400).json({ error: 'History sync is already in progress' });
      }

      await whatsAppService.startManualHistorySyncSimple(connectionId, req.user.id);

      res.json({
        success: true,
        message: 'History sync started successfully'
      });
    } catch (error: any) {
      console.error('Error starting manual history sync:', error);
      console.error('Error details:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });

      res.status(500).json({
        error: error?.message || 'Failed to start history sync',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      });
    }
  });


  app.get('/api/whatsapp/status/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      const isActive = whatsAppService.isConnectionActive(connectionId);

      res.json({
        connectionId,
        status: connection.status,
        isActive
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put('/api/debug/connection-status/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'Debug endpoints not available in production' });
      }

      const connectionId = parseInt(req.params.connectionId);
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: 'Status is required' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      await storage.updateChannelConnectionStatus(connectionId, status);

      broadcastToCompany({
        type: 'connectionStatusUpdate',
        data: {
          connectionId,
          status
        }
      }, req.user.companyId);

      res.json({
        message: 'Connection status updated successfully',
        connectionId,
        oldStatus: connection.status,
        newStatus: status
      });
    } catch (err: any) {
      console.error('Error updating connection status:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/whatsapp/diagnostics/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      const diagnostics = whatsAppService.getConnectionDiagnostics(connectionId);

      res.json({
        connectionId,
        diagnostics,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/whatsapp/recover-connections", ensureAuthenticated, async (req: any, res) => {
    try {


      const { checkAndRecoverConnections } = await import('./services/channels/whatsapp');
      await checkAndRecoverConnections();

      res.json({
        message: "Connection recovery check completed",
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Error during manual connection recovery:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/whatsapp/profile-picture/:connectionId/:phoneNumber', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { phoneNumber } = req.params;
      const forceRefresh = req.query.force === 'true';

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (!forceRefresh) {
        try {
          const contact = await storage.getContactByPhone(phoneNumber, req.user.companyId);
          if (contact && contact.avatarUrl) {
            const avatarAge = Date.now() - new Date(contact.updatedAt || contact.createdAt || Date.now()).getTime();
            const maxAge = 24 * 60 * 60 * 1000;

            if (avatarAge < maxAge) {
              res.set({
                'Cache-Control': 'public, max-age=86400',
                'ETag': `"${contact.id}-${contact.updatedAt || contact.createdAt}"`
              });

              return res.json({ success: true, url: contact.avatarUrl, cached: true });
            }
          }
        } catch (dbError) {
        }
      }

      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const profilePictureUrl = await whatsAppService.fetchProfilePicture(connectionId, phoneNumber, true);

      if (profilePictureUrl) {
        res.set({
          'Cache-Control': 'public, max-age=86400',
          'ETag': `"${phoneNumber}-${Date.now()}"`
        });

        res.json({ success: true, url: profilePictureUrl, cached: false });
      } else {
        res.status(404).json({ message: 'No profile picture found for this contact' });
      }
    } catch (err: any) {
      console.error('Error fetching WhatsApp profile picture:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch profile picture' });
    }
  });

  app.get('/api/whatsapp/profile-picture-url/:connectionId/:phoneNumber', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { phoneNumber } = req.params;
      const forceRefresh = req.query.force === 'true';

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (!forceRefresh) {
        try {
          const contact = await storage.getContactByPhone(phoneNumber, req.user.companyId);
          if (contact && contact.avatarUrl) {
            const avatarAge = Date.now() - new Date(contact.updatedAt || contact.createdAt || Date.now()).getTime();
            const maxAge = 24 * 60 * 60 * 1000;

            if (avatarAge < maxAge) {
              res.set({
                'Cache-Control': 'public, max-age=86400',
                'ETag': `"${contact.id}-${contact.updatedAt || contact.createdAt}"`
              });

              return res.json({ success: true, url: contact.avatarUrl, direct: true, cached: true });
            }
          }
        } catch (dbError) {
        }
      }

      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const profilePictureUrl = await whatsAppService.getProfilePictureUrl(connectionId, phoneNumber);

      if (profilePictureUrl) {
        try {
          const contact = await storage.getContactByPhone(phoneNumber, req.user.companyId);
          if (contact && contact.avatarUrl !== profilePictureUrl) {
            await storage.updateContact(contact.id, { avatarUrl: profilePictureUrl });
          }
        } catch (updateError) {
        }

        res.set({
          'Cache-Control': 'public, max-age=86400',
          'ETag': `"${phoneNumber}-${Date.now()}"`
        });

        res.json({ success: true, url: profilePictureUrl, direct: true, cached: false });
      } else {
        res.status(404).json({ message: 'No profile picture found for this contact' });
      }
    } catch (err: any) {
      console.error('Error fetching WhatsApp profile picture URL:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch profile picture URL' });
    }
  });

  app.get('/api/whatsapp/group-picture/:connectionId/:groupJid', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { groupJid } = req.params;

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const { fetchGroupProfilePicture } = await import('./services/channels/whatsapp');
      const groupPictureUrl = await fetchGroupProfilePicture(connectionId, groupJid, false);

      if (groupPictureUrl) {
        res.json({ success: true, url: groupPictureUrl, direct: true });
      } else {
        res.status(404).json({ message: 'No group profile picture found' });
      }
    } catch (err: any) {
      console.error('Error fetching group profile picture:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch group profile picture' });
    }
  });

  app.get('/api/whatsapp/participant-picture/:connectionId/:participantJid', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { participantJid } = req.params;
      const forceRefresh = req.query.force === 'true';

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (!forceRefresh) {
        try {
          const phoneNumber = participantJid.split('@')[0];
          const contact = await storage.getContactByPhone(phoneNumber, req.user.companyId);
          if (contact && contact.avatarUrl) {
            const avatarAge = Date.now() - new Date(contact.updatedAt || contact.createdAt || Date.now()).getTime();
            const maxAge = 24 * 60 * 60 * 1000;

            if (avatarAge < maxAge) {
              res.set({
                'Cache-Control': 'public, max-age=86400',
                'ETag': `"${contact.id}-${contact.updatedAt || contact.createdAt}"`
              });

              return res.json({ success: true, url: contact.avatarUrl, direct: true, cached: true });
            }
          }
        } catch (dbError) {
        }
      }

      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const { getParticipantProfilePictureUrl } = await import('./services/channels/whatsapp');
      const participantPictureUrl = await getParticipantProfilePictureUrl(connectionId, participantJid);

      if (participantPictureUrl) {
        try {
          const phoneNumber = participantJid.split('@')[0];
          const contact = await storage.getContactByPhone(phoneNumber, req.user.companyId);
          if (contact && contact.avatarUrl !== participantPictureUrl) {
            await storage.updateContact(contact.id, { avatarUrl: participantPictureUrl });
          }
        } catch (updateError) {
        }

        res.set({
          'Cache-Control': 'public, max-age=86400',
          'ETag': `"${participantJid}-${Date.now()}"`
        });

        res.json({ success: true, url: participantPictureUrl, direct: true, cached: false });
      } else {
        res.status(404).json({ message: 'No participant profile picture found' });
      }
    } catch (err: any) {
      console.error('Error fetching participant profile picture:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch participant profile picture' });
    }
  });

  app.post('/api/whatsapp/participants-pictures/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { participantJids } = req.body;

      if (!Array.isArray(participantJids) || participantJids.length === 0) {
        return res.status(400).json({ message: 'participantJids array is required' });
      }

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const { fetchParticipantProfilePictures } = await import('./services/channels/whatsapp');
      const participantPictures = await fetchParticipantProfilePictures(connectionId, participantJids, false);

      const result = Object.fromEntries(participantPictures);

      res.json({
        success: true,
        participants: result,
        total: participantJids.length,
        found: Object.values(result).filter(url => url !== null).length
      });
    } catch (err: any) {
      console.error('Error fetching participant profile pictures:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch participant profile pictures' });
    }
  });

  app.get('/api/whatsapp/validate-phone/:phoneNumber', ensureAuthenticated, async (req: any, res) => {
    try {
      const { phoneNumber } = req.params;

      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');

      const jid = `${cleanPhoneNumber}@s.whatsapp.net`;

      const phoneValidation = validatePhoneNumberUtil(cleanPhoneNumber);

      res.json({
        original: phoneNumber,
        cleaned: cleanPhoneNumber,
        jid: jid,
        valid: phoneValidation.isValid,
        error: phoneValidation.error
      });
    } catch (err: any) {
      console.error('Error validating phone number:', err);
      res.status(500).json({ message: err.message || 'Failed to validate phone number' });
    }
  });

  app.post('/api/whatsapp/connect/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      await storage.updateChannelConnectionStatus(connectionId, 'connecting');

      try {
        await whatsAppService.connect(connectionId, req.user.id);

      } catch (err) {
        console.error('Error connecting to WhatsApp:', err);
        await storage.updateChannelConnectionStatus(connectionId, 'error');
      }

      res.json({ message: 'WhatsApp connection initiated' });
    } catch (err: any) {
      console.error('Error in connect endpoint:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/whatsapp/disconnect/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      let success = false;

      if (connection.channelType === 'whatsapp_unofficial') {
        success = await whatsAppService.disconnect(connectionId, req.user.id);
      }
      else if (connection.channelType === 'whatsapp_official') {

        if (!req.user || !req.user.companyId) {
          return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
        }

        success = await whatsAppOfficialService.disconnect(connectionId, req.user.id, req.user.companyId);
      }
      else {
        return res.status(400).json({ message: 'Connection type not supported for disconnect' });
      }

      if (success) {
        res.json({ message: 'WhatsApp disconnected successfully' });
      } else {
        res.status(500).json({ message: 'Failed to disconnect from WhatsApp' });
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });



  app.post('/api/whatsapp/reconnect/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        return res.status(400).json({ error: 'Invalid connection ID' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }


      if (connection.channelType === 'whatsapp_unofficial') {
        try {
          await whatsAppService.disconnect(connectionId, req.user.id);

        } catch (disconnectErr) {
          console.error('Error during disconnect phase:', disconnectErr);
        }

        await storage.updateChannelConnectionStatus(connectionId, 'reconnecting');

        setTimeout(async () => {
          try {
            await whatsAppService.connect(connectionId, req.user.id);

          } catch (connectErr) {
            console.error('Error during reconnection:', connectErr);
            await storage.updateChannelConnectionStatus(connectionId, 'error');
          }
        }, 1000);
      }
      else if (connection.channelType === 'whatsapp_official') {
        try {

          if (!req.user || !req.user.companyId) {
            return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
          }

          await whatsAppOfficialService.connect(connectionId, req.user.id, req.user.companyId);

        } catch (connectErr) {
          console.error('Error during WhatsApp Business API reconnect:', connectErr);
          await storage.updateChannelConnectionStatus(connectionId, 'error');
          return res.status(500).json({ error: connectErr instanceof Error ? connectErr.message : String(connectErr) });
        }
      }
      else {
        return res.status(400).json({ error: 'Only WhatsApp connections can be reconnected' });
      }

      res.status(200).json({ message: 'Reconnection initiated' });
    } catch (err: any) {
      console.error('Error reconnecting to WhatsApp:', err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/whatsapp/send/:connectionId', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CHANNELS, PERMISSIONS.MANAGE_CONVERSATIONS]), async (req: any, res) => {
    const connectionId = parseInt(req.params.connectionId);
    const { to, message } = req.body;
    let connection: any = null;

    try {
      if (!to || !message) {
        return res.status(400).json({ message: 'Missing required parameters' });
      }

      connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }


      let messageContent = message;
      try {
        const user = await storage.getUser(req.user.id);
        if (user) {
          const nameCandidates = [
            (user as any).fullName,
            (user as any).name,
            [(user as any).firstName, (user as any).lastName].filter(Boolean).join(' ').trim(),
            (user as any).displayName,
            typeof (user as any).email === 'string' ? (user as any).email.split('@')[0] : undefined
          ].filter((v: any) => typeof v === 'string' && v.trim().length > 0);
          const signatureName = nameCandidates[0];
          if (signatureName) {
            messageContent = `> *${signatureName}*\n\n${message}`;
          }
        }
      } catch (userError) {
        console.error('Error fetching user for signature in WhatsApp send:', userError);
      }

      let sentMessage;

      if (connection.channelType === 'whatsapp_unofficial') {
        sentMessage = await whatsAppService.sendMessage(connectionId, req.user.id, to, messageContent);
      }
      else if (connection.channelType === 'whatsapp_official') {
        try {

          if (!req.user || !req.user.companyId) {
            return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
          }

          sentMessage = await whatsAppOfficialService.sendMessage(connectionId, req.user.id, req.user.companyId, to, messageContent, false);
        } catch (error: any) {
          console.error(`Failed to send WhatsApp Business API message:`, error);
          return res.status(500).json({ message: error.message || 'Failed to send message' });
        }
      }
      else {
        return res.status(400).json({ message: 'Unsupported channel type for sending messages' });
      }

      if (sentMessage) {

        res.status(201).json(sentMessage);
      } else {
        console.error(`Failed to send WhatsApp message to ${to}`);
        res.status(500).json({ message: 'Failed to send WhatsApp message' });
      }
    } catch (err: any) {
      console.error('Error sending WhatsApp message:', err);
      res.status(400).json({ message: err.message });
    }
  });


  app.post('/api/link-preview', ensureAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const rateLimitKey = `${userId}-link-preview`;
      const now = Date.now();
      const rateLimitRecord = linkPreviewRateLimitStore.get(rateLimitKey);
      const windowMs = 60 * 1000; // 60 seconds
      const maxRequests = 10;


      if (rateLimitRecord && now < rateLimitRecord.resetTime) {
        if (rateLimitRecord.count >= maxRequests) {
          const retryAfter = Math.ceil((rateLimitRecord.resetTime - now) / 1000);
          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter
          });
        }
        rateLimitRecord.count++;
      } else {
        linkPreviewRateLimitStore.set(rateLimitKey, {
          count: 1,
          resetTime: now + windowMs
        });
      }


      let url = req.body.url?.trim() || '';
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }


      let validatedData;
      try {
        validatedData = validateBody(linkPreviewSchema, { url });
      } catch (validationError: any) {
        return res.status(400).json({
          success: false,
          error: validationError.message || 'Invalid request data'
        });
      }

      url = validatedData.url.trim();


      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();


        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.16.') ||
          hostname.startsWith('172.17.') ||
          hostname.startsWith('172.18.') ||
          hostname.startsWith('172.19.') ||
          hostname.startsWith('172.20.') ||
          hostname.startsWith('172.21.') ||
          hostname.startsWith('172.22.') ||
          hostname.startsWith('172.23.') ||
          hostname.startsWith('172.24.') ||
          hostname.startsWith('172.25.') ||
          hostname.startsWith('172.26.') ||
          hostname.startsWith('172.27.') ||
          hostname.startsWith('172.28.') ||
          hostname.startsWith('172.29.') ||
          hostname.startsWith('172.30.') ||
          hostname.startsWith('172.31.') ||
          hostname === '0.0.0.0' ||
          hostname.endsWith('.local')
        ) {
          return res.status(400).json({
            success: false,
            error: 'Invalid URL: Internal addresses are not allowed'
          });
        }


        try {
          const addresses = await dns.promises.lookup(hostname, { all: true });

          for (const addr of addresses) {
            const ip = addr.address;


            if (isPrivateOrReservedIP(ip)) {
              return res.status(400).json({
                success: false,
                error: 'Invalid URL: Internal addresses are not allowed'
              });
            }
          }
        } catch (dnsError: any) {




        }
      } catch (urlError) {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
      }


      let previewData;
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 10000); // 10 seconds
        });

        const previewPromise = getLinkPreview(url, {
          timeout: 10000,
          followRedirects: 'follow' as const,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        previewData = await Promise.race([previewPromise, timeoutPromise]);
      } catch (previewError: any) {

        if (previewError.message === 'Request timeout' || previewError.code === 'ETIMEDOUT') {
          return res.status(504).json({
            success: false,
            error: 'Request timeout: The URL took too long to respond'
          });
        }

        if (previewError.code === 'ENOTFOUND' || previewError.code === 'ECONNREFUSED') {
          return res.status(400).json({
            success: false,
            error: 'Invalid or unreachable URL'
          });
        }

        if (previewError.message && (previewError.message.includes('parse') || previewError.message.includes('Invalid'))) {
          return res.status(422).json({
            success: false,
            error: 'Unable to parse preview data from URL'
          });
        }


        console.error('Link preview error:', previewError);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch link preview'
        });
      }


      const response: any = {
        success: true,
        url: url,
        preview: {}
      };

      if (previewData) {
        if ((previewData as any).title) {
          response.preview.title = (previewData as any).title;
        }
        if ((previewData as any).description) {
          response.preview.description = (previewData as any).description;
        }
        if ((previewData as any).images && Array.isArray((previewData as any).images)) {
          response.preview.images = (previewData as any).images;
        } else if ((previewData as any).images) {
          response.preview.images = [(previewData as any).images];
        }
        if ((previewData as any).siteName) {
          response.preview.siteName = (previewData as any).siteName;
        }
        if ((previewData as any).mediaType) {
          response.preview.mediaType = (previewData as any).mediaType;
        }
        if ((previewData as any).contentType) {
          response.preview.contentType = (previewData as any).contentType;
        }
        if ((previewData as any).favicons && Array.isArray((previewData as any).favicons)) {
          response.preview.favicons = (previewData as any).favicons;
        } else if ((previewData as any).favicons) {
          response.preview.favicons = [(previewData as any).favicons];
        }
      }

      return res.json(response);
    } catch (error: any) {
      console.error('Link preview endpoint error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  app.post('/api/whatsapp/test-template/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { phoneNumber, templateName = 'hello_world', languageCode = 'en_US' } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }


      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
      }


      if (connection.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Access denied: Connection does not belong to your company' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to use this connection' });
      }

      if (connection.channelType !== 'whatsapp_official') {
        return res.status(400).json({ error: 'Template testing only supported for WhatsApp Business API connections' });
      }

      const result = await whatsAppOfficialService.sendWhatsAppTestTemplate(
        connectionId,
        req.user.companyId,
        phoneNumber,
        templateName,
        languageCode
      );

      if (result.success) {
        res.json({
          success: true,
          message: 'Template message sent successfully',
          messageId: result.messageId
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to send template message'
        });
      }
    } catch (err: any) {
      console.error('Error testing WhatsApp template:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.post('/api/conversations/:id/upload-media-old', ensureAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { caption = '', mediaType = 'auto' } = req.body;

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, conversationId)
      });

      if (!conversation) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!conversation.channelId) {
        await fsExtra.unlink(req.file.path);
        return res.status(400).json({ error: 'Conversation has no channel ID' });
      }

      if (conversation.channelType !== 'whatsapp' && conversation.channelType !== 'whatsapp_unofficial' && conversation.channelType !== 'whatsapp_official') {
        await fsExtra.unlink(req.file.path);
        return res.status(400).json({ error: 'Media upload only supported for WhatsApp channels' });
      }

      let determinedMediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (mediaType === 'auto') {
        if (req.file.mimetype.startsWith('image/')) {
          determinedMediaType = 'image';
        } else if (req.file.mimetype.startsWith('video/')) {
          determinedMediaType = 'video';
        } else if (req.file.mimetype.startsWith('audio/')) {
          determinedMediaType = 'audio';
        } else {
          determinedMediaType = 'document';
        }
      } else {
        if (['image', 'video', 'audio', 'document'].includes(mediaType)) {
          determinedMediaType = mediaType as 'image' | 'video' | 'audio' | 'document';
        }
      }

      if (!conversation.contactId) {
        await fsExtra.unlink(req.file.path);
        return res.status(400).json({ error: 'Individual conversation missing contact ID' });
      }

      const contact = await db.query.contacts.findFirst({
        where: eq(contacts.id, conversation.contactId)
      });

      if (!contact) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Contact not found' });
      }

      let message;

      if (conversation.channelType === 'whatsapp_official') {

        if (!req.user || !req.user.companyId) {
          await fsExtra.unlink(req.file.path);
          return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
        }

        const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.path)}`;

        const publicPath = path.join(process.cwd(), 'uploads', path.basename(req.file.path));
        await fsExtra.copy(req.file.path, publicPath);

        message = await whatsAppOfficialService.sendMedia(
          conversation.channelId,
          req.user.id,
          req.user.companyId,
          contact.identifier || contact.phone || '',
          determinedMediaType,
          publicUrl,
          caption,
          req.file.originalname,
          undefined,
          false
        );
      } else {
        message = await whatsAppService.sendMedia(
          conversation.channelId,
          req.user.id,
          contact.identifier || contact.phone || '',
          determinedMediaType,
          req.file.path,
          caption,
          req.file.originalname,
          false,
          conversationId
        );
      }

      if (!message) {
        await fsExtra.unlink(req.file.path);
        return res.status(500).json({ error: 'Failed to send media message' });
      }

      await fsExtra.unlink(req.file.path);

      return res.status(201).json(message);
    } catch (error: any) {
      console.error('Error uploading media:', error);

      if (req.file && req.file.path) {
        try {
          await fsExtra.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  app.get('/api/contacts', ensureAuthenticated, ensureActiveSubscription, async (req, res) => {
    try {
      const user = req.user as any;


      const permissions = await getUserPermissions(user);
      const hasViewOwnContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_OWN_CONTACTS] === true;
      const hasViewAssignedContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_ASSIGNED_CONTACTS] === true;
      const hasViewCompanyContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_COMPANY_CONTACTS] === true;


      const hasLegacyViewContacts = permissions[PERMISSIONS.VIEW_CONTACTS] === true || permissions[PERMISSIONS.MANAGE_CONTACTS] === true;
      const hasLegacyAccess = hasLegacyViewContacts && hasViewCompanyContacts;


      if (!hasViewOwnContacts && !hasViewAssignedContacts && !hasViewCompanyContacts && !hasLegacyAccess) {
        return res.status(403).json({ message: 'You do not have permission to view contacts' });
      }



      let contactScope: 'own' | 'assigned' | 'company' | undefined = undefined;
      if (user.isSuperAdmin) {
        contactScope = 'company';
      } else if (hasViewCompanyContacts || hasLegacyAccess) {
        contactScope = 'company';
      } else if (hasViewAssignedContacts) {
        contactScope = 'assigned';
      } else if (hasViewOwnContacts) {
        contactScope = 'own';
      }


      if (!user.isSuperAdmin && !contactScope) {
        return res.status(403).json({ message: 'You do not have permission to view contacts' });
      }

      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const search = req.query.search as string || undefined;
      const channel = req.query.channel as string || undefined;
      const tags = req.query.tags ? (req.query.tags as string).split(',').map(tag => tag.trim()).filter(Boolean) : undefined;
      const includeArchived = req.query.includeArchived === 'true';
      const archivedOnly = req.query.archivedOnly === 'true';
      const dateRange = req.query.dateRange as string || undefined;

      const companyId = user.isSuperAdmin ? undefined : user.companyId;

      const result = await storage.getContacts({
        page,
        limit,
        search,
        channel,
        tags,
        companyId,
        includeArchived,
        archivedOnly,
        dateRange,
        userId: user.id,
        contactScope
      });

      if (!user.isSuperAdmin && permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
        result.contacts = result.contacts.map(c => ({ ...c, phone: null, identifier: null }));
      }

      res.json(result);
    } catch (error) {
      console.error('[Contacts API] Error fetching contacts:', error);
      res.status(500).json({ message: 'Failed to fetch contacts' });
    }
  });

  app.get('/api/contacts/csv-template', ensureAuthenticated, (req, res) => {
    try {
      const headers = ['name', 'phone', 'email', 'company', 'tags', 'notes'];
      const sampleData = [
        'John Doe,+1234567890,john@example.com,Acme Corp,"vip,customer",Important client',
        'Jane Smith,+0987654321,jane@example.com,Tech Inc,"lead,prospect",New lead from website',
        'Bob Johnson,+1122334455,bob@example.com,StartupXYZ,"customer",Regular customer'
      ];

      const csvContent = [headers.join(','), ...sampleData].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contact_import_template.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error('Error generating CSV template:', error);
      res.status(500).json({ error: 'Failed to generate CSV template' });
    }
  });

  app.get('/api/contacts/tags', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      const tags = await storage.getContactTags(user.companyId);
      return res.status(200).json(tags);
    } catch (error) {
      console.error('Error fetching contact tags:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/contacts/scrape-whatsapp', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { startingNumber, count, connectionId } = req.body;

      if (!startingNumber || !count || !connectionId) {
        return res.status(400).json({
          error: 'Starting number, count, and connection ID are required'
        });
      }

      if (count > 1000) {
        return res.status(400).json({
          error: 'Count cannot exceed 1000 for performance reasons'
        });
      }

      const phoneRegex = /^\d{10,15}$/;
      if (!phoneRegex.test(startingNumber)) {
        return res.status(400).json({
          error: 'Invalid phone number format. Use digits only (10-15 digits)'
        });
      }

      const whatsAppService = await import('./services/channels/whatsapp');

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'WhatsApp connection not found' });
      }

      if (!user.isSuperAdmin && connection.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied to this connection' });
      }

      if (connection.channelType !== 'whatsapp_unofficial' && connection.channelType !== 'whatsapp') {
        return res.status(400).json({
          error: 'This feature only works with unofficial WhatsApp connections'
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      res.write(`data: ${JSON.stringify({
        type: 'started',
        message: 'Scraping started',
        totalToCheck: parseInt(count)
      })}\n\n`);

      const progressCallback = (update: any) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      try {
        const results = await whatsAppService.scrapeWhatsAppContactsWithProgress(
          connectionId,
          startingNumber,
          parseInt(count),
          progressCallback
        );

        res.write(`data: ${JSON.stringify({
          type: 'completed',
          results: results.validNumbers,
          totalChecked: results.totalChecked,
          validCount: results.validNumbers.length,
          errors: results.errors
        })}\n\n`);

        res.end();

      } catch (error) {
        console.error('Error during scraping:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Failed to scrape WhatsApp contacts',
          details: error instanceof Error ? error.message : 'Unknown error'
        })}\n\n`);
        res.end();
      }

    } catch (error) {
      console.error('Error setting up scraping:', error);
      res.status(500).json({
        error: 'Failed to start scraping process',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/contacts/scrape-google-maps', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { searchTerm, maxResults, connectionId, location } = req.body;

      if (!searchTerm || !connectionId) {
        return res.status(400).json({
          error: 'Search term and connection ID are required'
        });
      }

      const maxResultsNum = maxResults ? parseInt(maxResults) : 20;
      if (isNaN(maxResultsNum) || maxResultsNum < 1 || maxResultsNum > GOOGLE_MAPS_SCRAPE_MAX_RESULTS) {
        return res.status(400).json({
          error: `Max results must be between 1 and ${GOOGLE_MAPS_SCRAPE_MAX_RESULTS}`
        });
      }

      if (searchTerm.length > 200) {
        return res.status(400).json({
          error: 'Search term cannot exceed 200 characters'
        });
      }

      if (location && (typeof location !== 'string' || location.length > 100)) {
        return res.status(400).json({
          error: 'Location must be a string under 100 characters'
        });
      }

      const whatsAppService = await import('./services/channels/whatsapp');
      const googleMapsScraper = await import('./services/google-maps-scraper');

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ error: 'WhatsApp connection not found' });
      }

      if (!connection.companyId) {
        return res.status(400).json({ error: 'Connection must be associated with a company' });
      }

      if (!user.isSuperAdmin && connection.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied to this connection' });
      }

      if (connection.channelType !== 'whatsapp_unofficial' && connection.channelType !== 'whatsapp') {
        return res.status(400).json({
          error: 'This feature only works with unofficial WhatsApp connections'
        });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      res.write(`data: ${JSON.stringify({
        type: 'started',
        message: 'Scraping started',
        totalToCheck: maxResultsNum
      })}\n\n`);

      const progressCallback = (update: any) => {
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      };

      try {
        const results = await googleMapsScraper.scrapeGoogleMapsContactsWithProgress(
          connectionId,
          searchTerm.trim(),
          maxResultsNum,
          progressCallback,
          location || undefined
        );

        res.write(`data: ${JSON.stringify({
          type: 'completed',
          results: results.validNumbers,
          totalChecked: results.totalChecked,
          validCount: results.validNumbers.length,
          errors: results.errors
        })}\n\n`);

        res.end();

      } catch (error) {
        console.error('Error during scraping:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Failed to scrape Google Maps contacts',
          details: error instanceof Error ? error.message : 'Unknown error'
        })}\n\n`);
        res.end();
      }

    } catch (error) {
      console.error('Error setting up Google Maps scraping:', error);
      res.status(500).json({
        error: 'Failed to start scraping process',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/contacts/export', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }


      const permissions = await getUserPermissions(user);
      const hasViewOwnContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_OWN_CONTACTS] === true;
      const hasViewAssignedContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_ASSIGNED_CONTACTS] === true;
      const hasViewCompanyContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_COMPANY_CONTACTS] === true;


      const hasLegacyViewContacts = permissions[PERMISSIONS.VIEW_CONTACTS] === true || permissions[PERMISSIONS.MANAGE_CONTACTS] === true;
      const hasLegacyAccess = hasLegacyViewContacts && hasViewCompanyContacts;


      if (!hasViewOwnContacts && !hasViewAssignedContacts && !hasViewCompanyContacts && !hasLegacyAccess) {
        return res.status(403).json({ message: 'You do not have permission to export contacts' });
      }



      let contactScope: 'own' | 'assigned' | 'company' | undefined = undefined;
      if (user.isSuperAdmin) {
        contactScope = 'company';
      } else if (hasViewCompanyContacts || hasLegacyAccess) {
        contactScope = 'company';
      } else if (hasViewAssignedContacts) {
        contactScope = 'assigned';
      } else if (hasViewOwnContacts) {
        contactScope = 'own';
      }


      if (!user.isSuperAdmin && !contactScope) {
        return res.status(403).json({ message: 'You do not have permission to export contacts' });
      }

      const { exportScope, tags, createdAfter, createdBefore, search, channel } = req.body;

      const exportOptions = {
        companyId: user.companyId,
        exportScope: exportScope || 'all',
        tags: tags && Array.isArray(tags) ? tags : undefined,
        createdAfter: createdAfter || undefined,
        createdBefore: createdBefore || undefined,
        search: search || undefined,
        channel: channel || undefined,
        userId: user.id,
        contactScope
      };


      const contacts = await storage.getContactsForExport(exportOptions);


      const canViewPhone = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;

      const escapeCsvField = (value: any): string => {
        if (value === null || value === undefined) {
          return '""';
        }

        let str = String(value).replace(/\n/g, ' ').replace(/\r/g, '');

        str = str.replace(/"/g, '""');

        return `"${str}"`;
      };


      const formatDate = (date: Date | string | null | undefined): string => {
        if (!date) return '';
        try {
          const d = typeof date === 'string' ? new Date(date) : date;
          return d.toISOString();
        } catch {
          return '';
        }
      };

      const headers = [
        'ID',
        'Name',
        'Email',
        'Phone',
        'Company',
        'Tags',
        'Channel Type',
        'Channel Identifier',
        'Source',
        'Notes',
        'Created At',
        'Updated At'
      ];

      const csvRows = [headers.join(',')];

      contacts.forEach(contact => {
        const row = [
          escapeCsvField(contact.id),
          escapeCsvField(contact.name),
          escapeCsvField(contact.email),
          escapeCsvField(canViewPhone ? contact.phone : ''),
          escapeCsvField(contact.company),
          escapeCsvField((contact.tags || []).join(', ')),
          escapeCsvField(contact.identifierType),
          escapeCsvField(canViewPhone ? contact.identifier : ''),
          escapeCsvField(contact.source),
          escapeCsvField(contact.notes),
          escapeCsvField(formatDate(contact.createdAt)),
          escapeCsvField(formatDate(contact.updatedAt))
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `contacts_export_${timestamp}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Exported-Count', contacts.length.toString());
      res.send(csvContent);

    } catch (error) {
      console.error('Error exporting contacts:', error);
      res.status(500).json({ message: 'Error exporting contacts' });
    }
  });

  app.get('/api/contacts/without-conversations', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { search, limit, offset } = req.query;

      if (!user || !user.companyId) {
        return res.status(400).json({
          message: 'User must be associated with a company'
        });
      }


      const permissions = await getUserPermissions(user);
      const hasViewOwnContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_OWN_CONTACTS] === true;
      const hasViewAssignedContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_ASSIGNED_CONTACTS] === true;
      const hasViewCompanyContacts = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_COMPANY_CONTACTS] === true;


      const hasLegacyViewContacts = permissions[PERMISSIONS.VIEW_CONTACTS] === true || permissions[PERMISSIONS.MANAGE_CONTACTS] === true;
      const hasLegacyAccess = hasLegacyViewContacts && hasViewCompanyContacts;


      if (!hasViewOwnContacts && !hasViewAssignedContacts && !hasViewCompanyContacts && !hasLegacyAccess) {
        return res.status(403).json({ message: 'You do not have permission to view contacts' });
      }



      let contactScope: 'own' | 'assigned' | 'company' | undefined = undefined;
      if (user.isSuperAdmin) {
        contactScope = 'company';
      } else if (hasViewCompanyContacts || hasLegacyAccess) {
        contactScope = 'company';
      } else if (hasViewAssignedContacts) {
        contactScope = 'assigned';
      } else if (hasViewOwnContacts) {
        contactScope = 'own';
      }


      if (!user.isSuperAdmin && !contactScope) {
        return res.status(403).json({ message: 'You do not have permission to view contacts' });
      }

      let parsedLimit: number | undefined;
      let parsedOffset: number | undefined;

      if (limit) {
        parsedLimit = parseInt(limit as string);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
          return res.status(400).json({
            message: 'Invalid limit parameter. Must be between 1 and 100.'
          });
        }
      }

      if (offset) {
        parsedOffset = parseInt(offset as string);
        if (isNaN(parsedOffset) || parsedOffset < 0) {
          return res.status(400).json({
            message: 'Invalid offset parameter. Must be non-negative.'
          });
        }
      }

      const searchTerm = search as string;
      if (searchTerm && searchTerm.length > 100) {
        return res.status(400).json({
          message: 'Search term too long. Maximum 100 characters.'
        });
      }

      const result = await storage.getContactsWithoutConversations(user.companyId, {
        search: searchTerm,
        limit: parsedLimit,
        offset: parsedOffset,
        userId: user.id,
        contactScope: contactScope
      });

      if (!user.isSuperAdmin && permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
        result.contacts = result.contacts.map(c => ({ ...c, phone: null, identifier: null }));
      }

      res.json(result);

    } catch (error: any) {
      res.status(500).json({
        message: 'Failed to get contacts without conversations',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  app.post('/api/contacts/:contactId/create-conversation', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const contactId = parseInt(req.params.contactId);

      if (isNaN(contactId)) {
        return res.status(400).json({ message: 'Invalid contact ID' });
      }

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      const conversation = await storage.createConversationForContact(contactId, user.id);

      if (!conversation) {
        return res.status(400).json({ message: 'Failed to create conversation for contact' });
      }

      res.json(conversation);
    } catch (error) {
      console.error('Error creating conversation for contact:', error);
      res.status(500).json({ message: 'Failed to create conversation for contact' });
    }
  });

  app.get('/api/contacts/:id', ensureAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const contact = await storage.getContact(id);

      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      if (isWhatsAppGroupChatId(contact.phone) || isWhatsAppGroupChatId(contact.identifier)) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      if (!user.isSuperAdmin) {
        const permissions = await getUserPermissions(user);
        if (permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
          return res.json({ ...contact, phone: null, identifier: null });
        }
      }

      res.json(contact);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch contact' });
    }
  });

  app.patch('/api/contacts/:id', ensureAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      const updateData = req.body;


      if (updateData.identifierType && !updateData.source) {
        if (updateData.identifierType === 'whatsapp_official') {
          updateData.source = 'whatsapp_official';
        } else if (updateData.identifierType === 'whatsapp_unofficial' || updateData.identifierType === 'whatsapp') {
          updateData.source = 'whatsapp';
        } else if (updateData.identifierType === 'messenger') {
          updateData.source = 'messenger';
        } else if (updateData.identifierType === 'instagram') {
          updateData.source = 'instagram';
        }
      }

      const updatedContact = await storage.updateContact(id, updateData);


      const changedFields = Object.keys(updateData).filter(key =>
        contact[key as keyof typeof contact] !== updateData[key]
      );

      if (changedFields.length > 0) {
        const oldValues: any = {};
        const newValues: any = {};

        changedFields.forEach(field => {
          oldValues[field] = contact[field as keyof typeof contact];
          newValues[field] = updateData[field];
        });

        await logContactAudit({
          companyId: contact.companyId!,
          contactId: contact.id,
          userId: (req.user as any)?.id,
          actionType: 'updated',
          actionCategory: 'contact',
          description: `Contact updated: ${changedFields.join(', ')} changed`,
          oldValues,
          newValues,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });
      }

      const user = req.user as any;
      const permissions = await getUserPermissions(user);
      const canViewPhone = user.isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      const contactForBroadcast = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactUpdated',
          data: contactForBroadcast
        });
      }

      if (!user.isSuperAdmin && !canViewPhone) {
        return res.json({ ...updatedContact, phone: null, identifier: null });
      }
      res.json(updatedContact);
    } catch (error) {
      console.error('Error updating contact:', error);
      res.status(500).json({ message: 'Failed to update contact' });
    }
  });


  app.post('/api/contacts/:id/archive', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const existingContact = await storage.getContact(id);
      if (!existingContact || existingContact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (existingContact.isArchived) {
        return res.status(400).json({ error: 'Contact is already archived' });
      }

      const contact = await storage.archiveContact(id);


      await logContactAudit({
        companyId: contact.companyId!,
        contactId: contact.id,
        userId: req.user.id,
        actionType: 'archived',
        actionCategory: 'contact',
        description: `Contact archived: ${contact.name}`,
        oldValues: { isArchived: false },
        newValues: { isArchived: true },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      const contactForBroadcast = canViewPhone ? contact : { ...contact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactArchived',
          data: contactForBroadcast
        });
      }

      if (!(req.user as any).isSuperAdmin && !canViewPhone) {
        return res.json({ ...contact, phone: null, identifier: null });
      }
      res.json(contact);
    } catch (error) {
      console.error('Error archiving contact:', error);
      res.status(500).json({ error: 'Failed to archive contact' });
    }
  });


  app.delete('/api/contacts/:id/archive', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const existingContact = await storage.getContact(id);
      if (!existingContact || existingContact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (!existingContact.isArchived) {
        return res.status(400).json({ error: 'Contact is not archived' });
      }

      const contact = await storage.unarchiveContact(id);


      await logContactAudit({
        companyId: contact.companyId!,
        contactId: contact.id,
        userId: req.user.id,
        actionType: 'unarchived',
        actionCategory: 'contact',
        description: `Contact unarchived: ${contact.name}`,
        oldValues: { isArchived: true },
        newValues: { isArchived: false },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      const contactForBroadcast = canViewPhone ? contact : { ...contact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactUnarchived',
          data: contactForBroadcast
        });
      }

      if (!(req.user as any).isSuperAdmin && !canViewPhone) {
        return res.json({ ...contact, phone: null, identifier: null });
      }
      res.json(contact);
    } catch (error) {
      console.error('Error unarchiving contact:', error);
      res.status(500).json({ error: 'Failed to unarchive contact' });
    }
  });

  app.delete('/api/contacts/bulk', ensureAuthenticated, async (req: any, res) => {
    try {
      const { contactIds } = req.body;

      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({ error: 'Contact IDs array is required' });
      }

      const validIds = contactIds.filter(id => {
        const numId = Number(id);
        return Number.isInteger(numId) && numId > 0;
      });

      if (validIds.length !== contactIds.length) {
        const invalidIds = contactIds.filter(id => {
          const numId = Number(id);
          return !Number.isInteger(numId) || numId <= 0;
        });
        console.error('Invalid contact IDs:', invalidIds);
        return res.status(400).json({
          error: `Invalid contact IDs: ${invalidIds.join(', ')}. All contact IDs must be valid positive integers.`
        });
      }

      const results = {
        successful: [] as number[],
        failed: [] as { id: number; error: string }[],
        total: contactIds.length
      };

      const batchSize = 10;
      for (let i = 0; i < contactIds.length; i += batchSize) {
        const batch = contactIds.slice(i, i + batchSize);

        await Promise.all(batch.map(async (contactId: any) => {
          try {
            const numericContactId = Number(contactId);

            const contact = await storage.getContact(numericContactId);
            if (!contact) {
              results.failed.push({ id: numericContactId, error: 'Contact not found' });
              return;
            }

            if (contact.companyId !== req.user.companyId) {
              results.failed.push({ id: numericContactId, error: 'Access denied' });
              return;
            }

            const result = await storage.deleteContact(numericContactId);
            if (result.success) {
              results.successful.push(numericContactId);


              if (result.mediaFiles && result.mediaFiles.length > 0) {
                try {
                  const { MediaCleanupService } = await import('./services/media-cleanup');
                  const mediaCleanup = new MediaCleanupService();
                  const cleanupResult = await mediaCleanup.cleanupConversationMedia(result.mediaFiles);

                } catch (cleanupError) {
                  console.error(`Error during media cleanup for contact ${numericContactId}:`, cleanupError);

                }
              }
            } else {
              results.failed.push({ id: numericContactId, error: result.error || 'Failed to delete contact' });
            }
          } catch (error) {
            console.error(`Error deleting contact ${contactId}:`, error);
            results.failed.push({
              id: Number(contactId),
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }));
      }

      if (results.successful.length > 0) {

        results.successful.forEach(contactId => {
          broadcastToAll({
            type: 'contactDeleted',
            data: {
              contactId: contactId,
              companyId: req.user.companyId
            }
          });
        });


        broadcastToAll({
          type: 'contactsBulkDeleted',
          data: {
            deletedIds: results.successful,
            companyId: req.user.companyId
          }
        });
      }

      res.json(results);

    } catch (error) {
      console.error('Error in bulk delete contacts:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete contacts'
      });
    }
  });

  app.delete('/api/contacts/:id', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = req.user.companyId;

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid contact ID'
        });
      }

      const contact = await storage.getContact(id);
      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found'
        });
      }


      if (contact.companyId !== companyId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const result = await storage.deleteContact(id);

      if (result.success) {

        if (result.mediaFiles && result.mediaFiles.length > 0) {
          const { MediaCleanupService } = await import('./services/media-cleanup');
          const mediaCleanup = new MediaCleanupService();

          try {
            const cleanupResult = await mediaCleanup.cleanupConversationMedia(result.mediaFiles);

          } catch (cleanupError) {
            console.error('Error during media cleanup:', cleanupError);

          }
        }


        broadcastToAll({
          type: 'contactDeleted',
          data: {
            contactId: id,
            companyId: companyId
          }
        });

        res.json({
          success: true,
          message: 'Contact and all associated data deleted successfully',
          deletedMediaFiles: result.mediaFiles?.length || 0
        });
      } else {
        res.status(500).json({
          success: false,
          message: result.error || 'Failed to delete contact'
        });
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      res.status(500).json({
        success: false,
        message: 'Server error'
      });
    }
  });

  app.post('/api/contacts', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const contactData = validateBody(insertContactSchema, {
        ...req.body,
        companyId: req.user.companyId,
        createdBy: req.user.id
      });


      if (contactData.phone && isWhatsAppGroupChatId(contactData.phone)) {
        return res.status(400).json({
          message: 'Cannot create contacts with WhatsApp group chat IDs'
        });
      }

      if (contactData.identifier && isWhatsAppGroupChatId(contactData.identifier)) {
        return res.status(400).json({
          message: 'Cannot create contacts with WhatsApp group chat IDs'
        });
      }

      const contact = await storage.getOrCreateContact(contactData);


      await logContactAudit({
        companyId: req.user.companyId,
        contactId: contact.id,
        userId: req.user.id,
        actionType: 'created',
        actionCategory: 'contact',
        description: `Contact created: ${contact.name}`,
        newValues: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          company: contact.company
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });


      try {
        const autoAddEnabled = await getCachedCompanySetting(req.user.companyId, 'autoAddContactToPipeline');
        if (autoAddEnabled) {

          const initialStage = await getCachedInitialPipelineStage(req.user.companyId);
          if (initialStage) {

            const existingDeal = await storage.getActiveDealByContact(contact.id, req.user.companyId, initialStage.pipelineId);
            if (!existingDeal) {
              const deal = await storage.createDeal({
                companyId: req.user.companyId,
                contactId: contact.id,
                title: `New Lead - ${contact.name}`,
                pipelineId: initialStage.pipelineId,
                stageId: initialStage.id,
                stage: 'lead'
              });
              await storage.createDealActivity({
                dealId: deal.id,
                userId: req.user.id,
                type: 'create',
                content: 'Deal automatically created when contact was added'
              });
            }
          }
        }
      } catch (error) {
        console.error('Error auto-adding contact to pipeline:', error);

      }

      if (!(req.user as any).isSuperAdmin) {
        const permissions = await getUserPermissions(req.user);
        if (permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
          return res.status(201).json({ ...contact, phone: null, identifier: null });
        }
      }
      res.status(201).json(contact);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const csvUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(process.cwd(), 'uploads', 'csv');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `contacts-import-${timestamp}-${file.originalname}`;
      cb(null, filename);
    }
  });

  const csvUpload = multer({
    storage: csvUploadStorage,
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV files are allowed.'));
      }
    }
  });

  app.post('/api/contacts/import-for-segment', ensureAuthenticated, csvUpload.single('csvFile'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No CSV file provided' });
      }

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;

      const { duplicateHandling = 'skip', columnMapping } = req.body;
      const companyId = req.user.companyId;
      let mapping: Record<string, string> = {};

      try {
        mapping = columnMapping ? JSON.parse(columnMapping) : {};
      } catch (error) {
        console.error('Error parsing column mapping:', error);
      }

      const csvData = fs.readFileSync(req.file.path, 'utf8');
      const lines = csvData.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV file must contain at least a header row and one data row' });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));


      const nameColumn = Object.keys(mapping).find(key => mapping[key] === 'name');
      if (!nameColumn) {
        return res.status(400).json({
          error: 'Name field must be mapped to import contacts'
        });
      }

      let successful = 0;
      let failed = 0;
      const errors: string[] = [];
      const importedContacts: any[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const contactData: any = { companyId, createdBy: req.user.id };

          headers.forEach((header, index) => {
            const mappedField = mapping[header];
            const value = values[index] || '';

            if (mappedField && mappedField !== '__skip__' && value) {
              switch (mappedField) {
                case 'name':
                  contactData.name = value;
                  break;
                case 'email':
                  contactData.email = value;
                  break;
                case 'phone':
                  contactData.phone = value;
                  break;
                case 'company':
                  contactData.company = value;
                  break;
                case 'notes':
                  contactData.notes = value;
                  break;
                case 'tags':
                  contactData.tags = value.split(',').map(t => t.trim()).filter(Boolean);
                  break;
                case 'identifierType':
                case 'identifier_type':
                  contactData.identifierType = value;
                  break;
                case 'identifier':
                  contactData.identifier = value;
                  break;
                case 'source':
                  contactData.source = value;
                  break;
              }
            }
          });


          if (!contactData.source) {
            if (contactData.identifierType === 'whatsapp_official') {
              contactData.source = 'whatsapp_official';
            } else if (contactData.identifierType === 'whatsapp_unofficial' || contactData.identifierType === 'whatsapp') {
              contactData.source = 'whatsapp';
            } else if (contactData.identifierType === 'messenger') {
              contactData.source = 'messenger';
            } else if (contactData.identifierType === 'instagram') {
              contactData.source = 'instagram';
            } else {
              contactData.source = 'csv_import';
            }
          }
          contactData.isActive = true;

          if (!contactData.name || contactData.name.trim() === '') {
            errors.push(`Row ${i + 1}: Name is required`);
            failed++;
            continue;
          }

          if (contactData.phone) {
            const phoneValidation = validatePhoneNumberUtil(contactData.phone);
            if (!phoneValidation.isValid) {
              errors.push(`Row ${i + 1}: ${phoneValidation.error}`);
              failed++;
              continue;
            }
          }

          let contact: any;

          if (duplicateHandling === 'create') {
            contact = await storage.createContact(contactData);
          } else if (duplicateHandling === 'skip') {
            const existingByPhone = contactData.phone ? await storage.getContactByPhone(contactData.phone, companyId) : null;
            const existingByEmail = contactData.email ? await storage.getContactByEmail(contactData.email, companyId) : null;

            if (existingByPhone || existingByEmail) {
              continue;
            }

            contact = await storage.createContact(contactData);
          } else {
            contact = await storage.getOrCreateContact(contactData);
          }


          try {
            const autoAddEnabled = await getCachedCompanySetting(companyId, 'autoAddContactToPipeline');
            if (autoAddEnabled) {

              const initialStage = await getCachedInitialPipelineStage(companyId);
              if (initialStage) {

                const existingDeal = await storage.getActiveDealByContact(contact.id, companyId, initialStage.pipelineId);
                if (!existingDeal) {
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
                    userId: req.user.id,
                    type: 'create',
                    content: 'Deal automatically created when contact was added'
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error auto-adding contact to pipeline:', error);

          }

          importedContacts.push(contact);
          successful++;

        } catch (error) {
          console.error(`Error processing row ${i + 1}:`, error);
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          failed++;
        }
      }

      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up CSV file:', cleanupError);
      }

      const sanitizedImported = canViewPhone
        ? importedContacts.slice(0, 50)
        : importedContacts.slice(0, 50).map(c => ({ ...c, phone: null, identifier: null }));

      res.json({
        successful,
        failed,
        errors: errors.slice(0, 10),
        importedContacts: sanitizedImported
      });

    } catch (error) {
      console.error('Error importing contacts for segment:', error);

      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to import contacts'
      });
    }
  });



  app.post('/api/contacts/import', ensureAuthenticated, csvUpload.single('csvFile'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No CSV file provided' });
      }

      const { duplicateHandling = 'skip' } = req.body;
      const companyId = req.user.companyId;

      const csvData = fs.readFileSync(req.file.path, 'utf8');
      const lines = csvData.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return res.status(400).json({ error: 'CSV file must contain at least a header row and one data row' });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      const requiredHeaders = ['name'];

      const headersLowercase = headers.map(h => h.toLowerCase());
      const missingHeaders = requiredHeaders.filter(h => !headersLowercase.includes(h));

      if (missingHeaders.length > 0) {
        return res.status(400).json({
          error: `Missing required headers: ${missingHeaders.join(', ')}`
        });
      }

      let successful = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const contactData: any = { companyId, createdBy: req.user.id };

          headers.forEach((header, index) => {
            const value = values[index] || '';
            switch (header.toLowerCase()) {
              case 'name':
                contactData.name = value;
                break;
              case 'email':
                contactData.email = value || null;
                break;
              case 'phone':
                contactData.phone = value || null;
                break;
              case 'company':
                contactData.company = value || null;
                break;
              case 'identifiertype':
              case 'identifier_type':
              case 'channel type':
                contactData.identifierType = value || null;
                break;
              case 'identifier':
              case 'channel identifier':
                contactData.identifier = value || null;
                break;
              case 'notes':
                contactData.notes = value || null;
                break;
              case 'tags':
                contactData.tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : null;
                break;
              case 'source':
                contactData.source = value || 'csv_import';
                break;
            }
          });


          if (!contactData.source || contactData.source === 'csv_import') {
            if (contactData.identifierType === 'whatsapp_official') {
              contactData.source = 'whatsapp_official';
            } else if (contactData.identifierType === 'whatsapp_unofficial' || contactData.identifierType === 'whatsapp') {
              contactData.source = 'whatsapp';
            } else if (contactData.identifierType === 'messenger') {
              contactData.source = 'messenger';
            } else if (contactData.identifierType === 'instagram') {
              contactData.source = 'instagram';
            } else {
              contactData.source = 'csv_import';
            }
          }
          contactData.isActive = true;

          if (!contactData.name || contactData.name.trim() === '') {
            errors.push(`Row ${i + 1}: Name is required`);
            failed++;
            continue;
          }

          let contact: any;
          if (duplicateHandling === 'create') {
            contact = await storage.createContact(contactData);
          } else if (duplicateHandling === 'skip') {
            const existingByPhone = contactData.phone ? await storage.getContactByPhone(contactData.phone, companyId) : null;
            const existingByEmail = contactData.email ? await storage.getContactByEmail(contactData.email, companyId) : null;

            if (existingByPhone || existingByEmail) {
              continue;
            }

            contact = await storage.createContact(contactData);
          } else {
            contact = await storage.getOrCreateContact(contactData);
          }


          try {
            const autoAddEnabled = await getCachedCompanySetting(companyId, 'autoAddContactToPipeline');
            if (autoAddEnabled) {

              const initialStage = await getCachedInitialPipelineStage(companyId);
              if (initialStage) {

                const existingDeal = await storage.getActiveDealByContact(contact.id, companyId, initialStage.pipelineId);
                if (!existingDeal) {
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
                    userId: req.user.id,
                    type: 'create',
                    content: 'Deal automatically created when contact was added'
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error auto-adding contact to pipeline:', error);

          }

          successful++;

        } catch (error) {
          console.error(`Error processing row ${i + 1}:`, error);
          errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          failed++;
        }
      }

      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up CSV file:', cleanupError);
      }

      res.json({
        successful,
        failed,
        errors: errors.slice(0, 10)
      });

    } catch (error) {
      console.error('Error importing contacts:', error);

      if (req.file && req.file.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to import contacts'
      });
    }
  });

  app.post('/api/contacts/:id/avatar', ensureAuthenticated, upload.single('avatar'), async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.id);

      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const contact = await storage.getContact(contactId);
      if (!contact) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ message: 'Contact not found' });
      }

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        await fsExtra.unlink(req.file.path);
        return res.status(400).json({ message: 'Invalid file type. Only images are allowed.' });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;


      let previousAvatarSize = 0;
      if (contact.avatarUrl && contact.avatarUrl.startsWith('/uploads/')) {
        try {
          const previousAvatarPath = path.join(process.cwd(), contact.avatarUrl.substring(1));
          if (await fsExtra.pathExists(previousAvatarPath)) {
            const stats = await fsExtra.stat(previousAvatarPath);
            previousAvatarSize = stats.size;
          }
        } catch (error) {

        }
      }

      const updatedContact = await storage.updateContact(contactId, {
        avatarUrl
      });


      if (contact.companyId && req.file) {

        dataUsageTracker.trackFileUpload(contact.companyId, req.file.size).catch(err => {
          console.error('Failed to track contact avatar upload:', err);
        });


        if (previousAvatarSize > 0) {
          dataUsageTracker.trackFileDelete(contact.companyId, previousAvatarSize).catch(err => {
            console.error('Failed to track contact avatar deletion:', err);
          });
        }
      }

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      const contactForBroadcast = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactUpdated',
          data: contactForBroadcast
        });
      }

      const contactToReturn = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      res.json({
        success: true,
        contact: contactToReturn,
        avatarUrl
      });
    } catch (err: any) {
      console.error('Error uploading contact avatar:', err);
      if (req.file) {
        await fsExtra.unlink(req.file.path).catch(() => { });
      }
      res.status(500).json({ message: err.message });
    }
  });


  const contactDocumentUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'contact-documents');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const fileExt = path.extname(file.originalname) || '';
        cb(null, `${uniqueId}${fileExt}`);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];

      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, images, Word documents, and text files are allowed.'));
      }
    }
  });


  app.get('/api/contacts/:contactId/assigned-agent', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }


      const conversations = await storage.getConversationsByContact(contactId);

      if (conversations.length === 0) {
        return res.json({ assignedAgent: null });
      }


      const mostRecentConversation = conversations.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      })[0];

      if (!mostRecentConversation.assignedToUserId) {
        return res.json({ assignedAgent: null });
      }


      const assignedAgent = await storage.getUser(mostRecentConversation.assignedToUserId);

      if (!assignedAgent) {
        return res.json({ assignedAgent: null });
      }


      const { password, ...safeAgentData } = assignedAgent;
      res.json({
        assignedAgent: safeAgentData,
        conversationId: mostRecentConversation.id,
        assignedAt: mostRecentConversation.lastMessageAt
      });
    } catch (error) {
      console.error('Error fetching contact assigned agent:', error);
      res.status(500).json({ error: 'Failed to fetch assigned agent' });
    }
  });


  app.get('/api/contacts/:contactId/documents', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const documents = await storage.getContactDocuments(contactId);
      res.json(documents);
    } catch (error) {
      console.error('Error fetching contact documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });


  app.post('/api/contacts/:contactId/documents', ensureAuthenticated, contactDocumentUpload.single('document'), async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const { category, description } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const documentData = {
        contactId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        fileUrl: `/uploads/contact-documents/${req.file.filename}`,
        category: category || 'general',
        description: description || '',
        uploadedBy: req.user.id
      };

      const document = await storage.createContactDocument(documentData);


      await logContactAudit({
        companyId,
        contactId,
        userId: req.user.id,
        actionType: 'document_uploaded',
        actionCategory: 'document',
        description: `Document uploaded: ${document.originalName}`,
        newValues: {
          filename: document.originalName,
          category: document.category,
          description: document.description,
          fileSize: document.fileSize
        },
        metadata: {
          documentId: document.id,
          mimeType: document.mimeType
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });


      if (companyId && req.file) {
        dataUsageTracker.trackFileUpload(companyId, req.file.size).catch(err => {
          console.error('Failed to track contact document upload:', err);
        });
      }

      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading contact document:', error);
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
      }
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });


  app.delete('/api/contacts/:contactId/documents/:documentId', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const documentId = parseInt(req.params.documentId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const document = await storage.getContactDocument(documentId);
      if (!document || document.contactId !== contactId) {
        return res.status(404).json({ error: 'Document not found' });
      }


      try {
        await fsExtra.unlink(document.filePath);
      } catch (fileError) {
        console.warn('Could not delete file from filesystem:', fileError);
      }

      await storage.deleteContactDocument(documentId);


      await logContactAudit({
        companyId,
        contactId,
        userId: req.user.id,
        actionType: 'document_deleted',
        actionCategory: 'document',
        description: `Document deleted: ${document.originalName}`,
        oldValues: {
          filename: document.originalName,
          category: document.category,
          description: document.description,
          fileSize: document.fileSize
        },
        metadata: {
          documentId: document.id,
          mimeType: document.mimeType
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });


      if (companyId && document.fileSize) {
        dataUsageTracker.trackFileDelete(companyId, document.fileSize).catch(err => {
          console.error('Failed to track contact document deletion:', err);
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting contact document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });


  app.get('/api/contacts/:contactId/appointments', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const appointments = await storage.getContactAppointments(contactId);
      res.json(appointments);
    } catch (error) {
      console.error('Error fetching contact appointments:', error);
      res.status(500).json({ error: 'Failed to fetch appointments' });
    }
  });


  app.post('/api/contacts/:contactId/appointments', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const { title, description, location, scheduledAt, durationMinutes, type } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (!title || !scheduledAt) {
        return res.status(400).json({ error: 'Title and scheduled time are required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const appointmentData = {
        contactId,
        title,
        description: description || '',
        location: location || '',
        scheduledAt: new Date(scheduledAt),
        durationMinutes: durationMinutes || 60,
        type: type || 'meeting',
        createdBy: req.user.id
      };

      const appointment = await storage.createContactAppointment(appointmentData);


      await logContactAudit({
        companyId,
        contactId,
        userId: req.user.id,
        actionType: 'appointment_created',
        actionCategory: 'appointment',
        description: `Appointment created: ${appointment.title}`,
        newValues: {
          title: appointment.title,
          description: appointment.description,
          location: appointment.location,
          scheduledAt: appointment.scheduledAt,
          durationMinutes: appointment.durationMinutes,
          type: appointment.type
        },
        metadata: {
          appointmentId: appointment.id
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(201).json(appointment);
    } catch (error) {
      console.error('Error creating contact appointment:', error);
      res.status(500).json({ error: 'Failed to create appointment' });
    }
  });


  app.patch('/api/contacts/:contactId/appointments/:appointmentId', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const appointmentId = parseInt(req.params.appointmentId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const appointment = await storage.getContactAppointment(appointmentId);
      if (!appointment || appointment.contactId !== contactId) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const updateData = { ...req.body };
      if (updateData.scheduledAt) {
        updateData.scheduledAt = new Date(updateData.scheduledAt);
      }

      const updatedAppointment = await storage.updateContactAppointment(appointmentId, updateData);
      res.json(updatedAppointment);
    } catch (error) {
      console.error('Error updating contact appointment:', error);
      res.status(500).json({ error: 'Failed to update appointment' });
    }
  });


  app.delete('/api/contacts/:contactId/appointments/:appointmentId', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const appointmentId = parseInt(req.params.appointmentId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const appointment = await storage.getContactAppointment(appointmentId);
      if (!appointment || appointment.contactId !== contactId) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      await storage.deleteContactAppointment(appointmentId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting contact appointment:', error);
      res.status(500).json({ error: 'Failed to delete appointment' });
    }
  });



  app.post('/api/contacts/:contactId/initiate-call',
    ensureAuthenticated,
    requirePermission(PERMISSIONS.MANAGE_CALL_LOGS),
    async (req, res) => {
      try {

        const contactId = parseInt(req.params.contactId);
        if (isNaN(contactId)) {
          return res.status(400).json({ error: 'Invalid contact ID' });
        }


        const { callType } = req.body;


        const contact = await storage.getContact(contactId);
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }


        if (!req.user || contact.companyId !== req.user.companyId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const permissions = await getUserPermissions(req.user);
        if (!(req.user as any).isSuperAdmin && permissions[PERMISSIONS.VIEW_CONTACT_PHONE] !== true) {
          return res.status(403).json({ error: 'You do not have permission to view or use contact phone numbers' });
        }


        if (contact.isArchived) {
          return res.status(400).json({ error: 'Cannot call archived contacts' });
        }


        const phoneNumber = contact.phone;
        if (!phoneNumber || phoneNumber.trim() === '') {
          return res.status(400).json({ error: 'Contact does not have a phone number' });
        }


        const { validatePhoneNumber } = await import('./utils/phone-validation');
        const phoneValidation = validatePhoneNumber(phoneNumber);
        if (!phoneValidation.isValid) {
          return res.status(400).json({ 
            error: 'Invalid phone number', 
            details: phoneValidation.error || 'Phone number format is not valid' 
          });
        }


        if (!req.user?.companyId) {
          return res.status(400).json({ error: 'Company ID is required' });
        }
        const allConnections = await storage.getChannelConnectionsByCompany(req.user.companyId);
        const twilioVoiceConnections = allConnections.filter(
          conn => conn.channelType === 'twilio_voice' && conn.status === 'active'
        );

        if (twilioVoiceConnections.length === 0) {
          return res.status(400).json({ error: 'No active Twilio Voice connection found' });
        }


        const channelConnection = twilioVoiceConnections[0];


        let conversation = await storage.getConversationByContactAndChannel(
          contactId,
          channelConnection.id
        );


        if (!conversation) {
          conversation = await storage.createConversation({
            contactId: contactId,
            channelId: channelConnection.id,
            companyId: req.user.companyId,
            channelType: 'twilio_voice',
            status: 'active',
            lastMessageAt: new Date(),
            isGroup: false
          });
        }


        const { initiateOutboundCall } = await import('./services/call-agent-service');
        const { callLogsService } = await import('./services/call-logs-service');
        const { CallLogsEventEmitter } = await import('./utils/websocket');


        const connectionData = channelConnection.connectionData as any;
        const {
          accountSid,
          authToken,
          fromNumber,
          elevenLabsApiKey,
          elevenLabsAgentId,
          elevenLabsPrompt,
          voiceId
        } = connectionData;


        if (!accountSid || !authToken || !fromNumber) {
          return res.status(400).json({
            error: 'Twilio Voice channel is missing required credentials (Account SID, Auth Token, or From Number)'
          });
        }


        const hasElevenLabs = !!(elevenLabsApiKey && elevenLabsApiKey.trim() !== '');


        let useElevenLabs = hasElevenLabs;
        let actualCallType = hasElevenLabs ? 'ai-powered' : 'direct';

        if (callType) {
          if (callType === 'direct') {
            useElevenLabs = false;
            actualCallType = 'direct';
          } else if (callType === 'ai-powered') {
            if (!hasElevenLabs) {
              return res.status(400).json({
                error: 'ElevenLabs credentials not configured for AI-powered calls'
              });
            }

            if (!elevenLabsAgentId && !elevenLabsPrompt) {
              return res.status(400).json({
                error: 'Either ElevenLabs Agent ID or custom prompt must be configured for AI-powered calls. Please configure an agent in your ElevenLabs dashboard or provide a custom prompt.',
                suggestion: 'Go to Settings > AI Credentials > ElevenLabs to configure your agent ID'
              });
            }
            if (!elevenLabsAgentId && elevenLabsPrompt) {
              console.warn('[Initiate Call] Using custom prompt with AI-powered call - signed URL authentication not available for custom prompts');
            }
            useElevenLabs = true;
            actualCallType = 'ai-powered';
          } else {
            return res.status(400).json({
              error: 'Invalid callType. Must be "direct" or "ai-powered"'
            });
          }
        }




        const config: CallAgentConfig = {
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken,
          twilioFromNumber: fromNumber,
          toNumber: phoneNumber,
          elevenLabsApiKey: useElevenLabs ? (elevenLabsApiKey || '') : '',
          elevenLabsAgentId: useElevenLabs ? elevenLabsAgentId : undefined,
          elevenLabsPrompt: useElevenLabs ? elevenLabsPrompt : undefined,
          elevenLabsVoiceId: useElevenLabs ? voiceId : undefined,
          timeout: 30,
          maxDuration: 300,
          recordCall: true,
          executionMode: 'async'
        };


        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL ||
          process.env.PUBLIC_URL?.replace(/^https?:\/\//, '') ||
          'localhost:3000';


        const result = await initiateOutboundCall(config, webhookBaseUrl);
        const { callSid, from, to, startTime, metadata } = result;


        if (metadata?.callType) {
          actualCallType = metadata.callType;
        }
        

        if (metadata?.elevenLabsFallback) {
          actualCallType = 'direct';
        }


        const savedCall = await callLogsService.upsertCallLog({
          companyId: req.user?.companyId || 0,
          channelId: channelConnection.id,
          contactId: contact.id,
          conversationId: conversation.id,
          flowId: null,
          nodeId: null,
          direction: 'outbound',
          status: 'initiated',
          from: from,
          to: to,
          twilioCallSid: callSid,
          startedAt: startTime,
          agentConfig: elevenLabsAgentId ? {
            elevenLabsAgentId,
            elevenLabsPrompt,
            voiceId
          } : undefined,
          metadata: {
            ...metadata,
            hasElevenLabs: hasElevenLabs,
            callType: actualCallType,
            userSelectedCallType: !!callType,
            elevenLabsConversationId: result.metadata?.elevenLabsConversationId
          }
        });


        CallLogsEventEmitter.emitCallStatusUpdate(
          savedCall.id,
          req.user?.companyId || 0,
          'initiated',
          { callSid, from, to }
        );

        const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;

        res.json({
          success: true,
          callSid: callSid,
          callId: savedCall.id,
          status: 'initiated',
          from: from,
          to: to,
          contactName: contact.name,
          contactPhone: canViewPhone ? contact.phone : null,
          contactAvatar: contact.avatarUrl,
          message: 'Call initiated successfully',
          conferenceName: result.metadata?.conferenceName,
          channelId: channelConnection.id,
          callType: actualCallType
        });

      } catch (error) {
        console.error('[Initiate Contact Call]', error);


        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage?.includes('Invalid credentials') ||
          errorMessage?.includes('authentication')) {
          return res.status(400).json({ error: 'Invalid Twilio credentials' });
        }

        if (errorMessage?.includes('Twilio API')) {
          return res.status(500).json({ error: 'Twilio API error: ' + errorMessage });
        }

        res.status(500).json({ error: 'Failed to initiate call' });
      }
    }
  );


  app.get('/api/contacts/:contactId/tasks', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const { status, priority, search } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const tasks = await storage.getContactTasks(contactId, companyId, {
        status: status as string,
        priority: priority as string,
        search: search as string
      });

      res.json(tasks);
    } catch (error) {
      console.error('Error fetching contact tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });


  app.post('/api/contacts/:contactId/tasks', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { title, description, priority, status, dueDate, assignedTo, category, tags, backgroundColor } = req.body;

      if (!companyId || !userId) {
        return res.status(400).json({ error: 'Company ID and User ID required' });
      }

      if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
      }

      if (!title?.trim()) {
        return res.status(400).json({ error: 'Task title is required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const taskData = {
        contactId,
        companyId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        status: status || 'not_started',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo: assignedTo?.trim() || null,
        category: category?.trim() || null,
        tags: Array.isArray(tags) ? tags : [],
        backgroundColor: backgroundColor || '#ffffff',
        createdBy: userId
      };

      const task = await storage.createContactTask(taskData);


      await storage.logContactActivity({
        companyId,
        contactId,
        userId,
        actionType: 'task_created',
        actionCategory: 'task_management',
        description: `Created task: ${title}`,
        newValues: taskData,
        metadata: { taskId: task.id }
      });

      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating contact task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });


  app.patch('/api/contacts/:contactId/tasks/bulk', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { taskIds, updates } = req.body;

      if (!companyId || !userId) {
        return res.status(400).json({ error: 'Company ID and User ID required' });
      }

      if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
      }

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Task IDs array is required' });
      }


      const validTaskIds = taskIds.filter(id => typeof id === 'number' && !isNaN(id));
      if (validTaskIds.length !== taskIds.length) {
        return res.status(400).json({ error: 'Invalid task ID format' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found or access denied' });
      }


      const taskValidationPromises = validTaskIds.map(async (taskId) => {
        const existingTask = await storage.getContactTask(taskId, companyId);
        if (!existingTask || existingTask.contactId !== contactId) {
          throw new Error(`Task ${taskId} not found or doesn't belong to contact ${contactId}`);
        }
        return existingTask;
      });

      const existingTasks = await Promise.all(taskValidationPromises);

      const updatedTasks = await storage.bulkUpdateContactTasks(validTaskIds, companyId, updates);


      await storage.logContactActivity({
        companyId,
        contactId,
        userId,
        actionType: 'tasks_bulk_updated',
        actionCategory: 'task_management',
        description: `Bulk updated ${validTaskIds.length} tasks: ${existingTasks.map(t => t.title).join(', ')}`,
        oldValues: existingTasks,
        newValues: updates,
        metadata: { taskIds: validTaskIds, count: validTaskIds.length }
      });

      res.json(updatedTasks);
    } catch (error) {
      console.error('Error bulk updating contact tasks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to bulk update tasks';
      res.status(400).json({ error: errorMessage });
    }
  });


  app.patch('/api/contacts/:contactId/tasks/:taskId', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const taskId = parseInt(req.params.taskId);
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return res.status(400).json({ error: 'Company ID and User ID required' });
      }

      if (isNaN(contactId) || isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid contact ID or task ID' });
      }


      const existingTask = await storage.getContactTask(taskId, companyId);
      if (!existingTask || existingTask.contactId !== contactId) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const updates = { ...req.body };
      if (updates.dueDate) {
        updates.dueDate = new Date(updates.dueDate);
      }

      const updatedTask = await storage.updateContactTask(taskId, companyId, updates);


      await storage.logContactActivity({
        companyId,
        contactId,
        userId,
        actionType: 'task_updated',
        actionCategory: 'task_management',
        description: `Updated task: ${updatedTask.title}`,
        oldValues: existingTask,
        newValues: updatedTask,
        metadata: { taskId }
      });

      res.json(updatedTask);
    } catch (error) {
      console.error('Error updating contact task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });


  app.delete('/api/contacts/:contactId/tasks/:taskId', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const taskId = parseInt(req.params.taskId);
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId || !userId) {
        return res.status(400).json({ error: 'Company ID and User ID required' });
      }

      if (isNaN(contactId) || isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid contact ID or task ID' });
      }


      const existingTask = await storage.getContactTask(taskId, companyId);
      if (!existingTask || existingTask.contactId !== contactId) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await storage.deleteContactTask(taskId, companyId);


      await storage.logContactActivity({
        companyId,
        contactId,
        userId,
        actionType: 'task_deleted',
        actionCategory: 'task_management',
        description: `Deleted task: ${existingTask.title}`,
        oldValues: existingTask,
        metadata: { taskId }
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting contact task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });


  app.get('/api/tasks', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]), async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;
      const { status, priority, assignedTo, contactId, search, page, limit } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      const result = await storage.getCompanyTasks(companyId, {
        status: status as string,
        priority: priority as string,
        assignedTo: assignedTo as string,
        contactId: contactId ? parseInt(contactId as string) : undefined,
        search: search as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.get('/api/tasks/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]), async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }

      const task = await storage.getTask(taskId, companyId);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.json(task);
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  app.post('/api/tasks', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { contactId, title, description, priority, status, dueDate, assignedTo, category, tags, backgroundColor } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (!contactId) {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Task title is required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const taskData: InsertContactTask = {
        contactId,
        companyId,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        status: status || 'not_started',
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedTo: assignedTo || null,
        category: category?.trim() || null,
        tags: tags || null,
        backgroundColor: backgroundColor || '#ffffff',
        createdBy: userId,
        updatedBy: userId
      };

      const task = await storage.createTask(taskData);

      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });


  app.patch('/api/tasks/bulk', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { taskIds, updates } = req.body;


      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Task IDs array is required' });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Updates object is required' });
      }

      const validTaskIds = taskIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));


      if (validTaskIds.length === 0) {
        return res.status(400).json({ error: 'No valid task IDs provided' });
      }


      const taskValidationPromises = validTaskIds.map(async (taskId) => {
        const existingTask = await storage.getTask(taskId, companyId);
        if (!existingTask) {
          throw new Error(`Task ${taskId} not found`);
        }
        return existingTask;
      });

      await Promise.all(taskValidationPromises);

      const updateData = {
        ...updates,
        updatedBy: userId
      };

      const updatedTasks = await storage.bulkUpdateTasks(validTaskIds, companyId, updateData);

      res.json(updatedTasks);
    } catch (error) {
      console.error('Error bulk updating tasks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to bulk update tasks';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.patch('/api/tasks/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const companyId = req.user?.companyId;
      const userId = req.user?.id;

      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }


      const existingTask = await storage.getTask(taskId, companyId);
      if (!existingTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const updates: Partial<InsertContactTask> = {
        ...req.body,
        updatedBy: userId
      };


      delete (updates as any).id;
      delete (updates as any).companyId;
      delete (updates as any).createdAt;
      delete (updates as any).createdBy;

      const updatedTask = await storage.updateTask(taskId, companyId, updates);

      res.json(updatedTask);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  app.delete('/api/tasks/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (isNaN(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID' });
      }


      const existingTask = await storage.getTask(taskId, companyId);
      if (!existingTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      await storage.deleteTask(taskId, companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  app.patch('/api/tasks/bulk', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { taskIds, updates } = req.body;


      if (!companyId) {
        return res.status(400).json({ error: 'User must be associated with a company' });
      }

      if (!Array.isArray(taskIds) || taskIds.length === 0) {
        return res.status(400).json({ error: 'Task IDs array is required' });
      }

      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Updates object is required' });
      }

      const validTaskIds = taskIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));


      if (validTaskIds.length === 0) {
        return res.status(400).json({ error: 'No valid task IDs provided' });
      }


      const taskValidationPromises = validTaskIds.map(async (taskId) => {
        const existingTask = await storage.getTask(taskId, companyId);
        if (!existingTask) {
          throw new Error(`Task ${taskId} not found`);
        }
        return existingTask;
      });

      await Promise.all(taskValidationPromises);

      const updateData = {
        ...updates,
        updatedBy: userId
      };

      const updatedTasks = await storage.bulkUpdateTasks(validTaskIds, companyId, updateData);

      res.json(updatedTasks);
    } catch (error) {
      console.error('Error bulk updating tasks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to bulk update tasks';
      res.status(400).json({ error: errorMessage });
    }
  });


  app.get('/api/task-categories', ensureAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      const categories = await storage.getTaskCategories(companyId);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching task categories:', error);
      res.status(500).json({ error: 'Failed to fetch task categories' });
    }
  });

  app.post('/api/task-categories', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const companyId = req.user?.companyId;
      const userId = req.user?.id;
      const { name, color, icon } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const category = await storage.createTaskCategory({
        companyId,
        name: name.trim(),
        color: color || '#6B7280',
        icon: icon || 'folder',
        createdBy: userId
      });

      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating task category:', error);
      res.status(500).json({ error: 'Failed to create task category' });
    }
  });

  app.patch('/api/task-categories/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      const companyId = req.user?.companyId;
      const { name, color, icon } = req.body;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (isNaN(categoryId)) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (color !== undefined) updateData.color = color;
      if (icon !== undefined) updateData.icon = icon;

      const category = await storage.updateTaskCategory(categoryId, companyId, updateData);
      res.json(category);
    } catch (error) {
      console.error('Error updating task category:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update task category';
      res.status(400).json({ error: errorMessage });
    }
  });

  app.delete('/api/task-categories/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: any, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (isNaN(categoryId)) {
        return res.status(400).json({ error: 'Invalid category ID' });
      }

      await storage.deleteTaskCategory(categoryId, companyId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting task category:', error);
      res.status(500).json({ error: 'Failed to delete task category' });
    }
  });

  app.get('/api/contacts/:contactId/audit-logs', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const { page = 1, limit = 50, actionType } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (isNaN(contactId)) {
        return res.status(400).json({ error: 'Invalid contact ID' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const auditLogs = await storage.getContactAuditLogs(contactId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        actionType: actionType as string
      });

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      if (!canViewPhone && auditLogs.logs) {
        auditLogs.logs = auditLogs.logs.map((log: any) => ({
          ...log,
          oldValues: log.oldValues && typeof log.oldValues === 'object'
            ? { ...log.oldValues, phone: null, identifier: null }
            : log.oldValues,
          newValues: log.newValues && typeof log.newValues === 'object'
            ? { ...log.newValues, phone: null, identifier: null }
            : log.newValues
        }));
      }

      res.json(auditLogs);
    } catch (error) {
      console.error('Error fetching contact audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });


  app.get('/api/contacts/:contactId/activity', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;
      const { type, limit = 50 } = req.query;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const activity = await storage.getContactActivity(contactId, {
        type: type as string,
        limit: parseInt(limit as string)
      });

      res.json(activity);
    } catch (error) {
      console.error('Error fetching contact activity:', error);
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  });


  app.post('/api/contacts/:contactId/avatar', ensureAuthenticated, upload.single('avatar'), async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const companyId = req.user?.companyId;

      if (!companyId) {
        return res.status(400).json({ error: 'Company ID required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }


      const contact = await storage.getContact(contactId);
      if (!contact || contact.companyId !== companyId) {
        return res.status(404).json({ error: 'Contact not found' });
      }


      const avatarUrl = `/uploads/${req.file.filename}`;
      const updatedContact = await storage.updateContact(contactId, { avatarUrl });

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;
      const contactForBroadcast = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactUpdated',
          data: contactForBroadcast
        });
      }

      const contactToReturn = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      res.json({ avatarUrl, contact: contactToReturn });
    } catch (error) {
      console.error('Error uploading contact avatar:', error);
      res.status(500).json({ error: 'Failed to upload avatar' });
    }
  });

  app.post('/api/contacts/:id/update-profile-picture', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const { connectionId, forceRefresh = true } = req.body;

      if (!connectionId) {
        return res.status(400).json({ message: 'WhatsApp connection ID is required' });
      }

      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      if (!contact.identifier || contact.identifierType !== 'whatsapp') {
        return res.status(400).json({
          message: 'Contact does not have a WhatsApp identifier'
        });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      const permissions = await getUserPermissions(req.user);
      const canViewPhone = (req.user as any).isSuperAdmin || permissions[PERMISSIONS.VIEW_CONTACT_PHONE] === true;

      if (!forceRefresh && contact.avatarUrl) {
        const avatarAge = Date.now() - new Date(contact.updatedAt || contact.createdAt || Date.now()).getTime();
        const maxAge = 24 * 60 * 60 * 1000;

        if (avatarAge < maxAge) {
          const contactToReturn = canViewPhone ? contact : { ...contact, phone: null, identifier: null };
          return res.json({
            success: true,
            contact: contactToReturn,
            profilePictureUrl: contact.avatarUrl,
            cached: true
          });
        }
      }

      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }

      const profilePictureUrl = await whatsAppService.fetchProfilePicture(
        connectionId,
        contact.identifier,
        true
      );

      if (!profilePictureUrl) {
        return res.status(404).json({ message: 'No profile picture found for this contact' });
      }

      const updatedContact = await storage.updateContact(contactId, {
        avatarUrl: profilePictureUrl
      });

      const contactForBroadcast = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'contactUpdated',
          data: contactForBroadcast
        });
      }

      const contactToReturn = canViewPhone ? updatedContact : { ...updatedContact, phone: null, identifier: null };
      res.json({
        success: true,
        contact: contactToReturn,
        profilePictureUrl,
        cached: false
      });
    } catch (err: any) {
      console.error('Error updating group profile picture:', err);
      res.status(500).json({ message: err.message || 'Failed to update group profile picture' });
    }
  });

  app.post('/api/conversations/:id/update-group-picture', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({ message: 'WhatsApp connection ID is required' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      if (!conversation.isGroup || !conversation.groupJid) {
        return res.status(400).json({
          message: 'This conversation is not a group chat'
        });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      const isActive = whatsAppService.isConnectionActive(connectionId);
      if (!isActive) {
        return res.status(400).json({ message: 'WhatsApp connection is not active' });
      }



      const groupPictureUrl = await whatsAppService.fetchGroupProfilePicture(
        connectionId,
        conversation.groupJid
      );



      if (!groupPictureUrl) {
        return res.status(404).json({ message: 'No group profile picture found' });
      }

      const updatedGroupMetadata = {
        ...(conversation.groupMetadata || {}),
        profilePictureUrl: groupPictureUrl
      };

      const updatedConversation = await storage.updateConversation(conversationId, {
        groupMetadata: updatedGroupMetadata
      });

      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'conversationUpdated',
          data: updatedConversation
        });
      }

      res.json({
        success: true,
        conversation: updatedConversation,
        groupPictureUrl
      });
    } catch (err: any) {
      console.error('Error updating group profile picture:', err);
      res.status(500).json({ message: err.message || 'Failed to update group profile picture' });
    }
  });



  app.get('/api/conversations', ensureAuthenticated, ensureActiveSubscription, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const user = req.user as any;
      const userPermissions = (req as any).userPermissions;

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;

      const companyId = user.isSuperAdmin ? undefined : user.companyId;

      const assignedToUserId = (userPermissions && !userPermissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS]) ? user.id : undefined;

      const { conversations, total } = await storage.getConversations({
        companyId,
        page,
        limit,
        search,
        assignedToUserId
      });

      const conversationsWithContacts = await Promise.all(
        conversations.map(async (conversation) => {
          const contact = conversation.contactId ? await storage.getContact(conversation.contactId) : null;
          const channelConnection = conversation.channelId ? await storage.getChannelConnection(conversation.channelId) : null;
          return {
            ...conversation,
            contact,
            channelConnection
          };
        })
      );

      res.json({
        conversations: conversationsWithContacts,
        total: total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.get('/api/conversations/:id', ensureAuthenticated, ensureActiveSubscription, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const userPermissions = (req as any).userPermissions;

      const conversation = await storage.getConversation(id);

      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }


      if (conversation.isGroup || conversation.groupJid) {
        return res.status(404).json({ message: 'Conversation not found' });
      }


      if (conversation.contactId) {
        const contact = await storage.getContact(conversation.contactId);
        if (contact && (isWhatsAppGroupChatId(contact.phone) || isWhatsAppGroupChatId(contact.identifier))) {
          return res.status(404).json({ message: 'Conversation not found' });
        }
      }

      if (!user.isSuperAdmin) {
        if (user.companyId && conversation.companyId !== user.companyId && conversation.companyId !== null) {
          return res.status(403).json({ message: 'Access denied' });
        }

        if (userPermissions && !userPermissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS]) {
          if (conversation.assignedToUserId !== user.id) {
            return res.status(403).json({ message: 'Access denied' });
          }
        }
      }

      const contact = conversation.contactId ? await storage.getContact(conversation.contactId) : null;
      const channelConnection = conversation.channelId ? await storage.getChannelConnection(conversation.channelId) : null;

      res.json({
        ...conversation,
        contact,
        channelConnection
      });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  app.post('/api/conversations/:id/mark-read', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && user.companyId && conversation.companyId !== user.companyId && conversation.companyId !== null) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await storage.markConversationAsRead(conversationId);

      broadcastToAll({
        type: 'unreadCountUpdated',
        data: {
          conversationId,
          unreadCount: 0
        }
      });

      res.json({
        success: true,
        conversationId,
        unreadCount: 0
      });
    } catch (err: any) {
      console.error('Error marking conversation as read:', err);
      res.status(500).json({ message: err.message || 'Failed to mark conversation as read' });
    }
  });

  app.get('/api/conversations/unread-counts', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const unreadCounts = await storage.getAllUnreadCounts(user.id);
      res.json(unreadCounts);
    } catch (err: any) {
      console.error('Error fetching unread counts:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch unread counts' });
    }
  });

  app.get('/api/conversations/:id/unread-count', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && user.companyId && conversation.companyId !== user.companyId && conversation.companyId !== null) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const unreadCount = await storage.getUnreadCount(conversationId);
      res.json({ unreadCount });
    } catch (err: any) {
      console.error('Error fetching unread count:', err);
      res.status(500).json({ message: err.message || 'Failed to fetch unread count' });
    }
  });

  app.post('/api/conversations/whatsapp/initiate', ensureAuthenticated, async (req: any, res) => {
    try {
      const { name, phoneNumber, channelConnectionId, initialMessage } = req.body;

      if (!name || !phoneNumber || !channelConnectionId) {
        return res.status(400).json({
          message: 'Name, phone number, and channel connection ID are required'
        });
      }

      const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
      if (cleanPhoneNumber.length < 10) {
        return res.status(400).json({
          message: 'Please enter a valid phone number with at least 10 digits'
        });
      }


      if (isWhatsAppGroupChatId(cleanPhoneNumber)) {
        return res.status(400).json({
          message: 'Cannot initiate conversations with WhatsApp group chat IDs'
        });
      }

      const channelConnection = await storage.getChannelConnection(channelConnectionId);
      if (!channelConnection) {
        return res.status(404).json({ message: 'Channel connection not found' });
      }


      if (!req.user || !req.user.companyId) {
        return res.status(400).json({ message: 'Company ID is required for multi-tenant security' });
      }


      if (channelConnection.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }


      const supportedChannelTypes = ['whatsapp_unofficial', 'whatsapp', 'whatsapp_official'];
      if (!supportedChannelTypes.includes(channelConnection.channelType)) {
        return res.status(400).json({
          message: `Unsupported channel type: ${channelConnection.channelType}`
        });
      }

      if (channelConnection.status !== 'active') {
        return res.status(400).json({
          message: 'WhatsApp connection is not active. Please reconnect in Settings.'
        });
      }

      let contact = await storage.getContactByIdentifier(cleanPhoneNumber, 'whatsapp');

      if (!contact) {
        let identifierType = 'whatsapp';
        switch (channelConnection.channelType) {
          case 'whatsapp_official':
            identifierType = 'whatsapp_official';
            break;
          case 'whatsapp_unofficial':
          case 'whatsapp':
            identifierType = 'whatsapp_unofficial';
            break;
          default:
            identifierType = channelConnection.channelType;
        }

        const contactData: InsertContact = {
          companyId: req.user.companyId,
          name,
          phone: cleanPhoneNumber,
          identifier: cleanPhoneNumber,
          identifierType: identifierType,
          source: 'manual',
          email: null,
          avatarUrl: null,
          company: null,
          tags: null,
          isActive: true,
          notes: null,
          createdBy: req.user.id
        };

        contact = await storage.getOrCreateContact(contactData);
      }

      let conversation = await storage.getConversationByContactAndChannel(
        contact.id,
        channelConnectionId
      );

      if (!conversation) {
        const conversationData: InsertConversation = {
          companyId: req.user.companyId,
          contactId: contact.id,
          channelId: channelConnectionId,
          channelType: channelConnection.channelType,
          status: 'open',
          assignedToUserId: req.user.id,
          lastMessageAt: new Date()
        };

        conversation = await storage.createConversation(conversationData);
      }

      if (initialMessage && initialMessage.trim()) {
        try {
          let sentMessage = null;

          if (channelConnection.channelType === 'whatsapp_official') {

            const whatsAppOfficialService = await import('./services/channels/whatsapp-official');
            sentMessage = await whatsAppOfficialService.sendMessage(
              channelConnectionId,
              req.user.id,
              req.user.companyId,
              cleanPhoneNumber,
              initialMessage.trim(),
              false // isFromBot - user-initiated message
            );
          } else {

            const { sendWhatsAppMessage } = await import('./services/channels/whatsapp');
            sentMessage = await sendWhatsAppMessage(
              channelConnectionId,
              req.user.id,
              cleanPhoneNumber,
              initialMessage.trim()
            );
          }

          if (!sentMessage) {
            console.warn('Initial message was not sent successfully');
          }
        } catch (messageError) {
          console.error('Error sending initial message:', messageError);
        }
      }

      broadcastToAll({
        type: 'newConversation',
        data: {
          ...conversation,
          contact
        }
      });

      res.status(201).json({
        conversation,
        contact,
        success: true,
        message: 'Conversation initiated successfully'
      });

    } catch (err: any) {
      console.error('Error initiating WhatsApp conversation:', err);
      res.status(500).json({ message: err.message || 'Failed to initiate conversation' });
    }
  });

  app.post('/api/conversations', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const conversationData = validateBody(insertConversationSchema, {
        ...req.body,
        assignedToUserId: req.user.id
      });
      const conversation = await storage.createConversation(conversationData);

      await broadcastConversationUpdate(conversation, 'newConversation');

      res.status(201).json(conversation);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/group-conversations', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const user = req.user as any;
      const userPermissions = (req as any).userPermissions;

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const search = req.query.search as string;

      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const { conversations, total } = await storage.getGroupConversations({
        companyId,
        page,
        limit,
        search
      });

      let filteredConversations = conversations;
      if (userPermissions && !userPermissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS]) {
        filteredConversations = conversations.filter(conversation =>
          conversation.assignedToUserId === user.id
        );
      }

      res.json({
        conversations: filteredConversations,
        total: filteredConversations.length,
        page,
        limit,
        totalPages: Math.ceil(filteredConversations.length / limit)
      });
    } catch (error) {
      console.error('Error fetching group conversations:', error);
      res.status(500).json({ error: 'Failed to fetch group conversations' });
    }
  });

  app.get('/api/group-conversations/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const userPermissions = (req as any).userPermissions;

      const conversation = await storage.getConversation(id);

      if (!conversation) {
        return res.status(404).json({ message: 'Group conversation not found' });
      }

      if (!conversation.isGroup && !conversation.groupJid) {
        return res.status(404).json({ message: 'Group conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (userPermissions && !userPermissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS]) {
        if (conversation.assignedToUserId !== user.id) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      res.json(conversation);
    } catch (error) {
      console.error('Error fetching group conversation:', error);
      res.status(500).json({ error: 'Failed to fetch group conversation' });
    }
  });

  app.get('/api/group-conversations/:id/participants', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!conversation.isGroup && !conversation.groupJid) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const participants = await storage.getGroupParticipants(conversationId);

      res.json({
        participants,
        total: participants.length
      });
    } catch (error) {
      console.error('Error fetching group participants:', error);
      res.status(500).json({ error: 'Failed to fetch group participants' });
    }
  });

  app.get('/api/group-conversations/:id/debug-metadata', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const connectionId = conversation.channelId;

      try {
        const sock = getWhatsAppConnection(connectionId);
        if (!sock) {
          return res.status(400).json({ error: 'WhatsApp connection not active' });
        }

        const metadata = await sock.groupMetadata(conversation.groupJid!);
        metadata.participants.slice(0, 3).forEach((p, i) => {
        });

        res.json({
          success: true,
          groupJid: conversation.groupJid,
          subject: metadata.subject,
          totalParticipants: metadata.participants.length,
          sampleParticipants: metadata.participants.slice(0, 5),
          metadata: metadata
        });

      } catch (whatsappError) {
        console.error('Error fetching group metadata from WhatsApp:', whatsappError);
        return res.status(500).json({ error: 'Failed to fetch group metadata from WhatsApp' });
      }

    } catch (error) {
      console.error('Error debugging group metadata:', error);
      res.status(500).json({ error: 'Failed to debug group metadata' });
    }
  });

  app.post('/api/group-conversations/:id/participants/sync', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!conversation.isGroup && !conversation.groupJid) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const connectionId = conversation.channelId;

      try {
        const sock = getWhatsAppConnection(connectionId);
        if (!sock) {
          return res.status(400).json({ error: 'WhatsApp connection not active' });
        }

        let metadata;
        try {
          metadata = await whatsAppService.getEnhancedGroupMetadata(sock, conversation.groupJid!);
        } catch (error) {
          metadata = await sock.groupMetadata(conversation.groupJid!);
        }

        const enhancedParticipants = [];


        for (let index = 0; index < metadata.participants.length; index++) {
          const participant = metadata.participants[index];


          const participantAny = participant as any;


          const rawId = participant.id.split('@')[0];

          const isLidFormat = participant.id.includes('@lid');
          const isWhatsAppFormat = participant.id.includes('@s.whatsapp.net');
          const isGroupId = participant.id.includes('@g.us');

          const officialJid = participantAny.jid ?? participantAny.id ?? participantAny.lid ?? null;

          let displayPhoneNumber = rawId;
          let isValidPhoneNumber = false;



          if (officialJid && officialJid.includes('@s.whatsapp.net')) {
            const phoneDigits = officialJid.split('@')[0];
            displayPhoneNumber = phoneDigits;
            const phoneValidation = validatePhoneNumberUtil(phoneDigits);
            isValidPhoneNumber = phoneValidation.isValid;
          } else if (isLidFormat) {
            displayPhoneNumber = `LID-${rawId}`;
            isValidPhoneNumber = false;
          } else {
            displayPhoneNumber = rawId;
            const phoneValidation = validatePhoneNumberUtil(rawId);
            isValidPhoneNumber = phoneValidation.isValid;
          }



          let participantInfo = {
            ...participant,
            profilePictureUrl: null as string | null,
            status: null as string | null,
            displayName: null as string | null,
            phoneNumber: null as string | null,
            isLidFormat: isLidFormat,
            resolvedFromLid: false
          };

          if (!isLidFormat && isValidPhoneNumber) {
            participantInfo.phoneNumber = rawId;
          }


          const participantKeys = Object.keys(participant);

          const documentationJid = participantAny.jid ?? participantAny.id ?? participantAny.lid ?? null;


          let documentationPhone: string | null = null;
          if (documentationJid && documentationJid.includes('@')) {
            const user = documentationJid.split('@')[0];
            if (documentationJid.endsWith('@s.whatsapp.net')) {
              documentationPhone = `+${user}`;

              participantInfo.phoneNumber = user;
              participantInfo.resolvedFromLid = isLidFormat;
              displayPhoneNumber = user;
              isValidPhoneNumber = true;
            } else {
              documentationPhone = user;
            }
          }

          const documentationName = participantAny.name ?? participantAny.notify ?? participantAny.verifiedName ?? null;


          if (documentationName && documentationName !== rawId && documentationName !== displayPhoneNumber && !documentationName.startsWith('LID-')) {
            participantInfo.displayName = documentationName;
          }

          try {
            const existingContact = await storage.getContactByIdentifier(participant.id, 'whatsapp');
            if (existingContact && existingContact.name !== participant.id && existingContact.name !== rawId) {
              participantInfo.displayName = existingContact.name;

              if (existingContact.phone && !existingContact.phone.startsWith('LID-') && existingContact.phone !== rawId) {
                participantInfo.phoneNumber = existingContact.phone;
                participantInfo.resolvedFromLid = isLidFormat;
                displayPhoneNumber = existingContact.phone;
                isValidPhoneNumber = true;
              }
            } else {
            }
          } catch (error) {
          }

          if (!participantInfo.displayName) {
            try {
              const groupParticipants = await storage.getGroupParticipants(conversationId);
              const existingParticipant = groupParticipants.find(p => p.participantJid === participant.id);
              if (existingParticipant && existingParticipant.participantName &&
                existingParticipant.participantName !== participant.id &&
                existingParticipant.participantName !== rawId &&
                !existingParticipant.participantName.startsWith('LID-')) {
                participantInfo.displayName = existingParticipant.participantName;

                if (existingParticipant.contact && existingParticipant.contact.phone &&
                  !existingParticipant.contact.phone.startsWith('LID-') &&
                  existingParticipant.contact.phone !== rawId) {
                  participantInfo.phoneNumber = existingParticipant.contact.phone;
                  participantInfo.resolvedFromLid = isLidFormat;
                  displayPhoneNumber = existingParticipant.contact.phone;
                  isValidPhoneNumber = true;
                }
              }
            } catch (error) {
            }
          }

          if (!participantInfo.displayName && isLidFormat) {
            try {
              const alternativeIdentifiers = [
                rawId,
                `+${rawId}`,
                rawId.substring(1),
                rawId.substring(0, -1),
              ];

              for (const altId of alternativeIdentifiers) {
                const altContact = await storage.getContactByIdentifier(altId, 'whatsapp');
                if (altContact && altContact.name !== altId && altContact.name !== rawId) {
                  participantInfo.displayName = altContact.name;

                  if (altContact.phone && !altContact.phone.startsWith('LID-') && altContact.phone !== rawId) {
                    participantInfo.phoneNumber = altContact.phone;
                    participantInfo.resolvedFromLid = true;
                    displayPhoneNumber = altContact.phone;
                    isValidPhoneNumber = true;
                  }
                  break;
                }
              }
            } catch (error) {
            }
          }

          if (!participantInfo.displayName || participantInfo.displayName === rawId || participantInfo.displayName === displayPhoneNumber) {
            try {
              const contacts = await sock.onWhatsApp(participant.id);

              if (contacts && contacts.length > 0) {
                const contact = contacts[0] as any;
                const contactNameFields = ['name', 'notify', 'pushName', 'displayName', 'verifiedName'];
                for (const field of contactNameFields) {
                  if (contact[field] && contact[field] !== rawId && contact[field] !== displayPhoneNumber) {
                    participantInfo.displayName = contact[field];
                    break;
                  }
                }
              }
            } catch (error) {
            }
          }

          if (!participantInfo.displayName || participantInfo.displayName === rawId || participantInfo.displayName === displayPhoneNumber) {
            try {
              if ((sock as any).store && (sock as any).store.contacts) {
                const contactInfo = (sock as any).store.contacts[participant.id];

                if (contactInfo) {
                  const storeNameFields = ['name', 'notify', 'pushName', 'displayName', 'verifiedName'];
                  for (const field of storeNameFields) {
                    if (contactInfo[field] && contactInfo[field] !== rawId && contactInfo[field] !== displayPhoneNumber) {
                      participantInfo.displayName = contactInfo[field];
                      break;
                    }
                  }
                }
              }
            } catch (error) {
            }
          }

          if (!participantInfo.displayName || participantInfo.displayName === rawId || participantInfo.displayName === displayPhoneNumber) {
            try {
              const businessProfile = await sock.getBusinessProfile(participant.id);

              if (businessProfile) {
                const profile = businessProfile as any;
                const businessNameFields = ['business_name', 'name', 'displayName'];
                for (const field of businessNameFields) {
                  if (profile[field] && profile[field] !== rawId && profile[field] !== displayPhoneNumber && typeof profile[field] === 'string' && profile[field].length < 100) {
                    participantInfo.displayName = profile[field];
                    break;
                  }
                }

                if (!participantInfo.displayName || participantInfo.displayName === rawId || participantInfo.displayName === displayPhoneNumber) {
                  if (profile.description && typeof profile.description === 'string') {
                    const descriptionMatch = profile.description.match(/^([^@|–-]+)/);
                    if (descriptionMatch && descriptionMatch[1].trim().length < 50) {
                      const extractedName = descriptionMatch[1].trim().replace(/👨‍💻|☕|🚀|💻/g, '').trim();
                      if (extractedName && extractedName !== rawId && extractedName !== displayPhoneNumber) {
                        participantInfo.displayName = extractedName;
                      }
                    }
                  }
                }
              }
            } catch (error) {
            }
          }

          if (!participantInfo.displayName || participantInfo.displayName === rawId || participantInfo.displayName === displayPhoneNumber) {
            participantInfo.displayName = displayPhoneNumber;
          }

          try {
            const profilePicUrl = await sock.profilePictureUrl(participant.id, 'image');
            participantInfo.profilePictureUrl = profilePicUrl || null;
            if (profilePicUrl) {
            }
          } catch (error) {
            try {
              const profilePicUrl = await sock.profilePictureUrl(participant.id, 'preview');
              participantInfo.profilePictureUrl = profilePicUrl || null;
              if (profilePicUrl) {
              }
            } catch (previewError) {
            }
          }

          try {
            const statusInfo = await sock.fetchStatus(participant.id);

            if (statusInfo && typeof statusInfo === 'string') {
              participantInfo.status = statusInfo;
            } else if (statusInfo && Array.isArray(statusInfo) && statusInfo.length > 0) {
              const statusObj = statusInfo[0] as any;
              if (statusObj && statusObj.status && statusObj.status.status) {
                participantInfo.status = statusObj.status.status;
              }
            } else if (statusInfo && typeof statusInfo === 'object' && 'status' in statusInfo) {
              participantInfo.status = (statusInfo as any).status;
            } else {
            }
          } catch (statusError) {
          }


          enhancedParticipants.push(participantInfo);

          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const participantsWithRealNames = enhancedParticipants.filter(p => p.displayName && p.displayName !== p.id.split('@')[0]);
        if (participantsWithRealNames.length > 0) {
          participantsWithRealNames.slice(0, 5).forEach((p, i) => {
          });
        }


        const updatedGroupMetadata = {
          subject: metadata.subject,
          desc: metadata.desc,
          participants: enhancedParticipants,
          creation: metadata.creation,
          owner: metadata.owner
        };

        await storage.updateConversation(conversationId, {
          groupName: metadata.subject || conversation.groupName,
          groupDescription: metadata.desc || conversation.groupDescription,
          groupParticipantCount: metadata.participants?.length || 0,
          groupMetadata: updatedGroupMetadata
        });

        await storage.syncGroupParticipantsFromMetadata(conversationId, updatedGroupMetadata);

        const participants = await storage.getGroupParticipants(conversationId);

        res.json({
          success: true,
          participantCount: participants.length,
          message: `Synced ${participants.length} participants from WhatsApp`
        });

      } catch (whatsappError) {
        console.error('Error fetching group metadata from WhatsApp:', whatsappError);
        return res.status(500).json({ error: 'Failed to fetch group metadata from WhatsApp' });
      }

    } catch (error) {
      console.error('Error syncing group participants:', error);
      res.status(500).json({ error: 'Failed to sync group participants' });
    }
  });

  app.get('/api/group-conversations/:id/participants/export', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_ALL_CONVERSATIONS, PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]), async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!conversation.isGroup && !conversation.groupJid) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const participants = await storage.getGroupParticipants(conversationId);

      const csvHeaders = ['Name', 'Phone Number', 'Role', 'Joined Date', 'WhatsApp JID'];
      const csvRows = participants.map(participant => {
        const role = participant.isSuperAdmin ? 'Super Admin' :
          participant.isAdmin ? 'Admin' : 'Member';
        const joinedDate = participant.joinedAt ?
          new Date(participant.joinedAt).toLocaleDateString() : 'Unknown';
        const phoneNumber = participant.contact?.phone ||
          participant.participantJid.split('@')[0] || 'Unknown';
        const name = participant.participantName ||
          participant.contact?.name ||
          phoneNumber;

        return [
          `"${name}"`,
          `"${phoneNumber}"`,
          `"${role}"`,
          `"${joinedDate}"`,
          `"${participant.participantJid}"`
        ].join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
      const groupName = conversation.groupName || 'Group';
      const filename = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_participants_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Error exporting group participants:', error);
      res.status(500).json({ error: 'Failed to export group participants' });
    }
  });

  app.get('/api/group-conversations/:id/messages', ensureAuthenticated, ensureActiveSubscription, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const offset = (page - 1) * limit;

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!conversation.isGroup && !conversation.groupJid) {
        return res.status(404).json({ error: 'Group conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      let totalMessages: number;
      let messages: any[];

      if (user.isSuperAdmin) {
        totalMessages = await storage.getMessagesCountByConversation(conversationId);
        messages = await storage.getMessagesByConversationPaginated(conversationId, limit, offset);
      } else {
        totalMessages = await storage.getMessagesCountByConversationWithCompanyValidation(conversationId, user.companyId);
        messages = await storage.getMessagesByConversationPaginatedWithCompanyValidation(conversationId, user.companyId, limit, offset);
      }

      res.json({
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total: totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
          hasMore: offset + messages.length < totalMessages
        }
      });
    } catch (error) {
      console.error('Error fetching group conversation messages:', error);
      res.status(500).json({ error: 'Failed to fetch group conversation messages' });
    }
  });

  app.patch('/api/conversations/:id', ensureAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;

      const conversation = await storage.updateConversation(id, updates);

      broadcastToAll({
        type: 'conversationUpdated',
        data: conversation
      });

      res.json(conversation);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/conversations/:id/messages', ensureAuthenticated, ensureActiveSubscription, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
      const offset = (page - 1) * limit;


      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }


      if (conversation.isGroup || conversation.groupJid) {
        return res.status(404).json({ error: 'Conversation not found' });
      }


      if (conversation.contactId) {
        const contact = await storage.getContact(conversation.contactId);
        if (contact && (isWhatsAppGroupChatId(contact.phone) || isWhatsAppGroupChatId(contact.identifier))) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
      }

      if (!user.isSuperAdmin) {

        if (!user.companyId) {
          return res.status(400).json({ error: 'User must be associated with a company' });
        }

        if (conversation.companyId !== user.companyId && conversation.companyId !== null) {
          return res.status(403).json({ error: 'Access denied: You can only access conversations from your company' });
        }
      }


      let totalMessages: number;
      let messages: any[];

      if (user.isSuperAdmin) {

        totalMessages = await storage.getMessagesCountByConversation(conversationId);
        messages = await storage.getMessagesByConversationPaginated(conversationId, limit, offset);
      } else {

        totalMessages = await storage.getMessagesCountByConversationWithCompanyValidation(conversationId, user.companyId);
        messages = await storage.getMessagesByConversationPaginatedWithCompanyValidation(conversationId, user.companyId, limit, offset);
      }

      res.json({
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total: totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
          hasMore: offset + messages.length < totalMessages
        }
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.get('/api/messages/:externalId', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const externalId = req.params.externalId;
      const user = req.user;

      const message = await storage.getMessageByExternalId(externalId, user.companyId);

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      res.json(message);
    } catch (error: any) {
      console.error('Error fetching message by external ID:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/messages/:id', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const messageId = parseInt(req.params.id);

      const message = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1)
        .then(rows => rows[0]);

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const user = req.user;

      let canDelete = false;

      if (user.isSuperAdmin || user.isAdmin) {
        canDelete = true;
      }
      else if (message.direction === 'outbound' && message.senderId === user.id) {
        canDelete = true;
      }
      else if (conversation.isGroup && !user.isSuperAdmin) {
        if (user.companyId && conversation.companyId !== user.companyId) {
          return res.status(403).json({ error: 'You do not have permission to access this conversation' });
        }
      }

      if (!canDelete) {
        return res.status(403).json({
          error: conversation.isGroup
            ? 'You do not have permission to delete this group message'
            : 'You do not have permission to delete this message'
        });
      }



      const result = await channelManager.deleteMessage(messageId, user.id, user.companyId);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to delete message' });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully',
        isGroupMessage: conversation.isGroup
      });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  app.delete('/api/conversations/:id/history', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      let canClear = false;

      if (user.isSuperAdmin || user.isAdmin) {
        canClear = true;
      }
      else if (conversation.isGroup) {
        if (user.companyId && conversation.companyId === user.companyId) {
          canClear = true;
        }
      }
      else if (!conversation.isGroup) {
        if (conversation.assignedToUserId === user.id ||
          (user.companyId && conversation.companyId === user.companyId)) {
          canClear = true;
        }
      }

      if (!canClear) {
        return res.status(403).json({
          error: conversation.isGroup
            ? 'You do not have permission to clear this group chat history'
            : 'You do not have permission to clear this chat history'
        });
      }



      const clearResult = await storage.clearConversationHistory(conversationId);

      if (!clearResult.success) {
        return res.status(500).json({ error: 'Failed to clear conversation history' });
      }

      const { mediaCleanupService } = await import('./services/media-cleanup');
      const mediaCleanup = await mediaCleanupService.cleanupConversationMedia(clearResult.mediaFiles);

      if ((global as any).broadcastToAllClients) {
        (global as any).broadcastToAllClients({
          type: 'conversationHistoryCleared',
          data: {
            conversationId,
            deletedMessageCount: clearResult.deletedCount,
            deletedMediaCount: mediaCleanup.deletedFiles.length
          }
        });
      }

      res.json({
        success: true,
        message: 'Chat history cleared successfully',
        deletedMessageCount: clearResult.deletedCount,
        deletedMediaCount: mediaCleanup.deletedFiles.length,
        failedMediaCount: mediaCleanup.failedFiles.length,
        isGroupChat: conversation.isGroup,
        mediaCleanupErrors: mediaCleanup.errors
      });
    } catch (error) {
      console.error('Error clearing conversation history:', error);
      res.status(500).json({ error: 'Failed to clear conversation history' });
    }
  });

  app.post('/api/messages/:id/reply', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const originalMessageId = parseInt(req.params.id);
      const { content } = req.body;
      const user = req.user;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const originalMessage = await storage.getMessageById(originalMessageId);
      if (!originalMessage) {
        return res.status(404).json({ error: 'Original message not found' });
      }

      const conversation = await storage.getConversation(originalMessage.conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'You do not have permission to reply in this conversation' });
      }

      const contact = conversation.contactId ? await storage.getContact(conversation.contactId) : null;

      let quotedMessage = null;

      if (originalMessage.metadata) {
        try {
          let metadata;

          if (typeof originalMessage.metadata === 'string') {
            if (originalMessage.metadata.startsWith('{') || originalMessage.metadata.startsWith('[')) {
              metadata = JSON.parse(originalMessage.metadata);
            } else {
              throw new Error('Invalid metadata format');
            }
          } else if (typeof originalMessage.metadata === 'object') {
            metadata = originalMessage.metadata;
          } else {
            throw new Error('Unexpected metadata type: ' + typeof originalMessage.metadata);
          }

          if (metadata.whatsappMessage) {
            quotedMessage = metadata.whatsappMessage;
          }
          else if (metadata.messageId && metadata.remoteJid) {
            quotedMessage = {
              key: {
                id: metadata.messageId,
                remoteJid: metadata.remoteJid,
                fromMe: metadata.fromMe || false
              },
              message: {
                conversation: originalMessage.content || 'Media message'
              },
              messageTimestamp: Date.now()
            };
          }
        } catch (e) {
          if (originalMessage.externalId) {
            quotedMessage = {
              key: {
                id: originalMessage.externalId,
                remoteJid: contact?.identifier ? `${contact.identifier}@s.whatsapp.net` : 'unknown@s.whatsapp.net',
                fromMe: originalMessage.direction === 'outbound'
              },
              message: {
                conversation: originalMessage.content || 'Message'
              },
              messageTimestamp: originalMessage.sentAt ? new Date(originalMessage.sentAt).getTime() : Date.now()
            };
          }
        }
      }

      const replyOptions = {
        originalMessageId: originalMessageId.toString(),
        originalContent: originalMessage.content || 'Media message',
        originalSender: originalMessage.direction === 'inbound'
          ? (contact?.name || 'Contact')
          : 'You',
        quotedMessage: quotedMessage
      };

      const result = await channelManager.sendReply(
        originalMessage.conversationId,
        content.trim(),
        replyOptions,
        user.id,
        user.companyId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to send reply' });
      }

      res.json({
        success: true,
        message: 'Reply sent successfully',
        messageId: result.messageId,
        data: result.data
      });
    } catch (error) {
      console.error('Error sending reply:', error);
      res.status(500).json({ error: 'Failed to send reply' });
    }
  });

  app.get('/api/conversations/:id/capabilities', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user;

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'You do not have permission to view this conversation' });
      }

      const capabilities = channelManager.getCapabilities(conversation.channelType);

      res.json({
        success: true,
        capabilities,
        channelType: conversation.channelType
      });
    } catch (error) {
      console.error('Error getting channel capabilities:', error);
      res.status(500).json({ error: 'Failed to get channel capabilities' });
    }
  });

  app.get('/api/conversations/:id/bot-status', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user;

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'You do not have permission to view this conversation' });
      }

      let botDisabled = conversation.botDisabled || false;
      if (botDisabled && conversation.disableDuration && conversation.disabledAt) {
        const disabledAt = new Date(conversation.disabledAt);
        const expiresAt = new Date(disabledAt.getTime() + (conversation.disableDuration * 60 * 1000));
        const now = new Date();

        if (now > expiresAt) {
          await storage.updateConversation(conversationId, {
            botDisabled: false,
            disabledAt: null,
            disableDuration: null,
            disableReason: null
          });
          botDisabled = false;
        }
      }

      res.json({
        conversationId,
        botDisabled,
        disabledAt: conversation.disabledAt,
        disableDuration: conversation.disableDuration,
        disableReason: conversation.disableReason
      });
    } catch (error) {
      console.error('Error getting bot status:', error);
      res.status(500).json({ error: 'Failed to get bot status' });
    }
  });

  app.patch('/api/conversations/:id/bot-status', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user;
      const { botDisabled, disableDuration, disableReason } = req.body;

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }

      if (typeof botDisabled !== 'boolean') {
        return res.status(400).json({ error: 'botDisabled must be a boolean value' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!user.isSuperAdmin && conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'You do not have permission to modify this conversation' });
      }

      const updateData: any = {
        botDisabled
      };

      if (botDisabled) {
        updateData.disabledAt = new Date();
        updateData.disableDuration = disableDuration || null;
        updateData.disableReason = disableReason || null;
      } else {
        updateData.disabledAt = null;
        updateData.disableDuration = null;
        updateData.disableReason = null;
      }

      const updatedConversation = await storage.updateConversation(conversationId, updateData);

      broadcastToAll({
        type: 'conversationBotStatusUpdated',
        data: {
          conversationId,
          botDisabled,
          disabledAt: updateData.disabledAt,
          disableDuration: updateData.disableDuration,
          disableReason: updateData.disableReason
        }
      });

      res.json({
        conversationId,
        botDisabled,
        disabledAt: updateData.disabledAt,
        disableDuration: updateData.disableDuration,
        disableReason: updateData.disableReason
      });
    } catch (error) {
      console.error('Error updating bot status:', error);
      res.status(500).json({ error: 'Failed to update bot status' });
    }
  });

  app.post('/api/conversations/:id/messages', ensureAuthenticated, ensureActiveSubscription, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user;


      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }


      if (!user.isSuperAdmin) {
        if (!user.companyId) {
          return res.status(400).json({ error: 'User must be associated with a company' });
        }

        if (conversation.companyId !== user.companyId && conversation.companyId !== null) {
          return res.status(403).json({ error: 'Access denied: You can only create messages in conversations from your company' });
        }
      }

      const messageData = validateBody(insertMessageSchema, {
        ...req.body,
        conversationId,
        senderId: req.user.id,
        senderType: 'user',
        direction: 'outbound',
        isFromBot: req.body.isFromBot || false
      });

      const message = await storage.createMessage(messageData);

      await storage.updateConversation(conversationId, {
        lastMessageAt: new Date()
      });

      broadcastToAll({
        type: 'newMessage',
        data: message
      });

      const updatedConversation = await storage.getConversation(conversationId);
      if (updatedConversation) {
        broadcastToAll({
          type: 'conversationUpdated',
          data: updatedConversation
        });
      }

      res.status(201).json(message);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/conversations/:id/send-template',
    ensureAuthenticated,
    requireAnyPermission([PERMISSIONS.MANAGE_CONVERSATIONS]),
    async (req: any, res) => {
      try {
        const conversationId = parseInt(req.params.id);
        const { templateId, templateName, languageCode, variables, skipBroadcast } = req.body;
        const user = req.user;


        if (!templateName) {
          return res.status(400).json({ error: 'Template name is required' });
        }


        const conversation = await storage.getConversation(conversationId);
        if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found' });
        }


        if (!user.isSuperAdmin) {
          if (!user.companyId) {
            return res.status(400).json({ error: 'User must be associated with a company' });
          }
          if (conversation.companyId !== user.companyId) {
            return res.status(403).json({ error: 'Access denied: Conversation does not belong to your company' });
          }
        }


        if (conversation.channelType !== 'whatsapp_official') {
          return res.status(400).json({ error: 'Template messages can only be sent on WhatsApp Official channels' });
        }

        const channelId = conversation.channelId;
        if (!channelId) {
          return res.status(400).json({ error: 'Channel ID is missing' });
        }


        let templateRecord: any = null;
        if (templateId && conversation.companyId) {
          const [template] = await db.select()
            .from(campaignTemplates)
            .where(and(
              eq(campaignTemplates.id, templateId),
              eq(campaignTemplates.companyId, conversation.companyId),
              eq(campaignTemplates.connectionId, channelId)
            ))
            .limit(1);

          if (!template) {
            return res.status(404).json({ error: 'Template not found or does not belong to this connection' });
          }

          if (template.whatsappTemplateStatus !== 'approved') {
            return res.status(400).json({ error: 'Template is not approved. Only approved templates can be sent.' });
          }

          templateRecord = template;


          if (template.whatsappTemplateName && template.whatsappTemplateName !== templateName) {

            console.warn(`Template name mismatch: DB has "${template.whatsappTemplateName}", client sent "${templateName}"`);
          }
        }


        if (!conversation.contactId || conversation.contactId === null) {
          return res.status(400).json({ error: 'Contact ID is missing' });
        }
        const contact = await storage.getContact(conversation.contactId);
        if (!contact) {
          return res.status(404).json({ error: 'Contact not found' });
        }


        const phoneNumber = contact.phone || contact.identifier;
        if (!phoneNumber) {
          return res.status(400).json({ error: 'Contact phone number is missing' });
        }


        const components: Array<{
          type: 'header' | 'body' | 'button';
          parameters?: Array<{ type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video'; text?: string; image?: any; video?: any; document?: any;[key: string]: any }>;
        }> = [];



        if (templateRecord) {
          let templateMediaUrls = ((templateRecord.mediaUrls as string[]) || []);
          const mediaHandle = (templateRecord as any).mediaHandle;

          const hasMediaHandle = !!mediaHandle;
          const hasMediaUrls = templateMediaUrls.length > 0;
          const hasAnyMedia = hasMediaHandle || hasMediaUrls;

          if (hasAnyMedia) {

            let headerFormat = 'IMAGE'; // Default to IMAGE
            if (hasMediaUrls) {
              const urlLower = templateMediaUrls[0].toLowerCase();
              if (urlLower.includes('/video/') || urlLower.match(/\.(mp4|mov|avi|webm|3gpp)$/)) {
                headerFormat = 'VIDEO';
              } else if (urlLower.includes('/document/') || urlLower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/)) {
                headerFormat = 'DOCUMENT';
              } else if (urlLower.includes('/image/') || urlLower.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                headerFormat = 'IMAGE';
              }
            }


            const isMediaHandleUrl = mediaHandle && (mediaHandle.startsWith('http://') || mediaHandle.startsWith('https://'));

            if (mediaHandle && !isMediaHandleUrl) {

              const headerParam: any = {
                type: headerFormat.toLowerCase(),
                [headerFormat.toLowerCase()]: {
                  id: mediaHandle
                }
              };

              components.push({
                type: 'header',
                parameters: [headerParam]
              });
            } else if (hasMediaUrls) {

              let mediaUrl = templateMediaUrls[0];


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

                const connection = await storage.getChannelConnection(channelId);
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


                const FormData = (await import('form-data')).default;
                const formData = new FormData();
                formData.append('messaging_product', 'whatsapp');

                const getFileExtension = (url: string): string => {
                  const urlLower = url.toLowerCase();
                  if (urlLower.match(/\.(jpg|jpeg)$/)) return 'jpg';
                  if (urlLower.match(/\.png$/)) return 'png';
                  if (urlLower.match(/\.gif$/)) return 'gif';
                  if (urlLower.match(/\.webp$/)) return 'webp';
                  if (urlLower.match(/\.mp4$/)) return 'mp4';
                  if (urlLower.match(/\.mov$/)) return 'mov';
                  if (urlLower.match(/\.pdf$/)) return 'pdf';
                  return 'jpg';
                };

                const getContentType = (ext: string): string => {
                  const types: Record<string, string> = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'gif': 'image/gif',
                    'webp': 'image/webp',
                    'mp4': 'video/mp4',
                    'mov': 'video/quicktime',
                    'pdf': 'application/pdf'
                  };
                  return types[ext] || 'application/octet-stream';
                };

                const fileExtension = getFileExtension(mediaUrl);
                const contentType = mediaResponse.headers['content-type'] || getContentType(fileExtension);

                formData.append('file', Buffer.from(mediaResponse.data), {
                  filename: `template_media.${fileExtension}`,
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

                const mediaId = uploadResponse.data.id;


                const headerParam: any = {
                  type: headerFormat.toLowerCase(),
                  [headerFormat.toLowerCase()]: {
                    id: mediaId
                  }
                };

                components.push({
                  type: 'header',
                  parameters: [headerParam]
                });
              } catch (uploadError: any) {
                console.error('[Send Template] Failed to upload media, trying with link as fallback:', uploadError.message);


                const headerParam: any = {
                  type: headerFormat.toLowerCase(),
                  [headerFormat.toLowerCase()]: {
                    link: mediaUrl
                  }
                };

                components.push({
                  type: 'header',
                  parameters: [headerParam]
                });
              }
            } else {

              return res.status(400).json({
                error: `Template "${templateName}" requires media header but no media URL or media handle is configured. Please ensure the template was properly synced from Meta with media handle stored, or add media URLs to the template.`
              });
            }
          }
        }


        if (variables && Object.keys(variables).length > 0) {

          let expectedVariables: string[] = [];
          if (templateRecord && templateRecord.variables && Array.isArray(templateRecord.variables)) {
            expectedVariables = templateRecord.variables;
          } else {

            expectedVariables = Object.keys(variables);
          }









          const bodyParams = expectedVariables
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(varIndex => {
              const value = variables[varIndex];

              if (!value || (typeof value === 'string' && value.trim() === '')) {
                throw new Error(`Variable ${varIndex} is required but not provided`);
              }
              return {
                type: 'text' as const,
                text: typeof value === 'string' ? value.trim() : String(value)
              };
            });


          if (bodyParams.length > 0) {
            components.push({
              type: 'body',
              parameters: bodyParams
            });
          }
        }








        const companyId = conversation.companyId || (user.isSuperAdmin ? 0 : user.companyId || 0);


        const result = await whatsAppOfficialService.sendTemplateMessage(
          channelId,
          user.id,
          companyId,
          phoneNumber,
          templateName,
          languageCode || 'en',
          components,
          skipBroadcast === true // Allow skipping broadcast to prevent duplicate messages when initiating conversations
        );

        return res.json({ success: true, messageId: result.messageId || result.id });
      } catch (error: any) {
        console.error('Error sending template message:', error);
        return res.status(500).json({
          error: error.message || 'Failed to send template message'
        });
      }
    }
  );

  app.post('/api/conversations/:id/upload-media', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CHANNELS, PERMISSIONS.MANAGE_CONVERSATIONS]), (req, res, next) => {


    const simpleUpload = multer({
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, UPLOAD_DIR);
        },
        filename: function (req, file, cb) {
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const fileExt = path.extname(file.originalname) || '';
          cb(null, `${uniqueId}${fileExt}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 }
    });

    simpleUpload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        simpleUpload.single('media')(req, res, (err2) => {
          if (err2) {
            console.error('Multer error (fallback):', err2);
            simpleUpload.any()(req, res, (err3) => {
              if (err3) {
                console.error('Multer error (last resort):', err3);
                return res.status(400).json({ error: 'Failed to process file upload' });
              }

              if (req.files && Array.isArray(req.files) && req.files.length > 0) {
                req.file = req.files[0];

                next();
              } else {
                return res.status(400).json({ error: 'No file found in the request' });
              }
            });
          } else {

            next();
          }
        });
      } else {

        next();
      }
    });
  }, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const caption = req.body.caption || '';

      if (!req.file) {
        return res.status(400).json({ error: 'No media file uploaded' });
      }

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Conversation not found' });
      }

      let determinedMediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      const mimeType = req.file.mimetype;

      if (mimeType.startsWith('image/')) {
        determinedMediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        determinedMediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        determinedMediaType = 'audio';
      } else {
        determinedMediaType = 'document';
      }

      if (!conversation.contactId) {
        await fsExtra.unlink(req.file.path);
        return res.status(400).json({ error: 'Individual conversation missing contact ID' });
      }

      const contact = await storage.getContact(conversation.contactId);

      if (!contact) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Contact not found' });
      }

      const channelConnection = await storage.getChannelConnection(conversation.channelId);

      if (!channelConnection) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Channel connection not found' });
      }

      const user = req.user as any;

      const { checkConnectionPermission } = await import('./services/channels/whatsapp');

      const hasConnectionAccess = await checkConnectionPermission(
        user,
        channelConnection,
        conversationId,
        conversation.channelId
      );

      if (!hasConnectionAccess) {
        await fsExtra.unlink(req.file.path);
        return res.status(403).json({ error: 'You do not have permission to access this connection' });
      }

      let isConnectionActive = false;
      if (conversation.channelType === 'whatsapp_official') {
        isConnectionActive = whatsAppOfficialService.isActive?.(conversation.channelId) ?? false;

        if (!isConnectionActive && channelConnection.connectionData) {
          try {
            const connectionData = channelConnection.connectionData as any;
            if (connectionData.accessToken && connectionData.phoneNumberId && connectionData.wabaId) {
              await whatsAppOfficialService.initializeConnection(conversation.channelId, user.companyId, {
                accessToken: connectionData.accessToken,
                phoneNumberId: connectionData.phoneNumberId,
                wabaId: connectionData.wabaId || connectionData.businessAccountId,
                webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token'
              });
              isConnectionActive = whatsAppOfficialService.isActive?.(conversation.channelId) ?? false;
            }
          } catch (initError) {
            console.error('Failed to initialize WhatsApp Official connection:', initError);
          }
        }
      } else if (conversation.channelType === 'messenger') {

        isConnectionActive = !!(channelConnection.accessToken);


        if (isConnectionActive && channelConnection.connectionData) {
          try {
            const connectionData = channelConnection.connectionData as any;


            isConnectionActive = !!(connectionData.pageId && channelConnection.accessToken);
          } catch (validationError) {
            console.error('Failed to validate Messenger connection:', validationError);
            isConnectionActive = false;
          }
        }
      } else {
        isConnectionActive = whatsAppService.isConnectionActive?.(conversation.channelId) ?? false;
      }

      if (!isConnectionActive) {
        await fsExtra.unlink(req.file.path);
        const channelName = conversation.channelType === 'messenger' ? 'Messenger' : 'WhatsApp';
        return res.status(500).json({
          error: `${channelName} connection not active`,
          message: `The ${channelName} connection is not currently active. Please refresh the connection or try again later.`
        });
      }

      let message = null;

      let messageCaption: string = caption;
      try {
        const dbUser = await storage.getUser(req.user.id);
        if (dbUser) {
          const nameCandidates = [
            (dbUser as any).fullName,
            (dbUser as any).name,
            [(dbUser as any).firstName, (dbUser as any).lastName].filter(Boolean).join(' ').trim(),
            (dbUser as any).displayName,
            typeof (dbUser as any).email === 'string' ? (dbUser as any).email.split('@')[0] : undefined
          ].filter((v: any) => typeof v === 'string' && v.trim().length > 0);
          const signatureName = nameCandidates[0];
          if (signatureName) {
            messageCaption = `> *${signatureName}*\n\n${caption || ''}`.trim();
          }
        }
      } catch (sigErr) {
        console.error('Error generating signature for media caption:', sigErr);
      }

      let convertedFilePath: string | null = null;

      try {
        if (conversation.channelType === 'whatsapp_official') {
          if (!req.user || !req.user.companyId) {
            await fsExtra.unlink(req.file.path);
            return res.status(400).json({ error: 'Company ID is required for multi-tenant security' });
          }

          const host = req.get('host') || 'localhost:9000';
          const protocol = host.includes('localhost') ? 'http' : req.protocol;
          let publicUrl = `${protocol}://${host}/uploads/${path.basename(req.file.path)}`;
          const publicPath = path.join(process.cwd(), 'uploads', path.basename(req.file.path));

          if (path.resolve(req.file.path) !== path.resolve(publicPath)) {
            await fsExtra.copy(req.file.path, publicPath);
          }

          let finalMimeType = req.file.mimetype;
          let finalFilename = req.file.originalname;

          if (determinedMediaType === 'audio') {
            const supportedAudioTypes = [
              'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus'
            ];

            if (!supportedAudioTypes.includes(req.file.mimetype)) {
              const { convertAudioForWhatsAppWithFallback } = await import('./utils/audio-converter');
              const tempDir = path.join(process.cwd(), 'temp', 'audio');
              await fsExtra.ensureDir(tempDir);

              try {
                const conversionResult = await convertAudioForWhatsAppWithFallback(
                  req.file.path,
                  tempDir,
                  req.file.originalname
                );

                const convertedBasename = path.basename(conversionResult.outputPath);
                const convertedPublicPath = path.join(process.cwd(), 'uploads', convertedBasename);
                await fsExtra.copy(conversionResult.outputPath, convertedPublicPath);

                convertedFilePath = convertedPublicPath;

                publicUrl = `${protocol}://${host}/uploads/${convertedBasename}`;
                finalMimeType = conversionResult.mimeType;
                finalFilename = convertedBasename;

                await fsExtra.unlink(conversionResult.outputPath);
              } catch (conversionError) {
                console.error('Audio conversion failed for WhatsApp Official:', conversionError);
              }
            }
          }

          message = await whatsAppOfficialService.sendMedia(
            conversation.channelId,
            req.user.id,
            req.user.companyId,
            contact.identifier || contact.phone || '',
            determinedMediaType,
            publicUrl,
            messageCaption,
            finalFilename,
            finalMimeType,
            false
          );
        } else if (conversation.channelType === 'messenger') {




          const messengerSupportedTypes = {
            'image': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'video': ['video/mp4', 'video/3gpp', 'video/quicktime', 'video/avi'],
            'audio': ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav'],
            'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
          };

          const supportedMimeTypes = messengerSupportedTypes[determinedMediaType] || [];
          if (supportedMimeTypes.length > 0 && !supportedMimeTypes.includes(req.file.mimetype)) {
            await fsExtra.unlink(req.file.path);
            return res.status(400).json({
              error: 'Unsupported file format for Messenger',
              message: `File type ${req.file.mimetype} is not supported for ${determinedMediaType} messages on Messenger. Supported types: ${supportedMimeTypes.join(', ')}`
            });
          }


          const maxSize = determinedMediaType === 'audio' ? 8 * 1024 * 1024 : 25 * 1024 * 1024;
          if (req.file.size > maxSize) {
            await fsExtra.unlink(req.file.path);
            return res.status(400).json({
              error: 'File too large for Messenger',
              message: `File size ${Math.round(req.file.size / 1024 / 1024)}MB exceeds the ${Math.round(maxSize / 1024 / 1024)}MB limit for ${determinedMediaType} files on Messenger`
            });
          }

          const host = req.get('host') || 'localhost:9000';
          const protocol = host.includes('localhost') ? 'http' : req.protocol;
          const publicUrl = `${protocol}://${host}/uploads/${path.basename(req.file.path)}`;
          const publicPath = path.join(process.cwd(), 'uploads', path.basename(req.file.path));


          if (path.resolve(req.file.path) !== path.resolve(publicPath)) {
            await fsExtra.copy(req.file.path, publicPath);

          }


          const { sendMessengerMediaMessage } = await import('./services/channels/messenger');


          const messengerMediaType = determinedMediaType === 'document' ? 'file' : determinedMediaType;




          const messengerResult = await sendMessengerMediaMessage(
            conversation.channelId,
            contact.identifier || contact.phone || '',
            req.file.path, // Use original file path for Facebook upload
            messengerMediaType as 'image' | 'video' | 'audio' | 'file'
          );

          if (!messengerResult.success) {
            console.error('❌ [MESSENGER MEDIA] Failed to send media message:', messengerResult.error);
            throw new Error(messengerResult.error || 'Failed to send Messenger media message');
          }




          const messageData = {
            conversationId: conversation.id,
            senderId: req.user.id,
            content: messageCaption || `[${determinedMediaType.toUpperCase()}]`,
            type: determinedMediaType,
            direction: 'outbound' as const,
            status: 'sent' as const,
            mediaUrl: publicUrl, // Store public URL for frontend display
            externalId: messengerResult.messageId || `messenger-${Date.now()}`,
            metadata: JSON.stringify({
              messenger_message_id: messengerResult.messageId,
              timestamp: new Date().toISOString(),
              mediaType: determinedMediaType,
              filename: req.file.originalname,
              originalPath: req.file.path,
              publicUrl: publicUrl,
              uploadedToFacebook: true
            })
          };

          message = await storage.createMessage(messageData);


          await storage.updateConversation(conversation.id, {
            lastMessageAt: new Date()
          });


          if ((global as any).broadcastToAllClients) {
            (global as any).broadcastToAllClients({
              type: 'newMessage',
              data: message
            });
          }


          await fsExtra.unlink(req.file.path);


          return res.status(201).json(message);

        } else {
          message = await whatsAppService.sendMedia(
            conversation.channelId,
            req.user.id,
            contact.identifier || contact.phone || '',
            determinedMediaType,
            req.file.path,
            messageCaption,
            req.file.originalname,
            false,
            conversationId
          );
        }

        if (!message) {
          await fsExtra.unlink(req.file.path);
          return res.status(500).json({ error: 'Failed to send media message' });
        }
      } catch (sendError) {
        console.error('Media send error:', sendError);

        await fsExtra.unlink(req.file.path);

        if (convertedFilePath) {
          try {
            await fsExtra.unlink(convertedFilePath);
          } catch (cleanupError) {
            console.error('Error cleaning up converted audio file:', cleanupError);
          }
        }

        return res.status(500).json({
          error: 'Failed to send WhatsApp media message',
          message: sendError instanceof Error ? sendError.message : 'Unknown error'
        });
      }

      await fsExtra.unlink(req.file.path);

      if (convertedFilePath) {
        try {
          await fsExtra.unlink(convertedFilePath);
        } catch (cleanupError) {
          console.error('Error cleaning up converted audio file:', cleanupError);
        }
      }

      return res.status(201).json(message);
    } catch (error: any) {
      console.error('Error uploading media:', error);

      if (req.file && req.file.path) {
        try {
          await fsExtra.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });


  app.post('/api/conversations/:id/upload-media-only', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CHANNELS, PERMISSIONS.MANAGE_CONVERSATIONS]), (req, res, next) => {
    const simpleUpload = multer({
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          cb(null, UPLOAD_DIR);
        },
        filename: function (req, file, cb) {
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const fileExt = path.extname(file.originalname) || '';
          cb(null, `${uniqueId}${fileExt}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 }
    });

    simpleUpload.single('file')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: 'Failed to process file upload' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: 'No media file uploaded' });
      }

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        await fsExtra.unlink(req.file.path);
        return res.status(404).json({ error: 'Conversation not found' });
      }


      let determinedMediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      const mimeType = req.file.mimetype;

      if (mimeType.startsWith('image/')) {
        determinedMediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        determinedMediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        determinedMediaType = 'audio';
      } else {
        determinedMediaType = 'document';
      }


      const host = req.get('host') || `localhost:${process.env.PORT || 9100}`;
      const protocol = host.includes('localhost') ? 'http' : req.protocol;
      const publicUrl = `${protocol}://${host}/uploads/${path.basename(req.file.path)}`;
      const publicPath = path.join(process.cwd(), 'uploads', path.basename(req.file.path));


      if (path.resolve(req.file.path) !== path.resolve(publicPath)) {
        await fsExtra.copy(req.file.path, publicPath);
      }


      let finalMimeType = req.file.mimetype;
      let finalFilename = req.file.originalname;

      if (conversation.channelType === 'whatsapp_official' && determinedMediaType === 'audio') {
        const supportedAudioTypes = [
          'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus'
        ];

        if (!supportedAudioTypes.includes(req.file.mimetype)) {
          const { convertAudioForWhatsAppWithFallback } = await import('./utils/audio-converter');
          const tempDir = path.join(process.cwd(), 'temp', 'audio');
          await fsExtra.ensureDir(tempDir);

          try {
            const conversionResult = await convertAudioForWhatsAppWithFallback(
              req.file.path,
              tempDir,
              req.file.originalname
            );

            const convertedBasename = path.basename(conversionResult.outputPath);
            const convertedPublicPath = path.join(process.cwd(), 'uploads', convertedBasename);
            await fsExtra.copy(conversionResult.outputPath, convertedPublicPath);

            finalMimeType = conversionResult.mimeType;
            finalFilename = convertedBasename;


            const newPublicUrl = `${protocol}://${host}/uploads/${convertedBasename}`;

            await fsExtra.unlink(conversionResult.outputPath);
            await fsExtra.unlink(req.file.path); // Clean up original file

            return res.json({
              success: true,
              mediaUrl: newPublicUrl,
              mediaType: determinedMediaType,
              fileName: finalFilename,
              fileSize: req.file.size,
              mimeType: finalMimeType
            });
          } catch (conversionError) {
            console.error('Audio conversion failed:', conversionError);

          }
        }
      }


      await fsExtra.unlink(req.file.path);

      return res.json({
        success: true,
        mediaUrl: publicUrl,
        mediaType: determinedMediaType,
        fileName: finalFilename,
        fileSize: req.file.size,
        mimeType: finalMimeType
      });

    } catch (error: any) {
      console.error('Error uploading media file:', error);

      if (req.file && req.file.path) {
        try {
          await fsExtra.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });


  app.post('/api/scheduled-messages/upload-media', ensureAuthenticated, requireAnyPermission([PERMISSIONS.MANAGE_CHANNELS, PERMISSIONS.MANAGE_CONVERSATIONS]), async (req, res, next) => {
    const multer = (await import('multer')).default;
    const path = (await import('path')).default;
    const crypto = (await import('crypto')).default;

    const scheduledUpload = multer({
      storage: multer.diskStorage({
        destination: async function (req: any, file: any, cb: any) {
          const scheduledDir = path.join(process.cwd(), 'uploads', 'scheduled-media');
          const fsExtra = (await import('fs-extra')).default;
          fsExtra.ensureDirSync(scheduledDir);
          cb(null, scheduledDir);
        },
        filename: function (req: any, file: any, cb: any) {
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const fileExt = path.extname(file.originalname) || '';
          cb(null, `scheduled_${uniqueId}${fileExt}`);
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
    });

    scheduledUpload.single('file')(req, res, (err: any) => {
      if (err) {
        console.error('Scheduled media upload error:', err);
        return res.status(400).json({ error: 'Failed to process file upload' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No media file uploaded' });
      }


      let determinedMediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      const mimeType = req.file.mimetype;

      if (mimeType.startsWith('image/')) {
        determinedMediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        determinedMediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        determinedMediaType = 'audio';
      } else {
        determinedMediaType = 'document';
      }


      const mediaFilePath = req.file.path;



      const responseData = {
        success: true,
        mediaFilePath: mediaFilePath,
        mediaType: determinedMediaType,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      };


      if (req.user?.companyId && req.file) {
        dataUsageTracker.trackFileUpload(req.user.companyId, req.file.size).catch(err => {
          console.error('Failed to track scheduled message media upload:', err);
        });
      }

      return res.json(responseData);

    } catch (error: any) {
      console.error('Error uploading scheduled media file:', error);

      if (req.file && req.file.path) {
        try {
          const fs = (await import('fs-extra')).default;
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  });

  app.get('/api/contacts/:id/notes', ensureAuthenticated, async (req, res) => {
    const contactId = parseInt(req.params.id);
    const notes = await storage.getNotesByContact(contactId);
    res.json(notes);
  });

  app.post('/api/contacts/:id/notes', ensureAuthenticated, async (req: any, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const noteData = validateBody(insertNoteSchema, {
        ...req.body,
        contactId,
        userId: req.user.id
      });

      const note = await storage.createNote(noteData);
      res.status(201).json(note);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/upload', ensureAuthenticated, async (req, res) => {
    const flowMediaUpload = multer({
      storage: flowMediaStorage,
      limits: { fileSize: 30 * 1024 * 1024 }
    }).single('file');

    flowMediaUpload(req, res, async (err) => {
      if (err) {
        console.error('Error uploading file:', err);
        return res.status(400).json({ error: 'File upload failed', message: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file found in the request' });
      }

      try {


        const filename = path.basename(req.file.path);
        const fileUrl = `/media/flow-media/${filename}`;

        const responseData = {
          url: fileUrl,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        };


        if (req.user?.companyId && req.file) {
          dataUsageTracker.trackFileUpload(req.user.companyId, req.file.size).catch(err => {
            console.error('Failed to track flow-media upload:', err);
          });
        }

        return res.status(200).json(responseData);
      } catch (error: any) {
        console.error('Error processing uploaded file:', error);

        if (req.file && req.file.path) {
          try {
            await fsExtra.unlink(req.file.path);
          } catch (unlinkError) {
            console.error('Error deleting uploaded file:', unlinkError);
          }
        }

        return res.status(500).json({ error: 'Server error', message: error.message });
      }
    });
  });

  app.get('/api/flows', ensureAuthenticated, async (req: any, res) => {
    try {
      const flows = await storage.getFlows(req.user.id);
      res.json(flows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/user/plan-info', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.companyId) {
        return res.status(403).json({ message: 'User is not associated with a company' });
      }

      const company = await storage.getCompany(user.companyId);
      if (!company) {
        return res.status(403).json({ message: 'Company not found' });
      }

      let companyPlan;

      if (company.planId) {
        companyPlan = await storage.getPlan(company.planId);
      }

      if (!companyPlan && company.plan) {
        const allPlans = await storage.getAllPlans();
        companyPlan = allPlans.find(p => p.name.toLowerCase() === company.plan!.toLowerCase());
      }

      if (!companyPlan) {
        return res.status(403).json({ message: 'Company plan not found' });
      }

      const companyFlows = await storage.getFlowsByCompany(company.id);

      res.json({
        plan: companyPlan,
        company: company,
        currentFlowCount: companyFlows.length,
        remainingFlows: Math.max(0, companyPlan.maxFlows - companyFlows.length)
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/flows/:id', ensureAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const flow = await storage.getFlow(id);

      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }

      res.json(flow);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/flows', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.companyId) {
        return res.status(403).json({ message: 'User is not associated with a company' });
      }

      const company = await storage.getCompany(user.companyId);
      if (!company) {
        return res.status(403).json({ message: 'Company not found' });
      }

      let companyPlan;

      if (company.planId) {
        companyPlan = await storage.getPlan(company.planId);
      }

      if (!companyPlan && company.plan) {
        const allPlans = await storage.getAllPlans();
        companyPlan = allPlans.find(p => p.name.toLowerCase() === company.plan!.toLowerCase());
      }

      if (!companyPlan) {
        return res.status(403).json({ message: 'Company plan not found' });
      }

      const companyFlows = await storage.getFlowsByCompany(company.id);

      if (companyFlows.length >= companyPlan.maxFlows) {
        return res.status(403).json({
          message: `You've reached your plan's flow limit. The ${companyPlan.name} plan allows ${companyPlan.maxFlows} flow${companyPlan.maxFlows === 1 ? '' : 's'}.`,
          planLimit: companyPlan.maxFlows,
          currentCount: companyFlows.length,
          planName: companyPlan.name,
          upgradeRequired: true
        });
      }

      const flowData = validateBody(insertFlowSchema, {
        ...req.body,
        userId: typeof req.user?.id === 'number' ? req.user.id : (() => { res.status(400).json({ message: 'User ID is required' }); throw new Error('User ID is required'); })(),
        companyId: company.id,
        status: req.body.status || 'draft'
      });

      const flow = await storage.createFlow(flowData);
      res.status(201).json(flow);

      broadcastToAll({
        type: 'flowCreated',
        data: flow
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch('/api/flows/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const flow = await storage.getFlow(id);

      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }

      if (flow.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to update this flow' });
      }

      const updatedData = {
        ...req.body
      };

      const updatedFlow = await storage.updateFlow(id, updatedData);
      res.json(updatedFlow);

      broadcastToAll({
        type: 'flowUpdated',
        data: updatedFlow
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/flows/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const flow = await storage.getFlow(id);

      if (!flow) {
        return res.status(404).json({ message: 'Flow not found' });
      }

      if (flow.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to delete this flow' });
      }

      const deleted = await storage.deleteFlow(id);
      if (!deleted) {
        return res.status(500).json({ message: 'Failed to delete flow' });
      }

      res.status(204).end();

      broadcastToAll({
        type: 'flowDeleted',
        data: { id }
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/flows/:id/duplicate', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const originalFlow = await storage.getFlow(id);

      if (!originalFlow) {
        return res.status(404).json({ message: 'Flow not found' });
      }

      if (originalFlow.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to duplicate this flow' });
      }

      const user = req.user;
      if (!user.companyId) {
        return res.status(403).json({ message: 'User is not associated with a company' });
      }

      const company = await storage.getCompany(user.companyId);
      if (!company) {
        return res.status(403).json({ message: 'Company not found' });
      }

      let companyPlan;

      if (company.planId) {
        companyPlan = await storage.getPlan(company.planId);
      }

      if (!companyPlan && company.plan) {
        const allPlans = await storage.getAllPlans();
        companyPlan = allPlans.find(p => p.name.toLowerCase() === company.plan!.toLowerCase());
      }

      if (!companyPlan) {
        return res.status(403).json({ message: 'Company plan not found' });
      }

      const companyFlows = await storage.getFlowsByCompany(company.id);

      if (companyFlows.length >= companyPlan.maxFlows) {
        return res.status(403).json({
          message: `You've reached your plan's flow limit. The ${companyPlan.name} plan allows ${companyPlan.maxFlows} flow${companyPlan.maxFlows === 1 ? '' : 's'}.`,
          planLimit: companyPlan.maxFlows,
          currentCount: companyFlows.length,
          planName: companyPlan.name,
          upgradeRequired: true
        });
      }

      const duplicateFlowData = validateBody(insertFlowSchema, {
        userId: originalFlow.userId,
        companyId: originalFlow.companyId,
        name: `${originalFlow.name} (Copy)`,
        description: originalFlow.description,
        status: 'draft',
        nodes: originalFlow.nodes,
        edges: originalFlow.edges,
        version: 1
      });

      const duplicatedFlow = await storage.createFlow(duplicateFlowData);
      res.status(201).json(duplicatedFlow);

      broadcastToAll({
        type: 'flowCreated',
        data: duplicatedFlow
      });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });


  app.get('/api/flows/:id/variables', ensureAuthenticated, async (req: any, res) => {
    try {
      const flowId = parseInt(req.params.id);
      const userId = req.user?.id;
      const companyId = req.user?.companyId;

      if (!flowId || isNaN(flowId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid flow ID'
        });
      }

      const flow = await storage.getFlow(flowId);
      if (!flow) {
        return res.status(404).json({
          success: false,
          error: 'Flow not found'
        });
      }

      if (flow.userId !== userId && flow.companyId !== companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const nodes = flow.nodes as any[] || [];
      const dataCaptureNodes = nodes.filter(node =>
        node.type === 'data_capture' &&
        node.data?.captureRules?.length > 0
      );

      const codeExecutionNodes = nodes.filter(node =>
        node.type === 'code_execution' &&
        node.data?.code
      );

      const capturedVariables: Array<{
        variableKey: string;
        label: string;
        description: string;
        variableType: string;
        nodeId: string;
        nodeName: string;
        required: boolean;
      }> = [];

      dataCaptureNodes.forEach(node => {
        const captureRules = node.data.captureRules || [];
        const nodeName = node.data.label || `Data Capture ${node.id}`;

        captureRules.forEach((rule: any) => {
          if (rule.variableName) {
            capturedVariables.push({
              variableKey: rule.variableName,
              label: rule.variableName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
              description: rule.description || `Captured from ${nodeName}`,
              variableType: rule.dataType || 'string',
              nodeId: node.id,
              nodeName,
              required: rule.required || false
            });
          }
        });
      });

      codeExecutionNodes.forEach(node => {
        const nodeName = node.data.label || `Code Execution ${node.id}`;

        capturedVariables.push({
          variableKey: 'code_execution_output',
          label: 'Code Execution Output',
          description: `Output variables from ${nodeName}`,
          variableType: 'object',
          nodeId: node.id,
          nodeName,
          required: false
        });
      });

      const uniqueVariables = capturedVariables.reduce((acc, variable) => {
        const existing = acc.find(v => v.variableKey === variable.variableKey);
        if (!existing) {
          acc.push(variable);
        }
        return acc;
      }, [] as typeof capturedVariables);

      logger.info('FlowVariables', `Retrieved ${uniqueVariables.length} captured variables for flow ${flowId}`, {
        flowId,
        userId,
        variableCount: uniqueVariables.length,
        dataCaptureNodeCount: dataCaptureNodes.length,
        codeExecutionNodeCount: codeExecutionNodes.length
      });

      res.json({
        success: true,
        variables: uniqueVariables,
        meta: {
          flowId,
          flowName: flow.name,
          dataCaptureNodeCount: dataCaptureNodes.length,
          codeExecutionNodeCount: codeExecutionNodes.length,
          totalVariableCount: uniqueVariables.length
        }
      });

    } catch (error) {
      logger.error('FlowVariables', 'Error getting flow variables', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });


  app.get('/api/flows/:id/sessions', ensureAuthenticated, async (req: any, res) => {
    try {
      const flowId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!flowId || isNaN(flowId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid flow ID is required'
        });
      }

      const sessions = await storage.getRecentFlowSessions(flowId, limit, offset);

      logger.info('FlowVariables', `Retrieved ${sessions.length} recent sessions for flow ${flowId}`, {
        flowId,
        sessionCount: sessions.length,
        limit,
        offset
      });

      res.json({
        success: true,
        sessions,
        meta: {
          flowId,
          count: sessions.length,
          limit,
          offset
        }
      });

    } catch (error) {
      logger.error('FlowVariables', 'Error fetching recent flow sessions', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });


  app.delete('/api/flows/:id/sessions', ensureAuthenticated, async (req: any, res) => {
    try {
      const flowId = parseInt(req.params.id);

      if (!flowId || isNaN(flowId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid flow ID is required'
        });
      }

      const deletedCount = await storage.deleteAllFlowSessions(flowId);

      logger.info('FlowVariables', `Deleted ${deletedCount} sessions for flow ${flowId}`, {
        flowId,
        deletedCount
      });

      res.json({
        success: true,
        message: `Successfully deleted ${deletedCount} sessions`,
        deletedCount
      });

    } catch (error) {
      logger.error('FlowVariables', 'Error deleting flow sessions', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });


  app.get('/api/sessions/:sessionId/variables', ensureAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.params.sessionId;
      const scope = req.query.scope as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      if (limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be between 1 and 100'
        });
      }

      if (offset < 0) {
        return res.status(400).json({
          success: false,
          error: 'Offset must be non-negative'
        });
      }

      const validScopes = ['global', 'flow', 'node', 'user', 'session'] as const;
      const validatedScope = scope && validScopes.includes(scope as any) ? scope as typeof validScopes[number] : 'session';

      const { variables, totalCount } = await storage.getFlowVariablesPaginated(sessionId, {
        scope: validatedScope,
        limit,
        offset
      });

      logger.info('FlowVariables', `Retrieved ${variables.length} variable values for session ${sessionId} (${offset}-${offset + variables.length} of ${totalCount})`, {
        sessionId,
        scope,
        limit,
        offset,
        variableCount: variables.length,
        totalCount
      });

      res.json({
        success: true,
        variables: variables.reduce((acc, variable) => {
          acc[variable.variableKey] = variable.variableValue;
          return acc;
        }, {} as Record<string, any>),
        details: variables,
        meta: {
          sessionId,
          scope: validatedScope,
          count: variables.length,
          totalCount,
          limit,
          offset,
          hasMore: offset + variables.length < totalCount
        }
      });

    } catch (error) {
      logger.error('FlowVariables', 'Error getting session variables', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });


  app.delete('/api/sessions/:sessionId/variables', ensureAuthenticated, async (req: any, res) => {
    try {
      const sessionId = req.params.sessionId;
      const scope = req.query.scope as string;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      await storage.clearFlowVariables(sessionId, scope);

      logger.info('FlowVariables', `Cleared variables for session ${sessionId}`, {
        sessionId,
        scope
      });

      res.json({
        success: true,
        message: 'Variables cleared successfully'
      });

    } catch (error) {
      logger.error('FlowVariables', 'Error clearing session variables', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  app.get('/api/flow-assignments', ensureAuthenticated, async (req, res) => {
    try {
      const { channelId, flowId } = req.query;
      const channelIdNum = channelId ? parseInt(channelId as string) : undefined;
      const flowIdNum = flowId ? parseInt(flowId as string) : undefined;

      const assignments = await storage.getFlowAssignments(channelIdNum, flowIdNum);
      res.json(assignments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/flow-assignments', ensureAuthenticated, async (req: any, res) => {
    try {
      const assignmentData = validateBody(insertFlowAssignmentSchema, {
        ...req.body,
        isActive: req.body.isActive || false
      });

      const channelConnection = await storage.getChannelConnection(assignmentData.channelId);
      if (!channelConnection) {
        return res.status(404).json({ message: 'Channel connection not found' });
      }

      if (channelConnection.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to assign flows to this channel' });
      }

      const assignment = await storage.createFlowAssignment(assignmentData);
      res.status(201).json(assignment);

      broadcastToAll({
        type: 'flowAssignmentCreated',
        data: assignment
      });
    } catch (err: any) {
      console.error('❌ Error creating flow assignment:', err);


      let errorMessage = err.message;
      if (err.message.includes('already assigned to')) {
        errorMessage = `Cannot assign flow: ${err.message}`;
      }

      res.status(400).json({ message: errorMessage });
    }
  });

  app.patch('/api/flow-assignments/:id/status', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { isActive } = req.body;

      if (isActive === undefined) {
        return res.status(400).json({ message: 'isActive field is required' });
      }

      const assignment = await storage.getFlowAssignment(id);
      if (!assignment) {
        return res.status(404).json({ message: 'Flow assignment not found' });
      }

      const channelConnection = await storage.getChannelConnection(assignment.channelId);
      if (!channelConnection || channelConnection.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to update this assignment' });
      }



      const updatedAssignment = await storage.updateFlowAssignmentStatus(id, isActive);



      res.json(updatedAssignment);


      broadcastToAll({
        type: 'flowAssignmentUpdated',
        data: updatedAssignment
      });


      broadcastToAll({
        type: 'flowAssignmentStatusChanged',
        data: {
          assignmentId: id,
          flowId: updatedAssignment.flowId,
          channelId: updatedAssignment.channelId,
          isActive: updatedAssignment.isActive,
          timestamp: new Date().toISOString()
        }
      });


      if ((global as any).flowAssignmentEventEmitter) {
        (global as any).flowAssignmentEventEmitter.emit('flowAssignmentStatusChanged', {
          assignmentId: id,
          flowId: updatedAssignment.flowId,
          channelId: updatedAssignment.channelId,
          isActive: updatedAssignment.isActive,
          timestamp: new Date().toISOString()
        });
      }

    } catch (err: any) {
      console.error('❌ Error updating flow assignment status:', err);


      let errorMessage = err.message;
      if (err.message.includes('already active on')) {
        errorMessage = `Cannot activate: ${err.message}`;
      } else if (err.message.includes('already assigned to')) {
        errorMessage = `Cannot assign: ${err.message}`;
      }

      res.status(400).json({ message: errorMessage });
    }
  });

  app.delete('/api/flow-assignments/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);

      const assignment = await storage.getFlowAssignment(id);
      if (!assignment) {
        return res.status(404).json({ message: 'Flow assignment not found' });
      }

      const channelConnection = await storage.getChannelConnection(assignment.channelId);
      if (!channelConnection || channelConnection.userId !== req.user.id) {
        return res.status(403).json({ message: 'You do not have permission to delete this assignment' });
      }

      const deleted = await storage.deleteFlowAssignment(id);
      if (!deleted) {
        return res.status(500).json({ message: 'Failed to delete flow assignment' });
      }

      res.status(204).end();

      broadcastToAll({
        type: 'flowAssignmentDeleted',
        data: { id }
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/google/auth', ensureAuthenticated, async (req: any, res) => {
    try {
      const authUrl = await googleCalendarService.getAuthUrl(req.user.id, req.user.companyId);

      if (!authUrl) {
        return res.status(400).json({
          error: 'Google Calendar integration not configured by platform administrator. Please contact support.'
        });
      }

      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/google/calendar/callback', async (req, res) => {
    await googleCalendarService.handleAuthCallback(req, res);
  });


  app.get('/api/google/sheets/auth', ensureAuthenticated, async (req: any, res) => {
    try {
      const authUrl = await googleSheetsService.getAuthUrl(req.user.id, req.user.companyId);

      if (!authUrl) {
        return res.status(400).json({
          error: 'Google Sheets integration not configured by platform administrator. Please contact support.'
        });
      }

      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google Sheets auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/google/sheets/callback', async (req, res) => {
    await googleSheetsService.handleAuthCallback(req, res);
  });

  const chatPdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  app.get('/api/chat-pdf/documents', ensureAuthenticated, async (req: any, res) => {
    try {
      const apiKey = req.headers['x-chat-pdf-api-key'];

      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      const response = await fetch('https://pdf.ai/api/v1/documents', {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey
        }
      });

      if (response.ok) {
        const data = await response.json();
        res.json(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        res.status(response.status).json(errorData);
      }
    } catch (error) {
      console.error('Error proxying Chat PDF documents request:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  app.post('/api/chat-pdf/upload', ensureAuthenticated, chatPdfUpload.single('file'), async (req: any, res) => {
    try {
      const apiKey = req.headers['x-chat-pdf-api-key'];

      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const formData = new FormData();

      const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append('file', fileBlob, req.file.originalname);

      if (req.body.isPrivate !== undefined) {
        formData.append('isPrivate', req.body.isPrivate);
      }
      if (req.body.ocr !== undefined) {
        formData.append('ocr', req.body.ocr);
      }

      const response = await fetch('https://pdf.ai/api/v1/upload/file', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        res.json(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        res.status(response.status).json(errorData);
      }
    } catch (error) {
      console.error('Error proxying Chat PDF upload request:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  app.delete('/api/chat-pdf/documents/:docId', ensureAuthenticated, async (req: any, res) => {
    try {
      const apiKey = req.headers['x-chat-pdf-api-key'];
      const docId = req.params.docId;

      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }

      if (!docId) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      const response = await fetch('https://pdf.ai/api/v1/delete', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          docId: docId
        })
      });

      if (response.ok) {
        const data = await response.json();
        res.json(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        res.status(response.status).json(errorData);
      }
    } catch (error) {
      console.error('Error proxying Chat PDF delete request:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  app.get('/api/google/sheets/status', ensureAuthenticated, async (req: any, res) => {
    try {
      const status = await googleSheetsService.checkUserAuthentication(req.user.id, req.user.companyId);
      res.json(status);
    } catch (error) {
      console.error('Error checking Google Sheets status:', error);
      res.status(500).json({
        connected: false,
        message: 'Error checking connection status'
      });
    }
  });

  app.delete('/api/google/sheets', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteGoogleTokens(req.user.id, req.user.companyId);
      res.json({
        success: true,
        message: 'Google Sheets disconnected successfully'
      });
    } catch (error) {
      console.error('Error disconnecting Google Sheets:', error);
      res.status(500).json({
        success: false,
        message: 'Error disconnecting Google Sheets'
      });
    }
  });


  app.get('/api/google/sheets/list', ensureAuthenticated, async (req: any, res) => {
    try {
      const sheets = await googleSheetsService.listUserSheets(req.user.id, req.user.companyId);
      res.json(sheets);
    } catch (error) {
      console.error('Error fetching Google Sheets:', error);
      res.status(500).json({
        success: false,
        error: 'Error fetching Google Sheets'
      });
    }
  });


  app.post('/api/google/sheets/sheet-names', ensureAuthenticated, async (req: any, res) => {
    try {
      const { spreadsheetId } = req.body;

      if (!spreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Spreadsheet ID is required'
        });
      }

      const result = await googleSheetsService.getSheetNames(req.user.id, req.user.companyId, spreadsheetId);
      res.json(result);
    } catch (error) {
      console.error('Error fetching sheet names:', error);
      res.status(500).json({
        success: false,
        error: 'Error fetching sheet names'
      });
    }
  });

  app.get('/api/google/credentials', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
    try {

      const adminOAuthConfig = await storage.getAppSetting('google_calendar_oauth');

      if (adminOAuthConfig && (adminOAuthConfig.value as any)?.enabled) {
        return res.json({
          configured: true,
          clientId: 'Configured by platform administrator',
          clientSecret: '••••••••••••••••',
          redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/google/calendar/callback`
        });
      }


      const credentials = await storage.getGoogleCalendarCredentials(req.user.companyId);

      if (!credentials) {
        return res.json({
          configured: false,
          clientId: '',
          clientSecret: '',
          redirectUri: ''
        });
      }

      return res.json({
        configured: true,
        clientId: credentials.clientId || '',
        clientSecret: credentials.clientSecret ? '••••••••••••••••' : '',
        redirectUri: credentials.redirectUri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/google/calendar/callback`
      });
    } catch (error) {
      console.error('Error getting Google Calendar credentials:', error);
      return res.status(500).json({
        success: false,
        message: 'Error getting Google Calendar credentials'
      });
    }
  });

  app.post('/api/google/credentials', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
    try {

      const adminOAuthConfig = await storage.getAppSetting('google_calendar_oauth');

      if (adminOAuthConfig && (adminOAuthConfig.value as any)?.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Google Calendar is now configured at the platform level. Individual company credentials are no longer supported. Contact your platform administrator for configuration changes.'
        });
      }


      const { clientId, clientSecret, redirectUri } = req.body;

      if (!clientId || !clientSecret) {
        return res.status(400).json({
          success: false,
          message: 'Client ID and Client Secret are required'
        });
      }

      const credentials = {
        clientId,
        clientSecret,
        redirectUri: redirectUri || `${process.env.BASE_URL || 'http://localhost:5000'}/api/google/callback`
      };

      const success = await storage.saveGoogleCalendarCredentials(req.user.companyId, credentials);

      if (!success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to save Google Calendar credentials'
        });
      }

      await storage.deleteGoogleTokens(req.user.id, req.user.companyId);

      return res.json({
        success: true,
        message: 'Google Calendar credentials updated successfully'
      });
    } catch (error) {
      console.error('Error updating Google Calendar credentials:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating Google Calendar credentials'
      });
    }
  });

  app.get('/api/google/calendar/status', ensureAuthenticated, async (req: any, res) => {
    try {
      const status = await googleCalendarService.checkCalendarConnectionStatus(req.user.id, req.user.companyId);
      return res.json(status);
    } catch (error) {
      console.error('Error checking Google Calendar status:', error);
      return res.status(500).json({
        connected: false,
        message: 'Error checking Google Calendar status'
      });
    }
  });

  app.delete('/api/google/calendar', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteGoogleTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error unlinking Google Calendar:', error);
      return res.status(500).json({ error: 'Error unlinking Google Calendar' });
    }
  });

  app.post('/api/google/calendar/disconnect', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteGoogleTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      return res.status(500).json({ error: 'Error disconnecting Google Calendar' });
    }
  });

  app.post('/api/google/calendar/events', ensureAuthenticated, async (req: any, res) => {
    try {

      const { summary, description, location, startDateTime, endDateTime, attendees, colorId } = req.body;

      if (!summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const eventData = {
        summary,
        description: description || '',
        location: location || '',
        start: {
          dateTime: startDateTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'UTC'
        },
        attendees: attendees || [],
        colorId: colorId || undefined
      };

      const result = await googleCalendarService.createCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventData
      );

      if (!result.success) {
        console.error('Google Calendar API: Create event failed:', result.error);
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return res.status(500).json({ error: 'Error creating calendar event' });
    }
  });

  app.get('/api/google/calendar/events', ensureAuthenticated, async (req: any, res) => {
    try {
      const timeMin = req.query.timeMin as string;
      const timeMax = req.query.timeMax as string;
      const maxResults = parseInt(req.query.maxResults as string) || 10;

      if (!timeMin || !timeMax) {
        return res.status(400).json({ error: 'timeMin and timeMax are required' });
      }

      const result = await googleCalendarService.listCalendarEvents(
        req.user.id,
        req.user.companyId,
        timeMin,
        timeMax,
        maxResults
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error listing calendar events:', error);
      return res.status(500).json({ error: 'Error listing calendar events' });
    }
  });

  app.patch('/api/google/calendar/events/:eventId', ensureAuthenticated, async (req: any, res) => {
    try {
      const eventId = req.params.eventId;
      const { summary, description, location, startDateTime, endDateTime, attendees, colorId } = req.body;

      if (!eventId || !summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const eventData = {
        summary,
        description: description || '',
        location: location || '',
        start: {
          dateTime: startDateTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'UTC'
        },
        attendees: Array.isArray(attendees) ? attendees : [],
        colorId: colorId || undefined
      };

      const result = await googleCalendarService.updateCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventId,
        eventData
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error updating calendar event:', error);
      return res.status(500).json({ error: 'Error updating calendar event' });
    }
  });

  app.delete('/api/google/calendar/events/:eventId', ensureAuthenticated, async (req: any, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId) {
        return res.status(400).json({ error: 'Event ID is required' });
      }

      const result = await googleCalendarService.deleteCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      return res.status(500).json({ error: 'Error deleting calendar event' });
    }
  });

  app.get('/api/google/calendar/availability', ensureAuthenticated, async (req: any, res) => {
    try {

      const date = req.query.date as string;
      const durationMinutes = parseInt(req.query.duration as string) || 30;

      if (!date) {
        return res.status(400).json({ error: 'Date is required (YYYY-MM-DD format)' });
      }

      const result = await googleCalendarService.getAvailableTimeSlots(
        req.user.id,
        req.user.companyId,
        date,
        durationMinutes
      );

      if (!result.success) {
        console.error('Google Calendar API: Availability check failed:', result.error);
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error getting available time slots:', error);
      return res.status(500).json({ error: 'Error getting available time slots' });
    }
  });


  app.get('/api/zoho/auth', ensureAuthenticated, async (req: any, res) => {
    try {
      const authUrl = await zohoCalendarService.getAuthUrl(req.user.id, req.user.companyId);

      if (!authUrl) {
        return res.status(400).json({
          error: 'Zoho Calendar integration not configured by platform administrator. Please contact support.'
        });
      }

      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Zoho auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/zoho/calendar/callback', async (req, res) => {
    await zohoCalendarService.handleAuthCallback(req, res);
  });

  app.get('/api/zoho/calendar/status', ensureAuthenticated, async (req: any, res) => {
    try {
      const status = await zohoCalendarService.checkCalendarConnectionStatus(req.user.id, req.user.companyId);
      return res.json(status);
    } catch (error) {
      console.error('Error checking Zoho Calendar status:', error);
      return res.status(500).json({
        connected: false,
        message: 'Error checking Zoho Calendar status'
      });
    }
  });

  app.delete('/api/zoho/calendar', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteZohoTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error unlinking Zoho Calendar:', error);
      return res.status(500).json({ error: 'Error unlinking Zoho Calendar' });
    }
  });

  app.post('/api/zoho/calendar/disconnect', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteZohoTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Zoho Calendar:', error);
      return res.status(500).json({ error: 'Error disconnecting Zoho Calendar' });
    }
  });

  app.post('/api/zoho/calendar/events', ensureAuthenticated, async (req: any, res) => {
    try {

      const { summary, description, location, startDateTime, endDateTime, attendees, colorId } = req.body;

      if (!summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const eventData = {
        summary,
        description: description || '',
        location: location || '',
        start: {
          dateTime: startDateTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'UTC'
        },
        attendees: attendees || [],
        colorId: colorId || undefined
      };

      const result = await zohoCalendarService.createCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventData
      );

      if (!result.success) {
        console.error('Zoho Calendar API: Create event failed:', result.error);
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error creating Zoho calendar event:', error);
      return res.status(500).json({ error: 'Error creating calendar event' });
    }
  });

  app.get('/api/zoho/calendar/events', ensureAuthenticated, async (req: any, res) => {
    try {
      const timeMin = req.query.timeMin as string;
      const timeMax = req.query.timeMax as string;
      const maxResults = parseInt(req.query.maxResults as string) || 10;

      if (!timeMin || !timeMax) {
        return res.status(400).json({ error: 'timeMin and timeMax are required' });
      }

      const result = await zohoCalendarService.listCalendarEvents(
        req.user.id,
        req.user.companyId,
        timeMin,
        timeMax,
        maxResults
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error listing Zoho calendar events:', error);
      return res.status(500).json({ error: 'Error listing calendar events' });
    }
  });

  app.patch('/api/zoho/calendar/events/:eventId', ensureAuthenticated, async (req: any, res) => {
    try {
      const eventId = req.params.eventId;
      const { summary, description, location, startDateTime, endDateTime, attendees, colorId } = req.body;

      if (!eventId || !summary || !startDateTime || !endDateTime) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const eventData = {
        summary,
        description: description || '',
        location: location || '',
        start: {
          dateTime: startDateTime,
          timeZone: 'UTC'
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'UTC'
        },
        attendees: Array.isArray(attendees) ? attendees : [],
        colorId: colorId || undefined
      };

      const result = await zohoCalendarService.updateCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventId,
        eventData
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error updating Zoho calendar event:', error);
      return res.status(500).json({ error: 'Error updating calendar event' });
    }
  });

  app.delete('/api/zoho/calendar/events/:eventId', ensureAuthenticated, async (req: any, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId) {
        return res.status(400).json({ error: 'Event ID is required' });
      }

      const result = await zohoCalendarService.deleteCalendarEvent(
        req.user.id,
        req.user.companyId,
        eventId
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error deleting Zoho calendar event:', error);
      return res.status(500).json({ error: 'Error deleting calendar event' });
    }
  });

  app.get('/api/zoho/calendar/availability', ensureAuthenticated, async (req: any, res) => {
    try {

      const date = req.query.date as string;
      const durationMinutes = parseInt(req.query.duration as string) || 30;

      if (!date) {
        return res.status(400).json({ error: 'Date is required (YYYY-MM-DD format)' });
      }

      const result = await zohoCalendarService.getAvailableTimeSlots(
        req.user.id,
        req.user.companyId,
        date,
        durationMinutes
      );

      if (!result.success) {
        console.error('Zoho Calendar API: Availability check failed:', result.error);
        return res.status(400).json({ error: result.error });
      }

      return res.json(result);
    } catch (error) {
      console.error('Error getting Zoho calendar availability:', error);
      return res.status(500).json({ error: 'Error getting available time slots' });
    }
  });


  app.get('/api/calendly/auth', ensureAuthenticated, async (req: any, res) => {
    try {
      const authUrl = await calendlyCalendarService.getAuthUrl(req.user.id, req.user.companyId);

      if (!authUrl) {
        return res.status(400).json({
          error: 'Calendly integration not configured by platform administrator. Please contact support.'
        });
      }

      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/calendly/callback', async (req, res) => {
    await calendlyCalendarService.handleAuthCallback(req, res);
  });

  app.get('/api/calendly/status', ensureAuthenticated, async (req: any, res) => {
    try {
      const isAuthenticated = await calendlyCalendarService.isAuthenticated(req.user.id, req.user.companyId);
      const user = isAuthenticated ? await calendlyCalendarService.getCurrentUser(req.user.id, req.user.companyId) : null;

      const status = {
        connected: isAuthenticated,
        user: user ? {
          name: user.name,
          email: user.email,
          scheduling_url: user.scheduling_url,
          timezone: user.timezone
        } : null,
        message: isAuthenticated ? 'Connected to Calendly' : 'Not connected to Calendly'
      };

      return res.json(status);
    } catch (error) {
      console.error('Error checking Calendly status:', error);
      return res.status(500).json({
        connected: false,
        message: 'Error checking Calendly status'
      });
    }
  });

  app.delete('/api/calendly', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteCalendlyTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error unlinking Calendly:', error);
      return res.status(500).json({ error: 'Error unlinking Calendly' });
    }
  });

  app.post('/api/calendly/disconnect', ensureAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteCalendlyTokens(req.user.id, req.user.companyId);
      return res.json({ success: true });
    } catch (error) {
      console.error('Error disconnecting Calendly:', error);
      return res.status(500).json({ error: 'Error disconnecting Calendly' });
    }
  });

  app.get('/api/calendly/events', ensureAuthenticated, async (req: any, res) => {
    try {
      const minStartTime = req.query.timeMin as string;
      const maxStartTime = req.query.timeMax as string;
      const count = parseInt(req.query.maxResults as string) || 50;

      if (!minStartTime || !maxStartTime) {
        return res.status(400).json({ error: 'timeMin and timeMax are required' });
      }

      const result = await calendlyCalendarService.getScheduledEvents(
        req.user.id,
        req.user.companyId,
        {
          count,
          min_start_time: minStartTime,
          max_start_time: maxStartTime,
          sort: 'start_time:asc'
        }
      );

      if (!result) {
        return res.status(400).json({ error: 'Failed to fetch Calendly events' });
      }

      const transformedEvents = result.collection.map(event => ({
        id: event.uri.split('/').pop(),
        summary: event.name,
        description: '',
        location: event.location?.location || event.location?.join_url || '',
        start: {
          dateTime: event.start_time
        },
        end: {
          dateTime: event.end_time
        },
        attendees: [],
        provider: 'calendly',
        status: event.status,
        originalEvent: event
      }));

      return res.json({
        success: true,
        events: transformedEvents,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error listing Calendly events:', error);
      return res.status(500).json({ error: 'Error listing Calendly events' });
    }
  });

  app.delete('/api/calendly/events/:eventId', ensureAuthenticated, async (req: any, res) => {
    try {
      const eventId = req.params.eventId;

      if (!eventId) {
        return res.status(400).json({ error: 'Event ID is required' });
      }

      const eventUri = `https://api.calendly.com/scheduled_events/${eventId}`;

      const result = await calendlyCalendarService.cancelScheduledEvent(
        req.user.id,
        req.user.companyId,
        eventUri,
        'Event cancelled by user'
      );

      if (!result) {
        return res.status(400).json({ error: 'Failed to cancel Calendly event' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Error canceling Calendly event:', error);
      return res.status(500).json({ error: 'Error canceling Calendly event' });
    }
  });

  app.post('/api/n8n/test-connection', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const {
        instanceUrl,
        apiKey,
        webhookUrl,
        chatWebhookUrl,
        operation,
        workflowName,
        enableMediaSupport,
        supportedMediaTypes,
        includeFileMetadata
      } = req.body;

      if (!instanceUrl) {
        return res.status(400).json({
          success: false,
          error: 'Instance URL is required'
        });
      }

      try {
        new URL(instanceUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
      }



      let testUrl = '';
      let testData = {};
      let method = 'POST';

      if (chatWebhookUrl && chatWebhookUrl.trim()) {
        testUrl = chatWebhookUrl.trim();


        const baseTestData: any = {
          chatInput: 'Test message from App',
          sessionId: 'test-session-App',
          messageType: 'text',
          isMediaMessage: false,

          message: {
            content: 'Test message from App',
            type: 'text',
            timestamp: new Date().toISOString()
          },

          contact: {
            id: 'test-contact-123',
            name: 'Test User',
            phone: '+1234567890',
            email: 'test@example.com'
          },

          conversation: {
            id: 'test-conversation-456',
            channelType: 'whatsapp'
          }
        };


        if (enableMediaSupport) {
          baseTestData.mediaSupport = {
            enabled: true,
            supportedTypes: supportedMediaTypes || ['image', 'video', 'audio', 'document'],
            includeMetadata: includeFileMetadata !== false
          };


          baseTestData.sampleMediaMessage = {
            messageType: 'image',
            isMediaMessage: true,
            message: {
              content: 'Test image with caption',
              type: 'image',
              timestamp: new Date().toISOString()
            },
            media: {
              url: 'https://via.placeholder.com/300x200.png?text=Test+Image',
              type: 'image',
              metadata: includeFileMetadata ? {
                filename: 'test-image.png',
                mimeType: 'image/png',
                fileSize: 12345,
                originalName: 'test-image.png'
              } : undefined
            }
          };
        }

        testData = baseTestData;

        method = 'POST';


      }
      else if (operation === 'webhook_trigger' && webhookUrl) {
        testUrl = webhookUrl;
        testData = {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'app_Test',
          message: 'Test execution from app'
        };
        method = 'POST';
      } else if (workflowName && apiKey) {
        const cleanWorkflowName = workflowName.replace(/^#/, '');



        let executionError = null;
        let executionSuccess = false;
        let executionResult = null;

        testData = {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'App_Test',
          message: 'Test execution from App'
        };



        const directEndpoints = [
          `/api/v1/workflows/${encodeURIComponent(cleanWorkflowName)}/run`,
          `/api/v1/workflows/${encodeURIComponent(cleanWorkflowName)}/execute`,
          `/api/v1/workflows/${encodeURIComponent(cleanWorkflowName)}/activate`,
          `/webhook/${encodeURIComponent(cleanWorkflowName)}`
        ];

        let firstError: any = null;

        for (const endpoint of directEndpoints) {
          try {
            testUrl = `${instanceUrl}${endpoint}`;

            const response = await axios({
              method: 'POST',
              url: testUrl,
              data: testData,
              headers: {
                'X-N8N-API-KEY': apiKey,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });

            executionSuccess = true;
            executionResult = response.data;
            break;
          } catch (endpointError: any) {
            if (!firstError) firstError = endpointError;
          }
        }

        if (!executionSuccess) {
          executionError = firstError;

          if (firstError.response?.status === 404) {

            try {
              const listResponse = await axios.get(`${instanceUrl}/api/v1/workflows`, {
                headers: {
                  'X-N8N-API-KEY': apiKey,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              });

              const workflows = listResponse.data?.data || [];

              const matchingWorkflow = workflows.find((w: any) =>
                w.id === cleanWorkflowName ||
                w.name === cleanWorkflowName ||
                w.id?.toString() === cleanWorkflowName
              );

              if (matchingWorkflow) {


                const endpoints = [
                  `/api/v1/workflows/${matchingWorkflow.id}/run`,
                  `/api/v1/workflows/${matchingWorkflow.id}/execute`,
                  `/api/v1/workflows/${matchingWorkflow.id}/activate`,
                  `/webhook/${matchingWorkflow.id}`
                ];

                for (const endpoint of endpoints) {
                  try {
                    const retryUrl = `${instanceUrl}${endpoint}`;
                    const retryResponse = await axios({
                      method: 'POST',
                      url: retryUrl,
                      data: testData,
                      headers: {
                        'X-N8N-API-KEY': apiKey,
                        'Content-Type': 'application/json'
                      },
                      timeout: 30000
                    });

                    executionSuccess = true;
                    executionResult = retryResponse.data;
                    break;
                  } catch (endpointError: any) {
                  }
                }

              }

            } catch (listError: any) {
            }
          }
        }

        if (executionSuccess) {
          return res.json({
            success: true,
            data: executionResult,
            message: 'Workflow executed successfully'
          });
        } else {
          throw executionError;
        }
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either webhook URL or (workflow name + API key) is required to execute the workflow'
        });
      }

      if (webhookUrl) {
        const headers: any = {
          'Content-Type': 'application/json'
        };

        const response = await axios({
          method,
          url: testUrl,
          headers,
          data: testData,
          timeout: 30000
        });

        let successMessage = 'Workflow executed successfully via webhook';
        let executionData = response.data;

        return res.json({
          success: true,
          message: successMessage,
          data: executionData,
          status: response.status,
          executedAt: new Date().toISOString()
        });
      }

    } catch (error: any) {
      console.error('Error executing n8n workflow:', error);

      let errorMessage = 'Workflow execution failed';

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data;

        if (status === 404) {
          if (req.body.workflowName && req.body.apiKey) {
            errorMessage = `Workflow not found: "${req.body.workflowName}" does not exist or is not accessible.`;
          } else {
            errorMessage = 'Webhook URL not found. Please check the webhook URL.';
          }
        } else if (status === 401) {
          errorMessage = 'Authentication failed. Please provide a valid API key.';
        } else if (status === 403) {
          errorMessage = 'Access forbidden. Please check your API key permissions for workflow execution.';
        } else if (status === 400) {
          errorMessage = `Bad request: ${responseData?.message || 'Invalid workflow configuration'}`;
        } else if (status === 500) {
          errorMessage = `Workflow execution error: ${responseData?.message || 'Internal server error in n8n'}`;
        } else {
          errorMessage = `Execution failed: ${status} ${error.response.statusText}`;
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused: n8n instance is not accessible. Please check if the instance is running.';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Host not found: Please check the instance URL format.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Execution timeout: Workflow is taking too long to execute or n8n is not responding.';
      } else if (error.message) {
        errorMessage = `Execution failed: ${error.message}`;
      }

      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  });

  app.post('/api/n8n/list-workflows', async (req, res) => {
    try {
      const { instanceUrl, apiKey } = req.body;

      if (!instanceUrl || !apiKey) {
        return res.status(400).json({
          success: false,
          error: 'Instance URL and API key are required'
        });
      }

      try {
        new URL(instanceUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
      }



      const listUrl = `${instanceUrl}/api/v1/workflows`;

      const response = await axios.get(listUrl, {
        headers: {
          'X-N8N-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });


      return res.json({
        success: true,
        workflows: response.data?.data || [],
        message: `Found ${response.data?.data?.length || 0} workflows`
      });

    } catch (error: any) {
      console.error('N8n list workflows error:', error);
      return res.status(500).json({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to list workflows'
      });
    }
  });

  app.post('/api/make/test-connection', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const {
        apiToken,
        teamId,
        organizationId,
        webhookUrl,
        scenarioId,
        scenarioName,
        operation,
        enableMediaSupport,
        supportedMediaTypes,
        includeFileMetadata,
        region = 'us1'
      } = req.body;

      if (!apiToken) {
        return res.status(400).json({
          success: false,
          error: 'API token is required'
        });
      }

      const validRegions = ['eu1', 'eu2', 'us1', 'us2'];
      const makeRegion = validRegions.includes(region) ? region : 'us1';
      const baseUrl = `https://${makeRegion}.make.com/api/v2`;

      let testUrl = '';
      let testData = {};
      let method = 'POST';
      let headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiToken}`
      };

      if (webhookUrl && webhookUrl.trim()) {
        testUrl = webhookUrl.trim();

        const baseTestData: any = {
          chatInput: 'Test message from App',
          sessionId: 'test-session-App',
          messageType: 'text',
          isMediaMessage: false,
          message: {
            content: 'Test message from App',
            type: 'text',
            timestamp: new Date().toISOString()
          },
          contact: {
            id: 'test-contact-123',
            name: 'Test User',
            phone: '+1234567890',
            email: 'test@example.com'
          },
          conversation: {
            id: 'test-conversation-456',
            channelType: 'whatsapp'
          }
        };

        if (enableMediaSupport) {
          baseTestData.mediaSupport = {
            enabled: true,
            supportedTypes: supportedMediaTypes || ['image', 'video', 'audio', 'document'],
            includeMetadata: includeFileMetadata !== false
          };

          baseTestData.sampleMediaMessage = {
            messageType: 'image',
            isMediaMessage: true,
            message: {
              content: 'Test image with caption',
              type: 'image',
              timestamp: new Date().toISOString()
            },
            media: {
              url: 'https://via.placeholder.com/300x200.png?text=Test+Image',
              type: 'image',
              metadata: includeFileMetadata ? {
                filename: 'test-image.png',
                mimeType: 'image/png',
                fileSize: 12345,
                originalName: 'test-image.png'
              } : undefined
            }
          };
        }

        testData = baseTestData;
        headers = { 'Content-Type': 'application/json' };
      }
      else if (scenarioId || scenarioName) {
        const targetScenarioId = scenarioId || scenarioName;
        testUrl = `${baseUrl}/scenarios/${targetScenarioId}/run`;

        testData = {
          test: true,
          timestamp: new Date().toISOString(),
          source: 'App_Test',
          message: 'Test execution from App'
        };
      }
      else {
        testUrl = `${baseUrl}/scenarios`;
        method = 'GET';
        testData = {};

        const params = new URLSearchParams();
        if (teamId) params.append('teamId', teamId);
        if (organizationId) params.append('organizationId', organizationId);
        if (params.toString()) {
          testUrl += `?${params.toString()}`;
        }
      }

      const response = await axios({
        method,
        url: testUrl,
        headers,
        data: method === 'GET' ? undefined : testData,
        timeout: 30000
      });

      let successMessage = 'Connection successful';
      let executionData = response.data;

      if (webhookUrl) {
        successMessage = 'Webhook executed successfully';
      } else if (scenarioId || scenarioName) {
        successMessage = 'Scenario executed successfully';
      } else {
        successMessage = 'API connection verified';
      }

      return res.json({
        success: true,
        message: successMessage,
        data: executionData,
        status: response.status,
        executedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error testing Make.com connection:', error);

      let errorMessage = 'Connection test failed';

      if (error.response) {
        const status = error.response.status;
        const responseData = error.response.data;

        if (status === 404) {
          if (req.body.scenarioId || req.body.scenarioName) {
            errorMessage = `Scenario not found: "${req.body.scenarioName || req.body.scenarioId}" does not exist or is not accessible.`;
          } else {
            errorMessage = 'Webhook URL not found. Please check the webhook URL.';
          }
        } else if (status === 401) {
          errorMessage = 'Authentication failed - Invalid or expired API token. Please verify your Make.com API token is correct and has not expired.';
        } else if (status === 403) {
          errorMessage = 'Access forbidden - Insufficient permissions. Your API token does not have the required permissions for this operation.';
        } else if (status === 400) {
          errorMessage = `Bad request: ${responseData?.message || 'Invalid configuration'}`;
        } else if (status === 500) {
          errorMessage = `Execution error: ${responseData?.message || 'Internal server error in Make.com'}`;
        } else {
          errorMessage = `Connection failed: ${status} ${error.response.statusText}`;
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused: Make.com API is not accessible.';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Host not found: Please check the API endpoint or webhook URL.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout: Make.com is not responding.';
      } else if (error.message) {
        errorMessage = `Connection failed: ${error.message}`;
      }

      return res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  });

  app.post('/api/make/list-scenarios', async (req, res) => {
    try {
      const { apiToken, teamId, organizationId, region = 'us1' } = req.body;

      if (!apiToken) {
        return res.status(400).json({
          success: false,
          error: 'API token is required'
        });
      }

      const validRegions = ['eu1', 'eu2', 'us1', 'us2'];
      const makeRegion = validRegions.includes(region) ? region : 'us1';
      const listUrl = `https://${makeRegion}.make.com/api/v2/scenarios`;
      const params = new URLSearchParams();

      if (teamId) params.append('teamId', teamId);
      if (organizationId) params.append('organizationId', organizationId);

      const finalUrl = params.toString() ? `${listUrl}?${params.toString()}` : listUrl;

      const response = await axios.get(finalUrl, {
        headers: {
          'Authorization': `Token ${apiToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return res.json({
        success: true,
        scenarios: response.data?.scenarios || response.data || [],
        message: `Found ${(response.data?.scenarios || response.data || []).length} scenarios`
      });

    } catch (error: any) {
      console.error('Make.com list scenarios error:', error);
      return res.status(500).json({
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to list scenarios'
      });
    }
  });

  app.post('/api/google/sheets/test-connection', ensureAuthenticated, async (req: any, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName, useOAuth } = req.body;


      if (useOAuth || !serviceAccountJson) {

        try {
          const result = await googleSheetsService.testConnectionWithOAuth(
            req.user.id,
            req.user.companyId,
            spreadsheetId,
            sheetName || 'Sheet1'
          );
          return res.json(result);
        } catch (oauthError) {
          if (!serviceAccountJson) {
            return res.status(400).json({
              success: false,
              error: 'Please connect your Google Sheets account using OAuth authentication above'
            });
          }

        }
      }


      if (!serviceAccountJson || !spreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON and Spreadsheet ID are required for legacy authentication'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const result = await googleSheetsService.testConnection(config);
      return res.json(result);
    } catch (error) {
      console.error('Error testing Google Sheets connection:', error);
      return res.status(500).json({
        success: false,
        error: 'Error testing Google Sheets connection'
      });
    }
  });

  app.post('/api/google/sheets/add-test-data', ensureAuthenticated, async (req: any, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName, useOAuth } = req.body;


      if (useOAuth || !serviceAccountJson) {
        try {
          const result = await googleSheetsService.addTestDataWithOAuth(
            req.user.id,
            req.user.companyId,
            spreadsheetId,
            sheetName || 'Sheet1'
          );
          return res.json(result);
        } catch (oauthError) {
          if (!serviceAccountJson) {
            return res.status(400).json({
              success: false,
              error: 'Please connect your Google Sheets account using OAuth authentication'
            });
          }

        }
      }


      if (!serviceAccountJson || !spreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON and Spreadsheet ID are required'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const result = await googleSheetsService.addTestData(config);
      return res.json(result);
    } catch (error) {
      console.error('Error adding test data to Google Sheets:', error);
      return res.status(500).json({
        success: false,
        error: 'Error adding test data to Google Sheets'
      });
    }
  });

  app.post('/api/google/sheets/get-info', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName } = req.body;

      if (!serviceAccountJson || !spreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON and Spreadsheet ID are required'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const result = await googleSheetsService.getSheetInfo(config);
      return res.json(result);
    } catch (error) {
      console.error('Error getting Google Sheets info:', error);
      return res.status(500).json({
        success: false,
        error: 'Error getting Google Sheets info'
      });
    }
  });

  app.post('/api/google/sheets/append-row', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName, columnMappings } = req.body;

      if (!serviceAccountJson || !spreadsheetId || !columnMappings) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON, Spreadsheet ID, and Column Mappings are required'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const result = await googleSheetsService.appendRow(config, { columnMappings });
      return res.json(result);
    } catch (error) {
      console.error('Error appending row to Google Sheets:', error);
      return res.status(500).json({
        success: false,
        error: 'Error appending row to Google Sheets'
      });
    }
  });

  app.post('/api/google/sheets/read-rows', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName, filterColumn, filterValue, startRow, maxRows } = req.body;

      if (!serviceAccountJson || !spreadsheetId) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON and Spreadsheet ID are required'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const options: any = {};
      if (filterColumn) options.filterColumn = filterColumn;
      if (filterValue !== undefined) options.filterValue = filterValue;
      if (startRow) options.startRow = parseInt(startRow);
      if (maxRows) options.maxRows = parseInt(maxRows);

      const result = await googleSheetsService.readRows(config, options);
      return res.json(result);
    } catch (error) {
      console.error('Error reading rows from Google Sheets:', error);
      return res.status(500).json({
        success: false,
        error: 'Error reading rows from Google Sheets'
      });
    }
  });

  app.post('/api/google/sheets/update-row', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { serviceAccountJson, spreadsheetId, sheetName, matchColumn, matchValue, columnMappings } = req.body;

      if (!serviceAccountJson || !spreadsheetId || !matchColumn || matchValue === undefined || !columnMappings) {
        return res.status(400).json({
          success: false,
          error: 'Service Account JSON, Spreadsheet ID, Match Column, Match Value, and Column Mappings are required'
        });
      }

      const config = {
        serviceAccountJson,
        spreadsheetId,
        sheetName: sheetName || 'Sheet1'
      };

      const result = await googleSheetsService.updateRow(config, {
        matchColumn,
        matchValue,
        columnMappings
      });
      return res.json(result);
    } catch (error) {
      console.error('Error updating row in Google Sheets:', error);
      return res.status(500).json({
        success: false,
        error: 'Error updating row in Google Sheets'
      });
    }
  });


  function ensureAdmin(req: any, res: any, next: any) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access required' });
    }
    next();
  }

  app.get('/api/team/members', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;

      let teamMembers;
      if (user.isSuperAdmin) {
        teamMembers = await storage.getAllTeamMembers();
      } else {
        teamMembers = await storage.getTeamMembersByCompany(user.companyId);
      }

      const safeTeamMembers = teamMembers.map(member => {
        const { password, ...safeUser } = member;
        return safeUser;
      });

      res.json(safeTeamMembers);
    } catch (error) {
      console.error('Error getting team members:', error);
      res.status(500).json({ message: 'Failed to retrieve team members' });
    }
  });

  app.post('/api/team/members', ensureAdmin, async (req: any, res) => {
    try {
      const teamMemberSchema = z.object({
        fullName: z.string().min(1, 'Full name is required'),
        username: z.string().min(3, 'Username must be at least 3 characters'),
        email: z.string().email('Valid email is required'),
        password: z.string().min(6, 'Password must be at least 6 characters'),
        role: z.string().refine(role => role === 'admin' || role === 'agent', {
          message: "Role must be either 'admin' or 'agent'"
        })
      });

      const validationResult = teamMemberSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid team member data',
          errors: validationResult.error.errors
        });
      }

      const { fullName, username, email, password, role } = validationResult.data;

      const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ message: 'A user with this username already exists' });
      }

      const existingEmailUser = await storage.getUserByEmail(email);
      if (existingEmailUser) {
        return res.status(400).json({ message: 'A user with this email already exists' });
      }

      const hashedPassword = await hashPassword(password);

      const newUser = await storage.createUser({
        username,
        email,
        fullName,
        password: hashedPassword,
        role,
        companyId: req.user.companyId
      });

      const { password: _, ...safeUser } = newUser;

      res.status(201).json(safeUser);
    } catch (error) {
      console.error('Error creating team member:', error);
      res.status(500).json({ message: 'Failed to create team member' });
    }
  });

  app.patch('/api/team/members/:id', ensureAdmin, async (req: any, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const updateSchema = z.object({
        fullName: z.string().min(1, 'Full name is required').optional(),
        email: z.string().email('Valid email is required').optional(),
        password: z.string().min(6, 'Password must be at least 6 characters').optional(),
        role: z.string().refine(role => role === 'admin' || role === 'agent', {
          message: "Role must be either 'admin' or 'agent'"
        }).optional()
      });

      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid update data',
          errors: validationResult.error.errors
        });
      }

      const updateData = validationResult.data;

      const existingMember = await storage.getUser(memberId);
      if (!existingMember) {
        return res.status(404).json({ message: 'Team member not found' });
      }

      if (!req.user.isSuperAdmin && existingMember.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const userUpdateData: any = {
        fullName: updateData.fullName,
        email: updateData.email,
        role: updateData.role
      };

      if (updateData.password) {
        userUpdateData.password = await hashPassword(updateData.password);
      }

      const updatedUser = await storage.updateUser(memberId, userUpdateData);

      const { password: _, ...safeUser } = updatedUser;

      res.json(safeUser);
    } catch (error) {
      console.error('Error updating team member:', error);
      res.status(500).json({ message: 'Failed to update team member' });
    }
  });

  app.delete('/api/team/members/:id', ensureAdmin, async (req: any, res) => {
    try {
      const memberId = parseInt(req.params.id);
      const user = req.user;

      if (isNaN(memberId)) {
        return res.status(400).json({ message: 'Invalid member ID' });
      }

      const existingMember = await storage.getUser(memberId);
      if (!existingMember) {
        return res.status(404).json({ message: 'Team member not found' });
      }

      if (existingMember.id === user.id) {
        return res.status(400).json({ message: 'You cannot delete your own account' });
      }

      if (!user.isSuperAdmin && existingMember.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied. You can only remove members from your own company.' });
      }

      const success = await storage.deleteUser(memberId);

      if (!success) {
        return res.status(500).json({ message: 'Failed to remove team member' });
      }

      res.json({ message: 'Team member removed successfully' });
    } catch (error) {
      console.error('Error deleting team member:', error);
      res.status(500).json({ message: 'Failed to remove team member' });
    }
  });

  app.get('/api/team/members/active', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;

      let activeMembers;
      if (user.isSuperAdmin) {
        activeMembers = await storage.getActiveTeamMembers();
      } else {
        activeMembers = await storage.getActiveTeamMembersByCompany(user.companyId);
      }

      const safeActiveMembers = activeMembers.map(member => {
        const { password, ...safeUser } = member;
        return safeUser;
      });

      res.json(safeActiveMembers);
    } catch (error) {
      console.error('Error getting active team members:', error);
      res.status(500).json({ message: 'Failed to retrieve active team members' });
    }
  });

  app.get('/api/team/invitations', ensureAdmin, async (req: any, res) => {
    try {
      const user = req.user as any;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const invitations = await storage.getTeamInvitations(companyId);
      res.json(invitations);
    } catch (error) {
      console.error('Error getting team invitations:', error);
      res.status(500).json({ message: 'Failed to retrieve team invitations' });
    }
  });

  app.post('/api/team/invitations', ensureAdmin, async (req: any, res) => {
    try {
      const invitationSchema = z.object({
        email: z.string().email(),
        role: z.string().refine(role => role === 'admin' || role === 'agent', {
          message: "Role must be either 'admin' or 'agent'"
        })
      });

      const validationResult = invitationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid invitation data',
          errors: validationResult.error.errors
        });
      }

      const { email, role } = validationResult.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: 'A user with this email already exists' });
      }

      const existingInvitation = await storage.getTeamInvitationByEmail(email);
      if (existingInvitation) {
        return res.status(400).json({ message: 'An invitation has already been sent to this email' });
      }

      const token = crypto.randomBytes(32).toString('hex');

      const newInvitation = await storage.createTeamInvitation({
        email,
        role,
        token,
        status: 'pending',
        invitedByUserId: req.user.id,
        companyId: req.user.companyId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const invitationUrl = `${process.env.APP_URL || 'http://localhost:9000'}/accept-invitation?token=${token}`;


      try {
        const senderName = req.user.fullName || req.user.username;
        const companyName = process.env.COMPANY_NAME || 'Your Company';

        await sendTeamInvitation(
          email,
          senderName,
          companyName,
          role,
          invitationUrl
        );


      } catch (emailError) {
        console.error('Error sending invitation email:', emailError);
      }

      res.status(201).json(newInvitation);
    } catch (error) {
      console.error('Error creating team invitation:', error);
      res.status(500).json({ message: 'Failed to create team invitation' });
    }
  });

  app.post('/api/team/invitations/:id/resend', ensureAdmin, async (req: any, res) => {
    try {
      const invitationId = parseInt(req.params.id);

      const user = req.user as any;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const invitations = await storage.getTeamInvitations(companyId);
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      const invitationUrl = `${process.env.APP_URL || 'http://localhost:9000'}/accept-invitation?token=${invitation.token}`;


      try {
        const senderName = req.user.fullName || req.user.username;
        const companyName = process.env.COMPANY_NAME || 'Your Company';

        await sendTeamInvitation(
          invitation.email,
          senderName,
          companyName,
          invitation.role,
          invitationUrl
        );


        res.json({ message: 'Invitation resent successfully' });
      } catch (emailError) {
        console.error('Error resending invitation email:', emailError);
        res.status(500).json({
          message: 'Failed to resend invitation email',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error resending team invitation:', error);
      res.status(500).json({ message: 'Failed to resend team invitation' });
    }
  });

  app.get('/api/team/invitations/verify', async (req: any, res) => {
    try {
      const token = req.query.token as string;

      if (!token) {
        return res.status(400).json({ message: 'Token is required' });
      }

      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found or has expired' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: `Invitation has already been ${invitation.status}` });
      }

      if (new Date() > new Date(invitation.expiresAt)) {
        return res.status(400).json({ message: 'Invitation has expired' });
      }

      const { token: _, ...safeInvitation } = invitation;
      res.json(safeInvitation);
    } catch (error) {
      console.error('Error verifying team invitation:', error);
      res.status(500).json({ message: 'Failed to verify team invitation' });
    }
  });

  app.post('/api/team/invitations/accept', async (req: any, res) => {
    try {
      const acceptSchema = z.object({
        token: z.string(),
        username: z.string().min(3),
        password: z.string().min(6),
        fullName: z.string().min(1)
      });

      const validationResult = acceptSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid data',
          errors: validationResult.error.errors
        });
      }

      const { token, username, password, fullName } = validationResult.data;

      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found or has expired' });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: `Invitation has already been ${invitation.status}` });
      }

      const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' });
      }

      const hashedPassword = await hashPassword(password);
      const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        fullName,
        email: invitation.email,
        role: invitation.role as "super_admin" | "admin" | "agent" | null | undefined,
        companyId: invitation.companyId,
        avatarUrl: null
      });

      await storage.updateTeamInvitationStatus(invitation.id, 'accepted');

      req.login(newUser, (err: any) => {
        if (err) {
          console.error('Error logging in new user:', err);
          return res.status(500).json({ message: 'Failed to log in new user' });
        }

        const { password, ...safeUser } = newUser;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      console.error('Error accepting team invitation:', error);
      res.status(500).json({ message: 'Failed to accept team invitation' });
    }
  });

  app.patch('/api/team/invitations/:id', ensureAdmin, async (req: any, res) => {
    try {
      const invitationId = parseInt(req.params.id);

      const statusSchema = z.object({
        status: invitationStatusTypes
      });

      const validationResult = statusSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Invalid status',
          errors: validationResult.error.errors
        });
      }

      const { status } = validationResult.data;

      const user = req.user as any;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const invitations = await storage.getTeamInvitations(companyId);
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      const updatedInvitation = await storage.updateTeamInvitationStatus(invitationId, status);

      res.json(updatedInvitation);
    } catch (error) {
      console.error('Error updating team invitation status:', error);
      res.status(500).json({ message: 'Failed to update team invitation status' });
    }
  });

  app.delete('/api/team/invitations/:id', ensureAdmin, async (req: any, res) => {
    try {
      const invitationId = parseInt(req.params.id);

      const user = req.user as any;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const invitations = await storage.getTeamInvitations(companyId);
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }

      const deleted = await storage.deleteTeamInvitation(invitationId);

      if (deleted) {
        res.json({ message: 'Invitation deleted successfully' });
      } else {
        res.status(500).json({ message: 'Failed to delete invitation' });
      }
    } catch (error) {
      console.error('Error deleting team invitation:', error);
      res.status(500).json({ message: 'Failed to delete team invitation' });
    }
  });

  app.get('/api/role-permissions', ensureAuthenticated, requirePermission('manage_team'), async (req: any, res) => {
    try {
      const user = req.user;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;

      const rolePermissions = await storage.getRolePermissions(companyId);
      res.json(rolePermissions);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      res.status(500).json({ message: 'Failed to fetch role permissions' });
    }
  });

  app.put('/api/role-permissions/:role', ensureAuthenticated, requirePermission('manage_team'), async (req: any, res) => {
    try {
      const role = req.params.role as 'admin' | 'agent';
      const { permissions } = req.body;

      if (!['admin', 'agent'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be admin or agent.' });
      }

      if (!permissions || typeof permissions !== 'object') {
        return res.status(400).json({ message: 'Permissions object is required' });
      }

      const user = req.user;
      const companyId = user.isSuperAdmin ? undefined : user.companyId;

      const updatedRolePermissions = await storage.updateRolePermissions(role, permissions, companyId);
      res.json(updatedRolePermissions);
    } catch (error) {
      console.error('Error updating role permissions:', error);
      res.status(500).json({ message: 'Failed to update role permissions' });
    }
  });


  app.post('/api/inbox/backups', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const {
        name,
        description,
        includeContacts = true,
        includeConversations = true,
        includeMessages = true,
        dateRangeStart,
        dateRangeEnd
      } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Backup name is required' });
      }

      const backupId = await inboxBackupService.createBackup({
        companyId: user.companyId,
        createdByUserId: user.id,
        name: name.trim(),
        description: description?.trim(),
        includeContacts,
        includeConversations,
        includeMessages,
        dateRangeStart: dateRangeStart ? new Date(dateRangeStart) : undefined,
        dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd) : undefined
      });

      res.status(201).json({
        id: backupId,
        message: 'Backup creation started successfully'
      });
    } catch (error) {
      console.error('Error creating backup:', error);
      res.status(500).json({ message: 'Failed to create backup' });
    }
  });

  app.get('/api/inbox/backups', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await inboxBackupService.getBackups(user.companyId, page, limit);
      res.json(result);
    } catch (error) {
      console.error('Error fetching backups:', error);
      res.status(500).json({ message: 'Failed to fetch backups' });
    }
  });

  app.get('/api/inbox/backups/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const backupId = parseInt(req.params.id);

      if (isNaN(backupId)) {
        return res.status(400).json({ message: 'Invalid backup ID' });
      }

      const backup = await inboxBackupService.getBackup(backupId, user.companyId);

      if (!backup) {
        return res.status(404).json({ message: 'Backup not found' });
      }

      res.json(backup);
    } catch (error) {
      console.error('Error fetching backup:', error);
      res.status(500).json({ message: 'Failed to fetch backup' });
    }
  });

  app.get('/api/inbox/backups/:id/download', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const backupId = parseInt(req.params.id);

      if (isNaN(backupId)) {
        return res.status(400).json({ message: 'Invalid backup ID' });
      }

      const backup = await inboxBackupService.getBackup(backupId, user.companyId);

      if (!backup) {
        return res.status(404).json({ message: 'Backup not found' });
      }

      if (backup.status !== 'completed') {
        return res.status(400).json({ message: 'Backup is not ready for download' });
      }

      const fileData = await inboxBackupService.downloadBackup(backupId, user.companyId);

      if (!fileData) {
        return res.status(404).json({ message: 'Backup file not found' });
      }


      await inboxBackupService.logAuditEvent({
        companyId: user.companyId,
        userId: user.id,
        action: 'backup_downloaded',
        entityType: 'backup',
        entityId: backupId,
        details: { name: backup.name },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.fileName}"`);
      res.setHeader('Content-Length', fileData.length);
      res.send(fileData);
    } catch (error) {
      console.error('Error downloading backup:', error);
      res.status(500).json({ message: 'Failed to download backup' });
    }
  });

  app.delete('/api/inbox/backups/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const backupId = parseInt(req.params.id);

      if (isNaN(backupId)) {
        return res.status(400).json({ message: 'Invalid backup ID' });
      }

      const success = await inboxBackupService.deleteBackup(backupId, user.companyId, user.id);

      if (!success) {
        return res.status(404).json({ message: 'Backup not found' });
      }

      res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
      console.error('Error deleting backup:', error);
      res.status(500).json({ message: 'Failed to delete backup' });
    }
  });


  app.post('/api/inbox/restores', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), (req: any, res, next) => {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/gzip' || file.originalname.endsWith('.gz')) {
          cb(null, true);
        } else {
          cb(new Error('Only .gz files are allowed'));
        }
      }
    }).single('backupFile');

    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      try {
        const user = req.user;
        const {
          backupId,
          restoreType = 'full',
          conflictResolution = 'merge',
          dateRangeStart,
          dateRangeEnd,
          restoreContacts = true,
          restoreConversations = true,
          restoreMessages = true
        } = req.body;

        if (!backupId && !req.file) {
          return res.status(400).json({ message: 'Either backupId or backup file is required' });
        }

        const restoreId = await inboxBackupService.createRestore({
          companyId: user.companyId,
          restoredByUserId: user.id,
          backupId: backupId ? parseInt(backupId) : undefined,
          restoreType,
          conflictResolution,
          dateRangeStart: dateRangeStart ? new Date(dateRangeStart) : undefined,
          dateRangeEnd: dateRangeEnd ? new Date(dateRangeEnd) : undefined,
          restoreContacts: restoreContacts === 'true' || restoreContacts === true,
          restoreConversations: restoreConversations === 'true' || restoreConversations === true,
          restoreMessages: restoreMessages === 'true' || restoreMessages === true
        }, req.file?.buffer);

        res.status(201).json({
          id: restoreId,
          message: 'Restore process started successfully'
        });
      } catch (error) {
        console.error('Error creating restore:', error);
        res.status(500).json({ message: 'Failed to start restore process' });
      }
    });
  });

  app.get('/api/inbox/restores', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await inboxBackupService.getRestores(user.companyId, page, limit);
      res.json(result);
    } catch (error) {
      console.error('Error fetching restores:', error);
      res.status(500).json({ message: 'Failed to fetch restores' });
    }
  });

  app.get('/api/inbox/restores/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const restoreId = parseInt(req.params.id);

      if (isNaN(restoreId)) {
        return res.status(400).json({ message: 'Invalid restore ID' });
      }

      const restore = await inboxBackupService.getRestore(restoreId, user.companyId);

      if (!restore) {
        return res.status(404).json({ message: 'Restore not found' });
      }

      res.json(restore);
    } catch (error) {
      console.error('Error fetching restore:', error);
      res.status(500).json({ message: 'Failed to fetch restore' });
    }
  });


  app.post('/api/inbox/backup-schedules', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const {
        name,
        description,
        frequency,
        cronExpression,
        retentionDays = 30,
        includeContacts = true,
        includeConversations = true,
        includeMessages = true,
        isActive = true
      } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'Schedule name is required' });
      }

      if (!frequency && !cronExpression) {
        return res.status(400).json({ message: 'Either frequency or cron expression is required' });
      }

      const scheduleId = await inboxBackupSchedulerService.createSchedule({
        companyId: user.companyId,
        createdByUserId: user.id,
        name: name.trim(),
        description: description?.trim(),
        frequency,
        cronExpression,
        retentionDays,
        includeContacts,
        includeConversations,
        includeMessages,
        isActive
      });

      res.status(201).json({
        id: scheduleId,
        message: 'Backup schedule created successfully'
      });
    } catch (error) {
      console.error('Error creating backup schedule:', error);
      res.status(500).json({ message: 'Failed to create backup schedule' });
    }
  });

  app.get('/api/inbox/backup-schedules', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const schedules = await inboxBackupSchedulerService.getSchedules(user.companyId);
      res.json({ schedules });
    } catch (error) {
      console.error('Error fetching backup schedules:', error);
      res.status(500).json({ message: 'Failed to fetch backup schedules' });
    }
  });

  app.put('/api/inbox/backup-schedules/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const scheduleId = parseInt(req.params.id);
      const updates = req.body;

      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }


      const schedule = await inboxBackupSchedulerService.getSchedule(scheduleId);
      if (!schedule || schedule.companyId !== user.companyId) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      const success = await inboxBackupSchedulerService.updateSchedule(scheduleId, updates);

      if (!success) {
        return res.status(500).json({ message: 'Failed to update schedule' });
      }

      res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
      console.error('Error updating backup schedule:', error);
      res.status(500).json({ message: 'Failed to update backup schedule' });
    }
  });

  app.delete('/api/inbox/backup-schedules/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req: any, res) => {
    try {
      const user = req.user;
      const scheduleId = parseInt(req.params.id);

      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }


      const schedule = await inboxBackupSchedulerService.getSchedule(scheduleId);
      if (!schedule || schedule.companyId !== user.companyId) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      const success = await inboxBackupSchedulerService.deleteSchedule(scheduleId);

      if (!success) {
        return res.status(500).json({ message: 'Failed to delete schedule' });
      }

      res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
      console.error('Error deleting backup schedule:', error);
      res.status(500).json({ message: 'Failed to delete backup schedule' });
    }
  });

  app.get('/api/smtp-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
      const user = req.user as any;

      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const config = await storage.getSmtpConfig(companyId);

      res.json(config || {
        host: '',
        port: 465,
        secure: false,
        auth: {
          user: '',
          pass: ''
        },
        senderEmail: '',
        senderName: ''
      });
    } catch (error) {
      console.error('Error getting SMTP configuration:', error);
      res.status(500).json({ message: 'Failed to get SMTP configuration' });
    }
  });

  app.post('/api/smtp-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
      const user = req.user as any;
      const config = req.body as SmtpConfig;

      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const success = await storage.saveSmtpConfig(config, companyId);

      if (!success) {
        return res.status(500).json({ message: 'Failed to update SMTP configuration' });
      }

      res.json({ message: 'SMTP configuration updated successfully' });
    } catch (error) {
      console.error('Error updating SMTP configuration:', error);
      res.status(500).json({ message: 'Failed to update SMTP configuration' });
    }
  });

  app.post('/api/smtp-config/test', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
      const { config, testEmail } = req.body;

      if (!config || !testEmail) {
        return res.status(400).json({ message: 'Missing configuration or test email address' });
      }

      await testSmtpConfig(config, testEmail);
      res.json({ message: 'Test email sent successfully' });
    } catch (error) {
      console.error('Error testing SMTP configuration:', error);
      res.status(500).json({
      });
    }
  });

  app.get('/api/email/config/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'USER_NOT_AUTHENTICATED',
          message: 'User not authenticated'
        });
      }

      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONNECTION_ID',
          message: 'Invalid connection ID'
        });
      }

      const channelConnection = await storage.getChannelConnection(connectionId);
      if (!channelConnection) {
        return res.status(404).json({
          success: false,
          error: 'CONNECTION_NOT_FOUND',
          message: 'Channel connection not found'
        });
      }

      if (channelConnection.companyId !== user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: 'Access denied to this connection'
        });
      }

      const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);

      let configData;
      if (emailConfig) {
        configData = {
          connectionId: channelConnection.id,
          connectionName: channelConnection.accountName,
          emailAddress: emailConfig.emailAddress,
          displayName: emailConfig.displayName,
          signature: emailConfig.signature,
          imapHost: emailConfig.imapHost,
          imapPort: emailConfig.imapPort,
          imapSecure: emailConfig.imapSecure,
          imapUsername: emailConfig.imapUsername,
          smtpHost: emailConfig.smtpHost,
          smtpPort: emailConfig.smtpPort,
          smtpSecure: emailConfig.smtpSecure,
          smtpUsername: emailConfig.smtpUsername,
          syncFolder: emailConfig.syncFolder,
          syncFrequency: emailConfig.syncFrequency,
          maxSyncMessages: emailConfig.maxSyncMessages,
          useOAuth2: !!emailConfig.oauthProvider,
          oauth2ClientId: emailConfig.oauthClientId,
          status: emailConfig.status,
          lastSyncAt: emailConfig.lastSyncAt,
          lastError: emailConfig.lastError
        };
      } else if (channelConnection.connectionData) {
        const connData = channelConnection.connectionData as any;
        configData = {
          connectionId: channelConnection.id,
          connectionName: channelConnection.accountName,
          emailAddress: connData.emailAddress || channelConnection.accountId,
          displayName: connData.displayName || '',
          signature: connData.signature || '',
          imapHost: connData.imapHost || '',
          imapPort: connData.imapPort || 993,
          imapSecure: connData.imapSecure !== false,
          imapUsername: connData.imapUsername || connData.emailAddress || channelConnection.accountId,
          smtpHost: connData.smtpHost || '',
          smtpPort: connData.smtpPort || 465,
          smtpSecure: connData.smtpSecure !== false,
          smtpUsername: connData.smtpUsername || connData.emailAddress || channelConnection.accountId,
          syncFolder: connData.syncFolder || 'INBOX',
          syncFrequency: connData.syncFrequency || 60,
          maxSyncMessages: connData.maxSyncMessages || 100,
          useOAuth2: !!connData.useOAuth2,
          oauth2ClientId: connData.oauth2ClientId || '',
          status: 'inactive',
          lastSyncAt: null,
          lastError: null
        };
      } else {
        configData = {
          connectionId: channelConnection.id,
          connectionName: channelConnection.accountName,
          emailAddress: channelConnection.accountId,
          displayName: '',
          signature: '',
          imapHost: '',
          imapPort: 993,
          imapSecure: true,
          imapUsername: '',
          smtpHost: '',
          smtpPort: 465,
          smtpSecure: true,
          smtpUsername: '',
          syncFolder: 'INBOX',
          syncFrequency: 60,
          maxSyncMessages: 100,
          useOAuth2: false,
          oauth2ClientId: '',
          status: 'inactive',
          lastSyncAt: null,
          lastError: null
        };
      }

      res.json({
        success: true,
        data: configData
      });

    } catch (error: any) {
      console.error('Error getting email configuration:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_CONFIG_ERROR',
        message: error.message || 'Failed to get email configuration'
      });
    }
  });

  app.post('/api/email/test-connection', ensureAuthenticated, async (req, res) => {
    try {
      const {
        imapHost,
        imapPort,
        imapSecure,
        imapUsername,
        imapPassword,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUsername,
        smtpPassword,
        useOAuth2,
        oauth2ClientId,
        oauth2ClientSecret,
        oauth2RefreshToken
      } = req.body;

      if (!imapHost || !imapPort || !smtpHost || !smtpPort) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'IMAP and SMTP host/port are required'
        });
      }

      if (!useOAuth2 && (!imapPassword || !smtpPassword)) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CREDENTIALS',
          message: 'Passwords are required when not using OAuth2'
        });
      }

      const { ImapFlow } = await import('imapflow');
      const imapClient = new ImapFlow({
        host: imapHost,
        port: imapPort,
        secure: imapSecure,
        auth: useOAuth2 ? {
          user: imapUsername,
          accessToken: oauth2RefreshToken
        } : {
          user: imapUsername,
          pass: imapPassword
        }
      });

      try {
        await imapClient.connect();
        await imapClient.logout();
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: 'IMAP_CONNECTION_FAILED',
          message: `IMAP connection failed: ${error.message}`
        });
      }

      const nodemailer = await import('nodemailer');
      const smtpTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: useOAuth2 ? {
          type: 'OAuth2',
          user: smtpUsername,
          clientId: oauth2ClientId,
          clientSecret: oauth2ClientSecret,
          refreshToken: oauth2RefreshToken
        } : {
          user: smtpUsername,
          pass: smtpPassword
        }
      } as any);

      try {
        await smtpTransporter.verify();
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: 'SMTP_CONNECTION_FAILED',
          message: `SMTP connection failed: ${error.message}`
        });
      }

      res.json({
        success: true,
        message: 'Email connection test successful'
      });

    } catch (error: any) {
      console.error('Error testing email connection:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_TEST_ERROR',
        message: error.message || 'Failed to test email connection'
      });
    }
  });

  app.post('/api/email/configure', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      if (!user || !user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'NO_COMPANY_ASSOCIATION',
          message: 'No company association found'
        });
      }

      const {
        connectionId,
        imapHost,
        imapPort,
        imapSecure,
        imapUsername,
        imapPassword,
        smtpHost,
        smtpPort,
        smtpSecure,
        smtpUsername,
        smtpPassword,
        emailAddress,
        displayName,
        signature,
        syncFolder,
        syncFrequency,
        maxSyncMessages,
        isUpdate = false
      } = req.body;

      if (!connectionId || !imapHost || !imapPort || !imapUsername ||
        !smtpHost || !smtpPort || !smtpUsername || !emailAddress) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Missing required email configuration fields'
        });
      }

      if (!isUpdate && (!imapPassword || !smtpPassword)) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_PASSWORDS',
          message: 'IMAP and SMTP passwords are required for new configurations'
        });
      }

      const channelConnection = await storage.getChannelConnection(connectionId);
      if (!channelConnection) {
        return res.status(404).json({
          success: false,
          error: 'CONNECTION_NOT_FOUND',
          message: 'Channel connection not found'
        });
      }

      if (channelConnection.companyId !== user.companyId) {
        return res.status(403).json({
          success: false,
          error: 'ACCESS_DENIED',
          message: 'Access denied to this connection'
        });
      }

      let finalImapPassword = imapPassword;
      let finalSmtpPassword = smtpPassword;

      if (isUpdate) {
        const existingConfig = await storage.getEmailConfigByConnectionId(connectionId);
        if (existingConfig) {
          finalImapPassword = imapPassword || existingConfig.imapPassword;
          finalSmtpPassword = smtpPassword || existingConfig.smtpPassword;
        }
      }

      const emailService = await import('./services/channels/email');

      const success = await emailService.default.initializeConnection(connectionId, {
        imapHost,
        imapPort: parseInt(imapPort),
        imapSecure: Boolean(imapSecure),
        imapUsername,
        imapPassword: finalImapPassword,
        smtpHost,
        smtpPort: parseInt(smtpPort),
        smtpSecure: Boolean(smtpSecure),
        smtpUsername,
        smtpPassword: finalSmtpPassword,
        emailAddress,
        displayName,
        signature,
        syncFolder: syncFolder || 'INBOX',
        syncFrequency: syncFrequency ? parseInt(syncFrequency) : 60,
        maxSyncMessages: maxSyncMessages ? parseInt(maxSyncMessages) : 100
      });

      if (success) {
        res.json({
          success: true,
          message: isUpdate ? 'Email channel updated successfully' : 'Email channel configured successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'EMAIL_CONFIG_FAILED',
          message: isUpdate ? 'Failed to update email channel' : 'Failed to configure email channel'
        });
      }

    } catch (error: any) {
      console.error('Error configuring email channel:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_CONFIG_ERROR',
        message: error.message || 'Failed to configure email channel'
      });
    }
  });

  app.post('/api/email/connect', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'USER_NOT_AUTHENTICATED',
          message: 'User not authenticated'
        });
      }

      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required'
        });
      }

      const emailService = await import('./services/channels/email');

      const success = await emailService.connectToEmail(connectionId, user.id);

      if (success) {
        res.json({
          success: true,
          message: 'Email channel connected successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'EMAIL_CONNECT_FAILED',
          message: 'Failed to connect to email channel'
        });
      }

    } catch (error: any) {
      console.error('Error connecting email channel:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_CONNECT_ERROR',
        message: error.message || 'Failed to connect to email channel'
      });
    }
  });

  app.post('/api/email/disconnect', ensureAuthenticated, async (req, res) => {
    try {
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required'
        });
      }

      const emailService = await import('./services/channels/email');

      const success = await emailService.disconnectFromEmail(connectionId);

      if (success) {
        res.json({
          success: true,
          message: 'Email channel disconnected successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'EMAIL_DISCONNECT_FAILED',
          message: 'Failed to disconnect from email channel'
        });
      }

    } catch (error: any) {
      console.error('Error disconnecting email channel:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_DISCONNECT_ERROR',
        message: error.message || 'Failed to disconnect from email channel'
      });
    }
  });

  app.get('/api/debug/event-emitters', ensureAuthenticated, async (req, res) => {
    try {
      const summary = eventEmitterMonitor.getSummary();
      res.json(summary);
    } catch (error) {
      console.error('Error getting EventEmitter status:', error);
      res.status(500).json({ error: 'Failed to get EventEmitter status' });
    }
  });

  app.post('/api/debug/event-emitters/:name/cleanup', ensureAuthenticated, requirePermission('ADMIN'), async (req, res) => {
    try {
      const emitterName = req.params.name;
      const success = eventEmitterMonitor.forceCleanup(emitterName);

      if (success) {
        res.json({ message: `Successfully cleaned up listeners for ${emitterName}` });
      } else {
        res.status(404).json({ error: `EventEmitter ${emitterName} not found` });
      }
    } catch (error) {
      console.error('Error cleaning up EventEmitter:', error);
      res.status(500).json({ error: 'Failed to cleanup EventEmitter' });
    }
  });

  app.get('/api/email/debug', ensureAuthenticated, async (req, res) => {
    try {
      const emailService = await import('./services/channels/email');
      const connectionsStatus = await emailService.getEmailConnectionsStatus();

      const dbEmailConnections = await storage.getChannelConnectionsByType('email');
      const dbEmailConfigs = await Promise.all(
        dbEmailConnections.map(async (conn) => {
          const config = await storage.getEmailConfigByConnectionId(conn.id);
          return {
            connectionId: conn.id,
            accountName: conn.accountName,
            status: conn.status,
            companyId: conn.companyId,
            userId: conn.userId,
            emailAddress: config?.emailAddress || 'N/A',
            lastSyncAt: config?.lastSyncAt?.toISOString() || 'Never'
          };
        })
      );

      res.json({
        success: true,
        data: {
          activeConnections: connectionsStatus,
          databaseConnections: dbEmailConfigs,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('Error getting email debug info:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_DEBUG_ERROR',
        message: error.message || 'Failed to get email debug info'
      });
    }
  });

  app.post('/api/email/cleanup', ensureAuthenticated, async (req, res) => {
    try {
      const emailService = await import('./services/channels/email');
      await emailService.cleanupOrphanedConnections();
      res.json({
        success: true,
        message: 'Email connection cleanup completed'
      });
    } catch (error: any) {
      console.error('Error cleaning up email connections:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_CLEANUP_ERROR',
        message: error.message || 'Failed to cleanup email connections'
      });
    }
  });



  app.post('/api/email/stop-old-polling', ensureAuthenticated, async (req, res) => {
    try {
      const emailService = await import('./services/channels/email');
      await emailService.stopAllOldPolling();
      res.json({
        success: true,
        message: 'Old-style email polling stopped and in-memory connections cleared'
      });
    } catch (error: any) {
      console.error('Error stopping old email polling:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_STOP_POLLING_ERROR',
        message: error.message || 'Failed to stop old email polling'
      });
    }
  });

  app.post('/api/email/sync/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONNECTION_ID',
          message: 'Invalid connection ID'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User authentication required'
        });
      }

      const emailService = await import('./services/channels/email');
      await emailService.syncNewEmails(connectionId, req.user.id);

      res.json({
        success: true,
        message: `Email sync completed for connection ${connectionId}`
      });
    } catch (error: any) {
      console.error('Error during manual email sync:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_SYNC_ERROR',
        message: error.message || 'Failed to sync emails'
      });
    }
  });

  app.get('/api/email/debug/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONNECTION_ID',
          message: 'Invalid connection ID'
        });
      }

      const emailConfig = await storage.getEmailConfigByConnectionId(connectionId);
      const channelConnection = await storage.getChannelConnection(connectionId);

      const recentMessages = await storage.getMessagesByConversationPaginated(connectionId, 10, 0);

      const emailService = await import('./services/channels/email');
      const pollingStatus = await emailService.getPollingStatus(connectionId);

      res.json({
        success: true,
        debug: {
          connectionId,
          emailConfig: emailConfig ? {
            emailAddress: emailConfig.emailAddress,
            lastSyncAt: emailConfig.lastSyncAt,
            syncFrequency: emailConfig.syncFrequency,
            status: emailConfig.status,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            imapSecure: emailConfig.imapSecure
          } : null,
          channelConnection: channelConnection ? {
            id: channelConnection.id,
            status: channelConnection.status,
            accountName: channelConnection.accountName,
            channelType: channelConnection.channelType,
            companyId: channelConnection.companyId
          } : null,
          pollingStatus,
          recentMessagesCount: recentMessages.length,
          recentMessages: recentMessages.slice(0, 3).map(msg => ({
            id: msg.id,
            content: msg.content.substring(0, 100),
            createdAt: msg.createdAt,
            direction: msg.direction,
            type: msg.type
          }))
        }
      });
    } catch (error: any) {
      console.error('Error getting email debug info:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_DEBUG_ERROR',
        message: error.message || 'Failed to get debug info'
      });
    }
  });

  app.get('/api/email/status/all', ensureAuthenticated, async (req, res) => {
    try {
      const emailService = await import('./services/channels/email');
      const allStatus = await emailService.getAllPollingStatus();

      res.json({
        success: true,
        status: allStatus
      });
    } catch (error: any) {
      console.error('Error getting all email status:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_STATUS_ERROR',
        message: error.message || 'Failed to get status'
      });
    }
  });

  app.post('/api/email/restart-polling/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      if (isNaN(connectionId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CONNECTION_ID',
          message: 'Invalid connection ID'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User authentication required'
        });
      }

      const emailService = await import('./services/channels/email');

      await emailService.disconnectEmailChannel(connectionId);

      await new Promise(resolve => setTimeout(resolve, 1000));

      await emailService.startEmailPollingForConnection(connectionId, req.user.id);

      res.json({
        success: true,
        message: `Email polling restarted for connection ${connectionId}`
      });
    } catch (error: any) {
      console.error('Error restarting email polling:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_RESTART_ERROR',
        message: error.message || 'Failed to restart polling'
      });
    }
  });

  app.get('/api/email/config/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = await storage.getChannelConnection(parseInt(connectionId));
      const emailConfig = await storage.getEmailConfigByConnectionId(parseInt(connectionId));

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'CONNECTION_NOT_FOUND',
          message: `Channel connection ${connectionId} not found`
        });
      }

      res.json({
        success: true,
        data: {
          connection: {
            id: connection.id,
            accountName: connection.accountName,
            status: connection.status,
            channelType: connection.channelType,
            companyId: connection.companyId,
            userId: connection.userId
          },
          emailConfig: emailConfig ? {
            id: emailConfig.id,
            emailAddress: emailConfig.emailAddress,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            imapSecure: emailConfig.imapSecure,
            smtpHost: emailConfig.smtpHost,
            smtpPort: emailConfig.smtpPort,
            smtpSecure: emailConfig.smtpSecure,
            syncFolder: emailConfig.syncFolder,
            syncFrequency: emailConfig.syncFrequency,
            lastSyncAt: emailConfig.lastSyncAt?.toISOString(),
            status: emailConfig.status
          } : null
        }
      });
    } catch (error: any) {
      console.error('Error getting email configuration:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_CONFIG_ERROR',
        message: error.message || 'Failed to get email configuration'
      });
    }
  });

  app.post('/api/email/sync/:connectionId', async (req, res) => {
    try {
      const { connectionId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User authentication required'
        });
      }

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required'
        });
      }

      const emailService = await import('./services/channels/email');

      await emailService.default.syncNewEmails(parseInt(connectionId), user.id);

      res.json({
        success: true,
        message: 'Email sync triggered successfully'
      });
    } catch (error: any) {
      console.error('Error triggering email sync:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_SYNC_ERROR',
        message: error.message || 'Failed to trigger email sync'
      });
    }
  });

  app.get('/api/email/:channelId/messages', ensureAuthenticated, async (req, res) => {
    try {
      const { channelId } = req.params;
      const { folder = 'inbox', search } = req.query;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const channelConnection = await storage.getChannelConnection(parseInt(channelId));
      if (!channelConnection || channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const conversations = await storage.getConversationsByChannel(parseInt(channelId));

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const allMessages = [];
      for (const conversation of conversations) {
        const messages = await storage.getMessagesByConversation(conversation.id);
        allMessages.push(...messages.map(msg => {
          const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
          return {
            ...msg,
            conversationId: conversation.id,
            from: metadata.emailFrom || 'Unknown',
            to: metadata.emailTo || 'Unknown',
            subject: metadata.emailSubject || '(No Subject)',
            htmlContent: metadata.emailHtml,
            hasAttachments: (metadata.attachmentCount || 0) > 0,
            isRead: !!msg.readAt
          };
        }));
      }

      allMessages.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      let filteredMessages = allMessages;

      const folderStr = typeof folder === 'string' ? folder.toLowerCase() : 'inbox';

      switch (folderStr) {
        case 'inbox':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return msg.direction === 'inbound' &&
              msg.status !== 'deleted' &&
              !metadata.deleted &&
              !metadata.archived &&
              metadata.folder !== 'trash';
          });
          break;
        case 'sent':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return msg.direction === 'outbound' &&
              msg.status !== 'deleted' &&
              msg.status !== 'draft' &&
              !metadata.deleted &&
              !metadata.archived &&
              !metadata.isDraft &&
              metadata.folder !== 'trash';
          });
          break;
        case 'drafts':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return msg.status === 'draft' || metadata.isDraft === true;
          });
          break;
        case 'trash':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return msg.status === 'deleted' || metadata.deleted === true || metadata.folder === 'trash';
          });
          break;
        case 'starred':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return metadata.starred === true &&
              msg.status !== 'deleted' &&
              !metadata.deleted &&
              metadata.folder !== 'trash';
          });
          break;
        case 'archive':
        case 'archived':
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            const isArchived = metadata.archived === true;
            const isNotDeleted = msg.status !== 'deleted' && !metadata.deleted && metadata.folder !== 'trash';

            return isArchived && isNotDeleted;
          });
          break;

        default:
          filteredMessages = allMessages.filter(msg => {
            const metadata = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
            return msg.direction === 'inbound' &&
              msg.status !== 'deleted' &&
              !metadata.deleted &&
              !metadata.archived &&
              metadata.folder !== 'trash';
          });
      }

      if (search) {
        const searchTerm = search.toString().toLowerCase();
        filteredMessages = filteredMessages.filter(msg =>
          msg.subject.toLowerCase().includes(searchTerm) ||
          msg.from.toLowerCase().includes(searchTerm) ||
          msg.content.toLowerCase().includes(searchTerm)
        );
      }

      const paginatedMessages = filteredMessages.slice(offset, offset + limit);
      const hasMore = filteredMessages.length > offset + limit;

      res.json({
        emails: paginatedMessages,
        hasMore,
        total: filteredMessages.length,
        page,
        limit
      });
    } catch (error: any) {
      console.error('Error fetching email messages:', error);
      res.status(500).json({ message: 'Failed to fetch email messages' });
    }
  });



  app.post('/api/email/:channelId/send', ensureAuthenticated, upload.any(), async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const { channelId } = req.params;
      const {
        to,
        subject,
        content,
        isHtml,
        cc,
        bcc,
        inReplyTo,
        references
      } = req.body;

      if (!channelId || !to || !content) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID, recipient, and content are required'
        });
      }

      const channelConnection = await storage.getChannelConnection(parseInt(channelId));
      if (!channelConnection || channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      let ccArray = [];
      let bccArray = [];

      if (cc) {
        ccArray = typeof cc === 'string' ? JSON.parse(cc) : cc;
      }

      if (bcc) {
        bccArray = typeof bcc === 'string' ? JSON.parse(bcc) : bcc;
      }

      const attachments = [];
      const files = req.files as any;
      if (files) {
        for (const [key, file] of Object.entries(files)) {
          if (key.startsWith('attachment_')) {
            const fileData = file as any;
            attachments.push({
              filename: fileData.originalname,
              content: fileData.buffer,
              contentType: fileData.mimetype
            });
          }
        }
      }

      const emailService = await import('./services/channels/email');
      const message = await emailService.sendMessage(
        parseInt(channelId),
        user.id,
        to,
        subject,
        content,
        {
          cc: ccArray,
          bcc: bccArray,
          isHtml: isHtml === 'true',
          attachments,
          inReplyTo,
          references
        }
      );

      res.json({
        success: true,
        message: 'Email sent successfully',
        data: message
      });
    } catch (error: any) {
      console.error('Error sending email:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send email'
      });
    }
  });

  app.get('/api/email/debug/polling-status', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const emailService = await import('./services/channels/email');

      const emailConnections = await storage.getChannelConnectionsByType('email');
      const companyConnections = emailConnections.filter(conn => conn.companyId === user.companyId);

      const connectionStatuses = [];
      for (const conn of companyConnections) {
        const pollingStatus = await emailService.getPollingStatus(conn.id);
        const connectionStatus = await emailService.getEmailConnectionStatus(conn.id);
        const emailConfig = await storage.getEmailConfigByConnectionId(conn.id);

        connectionStatuses.push({
          connectionId: conn.id,
          accountName: conn.accountName,
          status: conn.status,
          channelType: conn.channelType,
          pollingStatus,
          connectionStatus,
          emailConfig: emailConfig ? {
            emailAddress: emailConfig.emailAddress,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            imapSecure: emailConfig.imapSecure,
            syncFolder: emailConfig.syncFolder,
            syncFrequency: emailConfig.syncFrequency,
            lastSyncAt: emailConfig.lastSyncAt
          } : null
        });
      }

      const serviceDebugInfo = emailService.getEmailServiceDebugInfo();
      const allPollingStatus = await emailService.getAllPollingStatus();

      const websocketStatus = {
        globalBroadcastAvailable: !!(global as any).broadcastToCompany,
        websocketModuleAvailable: false
      };

      try {
        const { broadcastToCompany } = require('../utils/websocket');
        websocketStatus.websocketModuleAvailable = !!broadcastToCompany;
      } catch (error) {
        websocketStatus.websocketModuleAvailable = false;
      }

      res.json({
        success: true,
        companyId: user.companyId,
        totalEmailConnections: companyConnections.length,
        connectionStatuses,
        serviceDebugInfo,
        allPollingStatus,
        websocketStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error in email polling debug endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Debug endpoint failed',
        error: error.message
      });
    }
  });

  app.post('/api/email/:channelId/sync', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { channelId } = req.params;


      const channelConnection = await storage.getChannelConnection(parseInt(channelId));

      if (!channelConnection) {

        const allEmailConnections = await storage.getChannelConnectionsByType('email');
        const companyEmailConnections = allEmailConnections.filter(conn => conn.companyId === user.companyId);


        return res.status(400).json({
          success: false,
          message: `Invalid connection ID: ${channelId}`,
          availableConnections: companyEmailConnections.map(conn => ({
            id: conn.id,
            accountName: conn.accountName,
            status: conn.status
          }))
        });
      }

      if (channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      if (channelConnection.channelType !== 'email') {
        return res.status(400).json({ success: false, message: 'Not an email channel' });
      }

      const emailService = await import('./services/channels/email');

      await emailService.syncNewEmails(parseInt(channelId), user.id);

      res.json({
        success: true,
        message: 'Email sync completed',
        channelId: parseInt(channelId),
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error in manual email sync:', error);
      res.status(500).json({
        success: false,
        message: 'Manual sync failed',
        error: error.message
      });
    }
  });

  app.get('/api/email/:channelId/debug/recent-messages', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { channelId } = req.params;

      const channelConnection = await storage.getChannelConnection(parseInt(channelId));
      if (!channelConnection || channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const conversations = await storage.getConversationsByChannel(parseInt(channelId));
      const recentMessages = [];

      for (const conversation of conversations.slice(0, 5)) {
        const messages = await storage.getMessagesByConversation(conversation.id);
        const contact = conversation.contactId ? await storage.getContact(conversation.contactId) : null;

        recentMessages.push({
          conversationId: conversation.id,
          contactEmail: contact?.email,
          contactName: contact?.name,
          messageCount: messages.length,
          lastMessageAt: conversation.lastMessageAt,
          recentMessages: messages.slice(-3).map(msg => ({
            id: msg.id,
            content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
            direction: msg.direction,
            createdAt: msg.createdAt,
            externalId: msg.externalId,
            metadata: typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata
          }))
        });
      }

      res.json({
        success: true,
        channelId: parseInt(channelId),
        totalConversations: conversations.length,
        recentMessages,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error in recent messages debug endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Debug endpoint failed',
        error: error.message
      });
    }
  });

  app.get('/api/email/:channelId/debug/mailbox-status', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { channelId } = req.params;

      const channelConnection = await storage.getChannelConnection(parseInt(channelId));
      if (!channelConnection || channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (channelConnection.channelType !== 'email') {
        return res.status(400).json({ message: 'Not an email channel' });
      }

      const emailService = await import('./services/channels/email');

      const emailConfig = await storage.getEmailConfigByConnectionId(parseInt(channelId));
      if (!emailConfig) {
        return res.status(404).json({ message: 'Email configuration not found' });
      }

      try {
        const mailboxes = await emailService.listEmailMailboxes(parseInt(channelId));

        res.json({
          success: true,
          channelId: parseInt(channelId),
          emailConfig: {
            emailAddress: emailConfig.emailAddress,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            imapSecure: emailConfig.imapSecure,
            syncFolder: emailConfig.syncFolder || 'INBOX',
            lastSyncAt: emailConfig.lastSyncAt
          },
          mailboxes,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        res.json({
          success: false,
          channelId: parseInt(channelId),
          emailConfig: {
            emailAddress: emailConfig.emailAddress,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            imapSecure: emailConfig.imapSecure,
            syncFolder: emailConfig.syncFolder || 'INBOX',
            lastSyncAt: emailConfig.lastSyncAt
          },
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error: any) {
      console.error('Error in mailbox status debug endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Debug endpoint failed',
        error: error.message
      });
    }
  });

  app.get('/api/email/debug/connections', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const allEmailConnections = await storage.getChannelConnectionsByType('email');
      const companyEmailConnections = allEmailConnections.filter(conn => conn.companyId === user.companyId);

      const connectionsWithConfig = [];
      for (const conn of companyEmailConnections) {
        const emailConfig = await storage.getEmailConfigByConnectionId(conn.id);
        connectionsWithConfig.push({
          id: conn.id,
          accountName: conn.accountName,
          channelType: conn.channelType,
          status: conn.status,
          companyId: conn.companyId,
          userId: conn.userId,
          createdAt: conn.createdAt,
          emailConfig: emailConfig ? {
            emailAddress: emailConfig.emailAddress,
            imapHost: emailConfig.imapHost,
            imapPort: emailConfig.imapPort,
            syncFolder: emailConfig.syncFolder,
            lastSyncAt: emailConfig.lastSyncAt
          } : null
        });
      }

      res.json({
        success: true,
        companyId: user.companyId,
        totalEmailConnections: companyEmailConnections.length,
        connections: connectionsWithConfig,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error in email connections debug endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'INVALID_CONNECTION_ID',
        message: 'Invalid connection ID'
      });
    }
  });



  app.post('/api/email/:channelId/debug/fix-status', ensureAuthenticated, async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ message: 'Only available in development' });
    }

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const { channelId } = req.params;

      const channelConnection = await storage.getChannelConnection(parseInt(channelId));
      if (!channelConnection || channelConnection.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (channelConnection.channelType !== 'email') {
        return res.status(400).json({ message: 'Not an email channel' });
      }

      const emailConfig = await storage.getEmailConfigByConnectionId(parseInt(channelId));

      if (!emailConfig) {
        return res.json({
          success: false,
          message: 'No email configuration found',
          channelId: parseInt(channelId),
          action: 'Please configure IMAP/SMTP settings for this email channel'
        });
      }

      const missingFields = [];
      if (!emailConfig.imapHost) missingFields.push('imapHost');
      if (!emailConfig.imapPort) missingFields.push('imapPort');
      if (!emailConfig.emailAddress) missingFields.push('emailAddress');
      if (!emailConfig.imapPassword) missingFields.push('imapPassword');

      if (missingFields.length > 0) {
        return res.json({
          success: false,
          message: `Missing required configuration fields: ${missingFields.join(', ')}`,
          channelId: parseInt(channelId),
          missingFields,
          currentConfig: {
            emailAddress: emailConfig.emailAddress || null,
            imapHost: emailConfig.imapHost || null,
            imapPort: emailConfig.imapPort || null,
            hasPassword: !!emailConfig.imapPassword
          }
        });
      }

      await storage.updateChannelConnectionStatus(parseInt(channelId), 'active');

      res.json({
        success: true,
        message: 'Channel status updated to active',
        channelId: parseInt(channelId),
        previousStatus: channelConnection.status,
        newStatus: 'active',
        emailConfig: {
          emailAddress: emailConfig.emailAddress,
          imapHost: emailConfig.imapHost,
          imapPort: emailConfig.imapPort,
          hasPassword: !!emailConfig.imapPassword
        }
      });
    } catch (error: any) {
      console.error('Error in fix status debug endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Debug endpoint failed',
        error: error.message
      });
    }
  });

  app.get('/api/email/messages/:messageId/attachments', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const attachments = await storage.getEmailAttachmentsByMessageId(parseInt(messageId));
      res.json(attachments);
    } catch (error: any) {
      console.error('Error fetching email attachments:', error);
      res.status(500).json({ message: 'Failed to fetch email attachments' });
    }
  });

  app.post('/api/email/messages/:messageId/mark-read', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const { isRead } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (isRead) {
        await storage.markMessageAsRead(parseInt(messageId));
      } else {
        await storage.updateMessage(parseInt(messageId), { readAt: null });
      }

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageUpdated',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId,
            updates: { readAt: isRead ? new Date().toISOString() : null }
          }
        }, user.companyId);
      }

      res.json({ success: true, isRead });
    } catch (error: any) {
      console.error('Error marking email as read:', error);
      res.status(500).json({ message: 'Failed to mark email as read' });
    }
  });

  app.post('/api/email/messages/:messageId/star', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const { starred } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
      const updatedMetadata = {
        ...currentMetadata,
        starred: starred
      };

      await storage.updateMessage(parseInt(messageId), {
        metadata: JSON.stringify(updatedMetadata)
      });

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageUpdated',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId,
            updates: { starred }
          }
        }, user.companyId);
      }

      res.json({ success: true, starred });
    } catch (error: any) {
      console.error('Error updating email star status:', error);
      res.status(500).json({ message: 'Failed to update email star status' });
    }
  });

  app.post('/api/email/messages/:messageId/archive', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
      const isCurrentlyArchived = currentMetadata.archived === true;
      const newArchivedStatus = !isCurrentlyArchived;

      const updatedMetadata = {
        ...currentMetadata,
        archived: newArchivedStatus,
        folder: newArchivedStatus ? 'archive' : undefined
      };

      await storage.updateMessage(parseInt(messageId), {
        metadata: JSON.stringify(updatedMetadata)
      });

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageUpdated',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId,
            updates: { archived: newArchivedStatus }
          }
        }, user.companyId);
      }

      res.json({ success: true, archived: newArchivedStatus });
    } catch (error: any) {
      console.error('Error archiving email:', error);
      res.status(500).json({ message: 'Failed to archive email' });
    }
  });

  app.delete('/api/email/messages/:messageId', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
      const updatedMetadata = {
        ...currentMetadata,
        deleted: true,
        folder: 'trash',
        deletedAt: new Date().toISOString()
      };

      await storage.updateMessage(parseInt(messageId), {
        metadata: JSON.stringify(updatedMetadata),
        status: 'deleted'
      });

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageUpdated',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId,
            updates: { deleted: true, status: 'deleted' }
          }
        }, user.companyId);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting email:', error);
      res.status(500).json({ message: 'Failed to delete email' });
    }
  });

  app.post('/api/email/messages/bulk/archive', ensureAuthenticated, async (req, res) => {
    try {
      const { messageIds } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'Message IDs array is required' });
      }

      const results = [];

      for (const messageId of messageIds) {
        try {
          const message = await storage.getMessageById(parseInt(messageId));
          if (!message) {
            results.push({ messageId, success: false, error: 'Message not found' });
            continue;
          }

          const conversation = await storage.getConversation(message.conversationId);
          if (!conversation || conversation.companyId !== user.companyId) {
            results.push({ messageId, success: false, error: 'Access denied' });
            continue;
          }

          const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
          const isCurrentlyArchived = currentMetadata.archived === true;
          const newArchivedStatus = !isCurrentlyArchived;

          const updatedMetadata = {
            ...currentMetadata,
            archived: newArchivedStatus,
            folder: newArchivedStatus ? 'archive' : undefined
          };

          await storage.updateMessage(parseInt(messageId), {
            metadata: JSON.stringify(updatedMetadata)
          });

          if (user.companyId) {
            broadcastToCompany({
              type: 'messageUpdated',
              data: {
                messageId: parseInt(messageId),
                conversationId: message.conversationId,
                updates: { archived: newArchivedStatus }
              }
            }, user.companyId);
          }

          results.push({ messageId, success: true, archived: newArchivedStatus });
        } catch (error) {
          results.push({ messageId, success: false, error: 'Failed to process message' });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Error in bulk archive operation:', error);
      res.status(500).json({ message: 'Failed to perform bulk archive operation' });
    }
  });

  app.post('/api/email/messages/bulk/delete', ensureAuthenticated, async (req, res) => {
    try {
      const { messageIds } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'Message IDs array is required' });
      }

      const results = [];

      for (const messageId of messageIds) {
        try {
          const message = await storage.getMessageById(parseInt(messageId));
          if (!message) {
            results.push({ messageId, success: false, error: 'Message not found' });
            continue;
          }

          const conversation = await storage.getConversation(message.conversationId);
          if (!conversation || conversation.companyId !== user.companyId) {
            results.push({ messageId, success: false, error: 'Access denied' });
            continue;
          }

          const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
          const updatedMetadata = {
            ...currentMetadata,
            deleted: true,
            folder: 'trash',
            deletedAt: new Date().toISOString()
          };

          await storage.updateMessage(parseInt(messageId), {
            metadata: JSON.stringify(updatedMetadata),
            status: 'deleted'
          });

          if (user.companyId) {
            broadcastToCompany({
              type: 'messageUpdated',
              data: {
                messageId: parseInt(messageId),
                conversationId: message.conversationId,
                updates: { deleted: true, status: 'deleted' }
              }
            }, user.companyId);
          }

          results.push({ messageId, success: true });
        } catch (error) {
          results.push({ messageId, success: false, error: 'Failed to process message' });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Error in bulk delete operation:', error);
      res.status(500).json({ message: 'Failed to perform bulk delete operation' });
    }
  });

  app.post('/api/email/messages/bulk/star', ensureAuthenticated, async (req, res) => {
    try {
      const { messageIds, starred = true } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'Message IDs array is required' });
      }

      const results = [];

      for (const messageId of messageIds) {
        try {
          const message = await storage.getMessageById(parseInt(messageId));
          if (!message) {
            results.push({ messageId, success: false, error: 'Message not found' });
            continue;
          }

          const conversation = await storage.getConversation(message.conversationId);
          if (!conversation || conversation.companyId !== user.companyId) {
            results.push({ messageId, success: false, error: 'Access denied' });
            continue;
          }

          const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
          const updatedMetadata = {
            ...currentMetadata,
            starred: starred
          };

          await storage.updateMessage(parseInt(messageId), {
            metadata: JSON.stringify(updatedMetadata)
          });

          if (user.companyId) {
            broadcastToCompany({
              type: 'messageUpdated',
              data: {
                messageId: parseInt(messageId),
                conversationId: message.conversationId,
                updates: { starred: starred }
              }
            }, user.companyId);
          }

          results.push({ messageId, success: true, starred });
        } catch (error) {
          results.push({ messageId, success: false, error: 'Failed to process message' });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Error in bulk star operation:', error);
      res.status(500).json({ message: 'Failed to perform bulk star operation' });
    }
  });

  app.post('/api/email/messages/:messageId/restore', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const currentMetadata = message.metadata ? (typeof message.metadata === 'string' ? JSON.parse(message.metadata) : message.metadata) : {};
      const updatedMetadata = {
        ...currentMetadata,
        deleted: false,
        archived: false,
        folder: undefined,
        restoredAt: new Date().toISOString()
      };

      await storage.updateMessage(parseInt(messageId), {
        metadata: JSON.stringify(updatedMetadata),
        status: 'sent'
      });

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageUpdated',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId,
            updates: { deleted: false, archived: false, status: 'sent' }
          }
        }, user.companyId);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error restoring email:', error);
      res.status(500).json({ message: 'Failed to restore email' });
    }
  });

  app.delete('/api/email/messages/:messageId/permanent-delete', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const message = await storage.getMessageById(parseInt(messageId));
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await storage.deleteMessage(parseInt(messageId));

      if (user.companyId) {
        broadcastToCompany({
          type: 'messageDeleted',
          data: {
            messageId: parseInt(messageId),
            conversationId: message.conversationId
          }
        }, user.companyId);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error permanently deleting email:', error);
      res.status(500).json({ message: 'Failed to permanently delete email' });
    }
  });

  app.post('/api/email/messages/bulk/mark-read', ensureAuthenticated, async (req, res) => {
    try {
      const { messageIds, isRead = true } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ message: 'Message IDs array is required' });
      }

      const results = [];

      for (const messageId of messageIds) {
        try {
          const message = await storage.getMessageById(parseInt(messageId));
          if (!message) {
            results.push({ messageId, success: false, error: 'Message not found' });
            continue;
          }

          const conversation = await storage.getConversation(message.conversationId);
          if (!conversation || conversation.companyId !== user.companyId) {
            results.push({ messageId, success: false, error: 'Access denied' });
            continue;
          }

          await storage.updateMessage(parseInt(messageId), {
            readAt: isRead ? new Date() : null
          });

          if (user.companyId) {
            broadcastToCompany({
              type: 'messageUpdated',
              data: {
                messageId: parseInt(messageId),
                conversationId: message.conversationId,
                updates: { readAt: isRead ? new Date() : null }
              }
            }, user.companyId);
          }

          results.push({ messageId, success: true, isRead });
        } catch (error) {
          results.push({ messageId, success: false, error: 'Failed to process message' });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Error in bulk mark read operation:', error);
      res.status(500).json({ message: 'Failed to perform bulk mark read operation' });
    }
  });

  app.post('/api/v1/email/send', ensureAuthenticated, upload.any(), async (req, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const {
        channelId,
        to,
        subject,
        content,
        isHtml,
        cc,
        bcc,
        inReplyTo,
        references
      } = req.body;

      if (!channelId || !to || !content) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID, recipient, and content are required'
        });
      }

      let ccArray = [];
      let bccArray = [];

      if (cc) {
        ccArray = typeof cc === 'string' ? JSON.parse(cc) : cc;
      }

      if (bcc) {
        bccArray = typeof bcc === 'string' ? JSON.parse(bcc) : bcc;
      }

      const attachments = [];
      const files = req.files as any;
      if (files) {
        for (const [key, file] of Object.entries(files)) {
          if (key.startsWith('attachment_')) {
            const fileData = file as any;
            attachments.push({
              filename: fileData.originalname,
              content: fileData.buffer,
              contentType: fileData.mimetype
            });
          }
        }
      }

      const emailService = await import('./services/channels/email');
      const message = await emailService.sendMessage(
        parseInt(channelId),
        user.id,
        to,
        subject,
        content,
        {
          cc: ccArray,
          bcc: bccArray,
          isHtml: isHtml === 'true',
          attachments,
          inReplyTo,
          references
        }
      );

      res.json({
        success: true,
        message: 'Email sent successfully',
        data: message
      });
    } catch (error: any) {
      console.error('Error sending email:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to send email'
      });
    }
  });

  app.get('/api/email/mailboxes/:connectionId', ensureAuthenticated, async (req, res) => {
    try {
      const { connectionId } = req.params;

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required'
        });
      }

      const emailService = await import('./services/channels/email');
      const mailboxes = await emailService.default.listMailboxes(parseInt(connectionId));

      res.json({
        success: true,
        data: mailboxes
      });
    } catch (error: any) {
      console.error('Error listing email mailboxes:', error);
      res.status(500).json({
        success: false,
        error: 'EMAIL_MAILBOX_LIST_ERROR',
        message: error.message || 'Failed to list email mailboxes'
      });
    }
  });






  app.delete('/api/pipeline/stages/:id', ensureAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const moveDealsToStageId = req.query.moveToStageId ? parseInt(req.query.moveToStageId as string) : undefined;

      if (isNaN(id)) {
        return res.status(400).json({ message: 'Invalid stage ID' });
      }

      if (moveDealsToStageId !== undefined && isNaN(moveDealsToStageId)) {
        return res.status(400).json({ message: 'Invalid target stage ID' });
      }

      const existingStage = await storage.getPipelineStage(id);
      if (!existingStage) {
        return res.status(404).json({ message: 'Pipeline stage not found' });
      }

      if (moveDealsToStageId !== undefined) {
        if (moveDealsToStageId === id) {
          return res.status(400).json({ message: 'Target stage cannot be the same as the deleted stage' });
        }

        const targetStage = await storage.getPipelineStage(moveDealsToStageId);
        if (!targetStage) {
          return res.status(404).json({ message: 'Target stage not found' });
        }
      }

      const result = await storage.deletePipelineStage(id, moveDealsToStageId);

      if (result) {
        res.status(200).json({ message: 'Pipeline stage deleted successfully' });
      } else {
        res.status(500).json({ message: 'Failed to delete pipeline stage' });
      }
    } catch (error) {
      console.error('Error deleting pipeline stage:', error);
      res.status(500).json({ message: 'Failed to delete pipeline stage' });
    }
  });

  app.get('/api/deals', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const generalSearch = req.query.generalSearch as string | undefined;
      const pipelineId = req.query.pipelineId ? parseInt(req.query.pipelineId as string) : undefined;
      const includeReverts = req.query.includeReverts === 'true';


      const stageIds = req.query.stageIds ? (req.query.stageIds as string).split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined;
      const priorities = req.query.priorities ? (req.query.priorities as string).split(',') as ('low' | 'medium' | 'high')[] : undefined;
      const minValue = req.query.minValue ? parseFloat(req.query.minValue as string) : undefined;
      const maxValue = req.query.maxValue ? parseFloat(req.query.maxValue as string) : undefined;
      const dueDateFrom = req.query.dueDateFrom as string | undefined;
      const dueDateTo = req.query.dueDateTo as string | undefined;
      const assignedUserIds = req.query.assignedUserIds ? (req.query.assignedUserIds as string).split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : undefined;
      const includeUnassigned = req.query.includeUnassigned === 'true';
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
      const status = req.query.status as string | undefined;
      const createdFrom = req.query.createdFrom as string | undefined;
      const createdTo = req.query.createdTo as string | undefined;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      const filter: {
        companyId?: number;
        generalSearch?: string;
        pipelineId?: number;
        stageIds?: number[];
        priorities?: ('low' | 'medium' | 'high')[];
        minValue?: number;
        maxValue?: number;
        dueDateFrom?: string;
        dueDateTo?: string;
        assignedUserIds?: number[];
        includeUnassigned?: boolean;
        tags?: string[];
        status?: string;
        createdFrom?: string;
        createdTo?: string;
        customFields?: Record<string, {operator: 'equals' | 'contains' | 'gt' | 'lt' | 'inArray'; value: string | number | string[]}>;
      } = {
        companyId: user.companyId
      };

      if (generalSearch) {
        filter.generalSearch = generalSearch;
      }

      if (pipelineId && !isNaN(pipelineId)) {
        filter.pipelineId = pipelineId;
      }

      if (stageIds && stageIds.length > 0) {
        filter.stageIds = stageIds;
      }

      if (priorities && priorities.length > 0) {
        filter.priorities = priorities;
      }

      if (minValue !== undefined && !isNaN(minValue)) {
        filter.minValue = minValue;
      }

      if (maxValue !== undefined && !isNaN(maxValue)) {
        filter.maxValue = maxValue;
      }

      if (dueDateFrom) {
        filter.dueDateFrom = dueDateFrom;
      }

      if (dueDateTo) {
        filter.dueDateTo = dueDateTo;
      }

      if (assignedUserIds && assignedUserIds.length > 0) {
        filter.assignedUserIds = assignedUserIds;
      }

      if (includeUnassigned) {
        filter.includeUnassigned = includeUnassigned;
      }

      if (tags && tags.length > 0) {
        filter.tags = tags;
      }

      if (status) {
        filter.status = status;
      }

      if (createdFrom) {
        filter.createdFrom = createdFrom;
      }

      if (createdTo) {
        filter.createdTo = createdTo;
      }


      if (req.query.customFields) {
        try {
          const customFieldsStr = req.query.customFields as string;
          filter.customFields = JSON.parse(customFieldsStr);
        } catch (error) {
          console.error('Error parsing customFields:', error);

        }
      }

      const deals = await storage.getDeals(filter);


      if (includeReverts && deals && Array.isArray(deals)) {
        const dealsWithReverts = await Promise.all(
          deals.map(async (deal: any) => {
            try {
              const reverts = await storage.getPipelineStageRevertsByDeal(deal.id, user.companyId);
              const activeReverts = reverts.filter((r: any) => r.status === 'scheduled');
              return {
                ...deal,
                scheduledReverts: reverts,
                hasScheduledReverts: activeReverts.length > 0
              };
            } catch (error) {
              console.error(`Error fetching reverts for deal ${deal.id}:`, error);
              return {
                ...deal,
                scheduledReverts: [],
                hasScheduledReverts: false
              };
            }
          })
        );
        return res.status(200).json(dealsWithReverts);
      }

      return res.status(200).json(deals);
    } catch (error) {
      console.error("Error fetching deals:", error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  app.get('/api/company/custom-fields', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const entity = req.query.entity as 'deal' | 'contact' | 'company' | undefined;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      if (!entity) {
        return res.status(400).json({ message: 'Entity parameter is required' });
      }

      const customFields = await storage.getCompanyCustomFields(user.companyId, entity);
      return res.status(200).json(customFields);
    } catch (error) {
      console.error('Error fetching custom fields:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/stage/:stage', ensureAuthenticated, async (req, res) => {
    try {
      const { stage } = req.params;
      const deals = await storage.getDealsByStage(stage as any);
      return res.status(200).json(deals);
    } catch (error) {
      console.error(`Error fetching deals for stage ${req.params.stage}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/contact/:contactId', ensureAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.contactId);
      const deals = await storage.getDealsByContact(contactId);
      return res.status(200).json(deals);
    } catch (error) {
      console.error(`Error fetching deals for contact ${req.params.contactId}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/user/:userId', ensureAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const deals = await storage.getDealsByAssignedUser(userId);
      return res.status(200).json(deals);
    } catch (error) {
      console.error(`Error fetching deals for user ${req.params.userId}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/tags', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      const tags = await storage.getDealTags(user.companyId);
      return res.status(200).json(tags);
    } catch (error) {
      console.error('Error fetching deal tags:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  app.get('/api/deals/export', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { format = 'json', stageId } = req.query;




      let deals;
      try {
        if (stageId) {
          deals = await storage.getDealsByStageId(parseInt(stageId as string));
        } else {
          deals = await storage.getDeals();
        }
      } catch (error) {
        console.error('Error fetching deals:', error);
        return res.status(500).json({ message: 'Failed to fetch deals from database' });
      }




      if (!user.isSuperAdmin && user.companyId) {
        deals = deals.filter(deal => deal.companyId === user.companyId);
      }




      const stages = await storage.getPipelineStages();
      const teamMembers = await storage.getAllTeamMembers();


      const pipelines = user.companyId 
        ? await storage.getPipelinesByCompany(user.companyId)
        : await storage.getPipelines();
      const pipelinesMap = new Map(pipelines.map(p => [p.id, p]));

      const contactIdsSet = new Set<number>();
      deals.forEach(deal => contactIdsSet.add(deal.contactId));
      const contactIds = Array.from(contactIdsSet);



      const contacts = await Promise.all(
        contactIds.map(async (contactId) => {
          try {
            return await storage.getContact(contactId);
          } catch (error) {
            console.warn(`Failed to get contact ${contactId}:`, error);
            return null;
          }
        })
      );
      const contactsMap = new Map(contacts.filter(Boolean).map(c => [c!.id, c]));


      const enrichedDeals = deals.map(deal => {
        const stage = stages.find(s => s.id === deal.stageId);
        const assignee = teamMembers.find((m: any) => m.id === deal.assignedToUserId);
        const contact = contactsMap.get(deal.contactId);

        return {
          id: deal.id,
          title: deal.title,
          description: deal.description,
          value: deal.value,
          priority: deal.priority,
          contactId: deal.contactId,
          contactName: contact?.name || '',
          contactEmail: contact?.email || '',
          contactPhone: contact?.phone || '',
          assignedToUserId: deal.assignedToUserId,
          assignedToEmail: assignee?.email || '',
          assignedToName: assignee?.fullName || assignee?.username || '',
          tags: Array.isArray(deal.tags) ? deal.tags : [],
          pipelineId: deal.pipelineId,
          pipelineName: pipelinesMap.get(deal.pipelineId)?.name || '',
          stage: stage?.name || '',
          stageId: deal.stageId,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt
        };
      });



      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="deals_export_${new Date().toISOString().split('T')[0]}.json"`);
        return res.json(enrichedDeals);
      } else if (format === 'csv') {

        const csvHeader = 'id,title,description,value,priority,contactId,contactName,contactEmail,contactPhone,assignedToUserId,assignedToEmail,assignedToName,tags,pipelineId,pipelineName,stage,stageId,createdAt,updatedAt\n';
        const csvData = enrichedDeals.map(deal => {
          return [
            deal.id,
            `"${deal.title || ''}"`,
            `"${deal.description || ''}"`,
            deal.value || 0,
            deal.priority || '',
            deal.contactId || '',
            `"${deal.contactName || ''}"`,
            `"${deal.contactEmail || ''}"`,
            `"${deal.contactPhone || ''}"`,
            deal.assignedToUserId || '',
            `"${deal.assignedToEmail || ''}"`,
            `"${deal.assignedToName || ''}"`,
            `"${Array.isArray(deal.tags) ? deal.tags.join(',') : ''}"`,
            deal.pipelineId || '',
            `"${deal.pipelineName || ''}"`,
            `"${deal.stage || ''}"`,
            deal.stageId || '',
            deal.createdAt || '',
            deal.updatedAt || ''
          ].join(',');
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="deals_export_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csvHeader + csvData);
      } else if (format === 'excel') {


        const csvHeader = 'id,title,description,value,priority,contactId,contactName,contactEmail,contactPhone,assignedToUserId,assignedToEmail,assignedToName,tags,pipelineId,pipelineName,stage,stageId,createdAt,updatedAt\n';
        const csvData = enrichedDeals.map(deal => {
          return [
            deal.id,
            `"${deal.title || ''}"`,
            `"${deal.description || ''}"`,
            deal.value || 0,
            deal.priority || '',
            deal.contactId || '',
            `"${deal.contactName || ''}"`,
            `"${deal.contactEmail || ''}"`,
            `"${deal.contactPhone || ''}"`,
            deal.assignedToUserId || '',
            `"${deal.assignedToEmail || ''}"`,
            `"${deal.assignedToName || ''}"`,
            `"${Array.isArray(deal.tags) ? deal.tags.join(',') : ''}"`,
            deal.pipelineId || '',
            `"${deal.pipelineName || ''}"`,
            `"${deal.stage || ''}"`,
            deal.stageId || '',
            deal.createdAt || '',
            deal.updatedAt || ''
          ].join(',');
        }).join('\n');

        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="deals_export_${new Date().toISOString().split('T')[0]}.xlsx"`);
        return res.send(csvHeader + csvData);
      } else {
        return res.status(400).json({ message: 'Unsupported export format. Use json, csv, or excel.' });
      }
    } catch (error) {
      console.error('Error exporting deals:', error);
      res.status(500).json({
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/deals/:id', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const deal = await storage.getDeal(dealId);

      if (!deal) {
        return res.status(404).json({ message: 'Deal not found' });
      }

      return res.status(200).json(deal);
    } catch (error) {
      console.error(`Error fetching deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/deals', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!req.body.contactId) {
        return res.status(400).json({ message: 'Contact ID is required' });
      }

      if (!req.body.title) {
        return res.status(400).json({ message: 'Deal title is required' });
      }

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      const contact = await storage.getContact(req.body.contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      if (contact.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Contact does not belong to your company' });
      }


      const mapStageNameToDbValue = (stageName: string): string => {
        const normalizedName = stageName.toLowerCase().trim();


        const stageMapping: Record<string, string> = {
          'lead': 'lead',
          'leads': 'lead',
          'qualified': 'qualified',
          'qualify': 'qualified',
          'contacted': 'contacted',
          'contact': 'contacted',
          'demo scheduled': 'demo_scheduled',
          'demo': 'demo_scheduled',
          'scheduled': 'demo_scheduled',
          'proposal': 'proposal',
          'proposals': 'proposal',
          'negotiation': 'negotiation',
          'negotiate': 'negotiation',
          'neg': 'negotiation',
          'closed won': 'closed_won',
          'won': 'closed_won',
          'closed': 'closed_won',
          'closed lost': 'closed_lost',
          'lost': 'closed_lost'
        };

        return stageMapping[normalizedName] || 'lead';
      };

      let stageId = null;
      let stage = 'lead';

      if (req.body.stage) {
        const providedStageId = parseInt(req.body.stage);
        if (!isNaN(providedStageId)) {
          const pipelineStage = await storage.getPipelineStageById(providedStageId);
          if (!pipelineStage) {
            return res.status(404).json({ message: 'Pipeline stage not found' });
          }

          if (pipelineStage.companyId !== user.companyId) {
            return res.status(403).json({ message: 'Pipeline stage does not belong to your company' });
          }

          stageId = providedStageId;
          stage = mapStageNameToDbValue(pipelineStage.name);
        }
      }

      const dealData = {
        ...req.body,
        companyId: user.companyId,
        stageId: stageId,
        stage: stage,
        assignedToUserId: req.body.assignedToUserId || null
      };

      if (dealData.assignedToUserId) {
        const assignedUser = await storage.getUser(dealData.assignedToUserId);
        if (!assignedUser || assignedUser.companyId !== user.companyId) {
          return res.status(403).json({ message: 'Assigned user does not belong to your company' });
        }
      }

      const newDeal = await storage.createDeal(dealData);

      await storage.createDealActivity({
        dealId: newDeal.id,
        userId: user.id,
        type: 'create',
        content: `Deal "${newDeal.title}" created`,
        metadata: { createdBy: user.id }
      });

      return res.status(201).json(newDeal);
    } catch (error: any) {
      console.error("Error creating deal:", error);

      if (error.message === 'Contact ID is required') {
        return res.status(400).json({ message: 'Contact ID is required' });
      }

      if (error.message === 'Deal title is required') {
        return res.status(400).json({ message: 'Deal title is required' });
      }

      if (error.message.includes('foreign key constraint')) {
        return res.status(400).json({ message: 'Invalid reference data provided' });
      }

      if (error.message.includes('deals_stage_check') || error.constraint === 'deals_stage_check') {
        return res.status(400).json({ message: 'Invalid stage value. Please select a valid pipeline stage.' });
      }

      return res.status(500).json({ message: 'Failed to create deal', error: error.message });
    }
  });

  app.patch('/api/deals/:id', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const updatedDeal = await storage.updateDeal(dealId, req.body);

      await storage.createDealActivity({
        dealId: updatedDeal.id,
        userId: typeof req.user?.id === 'number' ? req.user.id : (() => { res.status(400).json({ message: 'User ID is required' }); throw new Error('User ID is required'); })(),
        type: 'update',
        content: `Deal "${updatedDeal.title}" updated`,
        metadata: { updatedBy: req.user.id, changes: req.body }
      });

      return res.status(200).json(updatedDeal);
    } catch (error) {
      console.error(`Error updating deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/deals/:id/stage', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const { stage } = req.body;

      const updatedDeal = await storage.updateDealStage(dealId, stage);

      await storage.createDealActivity({
        dealId: updatedDeal.id,
        userId: typeof req.user?.id === 'number' ? req.user.id : (() => { res.status(400).json({ message: 'User ID is required' }); throw new Error('User ID is required'); })(),
        type: 'stage_change',
        content: `Deal moved to "${stage}" stage`,
        metadata: {
          updatedBy: req.user.id,
          previousStage: updatedDeal.stage,
          newStage: stage
        }
      });

      return res.status(200).json(updatedDeal);
    } catch (error) {
      console.error(`Error updating stage for deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.patch('/api/deals/:id/stageId', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const { stageId } = req.body;
      const user = req.user as any;

      if (!stageId || isNaN(parseInt(stageId))) {
        return res.status(400).json({ message: 'Invalid stage ID' });
      }

      const stage = await storage.getPipelineStage(parseInt(stageId));
      if (!stage) {
        return res.status(404).json({ message: 'Pipeline stage not found' });
      }


      const deal = await storage.getDeal(dealId);
      if (!deal) {
        return res.status(404).json({ message: 'Deal not found' });
      }

      if (deal.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied: Deal does not belong to your company' });
      }


      if (stage.pipelineId !== deal.pipelineId) {
        return res.status(400).json({ 
          message: 'Stage does not belong to deal\'s current pipeline. Use /api/deals/:id/move-pipeline to move between pipelines.' 
        });
      }

      const updatedDeal = await storage.updateDealStageId(dealId, parseInt(stageId));

      return res.status(200).json(updatedDeal);
    } catch (error) {
      console.error(`Error updating stage ID for deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  app.get('/api/deals/:dealId/scheduled-reverts', ensureAuthenticated, async (req: any, res) => {
    try {
      const dealId = parseInt(req.params.dealId);
      const companyId = req.user.companyId;

      if (isNaN(dealId)) {
        return res.status(400).json({ error: 'Invalid deal ID' });
      }


      const deal = await storage.getDeal(dealId);
      if (!deal || deal.companyId !== companyId) {
        return res.status(404).json({ error: 'Deal not found' });
      }


      const dealReverts = await storage.getPipelineStageRevertsByDeal(dealId, companyId);


      const revertsWithLogs = await Promise.all(
        dealReverts.map(async (revert: any) => {
          const logs = await storage.getPipelineStageRevertLogs(revert.scheduleId);
          return { ...revert, logs };
        })
      );

      res.json(revertsWithLogs);
    } catch (error) {
      console.error('Error fetching scheduled reverts:', error);
      res.status(500).json({ error: 'Failed to fetch scheduled reverts' });
    }
  });

  app.delete('/api/pipeline-reverts/:scheduleId', ensureAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = req.params.scheduleId;
      const companyId = req.user.companyId;


      const revert = await storage.getPipelineStageRevert(scheduleId);
      if (!revert) {
        return res.status(404).json({ error: 'Scheduled revert not found' });
      }


      if (revert.companyId !== companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      await storage.cancelPipelineStageRevert(scheduleId);

      res.json({ success: true, message: 'Scheduled revert cancelled' });
    } catch (error) {
      console.error('Error cancelling scheduled revert:', error);
      res.status(500).json({ error: 'Failed to cancel scheduled revert' });
    }
  });

  app.get('/api/pipeline-reverts/stats', ensureAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.user.companyId;


      const stats = await storage.getPipelineStageRevertsStats(companyId);

      res.json(stats);
    } catch (error) {
      console.error('Error fetching revert stats:', error);
      res.status(500).json({ error: 'Failed to fetch revert statistics' });
    }
  });

  app.delete('/api/deals/bulk-delete', ensureAuthenticated, async (req: any, res) => {
    try {
      const { dealIds } = req.body;

      if (!Array.isArray(dealIds) || dealIds.length === 0) {
        return res.status(400).json({ message: 'dealIds must be a non-empty array' });
      }

      const results = [];
      let successCount = 0;
      let failureCount = 0;

      for (const dealId of dealIds) {
        try {
          const parsedDealId = parseInt(dealId);
          if (isNaN(parsedDealId) || parsedDealId <= 0) {
            results.push({
              dealId,
              status: 'error',
              message: 'Invalid deal ID format'
            });
            failureCount++;
            continue;
          }

          const deleteResult = await storage.deleteDeal(parsedDealId, req.user.companyId);
          if (deleteResult.success) {
            results.push({
              dealId: parsedDealId,
              status: 'success',
              message: deleteResult.reason || 'Deleted successfully'
            });
            successCount++;
          } else {
            results.push({
              dealId: parsedDealId,
              status: 'not_found',
              message: deleteResult.reason || 'Deal not found or already deleted'
            });
            failureCount++;
          }
        } catch (error: any) {
          results.push({ dealId, status: 'error', message: error.message || 'Unknown error' });
          failureCount++;
        }
      }

      return res.status(200).json({
        message: `${successCount} deals deleted successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        deletedCount: successCount,
        failedCount: failureCount,
        results
      });
    } catch (error) {
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/api/deals/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const result = await storage.deleteDeal(dealId, req.user.companyId);

      if (!result.success) {
        if (result.reason === 'Deal not found') {
          return res.status(404).json({ message: 'Deal not found or already deleted' });
        }
        return res.status(500).json({ message: 'Failed to delete deal' });
      }

      return res.status(200).json({ message: 'Deal deleted successfully' });
    } catch (error) {
      console.error(`Error deleting deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/:id/activities', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const activities = await storage.getDealActivities(dealId);

      return res.status(200).json(activities);
    } catch (error) {
      console.error(`Error fetching activities for deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/deals/:id/activities', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);
      const activity = await storage.createDealActivity({
        ...req.body,
        dealId,
        userId: req.user?.id || 1
      });

      return res.status(201).json(activity);
    } catch (error) {
      console.error(`Error creating activity for deal ${req.params.id}:`, error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/deals/:id/move-pipeline', ensureAuthenticated, async (req, res) => {
    try {
      const dealId = parseInt(req.params.id);

      const { pipelineId, stageId, targetPipelineId, targetStageId } = req.body;
      const user = req.user as any;


      const resolvedPipelineId = targetPipelineId || pipelineId;
      const resolvedStageId = targetStageId || stageId;

      if (!resolvedPipelineId) {
        return res.status(400).json({ message: 'pipelineId or targetPipelineId is required' });
      }

      if (isNaN(dealId) || isNaN(parseInt(resolvedPipelineId))) {
        return res.status(400).json({ message: 'Invalid deal ID or pipeline ID' });
      }


      const deal = await storage.getDeal(dealId);
      if (!deal) {
        return res.status(404).json({ message: 'Deal not found' });
      }


      if (deal.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied: Deal does not belong to your company' });
      }

      const parsedTargetPipelineId = parseInt(resolvedPipelineId);


      const targetPipeline = await storage.getPipeline(parsedTargetPipelineId);
      if (!targetPipeline) {
        return res.status(404).json({ message: 'Target pipeline not found' });
      }


      if (targetPipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied: Target pipeline does not belong to your company' });
      }


      let parsedTargetStageId: number;
      if (resolvedStageId) {
        const parsedStageId = parseInt(resolvedStageId);
        if (isNaN(parsedStageId)) {
          return res.status(400).json({ message: 'Invalid stage ID' });
        }


        const targetStage = await storage.getPipelineStage(parsedStageId);
        if (!targetStage) {
          return res.status(404).json({ message: 'Target stage not found' });
        }


        if (targetStage.pipelineId !== parsedTargetPipelineId) {
          return res.status(400).json({ message: 'Target stage does not belong to target pipeline' });
        }

        parsedTargetStageId = parsedStageId;
      } else {

        const stages = await storage.getPipelineStagesByPipeline(parsedTargetPipelineId);
        if (stages.length === 0) {
          return res.status(400).json({ message: 'Target pipeline has no stages' });
        }
        parsedTargetStageId = stages[0].id;
      }


      if (deal.contactId && deal.companyId) {
        const existingActiveDeal = await storage.getActiveDealByContact(
          deal.contactId,
          deal.companyId,
          parsedTargetPipelineId
        );
        if (existingActiveDeal && existingActiveDeal.id !== dealId) {
          return res.status(409).json({ 
            message: `Contact already has an active deal in this pipeline`,
            conflictingDealId: existingActiveDeal.id
          });
        }
      }


      const previousPipelineId = deal.pipelineId;
      const previousStageId = deal.stageId;


      const previousPipeline = previousPipelineId ? await storage.getPipeline(previousPipelineId) : null;


      const updatedDeal = await storage.updateDealPipelineAndStage(dealId, parsedTargetPipelineId, parsedTargetStageId);


      await storage.createDealActivity({
        dealId: dealId,
        userId: user.id,
        type: 'pipeline_change',
        content: `Deal moved from pipeline "${previousPipeline?.name || 'Unknown'}" to pipeline "${targetPipeline.name}"`,
        metadata: {
          previousPipelineId,
          newPipelineId: parsedTargetPipelineId,
          previousStageId,
          newStageId: parsedTargetStageId,
          changedBy: user.id
        }
      });

      return res.status(200).json(updatedDeal);
    } catch (error) {
      console.error(`Error moving deal ${req.params.id} to different pipeline:`, error);
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ message: error.message });
      }

      if (error instanceof Error && (
        error.message.includes('idx_unique_active_contact_deal_pipeline') ||
        error.message.includes('unique constraint') ||
        error.message.includes('DUPLICATE_DEAL_CONFLICT')
      )) {
        return res.status(409).json({ 
          message: 'Contact already has an active deal in this pipeline',
          error: error.message
        });
      }
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.post('/api/deals/bulk-move-pipeline', ensureAuthenticated, async (req, res) => {
    try {

      const { dealIds, pipelineId, stageId, targetPipelineId, targetStageId } = req.body;
      const user = req.user as any;

      if (!Array.isArray(dealIds) || dealIds.length === 0) {
        return res.status(400).json({ message: 'dealIds must be a non-empty array' });
      }


      const resolvedPipelineId = targetPipelineId || pipelineId;
      const resolvedStageId = targetStageId || stageId;

      if (!resolvedPipelineId) {
        return res.status(400).json({ message: 'pipelineId or targetPipelineId is required' });
      }

      const parsedTargetPipelineId = parseInt(resolvedPipelineId);

      if (isNaN(parsedTargetPipelineId)) {
        return res.status(400).json({ message: 'Invalid pipeline ID' });
      }


      const targetPipeline = await storage.getPipeline(parsedTargetPipelineId);
      if (!targetPipeline) {
        return res.status(404).json({ message: 'Target pipeline not found' });
      }

      if (targetPipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied: Target pipeline does not belong to your company' });
      }


      let parsedTargetStageId: number;
      if (resolvedStageId) {
        parsedTargetStageId = parseInt(resolvedStageId);
        if (isNaN(parsedTargetStageId)) {
          return res.status(400).json({ message: 'Invalid stage ID' });
        }


        const targetStage = await storage.getPipelineStage(parsedTargetStageId);
        if (!targetStage) {
          return res.status(404).json({ message: 'Target stage not found' });
        }

        if (targetStage.pipelineId !== parsedTargetPipelineId) {
          return res.status(400).json({ message: 'Target stage does not belong to target pipeline' });
        }
      } else {

        const stages = await storage.getPipelineStagesByPipeline(parsedTargetPipelineId);
        if (stages.length === 0) {
          return res.status(400).json({ message: 'Target pipeline has no stages' });
        }
        parsedTargetStageId = stages[0].id;
      }

      let movedCount = 0;
      const failures: Array<{ dealId: number; error: string }> = [];


      for (const dealId of dealIds) {
        const parsedDealId = parseInt(dealId);
        if (isNaN(parsedDealId)) {
          failures.push({ dealId: typeof dealId === 'number' ? dealId : 0, error: 'Invalid deal ID' });
          continue;
        }

        try {

          const deal = await storage.getDeal(parsedDealId);
          if (!deal) {
            failures.push({ dealId: parsedDealId, error: 'Deal not found' });
            continue;
          }

          if (deal.companyId !== user.companyId) {
            failures.push({ dealId: parsedDealId, error: 'Access denied: Deal does not belong to your company' });
            continue;
          }


          if (deal.contactId && deal.companyId) {
            const existingActiveDeal = await storage.getActiveDealByContact(
              deal.contactId,
              deal.companyId,
              parsedTargetPipelineId
            );
            if (existingActiveDeal && existingActiveDeal.id !== parsedDealId) {
              failures.push({ 
                dealId: parsedDealId, 
                error: `Contact already has an active deal in this pipeline (deal ID: ${existingActiveDeal.id})`
              });
              continue;
            }
          }


          const previousPipelineId = deal.pipelineId;
          const previousPipeline = previousPipelineId ? await storage.getPipeline(previousPipelineId) : null;


          await storage.updateDealPipelineAndStage(parsedDealId, parsedTargetPipelineId, parsedTargetStageId);


          await storage.createDealActivity({
            dealId: parsedDealId,
            userId: user.id,
            type: 'pipeline_change',
            content: `Deal moved from pipeline "${previousPipeline?.name || 'Unknown'}" to pipeline "${targetPipeline.name}"`,
            metadata: {
              previousPipelineId,
              newPipelineId: parsedTargetPipelineId,
              previousStageId: deal.stageId,
              newStageId: parsedTargetStageId,
              changedBy: user.id
            }
          });

          movedCount++;
        } catch (error) {
          console.error(`Error moving deal ${parsedDealId} to pipeline:`, error);

          if (error instanceof Error && (
            error.message.includes('idx_unique_active_contact_deal_pipeline') ||
            error.message.includes('unique constraint') ||
            error.message.includes('DUPLICATE_DEAL_CONFLICT')
          )) {
            failures.push({
              dealId: parsedDealId,
              error: 'Contact already has an active deal in this pipeline'
            });
          } else {
            failures.push({
              dealId: parsedDealId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      return res.status(200).json({
        movedCount,
        failedCount: failures.length,
        failures
      });
    } catch (error) {
      console.error('Error bulk moving deals to pipeline:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.put('/api/deals/bulk-move', ensureAuthenticated, async (req, res) => {
    try {
      const { dealIds, stageId } = req.body;

      if (!Array.isArray(dealIds) || dealIds.length === 0) {
        return res.status(400).json({ message: 'dealIds must be a non-empty array' });
      }

      if (!stageId || typeof stageId !== 'number') {
        return res.status(400).json({ message: 'stageId must be a valid number' });
      }


      const updatePromises = dealIds.map(dealId => {
        const parsedDealId = parseInt(dealId);
        if (isNaN(parsedDealId)) {
          throw new Error(`Invalid deal ID: ${dealId}`);
        }
        return storage.updateDealStageId(parsedDealId, stageId);
      });

      const updatedDeals = await Promise.all(updatePromises);

      return res.status(200).json({
        message: `${dealIds.length} deals moved successfully`,
        updatedDeals
      });
    } catch (error) {
      console.error('Error bulk moving deals:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });



  app.put('/api/deals/bulk-assign', ensureAuthenticated, async (req, res) => {
    try {
      const { dealIds, assignedToUserId } = req.body;

      if (!Array.isArray(dealIds) || dealIds.length === 0) {
        return res.status(400).json({ message: 'dealIds must be a non-empty array' });
      }

      if (!assignedToUserId || typeof assignedToUserId !== 'number') {
        return res.status(400).json({ message: 'assignedToUserId must be a valid number' });
      }


      const updatePromises = dealIds.map(dealId => {
        const parsedDealId = parseInt(dealId);
        if (isNaN(parsedDealId)) {
          throw new Error(`Invalid deal ID: ${dealId}`);
        }
        return storage.updateDeal(parsedDealId, { assignedToUserId });
      });

      const updatedDeals = await Promise.all(updatePromises);

      return res.status(200).json({
        message: `${dealIds.length} deals assigned successfully`,
        updatedDeals
      });
    } catch (error) {
      console.error('Error bulk assigning deals:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });




  const dealsUploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(process.cwd(), 'uploads', 'deals');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `deals-import-${timestamp}-${file.originalname}`;
      cb(null, filename);
    }
  });

  const dealsUpload = multer({
    storage: dealsUploadStorage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['text/csv', 'application/json', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      const allowedExtensions = ['.csv', '.json', '.xlsx', '.xls'];

      if (allowedTypes.includes(file.mimetype) || allowedExtensions.some(ext => file.originalname.endsWith(ext))) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV, JSON, and Excel files are allowed.'));
      }
    }
  });

  app.post('/api/deals/import', ensureAuthenticated, dealsUpload.single('file'), async (req: any, res) => {
    try {
      const user = req.user as any;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      let dealsData: any[] = [];
      const filePath = file.path;

      try {
        if (file.originalname.endsWith('.json')) {

          const fileContent = fs.readFileSync(filePath, 'utf8');
          dealsData = JSON.parse(fileContent);

          if (!Array.isArray(dealsData)) {
            throw new Error('JSON file must contain an array of deals');
          }
        } else if (file.originalname.endsWith('.csv')) {

          const fileContent = fs.readFileSync(filePath, 'utf8');
          const lines = fileContent.split('\n');
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

          dealsData = lines.slice(1)
            .filter(line => line.trim())
            .map(line => {
              const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
              const deal: any = {};
              headers.forEach((header, index) => {
                deal[header] = values[index] || '';
              });
              return deal;
            });
        } else {
          return res.status(400).json({ message: 'Unsupported file format' });
        }


        const results = { success: 0, failed: 0, errors: [] as any[] };
        const teamMembers = await storage.getAllTeamMembers();

        for (let i = 0; i < dealsData.length; i++) {
          try {
            const dealData = dealsData[i];


            let targetPipelineId = dealData.pipelineId;

            if (!targetPipelineId) {

              const pipelines = await storage.getPipelinesByCompany(user.companyId);
              const defaultPipeline = pipelines.find(p => p.isDefault === true);
              targetPipelineId = defaultPipeline?.id;
              
              if (!targetPipelineId) {
                throw new Error('No default pipeline found for company');
              }
            }


            const pipeline = await storage.getPipeline(parseInt(targetPipelineId.toString()));
            if (!pipeline || pipeline.companyId !== user.companyId) {
              throw new Error('Invalid pipeline or pipeline does not belong to your company');
            }


            const pipelineStages = await storage.getPipelineStagesByCompany(user.companyId, parseInt(targetPipelineId.toString()));

            let stageId = dealData.stageId;
            if (dealData.stage && !stageId) {
              const stage = pipelineStages.find(s => s.name.toLowerCase() === dealData.stage.toLowerCase());
              stageId = stage?.id || pipelineStages[0]?.id; // Default to first stage of target pipeline if not found
            }

            if (stageId) {
              const stageIdNum = parseInt(stageId.toString());
              if (!isNaN(stageIdNum)) {
                const stageExists = pipelineStages.find(s => s.id === stageIdNum);
                if (!stageExists) {
                  stageId = pipelineStages[0]?.id || null;
                } else {
                  stageId = stageIdNum;
                }
              } else {
                stageId = pipelineStages[0]?.id || null;
              }
            } else {
              stageId = pipelineStages[0]?.id || null;
            }


            let assignedToUserId = dealData.assignedToUserId;
            if (dealData.assignedToEmail && !assignedToUserId) {
              const member = teamMembers.find((m: any) => m.email === dealData.assignedToEmail);
              assignedToUserId = member?.id;
            }


            let contactId = dealData.contactId;
            if (!contactId && dealData.contactEmail) {

              const contactsResult = await storage.getContacts({ search: dealData.contactEmail });
              const existingContact = contactsResult.contacts.find(c => c.email === dealData.contactEmail);
              if (existingContact) {
                contactId = existingContact.id;
              } else {

                const newContact = await storage.createContact({
                  name: dealData.contactName || 'Imported Contact',
                  email: dealData.contactEmail,
                  phone: dealData.contactPhone || null,
                  companyId: user.companyId || null,
                  createdBy: user.id
                });
                contactId = newContact.id;
              }
            }

            if (!contactId) {
              throw new Error('Contact information is required (contactId or contactEmail)');
            }


            let tags: string[] | null = null;
            if (dealData.tags) {
              if (Array.isArray(dealData.tags)) {
                tags = dealData.tags.filter((tag: unknown): tag is string =>
                  typeof tag === 'string' && tag.trim().length > 0
                );
              } else if (typeof dealData.tags === 'string' && dealData.tags.trim()) {

                tags = dealData.tags
                  .split(',')
                  .map((tag: string): string => tag.trim())
                  .filter((tag: string): boolean => tag.length > 0);
              }
            }


            const newDeal = {
              title: dealData.title || `Imported Deal ${i + 1}`,
              contactId: parseInt(contactId.toString()),
              description: dealData.description || null,
              value: dealData.value ? parseFloat(dealData.value.toString()) : null,
              priority: (dealData.priority as 'low' | 'medium' | 'high') || 'medium',
              assignedToUserId: assignedToUserId ? parseInt(assignedToUserId.toString()) : null,
              pipelineId: parseInt(targetPipelineId.toString()),
              stageId: stageId,
              companyId: user.companyId ? parseInt(user.companyId.toString()) : null,
              tags: tags,
              status: 'active'
            };

            await storage.createDeal(newDeal);
            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              row: i + 1,
              error: error instanceof Error ? error.message : 'Unknown error',
              data: dealsData[i]
            });
          }
        }


        fs.unlinkSync(filePath);

        return res.json(results);
      } catch (parseError) {

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        return res.status(400).json({
          message: 'Failed to parse file: ' + (parseError instanceof Error ? parseError.message : 'Unknown error')
        });
      }
    } catch (error) {
      console.error('Error importing deals:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/deals/template', ensureAuthenticated, async (req, res) => {
    try {

      const template = 'title,description,value,priority,contactId,assignedToUserId,pipelineId,stageId\n' +
        'Sample Deal,Deal description,1000,medium,1,1,1,1';

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="deals_template.csv"');
      return res.status(200).send(template);
    } catch (error) {
      console.error('Error generating template:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });


  app.get('/api/debug/pipeline-stages', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;


      const allStages = await storage.getPipelineStages();


      const companyStages = user.companyId ? await storage.getPipelineStagesByCompany(user.companyId) : [];


      const company = user.companyId ? await storage.getCompany(user.companyId) : null;


      const allCompanies = await storage.getAllCompanies();


      const dbUser = await storage.getUser(user.id);


      res.json({
        user: { id: user.id, companyId: user.companyId, isSuperAdmin: user.isSuperAdmin },
        dbUser: dbUser ? { id: dbUser.id, companyId: dbUser.companyId, email: dbUser.email } : null,
        allStages: allStages.length,
        companyStages: companyStages.length,
        company: company ? { id: company.id, name: company.name, active: company.active } : null,
        allCompanies: allCompanies.map((c: any) => ({ id: c.id, name: c.name, active: c.active })),
        stages: companyStages
      });
    } catch (error: any) {
      console.error('Error in debug endpoint:', error);
      res.status(500).json({ message: 'Debug failed', error: error.message });
    }
  });

  app.post('/api/debug/fix-user-company', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId } = req.body;



      if (!companyId) {
        return res.status(400).json({ message: 'Company ID is required' });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: 'Company not found' });
      }

      const updatedUser = await storage.updateUser(user.id, { companyId });


      res.json({
        message: 'User company association updated successfully',
        user: { id: updatedUser.id, companyId: updatedUser.companyId },
        company: { id: company.id, name: company.name }
      });
    } catch (error: any) {
      console.error('Error fixing user company association:', error);
      res.status(500).json({ message: 'Failed to fix user company association', error: error.message });
    }
  });

  app.post('/api/debug/create-default-stages', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId } = req.body;

      const targetCompanyId = companyId || user.companyId;

      if (!targetCompanyId) {
        return res.status(400).json({ message: 'Company ID is required (either in body or user must belong to a company)' });
      }


      const pipelines = await getCachedPipelinesByCompany(targetCompanyId);
      let defaultPipeline = pipelines.find(p => p.isDefault === true);


      if (!defaultPipeline) {
        defaultPipeline = await storage.createPipeline({
          companyId: targetCompanyId,
          name: 'Sales Pipeline',
          description: 'Default sales pipeline',
          icon: 'trending-up',
          color: '#3a86ff',
          isDefault: true,
          isTemplate: false,
          templateCategory: null,
          orderNum: 1
        });
      }

      const defaultStages = [
        { name: 'Lead', color: '#333235', order: 1 },
        { name: 'Qualified', color: '#8B5CF6', order: 2 },
        { name: 'Contacted', color: '#EC4899', order: 3 },
        { name: 'Demo Scheduled', color: '#F59E0B', order: 4 },
        { name: 'Proposal', color: '#10B981', order: 5 },
        { name: 'Negotiation', color: '#3B82F6', order: 6 },
        { name: 'Closed Won', color: '#059669', order: 7 },
        { name: 'Closed Lost', color: '#DC2626', order: 8 }
      ];

      const createdStages = [];
      for (const stageData of defaultStages) {
        const stage = await storage.createPipelineStage({
          companyId: targetCompanyId,
          pipelineId: defaultPipeline.id,
          ...stageData
        });
        createdStages.push(stage);

      }

      res.json({
        message: 'Default stages created successfully',
        stages: createdStages
      });
    } catch (error: any) {
      console.error('Error creating default stages:', error);
      res.status(500).json({ message: 'Failed to create default stages', error: error.message });
    }
  });

  app.get('/api/pipeline/stages', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const pipelineId = req.query.pipelineId ? parseInt(req.query.pipelineId as string) : undefined;

      if (!user.companyId) {
        return res.json([]);
      }

      let stages: PipelineStage[];
      if (pipelineId) {

        const pipeline = await storage.getPipeline(pipelineId);
        if (!pipeline) {
          return res.status(404).json({ message: 'Pipeline not found' });
        }
        if (pipeline.companyId !== user.companyId) {
          return res.status(403).json({ message: 'You do not have permission to access this pipeline' });
        }
        stages = await storage.getPipelineStagesByPipeline(pipelineId);
      } else {
        stages = await storage.getPipelineStagesByCompany(user.companyId);
      }

      res.json(stages);
    } catch (error) {
      console.error('Error fetching pipeline stages:', error);
      res.status(500).json({ message: 'Failed to fetch pipeline stages' });
    }
  });

  app.post('/api/pipeline/stages', ensureAuthenticated, async (req, res) => {
    try {
      const { name, color, order, pipelineId } = req.body;
      const user = req.user as any;

      if (!name) {
        return res.status(400).json({ message: 'Stage name is required' });
      }

      if (!pipelineId) {
        return res.status(400).json({ message: 'pipelineId is required' });
      }

      if (!user.companyId) {
        console.error('❌ User has no companyId:', user);
        return res.status(400).json({ message: 'User must belong to a company to create stages' });
      }


      const pipeline = await storage.getPipeline(pipelineId);
      if (!pipeline) {
        return res.status(404).json({ message: 'Pipeline not found' });
      }
      if (pipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to create stages in this pipeline' });
      }

      const newStage = await storage.createPipelineStage({
        pipelineId,
        companyId: user.companyId,
        name,
        color: color || '#3a86ff',
        order: order || 0
      });


      const { invalidatePipelineStageCache, invalidatePipelineCache } = await import('./utils/pipeline-cache');
      invalidatePipelineStageCache(user.companyId);
      invalidatePipelineCache(user.companyId);

      res.status(201).json(newStage);
    } catch (error) {
      console.error('Error creating pipeline stage:', error);
      res.status(500).json({ message: 'Failed to create pipeline stage' });
    }
  });

  app.put('/api/pipeline/stages/:id', ensureAuthenticated, async (req, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const { name, color, order, pipelineId } = req.body;
      const user = req.user as any;

      const stage = await storage.getPipelineStage(stageId);

      if (!stage) {
        return res.status(404).json({ message: 'Pipeline stage not found' });
      }

      if (stage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to update this stage' });
      }


      if (pipelineId !== undefined && pipelineId !== stage.pipelineId) {
        return res.status(400).json({ message: 'Cannot change pipelineId after stage creation' });
      }

      const updatedStage = await storage.updatePipelineStage(stageId, {
        name: name !== undefined ? name : stage.name,
        color: color !== undefined ? color : stage.color,
        order: order !== undefined ? order : stage.order
      });


      const { invalidatePipelineStageCache, invalidatePipelineCache } = await import('./utils/pipeline-cache');
      invalidatePipelineStageCache(user.companyId);
      invalidatePipelineCache(user.companyId);

      res.json(updatedStage);
    } catch (error) {
      console.error('Error updating pipeline stage:', error);
      res.status(500).json({ message: 'Failed to update pipeline stage' });
    }
  });

  app.delete('/api/pipeline/stages/:id', ensureAuthenticated, async (req, res) => {
    try {
      const stageId = parseInt(req.params.id);
      const moveToStageId = req.query.moveToStageId ? parseInt(req.query.moveToStageId as string) : undefined;
      const user = req.user as any;

      const stage = await storage.getPipelineStage(stageId);

      if (!stage) {
        return res.status(404).json({ message: 'Pipeline stage not found' });
      }

      if (stage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to delete this stage' });
      }

      if (moveToStageId) {
        const targetStage = await storage.getPipelineStage(moveToStageId);
        if (!targetStage) {
          return res.status(400).json({ message: 'Target stage not found' });
        }

        if (targetStage.companyId !== user.companyId) {
          return res.status(403).json({ message: 'Target stage does not belong to your company' });
        }

        if (moveToStageId === stageId) {
          return res.status(400).json({ message: 'Cannot move deals to the same stage being deleted' });
        }


        if (targetStage.pipelineId !== stage.pipelineId) {
          return res.status(400).json({ message: 'Cannot move deals to a stage in a different pipeline' });
        }
      }

      const success = await storage.deletePipelineStage(stageId, moveToStageId);

      if (!success) {
        return res.status(500).json({ message: 'Failed to delete pipeline stage' });
      }


      const { invalidatePipelineStageCache, invalidatePipelineCache } = await import('./utils/pipeline-cache');
      invalidatePipelineStageCache(user.companyId);
      invalidatePipelineCache(user.companyId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting pipeline stage:', error);
      res.status(500).json({ message: 'Failed to delete pipeline stage' });
    }
  });

  app.post('/api/pipeline/stages/reorder', ensureAuthenticated, async (req, res) => {
    try {
      const { stageIds } = req.body;

      if (!Array.isArray(stageIds)) {
        return res.status(400).json({ message: 'stageIds must be an array' });
      }


      if (stageIds.length > 0) {
        const firstStage = await storage.getPipelineStage(stageIds[0]);
        if (!firstStage) {
          return res.status(400).json({ message: 'Invalid stage IDs provided' });
        }
        const pipelineId = firstStage.pipelineId;

        for (const stageId of stageIds) {
          const stage = await storage.getPipelineStage(stageId);
          if (!stage) {
            return res.status(400).json({ message: `Stage with ID ${stageId} not found` });
          }
          if (stage.pipelineId !== pipelineId) {
            return res.status(400).json({ message: 'Cannot reorder stages across different pipelines' });
          }
        }
      }

      await storage.reorderPipelineStages(stageIds);

      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering pipeline stages:', error);
      res.status(500).json({ message: 'Failed to reorder pipeline stages' });
    }
  });


  app.get('/api/pipelines', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!user.companyId) {
        return res.json([]);
      }

      const templateFilter = req.query.template === 'true';
      const includeTemplates = req.query.includeTemplates === 'true';
      let pipelines = await storage.getPipelinesByCompany(user.companyId);

      if (templateFilter) {
        pipelines = pipelines.filter(p => p.isTemplate === true);
      }


      if (includeTemplates) {
        const allPipelines = await storage.getPipelines();
        const templatePipelines = allPipelines.filter(p => p.isTemplate === true);

        const pipelineMap = new Map<number, any>();
        pipelines.forEach(p => pipelineMap.set(p.id, p));
        templatePipelines.forEach(p => {
          if (!pipelineMap.has(p.id)) {
            pipelineMap.set(p.id, p);
          }
        });
        pipelines = Array.from(pipelineMap.values());
      }

      res.json(pipelines);
    } catch (error) {
      console.error('Error fetching pipelines:', error);
      res.status(500).json({ message: 'Failed to fetch pipelines' });
    }
  });

  app.post('/api/pipelines', ensureAuthenticated, async (req, res) => {
    try {
      const { name, description, icon, color, isDefault, isTemplate, templateCategory, orderNum } = req.body;
      const user = req.user as any;

      if (!name) {
        return res.status(400).json({ message: 'Pipeline name is required' });
      }

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must belong to a company to create pipelines' });
      }

      const newPipeline = await storage.createPipeline({
        companyId: user.companyId,
        name,
        description: description || null,
        icon: icon || null,
        color: color || null,
        isDefault: isDefault || false,
        isTemplate: isTemplate || false,
        templateCategory: templateCategory || null,
        orderNum: orderNum || undefined
      });


      const { invalidatePipelineCache, invalidatePipelineStageCache } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);
      invalidatePipelineStageCache(user.companyId);

      res.status(201).json(newPipeline);
    } catch (error: any) {
      console.error('Error creating pipeline:', error);
      if (error.isDuplicateName || error.message === 'Pipeline name already exists') {
        return res.status(409).json({ message: 'Pipeline name already exists' });
      }
      res.status(500).json({ message: 'Failed to create pipeline' });
    }
  });

  app.get('/api/pipelines/:id', ensureAuthenticated, async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      const user = req.user as any;

      if (isNaN(pipelineId)) {
        return res.status(400).json({ message: 'Invalid pipeline ID' });
      }

      const result = await storage.getPipelineWithStages(pipelineId);

      if (!result) {
        return res.status(404).json({ message: 'Pipeline not found' });
      }

      if (result.pipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to access this pipeline' });
      }

      res.json(result);
    } catch (error) {
      console.error('Error fetching pipeline:', error);
      res.status(500).json({ message: 'Failed to fetch pipeline' });
    }
  });

  app.put('/api/pipelines/reorder', ensureAuthenticated, async (req, res) => {
    try {
      const { pipelines } = req.body;
      const user = req.user as any;


      if (!Array.isArray(pipelines)) {
        return res.status(400).json({ message: 'Request body must contain a pipelines array' });
      }

      if (pipelines.length === 0) {
        return res.status(400).json({ message: 'Pipelines array cannot be empty' });
      }


      const pipelineIds = pipelines.map((p: any) => {
        if (typeof p.id !== 'number' || isNaN(p.id)) {
          throw new Error('Invalid pipeline ID in request');
        }
        return p.id;
      });


      const uniqueIds = new Set(pipelineIds);
      if (uniqueIds.size !== pipelineIds.length) {
        return res.status(400).json({ message: 'Duplicate pipeline IDs found in request' });
      }


      await storage.reorderPipelines(user.companyId, pipelineIds);


      const { invalidatePipelineCache } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error reordering pipelines:', error);
      const statusCode = error.message?.includes('Invalid') || error.message?.includes('Missing') || error.message?.includes('Duplicate') ? 400 : 500;
      res.status(statusCode).json({ message: error.message || 'Failed to reorder pipelines' });
    }
  });

  app.put('/api/pipelines/:id', ensureAuthenticated, async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      const { name, description, icon, color, orderNum, isDefault } = req.body;
      const user = req.user as any;

      if (isNaN(pipelineId)) {
        return res.status(400).json({ message: 'Invalid pipeline ID' });
      }

      const existingPipeline = await storage.getPipeline(pipelineId);

      if (!existingPipeline) {
        return res.status(404).json({ message: 'Pipeline not found' });
      }

      if (existingPipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to update this pipeline' });
      }

      const updates: Partial<InsertPipeline> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (icon !== undefined) updates.icon = icon;
      if (color !== undefined) updates.color = color;
      if (orderNum !== undefined) updates.orderNum = orderNum;
      if (isDefault !== undefined) updates.isDefault = isDefault;

      const updatedPipeline = await storage.updatePipeline(pipelineId, updates);


      const { invalidatePipelineCache } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);

      res.json(updatedPipeline);
    } catch (error: any) {
      console.error('Error updating pipeline:', error);
      if (error.isDuplicateName || error.message === 'Pipeline name already exists') {
        return res.status(409).json({ message: 'Pipeline name already exists' });
      }
      res.status(500).json({ message: 'Failed to update pipeline' });
    }
  });

  app.delete('/api/pipelines/:id', ensureAuthenticated, async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      const moveDealsToStageId = req.query.moveDealsToStageId ? parseInt(req.query.moveDealsToStageId as string) : undefined;
      const moveDealsToPipelineId = req.query.moveDealsToPipelineId ? parseInt(req.query.moveDealsToPipelineId as string) : undefined;
      const user = req.user as any;

      if (isNaN(pipelineId)) {
        return res.status(400).json({ message: 'Invalid pipeline ID' });
      }

      const pipeline = await storage.getPipeline(pipelineId);

      if (!pipeline) {
        return res.status(404).json({ message: 'Pipeline not found' });
      }

      if (pipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to delete this pipeline' });
      }


      const allPipelines = await storage.getPipelinesByCompany(user.companyId);
      if (allPipelines.length === 1) {
        return res.status(400).json({ message: 'Cannot delete the only pipeline for your company' });
      }

      let resolvedStageId: number | undefined = moveDealsToStageId;


      if (moveDealsToPipelineId) {
        if (isNaN(moveDealsToPipelineId)) {
          return res.status(400).json({ message: 'Invalid moveDealsToPipelineId' });
        }

        const targetPipeline = await storage.getPipeline(moveDealsToPipelineId);
        if (!targetPipeline) {
          return res.status(404).json({ message: 'Target pipeline not found' });
        }

        if (targetPipeline.companyId !== user.companyId) {
          return res.status(403).json({ message: 'Target pipeline does not belong to your company' });
        }

        if (targetPipeline.id === pipelineId) {
          return res.status(400).json({ message: 'Target pipeline must be different from the pipeline being deleted' });
        }


        const stages = await storage.getPipelineStagesByPipeline(moveDealsToPipelineId);
        if (stages.length === 0) {
          return res.status(400).json({ message: 'Target pipeline has no stages' });
        }
        resolvedStageId = stages[0].id;
      } else if (!moveDealsToStageId) {

        const defaultPipeline = await storage.getDefaultPipelineForCompany(user.companyId);
        if (!defaultPipeline) {
          return res.status(400).json({ message: 'No default pipeline found for reassignment' });
        }

        if (defaultPipeline.id === pipelineId) {
          return res.status(400).json({ message: 'Cannot delete default pipeline without specifying a target pipeline' });
        }


        const stages = await storage.getPipelineStagesByPipeline(defaultPipeline.id);
        if (stages.length === 0) {
          return res.status(400).json({ message: 'Default pipeline has no stages' });
        }
        resolvedStageId = stages[0].id;
      } else {

        const targetStage = await storage.getPipelineStage(moveDealsToStageId);
        if (!targetStage) {
          return res.status(400).json({ message: 'Target stage not found' });
        }

        if (targetStage.companyId !== user.companyId) {
          return res.status(403).json({ message: 'Target stage does not belong to your company' });
        }


        const targetPipeline = await storage.getPipeline(targetStage.pipelineId!);
        if (!targetPipeline || targetPipeline.id === pipelineId) {
          return res.status(400).json({ message: 'Target stage must belong to a different pipeline' });
        }
      }

      const success = await storage.deletePipeline(pipelineId, resolvedStageId);

      if (!success) {
        return res.status(500).json({ message: 'Failed to delete pipeline' });
      }


      const { invalidatePipelineCache, invalidateAllPipelineStageCaches } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);
      invalidateAllPipelineStageCaches();

      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting pipeline:', error);
      res.status(500).json({ message: 'Failed to delete pipeline' });
    }
  });

  app.post('/api/pipelines/:id/duplicate', ensureAuthenticated, async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      const { newName } = req.body;
      const user = req.user as any;

      if (isNaN(pipelineId)) {
        return res.status(400).json({ message: 'Invalid pipeline ID' });
      }

      if (!newName) {
        return res.status(400).json({ message: 'newName is required' });
      }

      const sourcePipeline = await storage.getPipeline(pipelineId);

      if (!sourcePipeline) {
        return res.status(404).json({ message: 'Pipeline not found' });
      }

      if (sourcePipeline.companyId !== user.companyId) {
        return res.status(403).json({ message: 'You do not have permission to duplicate this pipeline' });
      }

      const duplicatedPipeline = await storage.duplicatePipeline(pipelineId, newName);


      const { invalidatePipelineCache, invalidatePipelineStageCache } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);
      invalidatePipelineStageCache(user.companyId);

      res.status(201).json(duplicatedPipeline);
    } catch (error: any) {
      console.error('Error duplicating pipeline:', error);
      if (error.isDuplicateName || error.message === 'Pipeline name already exists') {
        return res.status(409).json({ message: 'Pipeline name already exists' });
      }
      res.status(500).json({ message: 'Failed to duplicate pipeline' });
    }
  });


  app.get('/api/pipeline-templates', async (req, res) => {
    try {
      const { PIPELINE_TEMPLATES } = await import('@shared/pipeline-templates');
      return res.status(200).json(PIPELINE_TEMPLATES);
    } catch (error) {
      console.error('Error fetching pipeline templates:', error);
      res.status(500).json({ message: 'Failed to fetch pipeline templates' });
    }
  });


  app.post('/api/pipelines/from-template/:templateId', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { templateId } = req.params;
      const { customName, description, icon, color } = req.body;


      if (!user.companyId) {
        return res.status(400).json({ message: 'User must belong to a company to create pipelines' });
      }


      const { getTemplateById } = await import('@shared/pipeline-templates');
      const template = getTemplateById(templateId);

      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }


      const result = await storage.createPipelineFromTemplate(
        templateId,
        user.companyId,
        customName || template.name,
        description,
        icon,
        color
      );


      const { invalidatePipelineCache, invalidatePipelineStageCache } = await import('./utils/pipeline-cache');
      invalidatePipelineCache(user.companyId);
      invalidatePipelineStageCache(user.companyId);

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error creating pipeline from template:', error);
      if (error.isDuplicateName || error.message === 'Pipeline name already exists') {
        return res.status(409).json({ message: 'Pipeline name already exists' });
      }
      if (error.message === 'Template not found') {
        res.status(404).json({ message: error.message });
      } else if (error.message.includes('validation')) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Failed to create pipeline from template' });
      }
    }
  });

  app.get('/api/team-members', ensureAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      let users;
      if (user.isSuperAdmin) {
        users = await storage.getActiveTeamMembers();
      } else {
        users = await storage.getActiveTeamMembersByCompany(user.companyId);
      }

      const safeUsers = users.map(member => {
        const { password, ...safeUser } = member;
        return safeUser;
      });

      return res.status(200).json(safeUsers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.get('/api/search', ensureAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 5;

      if (!query || query.trim().length < 2) {
        return res.json({
          conversations: [],
          contacts: [],
          templates: []
        });
      }

      const companyId = user.isSuperAdmin ? undefined : user.companyId;
      const searchTerm = query.trim();

      const conversationsResult = await storage.getConversations({
        companyId,
        page: 1,
        limit,
        search: searchTerm
      });

      const conversationsWithContacts = await Promise.all(
        conversationsResult.conversations.map(async (conversation) => {
          const contact = conversation.contactId ? await storage.getContact(conversation.contactId) : null;
          const messages = await storage.getMessagesByConversation(conversation.id);
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          return {
            ...conversation,
            contact,
            lastMessage: lastMessage ? {
              content: lastMessage.content,
              createdAt: lastMessage.createdAt
            } : null
          };
        })
      );

      const contactsResult = await storage.getContacts({
        companyId,
        page: 1,
        limit,
        search: searchTerm
      });

      let templates: any[] = [];
      if (companyId) {
        try {
          const { CampaignService } = await import('./services/campaignService');
          const campaignService = new CampaignService();
          const allTemplates = await campaignService.getTemplates(companyId, {});

          templates = allTemplates.filter(template =>
            template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            template.description?.toLowerCase().includes(searchTerm.toLowerCase())
          ).slice(0, limit);
        } catch (error) {
          console.error('Error searching templates:', error);
          templates = [];
        }
      }

      res.json({
        conversations: conversationsWithContacts,
        contacts: contactsResult.contacts,
        templates
      });
    } catch (error) {
      console.error('Error performing global search:', error);
      res.status(500).json({ message: 'Search failed' });
    }
  });

  app.get('/api/analytics/overview', ensureAuthenticated, async (req: any, res) => {
    try {
      const { period = 'last7days', from, to } = req.query;
      const user = req.user as any;

      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      let startDate = new Date();
      let endDate = new Date();


      if (from && to) {
        try {
          startDate = new Date(from);
          endDate = new Date(to);


          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ message: 'Invalid date format' });
          }

          if (startDate > endDate) {
            return res.status(400).json({ message: 'Start date must be before end date' });
          }


          const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysDiff > 730) {
            return res.status(400).json({ message: 'Date range cannot exceed 2 years' });
          }
        } catch (error) {
          return res.status(400).json({ message: 'Invalid date format' });
        }
      } else {

        const now = new Date();
        switch (period) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;
          case 'yesterday':
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
            endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
            break;
          case 'thisWeek':
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
            startDate = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate(), 0, 0, 0, 0);
            endDate = now;
            break;
          case 'lastWeek':
            const lastWeekEnd = new Date(now);
            lastWeekEnd.setDate(now.getDate() - now.getDay());
            const lastWeekStart = new Date(lastWeekEnd);
            lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
            startDate = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate(), 0, 0, 0, 0);
            endDate = new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate(), 23, 59, 59, 999);
            break;
          case 'last7days':
          case '7days':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
            endDate = now;
            break;
          case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            endDate = now;
            break;
          case 'lastMonth':
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1, 0, 0, 0, 0);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            break;
          case 'last30days':
          case '30days':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 30);
            endDate = now;
            break;
          case 'last90days':
          case '90days':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 90);
            endDate = now;
            break;
          case 'thisYear':
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            endDate = now;
            break;
          case 'lastYear':
            startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
            endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            break;
          default:
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
            endDate = now;
        }
      }



      const conversationsCount = await storage.getConversationsCountByCompanyAndDateRange(user.companyId, startDate, endDate);
      const contactsCount = await storage.getContactsCountByCompanyAndDateRange(user.companyId, startDate, endDate);
      const messagesCount = await storage.getMessagesCountByCompanyAndDateRange(user.companyId, startDate, endDate);

      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate.getTime() - (periodDays * 24 * 60 * 60 * 1000));
      const prevEndDate = new Date(startDate);


      const prevConversationsCount = await storage.getConversationsCountByCompanyAndDateRange(user.companyId, prevStartDate, prevEndDate);
      const prevContactsCount = await storage.getContactsCountByCompanyAndDateRange(user.companyId, prevStartDate, prevEndDate);
      const prevMessagesCount = await storage.getMessagesCountByCompanyAndDateRange(user.companyId, prevStartDate, prevEndDate);

      const conversationsGrowth = conversationsCount > 0 ?
        ((conversationsCount - prevConversationsCount) / prevConversationsCount * 100) : 0;
      const contactsGrowth = contactsCount > 0 ?
        ((contactsCount - prevContactsCount) / prevContactsCount * 100) : 0;
      const messagesGrowth = messagesCount > 0 ?
        ((messagesCount - prevMessagesCount) / prevMessagesCount * 100) : 0;

      const totalMessages = messagesCount;
      const responseRate = totalMessages > 0 ? Math.min(95, 85 + Math.random() * 10) : 0;
      const prevResponseRate = responseRate * (0.95 + Math.random() * 0.1);
      const responseRateGrowth = prevResponseRate > 0 ?
        ((responseRate - prevResponseRate) / prevResponseRate * 100) : 0;


      const channelConnections = await storage.getChannelConnectionsByCompany(user.companyId);
      const channelDistribution = channelConnections.reduce((acc: { [key: string]: number }, conn) => {
        const type = conn.channelType;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      const channelDistributionData = Object.entries(channelDistribution).map(([name, value]) => {
        const total = Object.values(channelDistribution).reduce((sum, val) => sum + val, 0);
        return {
          name,
          value,
          percentage: total > 0 ? Math.round((value / total) * 100) : 0
        };
      });


      const conversationsByDay = await storage.getConversationsByDayByCompanyAndDateRange(user.companyId, startDate, endDate);


      const messagesByChannel = await storage.getMessagesByChannelByCompany(user.companyId);


      const queryMetadata = {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: periodDays,
          preset: period
        },
        generatedAt: new Date().toISOString(),
        companyId: user.companyId
      };

      res.json({
        overview: {
          conversationsCount,
          contactsCount,
          messagesCount,
          responseRate: Math.round(responseRate * 10) / 10,
          conversationsGrowth: Math.round(conversationsGrowth * 10) / 10,
          contactsGrowth: Math.round(contactsGrowth * 10) / 10,
          messagesGrowth: Math.round(messagesGrowth * 10) / 10,
          responseRateGrowth: Math.round(responseRateGrowth * 10) / 10
        },
        conversationsByDay,
        channelDistribution: channelDistributionData,
        messagesByChannel,
        metadata: queryMetadata
      });
    } catch (error) {
      console.error('Error fetching analytics data:', error);


      if (error instanceof Error) {
        if (error.message.includes('date')) {
          return res.status(400).json({ message: 'Invalid date parameters provided' });
        }
        if (error.message.includes('company')) {
          return res.status(403).json({ message: 'Access denied to company data' });
        }
      }

      res.status(500).json({
        message: 'Failed to fetch analytics data',
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  app.get('/api/analytics/export', ensureAuthenticated, async (req: any, res) => {
    try {
      const { period = '7days', from, to } = req.query;
      const user = req.user as any;


      if (!user.companyId) {
        return res.status(400).json({ message: 'User must be associated with a company' });
      }

      let startDate = new Date();
      let endDate = new Date();

      if (from && to) {
        startDate = new Date(from);
        endDate = new Date(to);
      } else {
        switch (period) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
          case 'yesterday':
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(endDate.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
            break;
          case '7days':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case '30days':
            startDate.setDate(startDate.getDate() - 30);
            break;
          case '90days':
            startDate.setDate(startDate.getDate() - 90);
            break;
          default:
            startDate.setDate(startDate.getDate() - 7);
        }
      }


      const conversationsCount = await storage.getConversationsCountByCompany(user.companyId);
      const contactsData = await storage.getContacts({ companyId: user.companyId });
      const contactsCount = contactsData.total;
      const messagesCount = await storage.getMessagesCountByCompany(user.companyId);
      const channelDistribution = await storage.getChannelConnectionsByCompany(user.companyId);
      const conversationsByDay = await storage.getConversationsByDayByCompany(user.companyId, 7);


      const analyticsData = {
        overview: {
          conversationsCount,
          contactsCount,
          messagesCount,
          responseRate: 92
        },
        conversationsByDay,
        channelDistribution: channelDistribution.map(conn => ({
          name: conn.channelType,
          value: 1,
          percentage: 25
        }))
      };

      const csvRows = [
        ['Metric', 'Value', 'Percentage'],
        ['Total Conversations', analyticsData.overview?.conversationsCount || 0, ''],
        ['Total Contacts', analyticsData.overview?.contactsCount || 0, ''],
        ['Total Messages', analyticsData.overview?.messagesCount || 0, ''],
        ['Response Rate (%)', analyticsData.overview?.responseRate || 0, ''],
        ['', '', ''],
        ['Channel Distribution', '', ''],
        ...(analyticsData.channelDistribution || []).map((channel: any) => [
          channel.name || 'Unknown',
          channel.value || 0,
          `${channel.percentage || 0}%`
        ]),
        ['', '', ''],
        ['Daily Conversations', '', ''],
        ['Date', 'WhatsApp Official', 'WhatsApp Unofficial', 'Messenger', 'Instagram', 'Total'],
        ...(analyticsData.conversationsByDay || []).map((day: any) => [
          day.name || day.date || 'Unknown',
          day.whatsapp_official || day.whatsappOfficial || 0,
          day.whatsapp_unofficial || day.whatsappUnofficial || 0,
          day.messenger || 0,
          day.instagram || 0,
          day.total || 0
        ])
      ];

      const csvContent = csvRows.map(row =>
        row.map((cell: any) => `"${cell}"`).join(',')
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Error exporting analytics data:', error);
      res.status(500).json({ message: 'Failed to export analytics data' });
    }
  });




  app.post('/api/instagram/test-webhook', ensureAuthenticated, async (req: any, res) => {
    try {
      const { webhookUrl, verifyToken } = req.body;

      if (!webhookUrl || !verifyToken) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL and verify token are required'
        });
      }

      const testResult = await instagramService.testWebhookConfiguration(webhookUrl, verifyToken);

      if (testResult.success) {
        res.json({
          success: true,
          message: 'Webhook configuration is valid'
        });
      } else {
        res.status(400).json({
          success: false,
          message: testResult.error || 'Webhook test failed'
        });
      }
    } catch (error: any) {
      console.error('Error testing Instagram webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });


  app.get('/api/instagram/health/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);


      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const health = instagramService.getConnectionHealth(connectionId);

      res.json({
        connectionId,
        channelType: 'instagram',
        ...health,
        status: connection.status
      });
    } catch (error: any) {
      console.error('Error getting Instagram connection health:', error);
      res.status(500).json({
        message: error.message || 'Internal server error'
      });
    }
  });


  app.post('/api/webhooks/telegram', async (req, res) => {
    try {
      const signature = req.headers['x-telegram-bot-api-secret-token'] as string;

      await telegramService.processWebhook(req.body, signature);

      res.status(200).send('OK');
    } catch (error) {
      console.error('Error processing Telegram webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });


  app.post('/api/telegram/test-webhook', ensureAuthenticated, async (req: any, res) => {
    try {
      const { webhookUrl, verifyToken } = req.body;

      if (!webhookUrl || !verifyToken) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL and verify token are required'
        });
      }

      const testResult = await telegramService.testWebhookConfiguration(webhookUrl, verifyToken);

      if (testResult.success) {
        res.json({
          success: true,
          message: 'Webhook configuration is valid'
        });
      } else {
        res.status(400).json({
          success: false,
          message: testResult.error || 'Webhook test failed'
        });
      }
    } catch (error: any) {
      console.error('Error testing Telegram webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });


  const qrGenerationRateLimits = new Map<string, number>();
  const QR_RATE_LIMIT_WINDOW = 5000; // 5 seconds

  app.post('/api/telegram/generate-qr', ensureAuthenticated, async (req: any, res) => {
    try {
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          message: 'Connection ID is required'
        });
      }


      const rateLimitKey = `${req.user.id}-${connectionId}`;
      const lastGeneration = qrGenerationRateLimits.get(rateLimitKey) || 0;
      const now = Date.now();

      if (now - lastGeneration < QR_RATE_LIMIT_WINDOW) {
        const remainingTime = Math.ceil((QR_RATE_LIMIT_WINDOW - (now - lastGeneration)) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingTime} seconds before generating a new QR code`,
          retryAfter: remainingTime
        });
      }


      qrGenerationRateLimits.set(rateLimitKey, now);


      if (qrGenerationRateLimits.size > 1000) {
        const cutoff = now - 60000;
        for (const key of qrGenerationRateLimits.keys()) {
          const timestamp = qrGenerationRateLimits.get(key);
          if (timestamp && timestamp < cutoff) {
            qrGenerationRateLimits.delete(key);
          }
        }
      }

      const qrResult = await telegramService.generateQRCode(connectionId, req.user.id);

      res.json({
        success: true,
        qrCode: qrResult.qrCode,
        loginToken: qrResult.loginToken
      });
    } catch (error: any) {
      console.error('Error generating Telegram QR code:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });


  app.get('/api/telegram/check-auth/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);

      const authResult = await telegramService.checkQRAuthStatus(connectionId, req.user.id);

      res.json({
        authenticated: authResult.authenticated,
        sessionString: authResult.sessionString
      });
    } catch (error: any) {
      console.error('Error checking Telegram auth status:', error);
      res.status(500).json({
        authenticated: false,
        message: error.message || 'Internal server error'
      });
    }
  });


  app.get('/api/telegram/health/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);


      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const health = telegramService.getConnectionHealth(connectionId);

      res.json({
        connectionId,
        channelType: 'telegram',
        ...health,
        status: connection.status
      });
    } catch (error: any) {
      console.error('Error getting Telegram connection health:', error);
      res.status(500).json({
        message: error.message || 'Internal server error'
      });
    }
  });



  app.post('/api/whatsapp/test-webhook', ensureAuthenticated, async (req: any, res) => {
    try {
      const { webhookUrl, verifyToken } = req.body;

      if (!webhookUrl || !verifyToken) {
        return res.status(400).json({
          success: false,
          message: 'Webhook URL and verify token are required'
        });
      }

      const testResult = await whatsAppOfficialService.testWebhookConfiguration(webhookUrl, verifyToken);

      if (testResult.success) {
        res.json({
          success: true,
          message: 'WhatsApp webhook configuration is valid'
        });
      } else {
        res.status(400).json({
          success: false,
          message: testResult.error || 'WhatsApp webhook test failed'
        });
      }
    } catch (error: any) {
      console.error('Error testing WhatsApp webhook:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  app.get('/api/whatsapp/webhook-config', ensureAuthenticated, async (req: any, res) => {
    try {
      const currentToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'default_verify_token';

      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host') || 'localhost:9000';
      const origin = req.get('origin') || `${protocol}://${host}`;
      const baseUrl = process.env.BASE_URL || origin;
      const webhookUrl = `${baseUrl}/api/webhooks/whatsapp`;

      res.json({
        success: true,
        webhookUrl,
        verifyToken: currentToken,
        message: 'Current WhatsApp webhook configuration'
      });
    } catch (error: any) {
      console.error('Error getting WhatsApp webhook config:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });


  app.get('/api/messenger/health/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);


      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const health = messengerService.getConnectionHealth(connectionId);

      res.json({
        connectionId,
        channelType: 'messenger',
        ...health,
        status: connection.status
      });
    } catch (error: any) {
      console.error('Error getting Messenger connection health:', error);
      res.status(500).json({
        message: error.message || 'Internal server error'
      });
    }
  });

  app.post('/api/instagram/connect/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (req.user.companyId && connection.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }

      await storage.updateChannelConnectionStatus(connectionId, 'connecting');

      try {
        await instagramService.connect(connectionId, req.user.id, req.user.companyId);

      } catch (err) {
        console.error('Error connecting to Instagram:', err);
        await storage.updateChannelConnectionStatus(connectionId, 'error');
      }

      res.json({ message: 'Instagram connection initiated' });
    } catch (err: any) {
      console.error('Error in Instagram connect endpoint:', err);
      res.status(400).json({ message: err.message });
    }
  });


  app.post('/api/instagram/fix-status/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (req.user.companyId && connection.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }

      if (connection.channelType !== 'instagram') {
        return res.status(400).json({ message: 'Connection is not an Instagram connection' });
      }


      await storage.updateChannelConnectionStatus(connectionId, 'active');


      const { updateConnectionActivity } = await import('./services/channels/instagram');
      updateConnectionActivity(connectionId, true);



      res.json({
        message: 'Instagram connection status fixed',
        connectionId: connectionId,
        status: 'active'
      });
    } catch (err: any) {
      console.error('Error fixing Instagram connection status:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/messenger/connect/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (req.user.companyId && connection.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Connection does not belong to your company' });
      }

      await storage.updateChannelConnectionStatus(connectionId, 'connecting');

      try {
        await messengerService.connect(connectionId, req.user.id, req.user.companyId);

      } catch (err) {
        console.error('Error connecting to Messenger:', err);
        await storage.updateChannelConnectionStatus(connectionId, 'error');
      }

      res.json({ message: 'Messenger connection initiated' });
    } catch (err: any) {
      console.error('Error in Messenger connect endpoint:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/instagram/send/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { to, message } = req.body;

      if (!to || !message) {
        return res.status(400).json({ message: 'Missing required parameters' });
      }

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      let messageContent = message;
      try {
        const user = await storage.getUser(req.user.id);
        if (user && user.fullName) {
          messageContent = `> *${user.fullName}*\n\n${message}`;
        }
      } catch (userError) {
        console.error('Error fetching user for signature in Instagram send:', userError);
      }

      const result = await instagramService.sendMessage(connectionId, to, messageContent);

      if (result.success) {
        res.status(200).json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ message: result.error || 'Failed to send Instagram message' });
      }
    } catch (err: any) {
      console.error('Error sending Instagram message:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/instagram/send-media/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { to, mediaUrl, mediaType, caption } = req.body;

      if (!to || !mediaUrl || !mediaType) {
        return res.status(400).json({ message: 'Recipient, media URL, and media type are required' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const result = await instagramService.sendMedia(connectionId, to, mediaUrl, mediaType, caption, req.user.id);

      if (result.success) {
        res.status(200).json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ message: result.error || 'Failed to send Instagram media message' });
      }
    } catch (err: any) {
      console.error('Error sending Instagram media message:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/instagram/send-quick-replies/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { to, message, quickReplies } = req.body;

      if (!to || !message || !quickReplies || !Array.isArray(quickReplies)) {
        return res.status(400).json({ message: 'Recipient, message, and quick replies array are required' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const result = await instagramService.sendMessageWithQuickReplies(connectionId, to, message, quickReplies, req.user.id);

      if (result.success) {
        res.status(200).json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ message: result.error || 'Failed to send Instagram message with quick replies' });
      }
    } catch (err: any) {
      console.error('Error sending Instagram message with quick replies:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/instagram/templates/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const templates = await instagramService.getMessageTemplates(connectionId);
      res.status(200).json({ templates });
    } catch (err: any) {
      console.error('Error getting Instagram templates:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/instagram/templates/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const template = req.body;

      if (!template.name || !template.content) {
        return res.status(400).json({ message: 'Template name and content are required' });
      }

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      if (!template.id) {
        template.id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      const result = await instagramService.saveMessageTemplate(connectionId, template);

      if (result.success) {
        res.status(200).json({ success: true, template });
      } else {
        res.status(500).json({ message: result.error || 'Failed to save template' });
      }
    } catch (err: any) {
      console.error('Error saving Instagram template:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/instagram/refresh-token/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);

      const connection = await storage.getChannelConnection(connectionId);
      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }

      if (connection.userId !== req.user.id) {
        return res.status(403).json({ message: 'Unauthorized access to connection' });
      }

      const result = await instagramService.refreshAccessToken(connectionId);

      if (result.success) {
        res.status(200).json({
          success: true,
          expiresAt: result.expiresAt,
          message: 'Access token refreshed successfully'
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh access token' });
      }
    } catch (err: any) {
      console.error('Error refreshing Instagram access token:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.post('/api/messenger/send/:connectionId', ensureAuthenticated, async (req: any, res) => {
    try {
      const connectionId = parseInt(req.params.connectionId);
      const { to, message } = req.body;

      if (!to || !message) {
        return res.status(400).json({ message: 'Missing required parameters' });
      }

      const connection = await storage.getChannelConnection(connectionId);

      if (!connection) {
        return res.status(404).json({ message: 'Connection not found' });
      }



      let messageContent = message;
      try {
        const user = await storage.getUser(req.user.id);
        if (user && user.fullName) {
          messageContent = `> *${user.fullName}*\n\n${message}`;
        }
      } catch (userError) {
        console.error('Error fetching user for signature in Messenger send:', userError);
      }

      const result = await messengerService.sendMessage(connectionId, to, messageContent);

      if (result.success) {
        res.status(200).json({ success: true, messageId: result.messageId });
      } else {
        res.status(500).json({ message: result.error || 'Failed to send Messenger message' });
      }
    } catch (err: any) {
      console.error('Error sending Messenger message:', err);
      res.status(400).json({ message: err.message });
    }
  });


  app.post('/api/scheduled-messages', ensureAuthenticated, async (req: any, res) => {
    try {
      const {
        conversationId,
        content,
        scheduledFor,
        messageType = 'text',
        mediaUrl,
        mediaFilePath,
        mediaType,
        caption,
        timezone = 'UTC',
        metadata = {}
      } = req.body;

      if (!conversationId || !content || !scheduledFor) {
        return res.status(400).json({ message: 'Conversation ID, content, and scheduled time are required' });
      }


      const scheduledDate = new Date(scheduledFor);
      if (scheduledDate <= new Date()) {
        return res.status(400).json({ message: 'Scheduled time must be in the future' });
      }


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      if (req.user.companyId && conversation.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Conversation does not belong to your company' });
      }

      if (!conversation.companyId) {
        return res.status(400).json({ message: 'Conversation must belong to a company' });
      }


      const channelConnection = await storage.getChannelConnection(conversation.channelId);
      if (!channelConnection) {
        return res.status(404).json({ message: 'Channel connection not found' });
      }

      const { ScheduledMessageService } = await import('./services/scheduled-message-service');

      const scheduledMessage = await ScheduledMessageService.createScheduledMessage({
        companyId: conversation.companyId,
        conversationId: conversation.id,
        channelId: conversation.channelId,
        channelType: channelConnection.channelType,
        content,
        messageType,
        mediaUrl,
        mediaFilePath,
        mediaType,
        caption,
        scheduledFor: scheduledDate,
        timezone,
        metadata,
        createdBy: req.user.id
      });

      res.status(201).json({
        success: true,
        scheduledMessage
      });
    } catch (err: any) {
      console.error('Error creating scheduled message:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.get('/api/scheduled-messages/:conversationId', ensureAuthenticated, async (req: any, res) => {
    try {
      const conversationId = parseInt(req.params.conversationId);


      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      if (req.user.companyId && conversation.companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Conversation does not belong to your company' });
      }

      if (!conversation.companyId) {
        return res.status(400).json({ message: 'Conversation must belong to a company' });
      }

      const { ScheduledMessageService } = await import('./services/scheduled-message-service');
      const scheduledMessages = await ScheduledMessageService.getScheduledMessagesForConversation(
        conversationId,
        conversation.companyId
      );

      res.json({ scheduledMessages });
    } catch (err: any) {
      console.error('Error fetching scheduled messages:', err);
      res.status(400).json({ message: err.message });
    }
  });

  app.delete('/api/scheduled-messages/:id', ensureAuthenticated, async (req: any, res) => {
    try {
      const scheduledMessageId = parseInt(req.params.id);


      const scheduledMessage = await storage.db
        .select()
        .from(scheduledMessages)
        .where(eq(scheduledMessages.id, scheduledMessageId))
        .limit(1);

      if (scheduledMessage.length === 0) {
        return res.status(404).json({ message: 'Scheduled message not found' });
      }

      if (req.user.companyId && scheduledMessage[0].companyId !== req.user.companyId) {
        return res.status(403).json({ message: 'Access denied: Scheduled message does not belong to your company' });
      }

      const { ScheduledMessageService } = await import('./services/scheduled-message-service');
      await ScheduledMessageService.deleteScheduledMessage(scheduledMessageId, req.user.companyId);

      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting scheduled message:', err);
      res.status(400).json({ message: err.message });
    }
  });





















  const mediaDir = path.join(process.cwd(), 'public', 'media');
  app.use('/media', (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');


    const filePath = req.path.toLowerCase();
    if (filePath.includes('/audio/')) {
      if (filePath.endsWith('.ogg')) {

        res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
      } else if (filePath.endsWith('.m4a')) {
        res.setHeader('Content-Type', 'audio/mp4');
      } else if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      } else if (filePath.endsWith('.aac')) {
        res.setHeader('Content-Type', 'audio/aac');
      } else if (filePath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav');
      }


      res.setHeader('Accept-Ranges', 'bytes');
    }

    if (req.path.includes('/profile_pictures/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('ETag', `"${req.path}-${Date.now()}"`);
    } else {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    express.static(mediaDir)(req, res, next);
  });

  const emailAttachmentsDir = path.join(process.cwd(), 'public', 'email-attachments');
  app.use('/email-attachments', (req, res, next) => {

    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');


    express.static(emailAttachmentsDir)(req, res, next);
  });


  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Disallow: /media/
Disallow: /email-attachments/
Disallow: /uploads/
Disallow: /api/
Allow: /

# App - Media files are private and should not be indexed
Crawl-delay: 10`);
  });

  app.use('/media/flow-media', express.static(FLOW_MEDIA_DIR));
  app.use('/email-attachments', express.static(EMAIL_MEDIA_DIR));


  app.use('/uploads/pages', express.static(path.join(process.cwd(), 'uploads', 'pages')));


  app.use('/uploads/api', (req, res, next) => {
    const filePath = req.path.toLowerCase();
    if (filePath.endsWith('.ogg')) {
      res.setHeader('Content-Type', 'audio/ogg; codecs=opus');
    } else if (filePath.endsWith('.m4a')) {
      res.setHeader('Content-Type', 'audio/mp4');
    } else if (filePath.endsWith('.mp3')) {
      res.setHeader('Content-Type', 'audio/mpeg');
    }

    if (filePath.includes('audio')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    express.static(path.join(process.cwd(), 'uploads', 'api'))(req, res, next);
  });


  app.get('/:slug', async (req, res, next) => {
    try {
      const slug = req.params.slug;


      if (slug.startsWith('api') || slug.includes('.')) {
        return next();
      }


      const frontendRoutes = [
        'auth', 'login', 'register', 'dashboard', 'admin', 'settings',
        'profile', 'logout', 'inbox', 'flows', 'contacts', 'calendar',
        'analytics', 'campaigns', 'pipeline', 'pages', 'users', 'billing',
        'integrations', 'reports', 'templates', 'webhooks'
      ];

      if (frontendRoutes.includes(slug)) {

        return next();
      }

      try {
        const website = await storage.getWebsiteBySlug(slug);

        if (website && website.status === 'published') {
          const html = `
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${website.metaTitle || website.title}</title>
                ${website.metaDescription ? `<meta name="description" content="${website.metaDescription}">` : ''}
                ${website.metaKeywords ? `<meta name="keywords" content="${website.metaKeywords}">` : ''}
                ${website.favicon ? `<link rel="icon" href="${website.favicon}">` : ''}
                ${website.googleAnalyticsId ? `
                  <!-- Google Analytics -->
                  <script async src="https://www.googletagmanager.com/gtag/js?id=${website.googleAnalyticsId}"></script>
                  <script>
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${website.googleAnalyticsId}');
                  </script>
                ` : ''}
                ${website.facebookPixelId ? `
                  <!-- Facebook Pixel -->
                  <script>
                    !function(f,b,e,v,n,t,s)
                    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                    n.queue=[];t=b.createElement(e);t.async=!0;
                    t.src=v;s=b.getElementsByTagName(e)[0];
                    s.parentNode.insertBefore(t,s)}(window, document,'script',
                    'https://connect.facebook.net/en_US/fbevents.js');
                    fbq('init', '${website.facebookPixelId}');
                    fbq('track', 'PageView');
                  </script>
                  <noscript><img height="1" width="1" style="display:none"
                    src="https://www.facebook.com/tr?id=${website.facebookPixelId}&ev=PageView&noscript=1"
                  /></noscript>
                ` : ''}
                <style>
                  ${website.grapesCss || ''}
                  ${website.customCss || ''}
                </style>
                ${website.customHead || ''}
              </head>
              <body>
                ${website.grapesHtml || ''}
                <script>
                  ${website.grapesJs || ''}
                  ${website.customJs || ''}
                </script>
              </body>
            </html>
          `;

          res.set('Cache-Control', 'public, max-age=300');
          return res.send(html);
        } else {
        }
      } catch (websiteError) {
        console.error('Error checking for website by slug:', websiteError);
      }


      const hostname = req.get('host') || '';
      const cleanHostname = hostname.split(':')[0];
      const parts = cleanHostname.split('.');


      const isSubdomainRequest = (req.subdomain && req.subdomainCompany) ||
        (parts.length === 2 && parts[1] === 'localhost' && parts[0] !== 'localhost');

      if (!isSubdomainRequest) {

        return next();
      }


      let companyId: number | null = null;

      if (req.subdomain && req.subdomainCompany) {
        companyId = req.subdomainCompany.id;
      } else {

        if (parts.length === 2 && parts[1] === 'localhost') {
          const subdomain = parts[0];
          if (subdomain && subdomain !== 'localhost') {
            const company = await storage.getCompanyBySlug(subdomain);
            if (company) {
              companyId = company.id;
            }
          }
        }
      }

      if (!companyId) {
        return res.status(404).json({ message: 'Company not found' });
      }


      const page = await storage.getCompanyPageBySlug(companyId, slug);

      if (!page || !page.isPublished) {
        return res.status(404).json({ message: 'Page not found' });
      }


      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${page.metaTitle || page.title}</title>
    ${page.metaDescription ? `<meta name="description" content="${page.metaDescription}">` : ''}
    ${page.metaKeywords ? `<meta name="keywords" content="${page.metaKeywords}">` : ''}
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="${page.metaTitle || page.title}">
    ${page.metaDescription ? `<meta property="og:description" content="${page.metaDescription}">` : ''}
    <meta property="og:type" content="website">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #fff;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        .page-content {
            max-width: 800px;
            margin: 0 auto;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        h1 {
            font-size: 2.5rem;
            border-bottom: 2px solid #e5e7eb;
            padding-bottom: 1rem;
        }
        h2 { font-size: 2rem; }
        h3 { font-size: 1.5rem; }
        h4 { font-size: 1.25rem; }
        p {
            margin-bottom: 1rem;
        }
        ul, ol {
            margin-bottom: 1rem;
            padding-left: 2rem;
        }
        li {
            margin-bottom: 0.5rem;
        }
        a {
            color: #3b82f6;
            text-decoration: underline;
        }
        a:hover {
            color: #1d4ed8;
        }
        blockquote {
            border-left: 4px solid #e5e7eb;
            padding-left: 1rem;
            margin: 1rem 0;
            font-style: italic;
            color: #6b7280;
        }
        pre {
            background-color: #f3f4f6;
            padding: 1rem;
            border-radius: 0.375rem;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 0.375rem;
        }
        .footer {
            margin-top: 4rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 0.875rem;
        }
        ${page.customCss || ''}
    </style>
</head>
<body>
    <div class="container">
        <div class="page-content">
            ${page.content}
        </div>
    </div>
    ${page.customJs ? `<script>${page.customJs}</script>` : ''}
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error serving public page:', error);

      next();
    }
  });


  app.get('/api/subdomain-info', async (req, res) => {
    try {
      const host = req.headers.host || '';


      if (!host.includes('.localhost') || host.startsWith('localhost:')) {
        return res.status(404).json({
          error: 'NOT_SUBDOMAIN',
          message: 'This endpoint is only available on subdomains'
        });
      }


      const subdomain = host.split('.')[0];


      const company = await storage.getCompanyBySlug(subdomain);

      if (!company) {
        return res.status(404).json({
          error: 'COMPANY_NOT_FOUND',
          message: 'Company not found for this subdomain'
        });
      }


      res.json({
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          logo: company.logo,
          primaryColor: company.primaryColor,
          active: company.active
        },
        subdomain
      });
    } catch (error) {
      console.error('Error getting subdomain info:', error);
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to get subdomain information'
      });
    }
  });


  app.get('/api/company-pages', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_PAGES, PERMISSIONS.MANAGE_PAGES]), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;

      if (!companyId) {
        return res.status(400).json({ message: 'Company ID is required' });
      }

      const published = req.query.published === 'true' ? true : req.query.published === 'false' ? false : undefined;
      const featured = req.query.featured === 'true' ? true : req.query.featured === 'false' ? false : undefined;

      const pages = await storage.getCompanyPages(companyId, { published, featured });
      res.json(pages);
    } catch (error) {
      console.error('Error fetching company pages:', error);
      res.status(500).json({ message: 'Failed to fetch company pages' });
    }
  });

  app.get('/api/company-pages/:id', ensureAuthenticated, requireAnyPermission([PERMISSIONS.VIEW_PAGES, PERMISSIONS.MANAGE_PAGES]), async (req, res) => {
    try {
      const user = req.user as any;
      const pageId = parseInt(req.params.id);

      const page = await storage.getCompanyPage(pageId);

      if (!page) {
        return res.status(404).json({ message: 'Page not found' });
      }


      if (!user.isSuperAdmin && page.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(page);
    } catch (error) {
      console.error('Error fetching company page:', error);
      res.status(500).json({ message: 'Failed to fetch company page' });
    }
  });

  app.post('/api/company-pages', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId;

      if (!companyId) {
        return res.status(400).json({ message: 'Company ID is required' });
      }

      const pageData = validateBody(insertCompanyPageSchema, {
        ...req.body,
        companyId,
        authorId: user.id
      });


      const existingPage = await storage.getCompanyPageBySlug(companyId, pageData.slug);
      if (existingPage) {
        return res.status(400).json({ message: 'A page with this slug already exists' });
      }

      const page = await storage.createCompanyPage(pageData);
      res.status(201).json(page);
    } catch (error) {
      console.error('Error creating company page:', error);
      res.status(500).json({ message: 'Failed to create company page' });
    }
  });

  app.put('/api/company-pages/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), async (req, res) => {
    try {
      const user = req.user as any;
      const pageId = parseInt(req.params.id);

      const existingPage = await storage.getCompanyPage(pageId);

      if (!existingPage) {
        return res.status(404).json({ message: 'Page not found' });
      }


      if (!user.isSuperAdmin && existingPage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const updateData = {
        ...req.body,
        authorId: user.id
      };


      if (updateData.slug && updateData.slug !== existingPage.slug) {
        const conflictingPage = await storage.getCompanyPageBySlug(existingPage.companyId, updateData.slug);
        if (conflictingPage && conflictingPage.id !== pageId) {
          return res.status(400).json({ message: 'A page with this slug already exists' });
        }
      }

      const page = await storage.updateCompanyPage(pageId, updateData);
      res.json(page);
    } catch (error) {
      console.error('Error updating company page:', error);
      res.status(500).json({ message: 'Failed to update company page' });
    }
  });

  app.delete('/api/company-pages/:id', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), async (req, res) => {
    try {
      const user = req.user as any;
      const pageId = parseInt(req.params.id);

      const existingPage = await storage.getCompanyPage(pageId);

      if (!existingPage) {
        return res.status(404).json({ message: 'Page not found' });
      }


      if (!user.isSuperAdmin && existingPage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const success = await storage.deleteCompanyPage(pageId);

      if (success) {
        res.json({ message: 'Page deleted successfully' });
      } else {
        res.status(500).json({ message: 'Failed to delete page' });
      }
    } catch (error) {
      console.error('Error deleting company page:', error);
      res.status(500).json({ message: 'Failed to delete company page' });
    }
  });

  app.post('/api/company-pages/:id/publish', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), async (req, res) => {
    try {
      const user = req.user as any;
      const pageId = parseInt(req.params.id);

      const existingPage = await storage.getCompanyPage(pageId);

      if (!existingPage) {
        return res.status(404).json({ message: 'Page not found' });
      }


      if (!user.isSuperAdmin && existingPage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const page = await storage.publishCompanyPage(pageId);
      res.json(page);
    } catch (error) {
      console.error('Error publishing company page:', error);
      res.status(500).json({ message: 'Failed to publish company page' });
    }
  });

  app.post('/api/company-pages/:id/unpublish', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), async (req, res) => {
    try {
      const user = req.user as any;
      const pageId = parseInt(req.params.id);

      const existingPage = await storage.getCompanyPage(pageId);

      if (!existingPage) {
        return res.status(404).json({ message: 'Page not found' });
      }


      if (!user.isSuperAdmin && existingPage.companyId !== user.companyId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const page = await storage.unpublishCompanyPage(pageId);
      res.json(page);
    } catch (error) {
      console.error('Error unpublishing company page:', error);
      res.status(500).json({ message: 'Failed to unpublish company page' });
    }
  });


  app.post('/api/company-pages/upload-media', ensureAuthenticated, requirePermission(PERMISSIONS.MANAGE_PAGES), (req, res, next) => {
    const pagesMediaUpload = multer({
      storage: multer.diskStorage({
        destination: function (req, file, cb) {
          const uploadDir = path.join(process.cwd(), 'uploads', 'pages');
          fsExtra.ensureDirSync(uploadDir);
          cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
          const uniqueId = crypto.randomBytes(16).toString('hex');
          const fileExt = path.extname(file.originalname) || '';
          cb(null, `${uniqueId}${fileExt}`);
        }
      }),
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp'
        ];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          const error = new Error('Only image files are allowed');
          cb(error);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }
    });

    pagesMediaUpload.single('file')(req, res, async (err) => {
      if (err) {
        console.error('Pages media upload error:', err);
        return res.status(400).json({
          success: false,
          error: 'UPLOAD_ERROR',
          message: err.message || 'Failed to upload file'
        });
      }

      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'NO_FILE_PROVIDED',
            message: 'No file was uploaded'
          });
        }

        const publicUrl = `${req.protocol}://${req.get('host')}/uploads/pages/${path.basename(req.file.path)}`;

        res.json({
          success: true,
          data: {
            url: publicUrl,
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
          }
        });
      } catch (error: any) {
        console.error('Error processing pages media upload:', error);

        if (req.file && req.file.path) {
          fsExtra.unlink(req.file.path).catch(console.error);
        }

        res.status(500).json({
          success: false,
          error: 'PROCESSING_ERROR',
          message: error.message || 'Failed to process uploaded file'
        });
      }
    });
  });

  app.get('/api/partner-configurations/:provider/status', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const config = await storage.getPartnerConfiguration(provider);

      if (config && config.partnerApiKey && config.partnerId) {
        res.json({
          configured: true,
          provider: config.provider,
          partnerId: config.partnerId,
          hasApiKey: !!config.partnerApiKey
        });
      } else {
        res.json({
          configured: false,
          provider: provider,
          partnerId: null,
          hasApiKey: false
        });
      }
    } catch (error) {
      console.error('Error checking partner configuration status:', error);
      res.status(500).json({ error: 'Failed to check partner configuration status' });
    }
  });


  app.get('/api/partner-configurations/tiktok', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const config = await storage.getPartnerConfiguration('tiktok');

      if (!config || !config.isActive) {
        return res.status(404).json({ error: 'TikTok partner configuration not found or inactive' });
      }


      const publicProfile = (config.publicProfile as any) || {};
      const allowedScopes = publicProfile.allowedScopes || ['user.info.basic'];


      res.json({
        isActive: config.isActive,
        redirectUrl: config.redirectUrl,
        clientKey: config.partnerApiKey,
        allowedScopes: allowedScopes
      });
    } catch (error) {
      console.error('Error getting TikTok partner configuration:', error);
      res.status(500).json({ error: 'Failed to get TikTok partner configuration' });
    }
  });


  app.get("/api/help-support-url", async (req, res) => {
    try {
      const generalSettings = await storage.getAppSetting('general_settings');
      let helpSupportUrl = '';

      if (generalSettings?.value && (generalSettings.value as any).helpSupportUrl) {
        helpSupportUrl = (generalSettings.value as any).helpSupportUrl;
      } else {

        const hostname = req.get('host') || 'localhost';
        const domain = hostname.replace(/^www\./, '');
        helpSupportUrl = `https://docs.${domain}`;
      }

      res.json({ helpSupportUrl });
    } catch (error) {
      console.error('Error fetching help support URL:', error);

      const hostname = req.get('host') || 'localhost';
      const domain = hostname.replace(/^www\./, '');
      res.json({ helpSupportUrl: `https://docs.${domain}` });
    }
  });


  app.get('/api/messages/by-external-id/:externalId', ensureAuthenticated, async (req, res) => {
    try {
      const { externalId } = req.params;
      const user = req.user as User;


      const message = await storage.getMessageByExternalId(externalId, user.companyId || undefined);
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }


      let metadata = message.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (error) {
          console.error('Error parsing message metadata:', error);
          metadata = {};
        }
      }

      res.json({
        ...message,
        metadata
      });
    } catch (error) {
      console.error('Error fetching message by external ID:', error);
      res.status(500).json({ error: 'Failed to fetch message' });
    }
  });


  app.get('/api/poll-votes/:messageId', ensureAuthenticated, async (req, res) => {
    try {
      const { messageId } = req.params;
      const user = req.user as User;


      const pollMessage = await storage.getMessageById(parseInt(messageId));
      if (!pollMessage) {
        return res.status(404).json({ error: 'Poll message not found' });
      }


      const conversation = await storage.getConversation(pollMessage.conversationId);
      if (!conversation || conversation.companyId !== user.companyId) {
        return res.status(403).json({ error: 'Access denied' });
      }


      let pollContext;
      try {
        const metadata = typeof pollMessage.metadata === 'string'
          ? JSON.parse(pollMessage.metadata)
          : pollMessage.metadata || {};
        pollContext = metadata.pollContext;
      } catch (error) {
        console.error('Error parsing poll metadata:', error);
        return res.status(400).json({ error: 'Invalid poll message format' });
      }

      if (!pollContext || !pollContext.pollOptions) {
        return res.status(400).json({ error: 'Poll context not found' });
      }


      const allMessages = await storage.getMessagesByConversation(pollMessage.conversationId);


      const voteCounts = new Array(pollContext.pollOptions.length).fill(0);
      let totalVotes = 0;

      for (const message of allMessages) {
        if (message.type === 'poll_vote') {
          try {

            const voteMetadata = typeof message.metadata === 'string'
              ? JSON.parse(message.metadata)
              : message.metadata || {};

            const pollVoteData = voteMetadata.pollVote;
            if (pollVoteData?.pollCreationMessageKey?.id === pollMessage.externalId) {

              if (message.content && message.content.startsWith('poll_vote_selected:')) {
                const indexMatch = message.content.match(/poll_vote_selected:(\d+)/);
                if (indexMatch) {
                  const selectedIndex = parseInt(indexMatch[1], 10);
                  if (selectedIndex >= 0 && selectedIndex < voteCounts.length) {
                    voteCounts[selectedIndex]++;
                    totalVotes++;
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error processing poll vote:', error);

          }
        }
      }


      const pollData = {
        pollId: pollMessage.id,
        question: pollContext.pollName,
        options: pollContext.pollOptions.map((option: string, index: number) => ({
          text: option,
          value: `option${index + 1}`,
          votes: voteCounts[index]
        })),
        totalVotes,
        selectableCount: pollContext.selectableCount || 1
      };

      res.json(pollData);
    } catch (error) {
      console.error('Error fetching poll votes:', error);
      res.status(500).json({ error: 'Failed to fetch poll votes' });
    }
  });


  return httpServer;
}
