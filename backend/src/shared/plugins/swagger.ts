import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { AppConfig } from '../../config/index'

export function createSwaggerPlugin(config: AppConfig) {
  return fp(async (fastify: FastifyInstance): Promise<void> => {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'AI PaaS API',
          description:
            'GPU Cloud Service Platform — OpenAI-compatible inference, API key management, model deployments',
          version: '0.1.0',
        },
        servers: [{ url: `http://localhost:${config.port}` }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              description: 'API key (sk-...)',
            },
            cookieAuth: {
              type: 'apiKey',
              in: 'cookie',
              name: 'session',
              description: 'Session cookie (login via /auth/login)',
            },
          },
        },
      },
    })

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
    })
  })
}
