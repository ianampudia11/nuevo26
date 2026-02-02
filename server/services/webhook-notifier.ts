import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import { storage } from '../storage';
import { generateWebhookSignature } from '../middleware/api-auth';

interface WebhookPayload {
  event: string;
  messageId?: number | string;
  status: string;
  timestamp: string;
  endpoint?: string;
  error?: string;
  [key: string]: any;
}

interface QueuedNotification {
  apiKeyId: number;
  webhookUrl: string;
  payload: WebhookPayload;
  attempt: number;
  nextRetryAt: Date;
  webhookRecordId?: number; // Database record ID for updates
}

class WebhookNotifier {
  private queue: QueuedNotification[] = [];
  private processing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s

  constructor() {
    this.startProcessor();
  }

  /**
   * Queue a webhook notification
   */
  async queueNotification(
    apiKeyId: number,
    webhookUrl: string,
    payload: WebhookPayload
  ): Promise<void> {
    if (!this.validateWebhookUrl(webhookUrl)) {
      console.error(`Invalid webhook URL: ${webhookUrl}`);
      return;
    }

    const notification: QueuedNotification = {
      apiKeyId,
      webhookUrl,
      payload,
      attempt: 0,
      nextRetryAt: new Date()
    };

    this.queue.push(notification);
  }

  /**
   * Validate webhook URL format
   */
  private validateWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      if (parsed.protocol !== 'https:' && 
          !parsed.hostname.includes('localhost') && 
          !parsed.hostname.includes('127.0.0.1')) {
        console.warn(`Webhook URL must use HTTPS: ${url}`);
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Start the queue processor
   */
  private startProcessor(): void {
    if (this.processingInterval) {
      return;
    }

    this.processingInterval = setInterval(() => {
      this.processQueue().catch(error => {
        console.error('Error processing webhook queue:', error);
      });
    }, 1000); // Process every second
  }

  /**
   * Process queued webhook notifications
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const now = new Date();
      const readyNotifications = this.queue.filter(n => n.nextRetryAt <= now);
      
      for (const notification of readyNotifications) {
        await this.sendWebhook(notification);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(notification: QueuedNotification): Promise<void> {
    try {
      const apiKey = await storage.getApiKeyById(notification.apiKeyId);
      if (!apiKey) {
        console.error(`API key not found: ${notification.apiKeyId}`);
        this.removeFromQueue(notification);
        return;
      }


      if (!notification.webhookRecordId) {
        const webhookRecord = await storage.createApiWebhook({
          apiKeyId: notification.apiKeyId,
          eventType: notification.payload.event,
          payload: notification.payload as any,
          status: 'pending',
          attemptCount: notification.attempt,
          lastAttemptAt: new Date(),
          nextRetryAt: notification.nextRetryAt
        });
        notification.webhookRecordId = webhookRecord.id;
      } else {

        await storage.updateApiWebhook(notification.webhookRecordId, {
          status: 'retrying',
          attemptCount: notification.attempt,
          lastAttemptAt: new Date(),
          nextRetryAt: notification.nextRetryAt
        });
      }

      const payloadString = JSON.stringify(notification.payload);

      const secret = (apiKey as any).webhookSecret || apiKey.keyHash;
      const signature = generateWebhookSignature(payloadString, secret);

      const response = await axios.post(
        notification.webhookUrl,
        notification.payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Request-ID': crypto.randomUUID(),
            'User-Agent': 'PowerChat-API-Webhook/1.0'
          },
          timeout: 10000 // 10 second timeout
        }
      );



      this.removeFromQueue(notification);


      if (notification.webhookRecordId) {
        await storage.updateApiWebhook(notification.webhookRecordId, {
          status: 'sent',
          attemptCount: notification.attempt + 1,
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          responseBody: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          nextRetryAt: null
        });
      }

    } catch (error) {
      const axiosError = error as AxiosError;
      const statusCode = axiosError.response?.status;
      const errorMessage = axiosError.message;
      const responseBody = axiosError.response?.data ? 
        (typeof axiosError.response.data === 'string' ? axiosError.response.data : JSON.stringify(axiosError.response.data)) : 
        null;

      console.error(`Webhook delivery failed (attempt ${notification.attempt + 1}):`, errorMessage);


      notification.attempt++;

      if (notification.attempt >= this.maxRetries) {

        console.error(`Webhook delivery failed after ${this.maxRetries} attempts: ${notification.webhookUrl}`);
        

        if (notification.webhookRecordId) {
          await storage.updateApiWebhook(notification.webhookRecordId, {
            status: 'failed',
            attemptCount: notification.attempt,
            lastAttemptAt: new Date(),
            responseStatus: statusCode || 0,
            responseBody: responseBody,
            errorMessage: errorMessage,
            nextRetryAt: null
          });
        }
        
        this.removeFromQueue(notification);
      } else {

        const delay = this.retryDelays[notification.attempt - 1] || 4000;
        notification.nextRetryAt = new Date(Date.now() + delay);
        

        if (notification.webhookRecordId) {
          await storage.updateApiWebhook(notification.webhookRecordId, {
            status: 'retrying',
            attemptCount: notification.attempt,
            lastAttemptAt: new Date(),
            nextRetryAt: notification.nextRetryAt,
            responseStatus: statusCode || undefined,
            responseBody: responseBody || undefined,
            errorMessage: errorMessage
          });
        }
        

      }
    }
  }

  /**
   * Retry webhook with exponential backoff
   */
  private async retryWithBackoff(
    notification: QueuedNotification
  ): Promise<void> {
    if (notification.attempt >= this.maxRetries) {
      console.error(`Max retries reached for webhook: ${notification.webhookUrl}`);
      this.removeFromQueue(notification);
      return;
    }

    const delay = this.retryDelays[notification.attempt] || 4000;
    notification.attempt++;
    notification.nextRetryAt = new Date(Date.now() + delay);


  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }


  /**
   * Remove notification from queue
   */
  private removeFromQueue(notification: QueuedNotification): void {
    const index = this.queue.indexOf(notification);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}


export default new WebhookNotifier();

