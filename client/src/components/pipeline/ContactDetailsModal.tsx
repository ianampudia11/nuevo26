import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { 
  User, 
  Phone, 
  Mail, 
  Building, 
  MessageCircle,
  Activity,
  ExternalLink,
  MapPin} from 'lucide-react';

interface ContactDetailsModalProps {
  contactId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactDetailsModal({ contactId, isOpen, onClose }: ContactDetailsModalProps) {
  const { t } = useTranslation();
  const { data: contact, isLoading } = useQuery({
    queryKey: ['/api/contacts', contactId],
    queryFn: () => apiRequest('GET', `/api/contacts/${contactId}`)
      .then(res => res.json()),
    enabled: !!contactId && isOpen,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['/api/conversations', 'contact', contactId],
    queryFn: () => apiRequest('GET', `/api/conversations?contactId=${contactId}`)
      .then(res => res.json()),
    enabled: !!contactId && isOpen,
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['/api/deals', 'contact', contactId],
    queryFn: () => apiRequest('GET', `/api/deals?contactId=${contactId}`)
      .then(res => res.json()),
    enabled: !!contactId && isOpen,
  });

  if (!contactId || !contact) return null;

  const handleStartConversation = () => {
    window.location.href = `/conversations?contactId=${contactId}`;
  };

  const handleViewAllDeals = () => {
    window.location.href = `/pipeline?contactId=${contactId}`;
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'whatsapp':
      case 'whatsapp_unofficial':
        return 'ri-whatsapp-line text-green-600';
      case 'instagram':
        return 'ri-instagram-line text-pink-600';
      case 'facebook':
        return 'ri-facebook-line text-blue-600';
      default:
        return 'ri-message-line text-muted-foreground';
    }
  };

  const getChannelName = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return 'WhatsApp Business';
      case 'whatsapp_unofficial':
        return 'WhatsApp';
      case 'instagram':
        return 'Instagram';
      case 'facebook':
        return 'Facebook Messenger';
      default:
        return 'Unknown';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-3">
            <User className="h-5 w-5" />
            {t('pipeline.contact_details', 'Contact Details')}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-4 border rounded-lg">
                <ContactAvatar contact={contact} size="lg" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{contact.name}</h2>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${contact.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      <span className="text-sm text-muted-foreground">
                        {contact.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{contact.phone}</span>
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{contact.email}</span>
                      </div>
                    )}
                    {contact.company && (
                      <div className="flex items-center gap-2 text-sm">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span>{contact.company}</span>
                      </div>
                    )}
                    {contact.location && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{contact.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={handleViewAllDeals}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('pipeline.view_deals', 'View Deals')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('pipeline.contact_information', 'Contact Information')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('pipeline.identifier', 'Identifier')}</p>
                      <p className="text-sm">{contact.identifier || t('pipeline.not_provided', 'Not provided')}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('pipeline.identifier_type', 'Identifier Type')}</p>
                      <p className="text-sm capitalize">{contact.identifierType || t('pipeline.not_specified', 'Not specified')}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('pipeline.first_contacted', 'First Contacted')}</p>
                      <p className="text-sm">
                        {contact.createdAt 
                          ? format(new Date(contact.createdAt), 'PPP')
                          : t('pipeline.unknown', 'Unknown')
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{t('pipeline.last_activity_contact', 'Last Activity')}</p>
                      <p className="text-sm">
                        {contact.lastContactedAt 
                          ? formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true })
                          : t('pipeline.no_recent_activity', 'No recent activity')
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {contact.notes && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{t('pipeline.notes', 'Notes')}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{contact.notes}</p>
                  </div>
                </>
              )}

              {contact.tags && contact.tags.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{t('pipeline.tags', 'Tags')}</h3>
                    <div className="flex flex-wrap gap-2">
                      {contact.tags.map((tag: string, index: number) => (
                        <Badge key={index} variant="secondary" className="!bg-muted !text-muted-foreground">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {conversations.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      {t('pipeline.recent_conversations', 'Recent Conversations ({{count}})', { count: conversations.length })}
                    </h3>
                    <div className="space-y-2">
                      {conversations.slice(0, 3).map((conversation: any) => (
                        <div key={conversation.id} className="flex items-center gap-3 p-3 border rounded-lg">
                          <i className={getChannelIcon(conversation.channelType)} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{getChannelName(conversation.channelType)}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('pipeline.last_message', 'Last message: {{time}}', { time: formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true }) })}
                            </p>
                          </div>
                          <Badge variant={conversation.status === 'active' ? 'default' : 'secondary'}>
                            {conversation.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {deals.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      {t('pipeline.associated_deals', 'Associated Deals ({{count}})', { count: deals.length })}
                    </h3>
                    <div className="space-y-2">
                      {deals.slice(0, 3).map((deal: any) => (
                        <div key={deal.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{deal.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {deal.value && `$${new Intl.NumberFormat().format(deal.value)} • `}
                              {deal.stage}
                            </p>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {deal.priority}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium">{t('pipeline.created', 'Created')}</p>
                  <p>{format(new Date(contact.createdAt), 'PPP p')}</p>
                </div>
                <div>
                  <p className="font-medium">{t('pipeline.last_updated', 'Last Updated')}</p>
                  <p>{format(new Date(contact.updatedAt), 'PPP p')}</p>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
