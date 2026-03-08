import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'

const USAGE_RECORDS_COLLECTION = '@aipaas/usageRecords' as const
const USAGE_BY_KEY_ID_INDEX = '@aipaas/usageRecords-by-keyId' as const
const USAGE_BY_MODEL_INDEX = '@aipaas/usageRecords-by-model' as const
const USAGE_BY_TIMESTAMP_INDEX = '@aipaas/usageRecords-by-timestamp' as const

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

  // unused — kept for future per-model usage queries
  async getUsageByModel(model: string): Promise<UsageRecord[]> {
    const stream = this.db.find(USAGE_BY_MODEL_INDEX, { model })
    return stream.toArray() as Promise<UsageRecord[]>
  }

  // unused — kept for future full-scan queries
  async getAllUsage(): Promise<UsageRecord[]> {
    const stream = this.db.find(USAGE_RECORDS_COLLECTION, {})
    return stream.toArray() as Promise<UsageRecord[]>
  }

  async getAggregatedMetrics(): Promise<AggregatedMetrics> {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    const lastHour: PeriodMetrics = { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0 }
    const last24h: PeriodMetrics = { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0 }
    const byModel: Record<string, ModelMetrics> = {}
    const byKey: Record<string, KeyMetrics> = {}

    // Range query on timestamp index — only reads records from the last 24h
    // instead of scanning the entire usage history.
    const records = (await this.db
      .find(USAGE_BY_TIMESTAMP_INDEX, { gte: { timestamp: oneDayAgo } })
      .toArray()) as unknown as UsageRecord[]

    for (const r of records) {
      last24h.totalRequests++
      last24h.totalInputTokens += r.inputTokens
      last24h.totalOutputTokens += r.outputTokens

      if (r.timestamp > oneHourAgo) {
        lastHour.totalRequests++
        lastHour.totalInputTokens += r.inputTokens
        lastHour.totalOutputTokens += r.outputTokens
      }

      if (!byModel[r.model]) {
        byModel[r.model] = { requests: 0, inputTokens: 0, outputTokens: 0, totalLatency: 0 }
      }
      const m = byModel[r.model] as ModelMetrics
      m.requests++
      m.inputTokens += r.inputTokens
      m.outputTokens += r.outputTokens
      m.totalLatency += r.latencyMs

      if (!byKey[r.keyId]) {
        byKey[r.keyId] = { requests: 0, inputTokens: 0, outputTokens: 0 }
      }
      const k = byKey[r.keyId] as KeyMetrics
      k.requests++
      k.inputTokens += r.inputTokens
      k.outputTokens += r.outputTokens
    }

    for (const model of Object.keys(byModel)) {
      const m = byModel[model] as ModelMetrics
      m.avgLatencyMs = m.requests > 0 ? Math.round(m.totalLatency / m.requests) : 0
    }

    return { lastHour, last24h, byModel, byKey }
  }
}
