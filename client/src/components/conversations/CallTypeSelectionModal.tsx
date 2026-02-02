import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, Bot, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { requestMicrophoneAccess, checkMicrophonePermission, stopMicrophoneStream } from '@/utils/microphone-permissions';

interface CallTypeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCallType: (callType: 'direct' | 'ai-powered') => void;
}

export const CallTypeSelectionModal: React.FC<CallTypeSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectCallType,
}) => {
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [micPermissionStatus, setMicPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt');


  useEffect(() => {
    if (isOpen) {
      setPermissionError(null);
      checkMicrophonePermission().then(setMicPermissionStatus);
    }
  }, [isOpen]);

  const handleDirectCallClick = async () => {
    setPermissionError(null);
    setIsRequestingPermission(true);

    try {

      const permissionStatus = await checkMicrophonePermission();
      
      if (permissionStatus === 'granted') {

        onSelectCallType('direct');
        return;
      }


      const result = await requestMicrophoneAccess();
      
      if (result.success && result.stream) {

        stopMicrophoneStream(result.stream);
        setMicPermissionStatus('granted');
        onSelectCallType('direct');
      }
    } catch (error: any) {
      console.error('[CallTypeSelectionModal] Microphone permission error:', error);
      

      let errorMsg = 'Failed to access microphone. Please check your browser settings and try again.';
      if (error.name === 'NotAllowedError') {
        errorMsg = 'Microphone permission denied. Please allow access in your browser settings and try again.';
        setMicPermissionStatus('denied');
      } else if (error.name === 'NotFoundError') {
        errorMsg = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMsg = 'Microphone is being used by another application. Please close other apps and try again.';
      }
      
      setPermissionError(errorMsg);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleRetry = () => {
    setPermissionError(null);
    handleDirectCallClick();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Call Type</DialogTitle>
          <DialogDescription>
            Select how you want to make this call
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <Button
            variant="outline"
            className="w-full p-6 h-auto flex flex-col items-center gap-3 border-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
            onClick={handleDirectCallClick}
            disabled={isRequestingPermission}
          >
            {isRequestingPermission ? (
              <Loader2 className="w-12 h-12 animate-spin" />
            ) : (
              <Mic className="w-12 h-12" />
            )}
            <div className="text-center">
              <div className="text-lg font-semibold">
                {isRequestingPermission ? 'Requesting Permission...' : 'Talk Directly'}
              </div>
              <div className="text-sm text-muted-foreground">
                You will speak with the customer
              </div>
            </div>
            {/* Microphone status badge */}
            <div className="flex items-center gap-1 text-xs mt-1">
              {micPermissionStatus === 'granted' ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span className="text-green-600">Microphone ready</span>
                </>
              ) : (
                <>
                  <Info className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Microphone access required</span>
                </>
              )}
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full p-6 h-auto flex flex-col items-center gap-3 border-2 hover:scale-105 hover:shadow-lg transition-all duration-200"
            onClick={() => onSelectCallType('ai-powered')}
            disabled={isRequestingPermission}
          >
            <Bot className="w-12 h-12" />
            <div className="text-center">
              <div className="text-lg font-semibold">Use AI Agent</div>
              <div className="text-sm text-muted-foreground">
                ElevenLabs AI will handle the conversation
              </div>
            </div>
          </Button>
        </div>

        {/* Permission error message */}
        {permissionError && (
          <div className="flex flex-col items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Microphone Access Required</span>
            </div>
            <p className="text-sm text-center text-muted-foreground">
              {permissionError}
            </p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Try Again
            </Button>
          </div>
        )}

        <div className="flex justify-center">
          <Button variant="ghost" onClick={onClose} disabled={isRequestingPermission}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
