import DHT from 'hyperdht'
import { loadWorkerConfig } from './config'
import { DbReplica } from './db/replica'
import { WorkerAnnouncer } from './discovery'
import pino from 'pino'
import { createRpcServer } from './rpc-server'
import { OllamaRuntime } from './runtime/ollama'
import { createStreamServer } from './stream-server'

async function main() {
  const config = loadWorkerConfig()
  const logger = pino({ level: config.logLevel })

  logger.info({ workerId: config.workerId }, 'starting worker')

  const runtime = new OllamaRuntime(config)

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
    config.workerSecret,
  )
  logger.info({ workerId: config.workerId, url: streamServer.url }, 'stream server ready')

  const bootstrap = config.dhtBootstrapNodes

  // Single DHT instance shared between RPC server and discovery
  const dht = new DHT({ bootstrap, firewalled: false })
  await dht.ready()
  logger.info({ firewalled: dht.firewalled }, 'shared DHT ready')

  // DB replica — initialized lazily when the gateway sends its DB key
  const replica = new DbReplica('./storage/replica', bootstrap, logger)

  const { publicKey, shutdown: shutdownRpc } = await createRpcServer(config, runtime, {
    dht,
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
      dht,
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
    await dht.destroy()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err: unknown) => {
  const logger = pino({ level: 'error' })
  logger.fatal({ err }, 'worker fatal error')
  process.exit(1)
})
