import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../../config/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
  }
}

export async function swaggerPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'AI PaaS API',
        description:
          'GPU Cloud Service Platform — OpenAI-compatible inference, API key management, model deployments',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${fastify.config.port}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'API key (sk-...)',
          },
        },
      },
    },
  })

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  })
}
