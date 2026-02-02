import { useState } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { getInitials } from '@/lib/utils';
import { Loader2, Download, Search, Users, Crown, Shield } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface GroupParticipant {
  id: number;
  conversationId: number;
  contactId?: number;
  participantJid: string;
  participantName?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  joinedAt?: string;
  leftAt?: string;
  isActive: boolean;
  contact?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    avatarUrl?: string;
    notes?: string;
  };
}

interface GroupParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: number;
  groupName?: string;
}

export default function GroupParticipantsModal({
  isOpen,
  onClose,
  conversationId,
  groupName
}: GroupParticipantsModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: participantsData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/group-conversations', conversationId, 'participants'],
    queryFn: async () => {
      const response = await fetch(`/api/group-conversations/${conversationId}/participants`);
      if (!response.ok) throw new Error('Failed to fetch participants');
      return response.json();
    },
    enabled: isOpen && !!conversationId
  });

  const handleSyncParticipants = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/group-conversations/${conversationId}/participants/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(t('groups.participants.sync_error', 'Failed to sync participants'));
      }

      const result = await response.json();


      await refetch();

      toast({
        title: t('groups.participants.sync_success', 'Sync successful'),
        description: result.message || t('groups.participants.sync_success_desc', 'Participants have been synced from WhatsApp. Names will appear as participants send messages.'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('groups.participants.sync_error', 'Failed to sync participants'),
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const participants: GroupParticipant[] = participantsData?.participants || [];


  const filteredParticipants = participants.filter(participant => {
    const name = participant.participantName || participant.contact?.name || '';
    const phone = participant.contact?.phone || participant.participantJid.split('@')[0] || '';
    const searchLower = searchQuery.toLowerCase();
    
    return name.toLowerCase().includes(searchLower) || 
           phone.toLowerCase().includes(searchLower);
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      const response = await fetch(`/api/group-conversations/${conversationId}/participants/export`);
      
      if (!response.ok) {
        throw new Error('Failed to export participants');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 
                   `${groupName || 'Group'}_participants.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: t('groups.participants.export_success', 'Export successful'),
        description: t('groups.participants.export_success_desc', 'Participants list has been exported to CSV'),
      });
    } catch (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('groups.participants.export_error', 'Failed to export participants list'),
        variant: 'destructive'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getRoleIcon = (participant: GroupParticipant) => {
    if (participant.isSuperAdmin) {
      return <Crown className="w-4 h-4 text-yellow-500" />;
    }
    if (participant.isAdmin) {
      return <Shield className="w-4 h-4 text-blue-500" />;
    }
    return null;
  };

  const getRoleText = (participant: GroupParticipant) => {
    if (participant.isSuperAdmin) {
      return t('groups.participants.super_admin', 'Super Admin');
    }
    if (participant.isAdmin) {
      return t('groups.participants.admin', 'Admin');
    }
    return t('groups.participants.member', 'Member');
  };

  const getRoleBadgeVariant = (participant: GroupParticipant): "default" | "secondary" | "destructive" | "outline" => {
    if (participant.isSuperAdmin) return "default";
    if (participant.isAdmin) return "secondary";
    return "outline";
  };

  const getParticipantDisplayName = (participant: GroupParticipant) => {

   


    const participantName = participant.participantName;
    const contactName = participant.contact?.name;
    const rawJid = participant.participantJid;
    const rawId = rawJid.split('@')[0];
    const isLidFormat = rawJid.includes('@lid');
    const displayId = isLidFormat ? `LID-${rawId}` : rawId;

   


    if (participantName && participantName !== rawId && participantName !== displayId) {
      return participantName;
    }


    if (contactName && contactName !== rawId && contactName !== displayId) {
      return contactName;
    }

    return null; // No display name available, will show ID
  };

  const getFormattedPhoneNumber = (participant: GroupParticipant) => {
    const rawJid = participant.participantJid;
    const rawId = rawJid.split('@')[0];

    


    const resolvedPhone = (participant as any).phoneNumber;
    if (resolvedPhone && (participant as any).resolvedFromLid) {

      if (resolvedPhone.length > 10) {
        const formatted = `+${resolvedPhone.slice(0, -10)} ${resolvedPhone.slice(-10, -7)} ${resolvedPhone.slice(-7, -4)} ${resolvedPhone.slice(-4)}`;
        return formatted;
      } else {
        const formatted = `+${resolvedPhone}`;
        return formatted;
      }
    }


    const isLidFormat = rawJid.includes('@lid');
    const isWhatsAppFormat = rawJid.includes('@s.whatsapp.net');

    if (isLidFormat) {

      const formatted = `LID-${rawId}`;

      return formatted;
    } else if (isWhatsAppFormat && rawId && rawId.length > 10) {

      const formatted = `+${rawId.slice(0, -10)} ${rawId.slice(-10, -7)} ${rawId.slice(-7, -4)} ${rawId.slice(-4)}`;
      return formatted;
    } else {

      const fallback = isWhatsAppFormat ? `+${rawId}` : rawId;
      return fallback;
    }
  };

  const getParticipantStatus = (participant: GroupParticipant) => {

    if (participant.contact?.notes && participant.contact.notes.startsWith('Status: ')) {
      return participant.contact.notes.substring(8);
    }
    return 'Hey there! I am using WhatsApp.'; // Default status
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            {t('groups.participants.title', 'Group Participants')}
            {groupName && (
              <span className="text-sm font-normal text-muted-foreground">
                - {groupName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Search and Export Controls */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder={t('groups.participants.search_placeholder', 'Search participants...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSyncParticipants}
                disabled={isSyncing}
                variant="outline"
                size="sm"
              >
                {isSyncing ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <i className="ri-refresh-line w-4 h-4 mr-2"></i>
                )}
                {t('groups.participants.sync_participants', 'Sync Participants')}
              </Button>
              <Button
                onClick={handleExportCSV}
                disabled={isExporting || participants.length === 0}
                variant="outline"
                size="sm"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                {t('groups.participants.export_csv', 'Export CSV')}
              </Button>
            </div>
          </div>

          {/* Participants Count */}
          <div className="text-sm text-gray-600">
            {t('groups.participants.showing_count', 'Showing {{count}} of {{total}} participants', {
              count: filteredParticipants.length,
              total: participants.length
            })}
          </div>

          {/* Info Message */}
          <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded border-l-4 border-blue-200">
            <i className="ri-information-line mr-1"></i>
            {t('groups.participants.name_info', 'Participant names appear when they send messages. Phone numbers are shown for participants who haven\'t been active yet.')}
          </div>

          {/* Participants List */}
          <div className="flex-1 overflow-y-auto border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                {t('groups.participants.loading', 'Loading participants...')}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-8 text-red-500">
                {t('groups.participants.error', 'Failed to load participants')}
              </div>
            ) : filteredParticipants.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                {searchQuery ? 
                  t('groups.participants.no_results', 'No participants found matching your search') :
                  t('groups.participants.no_participants', 'No participants found')
                }
              </div>
            ) : (
              <div className="divide-y">
                {filteredParticipants.map((participant) => {
                  const displayName = getParticipantDisplayName(participant);
                  const phoneNumber = getFormattedPhoneNumber(participant);
                  const status = getParticipantStatus(participant);

                  return (
                    <div key={participant.id} className="p-3 hover:bg-gray-50 cursor-pointer">
                      <div className="flex items-center gap-3">
                        {/* Profile Picture */}
                        {participant.contact ? (
                          <ContactAvatar
                            contact={participant.contact}
                            size="sm"
                            showRefreshButton={false}
                          />
                        ) : (
                          <Avatar className="h-12 w-12">
                            <AvatarFallback>
                              {getInitials(getParticipantDisplayName(participant) || getFormattedPhoneNumber(participant))}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        {/* Name and Status */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900 text-base truncate">
                              {displayName ? `~ ${displayName}` : `~ ${phoneNumber}`}
                            </h4>
                            {getRoleIcon(participant)}
                            {(participant.isAdmin || participant.isSuperAdmin) && (
                              <Badge variant={getRoleBadgeVariant(participant)} className="text-xs">
                                {getRoleText(participant)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 truncate mt-1">
                            {status}
                          </p>
                        </div>

                        {/* Phone Number */}
                        <div className="text-sm text-gray-400 font-mono">
                          {phoneNumber}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
