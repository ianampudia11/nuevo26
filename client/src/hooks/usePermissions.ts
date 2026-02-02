import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './use-auth';

export const PERMISSIONS = {
  VIEW_ALL_CONVERSATIONS: 'view_all_conversations',
  VIEW_ASSIGNED_CONVERSATIONS: 'view_assigned_conversations',
  ASSIGN_CONVERSATIONS: 'assign_conversations',
  MANAGE_CONVERSATIONS: 'manage_conversations',

  VIEW_CONTACTS: 'view_contacts',
  VIEW_OWN_CONTACTS: 'view_own_contacts',
  VIEW_ASSIGNED_CONTACTS: 'view_assigned_contacts',
  VIEW_COMPANY_CONTACTS: 'view_company_contacts',
  MANAGE_CONTACTS: 'manage_contacts',
  VIEW_CONTACT_PHONE: 'view_contact_phone',

  VIEW_CHANNELS: 'view_channels',
  MANAGE_CHANNELS: 'manage_channels',

  VIEW_FLOWS: 'view_flows',
  MANAGE_FLOWS: 'manage_flows',

  VIEW_ANALYTICS: 'view_analytics',
  VIEW_DETAILED_ANALYTICS: 'view_detailed_analytics',

  VIEW_TEAM: 'view_team',
  MANAGE_TEAM: 'manage_team',

  VIEW_SETTINGS: 'view_settings',
  MANAGE_SETTINGS: 'manage_settings',

  VIEW_PIPELINE: 'view_pipeline',
  MANAGE_PIPELINE: 'manage_pipeline',

  VIEW_CALENDAR: 'view_calendar',
  MANAGE_CALENDAR: 'manage_calendar',


  VIEW_CAMPAIGNS: 'view_campaigns',
  CREATE_CAMPAIGNS: 'create_campaigns',
  EDIT_CAMPAIGNS: 'edit_campaigns',
  DELETE_CAMPAIGNS: 'delete_campaigns',
  MANAGE_TEMPLATES: 'manage_templates',
  MANAGE_SEGMENTS: 'manage_segments',
  VIEW_CAMPAIGN_ANALYTICS: 'view_campaign_analytics',
  MANAGE_WHATSAPP_ACCOUNTS: 'manage_whatsapp_accounts',
  CONFIGURE_CHANNELS: 'configure_channels',

  VIEW_PAGES: 'view_pages',
  MANAGE_PAGES: 'manage_pages',

  VIEW_TASKS: 'view_tasks',
  MANAGE_TASKS: 'manage_tasks',

  VIEW_CALL_LOGS: 'view_call_logs',
  MANAGE_CALL_LOGS: 'manage_call_logs',
  EXPORT_CALL_LOGS: 'export_call_logs',
  DELETE_CALL_LOGS: 'delete_call_logs'
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

interface UserPermissions {
  [key: string]: boolean;
}

const fetchUserPermissions = async (): Promise<UserPermissions> => {
  const response = await fetch('/api/users/permissions', {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user permissions');
  }

  return response.json();
};

export const usePermissions = () => {
  const { user } = useAuth();

  const {
    data: permissions = {},
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['userPermissions', user?.id],
    queryFn: fetchUserPermissions,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const hasPermission = (permission: Permission): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissions[permission] === true;
  };

  const hasAnyPermission = (permissionList: Permission[]): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissionList.some(permission => permissions[permission] === true);
  };

  const hasAllPermissions = (permissionList: Permission[]): boolean => {
    if (user?.isSuperAdmin) {
      return true;
    }

    return permissionList.every(permission => permissions[permission] === true);
  };

  const canViewAllConversations = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ALL_CONVERSATIONS);
  };

  const canOnlyViewAssignedConversations = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS) &&
           !hasPermission(PERMISSIONS.VIEW_ALL_CONVERSATIONS);
  };

  const canAssignConversations = (): boolean => {
    return hasPermission(PERMISSIONS.ASSIGN_CONVERSATIONS);
  };

  const canManageConversations = (): boolean => {
    return hasPermission(PERMISSIONS.MANAGE_CONVERSATIONS);
  };

  const canAccessSettings = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]);
  };

  const canAccessAnalytics = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.VIEW_DETAILED_ANALYTICS]);
  };

  const canAccessTeam = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_TEAM, PERMISSIONS.MANAGE_TEAM]);
  };

  const canAccessPipeline = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_PIPELINE, PERMISSIONS.MANAGE_PIPELINE]);
  };

  const canAccessFlows = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_FLOWS, PERMISSIONS.MANAGE_FLOWS]);
  };

  const canAccessChannels = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CHANNELS, PERMISSIONS.MANAGE_CHANNELS]);
  };

  const canAccessContacts = (): boolean => {
    return hasAnyPermission([
      PERMISSIONS.VIEW_CONTACTS,
      PERMISSIONS.VIEW_OWN_CONTACTS,
      PERMISSIONS.VIEW_ASSIGNED_CONTACTS,
      PERMISSIONS.VIEW_COMPANY_CONTACTS,
      PERMISSIONS.MANAGE_CONTACTS
    ]);
  };

  const canViewOwnContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_OWN_CONTACTS);
  };

  const canViewAssignedContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_ASSIGNED_CONTACTS);
  };

  const canViewCompanyContacts = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_COMPANY_CONTACTS);
  };

  const canViewContactPhone = (): boolean => {
    return hasPermission(PERMISSIONS.VIEW_CONTACT_PHONE);
  };

  const getContactViewScope = (): 'own' | 'assigned' | 'company' | null => {
    if (user?.isSuperAdmin || hasPermission(PERMISSIONS.VIEW_COMPANY_CONTACTS)) {
      return 'company';
    }
    if (hasPermission(PERMISSIONS.VIEW_ASSIGNED_CONTACTS)) {
      return 'assigned';
    }
    if (hasPermission(PERMISSIONS.VIEW_OWN_CONTACTS)) {
      return 'own';
    }
    return null;
  };

  const canAccessCalendar = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CALENDAR, PERMISSIONS.MANAGE_CALENDAR]);
  };

  const canAccessCampaigns = (): boolean => {
    return hasAnyPermission([
      PERMISSIONS.VIEW_CAMPAIGNS,
      PERMISSIONS.CREATE_CAMPAIGNS,
      PERMISSIONS.EDIT_CAMPAIGNS,
      PERMISSIONS.DELETE_CAMPAIGNS,
      PERMISSIONS.MANAGE_TEMPLATES,
      PERMISSIONS.MANAGE_SEGMENTS,
      PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS,
      PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS,
      PERMISSIONS.CONFIGURE_CHANNELS
    ]);
  };

  const canAccessTasks = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_TASKS, PERMISSIONS.MANAGE_TASKS]);
  };

  const canAccessCallLogs = (): boolean => {
    return hasAnyPermission([PERMISSIONS.VIEW_CALL_LOGS, PERMISSIONS.MANAGE_CALL_LOGS]);
  };

  const canManageCallLogs = (): boolean => {
    return hasPermission(PERMISSIONS.MANAGE_CALL_LOGS);
  };

  const canExportCallLogs = (): boolean => {
    return hasPermission(PERMISSIONS.EXPORT_CALL_LOGS);
  };

  return {
    permissions,
    isLoading,
    error,
    refetch,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canViewAllConversations,
    canOnlyViewAssignedConversations,
    canAssignConversations,
    canManageConversations,
    canAccessSettings,
    canAccessAnalytics,
    canAccessTeam,
    canAccessPipeline,
    canAccessFlows,
    canAccessChannels,
    canAccessContacts,
    canViewOwnContacts,
    canViewAssignedContacts,
    canViewCompanyContacts,
    canViewContactPhone,
    getContactViewScope,
    canAccessCalendar,
    canAccessCampaigns,
    canAccessTasks,
    canAccessCallLogs,
    canManageCallLogs,
    canExportCallLogs,
    PERMISSIONS
  };
};

export const withPermission = (permission: Permission) => {
  return <P extends object>(Component: React.ComponentType<P>) => {
    const WrappedComponent = (props: P) => {
      const { hasPermission } = usePermissions();

      if (!hasPermission(permission)) {
        return null;
      }

      return React.createElement(Component, props);
    };

    return WrappedComponent;
  };
};

export const PermissionGate: React.FC<{
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  return hasAccess ? React.createElement(React.Fragment, null, children) : React.createElement(React.Fragment, null, fallback);
};
