import { useState, useEffect, useCallback, useRef } from 'react';
import { useConversations } from '@/context/ConversationContext';
import { useTranslation } from '@/hooks/use-translation';
import ConversationItem from './ConversationItem';
import NewConversationModal from './NewConversationModal';

import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { useMobileLayout } from '@/contexts/mobile-layout-context';
import { Loader2 } from 'lucide-react';
import { ContactsWithoutConversations } from '@/components/contacts/ContactsWithoutConversations';
import { ChannelSelector } from '@/components/inbox/ChannelSelector';
import { useActiveChannel } from '@/contexts/ActiveChannelContext';

export default function ConversationList() {
  const {
    conversations,
    isLoadingConversations,
    activeConversationId,
    setActiveConversationId,
    conversationsPagination,
    loadMoreConversations
  } = useConversations();
  const { t } = useTranslation();
  const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'assigned' | 'assigned_to_me'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewConversationModalOpen, setIsNewConversationModalOpen] = useState(false);

  const { user } = useAuth();
  const { canViewAllConversations, canOnlyViewAssignedConversations } = usePermissions();
  const { isMobile, toggleConversationList, setConversationListOpen } = useMobileLayout();
  const { activeChannelId, setActiveChannelId } = useActiveChannel();


  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTimeRef = useRef<number>(0);



  useEffect(() => {
    if (canOnlyViewAssignedConversations() && !user?.isSuperAdmin) {
      setFilterStatus('assigned_to_me');
    }
  }, [canOnlyViewAssignedConversations, user?.isSuperAdmin]);


  const handleScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScrollTimeRef.current < 100) return; // Throttle to 100ms
    lastScrollTimeRef.current = now;

    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50; // Reduced threshold for better detection

    if (isNearBottom && conversationsPagination.hasMore && !conversationsPagination.loading) {
      loadMoreConversations();
    }
  }, [conversationsPagination.hasMore, conversationsPagination.loading, conversationsPagination.page, conversationsPagination.total, loadMoreConversations]);


  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const handleConversationCreated = (conversation: any) => {
    if (conversation && conversation.id) {
      setActiveConversationId(conversation.id);
      if (isMobile) {
        setConversationListOpen(false);
      }
    }
  };

  const handleConversationClick = (conversationId: number) => {
    setActiveConversationId(conversationId);
    if (isMobile) {
      setConversationListOpen(false);
    }
  };

  if (isLoadingConversations) {
    return (
      <div className={`
        ${isMobile ? 'w-full' : 'w-72 lg:w-80'}
        border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}>
        <div className="p-3 sm:p-4 border-b border-border">
          <h2 className="text-lg font-medium">{t('inbox.conversations', 'Conversations')}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col w-full p-3 sm:p-4 space-y-3">
            <div className="h-10 sm:h-12 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-muted rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }



  const filteredConversations = conversations
    .filter(conversation => {

      if (activeChannelId !== null) {
        return conversation.channelId === activeChannelId;
      }
      return true;
    })
    .filter(conversation => {


      if (filterStatus === 'all') return true;
      if (filterStatus === 'assigned') return conversation.assignedToUserId !== null;
      if (filterStatus === 'unassigned') return conversation.assignedToUserId === null;
      if (filterStatus === 'assigned_to_me') return true; // Server-side filtered
      return true;
    })
    .filter(conversation => {

      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase().trim();
      const contact = conversation.contact;

      if (!contact) return false;

      if (contact.name?.toLowerCase().includes(query)) {
        return true;
      }

      if (contact.phone?.toLowerCase().includes(query)) {
        return true;
      }

      if (contact.email?.toLowerCase().includes(query)) {
        return true;
      }

      if (contact.tags && Array.isArray(contact.tags)) {
        return contact.tags.some((tag: string) =>
          tag.toLowerCase().includes(query)
        );
      }

      return false;
    });

  return (
    <div
      className={`
        ${isMobile ? 'w-full' : 'w-72 lg:w-80'}
        border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 sm:p-4 border-b border-border flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={toggleConversationList}
                className="p-2 rounded-md hover:bg-accent lg:hidden"
                aria-label={t('inbox.close_conversations', 'Close conversations')}
              >
                <i className="ri-close-line text-lg text-muted-foreground"></i>
              </button>
            )}
          </div>

          {/* Channel Selector */}
          <div className="mt-2">
            <ChannelSelector
              activeChannelId={activeChannelId || undefined}
              onChannelChange={setActiveChannelId}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex space-x-2 ml-2">
          <button
            className="p-2 sm:p-1.5 rounded-md bg-primary-50 text-primary-600 hover:bg-primary-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setIsNewConversationModalOpen(true)}
            title={t('inbox.start_new_conversation', 'Start new conversation')}
          >
            <i className="ri-user-add-line text-lg sm:text-base"></i>
          </button>
        </div>
      </div>

      <div className="p-3 sm:p-4 border-b border-border flex items-center bg-muted/50">
        <div className="relative flex-1">
          <input
            type="search"
            placeholder={t('inbox.search_conversations_enhanced', 'Search by name, tag, phone, email...')}
            className="w-full pl-9 pr-4 py-3 sm:py-2 rounded-lg border border-input bg-background text-base sm:text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <i className="ri-search-line absolute left-3 top-3.5 sm:top-2.5 text-muted-foreground"></i>
        </div>
      </div>

      <div className="flex px-3 sm:px-4 py-2 border-b border-border space-x-1 overflow-x-auto scrollbar-hide">
        {(canViewAllConversations() || user?.isSuperAdmin) && (
          <button
            className={`px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
              filterStatus === 'all'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-background border border-input text-foreground hover:bg-accent'
            }`}
            onClick={() => setFilterStatus('all')}
          >
            {t('inbox.filter.all', 'All')}
          </button>
        )}

        {(canViewAllConversations() || user?.isSuperAdmin) && (
          <button
            className={`px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
              filterStatus === 'unassigned'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-background border border-input text-foreground hover:bg-accent'
            }`}
            onClick={() => setFilterStatus('unassigned')}
          >
            {t('inbox.filter.unassigned', 'Unassigned')}
          </button>
        )}

        <button
          className={`px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
            filterStatus === 'assigned_to_me'
              ? 'bg-primary-100 text-primary-700'
              : 'bg-background border border-input text-foreground hover:bg-accent'
          }`}
          onClick={() => setFilterStatus('assigned_to_me')}
        >
          {t('inbox.filter.my_chats', 'My Chats')}
        </button>

        {(canViewAllConversations() || user?.isSuperAdmin) && (
          <button
            className={`px-3 sm:px-4 py-2 sm:py-1 rounded-full text-sm font-medium whitespace-nowrap min-h-[23px] sm:min-h-auto flex items-center ${
              filterStatus === 'assigned'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-background border border-input text-foreground hover:bg-accent'
            }`}
            onClick={() => setFilterStatus('assigned')}
          >
            {t('inbox.filter.assigned', 'Assigned')}
          </button>
        )}
      </div>

      {/* Contacts without conversations section */}
      <ContactsWithoutConversations
        onConversationCreated={(conversationId) => {

          setActiveConversationId(conversationId);
        }}
      />

      <div
        ref={scrollContainerRef}
        className="overflow-y-auto flex-1 scrollbar-hide"
        data-conversation-list
        style={{
          maxHeight: 'calc(100vh - 300px)',
          minHeight: '200px' // Ensure minimum height for scroll detection
        }}
      >
        {filteredConversations.length === 0 && !isLoadingConversations ? (
          <div className="p-4 sm:p-6 text-center text-muted-foreground">
            <div className="text-sm sm:text-base">
              {t('inbox.no_conversations_found', 'No conversations found')}
            </div>
          </div>
        ) : (
          <>
            {filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => handleConversationClick(conversation.id)}
                searchQuery={searchQuery}
              />
            ))}

            {/* Loading indicator for infinite scroll */}
            {conversationsPagination.loading && (
              <div className="flex items-center justify-center p-6 border-t border-border">
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                  <span className="text-sm text-muted-foreground font-medium">
                    {t('inbox.loading_more_conversations', 'Loading more conversations...')}
                  </span>
                </div>
              </div>
            )}

            {/* Manual load more button as fallback */}
            {!conversationsPagination.loading && conversationsPagination.hasMore && filteredConversations.length > 0 && (
              <div className="p-4 border-t border-border">
                <button
                  onClick={loadMoreConversations}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg border border-border hover:border-input hover:shadow-sm transition-all duration-200 group active:scale-[0.98]"
                >
                  <i className="ri-arrow-down-line text-base group-hover:translate-y-0.5 transition-transform duration-200"></i>
                  {t('inbox.load_more_conversations', 'Load More Conversations')}
                  <span className="text-xs text-muted-foreground ml-1 bg-muted px-2 py-0.5 rounded-full group-hover:bg-muted/80 transition-colors duration-200">
                    {conversationsPagination.total - filteredConversations.length} more
                  </span>
                </button>
              </div>
            )}

            {/* End of list indicator */}
            {!conversationsPagination.hasMore && filteredConversations.length > 0 && (
              <div className="p-4 border-t border-border">
                <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                  <i className="ri-check-line text-base"></i>
                  <span>{t('inbox.all_conversations_loaded', 'All conversations loaded')}</span>
                  <span className="text-xs">({filteredConversations.length} total)</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <NewConversationModal
        isOpen={isNewConversationModalOpen}
        onClose={() => setIsNewConversationModalOpen(false)}
        onConversationCreated={handleConversationCreated}
      />
    </div>
  );
}

