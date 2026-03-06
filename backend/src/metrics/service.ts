import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'
import { COLLECTIONS, INDEXES } from '../db/index.js'

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

export interface MetricsService {
  recordUsage(params: RecordUsageParams): Promise<UsageRecord>
  getUsageByKey(keyId: string): Promise<UsageRecord[]>
  getUsageByModel(model: string): Promise<UsageRecord[]>
  getAllUsage(): Promise<UsageRecord[]>
  getAggregatedMetrics(): Promise<AggregatedMetrics>
}

export function createMetricsService(db: HyperDB): MetricsService {
  return {
    async recordUsage({ keyId, model, inputTokens, outputTokens, latencyMs }) {
      const record: UsageRecord = {
        id: crypto.randomUUID(),
        keyId,
        model,
        inputTokens,
        outputTokens,
        latencyMs,
        timestamp: Date.now(),
      }

      await db.insert(COLLECTIONS.USAGE_RECORDS, record as unknown as Record<string, unknown>)
      await db.flush()
      return record
    },

    async getUsageByKey(keyId) {
      const stream = db.find(INDEXES.USAGE_BY_KEY_ID, { keyId })
      return stream.toArray() as Promise<UsageRecord[]>
    },

    async getUsageByModel(model) {
      const stream = db.find(INDEXES.USAGE_BY_MODEL, { model })
      return stream.toArray() as Promise<UsageRecord[]>
    },

    async getAllUsage() {
      const stream = db.find(COLLECTIONS.USAGE_RECORDS, {})
      return stream.toArray() as Promise<UsageRecord[]>
    },

    async getAggregatedMetrics() {
      const records = await this.getAllUsage()
      const now = Date.now()
      const oneHourAgo = now - 60 * 60 * 1000
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      const recentRecords = records.filter((r) => r.timestamp > oneHourAgo)
      const dailyRecords = records.filter((r) => r.timestamp > oneDayAgo)

      // Per-model aggregation
      const byModel: Record<string, ModelMetrics> = {}
      for (const r of dailyRecords) {
        if (!byModel[r.model]) {
          byModel[r.model] = { requests: 0, inputTokens: 0, outputTokens: 0, totalLatency: 0 }
        }
        const modelMetrics = byModel[r.model] as ModelMetrics
        modelMetrics.requests++
        modelMetrics.inputTokens += r.inputTokens
        modelMetrics.outputTokens += r.outputTokens
        modelMetrics.totalLatency += r.latencyMs
      }

      for (const model of Object.keys(byModel)) {
        const m = byModel[model] as ModelMetrics
        m.avgLatencyMs = Math.round(m.totalLatency / m.requests)
      }

      // Per-key aggregation
      const byKey: Record<string, KeyMetrics> = {}
      for (const r of dailyRecords) {
        if (!byKey[r.keyId]) {
          byKey[r.keyId] = { requests: 0, inputTokens: 0, outputTokens: 0 }
        }
        const keyMetrics = byKey[r.keyId] as KeyMetrics
        keyMetrics.requests++
        keyMetrics.inputTokens += r.inputTokens
        keyMetrics.outputTokens += r.outputTokens
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
    },
  }
}
