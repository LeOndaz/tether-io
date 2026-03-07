import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { AppConfig } from '../../config/index'

export function createCorsPlugin(config: AppConfig) {
  return fp(async (fastify: FastifyInstance): Promise<void> => {
    await fastify.register(cors, {
      origin: (config.frontendUrl
        ? [config.frontendUrl]
        : ['http://localhost:5173']),
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ],
    })
  })
}
