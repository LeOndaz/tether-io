import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Dispatcher } from '../workers/dispatcher.js'
import type { MetricsService } from './service.js'

export function createMetricsRoutes(
  metricsService: MetricsService,
  dispatcher: Dispatcher,
): (fastify: FastifyInstance) => Promise<void> {
  return async function metricsRoutes(fastify) {
    fastify.get(
      '/api/metrics',
      {
        schema: {
          tags: ['Metrics'],
          description: 'Get aggregated usage metrics',
        },
      },
      async () => {
        return metricsService.getAggregatedMetrics()
      },
    )

    fastify.get(
      '/api/metrics/keys/:keyId',
      {
        schema: {
          tags: ['Metrics'],
          params: {
            type: 'object',
            properties: { keyId: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest) => {
        const { keyId } = request.params as { keyId: string }
        const records = await metricsService.getUsageByKey(keyId)
        return { keyId, records }
      },
    )

    fastify.get(
      '/api/metrics/workers',
      {
        schema: {
          tags: ['Metrics'],
          description: 'Get worker status information',
        },
      },
      async () => {
        return { workers: dispatcher.getWorkers() }
      },
    )
  }
}
