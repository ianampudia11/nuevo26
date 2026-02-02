import { storage } from '../storage';
import { EventEmitter } from 'events';
import { PipelineStageRevert } from '@shared/schema';

/**
 * Pipeline Stage Revert Scheduler Service
 * Handles the execution of scheduled pipeline stage reverts
 */
class PipelineStageRevertScheduler extends EventEmitter {
  private static instance: PipelineStageRevertScheduler;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): PipelineStageRevertScheduler {
    if (!PipelineStageRevertScheduler.instance) {
      PipelineStageRevertScheduler.instance = new PipelineStageRevertScheduler();
    }
    return PipelineStageRevertScheduler.instance;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.processScheduledReverts();
    this.intervalId = setInterval(() => {
      this.processScheduledReverts();
    }, this.POLL_INTERVAL);

    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped');
  }

  /**
   * Process scheduled reverts that are due
   */
  private async processScheduledReverts(): Promise<void> {
    try {
      const dueReverts = await storage.getScheduledPipelineStageReverts(100);

      if (dueReverts.length === 0) {
        return;
      }

      for (const revert of dueReverts) {
        await this.executeRevert(revert as PipelineStageRevert);
      }
    } catch (error) {
      console.error('Error processing scheduled pipeline stage reverts:', error);
      this.emit('error', error);
    }
  }

  /**
   * Execute a single revert
   */
  private async executeRevert(revert: PipelineStageRevert): Promise<void> {
    const startTime = Date.now();
    
    try {

      const deal = await storage.getDeal(revert.dealId);
      if (!deal) {
        await this.markRevertFailed(revert, 'Deal not found');
        return;
      }


      if (revert.currentStageId && deal.stageId !== revert.currentStageId) {
        await this.markRevertSkipped(revert, 'Deal stage has changed since revert was scheduled');
        return;
      }


      if (revert.pipelineId && deal.pipelineId !== revert.pipelineId) {
        await this.markRevertSkipped(revert, 'Deal has moved to a different pipeline since revert was scheduled');
        return;
      }


      if (!revert.revertToStageId) {
        await this.markRevertFailed(revert, 'Revert target stage ID is missing');
        return;
      }
      const revertToStage = await storage.getPipelineStage(revert.revertToStageId);
      if (!revertToStage) {
        await this.markRevertFailed(revert, 'Revert target stage not found');
        return;
      }

      if (revertToStage.pipelineId !== deal.pipelineId) {
        await this.markRevertFailed(revert, 'Revert target stage does not belong to deal\'s current pipeline');
        return;
      }


      if (revert.onlyIfNoActivity) {
        const activities = await storage.getDealActivitiesSince(revert.dealId, revert.createdAt);
        if (activities.length > 0) {
          await this.markRevertSkipped(revert, 'Deal activity detected, skipping revert');
          return;
        }
      }


      if (!revert.revertToStageId) {
        await this.markRevertFailed(revert, 'Invalid revert target stage');
        return;
      }


      const previousStageId = deal.stageId;
      await storage.updateDeal(revert.dealId, { stageId: revert.revertToStageId });


      await storage.createDealActivity({
        dealId: revert.dealId,
        userId: 0, // System user
        type: 'stage_change',
        content: `Deal automatically reverted to previous stage via scheduled revert`,
        metadata: {
          previousStageId,
          newStageId: revert.revertToStageId,
          pipelineId: deal.pipelineId,
          revertScheduleId: revert.scheduleId,
          changedBy: 'scheduled_revert',
          flowNodeId: revert.nodeId
        }
      });


      await storage.updatePipelineStageRevert(revert.scheduleId, {
        status: 'executed',
        executedAt: new Date()
      });


      await storage.createPipelineStageRevertLog({
        scheduleId: revert.scheduleId,
        executionAttempt: (revert.retryCount ?? 0) + 1,
        status: 'success',
        executionDurationMs: Date.now() - startTime,
        previousStageId,
        newStageId: revert.revertToStageId!,
        activityCheckResult: revert.onlyIfNoActivity ? (await storage.getDealActivitiesSince(revert.dealId, revert.createdAt)).length === 0 : null
      });

      this.emit('revertExecuted', { scheduleId: revert.scheduleId, dealId: revert.dealId });

    } catch (error) {
      console.error(`Error executing pipeline stage revert ${revert.scheduleId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const retryCount = revert.retryCount ?? 0;
      const maxRetries = revert.maxRetries ?? 3;

      if (retryCount < maxRetries) {
        await this.scheduleRetry(revert, errorMessage);
      } else {
        await this.markRevertFailed(revert, errorMessage);
      }


      await storage.createPipelineStageRevertLog({
        scheduleId: revert.scheduleId,
        executionAttempt: retryCount + 1,
        status: 'failed',
        errorMessage,
        executionDurationMs: Date.now() - startTime
      });

      this.emit('revertFailed', { 
        scheduleId: revert.scheduleId, 
        error: errorMessage,
        willRetry: retryCount < maxRetries
      });
    }
  }

  /**
   * Mark a revert as skipped
   */
  private async markRevertSkipped(revert: PipelineStageRevert, reason: string): Promise<void> {
    await storage.updatePipelineStageRevert(revert.scheduleId, {
      status: 'skipped',
      failedReason: reason
    });

    await storage.createPipelineStageRevertLog({
      scheduleId: revert.scheduleId,
      executionAttempt: (revert.retryCount ?? 0) + 1,
      status: 'skipped',
      errorMessage: reason
    });

    this.emit('revertSkipped', { scheduleId: revert.scheduleId, reason });
  }

  /**
   * Schedule a retry for a failed revert
   */
  private async scheduleRetry(revert: PipelineStageRevert, errorMessage: string): Promise<void> {
    const retryCount = revert.retryCount ?? 0;
    const retryDelay = Math.min(Math.pow(2, retryCount) * 60 * 1000, 30 * 60 * 1000); // Exponential backoff, max 30 minutes
    const nextAttempt = new Date(Date.now() + retryDelay);

    await storage.updatePipelineStageRevert(revert.scheduleId, {
      scheduledFor: nextAttempt,
      retryCount: retryCount + 1,
      failedReason: errorMessage
    });
  }

  /**
   * Mark a revert as failed
   */
  private async markRevertFailed(revert: PipelineStageRevert, errorMessage: string): Promise<void> {
    await storage.updatePipelineStageRevert(revert.scheduleId, {
      status: 'failed',
      failedReason: errorMessage
    });
  }

  /**
   * Cancel a scheduled revert
   */
  async cancelRevert(scheduleId: string): Promise<boolean> {
    try {
      await storage.cancelPipelineStageRevert(scheduleId);
      this.emit('revertCancelled', { scheduleId });
      return true;
    } catch (error) {
      console.error(`Error cancelling pipeline stage revert ${scheduleId}:`, error);
      return false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; pollInterval: number } {
    return {
      isRunning: this.isRunning,
      pollInterval: this.POLL_INTERVAL
    };
  }
}

export default PipelineStageRevertScheduler;

