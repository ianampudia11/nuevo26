import { useState, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DealCard from '@/components/pipeline/DealCard';
import StageHeader from '@/components/pipeline/StageHeader';
import BulkOperationsBar from '@/components/pipeline/BulkOperationsBar';
import ImportExportModal from '@/components/pipeline/ImportExportModal';
import { PipelineLoadingSkeleton } from '@/components/pipeline/PipelineSkeletons';
import { EmptyPipelineState, EmptyDealsState, EmptyStageState } from '@/components/pipeline/EmptyStates';
import { Deal, PipelineStage } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { usePipeline } from '@/contexts/PipelineContext';
import { PlusCircle, Edit2, Trash2, MoreHorizontal, Plus, CheckSquare, Download, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface KanbanBoardProps {
  onAddDeal: () => void;
  activePipelineId: number | null;
}

export default function KanbanBoard({ onAddDeal, activePipelineId }: KanbanBoardProps) {
  const { filters } = usePipeline();
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#3a86ff');
  const [editedStageName, setEditedStageName] = useState('');
  const [editedStageColor, setEditedStageColor] = useState('');
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<PipelineStage | null>(null);
  const [targetStageId, setTargetStageId] = useState<number | null>(null);
  

  const [selectedDeals, setSelectedDeals] = useState<Deal[]>([]);
  const [showSelectionMode, setShowSelectionMode] = useState(false);
  const [showImportExportModal, setShowImportExportModal] = useState(false);


  const handleDealSelect = (deal: Deal, selected: boolean) => {
    if (selected) {
      setSelectedDeals(prev => [...prev, deal]);
    } else {
      setSelectedDeals(prev => prev.filter(d => d.id !== deal.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedDeals([]);
    setShowSelectionMode(false);
  };

  const handleToggleSelectionMode = () => {
    setShowSelectionMode(!showSelectionMode);
    if (showSelectionMode) {
      setSelectedDeals([]);
    }
  };

  const stageColors = [
    '#4361ee',
    '#3a86ff',
    '#7209b7',
    '#f72585',
    '#4cc9f0',
    '#4895ef',
    '#560bad',
    '#f3722c',
    '#f8961e',
    '#90be6d',
    '#43aa8b',
    '#577590',
  ];

  const {
    data: pipelineStages = [],
    isLoading: isLoadingStages
  } = useQuery({
    queryKey: ['/api/pipeline/stages', activePipelineId],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (activePipelineId) {
        queryParams.append('pipelineId', activePipelineId.toString());
      }
      const url = `/api/pipeline/stages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await apiRequest('GET', url);
      const data = await res.json();
      return data;
    },
    enabled: !!activePipelineId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const {
    data: deals = [],
    isLoading: isLoadingDeals
  } = useQuery({
    queryKey: ['/api/deals', filters, activePipelineId],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      
      if (filters.searchTerm) {
        queryParams.append('generalSearch', filters.searchTerm);
      }
      
      if (activePipelineId) {
        queryParams.append('pipelineId', activePipelineId.toString());
      }
      
      if (filters.stageIds && filters.stageIds.length > 0) {
        queryParams.append('stageIds', filters.stageIds.join(','));
      }
      
      if (filters.priorities && filters.priorities.length > 0) {
        queryParams.append('priorities', filters.priorities.join(','));
      }
      
      if (filters.minValue !== undefined) {
        queryParams.append('minValue', filters.minValue.toString());
      }
      
      if (filters.maxValue !== undefined) {
        queryParams.append('maxValue', filters.maxValue.toString());
      }
      
      if (filters.dueDateFrom) {
        queryParams.append('dueDateFrom', filters.dueDateFrom);
      }
      
      if (filters.dueDateTo) {
        queryParams.append('dueDateTo', filters.dueDateTo);
      }
      
      if (filters.assignedUserIds && filters.assignedUserIds.length > 0) {
        queryParams.append('assignedUserIds', filters.assignedUserIds.join(','));
      }
      
      if (filters.includeUnassigned) {
        queryParams.append('includeUnassigned', 'true');
      }
      
      if (filters.tags && filters.tags.length > 0) {
        queryParams.append('tags', filters.tags.join(','));
      }
      
      if (filters.status) {
        queryParams.append('status', filters.status);
      }
      
      if (filters.createdFrom) {
        queryParams.append('createdFrom', filters.createdFrom);
      }
      
      if (filters.createdTo) {
        queryParams.append('createdTo', filters.createdTo);
      }
      
      if (filters.customFields && Object.keys(filters.customFields).length > 0) {
        queryParams.append('customFields', JSON.stringify(filters.customFields));
      }
      
      queryParams.append('includeReverts', 'true');

      const url = `/api/deals${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await apiRequest('GET', url);
      return res.json();
    },
    enabled: !!activePipelineId,
    staleTime: 0,
    refetchOnMount: 'always',
  });


  useEffect(() => {
    if (activePipelineId) {
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages', activePipelineId] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals', filters, activePipelineId] });
    }
  }, [activePipelineId, queryClient]);

  const { data: revertStats } = useQuery({
    queryKey: ['/api/pipeline-reverts/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipeline-reverts/stats');
      return res.json();
    },
  });


  const {
    data: users = [],
  } = useQuery({
    queryKey: ['/api/team-members'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return res.json();
    },
  });

  const organizedDeals = useMemo(() => {
    if (!pipelineStages || pipelineStages.length === 0) return {};

    const newOrganizedDeals: Record<number, Deal[]> = {};

    pipelineStages.forEach((stage: PipelineStage) => {
      newOrganizedDeals[stage.id] = [];
    });

    if (deals && Array.isArray(deals) && deals.length > 0) {
      deals.forEach((deal: Deal) => {
        if (deal.stageId && newOrganizedDeals[deal.stageId]) {
          newOrganizedDeals[deal.stageId].push(deal);
        }
      });
    }

    return newOrganizedDeals;
  }, [deals, pipelineStages]);

  const [optimisticDeals, setOptimisticDeals] = useState<Record<number, Deal[]>>({});
  const [isDragging, setIsDragging] = useState(false);

  const createStageMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      if (!activePipelineId) {
        throw new Error('No active pipeline selected');
      }
      const response = await apiRequest('POST', '/api/pipeline/stages', {
        name,
        color,
        order: pipelineStages.length + 1,
        pipelineId: activePipelineId,
      });
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setNewStageName('');
      setNewStageColor('#3a86ff');
      setIsAddingStage(false);


      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      queryClient.refetchQueries({ queryKey: ['/api/pipeline/stages'] });


      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });

      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.stage_created_success', 'Stage created successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.stage_create_failed', 'Failed to create stage: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: number; name: string; color: string }) => {
      const response = await apiRequest('PUT', `/api/pipeline/stages/${id}`, { name, color });
      return response.json();
    },
    onSuccess: () => {
      setEditingStageId(null);
      setEditedStageName('');
      setEditedStageColor('');
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.stage_updated_success', 'Stage updated successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.stage_update_failed', 'Failed to update stage: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async ({ id, moveToStageId }: { id: number; moveToStageId?: number }) => {
      const url = `/api/pipeline/stages/${id}${moveToStageId ? `?moveToStageId=${moveToStageId}` : ''}`;
      const response = await apiRequest('DELETE', url);
      return response.ok;
    },
    onSuccess: () => {
      setShowDeleteDialog(false);
      setStageToDelete(null);
      setTargetStageId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.stage_deleted_success', 'Stage deleted successfully'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.stage_delete_failed', 'Failed to delete stage: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const updateDealStageMutation = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: number, stageId: number }) => {
      const response = await apiRequest('PATCH', `/api/deals/${dealId}/stageId`, { stageId });
      return response.json();
    },
    onSuccess: () => {
      setOptimisticDeals({});
      setIsDragging(false);
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
    },
    onError: (error: Error) => {

      setOptimisticDeals({});
      setIsDragging(false);
      

      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_update_failed', 'Failed to update deal stage: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleAddStage = () => {
    if (!newStageName.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.stage_name_required', 'Stage name cannot be empty'),
        variant: 'destructive',
      });
      return;
    }

    createStageMutation.mutate({ name: newStageName, color: newStageColor });
  };

  const handleEditStage = (stage: PipelineStage) => {
    setEditingStageId(stage.id);
    setEditedStageName(stage.name);
    setEditedStageColor(stage.color);
  };

  const handleUpdateStage = (id: number) => {
    if (!editedStageName.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.stage_name_required', 'Stage name cannot be empty'),
        variant: 'destructive',
      });
      return;
    }

    updateStageMutation.mutate({ id, name: editedStageName, color: editedStageColor });
  };

  const handleCancelEdit = () => {
    setEditingStageId(null);
    setEditedStageName('');
    setEditedStageColor('');
  };

  const handleDeleteStage = (stage: PipelineStage) => {
    setStageToDelete(stage);
    setShowDeleteDialog(true);
  };

  const confirmDeleteStage = () => {
    if (!stageToDelete) return;

    deleteStageMutation.mutate({
      id: stageToDelete.id,
      moveToStageId: targetStageId || undefined
    });
  };

  const currentDeals = Object.keys(optimisticDeals).length > 0 ? optimisticDeals : organizedDeals;

  const handleDragStart = (start: any) => {
    setIsDragging(true);
  };

  const handleDragEnd = (result: any) => {
    const { destination, source, draggableId } = result;
    

    setIsDragging(false);


    if (!destination) {
      setOptimisticDeals({});
      return;
    }


    if (destination.droppableId === source.droppableId &&
        destination.index === source.index) {
      setOptimisticDeals({});
      return;
    }

    const dealId = parseInt(draggableId);
    const sourceStageId = parseInt(source.droppableId);
    const destinationStageId = parseInt(destination.droppableId);


    const deal = organizedDeals[sourceStageId]?.find(d => d.id === dealId);
    if (!deal) {
      console.warn(`Deal ${dealId} not found in source stage ${sourceStageId}`);
      setOptimisticDeals({});
      return;
    }

    if (sourceStageId !== destinationStageId) {

      const newOptimisticDeals = { ...organizedDeals };
      

      if (!newOptimisticDeals[sourceStageId] || !newOptimisticDeals[destinationStageId]) {
        console.warn(`Invalid stage IDs: source ${sourceStageId}, destination ${destinationStageId}`);
        setOptimisticDeals({});
        return;
      }


      newOptimisticDeals[sourceStageId] = newOptimisticDeals[sourceStageId].filter(d => d.id !== dealId);


      const updatedDeal = { ...deal, stageId: destinationStageId };
      const destinationDeals = [...newOptimisticDeals[destinationStageId]];
      const insertIndex = Math.min(destination.index, destinationDeals.length);
      destinationDeals.splice(insertIndex, 0, updatedDeal);
      newOptimisticDeals[destinationStageId] = destinationDeals;

      setOptimisticDeals(newOptimisticDeals);


      updateDealStageMutation.mutate({ dealId, stageId: destinationStageId });
    } else {

      const newOptimisticDeals = { ...organizedDeals };
      const stageDeals = [...newOptimisticDeals[sourceStageId]];
      const [removed] = stageDeals.splice(source.index, 1);
      stageDeals.splice(destination.index, 0, removed);
      newOptimisticDeals[sourceStageId] = stageDeals;
      setOptimisticDeals(newOptimisticDeals);
      

      setTimeout(() => setOptimisticDeals({}), 100);
    }
  };

  const handleDragUpdate = (update: any) => {


  };


  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline-reverts/stats'] });
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [queryClient]);

  const isLoading = isLoadingStages || isLoadingDeals;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl">{t('nav.pipeline', 'Pipeline')}</h1>
          {revertStats && revertStats.totalScheduled > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/20 border-orange-300">
                    <Clock className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">{revertStats.totalScheduled} revert{revertStats.totalScheduled !== 1 ? 's' : ''} scheduled</span>
                    <span className="sm:hidden">{revertStats.totalScheduled}</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-semibold">Pipeline Stage Revert Statistics</p>
                    <p>Scheduled: {revertStats.totalScheduled}</p>
                    <p>Executed: {revertStats.totalExecuted}</p>
                    <p>Failed: {revertStats.totalFailed}</p>
                    <p>Skipped: {revertStats.totalSkipped}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={showSelectionMode ? "default" : "outline"}
            size="sm"
            onClick={handleToggleSelectionMode}
            className="flex items-center gap-1 flex-1 sm:flex-initial"
          >
            <CheckSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{showSelectionMode ? 'Exit Selection' : 'Select Deals'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportExportModal(true)}
            className="flex items-center gap-1 flex-1 sm:flex-initial"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Import/Export</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingStage(true)}
            className="flex items-center gap-1 flex-1 sm:flex-initial"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('pipeline.add_stage', 'Add Stage')}</span>
          </Button>
          <Button 
            onClick={onAddDeal} 
            className="flex items-center gap-1 btn-brand-primary flex-1 sm:flex-initial"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">{t('pipeline.add_deal', 'Add Deal')}</span>
          </Button>
        </div>
      </div>

      {!activePipelineId ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">No pipeline selected. Please select a pipeline to view stages and deals.</p>
        </div>
      ) : isLoading ? (
        <PipelineLoadingSkeleton />
      ) : (
        <>
          {pipelineStages.length === 0 ? (
            <EmptyPipelineState 
              onAddDeal={onAddDeal}
              onAddStage={() => setIsAddingStage(true)}
            />
          ) : (
            <DragDropContext 
              onDragStart={handleDragStart} 
              onDragUpdate={handleDragUpdate}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 h-full overflow-hidden">
                {pipelineStages.map((stage: PipelineStage) => (
                  <div key={stage.id} className="flex flex-col h-full">
                    <StageHeader
                      stage={stage}
                      deals={currentDeals[stage.id] || []}
                      onEditStage={handleEditStage}
                      onDeleteStage={handleDeleteStage}
                    />
                    <Droppable droppableId={stage.id.toString()}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 p-2 rounded-md shadow-sm border transition-colors ${
                            snapshot.isDraggingOver 
                              ? 'bg-primary/10 border-primary/30' 
                              : 'bg-muted/50 border-border'
                          }`}
                          style={{
                            minHeight: '60vh',
                            maxHeight: '70vh',
                            overflowY: 'auto',
                          }}
                        >
                          {currentDeals[stage.id]?.length === 0 ? (
                            <EmptyStageState 
                              stageName={stage.name}
                              onAddDeal={onAddDeal}
                            />
                          ) : (
                            currentDeals[stage.id]?.map((deal, index) => (
                              <Draggable key={deal.id} draggableId={deal.id.toString()} index={index}>
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={snapshot.isDragging ? 'shadow-lg' : ''}
                                    style={provided.draggableProps.style}
                                  >
                                    <DealCard 
                                      deal={deal}
                                      isSelected={selectedDeals.some(d => d.id === deal.id)}
                                      onSelect={handleDealSelect}
                                      showSelectionMode={showSelectionMode}
                                      searchTerm={filters.searchTerm || ''}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>
          )}
        </>
      )}

      <Dialog open={isAddingStage} onOpenChange={setIsAddingStage}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.add_stage_title', 'Add Pipeline Stage')}</DialogTitle>
            <DialogDescription>
              {t('pipeline.add_stage_description', 'Create a new stage for your pipeline. Stages help organize your deals and track their progress.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('pipeline.stage_name', 'Stage Name')}</Label>
              <Input
                id="name"
                placeholder={t('pipeline.stage_name_placeholder', 'e.g., Discovery, Negotiation, Proposal')}
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">{t('pipeline.stage_color', 'Stage Color')}</Label>
              <div className="flex flex-wrap gap-2">
                {stageColors.map((color) => (
                  <div
                    key={color}
                    className={`w-8 h-8 rounded-full cursor-pointer border-2 ${newStageColor === color ? 'border-black dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewStageColor(color)}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center">
                <div className="w-6 h-6 rounded-full mr-2" style={{ backgroundColor: newStageColor }} />
                <span className="text-sm">{newStageColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddingStage(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleAddStage}>
              {t('pipeline.create_stage', 'Create Stage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingStageId} onOpenChange={(open) => !open && setEditingStageId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.edit_stage_title', 'Edit Pipeline Stage')}</DialogTitle>
            <DialogDescription>
              {t('pipeline.edit_stage_description', 'Update the stage name and color.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('pipeline.stage_name', 'Stage Name')}</Label>
              <Input
                id="edit-name"
                placeholder={t('pipeline.stage_name_placeholder', 'e.g., Discovery, Negotiation, Proposal')}
                value={editedStageName}
                onChange={(e) => setEditedStageName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-color">{t('pipeline.stage_color', 'Stage Color')}</Label>
              <div className="flex flex-wrap gap-2">
                {stageColors.map((color) => (
                  <div
                    key={color}
                    className={`w-8 h-8 rounded-full cursor-pointer border-2 ${editedStageColor === color ? 'border-black dark:border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setEditedStageColor(color)}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center">
                <div className="w-6 h-6 rounded-full mr-2" style={{ backgroundColor: editedStageColor }} />
                <span className="text-sm">{editedStageColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button className="btn-brand-primary" onClick={() => editingStageId && handleUpdateStage(editingStageId)}>
              {t('pipeline.update_stage', 'Update Stage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.delete_stage_title', 'Delete Pipeline Stage')}</DialogTitle>
            <DialogDescription>
              {stageToDelete && currentDeals[stageToDelete.id]?.length > 0 ? (
                <>
                  {t('pipeline.stage_contains_deals', 'This stage contains {{count}} deals. Where would you like to move them?', { count: currentDeals[stageToDelete.id]?.length })}
                </>
              ) : (
                <>
                  {t('pipeline.delete_stage_confirmation', 'Are you sure you want to delete this stage? This action cannot be undone.')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {stageToDelete && currentDeals[stageToDelete.id]?.length > 0 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="targetStage">{t('pipeline.move_deals_to', 'Move deals to')}</Label>
                <select
                  id="targetStage"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={targetStageId || ""}
                  onChange={(e) => setTargetStageId(parseInt(e.target.value))}
                >
                  <option value="">{t('pipeline.select_stage', 'Select a stage')}</option>
                  {pipelineStages
                    .filter((s: PipelineStage) => stageToDelete && s.id !== stageToDelete.id)
                    .map((stage: PipelineStage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                </select>
              </div>

              {!targetStageId && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t('pipeline.select_target_stage_warning', 'You must select a target stage or the deals in this stage will be lost.')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false);
              setStageToDelete(null);
              setTargetStageId(null);
            }}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteStage}
              disabled={!!stageToDelete && currentDeals[stageToDelete.id]?.length > 0 && !targetStageId}
            >
              {t('pipeline.delete_stage', 'Delete Stage')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Import/Export Modal */}
      <ImportExportModal
        isOpen={showImportExportModal}
        onClose={() => setShowImportExportModal(false)}
      />
      
      {/* Bulk Operations Bar */}
      <BulkOperationsBar
        selectedDeals={selectedDeals}
        stages={pipelineStages}
        users={users}
        onClearSelection={handleClearSelection}
        onUpdateDeals={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
        }}
      />
    </div>
  );
}