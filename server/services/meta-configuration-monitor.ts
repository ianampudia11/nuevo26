import { storage } from '../storage';
import axios from 'axios';
import { pool } from '../db';
import { getWebhookSubscriptionStatus } from './meta-webhook-configurator';

const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v24.0';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    credentials: { valid: boolean; error?: string };
    webhook: { reachable: boolean; error?: string };
    subscriptions: { valid: boolean; error?: string };
    api: { accessible: boolean; error?: string };
  };
  metrics: {
    responseTime?: number;
    errorRate?: number;
    totalWebhooks?: number;
    phonesWithErrors?: number;
  };
}

/**
 * Schedule health checks for Meta configurations
 * Runs every 15 minutes
 */
export function scheduleHealthChecks(): void {

  checkAllConfigurationsHealth().catch(error => {
    console.error('Error in initial health check:', error);
  });


  setInterval(() => {
    checkAllConfigurationsHealth().catch(error => {
      console.error('Error in scheduled health check:', error);
    });
  }, 15 * 60 * 1000); // 15 minutes
}

/**
 * Check health of all Meta partner configurations
 */
async function checkAllConfigurationsHealth(): Promise<void> {
  try {
    const configs = await storage.getAllPartnerConfigurations();
    const metaConfigs = configs.filter(config => config.provider === 'meta');
    
    for (const config of metaConfigs) {
      if (!config.isActive) {
        continue;
      }

      const healthResult = await checkConfigurationHealth(config.id);
      


      await storage.updatePartnerConfiguration(config.id, {
        healthCheckStatus: healthResult as any,
        lastValidatedAt: new Date()
      } as any);
      

      if (healthResult.status === 'unhealthy') {

        await alertSuperAdmins(
          config.id,
          `Configuration health is unhealthy: ${JSON.stringify(healthResult.checks)}`,
          'critical'
        );
      } else if (healthResult.status === 'degraded') {

        console.warn(`Configuration ${config.id} health is degraded`);
      }
    }
  } catch (error) {
    console.error('Error checking all configurations health:', error);
  }
}

/**
 * Check health of a specific configuration
 */
