import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { TikTokConnectionHealth } from '@shared/types/tiktok';
import {
  RefreshCw,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Shield,
  Globe,
  MessageSquare,
  Info
} from 'lucide-react';

interface TikTokConnectionDiagnosticsProps {
  connectionId: number;
  onReconnect?: () => void;
}

export default function TikTokConnectionDiagnostics({ connectionId, onReconnect }: TikTokConnectionDiagnosticsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: health, refetch, isLoading } = useQuery({
    queryKey: ['tiktok-diagnostics', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/diagnostics`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch diagnostics');
      const json = await response.json();
      return json.health as TikTokConnectionHealth;
    },
    refetchInterval: 30000,
    enabled: !!connectionId
  });

  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/refresh-token`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Refresh failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiktok-diagnostics', connectionId] });
      toast({ title: 'Token refreshed', description: 'Connection token has been refreshed.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' });
    }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({ title: 'Diagnostics refreshed', description: 'Connection diagnostics have been updated.' });
    } catch {
      toast({ title: 'Refresh failed', description: 'Failed to refresh diagnostics.', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatDate = (d: Date | string | null) => {
    if (!d) return 'Never';
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString();
  };

  const formatTimeAgo = (d: Date | string | null) => {
    if (!d) return 'Never';
    const date = typeof d === 'string' ? new Date(d) : d;
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const formatTokenExpiry = (d: Date | string) => {
    const date = typeof d === 'string' ? new Date(d) : d;
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `In ${days} day${days !== 1 ? 's' : ''}`;
    return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            TikTok Connection Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            TikTok Connection Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Unable to load diagnostics</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            TikTok Connection Diagnostics
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Health Score</span>
            <Badge variant={health.healthScore >= 80 ? 'default' : health.healthScore >= 60 ? 'secondary' : 'destructive'}>
              {health.healthScore}/100
            </Badge>
          </div>
          <Progress value={health.healthScore} className="h-2" />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Status</span>
            </div>
            <Badge variant={health.status === 'connected' ? 'default' : 'secondary'}>
              {health.status === 'connected' && '✓ Connected'}
              {health.status === 'token_expiring' && 'Token Expiring'}
              {health.status === 'disconnected' && 'Disconnected'}
              {health.status === 'error' && 'Error'}
            </Badge>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Token Expires</span>
            </div>
            <span className={`text-sm ${getHealthScoreColor(health.healthScore)}`}>
              {formatTokenExpiry(health.tokenExpiresAt)}
            </span>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          <span>Last successful call: {formatTimeAgo(health.lastSuccessfulCall)}</span>
        </div>
        {health.errorCount > 0 && (
          <div className="text-sm">
            <span className="text-muted-foreground">Error count: </span>
            <Badge variant="destructive">{health.errorCount}</Badge>
            {health.lastError && (
              <p className="mt-1 text-destructive text-xs">{health.lastError}</p>
            )}
          </div>
        )}

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Granted Scopes
          </h4>
          <div className="flex flex-wrap gap-1">
            {health.grantedScopes.map((scope) => (
              <Badge key={scope} variant="default" className="text-xs">
                ✓ {scope}
              </Badge>
            ))}
            {health.missingScopes.length > 0 && (
              <div className="mt-2">
                <span className="text-xs text-amber-600">Missing: {health.missingScopes.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Region
          </h4>
          <p className="text-sm">
            {health.regionRestrictions.region}
            {health.regionRestrictions.isRestricted && (
              <Badge variant="destructive" className="ml-2">Restricted</Badge>
            )}
          </p>
          {health.regionRestrictions.unavailableFeatures.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Unavailable: {health.regionRestrictions.unavailableFeatures.join(', ')}
            </p>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshTokenMutation.mutate()}
            disabled={refreshTokenMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshTokenMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Token
          </Button>
          {onReconnect && (
            <Button variant="outline" size="sm" onClick={onReconnect}>
              Reconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
