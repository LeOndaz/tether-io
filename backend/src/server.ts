import Fastify from 'fastify'
import type { AppConfig } from './config/index.js'
import { loadConfig } from './config/index.js'
import { createDatabase } from './db/index.js'
import { createDeploymentRoutes } from './deployments/routes.js'
import { createDeploymentService } from './deployments/service.js'
import { healthRoutes } from './health/routes.js'
import { createInferenceRoutes } from './inference/routes.js'
import { createKeyRoutes } from './keys/routes.js'
import { createKeyService } from './keys/service.js'
import { createMetricsRoutes } from './metrics/routes.js'
import { createMetricsService } from './metrics/service.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { corsPlugin } from './shared/plugins/cors.js'
import { errorHandlerPlugin } from './shared/plugins/error-handler.js'
import { swaggerPlugin } from './shared/plugins/swagger.js'
import { CompositeRateLimiter } from './shared/rate-limit/limiter.js'
import { SlidingWindowStrategy } from './shared/rate-limit/strategies/sliding-window.js'
import { TokenBucketStrategy } from './shared/rate-limit/strategies/token-bucket.js'
import { createDispatcher } from './workers/dispatcher.js'
import { createWorkerRoutes } from './workers/routes.js'
import { ModelAffinityStrategy } from './workers/strategies/model-affinity.js'

export function buildServer(config: AppConfig) {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
  })

  fastify.decorate('config', config)

  return fastify
}

export async function startServer(config: AppConfig) {
  const fastify = buildServer(config)

  // Initialize database
  const db = await createDatabase('./storage/gateway')

  // Initialize services (no singletons — each created explicitly)
  const keyService = createKeyService(db)
  const metricsService = createMetricsService(db)

  // Rate limiter: request-based (token bucket) + context-based (sliding window for tokens)
  const rateLimiter = new CompositeRateLimiter([
    {
      name: 'requests',
      strategy: new TokenBucketStrategy({
        capacity: config.rateLimit.requestsPerMin,
        refillRate: Math.ceil(config.rateLimit.requestsPerMin / 6),
        refillIntervalMs: 10_000,
      }),
    },
    {
      name: 'tokens',
      strategy: new SlidingWindowStrategy({
        limit: config.rateLimit.tokensPerHour,
        windowMs: 60 * 60 * 1000,
      }),
    },
  ])

  // RPC dispatcher with model affinity load balancing
  const dispatcher = await createDispatcher(config, new ModelAffinityStrategy())
  const deploymentService = createDeploymentService(db, dispatcher)

  // Auth middleware
  const authMiddleware = createAuthMiddleware(keyService, rateLimiter)

  // Register plugins
  await fastify.register(corsPlugin)
  await fastify.register(errorHandlerPlugin)
  await fastify.register(swaggerPlugin)

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(createKeyRoutes(keyService))
  await fastify.register(createDeploymentRoutes(deploymentService))
  await fastify.register(createInferenceRoutes(dispatcher, metricsService, authMiddleware))
  await fastify.register(createMetricsRoutes(metricsService, dispatcher))
  await fastify.register(createWorkerRoutes(dispatcher))

  await fastify.listen({ port: config.port, host: config.host })

  const shutdown = async () => {
    fastify.log.info('shutting down...')
    await fastify.close()
    await dispatcher.shutdown()
    await db.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return fastify
}

const config = loadConfig()
startServer(config)
