
declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: {
      init: (options: {
        appId: string;
        cookie?: boolean;
        autoLogAppEvents?: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: any) => void,
        options?: {
          config_id?: string;
          response_type?: string;
          override_default_response_type?: boolean;
          extras?: {
            setup: Record<string, any>;
            featureType: string;
            sessionInfoVersion: string;
          };
          scope?: string;
        }
      ) => void;
      getLoginStatus: (callback: (response: any) => void) => void;
      api: (path: string, callback: (response: any) => void) => void;
    };
  }
}

/**
 * Type definitions for response objects
 */
interface AuthResponse {
  accessToken: string;
  userID: string;
  expiresIn: number;
  signedRequest: string;
  code?: string;
}

export interface FacebookLoginResponse {
  authResponse: AuthResponse | null;
  status: 'connected' | 'not_authorized' | 'unknown';
}

interface WhatsAppSignupData {
  type: 'WA_EMBEDDED_SIGNUP';
  event?: string; // 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' for coexistence mode
  wabaId?: string;
  phoneNumberId?: string;
  screen?: string;

  business_account_id?: string;
  business_account_name?: string;
  phone_numbers?: Array<{
    phone_number_id: string;
    phone_number: string;
    display_name?: string;
    quality_rating?: string;
    messaging_limit?: number;
    access_token?: string;
  }>;

  status?: string;
  [key: string]: any; // Allow additional fields from Meta
}

/**
 * Initialize Facebook SDK
 * @param appId Your Facebook App ID
 * @param version Graph API version (e.g., 'v24.0')
 */
export function initFacebookSDK(appId: string, version = 'v24.0'): Promise<void> {
  return new Promise((resolve, reject) => {

    if (document.getElementById('facebook-jssdk')) {

      if (window.FB) {
        window.FB.init({
          appId: appId,
          cookie: true,
          xfbml: true,
          version: version
        });
      }
      

      setTimeout(() => {
        if (window.FB && typeof window.FB.getLoginStatus === 'function') {
          resolve();
        } else {
          setTimeout(() => {
            if (window.FB && typeof window.FB.getLoginStatus === 'function') {
              resolve();
            } else {
              reject(new Error('Facebook SDK failed to initialize properly'));
            }
          }, 1000);
        }
      }, 1000); // Always wait 1 second for internal initialization
      return;
    }


    window.fbAsyncInit = function() {
      window.FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: version
      });
      


      setTimeout(() => {
        resolve();
      }, 1000); // Wait 1 second for internal initialization
    };


    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    
    script.onerror = () => {
      reject(new Error('Failed to load Facebook SDK'));
    };
    
    document.head.appendChild(script);
  });
}

/**
 * Setup event listener for WhatsApp signup events
 * @param callback Function to call when a WhatsApp signup event is received
 */
export function setupWhatsAppSignupListener(callback: (data: WhatsAppSignupData) => void) {
  
  
  window.addEventListener('message', (event) => {

    if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") {
      return;
    }
    
    try {


      let data: any;
      if (typeof event.data === 'string') {
        const trimmed = event.data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          data = JSON.parse(event.data);
        } else {

          return;
        }
      } else {
        data = event.data;
      }
      
   
      
      if (data.type === 'WA_EMBEDDED_SIGNUP') {
        let signupData = data;
        if (data.data && typeof data.data === 'object') {
          const nestedData = data.data;

        

          const businessId = nestedData.business_id;
 
          signupData = {
            ...data,
            ...nestedData,

            business_account_id: nestedData.waba_id || nestedData.business_account_id || nestedData.wabaId,

            wabaId: nestedData.waba_id || nestedData.wabaId,
            businessId: businessId, // Include business ID for business-level template fetching

            phoneNumberId: nestedData.phone_number_id || nestedData.phoneNumberId,


            phone_numbers: nestedData.phone_numbers || (nestedData.phone_number_id ? [{
              phone_number_id: nestedData.phone_number_id,
              phone_number: nestedData.phone_number || nestedData.phone_number_id || '', // Use phone_number_id as fallback if phone_number is missing
              display_name: nestedData.display_name || nestedData.verified_name || nestedData.phone_number || nestedData.phone_number_id || ''
            }] : []),

            type: data.type
          };
          
      
        }
        
        callback(signupData);
      }
    } catch (error) {

      const eventDataStr = typeof event.data === 'string' ? event.data : '';
      if (!eventDataStr.startsWith('cb=')) {
        console.error('❌ [FACEBOOK SDK] Error parsing message data:', error);
      }

    }
  });
  
  
}

/**
 * Launch WhatsApp Business signup flow
 * @param configId Your WhatsApp Business configuration ID
 * @param callback Callback function to handle the login response
 * @param signupMode Signup mode: 'standard' for new account, 'coexistence' for existing WhatsApp Business app
 * @remarks For coexistence mode, featureType is set to 'whatsapp_business_app_onboarding' as per Facebook documentation
 */
export async function launchWhatsAppSignup(
  configId: string, 
  callback: (response: FacebookLoginResponse) => void,
  signupMode: 'standard' | 'coexistence' = 'standard'
) {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (!configId || configId.trim() === '') {
    throw new Error('WhatsApp Configuration ID is required. Please check your configuration.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('WhatsApp signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }


  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }


  try {
    const featureTypeValue = signupMode === 'coexistence' ? 'whatsapp_business_app_onboarding' : '';
    
    window.FB.getLoginStatus((response: any) => {
      
      
      

      window.FB.login((loginResponse: any) => {
        
        callback(loginResponse);
      }, {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: featureTypeValue,
          sessionInfoVersion: '3',
        }
      });
    });
  } catch (error) {
    throw new Error('Failed to launch WhatsApp signup. Please check your configuration.');
  }
}

/**
 * Launch Messenger signup flow using Facebook Login with Pages permissions
 * @param callback Callback function to handle the login response
 */
export async function launchMessengerSignup(
  callback: (response: FacebookLoginResponse) => void
) {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Messenger signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  try {
    window.FB.getLoginStatus((response: any) => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, {
        scope: 'pages_show_list,pages_messaging,pages_read_engagement'
      });
    });
  } catch (error) {
    throw new Error('Failed to launch Messenger signup. Please check your configuration.');
  }
}

/**
 * Launch Instagram signup flow using Facebook Login with Instagram and Pages permissions
 * @param callback Callback function to handle the login response
 */
export async function launchInstagramSignup(
  callback: (response: FacebookLoginResponse) => void
) {
  if (!window.FB) {
    throw new Error('Facebook SDK not initialized. Please try again.');
  }

  if (window.location.protocol !== 'https:') {
    throw new Error('Instagram signup requires HTTPS. Please access this application over HTTPS (https://) instead of HTTP.');
  }

  if (!window.FB || typeof window.FB.login !== 'function') {
    throw new Error('Facebook SDK is not properly initialized');
  }

  try {
    window.FB.getLoginStatus((response: any) => {
      window.FB.login((loginResponse: any) => {
        callback(loginResponse);
      }, {
        scope: 'instagram_basic,instagram_manage_messages,pages_show_list,business_management'
      });
    });
  } catch (error) {
    throw new Error('Failed to launch Instagram signup. Please check your configuration.');
  }
}