
let configCache: {
  config: any;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Meta Partner Configuration from database
 * Uses in-memory caching to avoid repeated API calls
 */
export async function fetchMetaPartnerConfig(): Promise<any | null> {

  if (configCache && Date.now() - configCache.timestamp < CACHE_TTL) {
    return configCache.config;
  }

  try {
    const response = await fetch('/api/partner-configurations/meta/availability');
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch Meta partner configuration');
    }

    const data = await response.json();
    
    if (!data.isAvailable || !data.config) {
      return null;
    }


    configCache = {
      config: data.config,
      timestamp: Date.now()
    };

    return data.config;
  } catch (error) {
    console.error('Error fetching Meta partner configuration:', error);
    

    if (import.meta.env.VITE_FACEBOOK_APP_ID && import.meta.env.VITE_WHATSAPP_CONFIG_ID) {
      console.warn('Using environment variables as fallback. This is for development only.');
      return {
        partnerApiKey: import.meta.env.VITE_FACEBOOK_APP_ID,
        configId: import.meta.env.VITE_WHATSAPP_CONFIG_ID,
        apiVersion: 'v24.0'
      };
    }
    
    return null;
  }
}

/**
 * Clear configuration cache (useful for refresh)
 */
export function clearConfigCache(): void {
  configCache = null;
}

/**
 * Validate Facebook/Meta configuration
 * @param config - Optional config object. If not provided, will fetch from API
 */
export async function validateFacebookConfig(config?: any): Promise<{ isValid: boolean; missingFields: string[]; config?: any }> {
  const missingFields: string[] = [];
  let configToValidate = config;


  if (!configToValidate) {
    configToValidate = await fetchMetaPartnerConfig();
  }

  if (!configToValidate) {

    if (import.meta.env.VITE_FACEBOOK_APP_ID && import.meta.env.VITE_WHATSAPP_CONFIG_ID) {
      configToValidate = {
        partnerApiKey: import.meta.env.VITE_FACEBOOK_APP_ID,
        configId: import.meta.env.VITE_WHATSAPP_CONFIG_ID,
        apiVersion: 'v24.0'
      };
    } else {
      missingFields.push('Meta Partner Configuration');
      return {
        isValid: false,
        missingFields
      };
    }
  }

  if (!configToValidate.partnerApiKey || configToValidate.partnerApiKey === 'YOUR_FB_APP_ID') {
    missingFields.push('App ID (partnerApiKey)');
  }

  if (!configToValidate.configId || configToValidate.configId === 'YOUR_WHATSAPP_CONFIG_ID') {
    missingFields.push('WhatsApp Configuration ID (configId)');
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    config: configToValidate
  };
}


export const FACEBOOK_APP_CONFIG = {
  appId: import.meta.env.VITE_FACEBOOK_APP_ID || 'YOUR_FB_APP_ID',
  whatsAppConfigId: import.meta.env.VITE_WHATSAPP_CONFIG_ID || 'YOUR_WHATSAPP_CONFIG_ID',
  apiVersion: 'v24.0'
};