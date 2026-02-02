import React, { useState, useRef } from 'react';
import { useTikTokReactions } from '@/hooks/useTikTokReactions';
import { useMentionInput, useMentionHighlight } from '@/hooks/useTikTokMentions';
import { ReactionDisplay, ReactionPicker, FloatingReactionPicker } from './ReactionPicker';
import { MentionInput } from './MentionComponents';
import { MessageStatus } from './MessageStatus';
import { cn } from '@/lib/utils';
import { MoreVertical, Reply, Smile } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Message {
  id: number;
  content: string;
  senderType: 'agent' | 'contact';
  senderId: number;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date | string;
  metadata?: any;
}

interface TikTokMessageWithReactionsAndMentionsProps {
  message: Message;
  conversationId: number;
  currentUserId: number;
  onReply?: (message: Message) => void;
  className?: string;
}

/**
 * Complete TikTok message component with reactions and mentions
 */
export function TikTokMessageWithReactionsAndMentions({
  message,
  conversationId,
  currentUserId,
  onReply,
  className = ''
}: TikTokMessageWithReactionsAndMentionsProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFloatingPicker, setShowFloatingPicker] = useState(false);
  const [floatingPickerPosition, setFloatingPickerPosition] = useState({ x: 0, y: 0 });

  const {
    availableEmojis,
    getReactions,
    toggleReaction,
    supported: reactionsSupported
  } = useTikTokReactions(conversationId);

  const reactions = reactionsSupported ? getReactions(message.id) : [];
  const isOutgoing = message.senderType === 'agent';


  const mentionSegments = useMentionHighlight(message.content);

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleReactionClick = (emoji: string) => {
    if (!reactionsSupported) return;
    toggleReaction(message.id, emoji);
  };

  const handleAddReaction = () => {
    if (!reactionsSupported) return;
    setShowReactionPicker(true);
  };

  const handleMouseEnter = (_e: React.MouseEvent) => {
    if (!reactionsSupported || !isOutgoing) return; // Only show for outgoing messages when supported

    const rect = messageRef.current?.getBoundingClientRect();
    if (rect) {
      setFloatingPickerPosition({
        x: rect.left,
        y: rect.top - 60
      });
      setShowFloatingPicker(true);
    }
  };

  const handleMouseLeave = () => {
    setShowFloatingPicker(false);
  };

  return (
    <div
      ref={messageRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'flex group',
        isOutgoing ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div className="max-w-[70%] relative">
        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-2 shadow-sm',
            isOutgoing
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          )}
        >
          {/* Message content with mentions */}
          <div className="break-words whitespace-pre-wrap">
            {mentionSegments.length > 0 ? (
              mentionSegments.map((segment, index) => {
                if (segment.type === 'mention') {
                  return (
                    <span
                      key={`${segment.index}-${index}`}
                      className="mention-highlight bg-blue-100 text-blue-700 px-1 rounded font-medium cursor-pointer hover:bg-blue-200"
                      data-user-id={segment.userId}
                    >
                      @{segment.content}
                    </span>
                  );
                }
                return <React.Fragment key={index}>{segment.content}</React.Fragment>;
              })
            ) : (
              message.content
            )}
          </div>

          {/* Message footer */}
          <div className="flex items-center justify-end gap-2 mt-1">
            <span className={cn(
              'text-xs',
              isOutgoing ? 'text-blue-100' : 'text-gray-500'
            )}>
              {formatTime(message.createdAt)}
            </span>

            {isOutgoing && message.status && (
              <MessageStatus status={message.status} size="sm" />
            )}
          </div>
        </div>

        {/* Reactions (only when supported) */}
        {reactionsSupported && reactions.length > 0 && (
          <ReactionDisplay
            reactions={reactions}
            currentUserId={currentUserId}
            onReactionClick={handleReactionClick}
            onAddReaction={handleAddReaction}
            className="mt-1"
          />
        )}

        {/* Message actions (visible on hover; reaction UI only when supported) */}
        <div className={cn(
          'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity',
          isOutgoing ? 'left-0 -translate-x-full -ml-2' : 'right-0 translate-x-full -mr-2'
        )}>
          <div className="flex items-center gap-1">
            {reactionsSupported && (
              <button
                onClick={handleAddReaction}
                className="w-8 h-8 flex items-center justify-center bg-background hover:bg-accent rounded-full shadow-md transition-colors"
                title="Add reaction"
              >
                <Smile className="w-4 h-4 text-gray-600" />
              </button>
            )}

            {/* More actions (Reply always; Add Reaction only when supported) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-100 rounded-full shadow-md transition-colors">
                  <MoreVertical className="w-4 h-4 text-gray-600" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onReply && (
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <Reply className="w-4 h-4 mr-2" />
                    Reply
                  </DropdownMenuItem>
                )}
                {reactionsSupported && (
                  <DropdownMenuItem onClick={handleAddReaction}>
                    <Smile className="w-4 h-4 mr-2" />
                    Add Reaction
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Reaction picker (only when supported) */}
        {reactionsSupported && (
          <ReactionPicker
            availableEmojis={availableEmojis}
            onSelect={(emoji) => {
              handleReactionClick(emoji);
              setShowReactionPicker(false);
            }}
            onClose={() => setShowReactionPicker(false)}
            open={showReactionPicker}
          />
        )}

        {/* Floating quick reaction picker (only when supported) */}
        {reactionsSupported && (
          <FloatingReactionPicker
            isVisible={showFloatingPicker}
            position={floatingPickerPosition}
            onSelect={handleReactionClick}
            onShowAll={() => setShowReactionPicker(true)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Example conversation view with reactions and mentions
 */
interface User {
  userId: number;
  userName: string;
  displayName: string;
  avatar?: string;
}

interface ConversationWithReactionsAndMentionsProps {
  conversationId: number;
  currentUserId: number;
  messages: Message[];
  users: User[];
}

export function ConversationWithReactionsAndMentions({
  conversationId,
  currentUserId,
  messages,
  users
}: ConversationWithReactionsAndMentionsProps) {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const {
    value,
    setValue,
    showSuggestions,
    suggestions,
    selectedIndex,
    inputRef,
    handleChange,
    handleKeyDown,
    insertMention
  } = useMentionInput('', users);

  const handleSend = () => {
    if (!value.trim()) return;



    
    setValue('');
    setReplyingTo(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold">TikTok Conversation</h2>
        <p className="text-sm text-gray-500">With reactions and mentions</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <TikTokMessageWithReactionsAndMentions
            key={message.id}
            message={message}
            conversationId={conversationId}
            currentUserId={currentUserId}
            onReply={setReplyingTo}
          />
        ))}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4">
        {replyingTo && (
          <div className="mb-2 p-2 bg-gray-100 rounded-lg flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-gray-500">Replying to:</p>
              <p className="text-sm text-gray-700 truncate">{replyingTo.content}</p>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        )}

        <MentionInput
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            handleKeyDown(e);
            if (e.key === 'Enter' && !e.shiftKey && !showSuggestions) {
              e.preventDefault();
              handleSend();
            }
          }}
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          showSuggestions={showSuggestions}
          onSelectSuggestion={insertMention}
          inputRef={inputRef}
          placeholder="Type @ to mention someone..."
        />

        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-gray-500">
            Tip: Type @ to mention, hover to react
          </div>
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

