import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useSocket from '@/hooks/useSocket';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useMessageCache } from '@/hooks/useMessageCache';
import { useMediaCache } from '@/hooks/useMediaCache';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';
import { showMessageNotification, registerNotificationClickHandler } from '@/utils/browser-notifications';
import { useLocation } from 'wouter';

interface InboxSettings {
  showGroupChats: boolean;
  browserNotifications: boolean;
  agentSignatureEnabled: boolean;
}

interface ConversationContextProps {
  activeConversationId: number | null;
  setActiveConversationId: (id: number | null) => void;
  activeChannelId: number | null;
  setActiveChannelId: (id: number | null) => void;
  conversations: any[];
  groupConversations: any[];
  contacts: any[];
  messages: Record<number, any[]>;
  messagesPagination: Record<number, { page: number; hasMore: boolean; loading: boolean }>;
  conversationsPagination: { page: number; hasMore: boolean; loading: boolean; total: number };
  groupConversationsPagination: { page: number; hasMore: boolean; loading: boolean; total: number };
  isLoading: boolean;
  isLoadingConversations: boolean;
  isLoadingGroupConversations: boolean;
  isWebSocketConnected: boolean;
  showGroupChats: boolean;
  setShowGroupChats: (show: boolean) => void;
  updateGroupChatSetting: (show: boolean) => Promise<void>;
  browserNotifications: boolean;
  setBrowserNotifications: (enabled: boolean) => void;
  updateBrowserNotificationSetting: (enabled: boolean) => Promise<void>;
  agentSignatureEnabled: boolean;
  setAgentSignatureEnabled: (enabled: boolean) => void;
  updateAgentSignatureSetting: (enabled: boolean) => Promise<void>;
  sendMessage: (conversationId: number, content: string, isBot?: boolean) => void;
  sendMediaMessage: (conversationId: number, file: File, caption?: string) => Promise<any>;
  loadMoreMessages: (conversationId: number) => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  loadMoreGroupConversations: () => Promise<void>;
  replyToMessage: any | null;
  setReplyToMessage: (message: any | null) => void;
  refetchConversations: () => Promise<any>;
  refetchContacts: () => Promise<any>;
  refetchGroupConversations: () => Promise<any>;
}

const ConversationContext = createContext<ConversationContextProps | undefined>(undefined);


function isWhatsAppGroupChatId(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  const cleanNumber = phoneNumber.replace(/[^\d]/g, '');

  return (
    cleanNumber.length >= 15 &&
    cleanNumber.length <= 25 &&
    cleanNumber.startsWith('120') &&
    /^\d+$/.test(cleanNumber) &&
    cleanNumber !== '120'
  );
}

function filterGroupChatsFromConversations(conversations: any[]): any[] {
  if (!Array.isArray(conversations)) {
    console.warn('[WhatsApp Group Filter] Invalid conversations array provided');
    return [];
  }

  return conversations.filter(conversation => {
    if (!conversation) {
      return false;
    }

    if (conversation.is_group === true || conversation.isGroup === true) {
      return false;
    }

    if (conversation.group_jid || conversation.groupJid) {
      return false;
    }

    if (conversation.contact) {
      const phone = conversation.contact.phone || conversation.contact.identifier;
      if (isWhatsAppGroupChatId(phone)) {
        return false;
      }
    }

    if (conversation.phone && isWhatsAppGroupChatId(conversation.phone)) {
      return false;
    }

    if (conversation.identifier && isWhatsAppGroupChatId(conversation.identifier)) {
      return false;
    }

    if (conversation.contactId === null && !conversation.isGroup && !conversation.is_group) {
      const suspiciousId = conversation.groupJid || conversation.group_jid ||
                          conversation.phone || conversation.identifier;
      if (suspiciousId && isWhatsAppGroupChatId(suspiciousId)) {
        return false;
      }
    }

    return true;
  });
}

function filterMessengerFromConversations(conversations: any[]): any[] {
  if (!Array.isArray(conversations)) {
    console.warn('[Messenger Filter] Invalid conversations array provided');
    return [];
  }

  return conversations.filter(conversation => {
    if (!conversation) {
      return false;
    }



    if (conversation.channelConnection?.channelType === 'messenger') {
      return false;
    }



    if (conversation.channelId) {


    }

    return true;
  });
}

function filterGroupChatsFromContacts(contacts: any[]): any[] {
  if (!Array.isArray(contacts)) {
    console.warn('[WhatsApp Group Filter] Invalid contacts array provided');
    return [];
  }

  return contacts.filter(contact => {
    if (!contact) {
      return false;
    }

    if (contact.phone && isWhatsAppGroupChatId(contact.phone)) {
      return false;
    }

    if (contact.identifier && isWhatsAppGroupChatId(contact.identifier)) {
      return false;
    }

    return true;
  });
}

function filterMessengerFromContacts(contacts: any[]): any[] {
  if (!Array.isArray(contacts)) {
    console.warn('[Messenger Filter] Invalid contacts array provided');
    return [];
  }

  return contacts.filter(contact => {
    if (!contact) {
      return false;
    }



    if (contact.identifierType === 'messenger') {
      return false;
    }

    return true;
  });
}

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';

  let normalized = phone.replace(/[^\d+]/g, '');

  if (normalized.startsWith('+')) {
    return normalized;
  } else {
    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) {
      return '+' + normalized;
    }
    return normalized;
  }
}

