import { loadWorkerConfig } from './config'
import { DbReplica } from './db/replica'
import { WorkerAnnouncer } from './discovery'
import { createLogger } from './logger'
import { createRpcServer } from './rpc-server'
import { createRuntime } from './runtime/factory'
import { createStreamServer } from './stream-server'

async function main() {
  const config = loadWorkerConfig()
  const logger = createLogger(config.logLevel)

  logger.info({ workerId: config.workerId }, 'starting worker')

  const runtime = createRuntime(config)

  const healthy = await runtime.isHealthy()
  if (!healthy) {
    logger.error(
      { workerId: config.workerId, ollamaUrl: config.ollamaUrl },
      'model runtime is not reachable',
    )
    process.exit(1)
  }
  logger.info({ workerId: config.workerId }, 'model runtime connected')

  // Start HTTP streaming server for real-time inference
  const streamServer = await createStreamServer(
    runtime,
    config.streamPort,
    config.streamHost,
    logger,
  )
  logger.info({ workerId: config.workerId, url: streamServer.url }, 'stream server ready')

  // RPC server uses DHT for P2P communication
  const bootstrap = config.dhtBootstrap
    ? (() => {
        const parts = config.dhtBootstrap.split(':')
        const host = parts[0] ?? 'localhost'
        const port = Number.parseInt(parts[1] ?? '49737', 10)
        if (Number.isNaN(port) || port < 1 || port > 65535) {
          throw new Error(`Invalid DHT_BOOTSTRAP port: ${parts[1]}`)
        }
        return [{ host, port }]
      })()
    : undefined

  // DB replica — initialized lazily when the gateway sends its DB key
  const replica = new DbReplica('./storage/replica', bootstrap, logger)

  const { publicKey, shutdown: shutdownRpc } = await createRpcServer(config, runtime, {
    bootstrap,
    logger,
  })
  const rpcPublicKeyHex = publicKey.toString('hex')
  logger.info(
    { workerId: config.workerId, publicKey: `${rpcPublicKeyHex.slice(0, 16)}...` },
    'rpc server listening',
  )

  // Announce on Hyperswarm topic — gateway discovers us automatically
  const announcer = new WorkerAnnouncer(
    {
      workerId: config.workerId,
      rpcPublicKey: rpcPublicKeyHex,
      streamUrl: streamServer.url,
    },
    {
      topicBuffer: config.clusterTopicBuffer,
      dhtBootstrap: bootstrap,
    },
    logger,
    async (dbKeyHex) => {
      if (!replica.db) {
        logger.info({ dbKey: dbKeyHex.slice(0, 16) }, 'received gateway DB key — starting replica')
        try {
          await replica.start(dbKeyHex)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          logger.error({ err: msg }, 'failed to start DB replica')
        }
      }
    },
  )
  await announcer.start()

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ workerId: config.workerId }, 'shutting down')
    await announcer.shutdown()
    await shutdownRpc()
    await streamServer.shutdown()
    await replica.shutdown()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err: unknown) => {
  const logger = createLogger('error')
  logger.fatal({ err }, 'worker fatal error')
  process.exit(1)
})
