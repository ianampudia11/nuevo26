import { storage } from '../storage';
import { PipelineStage, Pipeline } from '@shared/schema';

interface CachedGeneralSettings {
  value: any;
  timestamp: number;
}

interface CachedPipelineStage {
  stage: PipelineStage | null;
  timestamp: number;
}

interface CachedPipeline {
  pipelines: Pipeline[];
  timestamp: number;
}

interface CachedCompanySetting {
  value: boolean;
  timestamp: number;
}


const CACHE_TTL_MS = 60 * 1000;


let generalSettingsCache: CachedGeneralSettings | null = null;



const pipelineStageCache = new Map<string, CachedPipelineStage>();


const pipelineCache = new Map<number, CachedPipeline>();


const companySettingsCache = new Map<number, Map<string, CachedCompanySetting>>();

/**
 * Get general settings with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedGeneralSettings(): Promise<any> {
  const now = Date.now();
  

  if (generalSettingsCache && (now - generalSettingsCache.timestamp) < CACHE_TTL_MS) {
    return generalSettingsCache.value;
  }
  

  const generalSettings = await storage.getAppSetting('general_settings');
  const settingsValue = generalSettings?.value as any;
  
  generalSettingsCache = {
    value: settingsValue,
    timestamp: now
  };
  
  return settingsValue;
}

/**
 * Get company setting with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedCompanySetting(companyId: number, key: string): Promise<boolean> {
  const now = Date.now();
  const companyCache = companySettingsCache.get(companyId);
  const cached = companyCache?.get(key);
  

  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }
  

  const setting = await storage.getCompanySetting(companyId, key);
  const value = setting?.value !== undefined ? Boolean(setting.value) : false;
  
  if (!companyCache) {
    companySettingsCache.set(companyId, new Map());
  }
  companySettingsCache.get(companyId)!.set(key, {
    value,
    timestamp: now
  });
  
  return value;
}

/**
 * Get the initial pipeline stage (order = 1) for a company with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 * If pipelineId is not provided, uses the company's default pipeline
 */
export async function getCachedInitialPipelineStage(companyId: number, pipelineId?: number): Promise<PipelineStage | null> {

  let targetPipelineId = pipelineId;
  if (!targetPipelineId) {
    const pipelines = await getCachedPipelinesByCompany(companyId);
    const defaultPipeline = pipelines.find(p => p.isDefault === true);
    if (!defaultPipeline) {

      return null;
    }
    targetPipelineId = defaultPipeline.id;
  }

  const now = Date.now();

  const cacheKey = `${companyId}-${targetPipelineId}`;
  const cached = pipelineStageCache.get(cacheKey);
  

  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.stage;
  }
  

  const pipelineStages = await storage.getPipelineStagesByCompany(companyId, targetPipelineId);
  const initialStage = pipelineStages.find(stage => stage.order === 1) || null;
  
  pipelineStageCache.set(cacheKey, {
    stage: initialStage,
    timestamp: now
  });
  
  return initialStage;
}

/**
 * Invalidate the general settings cache
 * Call this when general settings are updated
 */
export function invalidateGeneralSettingsCache(): void {
  generalSettingsCache = null;
}

/**
 * Get pipelines for a company with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedPipelinesByCompany(companyId: number): Promise<Pipeline[]> {
  const now = Date.now();
  const cached = pipelineCache.get(companyId);
  

  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.pipelines;
  }
  

  const pipelines = await storage.getPipelinesByCompany(companyId);
  
  pipelineCache.set(companyId, {
    pipelines,
    timestamp: now
  });
  
  return pipelines;
}

/**
 * Invalidate the pipeline stage cache for a specific company
 * Call this when pipeline stages are updated for a company
 */
export function invalidatePipelineStageCache(companyId: number): void {

  for (const key of pipelineStageCache.keys()) {
    if (key.startsWith(`${companyId}-`)) {
      pipelineStageCache.delete(key);
    }
  }

  invalidatePipelineCache(companyId);
}

/**
 * Invalidate all pipeline stage caches
 * Call this when pipeline stages are updated globally
 */
export function invalidateAllPipelineStageCaches(): void {
  pipelineStageCache.clear();
}

/**
 * Invalidate the pipeline cache for a specific company
 * Call this when pipelines are updated for a company
 */
export function invalidatePipelineCache(companyId: number): void {
  pipelineCache.delete(companyId);


  for (const key of pipelineStageCache.keys()) {
    if (key.startsWith(`${companyId}-`)) {
      pipelineStageCache.delete(key);
    }
  }
}

/**
 * Invalidate all pipeline caches
 * Call this when pipelines are updated globally
 */
export function invalidateAllPipelineCaches(): void {
  pipelineCache.clear();
  invalidateAllPipelineStageCaches();
}

/**
 * Invalidate the company setting cache for a specific company and key
 * Call this when a company setting is updated
 */
export function invalidateCompanySettingCache(companyId: number, key: string): void {
  const companyCache = companySettingsCache.get(companyId);
  if (companyCache) {
    companyCache.delete(key);
  }
}

/**
 * Invalidate all company setting caches for a specific company
 * Call this when company settings are updated
 */
export function invalidateAllCompanySettingCaches(companyId: number): void {
  companySettingsCache.delete(companyId);
}

