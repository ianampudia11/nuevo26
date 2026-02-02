import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Contact } from '@shared/schema';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Search,
  Users,
  Loader2,
  Plus,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface ContactsWithoutConversationsProps {
  onConversationCreated?: (conversationId: number) => void;
}

interface ContactsResponse {
  contacts: Contact[];
  total: number;
  requestId?: string;
  responseTime?: number;
}

export function ContactsWithoutConversations({ onConversationCreated }: ContactsWithoutConversationsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);


  const fetchContacts = useCallback(async ({ signal }: { signal?: AbortSignal } = {}) => {
    try {

      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }


      const controller = new AbortController();
      abortControllerRef.current = controller;

      const params = new URLSearchParams();
      if (debouncedSearchQuery?.trim()) {
        params.append('search', debouncedSearchQuery.trim());
      }
      params.append('limit', '20');

      const response = await fetch(`/api/contacts/without-conversations?${params}`, {
        signal: signal || controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Failed to fetch contacts'}`);
      }

      const data = await response.json();


      setRetryCount(0);

      return data;
    } catch (error: any) {

      if (error.name === 'AbortError') {
        throw error;
      }

      throw error;
    }
  }, [debouncedSearchQuery, retryCount]);

  const { data: contactsData, isLoading, error, refetch } = useQuery<ContactsResponse>({
    queryKey: ['/api/contacts/without-conversations', debouncedSearchQuery],
    queryFn: fetchContacts,
    enabled: isExpanded,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {

      if (error.name === 'AbortError') return false;

      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });


  useEffect(() => {
    if (error && error.name !== 'AbortError') {
      toast({
        title: t('contacts.search_error', 'Search Error'),
        description: t('contacts.search_error_desc', 'Failed to search contacts. Please try again.'),
        variant: 'destructive',
      });
    }
  }, [error, toast, t]);


  const createConversationMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await fetch(`/api/contacts/${contactId}/create-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create conversation');
      }
      
      return response.json();
    },
    onSuccess: (conversation) => {
      toast({
        title: t('contacts.conversation_created', 'Conversation Created'),
        description: t('contacts.conversation_created_desc', 'You can now start messaging this contact.'),
      });
      

      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/without-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      

      if (onConversationCreated) {
        onConversationCreated(conversation.id);
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.conversation_creation_failed', 'Failed to Create Conversation'),
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleCreateConversation = (contact: Contact) => {
    createConversationMutation.mutate(contact.id);
  };

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    refetch();
  }, [refetch]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);

    if (error) {
      setRetryCount(0);
    }
  }, [error]);


  useEffect(() => {
    return () => {
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current.abort();
      }
    };
  }, []);


  useEffect(() => {
    if (!isExpanded && searchQuery) {
      setSearchQuery('');
    }
  }, [isExpanded, searchQuery]);

  const truncateName = (name: string, maxLength: number = 14) => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

  const getChannelTypeDisplay = (identifierType?: string) => {
    switch (identifierType) {
      case 'whatsapp_official':
        return { label: 'WhatsApp Official', color: 'bg-green-100 text-green-800' };
      case 'whatsapp_unofficial':
        return { label: 'WhatsApp', color: 'bg-green-100 text-green-800' };
      case 'messenger':
        return { label: 'Messenger', color: 'bg-blue-100 text-blue-800' };
      case 'instagram':
        return { label: 'Instagram', color: 'bg-pink-100 text-pink-800' };
      case 'telegram':
        return { label: 'Telegram', color: 'bg-sky-100 text-sky-800' };
      default:
        return { label: identifierType || 'Unknown', color: 'bg-muted text-muted-foreground' };
    }
  };

  const contacts = contactsData?.contacts || [];
  const totalContacts = contactsData?.total || 0;

  if (!isExpanded) {
    return (
      <div className="border-b border-border bg-card">
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t('contacts.start_new_conversations', 'Start New Conversations')}
            </span>
            {totalContacts > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalContacts}
              </Badge>
            )}
          </div>
          <Plus className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-border bg-card">
      <div className="p-3 sm:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t('contacts.start_new_conversations', 'Start New Conversations')}
            </span>
            {totalContacts > 0 && (
              <Badge variant="secondary" className="text-xs">
                {totalContacts}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 rounded hover:bg-accent"
          >
            <Plus className="h-4 w-4 text-muted-foreground rotate-45" />
          </button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('contacts.search_contacts', 'Search contacts...')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`pl-10 pr-8 text-sm ${error ? 'border-red-300 focus:border-red-500' : ''}`}
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4 rotate-45" />
            </button>
          )}
        </div>

        {/* Error state with retry option */}
        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">
                {t('contacts.search_failed', 'Search failed. Please try again.')}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                className="h-6 px-2 text-xs border-red-300 text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="max-h-64 overflow-y-auto">
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 bg-muted rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                  <div className="w-16 h-6 bg-muted rounded"></div>
                </div>
              ))}
            </div>
          ) : contacts.length === 0 && !error ? (
            <div className="p-4 text-center text-muted-foreground">
              <div className="text-sm">
                {debouncedSearchQuery
                  ? t('contacts.no_contacts_found', 'No contacts found')
                  : t('contacts.all_contacts_have_conversations', 'All contacts already have conversations')
                }
              </div>
              {debouncedSearchQuery && (
                <div className="text-xs mt-1 text-muted-foreground">
                  {t('contacts.try_different_search', 'Try a different search term')}
                </div>
              )}
            </div>
          ) : (
            <div className="p-2">
              {contacts.map((contact: Contact) => {
                const channelInfo = getChannelTypeDisplay(contact.identifierType || undefined);
                const isCreating = createConversationMutation.isPending;

                return (
                  <div
                    key={contact.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <ContactAvatar
                      contact={contact}
                      size="sm"
                      showRefreshButton={false}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {truncateName(contact.name)}
                        </p>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${channelInfo.color}`}
                        >
                          {channelInfo.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.phone || contact.email}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCreateConversation(contact)}
                      disabled={isCreating}
                      className="flex-shrink-0"
                    >
                      {isCreating ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <i className="ri-whatsapp-line text-sm"></i>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
