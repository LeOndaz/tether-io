import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import type { AuthMiddleware } from '../auth/types'
import { NotFoundError, ValidationError } from '../shared/errors'
import type { DeploymentService } from './service'

const CreateDeploymentBody = Type.Object(
  {
    model: Type.String({ minLength: 1, pattern: '^[a-zA-Z0-9._:\\-/]{1,128}$' }),
    verbose: Type.Optional(Type.Boolean({ default: false })),
    contextWindow: Type.Optional(Type.Integer({ minimum: 512 })),
    temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
    maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)

const UpdateDeploymentBody = Type.Object(
  {
    contextWindow: Type.Optional(Type.Integer({ minimum: 512 })),
    temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
    maxTokens: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)

const DeploymentResponse = Type.Object({
  id: Type.String(),
  model: Type.String(),
  status: Type.String(),
  verbose: Type.Boolean(),
  contextWindow: Type.Integer(),
  temperature: Type.Number(),
  maxTokens: Type.Integer(),
  createdAt: Type.Number(),
  updatedAt: Type.Number(),
})

const IdParams = Type.Object({
  id: Type.String(),
})

export function createDeploymentRoutes(
  deploymentService: DeploymentService,
  authMiddleware: AuthMiddleware,
): (fastify: FastifyInstance) => Promise<void> {
  return async function deploymentRoutes(fastify) {
    fastify.post<{ Body: Static<typeof CreateDeploymentBody> }>(
      '/api/deployments',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'Deploy a model to worker nodes',
          security: [{ bearerAuth: [] }],
          body: CreateDeploymentBody,
          response: { 201: DeploymentResponse },
        },
      },
      async (request, reply: FastifyReply) => {
        const deployment = await deploymentService.create(request.body)
        reply.status(201)
        return deployment
      },
    )

    fastify.get(
      '/api/deployments',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'List all deployments',
          security: [{ bearerAuth: [] }],
          response: { 200: Type.Array(DeploymentResponse) },
        },
      },
      async () => {
        return deploymentService.list()
      },
    )

    fastify.get<{ Params: Static<typeof IdParams> }>(
      '/api/deployments/:id',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          params: IdParams,
          security: [{ bearerAuth: [] }],
          response: { 200: DeploymentResponse },
        },
      },
      async (request) => {
        const { id } = request.params
        const deployment = await deploymentService.getById(id)
        if (!deployment) throw new NotFoundError('Deployment not found')
        return deployment
      },
    )

    fastify.patch<{ Params: Static<typeof IdParams>; Body: Static<typeof UpdateDeploymentBody> }>(
      '/api/deployments/:id',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'Update deployment configuration',
          params: IdParams,
          security: [{ bearerAuth: [] }],
          body: UpdateDeploymentBody,
          response: { 200: DeploymentResponse },
        },
      },
      async (request) => {
        const { id } = request.params
        const updated = await deploymentService.update(id, request.body)
        if (!updated) throw new NotFoundError('Deployment not found')
        return updated
      },
    )

    fastify.delete<{ Params: Static<typeof IdParams> }>(
      '/api/deployments/:id',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'Delete a deployment',
          params: IdParams,
          security: [{ bearerAuth: [] }],
          response: { 204: Type.Null() },
        },
      },
      async (request, reply: FastifyReply) => {
        const { id } = request.params
        const deleted = await deploymentService.remove(id)
        if (!deleted) throw new NotFoundError('Deployment not found')
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: Static<typeof IdParams> }>(
      '/api/deployments/:id/cancel',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'Cancel an in-progress deployment',
          params: IdParams,
          security: [{ bearerAuth: [] }],
          response: { 200: Type.Object({ status: Type.String() }) },
        },
      },
      async (request) => {
        const { id } = request.params
        const cancelled = await deploymentService.cancel(id)
        if (!cancelled) {
          throw new ValidationError('Deployment cannot be cancelled in its current state')
        }
        return { status: 'cancelled' }
      },
    )

    fastify.get<{ Params: Static<typeof IdParams> }>(
      '/api/deployments/:id/logs',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Deployments'],
          description: 'Stream deployment logs via SSE',
          params: IdParams,
          security: [{ bearerAuth: [] }],
        },
        sse: true,
      },
      async (request, reply) => {
        const { id } = request.params
        const deployment = await deploymentService.getById(id)
        if (!deployment) throw new NotFoundError('Deployment not found')

        await reply.sse.send({
          data: {
            type: 'status',
            message: `Current status: ${deployment.status}`,
            timestamp: Date.now(),
          },
        })

        // Terminal states — send status and close
        if (deployment.status === 'ready' || deployment.status === 'failed') {
          reply.sse.close()
          return
        }

        reply.sse.keepAlive()

        // Serialize writes to prevent interleaved SSE frames and respect backpressure
        let sendQueue: Promise<void> = Promise.resolve()
        const unsubscribe = deploymentService.subscribeLogs(id, (event) => {
          if (!reply.sse.isConnected) return
          sendQueue = sendQueue.then(async () => {
            if (!reply.sse.isConnected) return
            try {
              await reply.sse.send({ data: event })
            } catch {
              // Connection closed between isConnected check and send
              unsubscribe()
              return
            }
            if (event.message === 'Model deployed successfully' || event.type === 'error') {
              unsubscribe()
              reply.sse.close()
            }
          })
        })

        reply.sse.onClose(() => {
          unsubscribe()
        })
      },
    )
  }
}
