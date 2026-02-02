/**
 * WebSocket Connection Manager
 * Handles WebSocket lifecycle with retry logic, exponential backoff, and state tracking
 */

import { WebSocket } from 'ws';
import { CALL_AGENT_CONFIG } from '../config/call-agent-config';
import type { ConnectionHealthMetrics } from '../config/call-agent-config';

export type ConnectionState = 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'failed';

export interface WebSocketConnectionManagerOptions {
  url: string;
  headers?: Record<string, string>;
  maxReconnectAttempts?: number;
  reconnectBackoffMs?: number[];
}

export interface ConnectionHealthMetricsExtended extends ConnectionHealthMetrics {
  connectionState: ConnectionState;
}

type StateChangeHandler = (state: ConnectionState) => void;
type ReconnectingHandler = () => void;
type ReconnectedHandler = () => void;
type FailedHandler = (error?: Error) => void;

export class WebSocketConnectionManager {
  private ws: WebSocket | null = null;
  private url: string;
  private headers: Record<string, string>;
  private maxReconnectAttempts: number;
  private reconnectBackoffMs: number[];
  private reconnectAttempts = 0;
  private lastActivityTime = 0;
  private connectionState: ConnectionState = 'connecting';
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private stateChangeHandlers: StateChangeHandler[] = [];
  private onReconnectingHandlers: ReconnectingHandler[] = [];
  private onReconnectedHandlers: ReconnectedHandler[] = [];
  private onFailedHandlers: FailedHandler[] = [];

  constructor(options: WebSocketConnectionManagerOptions) {
    this.url = options.url;
    this.headers = options.headers || {};
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? CALL_AGENT_CONFIG.connection.maxReconnectAttempts;
    this.reconnectBackoffMs = options.reconnectBackoffMs ?? [...CALL_AGENT_CONFIG.connection.reconnectBackoffMs];
  }

  private setState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.lastActivityTime = Date.now();
      this.stateChangeHandlers.forEach(h => h(state));
    }
  }

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.push(handler);
    return () => {
      this.stateChangeHandlers = this.stateChangeHandlers.filter(h => h !== handler);
    };
  }

  onReconnecting(handler: ReconnectingHandler): () => void {
    this.onReconnectingHandlers.push(handler);
    return () => {
      this.onReconnectingHandlers = this.onReconnectingHandlers.filter(h => h !== handler);
    };
  }

  onReconnected(handler: ReconnectedHandler): () => void {
    this.onReconnectedHandlers.push(handler);
    return () => {
      this.onReconnectedHandlers = this.onReconnectedHandlers.filter(h => h !== handler);
    };
  }

  onFailed(handler: FailedHandler): () => void {
    this.onFailedHandlers.push(handler);
    return () => {
      this.onFailedHandlers = this.onFailedHandlers.filter(h => h !== handler);
    };
  }

  private getBackoffDelay(): number {
    const index = Math.min(this.reconnectAttempts, this.reconnectBackoffMs.length - 1);
    return this.reconnectBackoffMs[Math.max(0, index)] ?? 8000;
  }

  connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve(this.ws);
        return;
      }
      this.setState('connecting');
      try {
        this.ws = new WebSocket(this.url, {
          headers: this.headers
        });

        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          this.lastActivityTime = Date.now();
          this.setState('connected');
          resolve(this.ws!);
        });

        this.ws.on('close', (code, reason) => {
          this.lastActivityTime = Date.now();
          if (code !== 1000 && code !== 1001 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          } else {
            this.setState('failed');
            this.onFailedHandlers.forEach(h => h(new Error(`Connection closed: ${code} ${reason}`)));
          }
        });

        this.ws.on('error', (err) => {
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          } else {
            this.setState('failed');
            this.onFailedHandlers.forEach(h => h(err));
            reject(err);
          }
        });
      } catch (err) {
        this.setState('failed');
        reject(err);
      }
    });
  }

  reconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.setState('reconnecting');
    this.onReconnectingHandlers.forEach(h => h());
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch (_) {}
      this.ws = null;
    }
    const delay = this.getBackoffDelay();
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect()
        .then(() => {
          this.onReconnectedHandlers.forEach(h => h());
        })
        .catch(() => {});
    }, delay);
  }

  sendWithRetry(message: string | Buffer, maxRetries = 3): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    let attempts = 0;
    const send = (): boolean => {
      try {
        this.ws!.send(message);
        this.lastActivityTime = Date.now();
        return true;
      } catch (err) {
        attempts++;
        if (attempts < maxRetries) {
          setTimeout(send, 100 * attempts);
          return false;
        }
        return false;
      }
    };
    return send();
  }

  close(graceful = true): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (graceful) {
          this.ws.close(1000, 'Graceful shutdown');
        } else {
          this.ws.terminate();
        }
      } catch (_) {}
      this.ws = null;
    }
    this.setState('failed');
  }

  getConnectionState(): ConnectionHealthMetricsExtended {
    return {
      isConnected: this.ws?.readyState === WebSocket.OPEN,
      lastActivityTime: new Date(this.lastActivityTime || Date.now()),
      reconnectAttempts: this.reconnectAttempts,
      connectionState: this.connectionState
    };
  }

  getSocket(): WebSocket | null {
    return this.ws;
  }

  getState(): ConnectionState {
    return this.connectionState;
  }
}
