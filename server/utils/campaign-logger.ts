/**
 * Dedicated logger for campaigns with log levels and structured logging
 * Provides campaign-specific context (campaign ID, company ID, operation type)
 */

import { logger } from './logger';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class CampaignLogger {
  private logLevel: LogLevel;
  private logCounter: Map<string, number> = new Map();
  private readonly LOG_SAMPLE_RATE = 100; // Log every Nth occurrence for high-frequency logs

  constructor() {

    const envLogLevel = process.env.CAMPAIGN_LOG_LEVEL?.toUpperCase();
    const validLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    
    if (envLogLevel && validLevels.includes(envLogLevel as LogLevel)) {
      this.logLevel = envLogLevel as LogLevel;
    } else {

      this.logLevel = process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';
    }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  /**
   * Format log message with campaign context
   */
  private formatMessage(
    campaignId: number | string | undefined,
    companyId: number | string | undefined,
    operation: string,
    message: string
  ): string {
    const parts: string[] = [];
    
    if (companyId !== undefined) {
      parts.push(`[Company: ${companyId}]`);
    }
    
    if (campaignId !== undefined) {
      parts.push(`[Campaign: ${campaignId}]`);
    }
    
    if (operation) {
      parts.push(`[Operation: ${operation}]`);
    }
    
    return parts.length > 0 ? `${parts.join(' ')} ${message}` : message;
  }

  /**
   * Check if we should log based on sampling (for high-frequency logs)
   */
  private shouldSampleLog(key: string): boolean {
    const count = (this.logCounter.get(key) || 0) + 1;
    this.logCounter.set(key, count);
    

    if (count > this.LOG_SAMPLE_RATE * 10) {
      this.logCounter.set(key, 0);
    }
    

    return count % this.LOG_SAMPLE_RATE === 0;
  }

  /**
   * Debug level logging
   */
  debug(
    campaignId: number | string | undefined,
    companyId: number | string | undefined,
    operation: string,
    message: string,
    ...args: any[]
  ): void {
    if (!this.shouldLog('DEBUG')) return;
    

    if (operation === 'check' || operation === 'evaluate') {
      const key = `${campaignId}-${operation}`;
      if (!this.shouldSampleLog(key)) return;
    }
    
    const formattedMessage = this.formatMessage(campaignId, companyId, operation, message);
    logger.debug('Campaign Scheduler', formattedMessage, ...args);
  }

  /**
   * Info level logging
   */
  info(
    campaignId: number | string | undefined,
    companyId: number | string | undefined,
    operation: string,
    message: string,
    ...args: any[]
  ): void {
    if (!this.shouldLog('INFO')) return;
    const formattedMessage = this.formatMessage(campaignId, companyId, operation, message);
    logger.info('Campaign Scheduler', formattedMessage, ...args);
  }

  /**
   * Warn level logging
   */
  warn(
    campaignId: number | string | undefined,
    companyId: number | string | undefined,
    operation: string,
    message: string,
    ...args: any[]
  ): void {
    if (!this.shouldLog('WARN')) return;
    const formattedMessage = this.formatMessage(campaignId, companyId, operation, message);
    logger.warn('Campaign Scheduler', formattedMessage, ...args);
  }

  /**
   * Error level logging
   */
  error(
    campaignId: number | string | undefined,
    companyId: number | string | undefined,
    operation: string,
    message: string,
    error?: Error | any,
    ...args: any[]
  ): void {
    if (!this.shouldLog('ERROR')) return;
    const formattedMessage = this.formatMessage(campaignId, companyId, operation, message);
    
    if (error instanceof Error) {
      logger.error('Campaign Scheduler', formattedMessage, error, ...args);
      if (error.stack) {
        logger.debug('Campaign Scheduler', `Error stack: ${error.stack}`);
      }
    } else if (error) {
      logger.error('Campaign Scheduler', formattedMessage, error, ...args);
    } else {
      logger.error('Campaign Scheduler', formattedMessage, ...args);
    }
  }

  /**
   * Set log level at runtime
   */
  setLogLevel(level: LogLevel): void {
    const validLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (validLevels.includes(level)) {
      this.logLevel = level;
      logger.info('Campaign Logger', `Log level set to ${level}`);
    } else {
      logger.warn('Campaign Logger', `Invalid log level: ${level}`);
    }
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Clear log counters (for memory management)
   */
  clearCounters(): void {
    this.logCounter.clear();
  }
}


export const campaignLogger = new CampaignLogger();

