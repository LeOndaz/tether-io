import type { FastifyInstance } from 'fastify'
import { Type } from 'typebox'
import type { AuthMiddleware } from '../auth/types'
import type { Dispatcher } from './dispatcher'

const WorkerInfo = Type.Object({
  workerId: Type.String(),
  publicKey: Type.String(),
  healthy: Type.Boolean(),
  activeJobs: Type.Number(),
  streamUrl: Type.Union([Type.String(), Type.Null()]),
  loadedModels: Type.Array(Type.String()),
  lastHealthCheck: Type.Number(),
})

export function createWorkerRoutes(
  dispatcher: Dispatcher,
  sessionAuth: AuthMiddleware,
): (fastify: FastifyInstance) => Promise<void> {
  return async function workerRoutes(fastify) {
    fastify.get(
      '/internal/workers',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['Internal'],
          description: 'List all known workers and their status',
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

    fastify.get(
      '/internal/workers/health-check',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['Internal'],
          description: 'Test RPC connectivity to all workers',
          security: [{ cookieAuth: [] }],
          response: {
            200: Type.Object({
              results: Type.Array(
                Type.Object({
                  status: Type.String(),
                  value: Type.Optional(Type.Any()),
                  reason: Type.Optional(Type.String()),
                }),
              ),
            }),
          },
        },
      },
      async () => {
        const results = await dispatcher.broadcast('health.check', {})
        return {
          results: results.map((r) => ({
            status: r.status,
            value: r.status === 'fulfilled' ? r.value : undefined,
            reason: r.status === 'rejected' ? r.reason?.message : undefined,
          })),
        }
      },
    )
  }
}
