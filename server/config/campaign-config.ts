/**
 * Centralized configuration for campaign processing
 * Allows overriding defaults via environment variables
 */

import { logger } from '../utils/logger';

export interface CampaignSchedulerConfig {
  CHECK_INTERVAL: number; // Interval in milliseconds (default: 60000 - 1 minute)
  BATCH_SIZE: number; // Number of campaigns to process per batch (default: 50)
  MAX_CAMPAIGNS_PER_COMPANY: number; // Maximum campaigns to process per company per cycle (default: 10)
  MAX_CONCURRENT_COMPANIES: number; // Maximum companies to process concurrently (default: 5)
  MEMORY_WARNING_THRESHOLD: number; // Memory usage threshold (0.0-1.0, default: 0.8 - 80%)
  LOG_LEVEL: string; // Log level: 'DEBUG', 'INFO', 'WARN', 'ERROR' (default: 'INFO')
}

/**
 * Load configuration from environment variables with validation
 */
function loadConfig(): CampaignSchedulerConfig {
  const config: CampaignSchedulerConfig = {
    CHECK_INTERVAL: parseInt(process.env.CAMPAIGN_CHECK_INTERVAL || '60000', 10),
    BATCH_SIZE: parseInt(process.env.CAMPAIGN_BATCH_SIZE || '50', 10),
    MAX_CAMPAIGNS_PER_COMPANY: parseInt(process.env.CAMPAIGN_MAX_PER_COMPANY || '10', 10),
    MAX_CONCURRENT_COMPANIES: parseInt(process.env.CAMPAIGN_MAX_CONCURRENT_COMPANIES || '5', 10),
    MEMORY_WARNING_THRESHOLD: parseFloat(process.env.CAMPAIGN_MEMORY_THRESHOLD || '0.8'),
    LOG_LEVEL: process.env.CAMPAIGN_LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG')
  };


  if (config.CHECK_INTERVAL < 1000) {
    logger.warn('Campaign Config', 'CHECK_INTERVAL too low, using minimum 1000ms');
    config.CHECK_INTERVAL = 1000;
  }

  if (config.BATCH_SIZE < 1) {
    logger.warn('Campaign Config', 'BATCH_SIZE too low, using minimum 1');
    config.BATCH_SIZE = 1;
  }

  if (config.BATCH_SIZE > 1000) {
    logger.warn('Campaign Config', 'BATCH_SIZE too high, using maximum 1000');
    config.BATCH_SIZE = 1000;
  }

  if (config.MAX_CAMPAIGNS_PER_COMPANY < 1) {
    logger.warn('Campaign Config', 'MAX_CAMPAIGNS_PER_COMPANY too low, using minimum 1');
    config.MAX_CAMPAIGNS_PER_COMPANY = 1;
  }

  if (config.MAX_CONCURRENT_COMPANIES < 1) {
    logger.warn('Campaign Config', 'MAX_CONCURRENT_COMPANIES too low, using minimum 1');
    config.MAX_CONCURRENT_COMPANIES = 1;
  }

  if (config.MEMORY_WARNING_THRESHOLD < 0 || config.MEMORY_WARNING_THRESHOLD > 1) {
    logger.warn('Campaign Config', 'MEMORY_WARNING_THRESHOLD must be between 0 and 1, using default 0.8');
    config.MEMORY_WARNING_THRESHOLD = 0.8;
  }

  const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  if (!validLogLevels.includes(config.LOG_LEVEL)) {
    logger.warn('Campaign Config', `Invalid LOG_LEVEL, using default 'INFO'`);
    config.LOG_LEVEL = 'INFO';
  }

  return config;
}

/**
 * Singleton configuration object
 */
export const campaignSchedulerConfig = loadConfig();

/**
 * Update configuration at runtime (for testing/debugging)
 */
export function updateCampaignSchedulerConfig(updates: Partial<CampaignSchedulerConfig>): void {
  Object.assign(campaignSchedulerConfig, updates);
  logger.info('Campaign Config', 'Configuration updated', campaignSchedulerConfig);
}

