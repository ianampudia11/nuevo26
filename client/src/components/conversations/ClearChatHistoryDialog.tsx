import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';

interface ClearChatHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  conversationName: string;
  isGroupChat: boolean;
  onSuccess?: () => void;
}

export function ClearChatHistoryDialog({
  isOpen,
  onClose,
  conversationId,
  conversationName,
  isGroupChat,
  onSuccess
}: ClearChatHistoryDialogProps) {
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { branding } = useBranding();

  const handleClearHistory = async () => {
    if (isClearing) return;

    setIsClearing(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/history`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to clear chat history');
      }

      const result = await response.json();

      toast({
        title: t('clear_history.success_title', 'Chat History Cleared'),
        description: t(
          'clear_history.success_description', 
          `Successfully cleared ${result.deletedMessageCount} messages and ${result.deletedMediaCount} media files.`
        ),
        variant: 'default'
      });

      onClose();
      onSuccess?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('clear_history.error_generic', 'Failed to clear chat history');

      toast({
        title: t('clear_history.error_title', 'Clear Failed'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleCancel = () => {
    if (!isClearing) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-medium text-foreground">
                {isGroupChat
                  ? t('clear_history.confirm_group_title', 'Clear Group Chat History')
                  : t('clear_history.confirm_title', 'Clear Chat History')
                }
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <DialogDescription className="text-sm text-gray-600 space-y-3">
          <p>
            {isGroupChat
              ? t(
                  'clear_history.confirm_group_message',
                  `Are you sure you want to clear all chat history for "${conversationName}"? This will permanently delete all messages and media files from ${branding.appName}.`,
                  { conversationName, appName: branding.appName }
                )
              : t(
                  'clear_history.confirm_message',
                  `Are you sure you want to clear all chat history with "${conversationName}"? This will permanently delete all messages and media files from ${branding.appName}.`,
                  { conversationName, appName: branding.appName }
                )
            }
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">
                  {t('clear_history.warning_title', 'Important:')}
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>
                    {t(
                      'clear_history.warning_irreversible',
                      'This action cannot be undone'
                    )}
                  </li>
                  <li>
                    {t(
                      'clear_history.warning_local_only',
                      `Messages will only be deleted from ${branding.appName}, not from WhatsApp`,
                      { appName: branding.appName }
                    )}
                  </li>
                  <li>
                    {t(
                      'clear_history.warning_media',
                      'All associated media files will be permanently deleted'
                    )}
                  </li>
                  <li>
                    {isGroupChat
                      ? t(
                          'clear_history.warning_group_preserved',
                          'Group information and participants will be preserved'
                        )
                      : t(
                          'clear_history.warning_contact_preserved',
                          'Contact information will be preserved'
                        )
                    }
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </DialogDescription>

        <DialogFooter className="flex justify-end space-x-3 pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isClearing}
            className="min-w-[80px]"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleClearHistory}
            disabled={isClearing}
            className="min-w-[120px] flex items-center space-x-2"
          >
            {isClearing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('clear_history.clearing', 'Clearing...')}</span>
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                <span>{t('clear_history.clear_button', 'Clear History')}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
