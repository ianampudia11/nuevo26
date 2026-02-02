import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Trash2, 
  Move, 
  UserPlus, 
  X, 
  ArrowRight,
  CheckSquare,
  MoreHorizontal,
  Loader2,
  ArrowLeftRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Deal, PipelineStage } from '@shared/schema';
import { usePipeline } from '@/hooks/use-pipeline';
import { useQuery } from '@tanstack/react-query';

interface BulkOperationsBarProps {
  selectedDeals: Deal[];
  stages: PipelineStage[];
  users: Array<{ id: number; name?: string; fullName?: string; username?: string; email: string }>;
  onClearSelection: () => void;
  onUpdateDeals: () => void;
}

export default function BulkOperationsBar({
  selectedDeals,
  stages,
  users,
  onClearSelection,
  onUpdateDeals
}: BulkOperationsBarProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines } = usePipeline();
  
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showMovePipelineDialog, setShowMovePipelineDialog] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedPipelineStageId, setSelectedPipelineStageId] = useState<string>('');


  const contactIds = Array.from(new Set(selectedDeals.map(deal => deal.contactId).filter((id): id is number => typeof id === 'number')));
  
  const { data: contactDealsData = [] } = useQuery({
    queryKey: ['/api/deals/contact', 'bulk', contactIds],
    queryFn: async () => {

      const promises = contactIds.map(contactId => 
        apiRequest('GET', `/api/deals/contact/${contactId}`).then(res => res.json())
      );
      const results = await Promise.all(promises);

      return results.flatMap((deals, index) => 
        deals.map((deal: Deal) => ({ ...deal, _contactId: contactIds[index] }))
      );
    },
    enabled: contactIds.length > 0 && showMovePipelineDialog,
  });


  const blockedPipelineIds = new Set<number>();
  if (contactDealsData && selectedDeals.length > 0) {
    const selectedDealIds = new Set(selectedDeals.map(deal => deal.id));
    contactDealsData.forEach((contactDeal: Deal & { _contactId?: number }) => {
      if (contactDeal.status === 'active' && !selectedDealIds.has(contactDeal.id) && contactDeal.pipelineId) {
        blockedPipelineIds.add(contactDeal.pipelineId);
      }
    });
  }

  const { data: pipelineStagesForMove = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', selectedPipelineId],
    queryFn: () => {
      const url = `/api/pipeline/stages?pipelineId=${selectedPipelineId}`;
      return apiRequest('GET', url).then(res => res.json());
    },
    enabled: !!selectedPipelineId && showMovePipelineDialog,
  });

  const bulkMoveMutation = useMutation({
    mutationFn: async ({ dealIds, stageId }: { dealIds: number[]; stageId: number }) => {
      const response = await apiRequest('PUT', '/api/deals/bulk-move', {
        dealIds,
        stageId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setShowMoveDialog(false);
      onClearSelection();
      onUpdateDeals();
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deals_moved_success', `${selectedDeals.length} deals moved successfully`),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deals_move_failed', 'Failed to move deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });


  const bulkDeleteMutation = useMutation({
    mutationFn: async (dealIds: number[]) => {
      const response = await apiRequest('DELETE', '/api/deals/bulk-delete', {
        dealIds
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setShowDeleteDialog(false);
      onClearSelection();
      onUpdateDeals();
      
      const { deletedCount, failedCount } = data;
      
      if (failedCount > 0) {
        toast({
          title: t('common.partial_success', 'Partially Completed'),
          description: t('pipeline.deals_deleted_partial', `${deletedCount} deals deleted successfully, ${failedCount} failed (already deleted or not found)`),
          variant: 'default',
        });
      } else {
        toast({
          title: t('common.success', 'Success'),
          description: t('pipeline.deals_deleted_success', `${deletedCount} deals deleted successfully`),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deals_delete_failed', 'Failed to delete deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });


  const bulkAssignMutation = useMutation({
    mutationFn: async ({ dealIds, userId }: { dealIds: number[]; userId: number }) => {
      const response = await apiRequest('PUT', '/api/deals/bulk-assign', {
        dealIds,
        assignedToUserId: userId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setShowAssignDialog(false);
      onClearSelection();
      onUpdateDeals();
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deals_assigned_success', `${selectedDeals.length} deals assigned successfully`),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deals_assign_failed', 'Failed to assign deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const bulkMovePipelineMutation = useMutation({
    mutationFn: async ({ dealIds, pipelineId, stageId }: { dealIds: number[]; pipelineId: number; stageId: number }) => {
      const response = await apiRequest('POST', '/api/deals/bulk-move-pipeline', {
        dealIds,
        targetPipelineId: pipelineId,
        targetStageId: stageId
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setShowMovePipelineDialog(false);
      onClearSelection();
      onUpdateDeals();
      
      const { movedCount, failedCount } = data;
      if (failedCount > 0) {
        toast({
          title: t('common.partial_success', 'Partially Completed'),
          description: t('pipeline.deals_moved_partial', '{{movedCount}} deals moved successfully, {{failedCount}} failed', { movedCount, failedCount }),
          variant: 'default',
        });
      } else {
        toast({
          title: t('common.success', 'Success'),
          description: t('pipeline.deals_moved_to_new_pipeline', '{{count}} deals moved to new pipeline successfully', { count: movedCount }),
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deals_move_failed', 'Failed to move deals: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleBulkMove = () => {
    if (!selectedStageId) return;
    
    const dealIds = selectedDeals.map(deal => deal.id);
    bulkMoveMutation.mutate({ 
      dealIds, 
      stageId: parseInt(selectedStageId) 
    });
  };

  const handleBulkDelete = () => {
    const dealIds = selectedDeals.map(deal => deal.id);



    bulkDeleteMutation.mutate(dealIds);
  };

  const handleBulkAssign = () => {
    if (!selectedUserId) return;
    
    const dealIds = selectedDeals.map(deal => deal.id);
    bulkAssignMutation.mutate({ 
      dealIds, 
      userId: parseInt(selectedUserId) 
    });
  };

  if (selectedDeals.length === 0) {
    return null;
  }

  return (
    <>
      {/* Floating Toolbar */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-blue-600" />
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {t('pipeline.selected', '{{count}} selected', { count: selectedDeals.length })}
            </Badge>
          </div>
          
          <div className="h-6 w-px bg-border" />
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMoveDialog(true)}
              disabled={bulkMoveMutation.isPending || bulkDeleteMutation.isPending || bulkAssignMutation.isPending || bulkMovePipelineMutation.isPending}
              className="h-8"
            >
              {bulkMoveMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              ) : (
                <Move className="h-3 w-3 mr-2" />
              )}
              {t('pipeline.move', 'Move')}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAssignDialog(true)}
              disabled={bulkMoveMutation.isPending || bulkDeleteMutation.isPending || bulkAssignMutation.isPending || bulkMovePipelineMutation.isPending}
              className="h-8"
            >
              {bulkAssignMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-3 w-3 mr-2" />
              )}
              {t('pipeline.assign', 'Assign')}
            </Button>
            
            {pipelines.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowMovePipelineDialog(true)}
                disabled={bulkMoveMutation.isPending || bulkDeleteMutation.isPending || bulkAssignMutation.isPending || bulkMovePipelineMutation.isPending}
                className="h-8"
              >
                {bulkMovePipelineMutation.isPending ? (
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                ) : (
                  <ArrowLeftRight className="h-3 w-3 mr-2" />
                )}
                {t('pipeline.move_to_pipeline', 'Move to Pipeline')}
              </Button>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
              disabled={bulkMoveMutation.isPending || bulkDeleteMutation.isPending || bulkAssignMutation.isPending || bulkMovePipelineMutation.isPending}
              className="h-8"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <MoreHorizontal className="h-3 w-3" />
              )}
            </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('pipeline.delete_selected', 'Delete Selected')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="h-6 w-px bg-border" />
          
          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            className="h-8 w-8 p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Move Dialog */}
      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.move_deals', 'Move {{count}} Deals', { count: selectedDeals.length })}</DialogTitle>
            <DialogDescription>
              {t('pipeline.select_stage_to_move', 'Select the stage to move the selected deals to.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('pipeline.target_stage', 'Target Stage')}</label>
              <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('pipeline.select_stage', 'Select a stage')} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMoveDialog(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleBulkMove}
              disabled={!selectedStageId || bulkMoveMutation.isPending}
            >
              {bulkMoveMutation.isPending ? (
                <>{t('pipeline.moving', 'Moving...')}</>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {t('pipeline.move_deals_action', 'Move Deals')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.delete_deals', 'Delete {{count}} Deals', { count: selectedDeals.length })}</DialogTitle>
            <DialogDescription>
              {t('pipeline.delete_deals_confirmation', 'Are you sure you want to delete these deals? This action cannot be undone.')}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? (
                <>{t('pipeline.deleting', 'Deleting...')}</>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('pipeline.delete_deals_action', 'Delete Deals')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.assign_deals', 'Assign {{count}} Deals', { count: selectedDeals.length })}</DialogTitle>
            <DialogDescription>
              {t('pipeline.select_user_to_assign', 'Select a user to assign the selected deals to.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('pipeline.assignee', 'Assignee')}</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('pipeline.select_user', 'Select a user')} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.fullName || user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAssignDialog(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={!selectedUserId || bulkAssignMutation.isPending}
            >
              {bulkAssignMutation.isPending ? (
                <>{t('pipeline.assigning', 'Assigning...')}</>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  {t('pipeline.assign_deals_action', 'Assign Deals')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Pipeline Dialog */}
      <Dialog open={showMovePipelineDialog} onOpenChange={setShowMovePipelineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.move_deals_to_another_pipeline', 'Move {{count}} Deals to Another Pipeline', { count: selectedDeals.length })}</DialogTitle>
            <DialogDescription>
              {t('pipeline.select_target_pipeline_stage', 'Select the target pipeline and stage for the selected deals.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t('pipeline.target_pipeline', 'Target Pipeline')}</label>
              <Select value={selectedPipelineId} onValueChange={(value) => {
                setSelectedPipelineId(value);
                setSelectedPipelineStageId(''); // Reset stage when pipeline changes
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t('pipeline.select_pipeline', 'Select a pipeline')} />
                </SelectTrigger>
                <SelectContent>
                  {pipelines
                    .filter(p => !blockedPipelineIds.has(p.id))
                    .map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                        <div className="flex items-center gap-2">
                          {pipeline.color && (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pipeline.color }} />
                          )}
                          {pipeline.name}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">{t('pipeline.target_stage', 'Target Stage')}</label>
              <Select 
                value={selectedPipelineStageId} 
                onValueChange={setSelectedPipelineStageId}
                disabled={!selectedPipelineId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedPipelineId ? t('pipeline.select_stage', 'Select a stage') : t('pipeline.select_pipeline_first', 'Select pipeline first')} />
                </SelectTrigger>
                <SelectContent>
                  {pipelineStagesForMove.map((stage: any) => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovePipelineDialog(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (selectedPipelineId && selectedPipelineStageId) {
                  const dealIds = selectedDeals.map(deal => deal.id);
                  bulkMovePipelineMutation.mutate({
                    dealIds,
                    pipelineId: parseInt(selectedPipelineId),
                    stageId: parseInt(selectedPipelineStageId)
                  });
                }
              }}
              disabled={!selectedPipelineId || !selectedPipelineStageId || bulkMovePipelineMutation.isPending}
            >
              {bulkMovePipelineMutation.isPending ? (
                <>{t('pipeline.moving', 'Moving...')}</>
              ) : (
                <>
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  {t('pipeline.move_deals_action', 'Move Deals')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
