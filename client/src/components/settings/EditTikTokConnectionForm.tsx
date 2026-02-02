import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Loader2, CheckCircle, RefreshCw, User, AtSign, Calendar } from 'lucide-react';

interface TikTokConnectionData {
  openId: string;
  unionId?: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isVerified: boolean;
  tokenExpiresAt: number;
  scopes?: string[];
  lastSyncAt: number;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  connectionId: number;
}

export function EditTikTokConnectionForm({ isOpen, onClose, onSuccess, connectionId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [connectionData, setConnectionData] = useState<TikTokConnectionData | null>(null);
  const [accountName, setAccountName] = useState('');

  useEffect(() => {
    if (isOpen && connectionId) {
      loadConnectionData();
    }
  }, [isOpen, connectionId]);

  const loadConnectionData = async () => {
    setLoadingConnection(true);
    try {
      const response = await fetch(`/api/channel-connections/${connectionId}`);
      if (!response.ok) {
        throw new Error('Failed to load connection data');
      }
      
      const connection = await response.json();
      setAccountName(connection.accountName || '');
      setConnectionData(connection.connectionData as TikTokConnectionData);
    } catch (error: any) {
      console.error('Error loading connection data:', error);
      toast({
        title: "Error",
        description: "Failed to load connection data. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingConnection(false);
    }
  };

  const handleRefreshConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tiktok/refresh-connection/${connectionId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to refresh connection');
      }

      toast({
        title: "Success",
        description: "TikTok connection refreshed successfully!",
      });

      await loadConnectionData();
      onSuccess();
    } catch (error: any) {
      console.error('Error refreshing connection:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to refresh connection. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConnectionData(null);
    setAccountName('');
    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTokenExpiryStatus = () => {
    if (!connectionData?.tokenExpiresAt) return null;
    
    const now = Date.now();
    const expiresAt = connectionData.tokenExpiresAt;
    const daysUntilExpiry = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: 'expired', color: 'text-red-600 dark:text-red-400', message: 'Token expired' };
    } else if (daysUntilExpiry < 7) {
      return { status: 'expiring', color: 'text-orange-600 dark:text-orange-400', message: `Expires in ${daysUntilExpiry} days` };
    } else {
      return { status: 'valid', color: 'text-green-600 dark:text-green-400', message: `Valid for ${daysUntilExpiry} days` };
    }
  };

  const tokenStatus = getTokenExpiryStatus();

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl"></i>
            TikTok Connection Details
          </DialogTitle>
          <DialogDescription>
            View and manage your TikTok Business connection
          </DialogDescription>
        </DialogHeader>

        {loadingConnection ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : connectionData ? (
          <div className="space-y-6">
            {/* Account Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b dark:border-gray-700">
                {connectionData.avatarUrl && (
                  <img 
                    src={connectionData.avatarUrl} 
                    alt={connectionData.displayName}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{connectionData.displayName}</h3>
                    {connectionData.isVerified && (
                      <span className="text-blue-500 dark:text-blue-400" title="Verified Account">
                        <CheckCircle className="h-5 w-5" />
                      </span>
                    )}
                  </div>
                  {connectionData.username && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">@{connectionData.username}</p>
                  )}
                </div>
              </div>

              {/* Connection Details */}
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <User className="h-4 w-4 mt-0.5 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Account Name</Label>
                    <p className="text-sm font-medium">{accountName}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <AtSign className="h-4 w-4 mt-0.5 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Open ID</Label>
                    <p className="text-sm font-mono text-gray-700 dark:text-gray-300">{connectionData.openId}</p>
                  </div>
                </div>

                {connectionData.lastSyncAt && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <Calendar className="h-4 w-4 mt-0.5 text-gray-500 dark:text-gray-400" />
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">Last Sync</Label>
                      <p className="text-sm">{formatDate(connectionData.lastSyncAt)}</p>
                    </div>
                  </div>
                )}

                {/* Token Status */}
                {tokenStatus && (
                  <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <AlertCircle className={`h-4 w-4 mt-0.5 ${tokenStatus.color}`} />
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 dark:text-gray-400">Token Status</Label>
                      <p className={`text-sm font-medium ${tokenStatus.color}`}>
                        {tokenStatus.message}
                      </p>
                      {tokenStatus.status === 'expired' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Please refresh the connection to continue using TikTok messaging
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Connection Status */}
                <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Connection Status</Label>
                    <div className="flex items-center gap-2 mt-1">
                      {connectionData.status === 'active' && (
                        <>
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">Active</span>
                        </>
                      )}
                      {connectionData.status === 'error' && (
                        <>
                          <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">Error</span>
                        </>
                      )}
                      {connectionData.status === 'disconnected' && (
                        <>
                          <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Disconnected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scopes */}
                {connectionData.scopes && connectionData.scopes.length > 0 && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <Label className="text-xs text-gray-500 dark:text-gray-400">Permissions</Label>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {connectionData.scopes.map((scope, index) => (
                        <span 
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Warning for expired tokens */}
            {tokenStatus?.status === 'expired' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-400">Token Expired</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    Your TikTok access token has expired. Click "Refresh Connection" to renew your access.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No connection data available</p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleRefreshConnection}
            disabled={loading || loadingConnection}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh Connection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

