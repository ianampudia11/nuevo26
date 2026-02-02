import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChannelConnection } from '@shared/schema';
import AgentAssignment from './AgentAssignment';
import { useState, useMemo, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { stripAgentSignature } from '@/utils/messageUtils';
import { stripFormatting } from '@/utils/textFormatter';
import BotIcon from '@/components/ui/bot-icon';
import useSocket from '@/hooks/useSocket';
import { TwilioIcon } from '@/components/icons/TwilioIcon';

interface ConversationItemProps {
  conversation: any;
  isActive: boolean;
  onClick: () => void;
  searchQuery?: string;
}

export default function ConversationItem({ conversation, isActive, onClick, searchQuery }: ConversationItemProps) {
  const { contact } = conversation;
  const lastMessageTime = new Date(conversation.lastMessageAt);
  const [assignedUserId, setAssignedUserId] = useState(conversation.assignedToUserId);
  const [unreadCount, setUnreadCount] = useState(conversation.unreadCount || 0);
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { onMessage } = useSocket('/ws');

  const handleClick = () => {
    onClick();
  };

  const { data: connections } = useQuery<ChannelConnection[]>({
    queryKey: ['/api/channel-connections'],
  });

  const { data: latestMessageData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['/api/conversations', conversation.id, 'latest-message'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/conversations/${conversation.id}/messages?limit=1`);
      const data = await response.json();
      return data.messages?.[0] || null;
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const getChannelInfo = (channelType: string) => {
    switch(channelType) {
      case 'whatsapp':
      case 'whatsapp_unofficial':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.item.channel.whatsapp', 'WhatsApp') };
      case 'whatsapp_official':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.item.channel.whatsapp_business', 'WhatsApp Business') };
      case 'facebook':
      case 'messenger':
        return { icon: 'ri-messenger-line', color: '#1877F2', name: t('conversations.item.channel.messenger', 'Messenger') };
      case 'instagram':
        return { icon: 'ri-instagram-line', color: '#E4405F', name: t('conversations.item.channel.instagram', 'Instagram') };
      case 'tiktok':
        return { icon: 'ri-tiktok-line dark:text-white', color: '#000000', name: t('conversations.item.channel.tiktok', 'TikTok Business') };
      case 'email':
        return { icon: 'ri-mail-line', color: '#333235', name: t('conversations.item.channel.email', 'Email') };
      case 'sms':
        return { icon: 'ri-message-2-line', color: '#10B981', name: t('conversations.item.channel.sms', 'SMS') };
      case 'twilio_sms':
      case 'twilio_voice':
        return { icon: TwilioIcon, isComponent: true, color: '#F22F46', name: t('conversations.item.channel.twilio', 'Twilio') };
      case 'webapp':
        return { icon: 'ri-global-line', color: '#8B5CF6', name: t('conversations.item.channel.web_chat', 'Web Chat') };
      case 'webchat':
        return { icon: 'ri-message-3-line', color: '#6366f1', name: t('conversations.item.channel.webchat', 'WebChat') };
      case 'telegram':
        return { icon: 'ri-telegram-line', color: '#0088CC', name: t('conversations.item.channel.telegram', 'Telegram') };
      default:
        return { icon: 'ri-message-3-line', color: '#333235', name: t('conversations.item.channel.chat', 'Chat') };
    }
  };

  const channelInfo = getChannelInfo(conversation.channelType);

  useEffect(() => {
    const unsubscribe = onMessage('unreadCountUpdated', (data) => {
      if (data.data.conversationId === conversation.id) {
        setUnreadCount(data.data.unreadCount);
      }
    });

    return unsubscribe;
  }, [onMessage, conversation.id]);

  useEffect(() => {
    setUnreadCount(conversation.unreadCount || 0);
  }, [conversation.unreadCount]);

  const formattedTime = useMemo(() => {
    const messageTime = latestMessageData?.createdAt
      ? new Date(latestMessageData.createdAt)
      : lastMessageTime;

    if (isToday(messageTime)) {
      return format(messageTime, 'HH:mm');
    } else if (isYesterday(messageTime)) {
      return t('conversations.item.yesterday', 'Yesterday');
    } else {
      return format(messageTime, 'MMM dd');
    }
  }, [latestMessageData, lastMessageTime, t]);

  const formatMessagePreview = (message: any) => {
    if (!message) return t('conversations.item.no_messages_yet', 'No messages yet');

    const maxLength = 50;
    let preview = "";
    const isOutbound = message.direction === 'outbound';

    switch (message.type) {
      case 'image':
        preview = message.isFromBot ? t('conversations.item.sent_image', '📷 Sent an image') : t('conversations.item.image', '📷 Image');
        break;
      case 'video':
        preview = message.isFromBot ? t('conversations.item.sent_video', '🎥 Sent a video') : t('conversations.item.video', '🎥 Video');
        break;
      case 'audio':
        preview = message.isFromBot ? t('conversations.item.sent_audio', '🎵 Sent an audio') : t('conversations.item.audio', '🎵 Audio');
        break;
      case 'document':
        preview = message.isFromBot ? t('conversations.item.sent_document', '📄 Sent a document') : t('conversations.item.document', '📄 Document');
        break;
      case 'poll':
        preview = isOutbound
          ? t('conversations.item.sent_poll', '📊 Sent a poll')
          : t('conversations.item.poll', '📊 Poll');
        break;
      case 'poll_vote':

        if (message.content && message.content.startsWith('poll_vote_selected:')) {
          const indexMatch = message.content.match(/poll_vote_selected:(\d+)/);
          const selectedIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;
          preview = isOutbound
            ? t('conversations.item.voted_poll', '✅ You voted')
            : t('conversations.item.vote_received', '✅ Voted');
        } else {
          preview = isOutbound
            ? t('conversations.item.voted_poll', '✅ You voted')
            : t('conversations.item.vote_received', '✅ Voted');
        }
        break;
      case 'text':
      default:
        const cleanContent = stripAgentSignature(message.content || "");
        preview = stripFormatting(cleanContent);
        break;
    }


    if (isOutbound && !message.isFromBot) {
      const mePrefix = t('conversations.item.me_prefix', 'Me') + ': ';
      const availableLength = maxLength - mePrefix.length;
      if (preview.length > availableLength) {
        preview = preview.substring(0, availableLength) + "...";
      }
      preview = mePrefix + preview;
    } else if (preview.length > maxLength) {
      preview = preview.substring(0, maxLength) + "...";
    }

    return preview;
  };

  return (
    <div
      className={`border-l-4 min-h-[88px] sm:min-h-[80px] ${
        isActive
          ? 'border-primary-500 bg-primary-50 hover:bg-primary-100'
          : 'border-transparent hover:bg-accent/50'
      } cursor-pointer transition-colors duration-150`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${t('conversations.item.conversation_with', 'Conversation with')} ${
        conversation.isGroup
          ? (conversation.groupName || t('groups.unnamed_group', 'Unnamed Group'))
          : contact?.name
      }${unreadCount > 0 ? `, ${unreadCount} ${t('conversations.item.unread_messages', 'unread messages')}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              {conversation.isGroup ? (
                <GroupAvatar
                  groupName={conversation.groupName || 'Group'}
                  groupJid={conversation.groupJid}
                  connectionId={conversation.channelId}
                  conversationId={conversation.id}
                  groupMetadata={conversation.groupMetadata}
                  size="md"
                  showRefreshButton={false}
                />
              ) : contact ? (
                <ContactAvatar
                  contact={contact}
                  connectionId={conversation.channelId}
                  showRefreshButton={false}
                  size="md"
                />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted"></div>
              )}
              {!conversation.isGroup && (
                <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full ${contact?.isActive ? 'bg-green-500' : 'bg-muted'} border-2 border-background`}></span>
              )}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm sm:text-base truncate pr-2">
                  {conversation.isGroup
                    ? (conversation.groupName || t('groups.unnamed_group', 'Unnamed Group'))
                    : contact?.name
                  }
                </p>
                {unreadCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-destructive-foreground bg-destructive rounded-full min-w-[20px] h-5 flex-shrink-0"
                    aria-label={`${unreadCount} ${t('conversations.item.unread_messages', 'unread messages')}`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <span className="flex items-center">
                  {channelInfo.isComponent ? (
                    <channelInfo.icon className="w-3 h-3 mr-1" />
                  ) : (
                    <i className={channelInfo.icon + " mr-1"} style={typeof channelInfo.icon === 'string' && channelInfo.icon.includes('tiktok') ? undefined : { color: channelInfo.color }}></i>
                  )}
                  <span className="truncate">{channelInfo.name}</span>
                </span>
                {conversation.isGroup && (
                  <>
                    <span className="mx-2">•</span>
                    <span className="truncate">
                      {conversation.groupParticipantCount || 0} {t('groups.participants', 'participants')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground ml-2 flex-shrink-0">{formattedTime}</div>
        </div>

        <div className="mt-2 sm:mt-1">
          {isLoadingMessages ? (
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {formatMessagePreview(latestMessageData)}
            </p>
          )}
        </div>

        {contact?.tags && contact.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.slice(0, 5).map((tag: string, idx: number) => {
              const isHighlighted = searchQuery &&
                searchQuery.trim().length > 0 &&
                tag.toLowerCase().includes(searchQuery.toLowerCase().trim());

              return (
                <span
                  key={idx}
                  className={`px-2 py-1 text-xs rounded-full truncate max-w-[80px] ${
                    isHighlighted
                      ? 'bg-yellow-200 text-yellow-900 ring-2 ring-yellow-400'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {tag}
                </span>
              );
            })}

          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {conversation.status === 'open' && !assignedUserId && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                {t('conversations.item.new_lead', 'New Lead')}
              </span>
            )}

            {conversation.status === 'bot_active' && (
              <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 whitespace-nowrap">
                <BotIcon className="mr-1" size={12} color="#7c3aed" />
                <span className="hidden sm:inline">{t('conversations.item.bot_active', 'Bot active')}</span>
                <span className="sm:hidden">{t('conversations.item.bot', 'Bot')}</span>
              </span>
            )}

            {conversation.botDisabled && (
              <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground whitespace-nowrap">
                <BotIcon className="mr-1 opacity-50" size={12} color="#6b7280" />
                <span className="hidden sm:inline">{t('conversations.item.bot_disabled', 'Bot disabled')}</span>
                <span className="sm:hidden">{t('conversations.item.bot_off', 'Bot off')}</span>
              </span>
            )}

            {conversation.status === 'awaiting_reply' && (
              <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">
                <i className="ri-time-line mr-1"></i>
                <span className="hidden sm:inline">{t('conversations.item.awaiting_reply', 'Awaiting reply')}</span>
                <span className="sm:hidden">{t('conversations.item.waiting', 'Waiting')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <AgentAssignment
              conversationId={conversation.id}
              currentAssignedUserId={assignedUserId}
              onAssignmentChange={setAssignedUserId}
              variant="badge"
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
