import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { NotFoundError, ValidationError } from '../shared/errors.js'
import type { DeploymentService } from './service.js'

export function createDeploymentRoutes(
  deploymentService: DeploymentService,
): (fastify: FastifyInstance) => Promise<void> {
  return async function deploymentRoutes(fastify) {
    fastify.post(
      '/api/deployments',
      {
        schema: {
          tags: ['Deployments'],
          description: 'Deploy a model to worker nodes',
          body: {
            type: 'object',
            required: ['model'],
            properties: {
              model: { type: 'string', minLength: 1 },
              contextWindow: { type: 'integer', minimum: 512 },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              maxTokens: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const deployment = await deploymentService.create(
          request.body as {
            model: string
            contextWindow?: number
            temperature?: number
            maxTokens?: number
          },
        )
        reply.status(201)
        return deployment
      },
    )

    fastify.get(
      '/api/deployments',
      {
        schema: {
          tags: ['Deployments'],
          description: 'List all deployments',
        },
      },
      async () => {
        return deploymentService.list()
      },
    )

    fastify.get(
      '/api/deployments/:id',
      {
        schema: {
          tags: ['Deployments'],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest) => {
        const { id } = request.params as { id: string }
        const deployment = await deploymentService.getById(id)
        if (!deployment) throw new NotFoundError('Deployment')
        return deployment
      },
    )

    fastify.patch(
      '/api/deployments/:id',
      {
        schema: {
          tags: ['Deployments'],
          description: 'Update deployment configuration',
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
          body: {
            type: 'object',
            properties: {
              contextWindow: { type: 'integer', minimum: 512 },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              maxTokens: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      async (request: FastifyRequest) => {
        const { id } = request.params as { id: string }
        const updated = await deploymentService.update(
          id,
          request.body as {
            contextWindow?: number
            temperature?: number
            maxTokens?: number
          },
        )
        if (!updated) throw new NotFoundError('Deployment')
        return updated
      },
    )

    fastify.delete(
      '/api/deployments/:id',
      {
        schema: {
          tags: ['Deployments'],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string }
        const deleted = await deploymentService.remove(id)
        if (!deleted) throw new NotFoundError('Deployment')
        reply.status(204)
      },
    )

    fastify.post(
      '/api/deployments/:id/cancel',
      {
        schema: {
          tags: ['Deployments'],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest) => {
        const { id } = request.params as { id: string }
        const cancelled = await deploymentService.cancel(id)
        if (!cancelled) {
          throw new ValidationError('Deployment cannot be cancelled in its current state')
        }
        return { status: 'cancelled' }
      },
    )

    // SSE endpoint for deployment logs
    fastify.get(
      '/api/deployments/:id/logs',
      {
        schema: {
          tags: ['Deployments'],
          description: 'Stream deployment logs via SSE',
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string }
        const deployment = await deploymentService.getById(id)
        if (!deployment) throw new NotFoundError('Deployment')

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })

        // Send current status immediately
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'status', message: `Current status: ${deployment.status}`, timestamp: Date.now() })}\n\n`,
        )

        const unsubscribe = deploymentService.subscribeLogs(id, (event) => {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        })

        request.raw.on('close', () => {
          unsubscribe()
        })
      },
    )
  }
}
