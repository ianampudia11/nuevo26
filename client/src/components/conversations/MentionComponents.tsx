import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bell, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MentionSuggestion {
  userId: number;
  userName: string;
  displayName: string;
  avatar?: string;
}

/**
 * Mention autocomplete dropdown
 */
interface MentionAutocompleteProps {
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  onSelect: (user: MentionSuggestion) => void;
  position?: { x: number; y: number };
  className?: string;
}

export function MentionAutocomplete({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  className = ''
}: MentionAutocompleteProps) {
  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.15 }}
      style={position ? {
        position: 'fixed',
        left: position.x,
        top: position.y
      } : undefined}
      className={cn(
        'bg-popover rounded-lg shadow-xl border border-border overflow-hidden z-50',
        !position && 'absolute bottom-full mb-2',
        className
      )}
    >
      <div className="max-h-60 overflow-y-auto">
        {suggestions.map((user, index) => (
          <button
            key={user.userId}
            onClick={() => onSelect(user)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-2 hover:bg-accent transition-colors text-left',
              index === selectedIndex && 'bg-blue-50'
            )}
          >
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.avatar} alt={user.displayName} />
              <AvatarFallback>{user.displayName.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.displayName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                @{user.userName}
              </p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Mention highlight component
 */
interface MentionHighlightProps {
  userId: number;
  userName: string;
  onClick?: (userId: number) => void;
  className?: string;
}

export function MentionHighlight({
  userId,
  userName,
  onClick,
  className = ''
}: MentionHighlightProps) {
  return (
    <span
      onClick={() => onClick?.(userId)}
      className={cn(
        'mention-highlight bg-blue-100 text-blue-700 px-1 rounded font-medium cursor-pointer hover:bg-blue-200 transition-colors',
        className
      )}
      data-user-id={userId}
    >
      @{userName}
    </span>
  );
}

/**
 * Mention badge (for showing mention count)
 */
interface MentionBadgeProps {
  count: number;
  onClick?: () => void;
  className?: string;
}

export function MentionBadge({
  count,
  onClick,
  className = ''
}: MentionBadgeProps) {
  if (count === 0) return null;

  return (
    <Badge
      variant="destructive"
      onClick={onClick}
      className={cn('cursor-pointer hover:opacity-80 transition-opacity', className)}
    >
      <Bell className="w-3 h-3 mr-1" />
      {count}
    </Badge>
  );
}

/**
 * Mention notification panel
 */
interface MentionNotification {
  messageId: number;
  conversationId: number;
  mentionedByUserId: number;
  messageContent: string;
  createdAt: Date;
}

interface MentionNotificationPanelProps {
  mentions: MentionNotification[];
  onMentionClick: (mention: MentionNotification) => void;
  onMarkAsRead: (messageId: number) => void;
  onClearAll: () => void;
  getUserName: (userId: number) => string;
  className?: string;
}

export function MentionNotificationPanel({
  mentions,
  onMentionClick,
  onMarkAsRead,
  onClearAll,
  getUserName,
  className = ''
}: MentionNotificationPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-5 h-5" />
          {mentions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {mentions.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-96 p-0', className)} align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm">Mentions</h3>
          {mentions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-xs"
            >
              Clear all
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-96">
          {mentions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Bell className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">No mentions</p>
            </div>
          ) : (
            <div className="divide-y">
              {mentions.map((mention) => (
                <div
                  key={mention.messageId}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onMentionClick(mention)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {getUserName(mention.mentionedByUserId)} mentioned you
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead(mention.messageId);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                    {mention.messageContent}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(mention.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mention input wrapper
 */
interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  showSuggestions: boolean;
  onSelectSuggestion: (user: MentionSuggestion) => void;
  placeholder?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement> | React.MutableRefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}

export function MentionInput({
  value,
  onChange,
  onKeyDown,
  suggestions,
  selectedIndex,
  showSuggestions,
  onSelectSuggestion,
  placeholder = 'Type @ to mention someone...',
  className = '',
  inputRef
}: MentionInputProps) {
  return (
    <div className="relative">
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none',
          className
        )}
        rows={3}
      />
      
      <AnimatePresence>
        {showSuggestions && (
          <MentionAutocomplete
            suggestions={suggestions}
            selectedIndex={selectedIndex}
            onSelect={onSelectSuggestion}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mention chip (for displaying selected mentions)
 */
interface MentionChipProps {
  userId: number;
  userName: string;
  displayName: string;
  avatar?: string;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}

export function MentionChip({
  userId: _userId,
  userName,
  displayName,
  avatar,
  onRemove,
  onClick,
  className = ''
}: MentionChipProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-sm',
        onClick && 'cursor-pointer hover:bg-blue-200',
        className
      )}
    >
      <Avatar className="w-5 h-5">
        <AvatarImage src={avatar} alt={displayName} />
        <AvatarFallback className="text-xs">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium">@{userName}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Mention list (for showing all mentions in a message)
 */
interface MentionListProps {
  mentions: { userId: number; userName: string }[];
  getUserDetails: (userId: number) => { displayName: string; avatar?: string };
  onMentionClick?: (userId: number) => void;
  className?: string;
}

export function MentionList({
  mentions,
  getUserDetails,
  onMentionClick,
  className = ''
}: MentionListProps) {
  if (mentions.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2 mt-2', className)}>
      {mentions.map((mention) => {
        const details = getUserDetails(mention.userId);
        return (
          <MentionChip
            key={mention.userId}
            userId={mention.userId}
            userName={mention.userName}
            displayName={details.displayName}
            avatar={details.avatar}
            className="cursor-pointer hover:bg-blue-200"
            onClick={() => onMentionClick?.(mention.userId)}
          />
        );
      })}
    </div>
  );
}

