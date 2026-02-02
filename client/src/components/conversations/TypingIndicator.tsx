import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TypingIndicatorProps {
  isTyping: boolean;
  userName?: string;
  variant?: 'bubble' | 'inline';
  className?: string;
}

/**
 * Typing indicator component
 * Shows animated dots when someone is typing
 */
export function TypingIndicator({
  isTyping,
  userName,
  variant = 'bubble',
  className = ''
}: TypingIndicatorProps) {
  if (!isTyping) return null;

  if (variant === 'inline') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}
        >
          <div className="flex gap-1">
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            />
          </div>
          <span>{userName ? `${userName} is typing...` : 'Typing...'}</span>
        </motion.div>
      </AnimatePresence>
    );
  }


  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -10 }}
        transition={{ duration: 0.2 }}
        className={`flex items-start gap-2 ${className}`}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
          <span className="text-xs text-gray-600">
            {userName ? userName.charAt(0).toUpperCase() : '?'}
          </span>
        </div>
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div className="flex gap-1">
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Multiple users typing indicator
 */
interface MultipleTypingIndicatorProps {
  typingUserNames: string[];
  variant?: 'bubble' | 'inline';
  className?: string;
}

export function MultipleTypingIndicator({
  typingUserNames,
  variant = 'bubble',
  className = ''
}: MultipleTypingIndicatorProps) {
  if (typingUserNames.length === 0) return null;

  let displayText = '';
  if (typingUserNames.length === 1) {
    displayText = `${typingUserNames[0]} is typing...`;
  } else if (typingUserNames.length === 2) {
    displayText = `${typingUserNames[0]} and ${typingUserNames[1]} are typing...`;
  } else {
    displayText = `${typingUserNames[0]} and ${typingUserNames.length - 1} others are typing...`;
  }

  if (variant === 'inline') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}
        >
          <div className="flex gap-1">
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="w-2 h-2 bg-muted-foreground rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            />
          </div>
          <span>{displayText}</span>
        </motion.div>
      </AnimatePresence>
    );
  }


  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -10 }}
        transition={{ duration: 0.2 }}
        className={`flex items-start gap-2 ${className}`}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
          <span className="text-xs text-gray-600">
            {typingUserNames.length > 1 ? `${typingUserNames.length}` : typingUserNames[0].charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <motion.span
                className="w-2 h-2 bg-muted-foreground rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0 }}
              />
              <motion.span
                className="w-2 h-2 bg-muted-foreground rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
              />
              <motion.span
                className="w-2 h-2 bg-muted-foreground rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
              />
            </div>
            <span className="text-xs text-gray-600">{displayText}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Presence indicator badge
 */
interface PresenceBadgeProps {
  status: 'online' | 'offline' | 'away';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export function PresenceBadge({
  status,
  size = 'md',
  showLabel = false,
  className = ''
}: PresenceBadgeProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  const colorClasses = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-400'
  };

  const labelText = {
    online: 'Online',
    away: 'Away',
    offline: 'Offline'
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span
        className={`${sizeClasses[size]} ${colorClasses[status]} rounded-full border-2 border-white shadow-sm`}
        title={labelText[status]}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{labelText[status]}</span>
      )}
    </div>
  );
}

