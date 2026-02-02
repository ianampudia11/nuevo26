import { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds
const EXPIRING_SOON_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface TikTokWindowStatus {
  status: 'active' | 'expiring_soon' | 'expired';
  isOpen: boolean;
  expiresAt: number | null;
  remainingTimeMs: number | null;
}

/**
 * Polls messaging window status for an active TikTok conversation.
 * Used by ConversationView to show status badge and countdown.
 */
export function useTikTokMessagingWindow(
  conversationId: number | null,
  channelType: string | undefined,
  groupMetadata: Record<string, unknown> | null | undefined
): TikTokWindowStatus {
  const [status, setStatus] = useState<TikTokWindowStatus>({
    status: 'active',
    isOpen: true,
    expiresAt: null,
    remainingTimeMs: null
  });

  const computeFromMetadata = useCallback((meta: Record<string, unknown> | null | undefined): TikTokWindowStatus => {
    if (!meta) {
      return { status: 'active', isOpen: true, expiresAt: null, remainingTimeMs: null };
    }

    const messagingWindowStatus = meta.messagingWindowStatus as 'open' | 'closed' | 'expired' | undefined;
    const expiresAt = typeof meta.messagingWindowExpiresAt === 'number' ? meta.messagingWindowExpiresAt : null;
    const now = Date.now();

    if (messagingWindowStatus === 'closed' || messagingWindowStatus === 'expired') {
      return {
        status: 'expired',
        isOpen: false,
        expiresAt,
        remainingTimeMs: 0
      };
    }

    if (expiresAt != null && expiresAt > 0) {
      const remaining = expiresAt - now;
      if (remaining <= 0) {
        return { status: 'expired', isOpen: false, expiresAt, remainingTimeMs: 0 };
      }
      if (remaining <= EXPIRING_SOON_MS) {
        return { status: 'expiring_soon', isOpen: true, expiresAt, remainingTimeMs: remaining };
      }
      return { status: 'active', isOpen: true, expiresAt, remainingTimeMs: remaining };
    }

    return { status: 'active', isOpen: true, expiresAt: null, remainingTimeMs: null };
  }, []);

  useEffect(() => {
    if (channelType !== 'tiktok' || !conversationId) {
      setStatus({ status: 'active', isOpen: true, expiresAt: null, remainingTimeMs: null });
      return;
    }

    const meta = groupMetadata as Record<string, unknown> | undefined;
    setStatus(computeFromMetadata(meta));
  }, [conversationId, channelType, groupMetadata, computeFromMetadata]);


  useEffect(() => {
    if (channelType !== 'tiktok' || !conversationId) return;

    const interval = setInterval(() => {
      setStatus(prev => {
        if (prev.expiresAt == null) return prev;
        const now = Date.now();
        const remaining = prev.expiresAt - now;
        if (remaining <= 0) {
          return { ...prev, status: 'expired', isOpen: false, remainingTimeMs: 0 };
        }
        if (remaining <= EXPIRING_SOON_MS) {
          return { ...prev, status: 'expiring_soon', remainingTimeMs: remaining };
        }
        return { ...prev, remainingTimeMs: remaining };
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [conversationId, channelType]);

  return status;
}
