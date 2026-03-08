import fastifySSE from '@fastify/sse'
import Fastify from 'fastify'
import { createDeploymentRoutes } from './deployments/routes'
import { container } from './di/index'
import { healthRoutes } from './health/routes'
import { createInferenceRoutes } from './inference/routes'
import { createKeyRoutes } from './keys/routes'
import { createMetricsRoutes } from './metrics/routes'
import { createCorsPlugin } from './shared/plugins/cors'
import { errorHandlerPlugin } from './shared/plugins/error-handler'
import { createSwaggerPlugin } from './shared/plugins/swagger'
import { createTestRoutes } from './testing/routes'
import { createWorkerRoutes } from './workers/routes'

const {
  config,
  logger,
  dispatcher,
  discovery,
  keyService,
  deploymentService,
  metricsService,
  authMiddleware,
} = container

const fastify = Fastify({
  logger: {
    level: config.logLevel,
  },
})

// Register plugins
await fastify.register(createCorsPlugin(config))
await fastify.register(errorHandlerPlugin)
await fastify.register(fastifySSE)
await fastify.register(createSwaggerPlugin(config))

// Register routes — services injected from container
await fastify.register(healthRoutes)
await fastify.register(createKeyRoutes(keyService, authMiddleware))
await fastify.register(createDeploymentRoutes(deploymentService, authMiddleware))
await fastify.register(
  createInferenceRoutes(dispatcher, metricsService, deploymentService, authMiddleware),
)
await fastify.register(createMetricsRoutes(metricsService, dispatcher))
await fastify.register(createWorkerRoutes(dispatcher, authMiddleware))

// Test-only routes — never registered in production
if (process.env.NODE_ENV === 'test') {
  await fastify.register(
    createTestRoutes({
      db: container.db,
      keyService,
      deploymentService,
      dispatcher,
    }),
  )
  logger.warn('test routes registered — NODE_ENV=test')
}

// Fail deployments orphaned by a previous gateway crash/restart
await deploymentService.recoverStuckDeployments()

// Start Hyperswarm-based worker discovery and DB replication
await discovery.start()
await container.dbReplicator.start()

await fastify.listen({ port: config.port, host: config.host })

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('shutting down...')
  try {
    await fastify.close()
  } catch (err) {
    logger.error({ err }, 'error closing fastify')
  }
  deploymentService.destroy()
  await container.shutdown()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
