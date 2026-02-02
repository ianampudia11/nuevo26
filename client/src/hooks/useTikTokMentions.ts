import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useToast } from './use-toast';

interface MentionNotification {
  messageId: number;
  conversationId: number;
  mentionedUserId: number;
  mentionedByUserId: number;
  messageContent: string;
  createdAt: Date;
}

export interface MentionSuggestion {
  userId: number;
  userName: string;
  displayName: string;
  avatar?: string;
}

/** TikTok uses @username format (no markdown-style @[Name](id)) */
const TIKTOK_MENTION_REGEX = /@(\w+)/g;

/**
 * Hook for managing mentions (TikTok Business Messaging API).
 * Uses TikTok's @username format; validation should ensure mentions only within messaging window.
 */
export function useTikTokMentions() {
  const { toast } = useToast();
  const [unreadMentions, setUnreadMentions] = useState<MentionNotification[]>([]);

  const loadUnreadMentions = useCallback(async () => {
    try {
      const response = await fetch('/api/tiktok/mentions/unread');
      if (response.ok) {
        const data = await response.json();
        setUnreadMentions(data.mentions || []);
      }
    } catch (error) {
      console.error('Error loading unread mentions:', error);
    }
  }, []);

  const markMentionAsRead = useCallback(async (messageId: number) => {
    try {
      const response = await fetch(`/api/tiktok/mentions/${messageId}/read`, {
        method: 'POST'
      });

      if (response.ok) {
        setUnreadMentions(prev => prev.filter(m => m.messageId !== messageId));
      }
    } catch (error) {
      console.error('Error marking mention as read:', error);
    }
  }, []);

  const clearAllMentions = useCallback(async () => {
    try {
      const response = await fetch('/api/tiktok/mentions', {
        method: 'DELETE'
      });

      if (response.ok) {
        setUnreadMentions([]);
      }
    } catch (error) {
      console.error('Error clearing mentions:', error);
    }
  }, []);

  useEffect(() => {
    loadUnreadMentions();
  }, [loadUnreadMentions]);

  return {
    unreadMentions,
    unreadCount: unreadMentions.length,
    loadUnreadMentions,
    markMentionAsRead,
    clearAllMentions
  };
}

/**
 * Hook for mention input with autocomplete (TikTok: @username format)
 */
export function useMentionInput(
  initialValue: string = '',
  users: MentionSuggestion[] = []
) {
  const [value, setValue] = useState(initialValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const getCurrentMentionQuery = useCallback((text: string, cursorPosition: number): string | null => {
    let atIndex = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (text[i] === '@') {
        atIndex = i;
        break;
      }
      if (text[i] === ' ' || text[i] === '\n') {
        break;
      }
    }

    if (atIndex === -1) return null;

    const query = text.substring(atIndex + 1, cursorPosition);
    if (query.includes(' ') || query.includes('\n')) {
      return null;
    }

    setMentionStart(atIndex);
    return query;
  }, []);

  const filterUsers = useCallback((query: string): MentionSuggestion[] => {
    if (!query) return users.slice(0, 5);

    const lowerQuery = query.toLowerCase();
    return users
      .filter(user =>
        user.userName.toLowerCase().includes(lowerQuery) ||
        user.displayName.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 5);
  }, [users]);

  const handleChange = useCallback((newValue: string, cursorPosition?: number) => {
    setValue(newValue);

    const cursor = cursorPosition ?? inputRef.current?.selectionStart ?? newValue.length;
    const query = getCurrentMentionQuery(newValue, cursor);

    if (query !== null) {
      const filtered = filterUsers(query);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
      setMentionStart(null);
    }
  }, [getCurrentMentionQuery, filterUsers]);

  /** Insert TikTok-style mention: @username */
  const insertMention = useCallback((user: MentionSuggestion) => {
    if (mentionStart === null || !inputRef.current) return;

    const cursor = inputRef.current.selectionStart || value.length;
    const before = value.substring(0, mentionStart);
    const after = value.substring(cursor);

    const mention = `@${user.userName}`;
    const newValue = before + mention + ' ' + after;
    const newCursor = before.length + mention.length + 1;

    setValue(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setMentionStart(null);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.selectionStart = newCursor;
        inputRef.current.selectionEnd = newCursor;
        inputRef.current.focus();
      }
    }, 0);
  }, [mentionStart, value]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
      case 'Tab':
        if (suggestions.length > 0) {
          e.preventDefault();
          insertMention(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
    }
  }, [showSuggestions, suggestions, selectedIndex, insertMention]);

  /** Parse TikTok @username mentions from text */
  const parseMentions = useCallback((text: string): { userId: number; userName: string }[] => {
    const mentions: { userId: number; userName: string }[] = [];
    const matches = text.matchAll(TIKTOK_MENTION_REGEX);
    const seen = new Set<string>();

    for (const match of matches) {
      const userName = match[1];
      if (seen.has(userName)) continue;
      seen.add(userName);
      const user = users.find(u => u.userName === userName || u.userName.toLowerCase() === userName.toLowerCase());
      if (user) {
        mentions.push({ userId: user.userId, userName: user.userName });
      }
    }

    return mentions;
  }, [users]);

  const formatForDisplay = useCallback((text: string): string => {
    return text; // TikTok @username is display-ready
  }, []);

  return {
    value,
    setValue,
    showSuggestions,
    suggestions,
    selectedIndex,
    inputRef,
    handleChange,
    handleKeyDown,
    insertMention,
    parseMentions,
    formatForDisplay
  };
}

/**
 * Hook for parsing mentions from text (TikTok @username format)
 */
export function useMentionHighlight(text: string, users: MentionSuggestion[] = []) {
  const [segments, setSegments] = useState<Array<{ type: 'text' | 'mention'; content: string; userId?: number; index?: number }>>([]);

  useEffect(() => {
    const parts: Array<{ type: 'text' | 'mention'; content: string; userId?: number; index?: number }> = [];
    let lastIndex = 0;
    let match;

    const re = new RegExp(TIKTOK_MENTION_REGEX.source, 'g');
    while ((match = re.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }

      const userName = match[1];
      const user = users.find(u => u.userName === userName || u.userName.toLowerCase() === userName.toLowerCase());

      parts.push({
        type: 'mention',
        content: userName,
        userId: user?.userId,
        index: match.index
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }

    setSegments(parts);
  }, [text, users]);

  return segments;
}
