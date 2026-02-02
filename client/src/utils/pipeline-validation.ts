import { Pipeline, PipelineStage } from '@shared/schema';

/**
 * Validate pipeline name uniqueness within company
 */
export function validatePipelineNameUniqueness(
  name: string,
  pipelines: Pipeline[],
  excludePipelineId?: number
): { isValid: boolean; error?: string } {
  const normalizedName = name.trim().toLowerCase();
  const duplicate = pipelines.find(
    (p) =>
      p.name.trim().toLowerCase() === normalizedName &&
      p.id !== excludePipelineId
  );
  
  if (duplicate) {
    return {
      isValid: false,
      error: `A pipeline with the name "${name}" already exists`,
    };
  }
  
  return { isValid: true };
}

/**
 * Validate stage belongs to selected pipeline
 */
export function validateStageBelongsToPipeline(
  stageId: number,
  pipelineId: number,
  stages: PipelineStage[]
): { isValid: boolean; error?: string } {
  const stage = stages.find((s) => s.id === stageId);
  
  if (!stage) {
    return {
      isValid: false,
      error: 'Stage not found',
    };
  }
  
  if (stage.pipelineId !== pipelineId) {
    return {
      isValid: false,
      error: 'Stage does not belong to the selected pipeline',
    };
  }
  
  return { isValid: true };
}

/**
 * Validate pipeline exists
 */
export function validatePipelineExists(
  pipelineId: number,
  pipelines: Pipeline[]
): { isValid: boolean; error?: string; pipeline?: Pipeline } {
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  
  if (!pipeline) {
    return {
      isValid: false,
      error: 'Pipeline not found',
    };
  }
  
  return { isValid: true, pipeline };
}

/**
 * Validate at least one pipeline exists (prevent deleting last pipeline)
 */
export function validateAtLeastOnePipeline(
  pipelines: Pipeline[],
  pipelineToDeleteId?: number
): { isValid: boolean; error?: string } {
  const remainingPipelines = pipelines.filter(
    (p) => p.id !== pipelineToDeleteId
  );
  
  if (remainingPipelines.length === 0) {
    return {
      isValid: false,
      error: 'Cannot delete the last pipeline. At least one pipeline must exist.',
    };
  }
  
  return { isValid: true };
}

/**
 * Validate default pipeline cannot be deleted without reassigning default
 */
export function validateDefaultPipelineDeletion(
  pipeline: Pipeline,
  pipelines: Pipeline[]
): { isValid: boolean; error?: string } {
  if (!pipeline.isDefault) {
    return { isValid: true };
  }
  
  const otherPipelines = pipelines.filter((p) => p.id !== pipeline.id);
  
  if (otherPipelines.length === 0) {
    return {
      isValid: false,
      error: 'Cannot delete the default pipeline when it is the only pipeline',
    };
  }
  
  const hasOtherDefault = otherPipelines.some((p) => p.isDefault);
  
  if (!hasOtherDefault) {
    return {
      isValid: false,
      error: 'Cannot delete the default pipeline. Please set another pipeline as default first.',
    };
  }
  
  return { isValid: true };
}
