import axios from 'axios';
import { storage } from '../storage';

const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v24.0';

interface WebhookConfigurationResult {
  success: boolean;
  message: string;
  subscriptionId?: string;
  error?: any;
}

interface WebhookFieldSubscription {
  field: string;
  subscribed: boolean;
  error?: string;
}

/**
 * Configure webhook for a WhatsApp Business Account (WABA)
 * Subscribes the app to the WABA for webhook delivery
 */
export async function configureWebhookForWABA(
  wabaId: string,
  appId: string,
  accessToken: string
): Promise<WebhookConfigurationResult> {
  try {




    
    console.log('🔍 [META WEBHOOK] Configuring webhook for WABA:', {
      wabaId,
      appId,
      accessTokenType: accessToken.includes('|') ? 'app_access_token' : 'system_user_token',
      accessTokenPrefix: accessToken.substring(0, 20) + '...'
    });

    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/subscribed_apps`,
      {
        subscribed_fields: [
          'messages',
          'message_template_status_update',
          'history'
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          access_token: accessToken
        }
      }
    );

    if (response.status === 200 || response.status === 201) {
      return {
        success: true,
        message: 'Successfully subscribed app to WABA',
        subscriptionId: response.data?.id || wabaId
      };
    }

    return {
      success: false,
      message: 'Failed to subscribe app to WABA',
      error: response.data
    };
  } catch (error: any) {
    console.error('Error configuring webhook for WABA:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.error?.message || 'Failed to configure webhook for WABA',
      error: error.response?.data || error.message
    };
  }
}

/**
 * Subscribe to webhook fields for a WABA
 * Configures which webhook events to receive
 * @param wabaId - WhatsApp Business Account ID
 * @param webhookUrl - Webhook callback URL
 * @param verifyToken - Webhook verification token
 * @param accessToken - Access token for API calls
 * @param appId - Meta App ID (must be provided by caller)
 */
export async function subscribeToWebhookFields(
  wabaId: string,
  webhookUrl: string,
  verifyToken: string,
  accessToken: string,
  appId: string
): Promise<{ success: boolean; fields: WebhookFieldSubscription[]; error?: any }> {
  try {
    if (!appId) {
      throw new Error('App ID is required. Caller must provide a valid appId tied to the access token.');
    }

    const fields = [
      'messages',
      'message_template_status_update',
      'history'
    ];


    const response = await axios.post(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${appId}/subscriptions`,
      {
        object: 'whatsapp_business_account',
        callback_url: webhookUrl,
        verify_token: verifyToken,
        fields: fields
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 200 || response.status === 201) {
      const subscribedFields: WebhookFieldSubscription[] = fields.map(field => ({
        field,
        subscribed: true
      }));

      return {
        success: true,
        fields: subscribedFields
      };
    }

    return {
      success: false,
      fields: fields.map(field => ({
        field,
        subscribed: false,
        error: 'Subscription failed'
      })),
      error: response.data
    };
  } catch (error: any) {
    console.error('Error subscribing to webhook fields:', error.response?.data || error.message);
    return {
      success: false,
      fields: [],
      error: error.response?.data || error.message
    };
  }
}

/**
 * Verify webhook configuration by sending GET request with hub parameters
 * This is called by Meta when setting up webhooks
 */
export async function verifyWebhookConfiguration(
  mode: string,
  token: string,
  challenge: string,
  expectedToken: string
): Promise<string | null> {
  if (mode === 'subscribe' && token === expectedToken) {
    return challenge;
  }
  return null;
}

/**
 * Test webhook delivery by sending a sample payload
 */
