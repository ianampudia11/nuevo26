import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import './EmailList.css';
import {
  Paperclip,
  Star,
  Archive,
  Trash2,
  MoreHorizontal,
  Mail,
  MailOpen,
  Reply,
  Forward,
  RotateCcw,
  Trash
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

interface EmailListProps {
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  onEmailSelect: (email: EmailMessage) => void;
  isLoading: boolean;
  onLoadMore?: () => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onMarkAsRead?: (emailId: number, isRead: boolean) => Promise<void>;
  onStarEmail?: (emailId: number, starred: boolean) => Promise<void>;
  onArchiveEmail?: (emailId: number) => Promise<void>;
  onDeleteEmail?: (emailId: number) => Promise<void>;
  onRestoreEmail?: (emailId: number) => Promise<void>;
  onPermanentDelete?: (emailId: number) => Promise<void>;
  currentFolder?: string;
}

export default function EmailList({
  emails,
  selectedEmail,
  onEmailSelect,
  isLoading,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  onMarkAsRead,
  onStarEmail,
  onArchiveEmail,
  onDeleteEmail,
  onRestoreEmail,
  onPermanentDelete,
  currentFolder = 'inbox'
}: EmailListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedEmails, setSelectedEmails] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);


  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);


  const [scrollPosition, setScrollPosition] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);


  const scrollTimeoutRef = useRef<NodeJS.Timeout>();




  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);


  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;


    setScrollPosition(scrollTop);


    setIsScrolling(true);


    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }


    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);


    if (onLoadMore && hasMore && !isLoadingMore) {
      const threshold = isMobile ? 50 : 100; // Smaller threshold on mobile
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < threshold) {
        onLoadMore();
      }
    }
  }, [onLoadMore, hasMore, isLoadingMore, isMobile]);


  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);


  useEffect(() => {
    if (scrollContainerRef.current && scrollPosition > 0) {
      scrollContainerRef.current.scrollTop = scrollPosition;
    }
  }, [emails.length]); // Restore position when emails change

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedEmails(new Set(emails.map(email => email.id)));
    } else {
      setSelectedEmails(new Set());
    }
  };

  const handleSelectEmail = (emailId: number, checked: boolean) => {
    const newSelected = new Set(selectedEmails);
    if (checked) {
      newSelected.add(emailId);
    } else {
      newSelected.delete(emailId);
    }
    setSelectedEmails(newSelected);
    setSelectAll(newSelected.size === emails.length && emails.length > 0);
  };


  const handleBulkArchive = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {
      const response = await fetch('/api/email/messages/bulk/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: emailIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform bulk archive operation');
      }

      const data = await response.json();
      const successCount = data.results.filter((r: any) => r.success).length;
      const failureCount = data.results.filter((r: any) => !r.success).length;


      data.results.forEach((result: any) => {
        if (result.success) {
          onArchiveEmail?.(result.messageId);
        }
      });

      setSelectedEmails(new Set());
      setSelectAll(false);


      if (successCount > 0) {
        toast({
          title: t('email.bulk_archive_success', 'Emails Archived'),
          description: t('email.bulk_archive_success_desc', `${successCount} email(s) archived successfully`),
        });
      }


      if (failureCount > 0) {
        toast({
          title: t('email.bulk_archive_partial_error', 'Some Emails Failed'),
          description: t('email.bulk_archive_partial_error_desc', `${failureCount} email(s) could not be archived`),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to archive emails:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_archive_error', 'Failed to archive emails'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {
      const response = await fetch('/api/email/messages/bulk/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: emailIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform bulk delete operation');
      }

      const data = await response.json();
      const successCount = data.results.filter((r: any) => r.success).length;
      const failureCount = data.results.filter((r: any) => !r.success).length;


      data.results.forEach((result: any) => {
        if (result.success) {
          onDeleteEmail?.(result.messageId);
        }
      });

      setSelectedEmails(new Set());
      setSelectAll(false);


      if (successCount > 0) {
        toast({
          title: t('email.bulk_delete_success', 'Emails Deleted'),
          description: t('email.bulk_delete_success_desc', `${successCount} email(s) deleted successfully`),
        });
      }


      if (failureCount > 0) {
        toast({
          title: t('email.bulk_delete_partial_error', 'Some Emails Failed'),
          description: t('email.bulk_delete_partial_error_desc', `${failureCount} email(s) could not be deleted`),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to delete emails:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_delete_error', 'Failed to delete emails'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkStar = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {
      const response = await fetch('/api/email/messages/bulk/star', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: emailIds, starred: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform bulk star operation');
      }

      const data = await response.json();
      const successCount = data.results.filter((r: any) => r.success).length;
      const failureCount = data.results.filter((r: any) => !r.success).length;


      data.results.forEach((result: any) => {
        if (result.success) {
          onStarEmail?.(result.messageId, result.starred);
        }
      });

      setSelectedEmails(new Set());
      setSelectAll(false);


      if (successCount > 0) {
        toast({
          title: t('email.bulk_star_success', 'Emails Starred'),
          description: t('email.bulk_star_success_desc', `${successCount} email(s) starred successfully`),
        });
      }


      if (failureCount > 0) {
        toast({
          title: t('email.bulk_star_partial_error', 'Some Emails Failed'),
          description: t('email.bulk_star_partial_error_desc', `${failureCount} email(s) could not be starred`),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to star emails:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_star_error', 'Failed to star emails'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkMarkAsRead = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {
      const response = await fetch('/api/email/messages/bulk/mark-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: emailIds, isRead: true }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform bulk mark as read operation');
      }

      const data = await response.json();
      const successCount = data.results.filter((r: any) => r.success).length;
      const failureCount = data.results.filter((r: any) => !r.success).length;


      data.results.forEach((result: any) => {
        if (result.success) {
          onMarkAsRead?.(result.messageId, result.isRead);
        }
      });

      setSelectedEmails(new Set());
      setSelectAll(false);


      if (successCount > 0) {
        toast({
          title: t('email.bulk_mark_read_success', 'Emails Marked as Read'),
          description: t('email.bulk_mark_read_success_desc', `${successCount} email(s) marked as read`),
        });
      }


      if (failureCount > 0) {
        toast({
          title: t('email.bulk_mark_read_partial_error', 'Some Emails Failed'),
          description: t('email.bulk_mark_read_partial_error_desc', `${failureCount} email(s) could not be marked as read`),
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to mark emails as read:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_mark_read_error', 'Failed to mark emails as read'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkRestore = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {

      await Promise.all(emailIds.map(emailId => onRestoreEmail?.(emailId)));

      setSelectedEmails(new Set());
      setSelectAll(false);

      toast({
        title: t('email.bulk_restore_success', 'Emails Restored'),
        description: t('email.bulk_restore_success_desc', `${emailIds.length} email(s) restored to inbox`),
      });
    } catch (error) {
      console.error('Failed to restore emails:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_restore_error', 'Failed to restore emails'),
        variant: 'destructive'
      });
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedEmails.size === 0) return;

    const emailIds = Array.from(selectedEmails);
    try {

      await Promise.all(emailIds.map(emailId => onPermanentDelete?.(emailId)));

      setSelectedEmails(new Set());
      setSelectAll(false);

      toast({
        title: t('email.bulk_permanent_delete_success', 'Emails Permanently Deleted'),
        description: t('email.bulk_permanent_delete_success_desc', `${emailIds.length} email(s) permanently deleted`),
      });
    } catch (error) {
      console.error('Failed to permanently delete emails:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('email.bulk_permanent_delete_error', 'Failed to permanently delete emails'),
        variant: 'destructive'
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays <= 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const getEmailPreview = (email: EmailMessage) => {

    if (email.htmlContent) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = email.htmlContent;
      return tempDiv.textContent || tempDiv.innerText || '';
    }
    return email.content;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('common.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium mb-2">
            {t('email.no_emails', 'No emails')}
          </h3>
          <p className="text-sm">
            {t('email.no_emails_in_folder', 'No emails found in this folder')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Email List Header */}
      <div className={cn(
        "border-b border-border bg-muted transition-all duration-200 flex-shrink-0",
        isMobile ? "p-2" : "p-3"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={selectAll}
              onCheckedChange={handleSelectAll}
              className={cn(
                "touch-manipulation",
                isMobile ? "h-5 w-5" : "h-4 w-4"
              )}
            />
            <span className={cn(
              "text-gray-600 font-medium",
              isMobile ? "text-xs" : "text-sm"
            )}>
              {selectedEmails.size > 0
                ? `${selectedEmails.size} ${t('email.selected', 'selected')}`
                : `${emails.length} ${t('email.emails', 'emails')}`
              }
            </span>
          </div>

          {selectedEmails.size > 0 && (
            <div className={cn(
              "flex items-center",
              isMobile ? "space-x-1" : "space-x-1"
            )}>
              {currentFolder === 'trash' ? (

                <>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkRestore}
                    title={t('email.restore_selected', 'Restore selected emails to inbox')}
                  >
                    <RotateCcw className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation text-red-600 hover:text-red-700 hover:bg-red-50",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkPermanentDelete}
                    title={t('email.permanent_delete_selected', 'Permanently delete selected emails')}
                  >
                    <Trash className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                </>
              ) : (

                <>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkArchive}
                    title={t('email.archive_selected', 'Archive selected emails')}
                  >
                    <Archive className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkDelete}
                    title={t('email.delete_selected', 'Delete selected emails')}
                  >
                    <Trash2 className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkStar}
                    title={t('email.star_selected', 'Star selected emails')}
                  >
                    <Star className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size={isMobile ? "sm" : "sm"}
                    className={cn(
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] p-2" : ""
                    )}
                    onClick={handleBulkMarkAsRead}
                    title={t('email.mark_read_selected', 'Mark selected emails as read')}
                  >
                    <MailOpen className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Email List */}
      <div
        ref={scrollContainerRef}
        className={cn(
          "email-list-container",
          "flex-1 overflow-y-auto transition-all duration-200",
          "relative min-h-0", // For scroll indicator positioning and proper flex behavior

          !isMobile && "scrollbar-visible"
        )}
        style={{

          height: '100%',
          maxHeight: '100%'
        }}
      >
        {emails.map((email) => (
          <div
            key={email.id}
            className={cn(
              "email-item group",
              "border-b border-gray-100 cursor-pointer",
              "hover:bg-gray-50 active:bg-gray-100",

              isMobile ? "min-h-[72px]" : "min-h-[64px]",

              selectedEmail?.id === email.id && "bg-accent border-border shadow-sm",
              !email.isRead ? "bg-background font-medium" : "bg-muted"
            )}
            onClick={() => onEmailSelect(email)}
          >
            <div className={cn(
              "flex items-start transition-all duration-200",
              isMobile ? "p-3 space-x-3" : "p-4 space-x-3"
            )}>
              <Checkbox
                checked={selectedEmails.has(email.id)}
                onCheckedChange={(checked) => handleSelectEmail(email.id, checked as boolean)}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "touch-manipulation mt-1",
                  isMobile ? "h-5 w-5" : "h-4 w-4"
                )}
              />

              <div className="flex-1 min-w-0">
                <div className={cn(
                  "flex items-center justify-between",
                  isMobile ? "mb-2" : "mb-1"
                )}>
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <span className={cn(
                      "truncate",
                      isMobile ? "text-base" : "text-sm",
                      !email.isRead ? "font-semibold text-gray-900" : "text-gray-700"
                    )}>
                      {email.from}
                    </span>
                    {!email.isRead && (
                      <div
                        className={cn(
                          "rounded-full flex-shrink-0",
                          isMobile ? "w-2.5 h-2.5" : "w-2 h-2"
                        )}
                        style={{ backgroundColor: 'var(--brand-primary-color)' }}
                      ></div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    {email.metadata?.starred && (
                      <Star className={cn(
                        "fill-yellow-400 text-yellow-400",
                        isMobile ? "h-5 w-5" : "h-4 w-4"
                      )} />
                    )}
                    {email.metadata?.archived && (
                      <Archive className={cn(
                        "text-gray-400",
                        isMobile ? "h-5 w-5" : "h-4 w-4"
                      )} />
                    )}
                    {email.hasAttachments && (
                      <Paperclip className={cn(
                        "text-gray-400",
                        isMobile ? "h-5 w-5" : "h-4 w-4"
                      )} />
                    )}
                    <span className={cn(
                      "text-gray-500",
                      isMobile ? "text-xs" : "text-xs"
                    )}>
                      {formatDate(email.createdAt)}
                    </span>
                  </div>
                </div>

                <div className={cn(
                  isMobile ? "mb-2" : "mb-1"
                )}>
                  <span className={cn(
                    "truncate block",
                    isMobile ? "text-sm" : "text-sm",
                    !email.isRead ? "font-semibold text-gray-900" : "text-gray-700"
                  )}>
                    {email.subject || t('email.no_subject', '(No Subject)')}
                  </span>
                </div>

                <div className={cn(
                  "text-gray-500 truncate",
                  isMobile ? "text-sm leading-relaxed" : "text-xs"
                )}>
                  {truncateText(getEmailPreview(email), isMobile ? 80 : 100)}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                      "touch-manipulation",
                      isMobile ? "min-h-[44px] min-w-[44px] opacity-100" : ""
                    )}
                  >
                    <MoreHorizontal className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEmailSelect(email)}>
                    <Reply className="h-4 w-4 mr-2" />
                    {t('email.reply', 'Reply')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEmailSelect(email)}>
                    <Forward className="h-4 w-4 mr-2" />
                    {t('email.forward', 'Forward')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onMarkAsRead?.(email.id, !email.isRead)}>
                    {email.isRead ? (
                      <>
                        <Mail className="h-4 w-4 mr-2" />
                        {t('email.mark_unread', 'Mark as unread')}
                      </>
                    ) : (
                      <>
                        <MailOpen className="h-4 w-4 mr-2" />
                        {t('email.mark_read', 'Mark as read')}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const isStarred = email.metadata?.starred || false;
                    onStarEmail?.(email.id, !isStarred);
                  }}>
                    <Star className={cn(
                      "h-4 w-4 mr-2",
                      email.metadata?.starred ? "fill-yellow-400 text-yellow-400" : ""
                    )} />
                    {email.metadata?.starred ? t('email.unstar', 'Unstar') : t('email.star', 'Star')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {currentFolder === 'trash' ? (

                    <>
                      <DropdownMenuItem onClick={() => onRestoreEmail?.(email.id)}>
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {t('email.restore', 'Restore to Inbox')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => onPermanentDelete?.(email.id)}
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        {t('email.permanent_delete', 'Delete Permanently')}
                      </DropdownMenuItem>
                    </>
                  ) : (

                    <>
                      <DropdownMenuItem onClick={() => onArchiveEmail?.(email.id)}>
                        <Archive className="h-4 w-4 mr-2" />
                        {email.metadata?.archived ? t('email.unarchive', 'Unarchive') : t('email.archive', 'Archive')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => onDeleteEmail?.(email.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('email.delete', 'Delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}

        {/* Load More Indicator */}
        {isLoadingMore && (
          <div className={cn(
            "flex items-center justify-center",
            isMobile ? "p-3" : "p-4"
          )}>
            <div className={cn(
              "loading-indicator animate-spin rounded-full border-b-2 border-blue-600",
              isMobile ? "h-5 w-5" : "h-6 w-6"
            )}></div>
            <span className={cn(
              "ml-2 text-gray-600",
              isMobile ? "text-xs" : "text-sm"
            )}>
              {t('email.loading_more', 'Loading more emails...')}
            </span>
          </div>
        )}

        {/* Load More Button (always visible when hasMore is true) */}
        {hasMore && emails.length > 0 && (
          <div className={cn(
            "flex flex-col items-center justify-center border-t border-gray-200 bg-gray-50",
            isMobile ? "p-3" : "p-4"
          )}>
            {!isLoadingMore && (
              <Button
                variant="outline"
                onClick={onLoadMore}
                className={cn(
                  "touch-manipulation transition-all duration-200",
                  isMobile ? "min-h-[44px] px-6 text-sm" : ""
                )}
              >
                {t('email.load_more', 'Load More')}
              </Button>
            )}
            {isLoadingMore && (
              <div className="flex items-center space-x-2">
                <div className={cn(
                  "loading-indicator animate-spin rounded-full border-b-2 border-blue-600",
                  isMobile ? "h-5 w-5" : "h-6 w-6"
                )}></div>
                <span className={cn(
                  "text-gray-600",
                  isMobile ? "text-xs" : "text-sm"
                )}>
                  {t('email.loading_more', 'Loading more emails...')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Scroll indicator for mobile */}
        {isMobile && isScrolling && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
            <div className="scroll-indicator bg-gray-800 bg-opacity-75 text-white text-xs px-2 py-1 rounded-full">
              {Math.round((scrollPosition / (scrollContainerRef.current?.scrollHeight || 1)) * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
