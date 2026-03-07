import type { FastifyInstance } from 'fastify'
import { Type } from 'typebox'

const HealthResponse = Type.Object({
  status: Type.String(),
  uptime: Type.Number(),
  timestamp: Type.String(),
})

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        description: 'Health check endpoint',
        response: {
          200: HealthResponse,
        },
      },
    },
    async () => {
      return {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }
    },
  )
}
