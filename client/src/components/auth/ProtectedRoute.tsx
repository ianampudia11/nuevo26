import React from 'react';
import { useLocation } from 'wouter';
import { usePermissions, Permission } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
  fallbackPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permission,
  permissions,
  requireAll = false,
  fallbackPath = '/access-denied'
}) => {
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission, hasAnyPermission, hasAllPermissions, isLoading: permissionsLoading } = usePermissions();
  const [, setLocation] = useLocation();

  if (authLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Checking permissions...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation('/auth');
    return null;
  }

  let hasAccess = false;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    hasAccess = true;
  }

  if (!hasAccess) {
    setLocation(fallbackPath);
    return null;
  }

  return <>{children}</>;
};

export const withRouteProtection = (
  permission?: Permission,
  permissions?: Permission[],
  requireAll?: boolean,
  fallbackPath?: string
) => {
  return <P extends object>(Component: React.ComponentType<P>) => {
    const ProtectedComponent = (props: P) => {
      return (
        <ProtectedRoute
          permission={permission}
          permissions={permissions}
          requireAll={requireAll}
          fallbackPath={fallbackPath}
        >
          <Component {...props} />
        </ProtectedRoute>
      );
    };

    ProtectedComponent.displayName = `withRouteProtection(${Component.displayName || Component.name})`;

    return ProtectedComponent;
  };
};

export const AdminOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['manage_settings', 'manage_team']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const SettingsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_settings', 'manage_settings']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const AnalyticsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_analytics', 'view_detailed_analytics']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TeamRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_team', 'manage_team']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const FlowsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_flows', 'manage_flows']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ContactsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_contacts', 'manage_contacts']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TasksRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_tasks', 'manage_tasks']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const PipelineRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_pipeline', 'manage_pipeline']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CalendarRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_calendar', 'manage_calendar']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const ChannelsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_channels', 'manage_channels']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CampaignsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={[
    'view_campaigns',
    'create_campaigns',
    'edit_campaigns',
    'delete_campaigns',
    'manage_templates',
    'manage_segments',
    'view_campaign_analytics',
    'manage_whatsapp_accounts',
    'configure_channels'
  ]} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const PagesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_pages', 'manage_pages']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const TemplatesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['manage_templates']} requireAll={false}>
    {children}
  </ProtectedRoute>
);

export const CallLogsRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ProtectedRoute permissions={['view_call_logs', 'manage_call_logs']} requireAll={false}>
    {children}
  </ProtectedRoute>
);