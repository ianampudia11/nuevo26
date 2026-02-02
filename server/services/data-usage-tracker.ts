import { db } from '../db';
import { storage } from '../storage';
import { companies } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface TrackingResult {
  success: boolean;
  error?: string;
}

export interface CurrentUsage {
  storage: number; // in MB
  bandwidth: number; // in MB
  files: number;
}

/**
 * Lightweight service for tracking data usage in the companies table
 * Updates currentStorageUsed, currentBandwidthUsed, filesCount, and lastUsageUpdate
 */
export class DataUsageTracker {
  /**
   * Convert bytes to MB (rounded up)
   * 
   * IMPORTANT: This method uses Math.ceil, which means any non-zero file size
   * is always rounded up to the next whole megabyte. For example:
   * - 1 byte = 1 MB
   * - 1,048,576 bytes (1 MB) = 1 MB
   * - 1,048,577 bytes (1 MB + 1 byte) = 2 MB
   * 
   * This rounding behavior ensures that even small files contribute at least
   * 1 MB to storage/bandwidth usage, which is important for billing accuracy
   * and plan limit enforcement. Users should be aware that fractional megabytes
   * are not supported - any file, regardless of size, counts as at least 1 MB.
   */
  private bytesToMB(bytes: number): number {
    return Math.ceil(bytes / (1024 * 1024));
  }

  /**
   * Track file upload - increments storage and file count
   */
  async trackFileUpload(companyId: number, fileSizeBytes: number): Promise<TrackingResult> {
    try {
      if (!companyId || companyId <= 0) {
        logger.warn('data-usage-tracker', `Invalid companyId: ${companyId}`);
        return { success: false, error: 'Invalid companyId' };
      }

      if (fileSizeBytes < 0) {
        logger.warn('data-usage-tracker', `Invalid file size: ${fileSizeBytes} bytes`);
        return { success: false, error: 'Invalid file size' };
      }

      const sizeMB = this.bytesToMB(fileSizeBytes);


      await db
        .update(companies)
        .set({
          currentStorageUsed: sql`${companies.currentStorageUsed} + ${sizeMB}`,
          filesCount: sql`${companies.filesCount} + 1`,
          lastUsageUpdate: new Date()
        })
        .where(eq(companies.id, companyId));

      logger.debug('data-usage-tracker', `Tracked file upload: companyId=${companyId}, size=${sizeMB}MB`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('data-usage-tracker', `Failed to track file upload: companyId=${companyId}, error=${errorMessage}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Track file deletion - decrements storage and file count
   */
  async trackFileDelete(companyId: number, fileSizeBytes: number): Promise<TrackingResult> {
    try {
      if (!companyId || companyId <= 0) {
        logger.warn('data-usage-tracker', `Invalid companyId: ${companyId}`);
        return { success: false, error: 'Invalid companyId' };
      }

      if (fileSizeBytes < 0) {
        logger.warn('data-usage-tracker', `Invalid file size: ${fileSizeBytes} bytes`);
        return { success: false, error: 'Invalid file size' };
      }

      const sizeMB = this.bytesToMB(fileSizeBytes);


      await db
        .update(companies)
        .set({
          currentStorageUsed: sql`GREATEST(0, ${companies.currentStorageUsed} - ${sizeMB})`,
          filesCount: sql`GREATEST(0, ${companies.filesCount} - 1)`,
          lastUsageUpdate: new Date()
        })
        .where(eq(companies.id, companyId));

      logger.debug('data-usage-tracker', `Tracked file deletion: companyId=${companyId}, size=${sizeMB}MB`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('data-usage-tracker', `Failed to track file deletion: companyId=${companyId}, error=${errorMessage}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Track bandwidth usage - increments bandwidth used
   */
  async trackBandwidthUsage(companyId: number, bytesTransferred: number): Promise<TrackingResult> {
    try {
      if (!companyId || companyId <= 0) {
        logger.warn('data-usage-tracker', `Invalid companyId: ${companyId}`);
        return { success: false, error: 'Invalid companyId' };
      }

      if (bytesTransferred < 0) {
        logger.warn('data-usage-tracker', `Invalid bytes transferred: ${bytesTransferred}`);
        return { success: false, error: 'Invalid bytes transferred' };
      }

      const sizeMB = this.bytesToMB(bytesTransferred);


      await db
        .update(companies)
        .set({
          currentBandwidthUsed: sql`${companies.currentBandwidthUsed} + ${sizeMB}`,
          lastUsageUpdate: new Date()
        })
        .where(eq(companies.id, companyId));

      logger.debug('data-usage-tracker', `Tracked bandwidth usage: companyId=${companyId}, size=${sizeMB}MB`);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('data-usage-tracker', `Failed to track bandwidth usage: companyId=${companyId}, error=${errorMessage}`, error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get current usage stats for a company
   */
  async getCurrentUsage(companyId: number): Promise<CurrentUsage | null> {
    try {
      if (!companyId || companyId <= 0) {
        return null;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return null;
      }

      return {
        storage: company.currentStorageUsed ?? 0,
        bandwidth: company.currentBandwidthUsed ?? 0,
        files: company.filesCount ?? 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('data-usage-tracker', `Failed to get current usage: companyId=${companyId}, error=${errorMessage}`, error);
      return null;
    }
  }
}

export const dataUsageTracker = new DataUsageTracker();

