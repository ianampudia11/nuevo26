import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ReactionPickerProps {
  availableEmojis: string[];
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  trigger?: React.ReactNode;
  open?: boolean;
  className?: string;
}

/**
 * Reaction picker component
 * Shows a grid of available reaction emojis
 */
export function ReactionPicker({
  availableEmojis,
  onSelect,
  onClose,
  trigger,
  open,
  className = ''
}: ReactionPickerProps) {
  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    onClose?.();
  };

  return (
    <Popover open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
      {trigger && <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent className={cn('w-80 p-2', className)} align="start">
        <div className="grid grid-cols-10 gap-1">
          {availableEmojis.map((emoji, index) => (
            <motion.button
              key={emoji}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
              onClick={() => handleSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center text-2xl hover:bg-gray-100 rounded transition-colors cursor-pointer"
              title={emoji}
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Quick reaction bar (shows common reactions)
 */
interface QuickReactionBarProps {
  quickReactions?: string[];
  onSelect: (emoji: string) => void;
  className?: string;
}

export function QuickReactionBar({
  quickReactions = ['❤️', '😂', '😮', '😢', '👍', '👎'],
  onSelect,
  className = ''
}: QuickReactionBarProps) {
  return (
    <div className={cn('flex items-center gap-1 bg-popover rounded-full shadow-lg px-2 py-1', className)}>
      {quickReactions.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center text-xl hover:bg-accent rounded-full transition-all hover:scale-110"
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/**
 * Reaction display component
 * Shows reactions on a message
 */
interface ReactionDisplayProps {
  reactions: { emoji: string; count: number; users: number[] }[];
  currentUserId: number;
  onReactionClick: (emoji: string) => void;
  onAddReaction?: () => void;
  className?: string;
}

export function ReactionDisplay({
  reactions,
  currentUserId,
  onReactionClick,
  onAddReaction,
  className = ''
}: ReactionDisplayProps) {
  if (reactions.length === 0 && !onAddReaction) return null;

  return (
    <div className={cn('flex flex-wrap gap-1 mt-2', className)}>
      {reactions.map(({ emoji, count, users }) => {
        const hasReacted = users.includes(currentUserId);
        
        return (
          <motion.button
            key={emoji}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onReactionClick(emoji)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm transition-all',
              hasReacted
                ? 'bg-blue-100 border-2 border-blue-500 text-blue-700'
                : 'bg-gray-100 border-2 border-transparent hover:bg-gray-200 text-gray-700'
            )}
            title={`${count} ${count === 1 ? 'reaction' : 'reactions'}`}
          >
            <span className="text-base">{emoji}</span>
            {count > 1 && (
              <span className="font-medium text-xs">{count}</span>
            )}
          </motion.button>
        );
      })}
      
      {onAddReaction && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onAddReaction}
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-all"
          title="Add reaction"
        >
          <span className="text-lg">+</span>
        </motion.button>
      )}
    </div>
  );
}

/**
 * Floating reaction picker (appears on hover)
 */
interface FloatingReactionPickerProps {
  isVisible: boolean;
  position: { x: number; y: number };
  quickReactions?: string[];
  onSelect: (emoji: string) => void;
  onShowAll?: () => void;
}

export function FloatingReactionPicker({
  isVisible,
  position,
  quickReactions = ['❤️', '😂', '😮', '😢', '👍', '👎'],
  onSelect,
  onShowAll
}: FloatingReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {

      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={pickerRef}
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            left: position.x,
            top: position.y,
            zIndex: 1000
          }}
          className="bg-white rounded-full shadow-xl px-2 py-1 flex items-center gap-1"
        >
          {quickReactions.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSelect(emoji)}
              className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-100 rounded-full transition-all hover:scale-110"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          
          {onShowAll && (
            <button
              onClick={onShowAll}
              className="w-10 h-10 flex items-center justify-center text-xl text-gray-500 hover:bg-gray-100 rounded-full transition-all"
              title="Show all reactions"
            >
              <span className="font-bold">+</span>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Reaction tooltip (shows who reacted)
 */
interface ReactionTooltipProps {
  emoji: string;
  users: { id: number; name: string }[];
  className?: string;
}

export function ReactionTooltip({
  emoji,
  users,
  className = ''
}: ReactionTooltipProps) {
  if (users.length === 0) return null;

  const displayNames = users.slice(0, 3).map(u => u.name);
  const remaining = users.length - 3;

  let text = '';
  if (users.length === 1) {
    text = `${displayNames[0]} reacted with ${emoji}`;
  } else if (users.length === 2) {
    text = `${displayNames[0]} and ${displayNames[1]} reacted with ${emoji}`;
  } else if (users.length === 3) {
    text = `${displayNames[0]}, ${displayNames[1]}, and ${displayNames[2]} reacted with ${emoji}`;
  } else {
    text = `${displayNames[0]}, ${displayNames[1]}, ${displayNames[2]}, and ${remaining} others reacted with ${emoji}`;
  }

  return (
    <div className={cn('text-xs text-gray-600 p-2 bg-white rounded shadow-lg', className)}>
      {text}
    </div>
  );
}

/**
 * Reaction animation (for when reaction is added)
 */
interface ReactionAnimationProps {
  emoji: string;
  startPosition: { x: number; y: number };
  onComplete?: () => void;
}

export function ReactionAnimation({
  emoji,
  startPosition,
  onComplete
}: ReactionAnimationProps) {
  return (
    <motion.div
      initial={{
        opacity: 1,
        scale: 1,
        x: startPosition.x,
        y: startPosition.y
      }}
      animate={{
        opacity: 0,
        scale: 2,
        y: startPosition.y - 50
      }}
      transition={{
        duration: 0.6,
        ease: 'easeOut'
      }}
      onAnimationComplete={onComplete}
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 9999
      }}
      className="text-4xl"
    >
      {emoji}
    </motion.div>
  );
}

