import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';

interface CustomCssSettings {
  enabled: boolean;
  css: string;
  lastModified: string;
}

export function useCustomCss() {
  const injectedStylesRef = useRef<HTMLStyleElement[]>([]);
  const { user } = useAuth();


  const { data: appCssData } = useQuery({
    queryKey: ['/public/custom-css'],
    queryFn: async () => {
      let res = await fetch('/public/custom-css', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        res = await apiRequest('GET', '/api/admin/settings/custom-css');
        if (!res.ok) {
          return {
            enabled: false,
            css: '',
            lastModified: new Date().toISOString()
          };
        }
      }

      return res.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });


  const { data: companyCssData } = useQuery({
    queryKey: ['/api/company-settings/custom-css'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/custom-css');
      if (!res.ok) {
        return {
          enabled: false,
          css: '',
          lastModified: new Date().toISOString()
        };
      }
      return res.json();
    },
    enabled: !!user && !!user.companyId && !user.isSuperAdmin,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  const appCssSettings: CustomCssSettings | undefined = React.useMemo(() => {
    if (!appCssData) {
      return undefined;
    }
    return appCssData;
  }, [appCssData]);

  const companyCssSettings: CustomCssSettings | undefined = React.useMemo(() => {
    if (!companyCssData) {
      return undefined;
    }
    return companyCssData;
  }, [companyCssData]);

  const cleanupInjectedStyles = () => {
    injectedStylesRef.current.forEach(style => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    });
    injectedStylesRef.current = [];
  };

  const injectCustomCss = (css: string, source: 'app' | 'company') => {
    try {
      if (!css.trim()) {
        return;
      }


      const existingStyles = document.querySelectorAll(`style[data-custom-css="${source}"]`);
      existingStyles.forEach(style => {
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }

        const index = injectedStylesRef.current.indexOf(style as HTMLStyleElement);
        if (index > -1) {
          injectedStylesRef.current.splice(index, 1);
        }
      });

      const styleElement = document.createElement('style');
      styleElement.setAttribute('data-custom-css', source);
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
      injectedStylesRef.current.push(styleElement);
    } catch (error) {
      console.error(`Error injecting custom CSS (${source}):`, error);
    }
  };

  useEffect(() => {
    cleanupInjectedStyles();


    if (appCssSettings?.enabled && appCssSettings.css) {
      injectCustomCss(appCssSettings.css, 'app');
    }


    if (companyCssSettings?.enabled && companyCssSettings.css) {
      injectCustomCss(companyCssSettings.css, 'company');
    }

    return () => {
      cleanupInjectedStyles();
    };
  }, [appCssSettings, companyCssSettings]);


  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'customCssUpdated') {
          const { data } = message;
          if (data?.enabled && data.css) {
            injectCustomCss(data.css, 'app');
          } else {

            const existingStyles = document.querySelectorAll(`style[data-custom-css="app"]`);
            existingStyles.forEach(style => {
              if (style.parentNode) {
                style.parentNode.removeChild(style);
              }
            });
          }
        }
      } catch (error) {

      }
    };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      socket.addEventListener('message', handleWebSocketMessage);
    } catch (error) {

    }

    return () => {
      if (socket) {
        socket.removeEventListener('message', handleWebSocketMessage);
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    };
  }, []);

  return {
    appCssSettings,
    companyCssSettings,
    isAppEnabled: appCssSettings?.enabled || false,
    isCompanyEnabled: companyCssSettings?.enabled || false,
    stylesCount: injectedStylesRef.current.length
  };
}

