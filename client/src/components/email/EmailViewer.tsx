import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Reply, 
  ReplyAll, 
  Forward, 
  Archive, 
  Trash2, 
  Star, 
  MoreHorizontal,
  Paperclip,
  Download,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EmailMessage {
  id: number;
  conversationId: number;
  subject: string;
  from: string;
  to: string;
  content: string;
  htmlContent?: string;
  isRead: boolean;
  hasAttachments: boolean;
  createdAt: string;
  metadata?: any;
}

interface EmailAttachment {
  id: number;
  filename: string;
  contentType: string;
  size: number;
  downloadUrl: string;
}

interface EmailViewerProps {
  email: EmailMessage;
  channelId: number;
  onReply: () => void;
  onForward: () => void;
  onMarkAsRead?: (emailId: number, isRead: boolean) => Promise<void>;
  onStarEmail?: (emailId: number, starred: boolean) => Promise<void>;
  onArchiveEmail?: (emailId: number) => Promise<void>;
  onDeleteEmail?: (emailId: number) => Promise<void>;
}

export default function EmailViewer({
  email,
  channelId,
  onReply,
  onForward,
  onMarkAsRead,
  onStarEmail,
  onArchiveEmail,
  onDeleteEmail
}: EmailViewerProps) {
  const { t } = useTranslation();
  const [showFullHeaders, setShowFullHeaders] = useState(false);
  const [isStarred, setIsStarred] = useState(email.metadata?.starred || false);
  const [isArchived, setIsArchived] = useState(email.metadata?.archived || false);


  useEffect(() => {
    setIsStarred(email.metadata?.starred || false);
    setIsArchived(email.metadata?.archived || false);
  }, [email.id, email.metadata?.starred, email.metadata?.archived]);


  const { data: attachments = [] } = useQuery<EmailAttachment[]>({
    queryKey: ['/api/email/attachments', email.id],
    queryFn: async () => {
      const response = await fetch(`/api/email/messages/${email.id}/attachments`);
      if (!response.ok) throw new Error('Failed to fetch attachments');
      return response.json();
    },
    enabled: email.hasAttachments
  });


  useEffect(() => {
    if (!email.isRead) {
      onMarkAsRead?.(email.id, true);
    }
  }, [email.id, email.isRead]); // Removed onMarkAsRead from dependencies to prevent infinite loop

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownloadAttachment = (attachment: EmailAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.downloadUrl;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleStar = async () => {
    try {

      await onStarEmail?.(email.id, !isStarred);

    } catch (error) {
      console.error('Failed to toggle star:', error);
    }
  };

  const handleToggleArchive = async () => {
    try {

      await onArchiveEmail?.(email.id);

    } catch (error) {
      console.error('Failed to toggle archive:', error);
    }
  };

  const getEmailMetadata = () => {
    try {
      return typeof email.metadata === 'string' 
        ? JSON.parse(email.metadata) 
        : email.metadata || {};
    } catch {
      return {};
    }
  };

  const metadata = getEmailMetadata();

  return (
    <div className="flex flex-col h-full">
      {/* Email Header */}
      <div className="border-b border-border bg-background">
        <div className="p-6">
          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Button variant="brandOutline" size="sm" onClick={onReply}>
                <Reply className="h-4 w-4 mr-2" />
                {t('email.reply', 'Reply')}
              </Button>
              <Button variant="brandOutline" size="sm" onClick={() => {/* TODO: Reply All */}}>
                <ReplyAll className="h-4 w-4 mr-2" />
                {t('email.reply_all', 'Reply All')}
              </Button>
              <Button variant="brandOutline" size="sm" onClick={onForward}>
                <Forward className="h-4 w-4 mr-2" />
                {t('email.forward', 'Forward')}
              </Button>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={handleToggleStar}>
                <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleArchive}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isArchived ? t('email.unarchive', 'Unarchive') : t('email.archive', 'Archive')}</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDeleteEmail?.(email.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    {t('email.print', 'Print')}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    {t('email.view_source', 'View source')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    {t('email.report_spam', 'Report spam')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Email Subject */}
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            {email.subject || t('email.no_subject', '(No Subject)')}
          </h1>

          {/* Email Details */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium" style={{ backgroundColor: 'var(--brand-primary-color)' }}>
                  {email.from.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{email.from}</div>
                  <div className="text-sm text-gray-500">
                    {t('email.to', 'to')} {email.to}
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {formatDate(email.createdAt)}
              </div>
            </div>

            {/* Additional Headers */}
            {(metadata.emailCc || metadata.emailBcc || showFullHeaders) && (
              <div className="text-sm text-gray-600 space-y-1">
                {metadata.emailCc && (
                  <div>
                    <span className="font-medium">{t('email.cc', 'Cc')}:</span> {metadata.emailCc}
                  </div>
                )}
                {metadata.emailBcc && (
                  <div>
                    <span className="font-medium">{t('email.bcc', 'Bcc')}:</span> {metadata.emailBcc}
                  </div>
                )}
                {showFullHeaders && metadata.emailHeaders && (
                  <div className="bg-gray-50 p-3 rounded text-xs font-mono">
                    <pre>{JSON.stringify(metadata.emailHeaders, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setShowFullHeaders(!showFullHeaders)}
            >
              {showFullHeaders ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  {t('email.hide_details', 'Hide details')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  {t('email.show_details', 'Show details')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center mb-3">
              <Paperclip className="h-4 w-4 mr-2 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {attachments.length} {t('email.attachments', 'attachments')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {attachment.filename}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatFileSize(attachment.size)}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadAttachment(attachment)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {email.htmlContent ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: email.htmlContent.replace(
                /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, 
                ''
              )
            }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
            {email.content}
          </div>
        )}
      </div>
    </div>
  );
}