export async function testWebhookDelivery(
  webhookUrl: string,
  verifyToken: string
): Promise<{ success: boolean; message: string; error?: any }> {
  try {

    const testPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test_entry_id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: 'TEST',
                  phone_number_id: 'test_phone_id'
                },
                contacts: [
                  {
                    profile: {
                      name: 'Test User'
                    },
                    wa_id: '1234567890'
                  }
                ],
                messages: [
                  {
                    from: '1234567890',
                    id: 'test_message_id',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: {
                      body: 'Test webhook message'
                    }
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const response = await axios.post(webhookUrl, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'test_signature'
      },
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx as valid responses
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        message: 'Webhook test delivery successful'
      };
    }

    return {
      success: false,
      message: `Webhook returned status ${response.status}`,
      error: response.data
    };
  } catch (error: any) {
    console.error('Error testing webhook delivery:', error.message);
    return {
      success: false,
      message: error.message || 'Failed to test webhook delivery',
      error: error.response?.data || error.message
    };
  }
}

/**
 * Get webhook subscription status from Meta API
 */
export async function getWebhookSubscriptionStatus(
  wabaId: string,
  accessToken: string
): Promise<{ success: boolean; subscriptions: any[]; error?: any }> {
  try {
    const response = await axios.get(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${wabaId}/subscribed_apps`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          access_token: accessToken
        }
      }
    );

    if (response.status === 200) {
      return {
        success: true,
        subscriptions: response.data?.data || []
      };
    }

    return {
      success: false,
      subscriptions: [],
      error: response.data
    };
  } catch (error: any) {
    console.error('Error getting webhook subscription status:', error.response?.data || error.message);
    return {
      success: false,
      subscriptions: [],
      error: error.response?.data || error.message
    };
  }
}

/**
 * Get webhook field subscriptions for an app from Meta API
 * This fetches the actual subscribed fields from the app's webhook configuration
 * Requires app secret for app-level endpoints
 */
export async function getAppWebhookFieldSubscriptions(
  appId: string,
  appSecret: string,
  accessToken?: string
): Promise<{ success: boolean; fields: { [field: string]: { subscribed: boolean } }; error?: any }> {
  try {
    
    

    const appAccessToken = `${appId}|${appSecret}`;
    
    const response = await axios.get(
      `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${appId}/subscriptions`,
      {
        headers: {
          'Authorization': `Bearer ${appAccessToken}`
        },
        params: {
          access_token: appAccessToken
        }
      }
    );

    console.log('🔍 [META WEBHOOK] Subscriptions API response:', {
      status: response.status,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    });

    if (response.status === 200) {

      let subscriptions: any[] = [];
      
      if (Array.isArray(response.data)) {
        subscriptions = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        subscriptions = response.data.data;
      } else if (response.data?.subscriptions && Array.isArray(response.data.subscriptions)) {
        subscriptions = response.data.subscriptions;
      }

      
      

      const whatsappSubscription = subscriptions.find((sub: any) => 
        sub.object === 'whatsapp_business_account' || 
        sub.object === 'whatsapp_business_account' ||
        (sub.callback_url && sub.fields)
      );

      const fields: { [field: string]: { subscribed: boolean } } = {
        messages: { subscribed: false },
        message_template_status_update: { subscribed: false },
        history: { subscribed: false }
      };

      if (whatsappSubscription) {
        

        if (whatsappSubscription.fields) {
          const subscribedFields = Array.isArray(whatsappSubscription.fields) 
            ? whatsappSubscription.fields 
            : [];
          

          const fieldNames = subscribedFields.map((field: any) => 
            typeof field === 'string' ? field : field?.name || field
          );
          
          fields.messages.subscribed = fieldNames.includes('messages');
          fields.message_template_status_update.subscribed = fieldNames.includes('message_template_status_update');
          fields.history.subscribed = fieldNames.includes('history');
        }
      } else {
        console.warn('⚠️ [META WEBHOOK] No WhatsApp Business Account subscription found in response');

        for (const sub of subscriptions) {
          if (sub.fields && Array.isArray(sub.fields)) {
            const fieldNames = sub.fields.map((field: any) => 
              typeof field === 'string' ? field : field?.name || field
            );
            if (fieldNames.includes('messages')) {
              fields.messages.subscribed = true;
            }
            if (fieldNames.includes('message_template_status_update')) {
              fields.message_template_status_update.subscribed = true;
            }
            if (fieldNames.includes('history')) {
              fields.history.subscribed = true;
            }
          }
        }
      }

      
      return {
        success: true,
        fields
      };
    }

    return {
      success: false,
      fields: {
        messages: { subscribed: false },
        message_template_status_update: { subscribed: false },
        history: { subscribed: false }
      },
      error: response.data
    };
  } catch (error: any) {
    console.error('❌ [META WEBHOOK] Error getting app webhook field subscriptions:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return {
      success: false,
      fields: {
        messages: { subscribed: false },
        message_template_status_update: { subscribed: false },
        history: { subscribed: false }
      },
      error: error.response?.data || error.message
    };
  }
}

/**
 * Retry webhook configuration with exponential backoff
 */
export async function retryWebhookConfiguration(
  wabaId: string,
  appId: string,
  webhookUrl: string,
  verifyToken: string,
  accessToken: string,
  maxRetries: number = 3,
  systemUserToken?: string // Optional System User token for /subscribed_apps endpoint
): Promise<WebhookConfigurationResult> {
  let lastError: any = null;
  



  const isAppAccessToken = accessToken.includes('|');
  const systemToken = systemUserToken || (!isAppAccessToken ? accessToken : undefined);
  const appToken = isAppAccessToken ? accessToken : undefined;
  
  
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {

      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }



      let wabaResult: WebhookConfigurationResult | null = null;
      if (systemToken) {
        wabaResult = await configureWebhookForWABA(wabaId, appId, systemToken);
        if (!wabaResult.success) {
          console.warn('⚠️ [META WEBHOOK] /subscribed_apps failed, but continuing with /subscriptions:', wabaResult.error);

        }
      } else {
        console.warn('⚠️ [META WEBHOOK] No System User token available, skipping /subscribed_apps endpoint');
        console.warn('⚠️ [META WEBHOOK] Webhook will be configured via /subscriptions endpoint only');
      }



      if (!appToken) {
        throw new Error('App access token (appId|appSecret) is required for /subscriptions endpoint');
      }

      const fieldsResult = await subscribeToWebhookFields(
        wabaId,
        webhookUrl,
        verifyToken,
        appToken, // Use app access token for /subscriptions
        appId
      );

      if (!fieldsResult.success) {
        lastError = fieldsResult.error;
        const errorCode = fieldsResult.error?.error?.code;
        const errorMessage = fieldsResult.error?.error?.message || '';
        

        if (errorCode === 2200) {
          console.warn('⚠️ [META WEBHOOK] /subscriptions failed with callback verification timeout (Error 2200)');
          console.warn('⚠️ [META WEBHOOK] This usually means Meta cannot reach your webhook URL from their servers');
          console.warn('⚠️ [META WEBHOOK] Possible causes:');
          console.warn('   1. Webhook URL is using a dev tunnel that Meta cannot access');
          console.warn('   2. Network firewall blocking Meta\'s servers');
          console.warn('   3. Webhook URL is not publicly accessible');
          console.warn('⚠️ [META WEBHOOK] Solution: Configure webhook manually in Meta App Dashboard or use a publicly accessible URL');
        } else {
          console.error('❌ [META WEBHOOK] /subscriptions failed:', fieldsResult.error);
        }
        continue;
      }



      return {
        success: true,
        message: 'Webhook configuration successful (via /subscriptions endpoint)',
        subscriptionId: wabaResult?.subscriptionId || wabaId
      };
    } catch (error: any) {
      lastError = error;
      console.error(`❌ [META WEBHOOK] Webhook configuration attempt ${attempt + 1} failed:`, error.message);
    }
  }

  return {
    success: false,
    message: `Failed to configure webhook after ${maxRetries} attempts`,
    error: lastError
  };
}

