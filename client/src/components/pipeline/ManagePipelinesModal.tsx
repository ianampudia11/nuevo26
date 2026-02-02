import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Edit2, Trash2, GripVertical, Plus, Star } from 'lucide-react';
import CreatePipelineModal from './CreatePipelineModal';
import EditPipelineModal from './EditPipelineModal';

interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  orderNum: number;
}

interface ManagePipelinesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManagePipelinesModal({
  isOpen,
  onClose,
}: ManagePipelinesModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines, setActivePipelineId, activePipelineId } = usePipeline();
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null);
  const [targetStageId, setTargetStageId] = useState<number | null>(null);

  const deletePipelineMutation = useMutation({
    mutationFn: async ({ pipelineId, moveDealsToStageId }: { pipelineId: number; moveDealsToStageId?: number }) => {
      const url = moveDealsToStageId
        ? `/api/pipelines/${pipelineId}?moveDealsToStageId=${moveDealsToStageId}`
        : `/api/pipelines/${pipelineId}`;
      const response = await apiRequest('DELETE', url);
      return response.json();
    },
    onSuccess: () => {
      const deletedPipelineId = pipelineToDelete?.id;
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.pipeline_deleted_success', 'Pipeline deleted successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setPipelineToDelete(null);
      setTargetStageId(null);
      

      if (deletedPipelineId && deletedPipelineId === activePipelineId) {
        const remainingPipelines = pipelines.filter(p => p.id !== deletedPipelineId);
        if (remainingPipelines.length > 0) {
          const defaultPipeline = remainingPipelines.find(p => p.isDefault) || remainingPipelines[0];
          if (defaultPipeline) {
            setActivePipelineId(defaultPipeline.id);
          }
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_delete_failed', 'Failed to delete pipeline: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const setDefaultPipelineMutation = useMutation({
    mutationFn: async (pipelineId: number) => {
      const response = await apiRequest('PUT', `/api/pipelines/${pipelineId}`, {
        isDefault: true,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.default_pipeline_updated', 'Default pipeline updated'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.default_pipeline_update_failed', 'Failed to set default pipeline: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const reorderPipelinesMutation = useMutation({
    mutationFn: async (reorderedPipelines: Pipeline[]) => {
      const updates = reorderedPipelines.map((pipeline, index) => ({
        id: pipeline.id,
        orderNum: index + 1,
      }));
      const response = await apiRequest('PUT', '/api/pipelines/reorder', { pipelines: updates });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.reorder_failed', 'Failed to reorder pipelines: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(pipelines);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    reorderPipelinesMutation.mutate(items);
  };


  const { data: pipelineDeals = [] } = useQuery({
    queryKey: ['/api/deals', pipelineToDelete?.id],
    queryFn: async () => {
      if (!pipelineToDelete) return [];
      const queryParams = new URLSearchParams();
      queryParams.append('pipelineId', pipelineToDelete.id.toString());
      const res = await apiRequest('GET', `/api/deals?${queryParams.toString()}`);
      return res.json();
    },
    enabled: !!pipelineToDelete,
  });


  const { data: otherPipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', pipelineToDelete?.id],
    queryFn: async () => {
      if (!pipelineToDelete) return [];
      const otherPipelines = pipelines.filter(p => p.id !== pipelineToDelete.id);
      if (otherPipelines.length === 0) return [];
      

      const stagesPromises = otherPipelines.map(async (pipeline) => {
        try {
          const queryParams = new URLSearchParams();
          queryParams.append('pipelineId', pipeline.id.toString());
          const res = await apiRequest('GET', `/api/pipeline/stages?${queryParams.toString()}`);
          if (!res.ok) return []; // Return empty array on error
          const stages = await res.json();
          return stages.map((stage: any) => ({
            ...stage,
            pipelineName: pipeline.name,
          }));
        } catch (error) {
          console.warn(`Failed to fetch stages for pipeline ${pipeline.id}:`, error);
          return []; // Return empty array on error
        }
      });
      
      const allStages = await Promise.allSettled(stagesPromises);
      return allStages
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
        .map(result => result.value)
        .flat();
    },
    enabled: !!pipelineToDelete && pipelines.length > 1,
    retry: false, // Don't retry failed requests
  });

  const handleDelete = (pipeline: Pipeline) => {
    if (pipeline.isDefault) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.cannot_delete_default', 'Cannot delete the default pipeline. Please set another pipeline as default first.'),
        variant: 'destructive',
      });
      return;
    }
    setPipelineToDelete(pipeline);
    setTargetStageId(null);
  };

  const confirmDelete = () => {
    if (!pipelineToDelete) return;
    
    const hasDeals = pipelineDeals && pipelineDeals.length > 0;
    
    if (hasDeals) {
      if (!targetStageId) {
        toast({
          title: t('common.error', 'Error'),
          description: t('pipeline.please_select_target_stage', 'Please select a target stage to move deals to before deleting this pipeline.'),
          variant: 'destructive',
        });
        return;
      }
      
      if (otherPipelineStages.length === 0) {
        toast({
          title: t('common.error', 'Error'),
          description: t('pipeline.cannot_delete_with_deals', 'Cannot delete pipeline with deals. No other pipelines available to move deals to.'),
          variant: 'destructive',
        });
        return;
      }
    }
    
    deletePipelineMutation.mutate({
      pipelineId: pipelineToDelete.id,
      moveDealsToStageId: hasDeals ? (targetStageId ?? undefined) : undefined,
    });
  };

  const handleSetDefault = (pipeline: Pipeline) => {
    setDefaultPipelineMutation.mutate(pipeline.id);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{t('pipeline.manage_pipelines', 'Manage Pipelines')}</DialogTitle>
                <DialogDescription>
                  {t('pipeline.create_edit_organize', 'Create, edit, and organize your pipelines')}
                </DialogDescription>
              </div>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                size="sm"
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                {t('pipeline.create_new', 'Create New')}
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] overflow-y-auto">
            {pipelines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t('pipeline.no_pipelines_yet', 'No pipelines yet. Create your first pipeline to get started.')}</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="pipelines">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {pipelines.map((pipeline, index) => (
                        <Draggable
                          key={pipeline.id}
                          draggableId={pipeline.id.toString()}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-3 p-3 rounded-lg border bg-card ${
                                snapshot.isDragging ? 'shadow-lg' : ''
                              }`}
                            >
                              <div {...provided.dragHandleProps} className="cursor-grab">
                                <GripVertical className="h-5 w-5 text-muted-foreground" />
                              </div>
                              {pipeline.color && (
                                <div
                                  className="w-4 h-4 rounded-full"
                                  style={{ backgroundColor: pipeline.color }}
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{pipeline.name}</span>
                                  {pipeline.isDefault && (
                                    <Badge variant="secondary" className="text-xs">
                                      <Star className="h-3 w-3 mr-1" />
                                      {t('pipeline.default', 'Default')}
                                    </Badge>
                                  )}
                                </div>
                                {pipeline.description && (
                                  <p className="text-sm text-muted-foreground">
                                    {pipeline.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {!pipeline.isDefault && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSetDefault(pipeline)}
                                    title={t('pipeline.set_as_default', 'Set as default')}
                                  >
                                    <Star className="h-4 w-4" />
                                  </Button>
                                )}
                               
                  
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingPipeline(pipeline)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(pipeline)}
                                  disabled={pipeline.isDefault}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>

          {pipelineToDelete && (
            <Dialog open={!!pipelineToDelete} onOpenChange={() => {
              setPipelineToDelete(null);
              setTargetStageId(null);
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('pipeline.delete_pipeline', 'Delete Pipeline')}</DialogTitle>
                  <DialogDescription>
                    {t('pipeline.delete_pipeline_confirmation', 'Are you sure you want to delete "{{name}}"? This action cannot be undone.', { name: pipelineToDelete.name })}
                    {pipelineDeals && pipelineDeals.length > 0 && (
                      <span className="block mt-2 text-destructive font-medium">
                        {t('pipeline.pipeline_has_deals', 'This pipeline has {{count}} deal(s). You must select a target stage from another pipeline to move them to.', { count: pipelineDeals.length })}
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                {pipelineDeals && pipelineDeals.length > 0 && (
                  <div className="space-y-2 py-4">
                    <Label htmlFor="target-stage">{t('pipeline.move_deals_to_stage', 'Move deals to stage')} *</Label>
                    {otherPipelineStages.length === 0 ? (
                      <p className="text-sm text-destructive">
                        {t('pipeline.no_other_pipelines_available', 'No other pipelines available. Cannot delete pipeline with deals.')}
                      </p>
                    ) : (
                      <Select
                        value={targetStageId?.toString() || ''}
                        onValueChange={(value) => setTargetStageId(parseInt(value))}
                      >
                        <SelectTrigger id="target-stage">
                          <SelectValue placeholder={t('pipeline.select_stage_from_another_pipeline', 'Select a stage from another pipeline')} />
                        </SelectTrigger>
                        <SelectContent>
                          {otherPipelineStages.map((stage: any) => (
                            <SelectItem key={stage.id} value={stage.id.toString()}>
                              {stage.pipelineName} - {stage.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPipelineToDelete(null);
                      setTargetStageId(null);
                    }}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDelete}
                    disabled={deletePipelineMutation.isPending || (pipelineDeals && pipelineDeals.length > 0 && !targetStageId)}
                  >
                    {deletePipelineMutation.isPending ? t('pipeline.deleting', 'Deleting...') : t('pipeline.delete', 'Delete')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('pipeline.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreatePipelineModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {editingPipeline && (
        <EditPipelineModal
          isOpen={!!editingPipeline}
          onClose={() => setEditingPipeline(null)}
          pipeline={editingPipeline}
        />
      )}
    </>
  );
}