function deduplicateContactsByPhone(contacts: any[]): any[] {
  const phoneMap = new Map();

  contacts.forEach(contact => {
    const normalizedPhone = normalizePhoneNumber(contact.phone || '');

    if (normalizedPhone && !phoneMap.has(normalizedPhone)) {
      phoneMap.set(normalizedPhone, contact);
    } else if (normalizedPhone) {
      const existingContact = phoneMap.get(normalizedPhone);

      if (new Date(contact.createdAt) > new Date(existingContact.createdAt)) {
        phoneMap.set(normalizedPhone, contact);
      }
    } else if (!normalizedPhone) {

      phoneMap.set(`no-phone-${contact.id}`, contact);
    }
  });

  return Array.from(phoneMap.values());
}

function deduplicateConversationsByContact(conversations: any[]): any[] {
  const contactMap = new Map();

  conversations.forEach(conversation => {
    const contactId = conversation.contactId;
    const channelId = conversation.channelId;
    const key = `${contactId}-${channelId}`;

    if (!contactMap.has(key)) {
      contactMap.set(key, conversation);
    } else {
      const existingConversation = contactMap.get(key);

      if (new Date(conversation.lastMessageAt) > new Date(existingConversation.lastMessageAt)) {
        contactMap.set(key, conversation);
      }
    }
  });

  return Array.from(contactMap.values());
}

interface ConversationProviderProps {
  children: ReactNode;
}

