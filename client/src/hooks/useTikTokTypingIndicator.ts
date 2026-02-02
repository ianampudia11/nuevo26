import React, { useEffect, useCallback, useRef, useState } from 'react';

const TYPING_ENDPOINT_BASE = '/api/tiktok/conversations';
const MIN_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
const BACKOFF_MULTIPLIER = 2;

interface TypingIndicatorOptions {
  conversationId: number;
  enabled?: boolean;
  debounceMs?: number;
  hasImChatScope?: boolean;
}

/**
 * Hook for managing TikTok typing indicators (Business Messaging API).
 * Sends typing status via REST; capability check disables when connection lacks im.chat scope.
 */
export function useTikTokTypingIndicator({
  conversationId,
  enabled = true,
  debounceMs = 1000,
  hasImChatScope = true
}: TypingIndicatorOptions) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const retryDelayRef = useRef(MIN_RETRY_DELAY);

  const callTypingApi = useCallback(async (isTyping: boolean): Promise<boolean> => {
    try {
      const response = await fetch(`${TYPING_ENDPOINT_BASE}/${conversationId}/typing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTyping })
      });

      if (response.ok) {
        retryDelayRef.current = MIN_RETRY_DELAY;
        return true;
      }

      if (response.status === 403) {

        return false;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (_err) {
      const nextDelay = Math.min(retryDelayRef.current * BACKOFF_MULTIPLIER, MAX_RETRY_DELAY);
      retryDelayRef.current = nextDelay;
      return false;
    }
  }, [conversationId]);

  const startTyping = useCallback(async () => {
    if (!enabled || !conversationId || !hasImChatScope) return;

    try {
      const ok = await callTypingApi(true);
      if (!ok) return;

      isTypingRef.current = true;

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        stopTyping();
      }, debounceMs);
    } catch (error) {
      console.error('Error starting typing indicator:', error);
    }
  }, [conversationId, enabled, debounceMs, hasImChatScope, callTypingApi]);

  const stopTyping = useCallback(async () => {
    if (!enabled || !conversationId || !isTypingRef.current) return;

    try {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      await callTypingApi(false);
      isTypingRef.current = false;
    } catch (error) {
      console.error('Error stopping typing indicator:', error);
    }
  }, [conversationId, enabled, callTypingApi]);

  const handleInputChange = useCallback(() => {
    if (!enabled) return;
    startTyping();
  }, [enabled, startTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current) {
        stopTyping();
      }
    };
  }, [stopTyping]);

  return {
    startTyping,
    stopTyping,
    handleInputChange
  };
}

/**
 * Hook for listening to typing indicators from other users.
 * TikTok Business Messaging API does not provide real-time typing events; returns empty state.
 */
export function useTikTokTypingListener(_conversationId: number) {
  const [typingUsers] = useState<number[]>([]);
  return {
    typingUsers,
    isAnyoneTyping: false
  };
}

/**
 * Hook for managing user presence status.
 * TikTok Business Messaging API does not expose presence; no-op implementation.
 */
export function useTikTokPresence(conversationId: number) {
  const [presenceMap] = useState<Map<number, { status: 'online' | 'offline' | 'away'; lastSeen: Date }>>(new Map());

  const updatePresence = useCallback(async (_status: 'online' | 'offline' | 'away') => {
    if (!conversationId) return;

  }, [conversationId]);

  useEffect(() => {
    updatePresence('online');
    return () => {
      updatePresence('offline');
    };
  }, [updatePresence]);

  const getUserPresence = useCallback((userId: number) => {
    return presenceMap.get(userId) || null;
  }, [presenceMap]);

  const isUserOnline = useCallback((_userId: number) => {
    return false;
  }, []);

  return {
    presenceMap,
    getUserPresence,
    isUserOnline,
    updatePresence
  };
}
