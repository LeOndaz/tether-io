import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import type { AuthMiddleware } from '../auth/types'
import { NotFoundError } from '../shared/errors'
import type { KeyService } from './service'

const CreateKeyBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  permissions: Type.Optional(
    Type.Union([Type.Literal('inference'), Type.Literal('admin')], { default: 'inference' }),
  ),
  rateLimitRequestsPerMin: Type.Optional(Type.Integer({ minimum: 1, default: 60 })),
  rateLimitTokensPerHour: Type.Optional(Type.Integer({ minimum: 1, default: 100000 })),
})

const CreateKeyResponse = Type.Object({
  id: Type.String(),
  name: Type.String(),
  key: Type.String({ description: 'Full API key — shown only once' }),
  prefix: Type.String(),
  permissions: Type.String(),
  createdAt: Type.Number(),
})

const KeyListItem = Type.Object({
  id: Type.String(),
  name: Type.String(),
  prefix: Type.String(),
  permissions: Type.String(),
  lastUsedAt: Type.Union([Type.Number(), Type.Null()]),
  createdAt: Type.Number(),
})

const IdParams = Type.Object({
  id: Type.String(),
})

export function createKeyRoutes(
  keyService: KeyService,
  sessionAuth: AuthMiddleware,
): (fastify: FastifyInstance) => Promise<void> {
  return async function keyRoutes(fastify) {
    fastify.post<{ Body: Static<typeof CreateKeyBody> }>(
      '/api/keys',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['API Keys'],
          description: 'Create a new API key. The full key is returned only once.',
          security: [{ cookieAuth: [] }],
          body: CreateKeyBody,
          response: {
            201: CreateKeyResponse,
          },
        },
      },
      async (request, reply: FastifyReply) => {
        const result = await keyService.generate(request.body)
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
        preHandler: [sessionAuth],
        schema: {
          tags: ['API Keys'],
          description: 'List all API keys (prefix only, never full key)',
          security: [{ cookieAuth: [] }],
          response: {
            200: Type.Array(KeyListItem),
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

    const KeyDetail = Type.Object({
      id: Type.String(),
      name: Type.String(),
      prefix: Type.String(),
      permissions: Type.String(),
      rateLimitRequestsPerMin: Type.Number(),
      rateLimitTokensPerHour: Type.Number(),
      lastUsedAt: Type.Union([Type.Number(), Type.Null()]),
      createdAt: Type.Number(),
    })

    fastify.get<{ Params: Static<typeof IdParams> }>(
      '/api/keys/:id',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['API Keys'],
          description: 'Get API key details by ID',
          params: IdParams,
          security: [{ cookieAuth: [] }],
          response: { 200: KeyDetail },
        },
      },
      async (request) => {
        const { id } = request.params
        const key = await keyService.getById(id)
        if (!key) throw new NotFoundError('API key not found')
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

    fastify.delete<{ Params: Static<typeof IdParams> }>(
      '/api/keys/:id',
      {
        preHandler: [sessionAuth],
        schema: {
          tags: ['API Keys'],
          params: IdParams,
          security: [{ cookieAuth: [] }],
          response: { 204: Type.Null() },
        },
      },
      async (request, reply: FastifyReply) => {
        const { id } = request.params
        const key = await keyService.getById(id)
        if (!key) throw new NotFoundError('API key not found')
        await keyService.deleteKey(id)
        return reply.status(204).send()
      },
    )
  }
}