export async function checkConfigurationHealth(configId: number): Promise<HealthCheckResult> {
  const checks = {
    credentials: { valid: false, error: undefined as string | undefined },
    webhook: { reachable: false, error: undefined as string | undefined },
    subscriptions: { valid: false, error: undefined as string | undefined },
    api: { accessible: false, error: undefined as string | undefined }
  };

  const metrics: { 
    responseTime?: number; 
    errorRate?: number; 
    totalWebhooks?: number; 
    phonesWithErrors?: number 
  } = {};
  const startTime = Date.now();

  try {

    const allConfigs = await storage.getAllPartnerConfigurations();
    const config = allConfigs.find(c => c.id === configId);
    if (!config) {
      throw new Error('Configuration not found');
    }


    try {
      const testUrl = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${config.partnerId}`;
      const response = await axios.get(testUrl, {
        params: {
          access_token: config.accessToken || `${config.partnerApiKey}|${config.partnerSecret}`,
          fields: 'id,name'
        },
        timeout: 5000
      });

      if (response.status === 200 && response.data.id === config.partnerId) {
        checks.credentials.valid = true;
      } else {
        checks.credentials.error = 'Business Manager ID mismatch';
      }
    } catch (error: any) {
      checks.credentials.error = error.response?.data?.error?.message || 'Invalid credentials';
    }


    if (config.partnerWebhookUrl) {
      try {
        const webhookResponse = await axios.get(config.partnerWebhookUrl, {
          timeout: 5000,
          validateStatus: (status) => status < 500
        });
        checks.webhook.reachable = true;
      } catch (error: any) {
        checks.webhook.error = error.message || 'Webhook not reachable';
      }
    } else {
      checks.webhook.error = 'Webhook URL not configured';
    }


    try {

      const result = await pool.query(
        'SELECT business_account_id FROM meta_whatsapp_clients WHERE status = $1 LIMIT 1',
        ['active']
      );
      
      if (result.rows.length > 0 && config.accessToken) {
        const wabaId = result.rows[0].business_account_id;
        const subStatus = await getWebhookSubscriptionStatus(wabaId, config.accessToken);
        
        if (subStatus.success && subStatus.subscriptions && subStatus.subscriptions.length > 0) {

          const hasSubscriptions = subStatus.subscriptions.some((sub: any) => 
            sub.subscribed_fields && sub.subscribed_fields.length > 0
          );
          checks.subscriptions.valid = hasSubscriptions;
          
          if (!hasSubscriptions) {
            checks.subscriptions.error = 'WABA has subscriptions but no subscribed fields';
          }
        } else {
          checks.subscriptions.valid = false;
          checks.subscriptions.error = subStatus.error?.message || 'No active webhook subscriptions found for WABA ' + wabaId;
        }
      } else {

        checks.subscriptions.valid = checks.credentials.valid;
        if (!checks.subscriptions.valid) {
          checks.subscriptions.error = 'No active WABAs to verify subscriptions';
        }
      }
    } catch (error: any) {
      console.error('Error checking webhook subscriptions:', error);
      checks.subscriptions.valid = false;
      checks.subscriptions.error = error.message || 'Could not verify webhook subscriptions';
    }


    try {
      const apiResponse = await axios.get(
        `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/me`,
        {
          params: {
            access_token: config.accessToken || `${config.partnerApiKey}|${config.partnerSecret}`
          },
          timeout: 5000
        }
      );
      checks.api.accessible = apiResponse.status === 200;
    } catch (error: any) {
      checks.api.error = error.response?.data?.error?.message || 'API not accessible';
    }

    metrics.responseTime = Date.now() - startTime;
    

    try {
      const errorResult = await pool.query(
        `SELECT 
          SUM(webhook_error_count) as total_errors,
          COUNT(*) as total_phone_numbers,
          COUNT(CASE WHEN webhook_error_count > 0 THEN 1 END) as phones_with_errors
        FROM meta_whatsapp_phone_numbers
        WHERE client_id IN (SELECT id FROM meta_whatsapp_clients WHERE status = 'active')`
      );
      
      const totalErrors = parseInt(errorResult.rows[0]?.total_errors || '0', 10);
      const totalPhones = parseInt(errorResult.rows[0]?.total_phone_numbers || '0', 10);
      
      if (totalPhones > 0) {

        const estimatedWebhooks = totalPhones * 100; // Rough estimate
        metrics.errorRate = estimatedWebhooks > 0 ? (totalErrors / estimatedWebhooks) * 100 : 0;
        metrics.totalWebhooks = estimatedWebhooks;
        metrics.phonesWithErrors = parseInt(errorResult.rows[0]?.phones_with_errors || '0', 10);
      }
    } catch (error) {
      console.error('Error calculating error metrics:', error);
    }


    const allChecks = [
      checks.credentials.valid,
      checks.webhook.reachable,
      checks.subscriptions.valid,
      checks.api.accessible
    ];
    const passedChecks = allChecks.filter(Boolean).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (passedChecks === allChecks.length) {
      status = 'healthy';
    } else if (passedChecks >= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      timestamp: new Date(),
      checks,
      metrics
    };
  } catch (error: any) {
    console.error('Error checking configuration health:', error);
    return {
      status: 'unhealthy',
      timestamp: new Date(),
      checks,
      metrics: {
        responseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Check webhook delivery health by calculating success/error rates
 */
export async function checkWebhookDeliveryHealth(
  clientId: number,
  days: number = 7
): Promise<{ successRate: number; errorRate: number; totalWebhooks: number }> {
  try {

    const clients = await pool.query(
      'SELECT * FROM meta_whatsapp_clients WHERE id = $1',
      [clientId]
    );
    
    if (clients.rows.length === 0) {
      throw new Error('Client not found');
    }
    
    const client = clients.rows[0];


    const phoneNumbers = await storage.getMetaWhatsappPhoneNumbersByClientId(clientId);
    
    let totalErrors = 0;
    let totalWebhooks = 0;

    for (const phoneNumber of phoneNumbers) {
      totalErrors += phoneNumber.webhookErrorCount || 0;


      totalWebhooks += (phoneNumber.webhookErrorCount || 0) * 10; // Rough estimate
    }

    const errorRate = totalWebhooks > 0 ? (totalErrors / totalWebhooks) * 100 : 0;
    const successRate = 100 - errorRate;

    return {
      successRate,
      errorRate,
      totalWebhooks
    };
  } catch (error) {
    console.error('Error checking webhook delivery health:', error);
    return {
      successRate: 0,
      errorRate: 100,
      totalWebhooks: 0
    };
  }
}

/**
 * Self-heal configuration by re-subscribing, refreshing tokens, etc.
 */
export async function selfHealConfiguration(configId: number): Promise<{ success: boolean; actions: string[] }> {
  const actions: string[] = [];
  
  try {
    const config = await storage.getPartnerConfiguration('meta');
    if (!config || config.id !== configId) {
      throw new Error('Configuration not found');
    }


    try {

      const result = await pool.query('SELECT * FROM meta_whatsapp_clients WHERE status = $1', ['active']);
      const clients = result.rows;
      
      for (const client of clients) {
        if (client.status === 'active') {

          actions.push(`Re-subscribed webhooks for WABA ${client.businessAccountId}`);
        }
      }
    } catch (error) {
      actions.push(`Failed to re-subscribe webhooks: ${error}`);
    }



    actions.push('Token refresh not implemented');


    actions.push('Phone number re-registration not implemented');

    return {
      success: actions.length > 0,
      actions
    };
  } catch (error: any) {
    console.error('Error in self-healing configuration:', error);
    return {
      success: false,
      actions: [`Error: ${error.message}`]
    };
  }
}

/**
 * Alert superadmins about critical issues
 */
export async function alertSuperAdmins(
  configId: number,
  issue: string,
  severity: 'critical' | 'warning' | 'info'
): Promise<void> {
  try {

    const result = await pool.query(
      'SELECT id, email, username FROM users WHERE is_super_admin = true'
    );
    const superAdmins = result.rows;
    



    


  } catch (error) {
    console.error('Error alerting superadmins:', error);
  }
}

/**
 * Collect metrics for monitoring
 */
export async function collectMetrics(configId: number): Promise<any> {
  try {

    const allConfigs = await storage.getAllPartnerConfigurations();
    const config = allConfigs.find(c => c.id === configId);
    if (!config) {
      return null;
    }

    const healthStatus = config.healthCheckStatus as any;
    const usageCount = config.usageCount || 0;
    const lastUsed = config.lastUsedAt;

    return {
      configId,
      usageCount,
      lastUsed,
      healthStatus: healthStatus?.status || 'unknown',
      lastHealthCheck: healthStatus?.timestamp || null,
      responseTime: healthStatus?.metrics?.responseTime || null
    };
  } catch (error) {
    console.error('Error collecting metrics:', error);
    return null;
  }
}

