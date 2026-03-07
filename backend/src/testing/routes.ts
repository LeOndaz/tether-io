import type { FastifyInstance } from 'fastify'
import type { HyperDB } from 'hyperdb'
import type { DeploymentService } from '../deployments/service'
import type { KeyService } from '../keys/service'
import type { Dispatcher } from '../workers/dispatcher'

/**
 * Test-only routes for integration/E2E testing.
 * These are NEVER registered outside NODE_ENV=test.
 * Call `registerTestRoutes` from server.ts conditionally.
 */
export function createTestRoutes(deps: {
  db: HyperDB
  keyService: KeyService
  deploymentService: DeploymentService
  dispatcher: Dispatcher
}): (fastify: FastifyInstance) => Promise<void> {
  const { db, keyService, deploymentService, dispatcher } = deps

  return async function testRoutes(fastify) {
    // Seed an API key and return the full plaintext key (for test clients)
    fastify.post('/test/seed-key', async (_request, reply) => {
      const result = await keyService.generate({ name: `test-${Date.now()}` })
      reply.status(201)
      return { id: result.id, key: result.key, prefix: result.prefix }
    })

    // Wipe all API keys (test isolation)
    fastify.delete('/test/keys', async (_request, reply) => {
      const keys = await keyService.list()
      for (const k of keys) {
        await keyService.deleteKey(k.id)
      }
      return reply.status(204).send()
    })

    // Wipe all deployments (test isolation)
    fastify.delete('/test/deployments', async (_request, reply) => {
      const deployments = await deploymentService.list()
      for (const d of deployments) {
        await deploymentService.remove(d.id)
      }
      return reply.status(204).send()
    })

    // Read a DB record by collection + key (verify replication)
    fastify.get<{ Params: { collection: string; key: string } }>(
      '/test/db/:collection/:key',
      async (request) => {
        const { collection, key } = request.params
        const node = await db.get(collection, { key })
        return { collection, key, value: node?.value ?? null }
      },
    )

    // List registered workers (test can verify discovery)
    fastify.get('/test/workers', async () => {
      return { workers: dispatcher.getWorkers() }
    })

    // Broadcast an RPC call to all workers (test RPC connectivity)
    fastify.post<{ Body: { method: string; payload?: unknown } }>(
      '/test/rpc-broadcast',
      async (request) => {
        const { method, payload } = request.body
        const results = await dispatcher.broadcast(method, payload ?? {})
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
