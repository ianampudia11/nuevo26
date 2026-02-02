import { format, isToday, isYesterday } from 'date-fns';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { useQuery } from '@tanstack/react-query';
import AgentAssignment from '../conversations/AgentAssignment';
import { useState, useMemo, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { stripAgentSignature } from '@/utils/messageUtils';
import { stripFormatting } from '@/utils/textFormatter';
import BotIcon from '@/components/ui/bot-icon';
import useSocket from '@/hooks/useSocket';

interface GroupConversationItemProps {
  conversation: any;
  isActive: boolean;
  onClick: () => void;
}

export default function GroupConversationItem({
  conversation,
  isActive,
  onClick
}: GroupConversationItemProps) {
  const lastMessageTime = new Date(conversation.lastMessageAt);
  const [assignedUserId, setAssignedUserId] = useState(conversation.assignedToUserId);
  const [unreadCount, setUnreadCount] = useState(conversation.unreadCount || 0);
  const { t } = useTranslation();
  const { onMessage } = useSocket('/ws');

  const handleClick = () => {
    onClick();
  };

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


  useEffect(() => {
    const unsubscribe = onMessage('conversationAssigned', (data) => {
      if (data.data.conversationId === conversation.id) {
        setAssignedUserId(data.data.agentId);
      }
    });

    return unsubscribe;
  }, [onMessage, conversation.id]);

  useEffect(() => {
    const unsubscribe = onMessage('unreadCountUpdated', (data) => {
      if (data.data.conversationId === conversation.id) {
        setUnreadCount(data.data.unreadCount);
      }
    });

    return unsubscribe;
  }, [onMessage, conversation.id]);

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_unofficial':
        return 'ri-whatsapp-line text-green-600';
      case 'whatsapp_official':
        return 'ri-whatsapp-line text-green-600';
      case 'instagram':
        return 'ri-instagram-line text-pink-600';
      case 'messenger':
        return 'ri-messenger-line text-blue-600';
      case 'tiktok':
        return 'ri-tiktok-line text-black dark:text-white';
      case 'twilio_sms':
      case 'twilio_voice':
        return 'ri-message-3-line text-red-500 dark:text-white';
      case 'telegram':
        return 'ri-telegram-line text-blue-500';
      case 'email':
        return 'ri-mail-line text-muted-foreground';
      default:
        return 'ri-chat-3-line text-muted-foreground';
    }
  };

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
    } else if (message.groupParticipantName && !message.isFromBot) {

      const participantPrefix = `${message.groupParticipantName}: `;
      const availableLength = maxLength - participantPrefix.length;
      if (preview.length > availableLength) {
        preview = preview.substring(0, availableLength) + "...";
      }
      preview = participantPrefix + preview;
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
          : 'border-transparent hover:bg-gray-50'
      } cursor-pointer transition-colors duration-150`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${t('conversations.item.group_conversation_with', 'Group conversation')} ${
        conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')
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
              <GroupAvatar
                groupName={conversation.groupName || 'Group'}
                groupJid={conversation.groupJid}
                connectionId={conversation.channelId}
                conversationId={conversation.id}
                groupMetadata={conversation.groupMetadata}
                size="md"
                showRefreshButton={false}
              />
              
              {/* Channel indicator */}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-background rounded-full flex items-center justify-center shadow-sm">
                <i className={`${getChannelIcon(conversation.channelType)} text-xs`}></i>
              </div>
            </div>

            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')}
                </h3>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  {conversation.botDisabled && (
                    <div className="flex items-center">
                      <BotIcon className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-400 ml-1">
                        {t('conversations.item.bot_disabled', 'Bot disabled')}
                      </span>
                    </div>
                  )}
                  <span className="text-xs text-gray-500">{formattedTime}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center text-xs text-gray-500">
                  <i className="ri-group-line mr-1"></i>
                  <span>{conversation.groupParticipantCount || 0} {t('groups.participants', 'participants')}</span>
                </div>
                
                {unreadCount > 0 && (
                  <div className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 sm:mt-1">
          {isLoadingMessages ? (
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
              {formatMessagePreview(latestMessageData)}
            </p>
          )}
        </div>

        {/* Agent Assignment - Hidden for group conversations */}
        {!conversation.isGroup && (
          <div className="mt-2">
            <AgentAssignment
              conversationId={conversation.id}
              currentAssignedUserId={assignedUserId}
              onAssignmentChange={(userId) => setAssignedUserId(userId)}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}
