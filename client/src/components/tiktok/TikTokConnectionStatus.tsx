import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle } from 'lucide-react';
import TikTokConnectionDiagnostics from './TikTokConnectionDiagnostics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

interface TikTokConnectionStatusProps {
  connectionId: number;
  accountName?: string;
  avatarUrl?: string;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}

export default function TikTokConnectionStatus({
  connectionId,
  accountName,
  avatarUrl,
  onReconnect,
  onDisconnect
}: TikTokConnectionStatusProps) {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const { toast } = useToast();

  const { data: health, isLoading } = useQuery({
    queryKey: ['tiktok-diagnostics', connectionId],
    queryFn: async () => {
      const response = await fetch(`/api/tiktok/connections/${connectionId}/diagnostics`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch');
      const json = await response.json();
      return json.health;
    },
    refetchInterval: 60000,
    enabled: !!connectionId
  });

  const statusBadge = () => {
    if (isLoading || !health) return <Badge variant="secondary">Loading…</Badge>;
    const s = health.status;
    if (s === 'connected') return <Badge variant="default">Active</Badge>;
    if (s === 'token_expiring') return <Badge variant="secondary">Token Expiring</Badge>;
    if (s === 'disconnected') return <Badge variant="secondary">Disconnected</Badge>;
    return <Badge variant="destructive">Error</Badge>;
  };

  const lastSync = health?.lastSuccessfulCall
    ? (() => {
        const d = new Date(health.lastSuccessfulCall);
        const diff = Date.now() - d.getTime();
        const m = Math.floor(diff / 60000);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h} hour${h !== 1 ? 's' : ''} ago`;
        if (m > 0) return `${m} minute${m !== 1 ? 's' : ''} ago`;
        return 'Just now';
      })()
    : '—';

  const warnings = [];
  if (health?.status === 'token_expiring') {
    warnings.push('Token expiring within 7 days. Refresh token to avoid disconnection.');
  }
  if (health?.missingScopes?.length) {
    warnings.push('Missing required scopes: ' + health.missingScopes.join(', '));
  }
  if (health?.regionRestrictions?.isRestricted) {
    warnings.push('Region restrictions may limit some features.');
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <i className="ri-tiktok-line text-xl text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{accountName || 'TikTok Account'}</span>
                  {statusBadge()}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Last sync: {lastSync}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => setDiagnosticsOpen(true)}>
                View Diagnostics
              </Button>
              {onReconnect && (
                <Button variant="ghost" size="sm" onClick={onReconnect}>
                  Reconnect
                </Button>
              )}
              {onDisconnect && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDisconnect}>
                  Disconnect
                </Button>
              )}
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 space-y-2">
              {warnings.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={diagnosticsOpen} onOpenChange={setDiagnosticsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>TikTok Connection Diagnostics</DialogTitle>
          </DialogHeader>
          <TikTokConnectionDiagnostics connectionId={connectionId} onReconnect={onReconnect} />
        </DialogContent>
      </Dialog>
    </>
  );
}
