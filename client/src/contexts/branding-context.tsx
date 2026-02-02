import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import useSocket from "@/hooks/useSocket";
import { useAuth } from "@/hooks/use-auth";
import type { GradientConfig, SimpleGradientConfig, AdvancedGradientConfig } from '@shared/schema';

export type BrandingSettings = {
  appName: string;
  primaryColor: string;
  secondaryColor: string;
  defaultTheme?: 'dark' | 'light';
  logoUrl?: string;
  faviconUrl?: string;
  adminAuthBackgroundUrl?: string;
  userAuthBackgroundUrl?: string;
  authBackgroundConfig?: {
    adminAuthBackground?: {
      backgroundColor?: string;
      gradientConfig?: GradientConfig;
      priority: 'image' | 'color' | 'layer';
    };
    userAuthBackground?: {
      backgroundColor?: string;
      gradientConfig?: GradientConfig;
      priority: 'image' | 'color' | 'layer';
    };
  };
};

const DEFAULT_BRANDING: BrandingSettings = {
  appName: "PowerChat",
  primaryColor: "#333235",
  secondaryColor: "#4F46E5",
};

type BrandingContextType = {
  branding: BrandingSettings;
  isLoading: boolean;
  error: Error | null;
  refreshBranding: () => Promise<void>;
};

