import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { MoreHorizontal, User, Clock, Calendar, Tag, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import HighlightedText from '@/components/ui/highlighted-text';
import { Deal } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import EditDealModal from './EditDealModal';
import DealDetailsModal from './DealDetailsModal';
import ContactDetailsModal from './ContactDetailsModal';
import MoveDealToPipelineModal from './MoveDealToPipelineModal';
import { usePipeline } from '@/hooks/use-pipeline';

interface DealCardProps {
  deal: Deal;
  isSelected?: boolean;
  onSelect?: (deal: Deal, selected: boolean) => void;
  showSelectionMode?: boolean;
  searchTerm?: string;
}

export default function DealCard({ 
  deal, 
  isSelected = false, 
  onSelect, 
  showSelectionMode = false,
  searchTerm = ''
}: DealCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { pipelines } = usePipeline();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDealModalOpen, setIsEditDealModalOpen] = useState(false);
  const [isDealDetailsModalOpen, setIsDealDetailsModalOpen] = useState(false);
  const [isContactDetailsModalOpen, setIsContactDetailsModalOpen] = useState(false);
  const [isMovePipelineModalOpen, setIsMovePipelineModalOpen] = useState(false);

  const { data: contact } = useQuery({
    queryKey: ['/api/contacts', deal.contactId],
    queryFn: () => apiRequest('GET', `/api/contacts/${deal.contactId}`)
      .then(res => res.json()),
    enabled: !!deal.contactId,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: () => apiRequest('GET', '/api/team-members')
      .then(res => res.json()),
  });


  const { data: fetchedReverts = [] } = useQuery({
    queryKey: ['/api/deals', deal.id, 'scheduled-reverts'],
    queryFn: () => apiRequest('GET', `/api/deals/${deal.id}/scheduled-reverts`)
      .then(res => res.json())
      .catch(() => []),
    enabled: !!deal.id && !(deal as any).scheduledReverts,
  });

  const scheduledReverts = (deal as any).scheduledReverts || fetchedReverts || [];
  const activeReverts = scheduledReverts.filter((revert: any) => revert.status === 'scheduled');
  

  const nextRevert = useMemo(() => {
    if (activeReverts.length === 0) return null;
    return activeReverts.sort((a: any, b: any) => 
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    )[0];
  }, [activeReverts]);


  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages'],
    queryFn: () => apiRequest('GET', '/api/pipeline/stages')
      .then(res => res.json())
      .catch(() => []),
    enabled: activeReverts.length > 0,
  });

  const assignedUser = teamMembers.find((member: any) => member.id === deal.assignedToUserId);

  const cancelRevertMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const response = await apiRequest('DELETE', `/api/pipeline-reverts/${scheduleId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals', deal.id, 'scheduled-reverts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline-reverts/stats'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.revert_cancelled_success', 'Scheduled revert cancelled successfully'),
      });
    },
    onError: (error: Error) => {
      console.error('Error cancelling revert:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.revert_cancel_failed', 'Failed to cancel scheduled revert'),
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/deals/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });

      if (deal.stage) {
        queryClient.invalidateQueries({ queryKey: [`/api/deals/stage/${deal.stage}`] });
      }

      if (deal.stageId) {
        queryClient.invalidateQueries({ queryKey: [`/api/deals/stageId/${deal.stageId}`] });
      }
    },
    onError: (error: Error) => {
      console.error('Error deleting deal:', error);
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate(deal.id);
    setIsDeleteDialogOpen(false);
  };

  const handleEditDeal = () => {
    setIsEditDealModalOpen(true);
  };

  const handleViewDetails = () => {
    setIsDealDetailsModalOpen(true);
  };

  const handleViewContact = () => {
    setIsContactDetailsModalOpen(true);
  };

  const handleContactClick = () => {
    if (!contact?.id || !contact?.identifierType) return;

    localStorage.setItem('selectedContactId', contact.id.toString());
    localStorage.setItem('selectedChannelType', contact.identifierType);

    setLocation('/');

    toast({
      title: t('pipeline.redirecting_to_inbox', 'Redirecting to inbox'),
      description: t('pipeline.opening_conversation', 'Opening conversation with {{name}}', { name: contact.name }),
    });
  };

  const handleCardClick = () => {
    if (showSelectionMode && onSelect) {
      onSelect(deal, !isSelected);
    }
  };

  const priorityColors = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500',
  };

  const priorityColor = priorityColors[deal.priority as keyof typeof priorityColors] || 'bg-muted-foreground';

  return (
    <div 
      className={`bg-card border rounded-lg shadow-sm hover:shadow-md transition-all duration-200 cursor-grab group relative hover:border-blue-300 mb-3 ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-500' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Selection Checkbox */}
      {showSelectionMode && (
        <div className="absolute top-2 left-2 z-20">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect?.(deal, !!checked)}
            onClick={(e) => e.stopPropagation()}
            className="bg-background border-2 border-border shadow-sm"
          />
        </div>
      )}
      {/* Quick Actions Overlay */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 z-10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/90 hover:bg-background border shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditDeal();
                }}
              >
                <i className="ri-edit-line text-xs" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t('pipeline.quick_edit', 'Quick Edit')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/90 hover:bg-background border shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetails();
                }}
              >
                <i className="ri-eye-line text-xs" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{t('pipeline.view_details', 'View Details')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="h-7 w-7 bg-background/90 hover:bg-background border shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t('pipeline.more_actions', 'More Actions')}</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleViewContact}>
              <i className="ri-user-line mr-2 h-4 w-4" />
              {t('pipeline.view_contact', 'View Contact')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleContactClick}>
              <i className="ri-message-3-line mr-2 h-4 w-4" />
              {t('pipeline.open_chat', 'Open Chat')}
            </DropdownMenuItem>
            {pipelines.length > 1 && (
              <DropdownMenuItem onClick={() => setIsMovePipelineModalOpen(true)}>
                <i className="ri-arrow-left-right-line mr-2 h-4 w-4" />
                {t('pipeline.move_to_pipeline_action', 'Move to Pipeline')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => setIsDeleteDialogOpen(true)} 
              className="text-destructive focus:text-destructive"
            >
              <i className="ri-delete-bin-line mr-2 h-4 w-4" />
              {t('pipeline.delete_deal', 'Delete Deal')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header Section */}
      <div className="p-3 pb-2">
        <div className="flex justify-between items-start gap-2 mb-2">
          <div className="flex-1 min-w-0 pr-8">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm leading-tight truncate text-foreground group-hover:text-primary transition-colors">
                <HighlightedText 
                  text={deal.title} 
                  searchTerm={searchTerm}
                />
              </h3>
             
              {activeReverts.length > 0 && nextRevert && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/20 border-orange-300">
                        <Clock className="w-3 h-3 mr-1" />
                        {activeReverts.length > 1 ? t('pipeline.reverts', '{{count}} reverts', { count: activeReverts.length }) : t('pipeline.revert_scheduled', 'Revert {{time}}', { time: formatDistanceToNow(new Date(nextRevert.scheduledFor), { addSuffix: true }) })}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1">
                        {activeReverts.length > 1 ? (
                          <p className="font-semibold">{t('pipeline.scheduled_stage_reverts', '{{count}} scheduled stage reverts', { count: activeReverts.length })}</p>
                        ) : null}
                        {nextRevert && (() => {
                          const targetStage = pipelineStages.find((s: any) => s.id === nextRevert.revertToStageId);
                          const targetStageName = targetStage?.name || t('pipeline.stage', 'Stage') + ` ${nextRevert.revertToStageId}`;
                          return (
                            <div>
                              <p>{t('pipeline.scheduled_to_revert', 'Scheduled to revert to stage "{{stageName}}"', { stageName: targetStageName })}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(nextRevert.scheduledFor), 'PPp')}
                                {nextRevert.onlyIfNoActivity && ` (${t('pipeline.if_no_activity', 'if no activity')})`}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {deal.value && (
              <div className="text-lg font-semibold text-green-600 mt-1">
                ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(deal.value)}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Priority Indicator */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`h-3 w-3 rounded-full border-2 border-background shadow-sm ${priorityColor}`} />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="capitalize">{t('pipeline.priority_priority', '{{priority}} priority', { priority: deal.priority })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Description */}
        {deal.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2 leading-relaxed">
            <HighlightedText 
              text={deal.description} 
              searchTerm={searchTerm}
            />
          </p>
        )}

        {/* Assigned User */}
        {assignedUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs text-foreground bg-muted px-2 py-1 rounded-md">
              <User className="h-3 w-3" />
              <span className="font-medium">
                {assignedUser.fullName || assignedUser.username}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Contact Section */}
      {contact && (
        <div 
          className="px-3 py-2 border-t border-border hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={handleContactClick}
          title={t('pipeline.open_conversation', 'Open conversation with {{name}}', { name: contact.name })}
        >
          <div className="flex items-center gap-2">
            <ContactAvatar contact={contact} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground truncate">
                  <HighlightedText 
                    text={contact.name} 
                    searchTerm={searchTerm}
                  />
                </span>
                {contact.identifierType && (
                  <div className="flex-shrink-0">
                    {contact.identifierType === 'whatsapp' && <i className="ri-whatsapp-line text-green-500 text-xs" />}
                    {contact.identifierType === 'whatsapp_unofficial' && <i className="ri-whatsapp-line text-green-500 text-xs" />}
                    {contact.identifierType === 'messenger' && <i className="ri-messenger-line text-blue-500 text-xs" />}
                    {contact.identifierType === 'instagram' && <i className="ri-instagram-line text-pink-500 text-xs" />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Section */}
      <div className="px-3 py-2 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {/* Left side - Assignment */}
          <div className="flex items-center gap-3">
            {assignedUser && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span className="truncate max-w-16">
                        {assignedUser.fullName?.split(' ')[0] || assignedUser.username}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('pipeline.assigned_to_user', 'Assigned to: {{name}}', { name: assignedUser.fullName || assignedUser.username })}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {deal.dueDate && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(deal.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{t('pipeline.due', 'Due: {{date}}', { date: new Date(deal.dueDate).toLocaleDateString() })}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Right side - Activity */}
          {deal.lastActivityAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDistanceToNow(new Date(deal.lastActivityAt), { addSuffix: true })}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{t('pipeline.last_activity', 'Last activity: {{time}}', { time: new Date(deal.lastActivityAt).toLocaleString() })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Tags - Show contact tags for consistency */}
        {contact?.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {contact.tags.slice(0, 3).map((tag: string, index: number) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="text-xs px-1.5 py-0.5 h-auto font-normal bg-blue-50 text-blue-700 border-blue-200"
              >
                {tag}
              </Badge>
            ))}
            {contact.tags.length > 3 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className="text-xs px-1.5 py-0.5 h-auto font-normal text-muted-foreground"
                    >
                      +{contact.tags.length - 3}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>{contact.tags.slice(3).join(', ')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pipeline.are_you_sure', 'Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('pipeline.remove_deal_confirmation', 'This will remove the deal "{{title}}" from your pipeline. This action cannot be undone.', { title: deal.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              {t('pipeline.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditDealModal
        deal={deal}
        isOpen={isEditDealModalOpen}
        onClose={() => setIsEditDealModalOpen(false)}
      />

      <DealDetailsModal
        deal={deal}
        isOpen={isDealDetailsModalOpen}
        onClose={() => setIsDealDetailsModalOpen(false)}
      />

      <ContactDetailsModal
        contactId={deal.contactId}
        isOpen={isContactDetailsModalOpen}
        onClose={() => setIsContactDetailsModalOpen(false)}
      />

      <MoveDealToPipelineModal
        deal={deal}
        isOpen={isMovePipelineModalOpen}
        onClose={() => setIsMovePipelineModalOpen(false)}
      />
    </div>
  );
}