import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { Deal } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePipeline } from '@/hooks/use-pipeline';
import { useTranslation } from '@/hooks/use-translation';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface MoveDealToPipelineModalProps {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function MoveDealToPipelineModal({ deal, isOpen, onClose }: MoveDealToPipelineModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pipelines } = usePipeline();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [selectedStageId, setSelectedStageId] = useState<string>('');

  const currentPipeline = deal?.pipelineId ? pipelines.find(p => p.id === deal.pipelineId) : null;


  const { data: contactDeals = [] } = useQuery({
    queryKey: ['/api/deals/contact', deal?.contactId],
    queryFn: () => {
      if (!deal?.contactId) return Promise.resolve([]);
      return apiRequest('GET', `/api/deals/contact/${deal.contactId}`).then(res => res.json());
    },
    enabled: !!deal?.contactId && isOpen,
  });


  const blockedPipelineIds = new Set<number>();
  if (contactDeals && deal) {
    contactDeals.forEach((contactDeal: Deal) => {
      if (contactDeal.status === 'active' && contactDeal.id !== deal.id && contactDeal.pipelineId) {
        blockedPipelineIds.add(contactDeal.pipelineId);
      }
    });
  }

  const { data: pipelineStages = [] } = useQuery({
    queryKey: ['/api/pipeline/stages', selectedPipelineId],
    queryFn: () => {
      const url = `/api/pipeline/stages?pipelineId=${selectedPipelineId}`;
      return apiRequest('GET', url).then(res => res.json());
    },
    enabled: !!selectedPipelineId && isOpen,
  });

  useEffect(() => {
    if (!isOpen) {
      setSelectedPipelineId('');
      setSelectedStageId('');
    }
  }, [isOpen]);

  const moveDealMutation = useMutation({
    mutationFn: async ({ dealId, targetPipelineId, targetStageId }: { dealId: number; targetPipelineId: number; targetStageId: number }) => {
      const response = await apiRequest('POST', `/api/deals/${dealId}/move-pipeline`, {
        targetPipelineId,
        targetStageId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.deal_moved_success', 'Deal moved to new pipeline successfully'),
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.deal_move_failed', 'Failed to move deal: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleMove = () => {
    if (!deal || !selectedPipelineId || !selectedStageId) return;

    moveDealMutation.mutate({
      dealId: deal.id,
      targetPipelineId: parseInt(selectedPipelineId),
      targetStageId: parseInt(selectedStageId)
    });
  };


  const availablePipelines = pipelines.filter(p => 
    p.id !== deal?.pipelineId && !blockedPipelineIds.has(p.id)
  );

  if (!deal) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.move_deal_to_another_pipeline', 'Move Deal to Another Pipeline')}</DialogTitle>
          <DialogDescription>
            {t('pipeline.select_target_pipeline_stage_deal', 'Select the target pipeline and stage for this deal.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Pipeline Display */}
          {currentPipeline && (
            <div className="p-3 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">{t('pipeline.current_pipeline', 'Current Pipeline')}</p>
              <div className="flex items-center gap-2">
                {currentPipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: currentPipeline.color }}
                  />
                )}
                <Badge variant="secondary">{currentPipeline.name}</Badge>
              </div>
            </div>
          )}

          {/* Pipeline Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pipeline.target_pipeline', 'Target Pipeline')}</label>
            <Select
              value={selectedPipelineId}
              onValueChange={(value) => {
                setSelectedPipelineId(value);
                setSelectedStageId(''); // Reset stage when pipeline changes
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('pipeline.select_pipeline', 'Select a pipeline')} />
              </SelectTrigger>
              <SelectContent>
                {availablePipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                    <div className="flex items-center gap-2">
                      {pipeline.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: pipeline.color }}
                        />
                      )}
                      {pipeline.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stage Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('pipeline.target_stage', 'Target Stage')}</label>
            <Select
              value={selectedStageId}
              onValueChange={setSelectedStageId}
              disabled={!selectedPipelineId}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedPipelineId ? t('pipeline.select_stage', 'Select a stage') : t('pipeline.select_pipeline_first', 'Select pipeline first')} />
              </SelectTrigger>
              <SelectContent>
                {pipelineStages.map((stage: any) => (
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

          {/* Visual Indicator */}
          {currentPipeline && selectedPipelineId && (
            <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/10">
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1">
                  {currentPipeline.color && (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: currentPipeline.color }}
                    />
                  )}
                  <span className="font-medium">{currentPipeline.name}</span>
                </div>
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-1">
                  {(() => {
                    const targetPipeline = pipelines.find(p => p.id === parseInt(selectedPipelineId));
                    return targetPipeline?.color && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: targetPipeline.color }}
                      />
                    );
                  })()}
                  <span className="font-medium">
                    {pipelines.find(p => p.id === parseInt(selectedPipelineId))?.name}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleMove}
            disabled={!selectedPipelineId || !selectedStageId || moveDealMutation.isPending}
          >
            {moveDealMutation.isPending ? (
              <>{t('pipeline.moving', 'Moving...')}</>
            ) : (
              <>
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                {t('pipeline.move_deal', 'Move Deal')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
