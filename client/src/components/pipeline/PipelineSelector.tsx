import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Settings, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/use-translation';

interface Pipeline {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
}

interface PipelineSelectorProps {
  activePipelineId: number | null;
  pipelines: Pipeline[];
  onPipelineChange: (pipelineId: number) => void;
  onManagePipelines: () => void;
  isLoading?: boolean;
}

export default function PipelineSelector({
  activePipelineId,
  pipelines,
  onPipelineChange,
  onManagePipelines,
  isLoading = false,
}: PipelineSelectorProps) {
  const { t } = useTranslation();
  const activePipeline = pipelines.find(p => p.id === activePipelineId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">{t('pipeline.loading_pipelines', 'Loading pipelines...')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activePipelineId?.toString() || ''}
        onValueChange={(value) => onPipelineChange(parseInt(value))}
      >
        <SelectTrigger className="w-[300px]">
          <SelectValue>
            {activePipeline ? (
              <div className="flex items-center gap-2">
                {activePipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: activePipeline.color }}
                  />
                )}
                <span className="truncate">{activePipeline.name}</span>
                {activePipeline.isDefault && (
                  <Badge variant="secondary" className="ml-1 text-xs">{t('pipeline.default', 'Default')}</Badge>
                )}
              </div>
            ) : (
              t('pipeline.select_pipeline', 'Select pipeline')
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-[300px]">
          {pipelines.map((pipeline) => (
            <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
              <div className="flex items-center gap-2">
                {pipeline.color && (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: pipeline.color }}
                  />
                )}
                <span>{pipeline.name}</span>
                {pipeline.isDefault && (
                  <Badge variant="secondary" className="ml-1 text-xs">{t('pipeline.default', 'Default')}</Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onManagePipelines}
        className="flex items-center gap-1"
      >
        <Settings className="h-4 w-4" />
        {t('pipeline.manage', 'Manage')}
      </Button>
    </div>
  );
}
