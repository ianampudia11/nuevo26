export const CALL_AGENT_CONFIG = {
  audio: {
    defaultFormat: 'ulaw_8000',
    initialBufferMs: 400,
    maintainAheadMs: 175,
    maxBufferMs: 1000,
    enableJitterBuffer: true,
    enableNoiseReduction: false,
    enableEchoCancellation: false,
    audioGain: 1.0,
    enableVAD: false,
  },
  connection: {
    pingIntervalMs: 15000,
    connectionTimeoutMs: 30000,
    activityTimeoutMs: 60000,
    maxReconnectAttempts: 3,
    reconnectBackoffMs: [1000, 2000, 4000, 8000],
  },
  quality: {
    minConnectionQuality: 'fair' as 'excellent' | 'good' | 'fair' | 'poor',
    enableAdaptiveQuality: true,
    maxLatencyMs: 500,
  },
  monitoring: {
    enableMetrics: true,
    metricsIntervalMs: 5000,
    enableDetailedLogging: process.env.DEBUG_ELEVENLABS_WS === 'true',
  },
  websocket: {
    enableMessageBatching: true,
    batchSize: 5,
    batchTimeoutMs: 50,
    enableCompression: true,
    maxMessageSize: 64 * 1024, // 64KB
    enableAutoReconnect: true,
    messageQueueSize: 100,
    messageExpirationMs: 5000,
  },
  fallback: {
    enableAutoFallback: true,
    maxElevenLabsRetries: 3,
  },
  errorHandling: {
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 30000,
  },
} as const;

export interface CallMetrics {
  callSid: string;
  audioChunksSent: number;
  audioChunksReceived: number;
  bytesTransferred: number;
  averageLatencyMs: number;
  packetLossRate: number;
  bufferUnderruns: number;
  bufferOverruns: number;
  conversationTurns: number;
  interruptionCount: number;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
  startTime: Date;
  endTime?: Date;
  lastPingTime?: number;
  rttMs?: number;
  reconnectionCount?: number;
  fallbackTriggered?: boolean;
  fallbackReason?: string;
  messageQueueStats?: { queued: number; dropped: number };
}

export type WebSocketConnectionState = 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'failed';

export interface MessageQueueMetrics {
  queuedMessages: number;
  droppedMessages: number;
  averageQueueTime: number;
}

export interface CircuitBreakerMetrics {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  failureCountByType: Record<string, number>;
  nextAttemptTime: number | null;
  lastFailureTime: number | null;
}

export interface AudioBufferConfig {
  initialBufferMs: number;
  maintainAheadMs: number;
  maxBufferMs: number;
  enableJitterBuffer: boolean;
}

export interface ConnectionHealthMetrics {
  isConnected: boolean;
  lastActivityTime: Date;
  pingSentTime?: number;
  lastPingResponse?: number;
  rttMs?: number;
  reconnectAttempts: number;
  connectionState: 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'failed';
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
  sequenceNumber: number;
  size: number;
}

export interface JitterBuffer {
  chunks: Map<number, AudioChunk>;
  nextSequenceNumber: number;
  maxBufferSize: number;
  totalSize: number;
}
