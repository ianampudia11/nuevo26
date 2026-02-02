import React, { useCallback, useState } from 'react';
import { useToast } from './use-toast';

interface ReactionSummary {
  emoji: string;
  count: number;
  users: number[];
}

interface MessageReactions {
  [messageId: number]: ReactionSummary[];
}

const TIKTOK_REACTIONS_UNSUPPORTED_MESSAGE =
  'TikTok Business Messaging does not support message reactions.';

/**
 * Hook for message reactions on TikTok.
 * TikTok Business Messaging API does not support reactions; returns empty state and shows toast on attempt.
 */
export function useTikTokReactions(_conversationId?: number) {
  const { toast } = useToast();
  const [reactions] = useState<MessageReactions>({});
  const [availableEmojis] = useState<string[]>([]);

  const addReaction = useCallback(async (_messageId: number, _emoji: string) => {
    toast({
      title: 'Reactions not supported',
      description: TIKTOK_REACTIONS_UNSUPPORTED_MESSAGE,
      variant: 'destructive'
    });
  }, [toast]);

  const removeReaction = useCallback(async (_messageId: number, _emoji: string) => {
    toast({
      title: 'Reactions not supported',
      description: TIKTOK_REACTIONS_UNSUPPORTED_MESSAGE,
      variant: 'destructive'
    });
  }, [toast]);

  const toggleReaction = useCallback(async (messageId: number, emoji: string) => {
    addReaction(messageId, emoji);
  }, [addReaction]);

  const loadReactions = useCallback(async (_messageId: number) => {

  }, []);

  const getReactions = useCallback((messageId: number): ReactionSummary[] => {
    return reactions[messageId] || [];
  }, [reactions]);

  const hasUserReacted = useCallback((_messageId: number, _userId: number, _emoji: string): boolean => {
    return false;
  }, []);

  const getTotalReactionCount = useCallback((messageId: number): number => {
    const messageReactions = reactions[messageId] || [];
    return messageReactions.reduce((sum, r) => sum + r.count, 0);
  }, [reactions]);

  return {
    reactions,
    availableEmojis,
    addReaction,
    removeReaction,
    toggleReaction,
    loadReactions,
    getReactions,
    hasUserReacted,
    getTotalReactionCount,
    supported: false
  };
}

/**
 * Hook for reaction picker (TikTok: keep for API compatibility; UI should hide or disable for TikTok)
 */
export function useReactionPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [targetMessageId, setTargetMessageId] = useState<number | null>(null);

  const openPicker = useCallback((messageId: number, x: number, y: number) => {
    setTargetMessageId(messageId);
    setPosition({ x, y });
    setIsOpen(true);
  }, []);

  const closePicker = useCallback(() => {
    setIsOpen(false);
    setTargetMessageId(null);
    setPosition(null);
  }, []);

  return {
    isOpen,
    position,
    targetMessageId,
    openPicker,
    closePicker
  };
}
