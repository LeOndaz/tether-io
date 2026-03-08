import type { FastifyInstance } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import type { AuthMiddleware } from '../auth/types'
import type { Dispatcher } from '../workers/dispatcher'
import type { MetricsService } from './service'

const PeriodMetrics = Type.Object({
  totalRequests: Type.Number(),
  totalInputTokens: Type.Number(),
  totalOutputTokens: Type.Number(),
})

const ModelMetrics = Type.Object({
  requests: Type.Number(),
  inputTokens: Type.Number(),
  outputTokens: Type.Number(),
  totalLatency: Type.Number(),
  avgLatencyMs: Type.Optional(Type.Number()),
})

const KeyMetrics = Type.Object({
  requests: Type.Number(),
  inputTokens: Type.Number(),
  outputTokens: Type.Number(),
})

const AggregatedMetricsResponse = Type.Object({
  lastHour: PeriodMetrics,
  last24h: PeriodMetrics,
  byModel: Type.Record(Type.String(), ModelMetrics),
  byKey: Type.Record(Type.String(), KeyMetrics),
})

const UsageRecordSchema = Type.Object({
  id: Type.String(),
  keyId: Type.String(),
  model: Type.String(),
  inputTokens: Type.Number(),
  outputTokens: Type.Number(),
  latencyMs: Type.Number(),
  timestamp: Type.Number(),
})

const WorkerInfo = Type.Object({
  workerId: Type.String(),
  publicKey: Type.String(),
  healthy: Type.Boolean(),
  activeJobs: Type.Number(),
  streamUrl: Type.Union([Type.String(), Type.Null()]),
  loadedModels: Type.Array(Type.String()),
  lastHealthCheck: Type.Number(),
})

const KeyIdParams = Type.Object({
  keyId: Type.String(),
})

export function createMetricsRoutes(
  metricsService: MetricsService,
  dispatcher: Dispatcher,
  sessionAuth: AuthMiddleware,
): (fastify: FastifyInstance) => Promise<void> {
  return async function metricsRoutes(fastify) {
    fastify.get(
      '/api/metrics',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['Metrics'],
          description: 'Get aggregated usage metrics',
          security: [{ cookieAuth: [] }],
          response: { 200: AggregatedMetricsResponse },
        },
      },
      async () => {
        return metricsService.getAggregatedMetrics()
      },
    )

    fastify.get<{ Params: Static<typeof KeyIdParams> }>(
      '/api/metrics/keys/:keyId',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['Metrics'],
          description: 'Get usage records for a specific API key',
          security: [{ cookieAuth: [] }],
          params: KeyIdParams,
          response: {
            200: Type.Object({
              keyId: Type.String(),
              records: Type.Array(UsageRecordSchema),
            }),
          },
        },
      },
      async (request) => {
        const { keyId } = request.params
        const records = await metricsService.getUsageByKey(keyId)
        return { keyId, records }
      },
    )

    fastify.get(
      '/api/metrics/workers',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['Metrics'],
          description: 'Get worker status information',
          security: [{ cookieAuth: [] }],
          response: {
            200: Type.Object({ workers: Type.Array(WorkerInfo) }),
          },
        },
      },
      async () => {
        return { workers: dispatcher.getWorkers() }
      },
    )
  }
}
