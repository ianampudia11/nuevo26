import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Calendar,
  Hash,
  Crown,
  Shield,
  Phone,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  MessageCircle,
  Loader2,
  Trash2
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { GroupAvatar } from "./GroupAvatar";
import { GroupParticipantAvatar } from "./GroupParticipantAvatar";
import { ClearChatHistoryDialog } from "@/components/conversations/ClearChatHistoryDialog";
import { useTranslation } from "@/hooks/use-translation";
import { useMobileLayout } from "@/contexts/mobile-layout-context";
import { useParticipantProfilePictures } from "@/hooks/use-participant-profile-pictures";
import { useConversations } from "@/context/ConversationContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface GroupParticipant {
  id: string;
  name?: string;
  phone?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  avatarUrl?: string | null;
  displayName?: string;
  contactId?: number;
}

interface ContactsResponse {
  contacts: Array<{
    id: number;
    name: string;
    identifier: string;
    identifierType: string;
  }>;
}

interface GroupInfoPanelProps {
  conversation: {
    id: number;
    groupName?: string;
    groupDescription?: string;
    groupJid?: string;
    groupParticipantCount?: number;
    groupCreatedAt?: string;
    groupMetadata?: any;
    channelId?: number;
  };
  className?: string;
}

export function GroupInfoPanel({ conversation, className }: GroupInfoPanelProps) {
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState<string | null>(null);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const { t } = useTranslation();
  const { isMobile, toggleContactDetails } = useMobileLayout();
  const { setActiveConversationId } = useConversations();
  const { toast } = useToast();


  const formatPhoneNumber = (phone: string) => {

    if (phone.length > 10) {
      return `+${phone.slice(0, -10)} ${phone.slice(-10, -7)} ${phone.slice(-7, -4)} ${phone.slice(-4)}`;
    }
    return phone;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('common.unknown', 'Unknown');
    return new Date(dateString).toLocaleDateString();
  };


  const participants: GroupParticipant[] = conversation.groupMetadata?.participants?.map((p: any) => ({
    id: p.id,
    name: p.notify || null, // WhatsApp display name
    phone: p.id.split('@')[0],
    isAdmin: p.admin === 'admin',
    isSuperAdmin: p.admin === 'superadmin',
    avatarUrl: null
  })) || [];


  const { data: contactsData } = useQuery<ContactsResponse>({
    queryKey: ['/api/contacts'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });


  const enhancedParticipants = participants.map(participant => {

    const matchingContact = contactsData?.contacts?.find((contact: any) =>
      contact.identifier === participant.phone && contact.identifierType === 'whatsapp'
    );





    let displayName = participant.name; // WhatsApp display name
    if (!displayName && matchingContact) {
      displayName = matchingContact.name;
    }
    if (!displayName) {
      displayName = formatPhoneNumber(participant.phone || '');
    }

    return {
      ...participant,
      displayName,
      contactId: matchingContact?.id
    };
  });


  const participantJids = enhancedParticipants.map(p => p.id);


  const {
    participantPictures,
    isLoading: isLoadingPictures,
    refreshParticipantPictures
  } = useParticipantProfilePictures({
    connectionId: conversation.channelId,
    participantJids,
    enabled: participantJids.length > 0 && !!conversation.channelId
  });


  const participantsWithPictures = enhancedParticipants.map(participant => ({
    ...participant,
    avatarUrl: participantPictures[participant.id] || null
  }));
  
  const displayedParticipants = showAllParticipants ? participantsWithPictures : participantsWithPictures.slice(0, 5);
  const hasMoreParticipants = participantsWithPictures.length > 5;

  const handleRefreshParticipantPictures = () => {
    refreshParticipantPictures();
  };


  const createConversationMutation = useMutation({
    mutationFn: async (participant: GroupParticipant) => {
      const response = await apiRequest('POST', '/api/conversations/whatsapp/initiate', {
        name: participant.displayName || participant.phone,
        phoneNumber: participant.phone,
        channelConnectionId: conversation.channelId
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('groups.create_conversation_failed', 'Failed to create conversation'));
      }

      return response.json();
    },
    onSuccess: (data, participant) => {
      setCreatingConversation(null);
      if (data.conversation?.id) {
        setActiveConversationId(data.conversation.id);
        if (isMobile) {
          toggleContactDetails(); // Close group info panel on mobile
        }
        toast({
          title: t('groups.private_message_started', 'Private conversation started'),
          description: t('groups.private_message_with', 'Started private conversation with {{name}}', {
            name: participant.displayName || participant.phone
          }),
        });
      }
    },
    onError: (error: Error, participant) => {
      setCreatingConversation(null);
      toast({
        title: t('groups.private_message_failed', 'Failed to start conversation'),
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleParticipantClick = async (participant: GroupParticipant) => {
    if (creatingConversation === participant.id) return;

    setCreatingConversation(participant.id);
    createConversationMutation.mutate(participant);
  };
  

  
  return (
    <div className={cn("h-full bg-card", className)} onClick={(e) => e.stopPropagation()}>
      {/* Mobile header */}
      <div className="p-4 border-b border-border flex justify-between items-center lg:hidden">
        <h2 className="font-medium text-lg">{t('groups.group_info', 'Group Info')}</h2>
        <button
          onClick={toggleContactDetails}
          className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={t('groups.close_group_info', 'Close group info')}
        >
          <i className="ri-close-line text-lg text-muted-foreground"></i>
        </button>
      </div>

      {/* Group header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <GroupAvatar
            groupName={conversation.groupName || 'Group'}
            groupJid={conversation.groupJid}
            connectionId={conversation.channelId}
            conversationId={conversation.id}
            groupMetadata={conversation.groupMetadata}
            size="lg"
            showRefreshButton={true}
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold truncate">
              {conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')}
            </h3>
            <div className="flex items-center text-sm text-muted-foreground mt-1">
              <Users className="h-4 w-4 mr-1" />
              {conversation.groupParticipantCount || participants.length} {t('groups.participants', 'participants')}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Group Description */}
        {conversation.groupDescription && (
          <div>
            <h4 className="text-sm font-medium mb-2">{t('groups.description', 'Description')}</h4>
            <p className="text-sm text-muted-foreground">{conversation.groupDescription}</p>
          </div>
        )}
        
        {/* Group Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('groups.group_id', 'Group ID')}</span>
            <span className="text-sm text-muted-foreground font-mono">
              {conversation.groupJid?.split('@')[0]}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('groups.created_date', 'Created')}</span>
            <span className="text-sm text-muted-foreground">
              {formatDate(conversation.groupCreatedAt)}
            </span>
          </div>
        </div>

        <Separator />

        {/* Actions Section */}
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setShowClearHistoryDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('clear_history.button', 'Clear Chat History')}
          </Button>
        </div>

        <Separator />

        {/* Participants Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium flex items-center">
              <Users className="h-4 w-4 mr-2" />
              {t('groups.participants', 'Participants')} ({participantsWithPictures.length})
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshParticipantPictures}
              disabled={isLoadingPictures}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn("h-4 w-4", isLoadingPictures && "animate-spin")} />
            </Button>
          </div>
          
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {displayedParticipants.map((participant) => (
                <TooltipProvider key={participant.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                        onClick={() => handleParticipantClick(participant)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleParticipantClick(participant);
                          }
                        }}
                      >
                  <GroupParticipantAvatar
                    participantJid={participant.id}
                    participantName={participant.displayName}
                    connectionId={conversation.channelId}
                    avatarUrl={participant.avatarUrl}
                    size="sm"
                    enableAutoFetch={false} // We're already fetching in bulk
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium truncate">
                        {participant.displayName}
                      </span>
                      {participant.isSuperAdmin && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 h-5">
                          <Crown className="h-2.5 w-2.5 mr-1" />
                          {t('groups.super_admin', 'Group Admin')}
                        </Badge>
                      )}
                      {participant.isAdmin && !participant.isSuperAdmin && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-5">
                          <Shield className="h-2.5 w-2.5 mr-1" />
                          {t('groups.admin', 'Admin')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 mr-1" />
                      {formatPhoneNumber(participant.phone || '')}
                    </div>
                  </div>
                        <div className="flex items-center space-x-2">
                          {creatingConversation === participant.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <MessageCircle className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('groups.start_private_chat', 'Click to start private conversation with {{name}}', {
                        name: participant.displayName
                      })}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </ScrollArea>
          
          {hasMoreParticipants && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2"
              onClick={() => setShowAllParticipants(!showAllParticipants)}
            >
              {showAllParticipants ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  {t('groups.show_less', 'Show Less')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  {t('groups.show_more', 'Show More')} ({participantsWithPictures.length - 5})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Clear Chat History Dialog */}
      <ClearChatHistoryDialog
        isOpen={showClearHistoryDialog}
        onClose={() => setShowClearHistoryDialog(false)}
        conversationId={conversation.id}
        conversationName={conversation.groupName || t('groups.unnamed_group', 'Unnamed Group')}
        isGroupChat={true}
        onSuccess={() => {

        }}
      />
    </div>
  );
}
