import { storage } from './storage';
import { PipelineStage } from '@shared/schema';
import { PIPELINE_TEMPLATES } from '@shared/pipeline-templates';

/**
 * Initialize template pipelines in the database (global templates, companyId: null)
 * This should be called once on application startup
 * Enhanced with idempotency checks and error handling
 */
export async function initPipelineTemplates(): Promise<void> {
  try {

    const existingTemplates = await storage.getPipelines();
    const templatePipelines = existingTemplates.filter(p => p.isTemplate === true);

    if (templatePipelines.length === 0) {

      let templatesCreated = 0;
      let templatesFailed = 0;
      

      for (const template of PIPELINE_TEMPLATES) {
        try {

          const existingTemplate = existingTemplates.find(
            p => p.isTemplate === true && p.name === template.name
          );
          
          if (existingTemplate) {

            continue;
          }
          

          const templatePipeline = await storage.createPipeline({
            companyId: null,
            name: template.name,
            description: template.description,
            icon: template.icon,
            color: template.color,
            isDefault: false,
            isTemplate: true,
            templateCategory: template.category,
            orderNum: PIPELINE_TEMPLATES.indexOf(template) + 1
          });


          let stagesCreated = 0;
          for (const stageData of template.stages) {
            try {
              await storage.createPipelineStage({
                pipelineId: templatePipeline.id,
                companyId: null,
                name: stageData.name,
                color: stageData.color,
                order: stageData.order
              });
              stagesCreated++;
            } catch (stageError) {
              console.error(`Error creating stage "${stageData.name}" for template "${template.name}":`, stageError);
            }
          }
          
          if (stagesCreated === template.stages.length) {
            templatesCreated++;

          } else {
            templatesFailed++;
            console.warn(`⚠️  Template "${template.name}" created but only ${stagesCreated}/${template.stages.length} stages were created`);
          }
        } catch (templateError) {
          templatesFailed++;
          console.error(`Error creating template "${template.name}":`, templateError);
        }
      }
      
      if (templatesCreated > 0) {

      } else if (templatesFailed === 0) {

      } else {
        console.error(`❌ Pipeline template initialization completed with errors: ${templatesFailed} failed`);
      }
      

      const finalTemplates = await storage.getPipelines();
      const finalTemplatePipelines = finalTemplates.filter(p => p.isTemplate === true);
      for (const template of finalTemplatePipelines) {
        const stages = await storage.getPipelineStagesByPipeline(template.id);
        if (stages.length === 0) {
          console.warn(`⚠️  Template "${template.name}" has no stages`);
        }
      }
    } else {

    }
  } catch (error) {
    console.error('Error initializing pipeline templates:', error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Initialize default pipeline stages for a company if none exist
 * Uses the sales template by default
 * Enhanced with migration-safe startup checks
 */
export async function initPipelineStages(companyId: number, templateId: string = 'sales'): Promise<void> {
  try {

    const existingPipelines = await storage.getPipelinesByCompany(companyId);
    
    if (existingPipelines.length === 0) {

      

      const envTemplateId = process.env.DEFAULT_PIPELINE_TEMPLATE || templateId;
      const template = PIPELINE_TEMPLATES.find(t => t.id === envTemplateId) || PIPELINE_TEMPLATES[0];
      
      if (envTemplateId !== templateId && envTemplateId !== template.id) {

      }
      

      const defaultPipeline = await storage.createPipeline({
        companyId,
        name: template.name,
        description: template.description,
        icon: template.icon,
        color: template.color,
        isDefault: true,
        isTemplate: false,
        templateCategory: template.category,
        orderNum: 1
      });
      

      

      let stagesCreated = 0;
      for (const stageData of template.stages) {
        try {
          await storage.createPipelineStage({
            pipelineId: defaultPipeline.id,
            companyId,
            name: stageData.name,
            color: stageData.color,
            order: stageData.order
          });
          stagesCreated++;
        } catch (stageError) {
          console.error(`Error creating stage "${stageData.name}" for company ${companyId}:`, stageError);
        }
      }
      

    } else {

      const defaultPipeline = existingPipelines.find(p => p.isDefault === true);
      if (!defaultPipeline) {
        console.warn(`⚠️  Company ${companyId} has pipelines but no default pipeline. Setting first pipeline as default.`);
        if (existingPipelines.length > 0) {
          await storage.updatePipeline(existingPipelines[0].id, { isDefault: true });

        }
      }
    }
  } catch (error) {
    console.error(`Error initializing pipeline stages for company ${companyId}:`, error);
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Check if migration 112 has been executed
 * Prevents application startup if schema is in inconsistent state
 */
export async function checkMigration112Status(): Promise<boolean> {
  try {


    const pipelines = await storage.getPipelines();

    return true;
  } catch (error: any) {

    if (error?.message?.includes('does not exist') || error?.message?.includes('relation') || error?.code === '42P01') {
      return false;
    }

    console.warn('Could not verify migration 112 status:', error);
    return true;
  }
}