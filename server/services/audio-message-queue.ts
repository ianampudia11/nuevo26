/**
 * Audio Message Queue
 * Buffers audio messages during temporary WebSocket disconnections
 */

import { CALL_AGENT_CONFIG } from '../config/call-agent-config';
import type { MessageQueueMetrics } from '../config/call-agent-config';

export interface QueuedMessage {
  message: string | object;
  priority: number;
  timestamp: number;
}

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_EXPIRATION_MS = 5000;

export class AudioMessageQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number;
  private expirationMs: number;
  private droppedMessages = 0;
  private totalQueueTime = 0;
  private processedCount = 0;

  constructor(options?: { maxSize?: number; expirationMs?: number }) {
    const wsConfig = CALL_AGENT_CONFIG.websocket as typeof CALL_AGENT_CONFIG.websocket & { messageQueueSize?: number; messageExpirationMs?: number };
    this.maxSize = options?.maxSize ?? wsConfig.messageQueueSize ?? DEFAULT_MAX_SIZE;
    this.expirationMs = options?.expirationMs ?? wsConfig.messageExpirationMs ?? DEFAULT_EXPIRATION_MS;
  }

  enqueue(message: string | object, priority = 0): void {
    this.expireOld();
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift();
      if (dropped) this.droppedMessages++;
    }
    this.queue.push({
      message,
      priority,
      timestamp: Date.now()
    });
  }

  dequeue(): QueuedMessage | null {
    this.expireOld();
    if (this.queue.length === 0) return null;
    const item = this.queue.shift()!;
    const queueTime = Date.now() - item.timestamp;
    this.totalQueueTime += queueTime;
    this.processedCount++;
    return item;
  }

  flush(sendFn: (msg: string | object) => void): number {
    this.expireOld();
    let sent = 0;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const payload = typeof item.message === 'string' ? item.message : JSON.stringify(item.message);
        sendFn(payload);
        sent++;
        const queueTime = Date.now() - item.timestamp;
        this.totalQueueTime += queueTime;
        this.processedCount++;
      } catch (_) {
        this.droppedMessages++;
      }
    }
    return sent;
  }

  clear(): void {
    this.queue = [];
  }

  getQueueSize(): number {
    this.expireOld();
    return this.queue.length;
  }

  getQueueMetrics(): MessageQueueMetrics {
    return {
      queuedMessages: this.queue.length,
      droppedMessages: this.droppedMessages,
      averageQueueTime: this.processedCount > 0 ? this.totalQueueTime / this.processedCount : 0
    };
  }

  private expireOld(): void {
    const now = Date.now();
    const before = this.queue.length;
    this.queue = this.queue.filter(item => now - item.timestamp < this.expirationMs);
    const expired = before - this.queue.length;
    if (expired > 0) this.droppedMessages += expired;
  }
}
