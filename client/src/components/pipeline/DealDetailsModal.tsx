import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Deal } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { useTranslation } from '@/hooks/use-translation';
import {
  User,
  Calendar,
  DollarSign,
  Clock,
  Tag,
  FileText,
  AlertCircle,
  Phone,
  Mail,
  Building,
  RotateCcw,
  X,
  ArrowLeftRight,
  Bot
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';

interface DealDetailsModalProps {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DealDetailsModal({ deal, isOpen, onClose }: DealDetailsModalProps) {
  const { t } = useTranslation();
  const { pipelines } = usePipeline();
  const dealPipeline = deal?.pipelineId ? pipelines.find(p => p.id === deal.pipelineId) : null;
  
  const { data: contact } = useQuery({
    queryKey: ['/api/contacts', deal?.contactId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/contacts/${deal?.contactId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return null;
      } catch (error) {
        console.warn('Failed to fetch contact:', error);
        return null;
      }
    },
    enabled: !!deal?.contactId && typeof deal.contactId === 'number',
  });

  const { data: assignedUser } = useQuery({
    queryKey: ['/api/users', deal?.assignedToUserId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/users/${deal?.assignedToUserId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return null;
      } catch (error) {
        console.warn('Failed to fetch assigned user:', error);
        return null;
      }
    },
    enabled: !!deal?.assignedToUserId && typeof deal.assignedToUserId === 'number',
  });

  const { data: pipelineStage } = useQuery({
    queryKey: ['/api/pipeline/stages', deal?.stageId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/pipeline/stages/${deal?.stageId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return null;
      } catch (error) {
        console.warn('Failed to fetch pipeline stage:', error);
        return null;
      }
    },
    enabled: !!deal?.stageId && typeof deal.stageId === 'number',
  });


  const { data: fetchedReverts = [] } = useQuery({
    queryKey: ['/api/deals', deal?.id, 'scheduled-reverts'],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/deals/${deal?.id}/scheduled-reverts`, {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch scheduled reverts:', error);
        return [];
      }
    },
    enabled: !!deal?.id && typeof deal.id === 'number' && !(deal as any).scheduledReverts,
  });

  const scheduledReverts = (deal as any)?.scheduledReverts || fetchedReverts || [];
  const activeReverts = scheduledReverts.filter((revert: any) => revert.status === 'scheduled');

  const { data: allPipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/pipeline/stages', {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch pipeline stages:', error);
        return [];
      }
    },
    enabled: activeReverts.length > 0,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['/api/deals', deal?.id, 'activities'],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/deals/${deal?.id}/activities`, {
          credentials: 'include',
        });
        if (res.ok) {
          return res.json();
        }
        return [];
      } catch (error) {
        console.warn('Failed to fetch deal activities:', error);
        return [];
      }
    },
    enabled: !!deal?.id && typeof deal.id === 'number',
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const cancelRevertMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await fetch(`/api/pipeline-reverts/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to cancel revert');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals', deal?.id, 'scheduled-reverts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline-reverts/stats'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.revert_cancelled_success', 'Scheduled revert cancelled successfully'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.revert_cancel_failed', 'Failed to cancel scheduled revert'),
        variant: 'destructive',
      });
    },
  });

  if (!deal) return null;

  const priorityColors = {
    low: 'bg-blue-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500',
  };

  const priorityColor = priorityColors[deal.priority as keyof typeof priorityColors] || 'bg-muted-foreground';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${priorityColor}`} />
              {deal.title}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="space-y-6">
            {contact && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('pipeline.contact_information', 'Contact Information')}
                </h3>
                <div className="flex items-start gap-4 p-4 border rounded-lg">
                  <ContactAvatar contact={contact} size="lg" />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium text-lg">{contact.name}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {contact.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.phone}</span>
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.email}</span>
                        </div>
                      )}
                      {contact.company && (
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span>{contact.company}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('pipeline.deal_information', 'Deal Information')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {deal.value && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.deal_value', 'Deal Value')}</p>
                      <p className="font-semibold text-lg">
                        ${new Intl.NumberFormat().format(deal.value)}
                      </p>
                    </div>
                  </div>
                )}

                {pipelineStage && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <div
                      className="h-5 w-5 rounded-full"
                      style={{ backgroundColor: pipelineStage.color }}
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.pipeline_stage_info', 'Pipeline Stage')}</p>
                      <p className="font-semibold">{pipelineStage.name}</p>
                    </div>
                  </div>
                )}

                {dealPipeline && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    {dealPipeline.color && (
                      <div className="h-5 w-5 rounded-full" style={{ backgroundColor: dealPipeline.color }} />
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.pipeline', 'Pipeline')}</p>
                      <p className="font-semibold">{dealPipeline.name}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t('pipeline.priority', 'Priority')}</p>
                    <p className="font-semibold capitalize">{deal.priority}</p>
                  </div>
                </div>

                {assignedUser && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <User className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.assigned_to', 'Assigned To')}</p>
                      <p className="font-semibold">{assignedUser.name}</p>
                    </div>
                  </div>
                )}

                {deal.dueDate && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Calendar className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.due_date', 'Due Date')}</p>
                      <p className="font-semibold">
                        {format(new Date(deal.dueDate), 'PPP')}
                      </p>
                    </div>
                  </div>
                )}

                {deal.lastActivityAt && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">{t('pipeline.last_activity_info', 'Last Activity')}</p>
                      <p className="font-semibold">
                        {formatDistanceToNow(new Date(deal.lastActivityAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {deal.description && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">{t('pipeline.description', 'Description')}</h3>
                  <p className="text-muted-foreground leading-relaxed">{deal.description}</p>
                </div>
              </>
            )}

            {contact?.tags && contact.tags.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    {t('pipeline.tags', 'Tags')}
                  </h3>
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

            {(() => {
              const recentActivities = activities.filter((a: any) => a.type !== 'pipeline_change');
              return recentActivities.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">{t('pipeline.recent_activities', 'Recent Activities')}</h3>
                    <div className="space-y-3">
                      {recentActivities.slice(0, 5).map((activity: any) => {
                        const isAutomated = activity.type === 'assignment_change' && activity.metadata?.automated;
                        return (
                          <div
                            key={activity.id}
                            className={`flex gap-3 p-3 border rounded-lg ${
                              isAutomated ? 'bg-purple-50 dark:bg-purple-900/10' : ''
                            }`}
                          >
                            {isAutomated ? (
                              <Bot className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm">{activity.content}</p>
                                {isAutomated && (
                                  <Badge variant="secondary" className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                    {t('pipeline.automated', 'Automated')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                {isAutomated && activity.metadata?.ruleName && (
                                  <span> • {t('pipeline.via_rule', 'via rule "{{ruleName}}"', { ruleName: activity.metadata.ruleName })}</span>
                                )}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            {(() => {
              const pipelineChangeActivities = activities.filter((a: any) => a.type === 'pipeline_change');
              return pipelineChangeActivities.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <ArrowLeftRight className="h-5 w-5" />
                      {t('pipeline.pipeline_movement_history', 'Pipeline Movement History')}
                    </h3>
                    <div className="space-y-3">
                      {pipelineChangeActivities.map((activity: any) => (
                        <div key={activity.id} className="flex gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/10">
                          <ArrowLeftRight className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-sm">{activity.content}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })} • 
                              {format(new Date(activity.createdAt), 'PPp')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {activeReverts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" />
                    {t('pipeline.scheduled_stage_reverts_title', 'Scheduled Stage Reverts')}
                  </h3>
                  <div className="space-y-3">
                    {activeReverts.map((revert: any) => {
                      const scheduledTime = new Date(revert.scheduledFor);
                      const timeUntil = formatDistanceToNow(scheduledTime, { addSuffix: true });
                      const targetStage = allPipelineStages.find((s: any) => s.id === revert.revertToStageId);
                      const revertToStageName = targetStage?.name || (revert.revertToStageId ? `Stage ${revert.revertToStageId}` : 'Previous Stage');
                      
                      return (
                        <div key={revert.scheduleId} className="flex gap-3 p-3 border rounded-lg bg-orange-50 dark:bg-orange-900/10">
                          <RotateCcw className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">
                                      {t('pipeline.scheduled_to_revert_to', 'Scheduled to revert to "{{stageName}}"', { stageName: revertToStageName })}
                                    </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {timeUntil} • {format(scheduledTime, 'PPp')}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {revert.revertTimeAmount} {revert.revertTimeUnit}
                                  </Badge>
                                  {revert.onlyIfNoActivity && (
                                    <Badge variant="secondary" className="text-xs !bg-muted !text-muted-foreground">
                                      {t('pipeline.only_if_no_activity', 'Only if no activity')}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(t('pipeline.cancel_scheduled_revert', 'Are you sure you want to cancel this scheduled revert?'))) {
                                    cancelRevertMutation.mutate(revert.scheduleId);
                                  }
                                }}
                                disabled={cancelRevertMutation.isPending}
                                className="h-8 w-8 p-0 flex-shrink-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <p className="font-medium">{t('pipeline.created', 'Created')}</p>
                <p>{format(new Date(deal.createdAt), 'PPP p')}</p>
              </div>
              <div>
                <p className="font-medium">{t('pipeline.last_updated', 'Last Updated')}</p>
                <p>{format(new Date(deal.updatedAt), 'PPP p')}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
