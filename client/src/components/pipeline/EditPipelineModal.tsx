import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2 } from 'lucide-react';

interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
}

interface EditPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipeline: Pipeline;
}

const PIPELINE_COLORS = [
  '#3a86ff', '#10b981', '#8b5cf6', '#06b6d4', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#a855f7',
];

export default function EditPipelineModal({
  isOpen,
  onClose,
  pipeline,
}: EditPipelineModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('#3a86ff');
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');

  const { data: pipelineStats } = useQuery({
    queryKey: ['/api/pipelines', pipeline.id, 'stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/pipelines/${pipeline.id}/stats`);
      return res.json();
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name);
      setDescription(pipeline.description || '');
      setIcon(pipeline.icon || '');
      setColor(pipeline.color || '#3a86ff');
      setDuplicateName(`${pipeline.name} Copy`);
    }
  }, [pipeline, isOpen]);

  const updatePipelineMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PUT', `/api/pipelines/${pipeline.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.pipeline_updated_success', 'Pipeline updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_update_failed', 'Failed to update pipeline: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const duplicatePipelineMutation = useMutation({
    mutationFn: async (newName: string) => {
      const response = await apiRequest('POST', `/api/pipelines/${pipeline.id}/duplicate`, {
        newName,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('common.success', 'Success'),
        description: t('pipeline.pipeline_duplicated_success', 'Pipeline duplicated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pipeline/stages'] });
      setIsDuplicateDialogOpen(false);
      setDuplicateName(`${pipeline.name} Copy`);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_duplicate_failed', 'Failed to duplicate pipeline: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pipeline.pipeline_name_required', 'Pipeline name is required'),
        variant: 'destructive',
      });
      return;
    }

    updatePipelineMutation.mutate({
      name,
      description,
      icon,
      color,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.edit_pipeline', 'Edit Pipeline')}</DialogTitle>
          <DialogDescription>
            {t('pipeline.update_pipeline_details', 'Update pipeline details and settings')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('pipeline.pipeline_name', 'Pipeline Name')} *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('pipeline.pipeline_name_placeholder', 'e.g., Sales Pipeline')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">{t('pipeline.pipeline_description', 'Description')}</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('pipeline.describe_pipeline', 'Describe what this pipeline is for...')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-icon">{t('pipeline.icon', 'Icon')}</Label>
            <Input
              id="edit-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder={t('pipeline.icon_placeholder', 'e.g., TrendingUp, Users')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('pipeline.color', 'Color')}</Label>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    color === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <div
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm">{color}</span>
            </div>
          </div>

          {pipelineStats && (
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <p className="text-sm font-medium">{t('pipeline.pipeline_statistics', 'Pipeline Statistics')}</p>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>{t('pipeline.stages_count', '{{count}} stages', { count: pipelineStats.stageCount || 0 })}</span>
                <span>{t('pipeline.deals_count', '{{count}} deals', { count: pipelineStats.dealCount || 0 })}</span>
              </div>
            </div>
          )}

          {pipeline.isDefault && (
            <Badge variant="secondary" className="w-full justify-center py-2">
              {t('pipeline.this_is_default', 'This is the default pipeline')}
            </Badge>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setIsDuplicateDialogOpen(true)}
            disabled={duplicatePipelineMutation.isPending}
            className="flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            {t('pipeline.duplicate_pipeline', 'Duplicate Pipeline')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updatePipelineMutation.isPending}
            >
              {updatePipelineMutation.isPending ? t('pipeline.updating', 'Updating...') : t('pipeline.update_pipeline', 'Update Pipeline')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pipeline.duplicate_pipeline', 'Duplicate Pipeline')}</DialogTitle>
            <DialogDescription>
              {t('pipeline.enter_name_for_duplicate', 'Enter a name for the duplicated pipeline')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-name">{t('pipeline.pipeline_name', 'Pipeline Name')} *</Label>
              <Input
                id="duplicate-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder={t('pipeline.pipeline_name_copy', 'e.g., Sales Pipeline Copy')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && duplicateName.trim()) {
                    duplicatePipelineMutation.mutate(duplicateName.trim());
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDuplicateDialogOpen(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!duplicateName.trim()) {
                  toast({
                    title: t('common.error', 'Error'),
                    description: t('pipeline.pipeline_name_required', 'Pipeline name is required'),
                    variant: 'destructive',
                  });
                  return;
                }
                duplicatePipelineMutation.mutate(duplicateName.trim());
              }}
              disabled={duplicatePipelineMutation.isPending}
            >
              {duplicatePipelineMutation.isPending ? t('pipeline.duplicating', 'Duplicating...') : t('pipeline.duplicate', 'Duplicate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
