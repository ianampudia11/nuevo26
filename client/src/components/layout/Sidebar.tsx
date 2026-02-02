import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions, PermissionGate } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useManualRenewal } from '@/contexts/manual-renewal-context';
import useSocket from '@/hooks/useSocket';
import TrialStatus from '@/components/TrialStatus';
import { isLifetimePlan } from '@/utils/plan-duration';
import { apiRequest } from '@/lib/queryClient';
import { useTheme } from 'next-themes';
import { TwilioIcon } from '@/components/icons/TwilioIcon';

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const { setActiveChannelId, activeChannelId } = useActiveChannel();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsMobile] = useState(false);
  const { company } = useAuth();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: subscriptionStatus } = useSubscriptionStatus();
  const { requestManualRenewal } = useManualRenewal();
  

  const { data: renewalStatus } = useQuery({
    queryKey: ['/api/plan-renewal/status'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plan-renewal/status");
      if (!res.ok) throw new Error("Failed to fetch renewal status");
      return res.json();
    },
    enabled: !!company, // Only run when company is available
  });


  const { data: helpSupportData } = useQuery({
    queryKey: ['/api/help-support-url'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/help-support-url");
      if (!res.ok) throw new Error("Failed to fetch help support URL");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });


  const getHelpSupportUrl = () => {
    if (helpSupportData?.helpSupportUrl) {
      return helpSupportData.helpSupportUrl;
    }

    return `https://docs.${window.location.hostname.replace(/^www\./, '')}`;
  };

  const {
    PERMISSIONS
  } = usePermissions();

  const queryClient = useQueryClient();

  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    const unsubscribeChannelCreated = onMessage('channelConnectionCreated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelUpdated = onMessage('channelConnectionUpdated', (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });

    const unsubscribeChannelDeleted = onMessage('channelConnectionDeleted', (data) => {
      if (data.data?.id === activeChannelId) {
        setActiveChannelId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
    });


    const unsubscribeWhatsAppStatus = onMessage('whatsappConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeInstagramStatus = onMessage('instagramConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });

    const unsubscribeMessengerStatus = onMessage('messengerConnectionStatus', (data) => {
      if (data.status === 'connected' || data.status === 'disconnected') {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections', company?.id] });
      }
    });


    const unsubscribeSubscriptionStatus = onMessage('subscription_status_changed', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
    });


    const unsubscribePlanUpdated = onMessage('plan_updated', (data) => {


      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
    });

    return () => {
      unsubscribeChannelCreated();
      unsubscribeChannelUpdated();
      unsubscribeChannelDeleted();
      unsubscribeWhatsAppStatus();
      unsubscribeInstagramStatus();
      unsubscribeMessengerStatus();
      unsubscribeSubscriptionStatus();
      unsubscribePlanUpdated();
    };
  }, [onMessage, queryClient, company?.id, activeChannelId, setActiveChannelId]);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    checkIfMobile();

    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const { data: channelConnections = [] } = useQuery<any[]>({
    queryKey: ['/api/channel-connections', company?.id],
    refetchOnWindowFocus: false, // Disable to prevent excessive refetching
    refetchOnReconnect: false, // Disable to prevent excessive refetching
    staleTime: 1000 * 60 * 5, // Increase stale time to 5 minutes
    enabled: !!company
  });

  const handleChannelClick = (channelId: number) => {

    const connection = channelConnections?.find((conn: any) => conn.id === channelId);

    if (connection?.channelType === 'email') {

      setLocation(`/email/${channelId}`);
      setActiveChannelId(channelId);
    } else {

      if (activeChannelId === channelId) {
        setActiveChannelId(null);
      } else {
        setActiveChannelId(channelId);
      }

      if (location !== '/inbox') {
        setLocation('/inbox');
      }
    }
  };

  const companyStyle = isDark ? {
    sidebarBg: { backgroundColor: 'hsl(var(--card))' },
    sidebarHover: { backgroundColor: 'hsl(var(--accent))' },
    activeItem: { backgroundColor: 'hsl(var(--accent))' },
    toggleButton: { backgroundColor: 'hsl(var(--accent))' },
    toggleButtonHover: { backgroundColor: 'hsl(var(--accent))' },
    toggleButtonBorder: { borderColor: 'hsl(var(--border))' }
  } : company ? {
    sidebarBg: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -40) },
    sidebarHover: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -30) },
    activeItem: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -20) },
    toggleButton: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -30) },
    toggleButtonHover: { backgroundColor: adjustColor(company.primaryColor ?? '#1f2937', -20) },
    toggleButtonBorder: { borderColor: adjustColor(company.primaryColor ?? '#1f2937', -10) }
  } : {
    sidebarBg: {},
    sidebarHover: {},
    activeItem: {},
    toggleButton: {},
    toggleButtonHover: {},
    toggleButtonBorder: {}
  };

  function adjustColor(color: string, amount: number): string {
    try {
      color = color.replace('#', '');

      let r = parseInt(color.substring(0, 2), 16);
      let g = parseInt(color.substring(2, 4), 16);
      let b = parseInt(color.substring(4, 6), 16);

      r = Math.max(0, Math.min(255, r + amount));
      g = Math.max(0, Math.min(255, g + amount));
      b = Math.max(0, Math.min(255, b + amount));

      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (error) {
      return '#1f2937';
    }
  }

  const getRenewalDisplayInfo = () => {
    if (!subscriptionStatus) return null;


    if (renewalStatus && !renewalStatus.expirationStatus.renewalRequired) {
      return null;
    }

    const { daysUntilExpiry, nextBillingDate, gracePeriodActive, gracePeriodDaysRemaining, isActive } = subscriptionStatus;
    

    const isLifetime = company?.plan && isLifetimePlan(company.plan);
    

    if (isLifetime) {
      return {
        text: t('nav.lifetime_plan', 'Lifetime plan'),
        color: 'text-green-400',
        icon: 'ri-infinity-line'
      };
    }

    if (gracePeriodActive && gracePeriodDaysRemaining !== undefined) {
      return {
        text: `${t('nav.grace_period', 'Grace period')}: ${gracePeriodDaysRemaining} ${gracePeriodDaysRemaining === 1 ? 'day' : 'days'}`,
        color: 'text-amber-400',
        icon: 'ri-time-line'
      };
    }

    if (!isActive) {
      return {
        text: t('nav.subscription_expired', 'Subscription expired'),
        color: 'text-red-400',
        icon: 'ri-alert-line'
      };
    }

    if (daysUntilExpiry !== undefined) {
      if (daysUntilExpiry <= 7) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (daysUntilExpiry <= 30) {
        return {
          text: `${t('nav.expires_in', 'Expires in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    if (nextBillingDate) {
      const renewalDate = new Date(nextBillingDate);
      const today = new Date();
      const diffTime = renewalDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return {
          text: t('nav.renewal_due', 'Renewal due'),
          color: 'text-red-400',
          icon: 'ri-alert-line'
        };
      } else if (diffDays <= 7) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-red-400',
          icon: 'ri-alarm-warning-line'
        };
      } else if (diffDays <= 30) {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-amber-400',
          icon: 'ri-time-line'
        };
      } else {
        return {
          text: `${t('nav.renews_in', 'Renews in')}: ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`,
          color: 'text-green-400',
          icon: 'ri-refresh-line'
        };
      }
    }

    return null;
  };

  const handleManualRenewal = () => {
    requestManualRenewal();
  };

  const isSubscriptionExpired = () => {
    return subscriptionStatus &&
           !subscriptionStatus.isActive &&
           (subscriptionStatus.status === 'expired' ||
            subscriptionStatus.status === 'cancelled' ||
            subscriptionStatus.status === 'past_due');
  };

  return (
    <nav
      className={`text-white ${isCollapsed ? 'w-16' : 'w-64'} transition-all duration-300 ease-in-out flex-shrink-0 flex flex-col relative`}
      style={isDark ? { backgroundColor: 'hsl(var(--card))' } : (companyStyle.sidebarBg || { backgroundColor: '#1f2937' })}
    >
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 text-white p-1 rounded-full border z-50 shadow-lg transition-colors"
        style={{
          ...companyStyle.toggleButton,
          ...companyStyle.toggleButtonBorder
        }}
        aria-label={isCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
      >
        <i className={`ri-${isCollapsed ? 'arrow-right' : 'arrow-left'}-s-line text-sm`}></i>
      </button>

      <div className="px-4 py-4 flex flex-col overflow-y-auto">
        <div className="flex flex-col space-y-1">
          <Link
            href="/inbox"
            className={`flex items-center px-2 py-2 rounded-lg ${location === '/inbox' ? 'text-white' : 'text-white/60 hover:text-white'}`}
            style={location === '/inbox' ? companyStyle.activeItem : {}}
          >
            <i className="ri-inbox-line text-xl"></i>
            <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.inbox', 'Inbox')}</span>
          </Link>

          <PermissionGate permissions={[PERMISSIONS.VIEW_FLOWS, PERMISSIONS.MANAGE_FLOWS]}>
            <Link
              href="/flows"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/flows' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/flows' ? companyStyle.activeItem : {}}
            >
              <i className="ri-flow-chart text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.flow_builder', 'Flow Builder')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CONTACTS, PERMISSIONS.MANAGE_CONTACTS]}>
            <Link
              href="/contacts"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/contacts' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/contacts' ? companyStyle.activeItem : {}}
            >
              <i className="ri-contacts-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.contacts', 'Contacts')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE]}>
            <Link
              href="/pipeline"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/pipeline' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/pipeline' ? companyStyle.activeItem : {}}
            >
              <i className="ri-stack-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.pipeline', 'Pipeline')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]}>
            <Link
              href="/tasks"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/tasks' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/tasks' ? companyStyle.activeItem : {}}
            >
              <i className="ri-task-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.tasks', 'Tasks')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CALENDAR, PERMISSIONS.MANAGE_CALENDAR]}>
            <Link
              href="/calendar"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/calendar' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/calendar' ? companyStyle.activeItem : {}}
            >
              <i className="ri-calendar-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.calendar', 'Calendar')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[
            PERMISSIONS.VIEW_CAMPAIGNS,
            PERMISSIONS.CREATE_CAMPAIGNS,
            PERMISSIONS.EDIT_CAMPAIGNS,
            PERMISSIONS.DELETE_CAMPAIGNS,
            PERMISSIONS.MANAGE_TEMPLATES,
            PERMISSIONS.MANAGE_SEGMENTS,
            PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS,
            PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS,
            PERMISSIONS.CONFIGURE_CHANNELS
          ]}>
            <Link
              href="/campaigns"
              className={`flex items-center px-2 py-2 rounded-lg ${location.startsWith('/campaigns') ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location.startsWith('/campaigns') ? companyStyle.activeItem : {}}
            >
              <i className="ri-megaphone-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.campaigns', 'Campaigns')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]}>
            <Link
              href="/call-logs"
              className={`flex items-center px-2 py-2 rounded-lg ${location.startsWith('/call-logs') ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location.startsWith('/call-logs') ? companyStyle.activeItem : {}}
            >
              <i className="ri-phone-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.call_logs', 'Call Logs')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.MANAGE_TEMPLATES]}>
            <Link
              href="/templates"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/templates' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/templates' ? companyStyle.activeItem : {}}
            >
              <i className="ri-file-list-3-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.templates', 'Templates')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.VIEW_DETAILED_ANALYTICS]}>
            <Link
              href="/analytics"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/analytics' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/analytics' ? companyStyle.activeItem : {}}
            >
              <i className="ri-bar-chart-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.analytics', 'Analytics')}</span>
            </Link>
          </PermissionGate>
        </div>

        <PermissionGate permissions={[PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]}>
          <div className="mt-8 pt-4 border-t border-border/50">
            <h3 className={`text-xs uppercase tracking-wide text-muted-foreground mb-2 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.channels', 'Channels')}</h3>
            <div className="flex flex-col space-y-1">
              {channelConnections.map((connection: any) => {
              let icon: string | React.ComponentType<any>;
              let color: string;
              let isComponent = false;

              switch(connection.channelType) {
                case 'whatsapp_official':
                  icon = "ri-whatsapp-line";
                  color = "#25D366";
                  break;
                case 'whatsapp_unofficial':
                  icon = "ri-whatsapp-line";
                  color = "#25D366";
                  break;
                case 'messenger':
                  icon = "ri-messenger-line";
                  color = "#1877F2";
                  break;
                case 'instagram':
                  icon = "ri-instagram-line";
                  color = "#E4405F";
                  break;
                case 'tiktok':
                  icon = "ri-tiktok-line";
                  color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                  break;
                case 'email':
                  icon = "ri-mail-line";
                  color = "#0078D4";
                  break;
                case 'twilio_sms':
                case 'twilio_voice':
                  icon = TwilioIcon;
                  isComponent = true;
                  color = "#ffffff"; // Always white in sidebar to match sidebar text colors
                  break;
                case 'webchat':
                  icon = "ri-message-3-line";
                  color = "#6366f1";
                  break;
                
                default:
                  icon = "ri-message-3-line";
                  color = "#a1f15bff";
              }

              const isActive = activeChannelId === connection.id;
              const IconComponent = isComponent ? icon as React.ComponentType<any> : null;

              return (
                <button
                  key={connection.id}
                  className={`flex items-center px-2 py-2 rounded-lg w-full text-left ${isActive ? 'bg-background/20 text-white' : 'text-white/60 hover:bg-background/20 hover:text-white'}`}
                  onClick={() => handleChannelClick(connection.id)}
                >
                  {isComponent && IconComponent ? (
                    <IconComponent className="w-5 h-5" />
                  ) : (
                    <i className={`${icon} text-xl`} style={{ color: isActive ? 'white' : color }}></i>
                  )}
                  <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'} truncate`}>
                    {connection.accountName}
                  </span>
                </button>
              );
              })}
            </div>
          </div>
        </PermissionGate>

        <div className="mt-auto pt-4">
          <TrialStatus isCollapsed={isCollapsed} />

          <PermissionGate permissions={[PERMISSIONS.VIEW_PAGES, PERMISSIONS.MANAGE_PAGES]}>
            <Link
              href="/pages"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/pages' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/pages' ? companyStyle.activeItem : {}}
            >
              <i className="ri-file-text-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.pages', 'Pages')}</span>
            </Link>
          </PermissionGate>

          <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
            <Link
              href="/settings"
              className={`flex items-center px-2 py-2 rounded-lg ${location === '/settings' ? 'text-white' : 'text-white/60 hover:text-white'}`}
              style={location === '/settings' ? companyStyle.activeItem : {}}
            >
              <i className="ri-settings-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.settings', 'Settings')}</span>
            </Link>
          </PermissionGate>
            <a
            href={getHelpSupportUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-2 py-2 rounded-lg w-full text-left text-white/60 hover:text-white"
            >
            <i className="ri-question-line text-xl"></i>
            <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.help_support', 'Help & Support')}</span>
            </a>

            <Link
              href="/settings?tab=billing"
              className="flex items-center px-2 py-2 rounded-lg w-full text-left text-white/60 hover:text-white"
            >
              <i className="ri-bank-card-line text-xl"></i>
              <span className={`ml-3 ${isCollapsed ? 'hidden' : 'block'}`}>{t('nav.billing', 'Billing & Subscription')}</span>
            </Link>

          {company && (
            <div className={`mt-4 pt-4 border-t border-border/50 text-xs text-white/50 ${isCollapsed ? 'hidden' : 'block'}`}>
              <div className="px-2 space-y-1">
                <div>{t('nav.company', 'Company')}: {company.name}</div>
                <div>{t('nav.plan', 'Plan')}: <span className="capitalize">{company.plan}</span></div>
                {(() => {
                  const renewalInfo = getRenewalDisplayInfo();
                  return renewalInfo ? (
                    <div className={`flex items-center gap-1 ${renewalInfo.color}`}>
                      <i className={`${renewalInfo.icon} text-xs`}></i>
                      <span>{renewalInfo.text}</span>
                    </div>
                  ) : null;
                })()}

                {/* Manual Renewal Button for Expired Subscriptions */}
                {isSubscriptionExpired() && (
                  <button
                    onClick={handleManualRenewal}
                    className="mt-2 w-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium py-2 px-3 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <i className="ri-refresh-line text-sm"></i>
                    <span>{t('nav.renew_subscription', 'Renew Subscription')}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