export function ConversationProvider({ children }: ConversationProviderProps) {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Record<number, any[]>>({});
  const [messagesPagination, setMessagesPagination] = useState<Record<number, { page: number; hasMore: boolean; loading: boolean }>>({});
  const [conversationsPagination, setConversationsPagination] = useState<{ page: number; hasMore: boolean; loading: boolean; total: number }>({
    page: 1,
    hasMore: true,
    loading: false,
    total: 0
  });

  const messageCache = useMessageCache({
    enabled: true,
    cacheFirst: true,
    maxCacheAge: 5 * 60 * 1000,
    prefetchNext: true
  });

  const mediaCache = useMediaCache({
    enabled: true,
    maxCacheAge: 24 * 60 * 60 * 1000,
    preloadImages: true,
    preloadThumbnails: true
  });
  const [groupConversationsPagination, setGroupConversationsPagination] = useState<{ page: number; hasMore: boolean; loading: boolean; total: number }>({
    page: 1,
    hasMore: true,
    loading: false,
    total: 0
  });
  const [allConversations, setAllConversations] = useState<any[]>([]);
  const [allGroupConversations, setAllGroupConversations] = useState<any[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<any | null>(null);
  const [showGroupChats, setShowGroupChats] = useState<boolean>(false);
  const [browserNotifications, setBrowserNotifications] = useState<boolean>(false);
  const [agentSignatureEnabled, setAgentSignatureEnabled] = useState<boolean>(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { canViewAllConversations, canOnlyViewAssignedConversations } = usePermissions();
  const { activeChannelId: globalActiveChannelId } = useActiveChannel();

  const { isConnected, sendMessage: wsSend, onMessage } = useSocket('/ws');
  const [, navigate] = useLocation();


  useEffect(() => {
    const handleNotificationClick = (data: any) => {


      if (data && data.conversationId) {

        window.focus();


        const currentPath = window.location.pathname;
        if (currentPath !== '/inbox' && currentPath !== '/') {

          navigate('/inbox');


          setTimeout(() => {
            setActiveConversationId(data.conversationId);

            const conversation = [...allConversations, ...allGroupConversations].find(conv => conv.id === data.conversationId);
            if (conversation && conversation.channelId) {
              setActiveChannelId(conversation.channelId);
            }
          }, 100);

          return; // Exit early to let the timeout handle conversation selection
        }



        setActiveConversationId(data.conversationId);


        const conversation = [...allConversations, ...allGroupConversations].find(conv => conv.id === data.conversationId);
        if (conversation && conversation.channelId) {

          setActiveChannelId(conversation.channelId);
        }


        toast({
          title: t('notifications.conversation_opened', 'Conversation Opened'),
          description: t('notifications.navigated_to_conversation', 'Navigated to the conversation from notification'),
        });
      }
    };


    registerNotificationClickHandler('conversation', handleNotificationClick);

    return () => {

    };
  }, [setActiveConversationId, setActiveChannelId, navigate, allConversations, allGroupConversations, toast, t]);

  /**
   * Client-side permission validation for conversation visibility
   * This provides an additional security layer beyond server-side filtering
   */
  const canUserViewConversation = useCallback((conversation: any): boolean => {
    if (!user || !conversation) {
      return false;
    }


    if (user.isSuperAdmin) {
      return true;
    }


    if (conversation.companyId !== null && conversation.companyId !== user.companyId) {
      console.warn(`[Security] Conversation ${conversation.id} belongs to different company (${conversation.companyId} vs ${user.companyId})`);
      return false;
    }


    if (canViewAllConversations()) {

      return true;
    } else if (canOnlyViewAssignedConversations()) {

      const canView = conversation.assignedToUserId === user.id;
      if (!canView) {
        console.warn(`[Security] Conversation ${conversation.id} not assigned to user ${user.id} (assigned to: ${conversation.assignedToUserId})`);
      }
      return canView;
    }


    console.warn(`[Security] User ${user.id} has no permission to view conversation ${conversation.id}`);
    return false;
  }, [user, canViewAllConversations, canOnlyViewAssignedConversations]);

  const fetchConversations = async (page: number = 1, append: boolean = false) => {
    if (!user || authLoading) {
      return;
    }

    try {
      setConversationsPagination(prev => ({
        ...prev,
        loading: true
      }));

      const res = await apiRequest('GET', `/api/conversations?page=${page}&limit=20`);

      if (!res.ok) {
        throw new Error(`Failed to fetch conversations: ${res.status}`);
      }

      const data = await res.json();

      setAllConversations(prev => {
        const newConversations = append ? [...prev, ...data.conversations] : data.conversations;
        return newConversations;
      });

      setConversationsPagination({
        page: data.page,
        hasMore: data.page < data.totalPages,
        loading: false,
        total: data.total
      });
    } catch (error: any) {

      const isSubscriptionError = error.message?.includes('402') || error.message?.includes('SUBSCRIPTION_EXPIRED');

      if (!isSubscriptionError) {
        console.error('Error fetching conversations:', error);
        toast({
          title: t('common.error', 'Error'),
          description: t('inbox.failed_load_conversations', 'Failed to load conversations'),
          variant: "destructive"
        });
      }

      setConversationsPagination(prev => ({
        ...prev,
        loading: false
      }));
    }
  };

  const loadMoreConversations = async () => {
    if (conversationsPagination.loading || !conversationsPagination.hasMore) return;
    await fetchConversations(conversationsPagination.page + 1, true);
  };

  const fetchGroupConversations = async (page: number = 1, append: boolean = false) => {
    if (!user || authLoading || !showGroupChats) {
      return;
    }

    try {
      setGroupConversationsPagination(prev => ({
        ...prev,
        loading: true
      }));

      const res = await apiRequest('GET', `/api/group-conversations?page=${page}&limit=20`);

      if (!res.ok) {
        throw new Error(`Failed to fetch group conversations: ${res.status}`);
      }

      const data = await res.json();

      setAllGroupConversations(prev => {
        const newConversations = append ? [...prev, ...data.conversations] : data.conversations;
        return newConversations;
      });

      setGroupConversationsPagination({
        page: data.page,
        hasMore: data.page < data.totalPages,
        loading: false,
        total: data.total
      });
    } catch (error: any) {

      const isSubscriptionError = error.message?.includes('402') || error.message?.includes('SUBSCRIPTION_EXPIRED');

      if (!isSubscriptionError) {
        console.error('Error fetching group conversations:', error);
        toast({
          title: t('common.error', 'Error'),
          description: t('inbox.failed_load_group_conversations', 'Failed to load group conversations'),
          variant: "destructive"
        });
      }

      setGroupConversationsPagination(prev => ({
        ...prev,
        loading: false
      }));
    }
  };

  const loadMoreGroupConversations = async () => {
    if (groupConversationsPagination.loading || !groupConversationsPagination.hasMore) return;
    await fetchGroupConversations(groupConversationsPagination.page + 1, true);
  };

  const refetchConversations = async () => {
    await fetchConversations(1, false);
  };

  const refetchGroupConversations = async () => {
    if (showGroupChats) {
      await fetchGroupConversations(1, false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) {
      fetchConversations(1, false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (user && !authLoading && showGroupChats) {
      fetchGroupConversations(1, false);
    }
  }, [user, authLoading, showGroupChats]);


  const conversations = useMemo(() => {
    const rawConversations = allConversations;


    const filteredGroupChats = filterGroupChatsFromConversations(rawConversations);


    const filteredMessenger = filterMessengerFromConversations(filteredGroupChats);

    return deduplicateConversationsByContact(filteredMessenger);
  }, [allConversations]);

  const { data: contactsResponse = [], isLoading: isLoadingContacts, refetch: refetchContacts } = useQuery({
    queryKey: ['/api/contacts'],
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: false,
    enabled: !!user && !authLoading,
  });

  const { data: inboxSettings } = useQuery<InboxSettings>({
    queryKey: ['/api/settings/inbox'],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000,
    enabled: !!user && !authLoading,
  });


  useEffect(() => {
    if (inboxSettings?.showGroupChats !== undefined) {
      setShowGroupChats(inboxSettings.showGroupChats);
    }
    if (inboxSettings?.browserNotifications !== undefined) {
      setBrowserNotifications(inboxSettings.browserNotifications);
    }
    if (inboxSettings?.agentSignatureEnabled !== undefined) {
      setAgentSignatureEnabled(inboxSettings.agentSignatureEnabled);
    }
  }, [inboxSettings]);

  const areChannelTypesCompatible = (contactChannelType: string, conversationChannelType: string): boolean => {
    if (contactChannelType === conversationChannelType) {
      return true;
    }

    const whatsappTypes = ['whatsapp', 'whatsapp_unofficial', 'whatsapp_official'];
    const isContactWhatsApp = whatsappTypes.includes(contactChannelType);
    const isConversationWhatsApp = whatsappTypes.includes(conversationChannelType);

    return isContactWhatsApp && isConversationWhatsApp;
  };

  useEffect(() => {
    const selectedContactId = localStorage.getItem('selectedContactId');
    const selectedChannelType = localStorage.getItem('selectedChannelType');



    if (conversationsPagination.loading || authLoading || !user) {
      return;
    }

    if (selectedContactId && selectedChannelType && conversations.length === 0) {
      return;
    }

    if (selectedContactId && selectedChannelType && conversations.length > 0) {
      const contactId = parseInt(selectedContactId);

      if (isNaN(contactId)) {
        localStorage.removeItem('selectedContactId');
        localStorage.removeItem('selectedChannelType');
        return;
      }

      const exactMatch = conversations.find(conv =>
        conv.contactId === contactId &&
        areChannelTypesCompatible(selectedChannelType, conv.channelType)
      );

      if (exactMatch) {
        setActiveConversationId(exactMatch.id);
        setActiveChannelId(exactMatch.channelId);

        localStorage.removeItem('selectedContactId');
        localStorage.removeItem('selectedChannelType');
        return;
      }

      const contactMatch = conversations.find(conv => conv.contactId === contactId);

      if (contactMatch) {
        setActiveConversationId(contactMatch.id);
        setActiveChannelId(contactMatch.channelId);

        localStorage.removeItem('selectedContactId');
        localStorage.removeItem('selectedChannelType');
        return;
      }

      setTimeout(() => {
        const retryConversations = conversations;
        const retryExactMatch = retryConversations.find(conv =>
          conv.contactId === contactId &&
          areChannelTypesCompatible(selectedChannelType, conv.channelType)
        );

        if (retryExactMatch) {
          setActiveConversationId(retryExactMatch.id);
          setActiveChannelId(retryExactMatch.channelId);
          localStorage.removeItem('selectedContactId');
          localStorage.removeItem('selectedChannelType');
          return;
        }

        const retryContactMatch = retryConversations.find(conv => conv.contactId === contactId);
        if (retryContactMatch) {
          setActiveConversationId(retryContactMatch.id);
          setActiveChannelId(retryContactMatch.channelId);
          localStorage.removeItem('selectedContactId');
          localStorage.removeItem('selectedChannelType');
          return;
        }

        localStorage.removeItem('selectedContactId');
        localStorage.removeItem('selectedChannelType');
      }, 1000);
    }
  }, [conversations, setActiveConversationId, setActiveChannelId, activeConversationId, conversationsPagination.loading, authLoading, user, areChannelTypesCompatible]);

  const updateGroupChatSetting = async (show: boolean) => {
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', {
        showGroupChats: show
      });

      if (!response.ok) {
        throw new Error('Failed to update inbox settings');
      }

      setShowGroupChats(show);

      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });

      if (show) {
        refetchGroupConversations();
      }

      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: show
          ? t('settings.group_chats_enabled', 'Group chats are now visible in the inbox')
          : t('settings.group_chats_disabled', 'Group chats are now hidden from the inbox'),
      });
    } catch (error) {
      console.error('Error updating group chat setting:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.update_failed', 'Failed to update settings'),
        variant: 'destructive',
      });
    }
  };

  const updateBrowserNotificationSetting = async (enabled: boolean) => {
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', {
        browserNotifications: enabled
      });

      if (!response.ok) {
        throw new Error('Failed to update inbox settings');
      }

      setBrowserNotifications(enabled);

      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });

      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: enabled
          ? t('settings.browser_notifications_enabled', 'Browser notifications are now enabled')
          : t('settings.browser_notifications_disabled', 'Browser notifications are now disabled'),
      });
    } catch (error) {
      console.error('Error updating browser notification setting:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.update_failed', 'Failed to update settings'),
        variant: 'destructive',
      });
    }
  };

  const updateAgentSignatureSetting = async (enabled: boolean) => {
    try {
      const response = await apiRequest('PATCH', '/api/settings/inbox', {
        agentSignatureEnabled: enabled
      });

      if (!response.ok) {
        throw new Error('Failed to update inbox settings');
      }

      setAgentSignatureEnabled(enabled);

      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });

      toast({
        title: t('settings.updated', 'Settings Updated'),
        description: enabled
          ? t('settings.agent_signature_enabled', 'Agent signatures are now enabled')
          : t('settings.agent_signature_disabled', 'Agent signatures are now disabled'),
      });
    } catch (error) {
      console.error('Error updating agent signature setting:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.update_failed', 'Failed to update settings'),
        variant: 'destructive',
      });
    }
  };

  const contacts = useMemo(() => {
    const rawContacts = Array.isArray(contactsResponse) ? contactsResponse : [];


    const filteredGroupChats = filterGroupChatsFromContacts(rawContacts);


    const filteredMessenger = filterMessengerFromContacts(filteredGroupChats);

    return deduplicateContactsByPhone(filteredMessenger);
  }, [contactsResponse]);



  const enrichConversationWithContact = useCallback((conv: any) => {
    if (!conv || conv.isGroup) return conv;
    if (conv.contact) return conv;
    if (conv.contactId && Array.isArray(contacts)) {
      const match = (contacts as any[]).find((c: any) => c.id === conv.contactId);
      if (match) {
        return { ...conv, contact: match };
      }
    }
    return conv;
  }, [contacts]);


  useEffect(() => {
    if (!Array.isArray(contacts) || contacts.length === 0) return;
    setAllConversations(prev => prev.map(conv => (!conv?.isGroup && !conv?.contact && conv?.contactId ? enrichConversationWithContact(conv) : conv)));
  }, [contacts, enrichConversationWithContact]);

  const groupConversations = useMemo(() => {
    return allGroupConversations;
  }, [allGroupConversations]);

  useEffect(() => {
    const selectedContactId = localStorage.getItem('selectedContactId');
    const selectedChannelType = localStorage.getItem('selectedChannelType');

    if (selectedContactId && selectedChannelType && groupConversations.length > 0 && showGroupChats) {
      const matchingGroupConversation = groupConversations.find(conv =>
        conv.channelType === selectedChannelType
      );

      if (matchingGroupConversation) {
        setActiveConversationId(matchingGroupConversation.id);
        setActiveChannelId(matchingGroupConversation.channelId);

        localStorage.removeItem('selectedContactId');
        localStorage.removeItem('selectedChannelType');
      }
    }
  }, [groupConversations, showGroupChats, setActiveConversationId, setActiveChannelId]);

  useEffect(() => {
    if (isConnected) {
      refetchConversations();
      refetchContacts();
      if (showGroupChats) {
        refetchGroupConversations();
      }
    }
  }, [isConnected, refetchContacts, showGroupChats]);

  useEffect(() => {
    if (!isConnected && user && !authLoading) {
      const interval = setInterval(() => {
        refetchConversations();
        refetchContacts();
        if (showGroupChats) {
          refetchGroupConversations();
        }
      }, 30000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [isConnected, user, authLoading, refetchConversations, refetchContacts, refetchGroupConversations, showGroupChats]);

  const isGroupConversation = (conversationId: number): boolean => {
    const groupConv = groupConversations.find(conv => conv.id === conversationId);
    if (groupConv) return true;

    const regularConv = conversations.find(conv => conv.id === conversationId);
    if (regularConv && (regularConv.isGroup || regularConv.groupJid)) return true;

    return false;
  };

  const fetchMessages = async (conversationId: number, page: number = 1, append: boolean = false) => {

    if (!user || authLoading) {
      return;
    }

    try {
      setMessagesPagination(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {}),
          page: 1,
          hasMore: true,
          loading: true
        }
      }));

      const isGroup = isGroupConversation(conversationId);


      if (page === 1 && !append) {
        await messageCache.invalidateConversationCache(conversationId);
      }

      const result = await messageCache.loadMessages(conversationId, page, 25, isGroup);



      setMessages(prev => {
        const existingMessages = prev[conversationId] || [];
        const newMessages = append ? [...result.messages, ...existingMessages] : result.messages;

        if (newMessages.length > 0) {
          mediaCache.preloadMessagesMedia(newMessages).catch(console.error);
        }

        return {
          ...prev,
          [conversationId]: newMessages
        };
      });

      setMessagesPagination(prev => ({
        ...prev,
        [conversationId]: {
          page: page,
          hasMore: result.hasMore,
          loading: false
        }
      }));
    } catch (err: any) {

      const isSubscriptionError = err.message?.includes('402') || err.message?.includes('SUBSCRIPTION_EXPIRED');

      if (!isSubscriptionError) {
        console.error('Error fetching messages:', err);
        toast({
          title: t('common.error', 'Error'),
          description: t('inbox.failed_load_messages', 'Failed to load conversation messages'),
          variant: "destructive"
        });
      }

      setMessagesPagination(prev => ({
        ...prev,
        [conversationId]: {
          ...(prev[conversationId] || {}),
          page: 1,
          hasMore: true,
          loading: false
        }
      }));
    }
  };

  const loadMoreMessages = async (conversationId: number) => {
    const pagination = messagesPagination[conversationId];
    if (!pagination || pagination.loading || !pagination.hasMore) return;

    await fetchMessages(conversationId, pagination.page + 1, true);
  };

  useEffect(() => {
    if (activeConversationId && user && !authLoading) {
      setMessagesPagination(prev => ({
        ...prev,
        [activeConversationId]: { page: 1, hasMore: true, loading: false }
      }));

      const markConversationAsRead = async () => {
        try {
          const response = await fetch(`/api/conversations/${activeConversationId}/mark-read`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
          }
        } catch (error) {
        }
      };


      fetchMessages(activeConversationId);
      markConversationAsRead();
    }
  }, [activeConversationId, user, authLoading, toast]);

  useEffect(() => {
    const unsubscribe = onMessage('messageDeleted', (data) => {
      const { messageId, conversationId } = data.data;
      if (messageId && conversationId) {
        setMessages(prev => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).filter(msg => msg.id !== messageId)
        }));

        messageCache.removeMessageFromCache(messageId).catch(console.error);
      }
    });

    return unsubscribe;
  }, [onMessage, messageCache]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationHistoryCleared', (data) => {
      const { conversationId } = data.data;
      if (conversationId) {
        setMessages(prev => ({
          ...prev,
          [conversationId]: []
        }));

        setMessagesPagination(prev => ({
          ...prev,
          [conversationId]: { page: 1, hasMore: false, loading: false }
        }));

        messageCache.invalidateConversationCache(conversationId).catch(console.error);

        toast({
          title: "Chat History Cleared",
          description: "All messages have been removed from this conversation.",
          variant: "default"
        });
      }
    });

    return unsubscribe;
  }, [onMessage, toast, messageCache]);

  useEffect(() => {
    const unsubscribe = onMessage('newMessage', (data) => {
      const message = data.data;

      if (message && message.conversationId) {
        setMessages(prev => {
          const existingMessages = prev[message.conversationId] || [];

          const isDuplicate = existingMessages.some(existingMsg => {
            if (existingMsg.id === message.id) {
              return true;
            }

            if (existingMsg.externalId && message.externalId && existingMsg.externalId === message.externalId) {
              return true;
            }

            if (existingMsg.content === message.content &&
                existingMsg.direction === message.direction &&
                existingMsg.type === message.type &&
                Math.abs(new Date(existingMsg.createdAt).getTime() - new Date(message.createdAt).getTime()) < 2000) {
              return true;
            }

            if (message.mediaUrl && existingMsg.mediaUrl &&
                existingMsg.mediaUrl === message.mediaUrl &&
                existingMsg.direction === message.direction &&
                Math.abs(new Date(existingMsg.createdAt).getTime() - new Date(message.createdAt).getTime()) < 10000) {
              return true;
            }

            if (message.type && existingMsg.type &&
                message.type === existingMsg.type &&
                message.direction === existingMsg.direction &&
                ['image', 'video', 'audio', 'document'].includes(message.type) &&
                (message.content === `${message.type.charAt(0).toUpperCase() + message.type.slice(1)} message` ||
                 existingMsg.content === `${existingMsg.type.charAt(0).toUpperCase() + existingMsg.type.slice(1)} message`) &&
                Math.abs(new Date(existingMsg.createdAt).getTime() - new Date(message.createdAt).getTime()) < 5000) {
              return true;
            }

            return false;
          });

          if (isDuplicate) {
            return prev;
          }

          messageCache.addMessageToCache(message).catch(console.error);

          if (message.mediaUrl && message.type && message.type !== 'text') {
            mediaCache.preloadMedia(message.mediaUrl, message.type).catch(console.error);
          }

          return {
            ...prev,
            [message.conversationId]: [
              ...existingMessages,
              message
            ]
          };
        });

        queryClient.invalidateQueries({
          queryKey: ['/api/conversations']
        });

        queryClient.invalidateQueries({
          queryKey: ['/api/conversations', message.conversationId, 'messages']
        });

        const audio = new Audio('/assets/notification.mp3');
        audio.play().catch(() => {
        });


        if (browserNotifications && (message.direction === 'incoming' || message.direction === 'inbound')) {


          const conversation = [...allConversations, ...allGroupConversations].find(conv => conv.id === message.conversationId);
          if (conversation) {
            const isGroup = conversation.isGroup || conversation.groupJid;
            const senderName = isGroup
              ? (conversation.groupName || 'Group Chat')
              : (conversation.contact?.name || message.senderName || 'Unknown Contact');


            let messagePreview = message.content || '';
            if (message.type && message.type !== 'text') {
              messagePreview = `${message.type.charAt(0).toUpperCase() + message.type.slice(1)} message`;
            }



            showMessageNotification(senderName, messagePreview, message.conversationId, isGroup).catch(console.error);
          } else {

          }
        } else {

        }
      }
    });

    return unsubscribe;
  }, [onMessage, queryClient, browserNotifications, allConversations, allGroupConversations]);

  useEffect(() => {
    const unsubscribe = onMessage('messageStatusUpdate', (data) => {
      const { messageId, status } = data.data;
      if (messageId && status) {
        setMessages(prev => {
          const updatedMessages = { ...prev };

          Object.keys(updatedMessages).forEach(conversationIdStr => {
            const conversationId = parseInt(conversationIdStr, 10);
            const messages = updatedMessages[conversationId] || [];
            const messageIndex = messages.findIndex((msg: any) => msg.id === messageId);

            if (messageIndex !== -1) {
              const updatedConversationMessages = [...messages];
              updatedConversationMessages[messageIndex] = {
                ...updatedConversationMessages[messageIndex],
                status
              };
              updatedMessages[conversationId] = updatedConversationMessages;
            }
          });

          return updatedMessages;
        });

        messageCache.updateMessageInCache(messageId, { status }).catch(console.error);
      }
    });

    return unsubscribe;
  }, [onMessage, messageCache]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationUpdated', (data) => {
      const updatedConversation = data.data;

      if (!updatedConversation || !updatedConversation.id) {
        return;
      }


      if (!canUserViewConversation(updatedConversation)) {
        console.warn(`[Security] Blocked conversation update for conversation ${updatedConversation.id} - insufficient permissions`);
        return;
      }

      const filteredConversations = filterGroupChatsFromConversations([updatedConversation]);
      if (filteredConversations.length === 0) {
        if (showGroupChats && (updatedConversation.isGroup || updatedConversation.groupJid)) {
          setAllGroupConversations(prev => {
            const exists = prev.some(conv => conv.id === updatedConversation.id);
            if (exists) {
              return prev.map(conv =>
                conv.id === updatedConversation.id ? { ...conv, ...updatedConversation } : conv
              );
            }
            return [enrichConversationWithContact(updatedConversation), ...prev];
          });
        }
        return;
      }

      setAllConversations(prev => {
        const exists = prev.some(conv => conv.id === updatedConversation.id);
        if (exists) {
          return prev.map(conv =>
            conv.id === updatedConversation.id ? { ...conv, ...updatedConversation } : conv
          );
        }
        return [enrichConversationWithContact(updatedConversation), ...prev];
      });
    });

    return unsubscribe;
  }, [onMessage, showGroupChats]);


  useEffect(() => {
    const unsubscribe = onMessage('contactDeleted', (data) => {
      const { contactId, companyId } = data.data;

      if (!contactId || !companyId) return;


      setAllConversations(prev =>
        prev.filter(conv => conv.contactId !== contactId)
      );

      setAllGroupConversations(prev =>
        prev.filter(conv => conv.contactId !== contactId)
      );


      setMessages(prev => {
        const updatedMessages: { [key: string]: any[] } = { ...prev };
        Object.keys(updatedMessages).forEach(conversationIdStr => {
          const conversationId = parseInt(conversationIdStr);
          const conversation = [...allConversations, ...allGroupConversations]
            .find(conv => conv.id === conversationId);
          if (conversation && conversation.contactId === contactId) {
            delete updatedMessages[conversationIdStr];
          }
        });
        return updatedMessages;
      });


      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });

      toast({
        title: "Contact Deleted",
        description: "Contact and all associated conversations have been removed.",
        variant: "default"
      });
    });

    return unsubscribe;
  }, [onMessage, allConversations, allGroupConversations, queryClient, toast]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationCreated', (data) => {
      const newConversation = data.data;

      const filteredConversations = filterGroupChatsFromConversations([newConversation]);
      if (filteredConversations.length === 0) {
        if (showGroupChats && (newConversation.isGroup || newConversation.groupJid)) {
          setAllGroupConversations(prev => {
            const exists = prev.some(conv => conv.id === newConversation.id);
            if (exists) return prev;

            return [enrichConversationWithContact(newConversation), ...prev];
          });

          setGroupConversationsPagination(prev => ({
            ...prev,
            total: prev.total + 1
          }));
        }
        return;
      }

      setAllConversations(prev => {
        const exists = prev.some(conv => conv.id === newConversation.id);
        if (exists) return prev;

        return [enrichConversationWithContact(newConversation), ...prev];
      });

      setConversationsPagination(prev => ({
        ...prev,
        total: prev.total + 1
      }));
    });

    return unsubscribe;
  }, [onMessage, showGroupChats]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationAssigned', (data) => {
      const { conversationId, agentId } = data.data;

      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId ? { ...conv, assignedToUserId: agentId } : conv
        )
      );

      toast({
        title: t('inbox.conversation_assigned', 'Conversation Assigned'),
        description: agentId
          ? t('inbox.conversation_assigned_to_agent', 'Conversation has been assigned to an agent')
          : t('inbox.conversation_unassigned', 'Conversation has been unassigned'),
      });
    });

    return unsubscribe;
  }, [onMessage, toast]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationUnassigned', (data) => {
      const { conversationId } = data.data;

      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId ? { ...conv, assignedToUserId: null } : conv
        )
      );

      toast({
        title: t('inbox.conversation_unassigned', 'Conversation Unassigned'),
        description: t('inbox.conversation_unassigned_desc', 'Conversation has been unassigned'),
      });
    });

    return unsubscribe;
  }, [onMessage, toast]);

  useEffect(() => {
    const unsubscribe = onMessage('unreadCountUpdated', (data) => {
      const { conversationId, unreadCount } = data.data;

      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId ? { ...conv, unreadCount } : conv
        )
      );
    });

    return unsubscribe;
  }, [onMessage]);

  useEffect(() => {
    const unsubscribe = onMessage('newConversation', (data) => {
      const newConversation = data.data;

      if (!newConversation || !newConversation.id) {
        return;
      }


      if (!canUserViewConversation(newConversation)) {
        console.warn(`[Security] Blocked new conversation ${newConversation.id} - insufficient permissions`);
        return;
      }

      const filteredConversations = filterGroupChatsFromConversations([newConversation]);
      if (filteredConversations.length === 0) {
        if (showGroupChats && (newConversation.isGroup || newConversation.groupJid)) {
          setAllGroupConversations(prev => {
            const exists = prev.some(conv => conv.id === newConversation.id);
            if (exists) {
              return prev.map(conv =>
                conv.id === newConversation.id
                  ? { ...conv, ...newConversation }
                  : conv
              );
            }

            return [enrichConversationWithContact(newConversation), ...prev];
          });

          setGroupConversationsPagination(prev => ({
            ...prev,
            total: prev.total + 1
          }));
        }
        return;
      }

      setAllConversations(prev => {
        const exists = prev.some(conv => conv.id === newConversation.id);
        if (exists) {
          return prev.map(conv =>
            conv.id === newConversation.id
              ? { ...conv, ...newConversation }
              : conv
          );
        }

        return [enrichConversationWithContact(newConversation), ...prev];
      });

      setConversationsPagination(prev => ({
        ...prev,
        total: prev.total + 1
      }));

      queryClient.invalidateQueries({
        queryKey: ['/api/conversations']
      });

      queryClient.invalidateQueries({
        queryKey: ['/api/contacts']
      });
    });

    return unsubscribe;
  }, [onMessage, showGroupChats, queryClient, canUserViewConversation]);

  useEffect(() => {
    const unsubscribe = onMessage('conversationBotStatusUpdated', (data) => {
      const { conversationId, botDisabled, disabledAt, disableDuration, disableReason } = data.data;

      queryClient.setQueryData(['bot-status', conversationId], {
        conversationId,
        botDisabled,
        disabledAt,
        disableDuration,
        disableReason
      });

      setAllConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? { ...conv, botDisabled, disabledAt, disableDuration, disableReason }
            : conv
        )
      );
    });

    return unsubscribe;
  }, [onMessage, queryClient]);

  useEffect(() => {
    const unsubscribe = onMessage('historySyncProgress', (data) => {
      const { connectionId, phase, progress, processedMessages, totalMessages, processedChats, processedContacts } = data.data;

      queryClient.setQueryData(['channel-connections'], (oldData: any) => {
        if (!oldData) return oldData;

        return oldData.map((conn: any) =>
          conn.id === connectionId
            ? {
                ...conn,
                historySyncStatus: 'processing',
                historySyncProgress: progress,
                historySyncPhase: phase
              }
            : conn
        );
      });


      if (processedMessages > 0 && processedMessages % 50 === 0) {
        toast({
          title: t('settings.history_sync_progress', 'History Sync Progress'),
          description: t('settings.history_sync_in_progress', 
            `Syncing Phase ${phase}/3: ${progress}% complete`,
            { phase, progress }
          ),
        });
      }
    });

    return unsubscribe;
  }, [onMessage, queryClient, toast, t]);

  useEffect(() => {
    const unsubscribe = onMessage('whatsappHistorySyncComplete', (data) => {
      const { connectionId, totalChats, totalMessages, totalContacts } = data.data;

      queryClient.setQueryData(['channel-connections'], (oldData: any) => {
        if (!oldData) return oldData;

        return oldData.map((conn: any) =>
          conn.id === connectionId
            ? {
                ...conn,
                historySyncStatus: 'completed',
                lastHistorySyncAt: new Date().toISOString()
              }
            : conn
        );
      });

      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });

      toast({
        title: t('settings.history_sync_complete', 'History Sync Complete'),
        description: t('settings.history_sync_complete_desc',
          `Successfully synced ${totalChats} conversations, ${totalMessages} messages, and ${totalContacts} contacts`
        ),
      });
    });

    return unsubscribe;
  }, [onMessage, queryClient, toast, t]);

  const sendMessage = (conversationId: number, content: string, isBot: boolean = false) => {
    if (!isConnected) {
      toast({
        title: t('inbox.not_connected', 'Not Connected'),
        description: t('inbox.cannot_send_message', 'Cannot send message, not connected to server'),
        variant: "destructive"
      });
      return;
    }

    wsSend({
      type: 'sendMessage',
      message: {
        conversationId,
        content,
        isFromBot: isBot,
        activeChannelId: globalActiveChannelId // Include active channel for routing
      }
    });
  };

  const sendMediaMessage = async (conversationId: number, file: File, caption?: string): Promise<any> => {
    try {
      if (!isConnected) {
        toast({
          title: t('inbox.not_connected', 'Not Connected'),
          description: t('inbox.cannot_send_media', 'Cannot send media, not connected to server'),
          variant: "destructive"
        });
        throw new Error(t('inbox.not_connected_server', 'Not connected to server'));
      }

      const conversation = (conversations as any[]).find((conv: any) => conv.id === conversationId);
      if (!conversation) {
        throw new Error(t('inbox.conversation_not_found', 'Conversation not found'));
      }

      const response = await new Promise<{
        ok: boolean;
        status: number;
        statusText: string;
        json: () => Promise<any>;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const xhrFormData = new FormData();
        xhrFormData.append('file', file);
        if (caption) {
          xhrFormData.append('caption', caption);
        }

        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({
              ok: true,
              status: xhr.status,
              statusText: xhr.statusText,
              json: () => JSON.parse(xhr.responseText)
            });
          } else {
            resolve({
              ok: false,
              status: xhr.status,
              statusText: xhr.statusText,
              json: () => {
                try {
                  return JSON.parse(xhr.responseText);
                } catch (e) {
                  return { error: xhr.statusText };
                }
              }
            });
          }
        };

        xhr.onerror = function() {
          reject(new Error(t('inbox.network_error', 'Network error')));
        };

        xhr.upload.onprogress = function(event) {
          if (event.lengthComputable) {
          }
        };

        xhr.open('POST', `/api/conversations/${conversationId}/upload-media`, true);
        xhr.withCredentials = true;

        xhr.send(xhrFormData);
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.message || t('inbox.failed_send_media', 'Failed to send media message'));
        } catch (jsonError) {
          throw new Error(t('inbox.server_error', 'Server error ({{status}}): {{statusText}}', {
            status: response.status,
            statusText: response.statusText
          }));
        }
      }

      const messageData = await response.json();

      return messageData;
    } catch (err: any) {
      toast({
        title: t('common.error', 'Error'),
        description: err.message || t('inbox.failed_send_media', 'Failed to send media message'),
        variant: "destructive"
      });
      throw err;
    }
  };

  const contextValue: ConversationContextProps = {
    activeConversationId,
    setActiveConversationId,
    activeChannelId,
    setActiveChannelId,
    conversations: conversations as any[],
    groupConversations: groupConversations as any[],
    contacts: contacts as any[],
    messages,
    messagesPagination,
    conversationsPagination,
    groupConversationsPagination,
    isLoading: conversationsPagination.loading || groupConversationsPagination.loading || isLoadingContacts,
    isLoadingConversations: conversationsPagination.loading || isLoadingContacts,
    isLoadingGroupConversations: groupConversationsPagination.loading || isLoadingContacts,
    isWebSocketConnected: isConnected,
    showGroupChats,
    setShowGroupChats,
    updateGroupChatSetting,
    browserNotifications,
    setBrowserNotifications,
    updateBrowserNotificationSetting,
    agentSignatureEnabled,
    setAgentSignatureEnabled,
    updateAgentSignatureSetting,
    sendMessage,
    sendMediaMessage,
    loadMoreMessages,
    loadMoreConversations,
    loadMoreGroupConversations,
    replyToMessage,
    setReplyToMessage,
    refetchConversations,
    refetchContacts,
    refetchGroupConversations
  };

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      messageCache.cleanupCache().catch(console.error);
    }, 30 * 60 * 1000);

    messageCache.cleanupCache().catch(console.error);

    return () => clearInterval(cleanupInterval);
  }, [messageCache]);

  return (
    <ConversationContext.Provider value={contextValue}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversations() {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversations must be used within a ConversationProvider');
  }
  return context;
}
