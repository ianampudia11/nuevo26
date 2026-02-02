import React, { useEffect, useCallback, useState, useRef } from 'react';

const READ_RECEIPT_POLL_INTERVAL_MS = 30000; // 30 seconds

interface MessageDeliveryStatus {
  status: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  failedAt?: Date;
  error?: string;
  readBy?: number[];
}

interface ReadReceipt {
  userId: number;
  readAt: Date;
}

/**
 * Hook for managing read receipts and delivery status (TikTok Business Messaging API).
 * Read receipts are not real-time; uses polling-based status updates.
 */
function normalizeStatus(raw: unknown): MessageDeliveryStatus | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const status = typeof o.status === 'string' ? o.status : 'sent';
  return {
    status,
    sentAt: o.sentAt != null ? new Date(o.sentAt as string) : undefined,
    deliveredAt: o.deliveredAt != null ? new Date(o.deliveredAt as string) : undefined,
    readAt: o.readAt != null ? new Date(o.readAt as string) : undefined,
    failedAt: o.failedAt != null ? new Date(o.failedAt as string) : undefined,
    error: typeof o.error === 'string' ? o.error : undefined,
    readBy: Array.isArray(o.readBy) ? (o.readBy as number[]) : undefined
  };
}

export function useTikTokReadReceipts(conversationId: number, pollIntervalMs: number = READ_RECEIPT_POLL_INTERVAL_MS) {
  const [messageStatuses, setMessageStatuses] = useState<Map<number, MessageDeliveryStatus>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownMessageIdsRef = useRef<number[]>([]);

  const markMessageAsRead = useCallback(async (messageId: number) => {
    try {
      const response = await fetch(
        `/api/tiktok/conversations/${conversationId}/messages/${messageId}/read`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        if (response.status === 404) {

          return;
        }
        throw new Error('Failed to mark message as read');
      }
      setMessageStatuses(prev => {
        const next = new Map(prev);
        const existing = next.get(messageId);
        next.set(messageId, {
          ...existing,
          status: 'read',
          readAt: new Date()
        });
        return next;
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  }, [conversationId]);

  const markConversationAsRead = useCallback(async () => {
    if (!conversationId) return;

    try {
      const response = await fetch(`/api/tiktok/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to mark conversation as read');
      }
      setMessageStatuses(prev => {
        const next = new Map(prev);
        next.forEach((s, id) => {
          next.set(id, { ...s, status: 'read', readAt: new Date() });
        });
        return next;
      });
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  }, [conversationId]);

  const getMessageStatus = useCallback(async (messageId: number): Promise<MessageDeliveryStatus | null> => {
    try {
      const response = await fetch(
        `/api/tiktok/conversations/${conversationId}/messages/${messageId}/status`
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to get message status');
      }

      const data = await response.json();
      const raw = data.status ?? data;
      const statusObj = normalizeStatus(raw);
      if (statusObj) {
        setMessageStatuses(prev => {
          const next = new Map(prev);
          next.set(messageId, statusObj);
          return next;
        });
        return statusObj;
      }
      return null;
    } catch (error) {
      console.error('Error getting message status:', error);
      return null;
    }
  }, [conversationId]);

  const getReadReceipts = useCallback(async (messageId: number): Promise<ReadReceipt[]> => {
    try {
      const response = await fetch(
        `/api/tiktok/conversations/${conversationId}/messages/${messageId}/receipts`
      );

      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error('Failed to get read receipts');
      }

      const data = await response.json();
      return data.receipts || [];
    } catch (error) {
      console.error('Error getting read receipts:', error);
      return [];
    }
  }, [conversationId]);

  useEffect(() => {
    knownMessageIdsRef.current = Array.from(messageStatuses.keys());
  }, [messageStatuses]);


  useEffect(() => {
    if (!conversationId || pollIntervalMs <= 0) return;

    const poll = () => {
      const ids = knownMessageIdsRef.current;
      ids.forEach(id => getMessageStatus(id));
    };

    pollIntervalRef.current = setInterval(poll, pollIntervalMs);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [conversationId, pollIntervalMs, getMessageStatus]);

  const getStatus = useCallback((messageId: number): MessageDeliveryStatus | null => {
    return messageStatuses.get(messageId) || null;
  }, [messageStatuses]);

  const isMessageRead = useCallback((messageId: number): boolean => {
    const status = messageStatuses.get(messageId);
    return status?.status === 'read';
  }, [messageStatuses]);

  const isMessageDelivered = useCallback((messageId: number): boolean => {
    const status = messageStatuses.get(messageId);
    return status?.status === 'delivered' || status?.status === 'read';
  }, [messageStatuses]);

  return {
    messageStatuses,
    markMessageAsRead,
    markConversationAsRead,
    getMessageStatus,
    getReadReceipts,
    getStatus,
    isMessageRead,
    isMessageDelivered,
    isBestEffort: true // UI can show "best effort, may not be real-time"
  };
}

/**
 * Hook for auto-marking messages as read when viewed
 */
export function useAutoReadReceipts(conversationId: number, enabled: boolean = true) {
  const { markMessageAsRead } = useTikTokReadReceipts(conversationId);
  const [viewedMessages, setViewedMessages] = useState<Set<number>>(new Set());

  const markAsViewed = useCallback((messageId: number) => {
    if (!enabled) return;

    if (!viewedMessages.has(messageId)) {
      setViewedMessages(prev => new Set(prev).add(messageId));
      markMessageAsRead(messageId);
    }
  }, [enabled, viewedMessages, markMessageAsRead]);

  const markMultipleAsViewed = useCallback((messageIds: number[]) => {
    if (!enabled) return;

    const newMessages = messageIds.filter(id => !viewedMessages.has(id));
    if (newMessages.length > 0) {
      setViewedMessages(prev => {
        const newSet = new Set(prev);
        newMessages.forEach(id => newSet.add(id));
        return newSet;
      });
      newMessages.forEach(id => markMessageAsRead(id));
    }
  }, [enabled, viewedMessages, markMessageAsRead]);

  return {
    markAsViewed,
    markMultipleAsViewed,
    viewedMessages
  };
}

/**
 * Hook for tracking message visibility (Intersection Observer)
 */
export function useMessageVisibility(
  _conversationId: number,
  onMessageVisible: (messageId: number) => void,
  options?: IntersectionObserverInit
) {
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const [observedElements, setObservedElements] = React.useState<Map<Element, number>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageId = observedElements.get(entry.target);
          if (messageId) {
            onMessageVisible(messageId);
          }
        }
      });
    }, {
      threshold: 0.5,
      ...options
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [onMessageVisible, options, observedElements]);

  const observe = useCallback((element: Element, messageId: number) => {
    if (observerRef.current && element) {
      observerRef.current.observe(element);
      setObservedElements(prev => new Map(prev).set(element, messageId));
    }
  }, []);

  const unobserve = useCallback((element: Element) => {
    if (observerRef.current && element) {
      observerRef.current.unobserve(element);
      setObservedElements(prev => {
        const newMap = new Map(prev);
        newMap.delete(element);
        return newMap;
      });
    }
  }, []);

  return {
    observe,
    unobserve
  };
}