export const BrandingContext = createContext<BrandingContextType | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const { user, isLoading: authLoading } = useAuth();
  const { onMessage } = useSocket('/ws');

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const applyBrandingToDOM = useCallback((settings: BrandingSettings) => {
    document.title = `${settings.appName} - Multi-Channel Team Inbox & AI Chatbot Platform`;

    if (settings.faviconUrl) {
      const existingFavicon = document.querySelector('link[rel="icon"]');
      if (existingFavicon) {
        existingFavicon.setAttribute('href', settings.faviconUrl);
      } else {
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.href = settings.faviconUrl;
        document.head.appendChild(favicon);
      }
    }

    document.documentElement.style.setProperty('--brand-primary-color', settings.primaryColor);
    document.documentElement.style.setProperty('--brand-secondary-color', settings.secondaryColor);

    const primaryRgb = hexToRgb(settings.primaryColor);
    const secondaryRgb = hexToRgb(settings.secondaryColor);

    if (primaryRgb) {
      document.documentElement.style.setProperty('--brand-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);

      const hoverColor = `rgb(${Math.max(0, primaryRgb.r - 20)}, ${Math.max(0, primaryRgb.g - 20)}, ${Math.max(0, primaryRgb.b - 20)})`;
      document.documentElement.style.setProperty('--brand-primary-hover', hoverColor);

      const brandElements = document.querySelectorAll('.btn-brand-primary, .bg-brand-primary, .text-brand-primary, .border-brand-primary');
      brandElements.forEach(element => {
        (element as HTMLElement).style.setProperty('--brand-primary-color', settings.primaryColor, 'important');
      });
    }

    if (secondaryRgb) {
      document.documentElement.style.setProperty('--brand-secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);

      const hoverColor = `rgb(${Math.max(0, secondaryRgb.r - 20)}, ${Math.max(0, secondaryRgb.g - 20)}, ${Math.max(0, secondaryRgb.b - 20)})`;
      document.documentElement.style.setProperty('--brand-secondary-hover', hoverColor);

      const brandElements = document.querySelectorAll('.btn-brand-secondary, .bg-brand-secondary, .text-brand-secondary, .border-brand-secondary');
      brandElements.forEach(element => {
        (element as HTMLElement).style.setProperty('--brand-secondary-color', settings.secondaryColor, 'important');
      });
    }

    document.body.style.display = 'none';
    document.body.offsetHeight;
    document.body.style.display = '';
  }, []);

  const fetchBrandingSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      
      let res = await fetch("/public/branding", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      

      if (!res.ok) {
        
        res = await apiRequest("GET", "/api/branding");
        
      }

      if (!res.ok) {
        
        setBranding(DEFAULT_BRANDING);
        applyBrandingToDOM(DEFAULT_BRANDING);
        return;
      }

      const settings = await res.json();
      

      const brandingSetting = settings.find((s: any) => s.key === 'branding');
      const logoSetting = settings.find((s: any) => s.key === 'branding_logo');
      const faviconSetting = settings.find((s: any) => s.key === 'branding_favicon');
      const adminAuthBackgroundSetting = settings.find((s: any) => s.key === 'branding_admin_auth_background');
      const userAuthBackgroundSetting = settings.find((s: any) => s.key === 'branding_user_auth_background');
      const authBackgroundConfigSetting = settings.find((s: any) => s.key === 'auth_background_config');

      
      
      
      

      let brandingValue = brandingSetting?.value;
      if (typeof brandingValue === 'string') {
        try {
          brandingValue = JSON.parse(brandingValue);
          
        } catch (e) {
          
          brandingValue = {};
        }
      }

      let authBackgroundConfigValue = authBackgroundConfigSetting?.value;
      if (typeof authBackgroundConfigValue === 'string') {
        try {
          authBackgroundConfigValue = JSON.parse(authBackgroundConfigValue);
        } catch (e) {
          authBackgroundConfigValue = undefined;
        }
      }

      const newBranding: BrandingSettings = {
        ...DEFAULT_BRANDING,
        ...(brandingValue || {}),
        logoUrl: logoSetting?.value,
        faviconUrl: faviconSetting?.value,
        adminAuthBackgroundUrl: adminAuthBackgroundSetting?.value,
        userAuthBackgroundUrl: userAuthBackgroundSetting?.value,
        authBackgroundConfig: authBackgroundConfigValue,
      };

      
      setBranding(newBranding);
      applyBrandingToDOM(newBranding);
    } catch (err) {
      setBranding(DEFAULT_BRANDING);
      applyBrandingToDOM(DEFAULT_BRANDING);
      setError(err instanceof Error ? err : new Error("Failed to fetch branding settings"));
    } finally {
      setIsLoading(false);
    }
  }, [applyBrandingToDOM]);



  useEffect(() => {
    fetchBrandingSettings();
  }, [fetchBrandingSettings]);



  useEffect(() => {

    if (!user || authLoading) {
      return;
    }



    const unsubscribe = onMessage('settingsUpdated', (data) => {


      if (data.key === 'branding') {


        setBranding(prev => {
          const updated = { ...prev, ...data.value };
          applyBrandingToDOM(updated);
          return updated;
        });


        if (data.value.defaultTheme !== undefined) {
          window.dispatchEvent(new CustomEvent('defaultThemeUpdated', { 
            detail: data.value.defaultTheme 
          }));
        }

        if (data.value.appName) {
          document.title = `${data.value.appName} - Multi-Channel Team Inbox & AI Chatbot Platform`;
        }

        window.dispatchEvent(new CustomEvent('brandingUpdated', { detail: data.value }));
      } else if (data.key === 'branding_logo') {


        setBranding(prev => {
          const updated = { ...prev, logoUrl: data.value };
          applyBrandingToDOM(updated);
          return updated;
        });

        window.dispatchEvent(new CustomEvent('brandingUpdated', { detail: { logoUrl: data.value } }));
      } else if (data.key === 'branding_favicon') {


        setBranding(prev => {
          const updated = { ...prev, faviconUrl: data.value };
          applyBrandingToDOM(updated);
          return updated;
        });

        window.dispatchEvent(new CustomEvent('brandingUpdated', { detail: { faviconUrl: data.value } }));
      } else if (data.key === 'branding_admin_auth_background') {
        setBranding(prev => {
          const updated = { ...prev, adminAuthBackgroundUrl: data.value };
          return updated;
        });
        window.dispatchEvent(new CustomEvent('brandingUpdated', { 
          detail: { adminAuthBackgroundUrl: data.value } 
        }));
      } else if (data.key === 'branding_user_auth_background') {
        setBranding(prev => {
          const updated = { ...prev, userAuthBackgroundUrl: data.value };
          return updated;
        });
        window.dispatchEvent(new CustomEvent('brandingUpdated', { 
          detail: { userAuthBackgroundUrl: data.value } 
        }));
      } else if (data.key === 'auth_background_config') {
        let authBackgroundConfigValue = data.value;
        if (typeof authBackgroundConfigValue === 'string') {
          try {
            authBackgroundConfigValue = JSON.parse(authBackgroundConfigValue);
          } catch (e) {
            authBackgroundConfigValue = undefined;
          }
        }
        setBranding(prev => {
          const updated = { ...prev, authBackgroundConfig: authBackgroundConfigValue };
          return updated;
        });
        window.dispatchEvent(new CustomEvent('brandingUpdated', { 
          detail: { authBackgroundConfig: authBackgroundConfigValue } 
        }));
      }
    });

    return unsubscribe;
  }, [user, authLoading, onMessage, applyBrandingToDOM]);

  const refreshBranding = async () => {
    queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
    await fetchBrandingSettings();
  };

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isLoading,
        error,
        refreshBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}
