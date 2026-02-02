import React, { useEffect, useRef } from 'react';
import { MessageStatus, DetailedMessageStatus, ReadReceiptIndicator } from './MessageStatus';
import { useTikTokReadReceipts, useAutoReadReceipts } from '@/hooks/useTikTokReadReceipts';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface TikTokMessageWithStatusProps {
  message: {
    id: number;
    content: string;
    senderType: 'agent' | 'contact';
    status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    createdAt: Date | string;
    metadata?: any;
  };
  conversationId: number;
  showDetailedStatus?: boolean;
  autoMarkAsRead?: boolean;
  className?: string;
}

/**
 * TikTok message component with read receipts and delivery status
 * 
 * Features:
 * - Visual status indicators (sending, sent, delivered, read, failed)
 * - Detailed status popover with timestamps
 * - Auto-mark as read when message is visible
 * - Read receipt tracking
 * - Real-time status updates via WebSocket
 */
export function TikTokMessageWithStatus({
  message,
  conversationId,
  showDetailedStatus = true,
  autoMarkAsRead = true,
  className = ''
}: TikTokMessageWithStatusProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const { getStatus, getReadReceipts } = useTikTokReadReceipts(conversationId);
  const { markAsViewed } = useAutoReadReceipts(conversationId, autoMarkAsRead);
  
  const [readReceipts, setReadReceipts] = React.useState<any[]>([]);
  const [detailedStatus, setDetailedStatus] = React.useState<any>(null);


  const currentStatus = getStatus(message.id);
  const displayStatus = currentStatus?.status || message.status || 'sent';


  useEffect(() => {
    if (!messageRef.current || !autoMarkAsRead || message.senderType !== 'contact') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            markAsViewed(message.id);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(messageRef.current);

    return () => {
      observer.disconnect();
    };
  }, [message.id, message.senderType, autoMarkAsRead, markAsViewed]);


  const loadDetailedStatus = async () => {
    const receipts = await getReadReceipts(message.id);
    setReadReceipts(receipts);
    setDetailedStatus(currentStatus);
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isOutgoing = message.senderType === 'agent';

  return (
    <div
      ref={messageRef}
      className={cn(
        'flex',
        isOutgoing ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2 shadow-sm',
          isOutgoing
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        )}
      >
        {/* Message content */}
        <div className="break-words whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Message footer with time and status */}
        <div className="flex items-center justify-end gap-2 mt-1">
          <span className={cn(
            'text-xs',
            isOutgoing ? 'text-blue-100' : 'text-gray-500'
          )}>
            {formatTime(message.createdAt)}
          </span>

          {/* Status indicator for outgoing messages */}
          {isOutgoing && (
            <>
              {showDetailedStatus ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      onClick={loadDetailedStatus}
                      className="focus:outline-none hover:opacity-80 transition-opacity"
                    >
                      <MessageStatus
                        status={displayStatus as any}
                        size="sm"
                        className="cursor-pointer"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Message Status</h4>
                      {detailedStatus && (
                        <DetailedMessageStatus
                          sentAt={detailedStatus.sentAt}
                          deliveredAt={detailedStatus.deliveredAt}
                          readAt={detailedStatus.readAt}
                          failedAt={detailedStatus.failedAt}
                          error={detailedStatus.error}
                          readBy={readReceipts.map(r => ({
                            userId: r.userId,
                            userName: `User ${r.userId}`,
                            readAt: r.readAt
                          }))}
                        />
                      )}
                      {!detailedStatus && (
                        <p className="text-sm text-gray-500">Loading status...</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <MessageStatus
                  status={displayStatus as any}
                  size="sm"
                />
              )}

              {/* Read receipt count */}
              {currentStatus?.readBy && currentStatus.readBy.length > 0 && (
                <ReadReceiptIndicator
                  readCount={currentStatus.readBy.length}
                  className="ml-1"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Example usage in a conversation view
 */
export function TikTokConversationExample() {
  const conversationId = 123; // Example conversation ID
  const { markConversationAsRead } = useTikTokReadReceipts(conversationId);

  const messages = [
    {
      id: 1,
      content: 'Hello! How can I help you today?',
      senderType: 'agent' as const,
      status: 'read' as const,
      createdAt: new Date(Date.now() - 3600000)
    },
    {
      id: 2,
      content: 'I have a question about my order',
      senderType: 'contact' as const,
      createdAt: new Date(Date.now() - 3000000)
    },
    {
      id: 3,
      content: 'Sure! What\'s your order number?',
      senderType: 'agent' as const,
      status: 'delivered' as const,
      createdAt: new Date(Date.now() - 2400000)
    },
    {
      id: 4,
      content: 'It\'s #12345',
      senderType: 'contact' as const,
      createdAt: new Date(Date.now() - 1800000)
    },
    {
      id: 5,
      content: 'Let me check that for you...',
      senderType: 'agent' as const,
      status: 'sending' as const,
      createdAt: new Date()
    }
  ];


  useEffect(() => {
    markConversationAsRead();
  }, [markConversationAsRead]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold">TikTok Conversation</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <TikTokMessageWithStatus
            key={message.id}
            message={message}
            conversationId={conversationId}
            showDetailedStatus={true}
            autoMarkAsRead={true}
          />
        ))}
      </div>

      {/* Input area would go here */}
    </div>
  );
}

/**
 * Bulk message status display (for message lists)
 */
interface MessageListItemProps {
  message: {
    id: number;
    content: string;
    status?: string;
    createdAt: Date | string;
  };
  conversationId: number;
  onClick?: () => void;
}

export function TikTokMessageListItem({
  message,
  conversationId,
  onClick
}: MessageListItemProps) {
  const { getStatus } = useTikTokReadReceipts(conversationId);
  const currentStatus = getStatus(message.id);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{message.content}</p>
        <p className="text-xs text-gray-500">
          {new Date(message.createdAt).toLocaleString()}
        </p>
      </div>
      <MessageStatus
        status={(currentStatus?.status || message.status || 'sent') as any}
        size="sm"
      />
    </div>
  );
}

