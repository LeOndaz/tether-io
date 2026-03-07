import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'
import { USAGE_BY_KEY_ID_INDEX, USAGE_BY_MODEL_INDEX, USAGE_RECORDS_COLLECTION } from './schema'

export interface UsageRecord {
  id: string
  keyId: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  timestamp: number
}

export interface RecordUsageParams {
  keyId: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

interface ModelMetrics {
  requests: number
  inputTokens: number
  outputTokens: number
  totalLatency: number
  avgLatencyMs?: number
}

interface KeyMetrics {
  requests: number
  inputTokens: number
  outputTokens: number
}

interface PeriodMetrics {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface AggregatedMetrics {
  lastHour: PeriodMetrics
  last24h: PeriodMetrics
  byModel: Record<string, ModelMetrics>
  byKey: Record<string, KeyMetrics>
}

export class MetricsService {
  constructor(private db: HyperDB) {}

  async recordUsage({
    keyId,
    model,
    inputTokens,
    outputTokens,
    latencyMs,
  }: RecordUsageParams): Promise<UsageRecord> {
    const record: UsageRecord = {
      id: crypto.randomUUID(),
      keyId,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
      timestamp: Date.now(),
    }

    await this.db.insert(USAGE_RECORDS_COLLECTION, record as unknown as Record<string, unknown>)
    await this.db.flush()
    return record
  }

  async getUsageByKey(keyId: string): Promise<UsageRecord[]> {
    const stream = this.db.find(USAGE_BY_KEY_ID_INDEX, { keyId })
    return stream.toArray() as Promise<UsageRecord[]>
  }

  async getUsageByModel(model: string): Promise<UsageRecord[]> {
    const stream = this.db.find(USAGE_BY_MODEL_INDEX, { model })
    return stream.toArray() as Promise<UsageRecord[]>
  }

  async getAllUsage(): Promise<UsageRecord[]> {
    const stream = this.db.find(USAGE_RECORDS_COLLECTION, {})
    return stream.toArray() as Promise<UsageRecord[]>
  }

  async getAggregatedMetrics(): Promise<AggregatedMetrics> {
    const allRecords = await this.getAllUsage()
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Only process records from the last 24h — older data is irrelevant for this view
    const records = allRecords.filter((r) => r.timestamp > oneDayAgo)
    const recentRecords = records.filter((r) => r.timestamp > oneHourAgo)
    const dailyRecords = records

    const byModel: Record<string, ModelMetrics> = {}
    for (const r of dailyRecords) {
      if (!byModel[r.model]) {
        byModel[r.model] = { requests: 0, inputTokens: 0, outputTokens: 0, totalLatency: 0 }
      }
      const m = byModel[r.model] as ModelMetrics
      m.requests++
      m.inputTokens += r.inputTokens
      m.outputTokens += r.outputTokens
      m.totalLatency += r.latencyMs
    }

    for (const model of Object.keys(byModel)) {
      const m = byModel[model] as ModelMetrics
      m.avgLatencyMs = m.requests > 0 ? Math.round(m.totalLatency / m.requests) : 0
    }

    const byKey: Record<string, KeyMetrics> = {}
    for (const r of dailyRecords) {
      if (!byKey[r.keyId]) {
        byKey[r.keyId] = { requests: 0, inputTokens: 0, outputTokens: 0 }
      }
      const k = byKey[r.keyId] as KeyMetrics
      k.requests++
      k.inputTokens += r.inputTokens
      k.outputTokens += r.outputTokens
    }

    return {
      lastHour: {
        totalRequests: recentRecords.length,
        totalInputTokens: recentRecords.reduce((sum, r) => sum + r.inputTokens, 0),
        totalOutputTokens: recentRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      },
      last24h: {
        totalRequests: dailyRecords.length,
        totalInputTokens: dailyRecords.reduce((sum, r) => sum + r.inputTokens, 0),
        totalOutputTokens: dailyRecords.reduce((sum, r) => sum + r.outputTokens, 0),
      },
      byModel,
      byKey,
    }
  }
}
