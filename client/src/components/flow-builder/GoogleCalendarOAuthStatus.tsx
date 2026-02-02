import React, { useState } from 'react';
import { ExternalLink, AlertCircle, CheckCircle2, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';

interface GoogleCalendarOAuthStatusProps {
  onAuthSuccess?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

export function GoogleCalendarOAuthStatus({ onAuthSuccess, onDisconnect, className }: GoogleCalendarOAuthStatusProps) {
  const {
    isConnected,
    isLoadingStatus,
    isAuthenticating,
    authenticate,
    disconnect
  } = useGoogleCalendarAuth();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnectClick = async () => {
    const success = await authenticate();
    if (success) {
      onAuthSuccess?.();
    }
  };

  const handleDisconnectClick = async () => {

    if (!confirm('Are you sure you want to disconnect your Google Calendar account? You will need to reconnect to use Google Calendar features.')) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const success = await disconnect();
      if (success) {
        onDisconnect?.();
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (isLoadingStatus) {
    return (
      <div className={className}>
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Checking Connection</AlertTitle>
          <AlertDescription>
            Verifying your Google Calendar connection status...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={className}>
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-600 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConnectClick}
                disabled={isAuthenticating || isDisconnecting}
                variant="outline"
                size="sm"
                className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                title="Connect a different Google account"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Switching...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-3 w-3" />
                    Switch Account
                  </>
                )}
              </Button>
              <Button
                onClick={handleDisconnectClick}
                disabled={isDisconnecting || isAuthenticating}
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                title="Disconnect Google Calendar integration"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-3 w-3" />
                    Disconnect
                  </>
                )}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={className}>
      <Alert className="bg-amber-50 border-amber-200">
        <AlertCircle className="h-4 w-4 text-amber-500" />
        <AlertTitle className="text-amber-700">Authentication Required</AlertTitle>
        <AlertDescription className="text-amber-600 space-y-3">
          <p>Connect your Google Calendar account to use this.</p>
          <Button
            onClick={handleConnectClick}
            disabled={isAuthenticating}
            className="bg-blue-500 hover:bg-blue-600 text-white"
            size="sm"
          >
            {isAuthenticating ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <ExternalLink className="mr-2 h-3 w-3" />
                Connect Google Calendar
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
