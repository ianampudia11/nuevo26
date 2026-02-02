import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Wifi, Power, PowerOff } from "lucide-react";
import useSocket from '@/hooks/useSocket';

interface ConnectionControlProps {
  connectionId: number;
  status: string;
  onStatusChange?: (newStatus: string) => void;
  onReconnectClick?: () => void;
  diagnostics?: any;
  showDiagnostics?: boolean;
  channelType?: string;
  onQrCodeNeeded?: (connectionId: number) => void;
}

const ConnectionControl: React.FC<ConnectionControlProps> = ({
  connectionId,
  status,
  onStatusChange,
  onReconnectClick,
  diagnostics,
  showDiagnostics = false,
  channelType,
  onQrCodeNeeded
}) => {
  const queryClient = useQueryClient();
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [localStatus, setLocalStatus] = useState(status);

  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    setLocalStatus(status);

    if (status === 'reconnecting') {
      setReconnectAttempts(prev => prev + 1);
    } else if (status === 'connected' || status === 'active') {
      setReconnectAttempts(0);
      setIsReconnecting(false);
      setIsDisconnecting(false);
    } else if (status === 'disconnected' || status === 'error' || status === 'failed') {
      setIsReconnecting(false);
      setIsDisconnecting(false);
    }
  }, [status]);




  useEffect(() => {
    const unsubscribe = onMessage('whatsappQrCodeRequired', (event: any) => {
      if (event.connectionId === connectionId) {
        toast({
          title: "QR Code Required",
          description: event.message || "Your session has expired. Please click 'Rescan QR' to reconnect.",
          variant: "default",
          duration: 10000, // Show for 10 seconds
        });
        

        setLocalStatus('qr_code');
        if (onStatusChange) {
          onStatusChange('qr_code');
        }
      }
    });

    return unsubscribe;
  }, [connectionId, onMessage, onStatusChange]);

  const handleReconnect = async () => {
    if (!connectionId || isReconnecting || isDisconnecting) return;

    if (onReconnectClick) {
      onReconnectClick();
      return;
    }

    setIsReconnecting(true);
    setReconnectAttempts(prev => prev + 1);

    try {
      const response = await fetch(`/api/channel-connections/${connectionId}/reconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reconnect WhatsApp');
      }

      toast({
        title: "Reconnection initiated",
        description: `Attempting to reconnect your WhatsApp connection... (Attempt ${reconnectAttempts + 1})`,
      });

      setLocalStatus('reconnecting');
      if (onStatusChange) {
        onStatusChange('reconnecting');
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
      }, 2000);

    } catch (error) {
      console.error('Error reconnecting WhatsApp:', error);
      toast({
        title: "Reconnection failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
      setIsReconnecting(false);
      setLocalStatus('error');

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId || isDisconnecting || isReconnecting) return;

    setIsDisconnecting(true);

    try {
      const response = await fetch(`/api/whatsapp/disconnect/${connectionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to disconnect WhatsApp');
      }

      toast({
        title: "Disconnection successful",
        description: "Your WhatsApp connection has been disconnected.",
      });

      setLocalStatus('disconnected');
      if (onStatusChange) {
        onStatusChange('disconnected');
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
      }, 1000);

    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      toast({
        title: "Disconnection failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
      setIsDisconnecting(false);

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
    }
  };





  const normalizedStatus = localStatus?.toLowerCase()?.trim() || 'unknown';



  const isConnected = normalizedStatus === 'connected' || normalizedStatus === 'active';

  const disconnectedStates = [
    'error', 'disconnected', 'failed', 'timeout', 'logged_out',
    'inactive', 'unknown', 'offline', 'closed', 'qr_code'
  ];


  const isWhatsAppOfficial = channelType === 'whatsapp_official';
  const showReconnect = onReconnectClick && disconnectedStates.includes(normalizedStatus) && !isReconnecting && !isWhatsAppOfficial;

  const showDisconnect = onReconnectClick && isConnected && !isDisconnecting && !isReconnecting && !isWhatsAppOfficial;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">

        {showDisconnect && (
          <Button
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            {isDisconnecting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                <span className="text-xs">Disconnecting...</span>
              </>
            ) : (
              <>
                <PowerOff className="h-3 w-3 mr-1" />
                <span className="text-xs">Disconnect</span>
              </>
            )}
          </Button>
        )}

        {showReconnect && (
          <Button
            onClick={handleReconnect}
            disabled={isReconnecting}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
          >
            {isReconnecting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                <span className="text-xs">Reconnecting...</span>
              </>
            ) : normalizedStatus === 'qr_code' ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1" />
                <span className="text-xs">Rescan QR</span>
              </>
            ) : (
              <>
                <Power className="h-3 w-3 mr-1" />
                <span className="text-xs">Reconnect</span>
              </>
            )}
          </Button>
        )}

        {diagnostics && showDiagnostics && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={diagnostics.healthScore > 70 ? "default" : diagnostics.healthScore > 40 ? "secondary" : "destructive"}
                className="text-xs"
              >
                {diagnostics.healthScore}%
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p className="font-medium">Connection Health</p>
                <p className="text-xs text-muted-foreground">
                  Score: {diagnostics.healthScore}/100
                </p>
                <p className="text-xs text-muted-foreground">
                  Errors: {diagnostics.errorCount}
                </p>
                {diagnostics.lastError && (
                  <p className="text-xs text-red-500 mt-1">
                    Last Error: {diagnostics.lastError}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
};

export default ConnectionControl;