import React from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock, Users, Activity, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  configStatus: any;
}

export function MetaConfigurationStatusDashboard({ configStatus }: Props) {
  const health = configStatus?.health || {};
  const checks = health?.checks || {};
  const metrics = health?.metrics || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'unhealthy':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (valid: boolean) => {
    return valid ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    );
  };

  const formatTimestamp = (timestamp: string | Date | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Overall Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            Overall Health Status
          </CardTitle>
          <CardDescription>
            Last checked: {formatTimestamp(health?.timestamp)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className={`w-4 h-4 rounded-full ${getStatusColor(health?.status || 'unknown')}`} />
            <span className="text-lg font-medium capitalize">{health?.status || 'Unknown'}</span>
            {metrics.responseTime && (
              <span className="text-sm text-gray-600">
                Response Time: {metrics.responseTime}ms
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Health Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Health Checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getStatusIcon(checks.credentials?.valid)}
              <span>Credentials</span>
            </div>
            {checks.credentials?.error && (
              <span className="text-sm text-red-500">{checks.credentials.error}</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getStatusIcon(checks.webhook?.reachable)}
              <span>Webhook Connectivity</span>
            </div>
            {checks.webhook?.error && (
              <span className="text-sm text-red-500">{checks.webhook.error}</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getStatusIcon(checks.subscriptions?.valid)}
              <span>Webhook Subscriptions</span>
            </div>
            {checks.subscriptions?.error && (
              <span className="text-sm text-red-500">{checks.subscriptions.error}</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {getStatusIcon(checks.api?.accessible)}
              <span>API Accessibility</span>
            </div>
            {checks.api?.error && (
              <span className="text-sm text-red-500">{checks.api.error}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Last Validated:</span>
                <span className="ml-2 font-medium">
                  {formatTimestamp(configStatus?.lastValidatedAt)}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Validation Status:</span>
                <Badge className="ml-2" variant={configStatus?.health?.status === 'healthy' ? 'default' : 'destructive'}>
                  {configStatus?.health?.status || 'Unknown'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Usage Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Companies Using:</span>
                <span className="ml-2 font-medium">{configStatus?.usageCount || 0}</span>
              </div>
              <div>
                <span className="text-gray-600">Last Used:</span>
                <span className="ml-2 font-medium">
                  {formatTimestamp(configStatus?.lastUsedAt)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Field Subscriptions */}
      {configStatus?.config?.webhookFieldSubscriptions && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook Field Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['messages', 'message_template_status_update'].map((field) => {
                const subscription = configStatus.config.webhookFieldSubscriptions[field];
                return (
                  <div key={field} className="flex items-center justify-between">
                    <span className="text-sm">{field}</span>
                    {subscription?.subscribed ? (
                      <Badge variant="default">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Subscribed
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <XCircle className="w-3 h-3 mr-1" />
                        Not Subscribed
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Troubleshooting Tips */}
      {health?.status !== 'healthy' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-yellow-600" />
              Troubleshooting Tips
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-800">
            <ul className="list-disc pl-5 space-y-1">
              {!checks.credentials?.valid && (
                <li>Verify your App ID, App Secret, and Business Manager ID are correct</li>
              )}
              {!checks.webhook?.reachable && (
                <li>Ensure your webhook URL is publicly accessible and uses HTTPS</li>
              )}
              {!checks.subscriptions?.valid && (
                <li>Check that webhook subscriptions are properly configured in Meta Business Manager</li>
              )}
              {!checks.api?.accessible && (
                <li>Verify your access token has the required permissions</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

