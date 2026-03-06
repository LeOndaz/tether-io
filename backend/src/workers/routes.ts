import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Dispatcher } from './dispatcher.js'

export function createWorkerRoutes(
  dispatcher: Dispatcher,
): (fastify: FastifyInstance) => Promise<void> {
  return async function workerRoutes(fastify) {
    fastify.post(
      '/internal/workers/register',
      {
        schema: {
          tags: ['Internal'],
          description: 'Register a worker with the gateway',
          body: {
            type: 'object',
            required: ['workerId', 'rpcPublicKey'],
            properties: {
              workerId: { type: 'string' },
              rpcPublicKey: { type: 'string' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      async (request: FastifyRequest) => {
        dispatcher.registerWorker(request.body as { workerId: string; rpcPublicKey: string })
        return { status: 'registered' }
      },
    )

    fastify.get(
      '/internal/workers/health-check',
      {
        schema: {
          tags: ['Internal'],
          description: 'Test RPC connectivity to all workers',
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

    fastify.post(
      '/internal/workers/deregister',
      {
        schema: {
          tags: ['Internal'],
          body: {
            type: 'object',
            required: ['rpcPublicKey'],
            properties: {
              rpcPublicKey: { type: 'string' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      async (request: FastifyRequest) => {
        dispatcher.deregisterWorker(request.body as { rpcPublicKey: string })
        return { status: 'deregistered' }
      },
    )
  }
}
