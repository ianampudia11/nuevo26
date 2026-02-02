import React, { useState } from 'react';
import { ExternalLink, AlertCircle, CheckCircle2, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGoogleSheetsAuth } from '@/hooks/useGoogleSheetsAuth';

interface GoogleSheetsOAuthStatusProps {
  onAuthSuccess?: () => void;
  onDisconnect?: () => void;
  className?: string;
}

export function GoogleSheetsOAuthStatus({ onAuthSuccess, onDisconnect, className }: GoogleSheetsOAuthStatusProps) {
  const {
    isConnected,
    isLoadingStatus,
    isAuthenticating,
    authenticate,
    disconnect
  } = useGoogleSheetsAuth();

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnectClick = async () => {
    const success = await authenticate();
    if (success) {
      onAuthSuccess?.();
    }
  };

  const handleDisconnectClick = async () => {

    if (!confirm('Are you sure you want to disconnect your Google Sheets account? You will need to reconnect to use Google Sheets features.')) {
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
            Verifying your Google Sheets connection status...
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={className}>
        <Alert className="bg-primary/10 border-primary/20">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary">Connected</AlertTitle>
          <AlertDescription className="text-primary space-y-3">
            <p>Your Google Sheets is connected and ready to use.</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConnectClick}
                disabled={isAuthenticating || isDisconnecting}
                variant="outline"
                size="sm"
                className="border-primary/20 text-primary hover:bg-primary/10 hover:border-primary/30"
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
                className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                title="Disconnect Google Sheets integration"
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
      <Alert className="bg-muted/50 border-muted">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <AlertTitle className="text-foreground">Authentication Required</AlertTitle>
        <AlertDescription className="text-muted-foreground space-y-3">
          <p>Connect your Google Sheets account to use this node.</p>
          <Button
            onClick={handleConnectClick}
            disabled={isAuthenticating}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
                Connect Google Sheets
              </>
            )}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
