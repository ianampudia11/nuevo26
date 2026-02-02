import { useState, useEffect, useCallback, useRef } from 'react';
import { useConversations } from '@/context/ConversationContext';
import { useTranslation } from '@/hooks/use-translation';
import GroupConversationItem from '@/components/groups/GroupConversationItem';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { useMobileLayout } from '@/contexts/mobile-layout-context';
import { Loader2 } from 'lucide-react';

export default function GroupConversationList() {
  const {
    groupConversations,
    isLoadingGroupConversations,
    activeConversationId,
    setActiveConversationId,
    activeChannelId,
    setActiveChannelId,
    showGroupChats,
    groupConversationsPagination,
    loadMoreGroupConversations
  } = useConversations();

  const { t } = useTranslation();
  const [filterStatus, setFilterStatus] = useState<'all' | 'unassigned' | 'assigned' | 'assigned_to_me'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { user } = useAuth();
  const { canViewAllConversations, canOnlyViewAssignedConversations } = usePermissions();
  const { isMobile, toggleConversationList, setConversationListOpen } = useMobileLayout();


  const scrollContainerRef = useRef<HTMLDivElement>(null);

  type CurrentUser = { id: number; [key: string]: any };
  const currentUser = user as CurrentUser;

  const handleConversationClick = (conversationId: number) => {
    setActiveConversationId(conversationId);
    if (isMobile) {
      setConversationListOpen(false);
    }
  };


  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 100px threshold

    if (isNearBottom && groupConversationsPagination.hasMore && !groupConversationsPagination.loading) {
      loadMoreGroupConversations();
    }
  }, [groupConversationsPagination.hasMore, groupConversationsPagination.loading, groupConversationsPagination.page, loadMoreGroupConversations]);


  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);


  if (!showGroupChats) {
    return null;
  }

  if (isLoadingGroupConversations) {
    return (
      <div className={`
        ${isMobile ? 'w-full' : 'w-72 lg:w-80'}
        border-r border-border bg-background flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}>
        <div className="p-3 sm:p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium">{t('inbox.group_conversations', 'Group Conversations')}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col w-full p-3 sm:p-4 space-y-3">
            <div className="h-10 sm:h-12 bg-gray-200 rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-gray-200 rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-gray-200 rounded w-full"></div>
            <div className="h-16 sm:h-20 bg-gray-200 rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  const filteredConversations = groupConversations
    .filter(conversation => {
      if (activeChannelId !== null) {
        return conversation.channelId === activeChannelId;
      }
      return true;
    })
    .filter(conversation => {
      if (canOnlyViewAssignedConversations() && !user?.isSuperAdmin) {
        if (conversation.assignedToUserId !== currentUser?.id) {
          return false;
        }
      }

      if (filterStatus === 'all') return true;
      if (filterStatus === 'assigned') return conversation.assignedToUserId !== null;
      if (filterStatus === 'unassigned') return conversation.assignedToUserId === null;
      if (filterStatus === 'assigned_to_me') return conversation.assignedToUserId === currentUser?.id;
      return true;
    })
    .filter(conversation => {
      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase().trim();


      if (conversation.groupName?.toLowerCase().includes(query)) {
        return true;
      }


      if (conversation.groupDescription?.toLowerCase().includes(query)) {
        return true;
      }

      return false;
    })
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return (
    <div
      className={`
        ${isMobile ? 'w-full' : 'w-72 lg:w-80'}
        border-r border-border bg-background flex-shrink-0 overflow-hidden flex flex-col
        ${isMobile ? 'h-full' : ''}
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-3 sm:p-4 border-b border-gray-200 flex justify-between items-center">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isMobile && (
              <button
                onClick={toggleConversationList}
                className="p-2 rounded-md hover:bg-gray-100 lg:hidden"
                aria-label={t('inbox.close_conversations', 'Close conversations')}
              >
                <i className="ri-close-line text-lg text-gray-600"></i>
              </button>
            )}
            <h2 className="text-lg font-medium text-gray-900 truncate">
              {t('inbox.group_conversations', 'Group Conversations')}
            </h2>
            {/* Debug info - remove in production */}
            <div className="text-xs text-gray-400 mt-1">
              Page {groupConversationsPagination.page} • {filteredConversations.length} of {groupConversationsPagination.total}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="p-3 sm:p-4 border-b border-gray-200 space-y-3">
        <div className="relative">
          <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            placeholder={t('inbox.search_groups', 'Search groups...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('inbox.filter.all', 'All')}
          </button>
          <button
            onClick={() => setFilterStatus('unassigned')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              filterStatus === 'unassigned'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('inbox.filter.unassigned', 'Unassigned')}
          </button>
          <button
            onClick={() => setFilterStatus('assigned')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
              filterStatus === 'assigned'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t('inbox.filter.assigned', 'Assigned')}
          </button>
          {canViewAllConversations() && (
            <button
              onClick={() => setFilterStatus('assigned_to_me')}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                filterStatus === 'assigned_to_me'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('inbox.filter.assigned_to_me', 'Mine')}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="overflow-y-auto flex-1 scrollbar-hide"
        data-group-conversation-list
        style={{ maxHeight: 'calc(100vh - 300px)' }} // Ensure proper height constraints
      >
        {filteredConversations.length === 0 && !isLoadingGroupConversations ? (
          <div className="p-4 sm:p-6 text-center text-gray-500">
            <div className="text-sm sm:text-base">
              {t('inbox.no_group_conversations_found', 'No group conversations found')}
            </div>
          </div>
        ) : (
          <>
            {filteredConversations.map(conversation => (
              <GroupConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onClick={() => handleConversationClick(conversation.id)}
              />
            ))}

            {/* Loading indicator for infinite scroll */}
            {groupConversationsPagination.loading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-500">
                  {t('inbox.loading_more_group_conversations', 'Loading more group conversations...')}
                </span>
              </div>
            )}

            {/* End of list indicator */}
            {!groupConversationsPagination.hasMore && filteredConversations.length > 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">
                {t('inbox.all_group_conversations_loaded', 'All group conversations loaded')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
