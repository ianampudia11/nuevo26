/**
 * Call Quality Monitor
 * Tracks and exports call quality metrics for monitoring
 */

export interface CallQualityMetricEntry {
  rttMs?: number;
  packetLossRate?: number;
  jitter?: number;
  reconnectionCount?: number;
  fallbackCount?: number;
  averageAudioLatency?: number;
  timestamp: number;
}

const callMetrics = new Map<string, CallQualityMetricEntry[]>();

const AGGREGATE_KEY = '__aggregate__';
const MAX_METRICS_PER_CALL = 1000;

export const callQualityMonitor = {
  trackMetric(callSid: string, metric: keyof Omit<CallQualityMetricEntry, 'timestamp'>, value: number): void {
    let list = callMetrics.get(callSid);
    if (!list) {
      list = [];
      callMetrics.set(callSid, list);
    }
    const entry: CallQualityMetricEntry = { [metric]: value, timestamp: Date.now() };
    const last = list[list.length - 1];
    if (last) {
      Object.assign(last, entry);
      last.timestamp = Date.now();
    } else {
      list.push(entry);
    }
    if (list.length > MAX_METRICS_PER_CALL) {
      list.shift();
    }
  },

  getCallMetrics(callSid: string): CallQualityMetricEntry | null {
    const list = callMetrics.get(callSid);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  },

  getAggregateMetrics(): {
    averageRttMs: number;
    averagePacketLossRate: number;
    totalReconnections: number;
    totalFallbacks: number;
    callCount: number;
  } {
    let totalRtt = 0;
    let rttCount = 0;
    let totalPacketLoss = 0;
    let packetLossCount = 0;
    let totalReconnections = 0;
    let totalFallbacks = 0;
    const seen = new Set<string>();
    for (const [callSid, list] of callMetrics.entries()) {
      if (callSid === AGGREGATE_KEY) continue;
      seen.add(callSid);
      for (const entry of list) {
        if (entry.rttMs != null) {
          totalRtt += entry.rttMs;
          rttCount++;
        }
        if (entry.packetLossRate != null) {
          totalPacketLoss += entry.packetLossRate;
          packetLossCount++;
        }
        if (entry.reconnectionCount != null) totalReconnections += entry.reconnectionCount;
        if (entry.fallbackCount != null) totalFallbacks += entry.fallbackCount;
      }
    }
    return {
      averageRttMs: rttCount > 0 ? totalRtt / rttCount : 0,
      averagePacketLossRate: packetLossCount > 0 ? totalPacketLoss / packetLossCount : 0,
      totalReconnections: totalReconnections,
      totalFallbacks: totalFallbacks,
      callCount: seen.size
    };
  },

  exportMetrics(): Record<string, CallQualityMetricEntry[]> {
    const out: Record<string, CallQualityMetricEntry[]> = {};
    for (const [callSid, list] of callMetrics.entries()) {
      if (callSid !== AGGREGATE_KEY) {
        out[callSid] = [...list];
      }
    }
    return out;
  },

  clearCall(callSid: string): void {
    callMetrics.delete(callSid);
  },

  clearAll(): void {
    callMetrics.clear();
  }
};
