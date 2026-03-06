import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { NotFoundError } from '../shared/errors.js'
import type { KeyService } from './service.js'

export function createKeyRoutes(
  keyService: KeyService,
): (fastify: FastifyInstance) => Promise<void> {
  return async function keyRoutes(fastify) {
    fastify.post(
      '/api/keys',
      {
        schema: {
          tags: ['API Keys'],
          description: 'Create a new API key. The full key is returned only once.',
          body: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              permissions: { type: 'string', enum: ['inference', 'admin'], default: 'inference' },
              rateLimitRequestsPerMin: { type: 'integer', minimum: 1, default: 60 },
              rateLimitTokensPerHour: { type: 'integer', minimum: 1, default: 100000 },
            },
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                key: { type: 'string', description: 'Full API key — shown only once' },
                prefix: { type: 'string' },
                permissions: { type: 'string' },
                createdAt: { type: 'number' },
              },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const result = await keyService.generate(
          request.body as {
            name: string
            permissions?: string
            rateLimitRequestsPerMin?: number
            rateLimitTokensPerHour?: number
          },
        )
        reply.status(201)
        return {
          id: result.id,
          name: result.name,
          key: result.key,
          prefix: result.prefix,
          permissions: result.permissions,
          createdAt: result.createdAt,
        }
      },
    )

    fastify.get(
      '/api/keys',
      {
        schema: {
          tags: ['API Keys'],
          description: 'List all API keys (prefix only, never full key)',
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  prefix: { type: 'string' },
                  permissions: { type: 'string' },
                  lastUsedAt: { type: 'number' },
                  createdAt: { type: 'number' },
                },
              },
            },
          },
        },
      },
      async () => {
        const keys = await keyService.list()
        return keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          permissions: k.permissions,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        }))
      },
    )

    fastify.get(
      '/api/keys/:id',
      {
        schema: {
          tags: ['API Keys'],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request: FastifyRequest) => {
        const { id } = request.params as { id: string }
        const key = await keyService.getById(id)
        if (!key) throw new NotFoundError('API key')
        return {
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          permissions: key.permissions,
          rateLimitRequestsPerMin: key.rateLimitRequestsPerMin,
          rateLimitTokensPerHour: key.rateLimitTokensPerHour,
          lastUsedAt: key.lastUsedAt,
          createdAt: key.createdAt,
        }
      },
    )

    fastify.delete(
      '/api/keys/:id',
      {
        schema: {
          tags: ['API Keys'],
          params: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
          response: { 204: { type: 'null' } },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string }
        const key = await keyService.getById(id)
        if (!key) throw new NotFoundError('API key')
        await keyService.deleteKey(id)
        reply.status(204)
      },
    )
  }
}
