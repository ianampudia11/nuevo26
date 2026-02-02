import { pipelines, pipelineStages } from '@shared/schema';

export type Pipeline = typeof pipelines.$inferSelect;
export type PipelineStage = typeof pipelineStages.$inferSelect;

export interface PipelineWithStages extends Pipeline {
  stages: PipelineStage[];
}

export interface PipelineSelectorProps {
  activePipelineId: number | null;
  pipelines: Pipeline[];
  onPipelineChange: (pipelineId: number) => void;
  onManagePipelines: () => void;
  isLoading?: boolean;
}

export interface PipelineTemplateConfig {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  stages: Array<{
    name: string;
    color: string;
    order: number;
  }>;
}
