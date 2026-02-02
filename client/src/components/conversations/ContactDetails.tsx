import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ClearChatHistoryDialog } from './ClearChatHistoryDialog';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import EditContactDialog from './EditContactDialog';
import useSocket from '@/hooks/useSocket';
import { useMobileLayout } from '@/contexts/mobile-layout-context';
import { usePermissions } from '@/hooks/usePermissions';

interface ContactDetailsProps {
  contact: any;
  conversation: any;
  className?: string;
}

export default function ContactDetails({
  contact,
  conversation,
  className
}: ContactDetailsProps) {
  const [notes, setNotes] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);
  const [currentContact, setCurrentContact] = useState(contact);
  const { toast } = useToast();
  const { t } = useTranslation();

  const {
    isMobile,
    isContactDetailsOpen,
    toggleContactDetails
  } = useMobileLayout();

  const { canViewContactPhone } = usePermissions();

  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    setCurrentContact(contact);
  }, [contact]);

  useEffect(() => {
    const unsubscribe = onMessage('contactUpdated', (data) => {
      const updatedContact = data.data;

      if (updatedContact && updatedContact.id === contact?.id) {
        setCurrentContact(updatedContact);
        toast({
          title: t('contacts.details.contact_updated_title', 'Contact updated'),
          description: t('contacts.details.contact_updated_description', 'Contact information has been updated.'),
        });
      }
    });

    return unsubscribe;
  }, [onMessage, contact?.id, toast]);

  const handleContactUpdated = (updatedContact: any) => {
    setCurrentContact(updatedContact);
  };

  const handleEditContact = () => {
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
  };

  const { data: contactNotes = [] } = useQuery({
    queryKey: ['/api/contacts', contact?.id, 'notes'],
    enabled: !!contact?.id,
    queryFn: async ({ queryKey }) => {
      const response = await fetch(`/api/contacts/${queryKey[1]}/notes`);
      if (!response.ok) throw new Error(t('contacts.details.fetch_notes_failed', 'Failed to fetch notes'));
      return response.json();
    }
  });

  const handleSaveNotes = async () => {
    if (!notes.trim()) return;

    try {
      const response = await fetch(`/api/contacts/${contact.id}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: notes }),
      });

      if (!response.ok) throw new Error(t('contacts.details.save_note_failed', 'Failed to save note'));

      toast({
        title: t('common.success', 'Success'),
        description: t('contacts.details.note_saved_successfully', 'Note saved successfully'),
      });

      setNotes('');
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.details.save_note_failed', 'Failed to save note'),
        variant: "destructive"
      });
    }
  };

  const getChannelInfo = (channelType: string) => {
    switch(channelType) {
      case 'whatsapp':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('contacts.details.channel.whatsapp', 'WhatsApp') };
      case 'whatsapp_official':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('contacts.details.channel.whatsapp_business', 'WhatsApp Business') };
      case 'whatsapp_unofficial':
        return { icon: 'ri-whatsapp-line', color: '#F59E0B', name: t('contacts.details.channel.whatsapp_unofficial', 'WhatsApp (Unofficial)') };
      case 'messenger':
      case 'facebook':
        return { icon: 'ri-messenger-line', color: '#1877F2', name: t('contacts.details.channel.messenger', 'Messenger') };
      case 'instagram':
        return { icon: 'ri-instagram-line', color: '#E4405F', name: t('contacts.details.channel.instagram', 'Instagram') };
      case 'tiktok':
        return { icon: 'ri-tiktok-line dark:text-white', color: '#000000', name: t('contacts.details.channel.tiktok', 'TikTok Business') };
      case 'email':
        return { icon: 'ri-mail-line', color: '#3B82F6', name: t('contacts.details.channel.email', 'Email') };
      case 'webchat':
        return { icon: 'ri-message-3-line', color: '#6366f1', name: t('contacts.details.channel.webchat', 'WebChat') };
      default:
        return { icon: 'twilio', isComponent: true, color: '#333235', name: t('contacts.details.channel.chat', 'Twilio SMS/MMS') };
    }
  };

  if (!contact) return null;

  const channelInfo = getChannelInfo(conversation?.channelType);
  const firstContactedDate = conversation?.createdAt
    ? format(new Date(conversation.createdAt), 'PPP, p')
    : t('contacts.details.unknown', 'Unknown');

  return (
    <>
      <div
        className={className || `${
          isContactDetailsOpen ? 'flex' : 'hidden'
        } flex-col fixed top-0 right-0 h-full z-50 lg:static lg:z-0 w-full max-w-sm sm:max-w-md lg:w-80 bg-card border-l border-border shadow-lg lg:shadow-none transition-all duration-300 ease-in-out overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center lg:hidden">
          <h2 className="font-medium text-lg">{t('contacts.details.title', 'Contact Details')}</h2>
          <button
            onClick={toggleContactDetails}
            className="p-2 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={t('contacts.details.close_details', 'Close contact details')}
          >
            <i className="ri-close-line text-lg text-muted-foreground"></i>
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-center mb-5">
            <ContactAvatar
              contact={currentContact || contact}
              connectionId={conversation?.channelId}
              size="lg"
              showRefreshButton={
                conversation?.channelType === 'whatsapp' ||
                conversation?.channelType === 'whatsapp_unofficial'
              }
              className="mx-auto"
            />
          </div>

          <h3 className="font-medium mb-4">{t('contacts.details.contact_information', 'Contact Information')}</h3>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.full_name', 'Full Name')}</p>
              <p className="text-sm">{currentContact?.name || contact?.name}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.phone', 'Phone')}</p>
              <p className="text-sm">
                {canViewContactPhone()
                  ? (currentContact?.phone || contact?.phone || t('contacts.details.not_provided', 'Not provided'))
                  : (t('contacts.details.phone_hidden', '—') || '—')}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.email', 'Email')}</p>
              <p className="text-sm">{currentContact?.email || contact?.email || t('contacts.details.not_provided', 'Not provided')}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.company', 'Company')}</p>
              <p className="text-sm">{currentContact?.company || contact?.company || t('contacts.details.not_provided', 'Not provided')}</p>
            </div>
          </div>

          <button
            onClick={handleEditContact}
            className="mt-4 text-primary-600 text-sm flex items-center hover:text-primary-700 transition-colors"
          >
            <i className="ri-edit-line mr-1"></i>
            {t('contacts.details.edit_details', 'Edit details')}
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <h3 className="font-medium mb-4">{t('contacts.details.tags', 'Tags')}</h3>
          <div className="flex flex-wrap gap-2">
            {(currentContact?.tags || contact?.tags) && (currentContact?.tags || contact?.tags).length > 0 ? (
              (currentContact?.tags || contact?.tags).map((tag: string, idx: number) => (
                <span key={idx} className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">{t('contacts.details.no_tags_added', 'No tags added')}</span>
            )}
          </div>
        </div>

        <div className="p-4 border-b border-border">
          <h3 className="font-medium mb-4">{t('contacts.details.conversation_details', 'Conversation Details')}</h3>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.first_contacted', 'First contacted')}</p>
              <p className="text-sm">{firstContactedDate}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">{t('contacts.details.channel', 'Channel')}</p>
              <p className="text-sm flex items-center">
                {channelInfo.isComponent ? (
                  <TwilioIcon className="w-4 h-4 mr-1" />
                ) : (
                  <i className={channelInfo.icon + " mr-1"} style={channelInfo.icon.includes('tiktok') ? undefined : { color: channelInfo.color }}></i>
                )}
                {channelInfo.name}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <Separator className="mb-4" />
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
      </div>

      <EditContactDialog
        contact={currentContact || contact}
        conversation={conversation}
        isOpen={isEditDialogOpen}
        onClose={handleCloseEditDialog}
        onContactUpdated={handleContactUpdated}
      />

      {/* Clear Chat History Dialog */}
      <ClearChatHistoryDialog
        isOpen={showClearHistoryDialog}
        onClose={() => setShowClearHistoryDialog(false)}
        conversationId={conversation?.id}
        conversationName={currentContact?.name || contact?.name || t('contacts.details.unknown_contact', 'Unknown Contact')}
        isGroupChat={false}
        onSuccess={() => {

        }}
      />
    </>
  );
}
