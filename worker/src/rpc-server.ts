import RPC from '@hyperswarm/rpc'
import DHT from 'hyperdht'
import type { WorkerConfig } from './config'
import type { Logger } from './logger'
import type { ModelRuntime } from './runtime/interface'

interface RpcBootstrapOptions {
  bootstrap?: Array<{ host: string; port: number }>
  logger: Logger
  dht?: DHT
}

interface RpcServerResult {
  publicKey: Buffer
  shutdown: () => Promise<void>
}

export async function createRpcServer(
  config: WorkerConfig,
  runtime: ModelRuntime,
  rpcOpts: RpcBootstrapOptions,
): Promise<RpcServerResult> {
  const { logger, dht: externalDht, ...dhtOpts } = rpcOpts
  const ownsDht = !externalDht
  const dht = externalDht ?? new DHT({ ...dhtOpts, firewalled: false })
  if (ownsDht) {
    await dht.ready()
  }
  logger.info({ firewalled: dht.firewalled }, 'DHT ready')
  const rpc = new RPC({ dht })
  const server = rpc.createServer()

  await server.listen()

  const publicKey = server.address().publicKey

  function rpcError(err: unknown): Buffer {
    const message = err instanceof Error ? err.message : String(err)
    return Buffer.from(JSON.stringify({ error: message }))
  }

  server.respond('health.check', async () => {
    try {
      const healthy = await runtime.isHealthy()
      return Buffer.from(
        JSON.stringify({
          workerId: config.workerId,
          healthy,
          timestamp: Date.now(),
        }),
      )
    } catch (err) {
      return rpcError(err)
    }
  })

  server.respond('model.list', async () => {
    try {
      const models = await runtime.list()
      return Buffer.from(JSON.stringify(models))
    } catch (err) {
      return rpcError(err)
    }
  })

  server.respond('model.pull', async (req: Buffer) => {
    try {
      const { model } = JSON.parse(req.toString()) as { model: string }
      await runtime.pull(model, () => {})
      return Buffer.from(JSON.stringify({ status: 'completed', model }))
    } catch (err) {
      return rpcError(err)
    }
  })

  server.respond('model.delete', async (req: Buffer) => {
    try {
      const { model } = JSON.parse(req.toString()) as { model: string }
      await runtime.delete(model)
      return Buffer.from(JSON.stringify({ status: 'deleted', model }))
    } catch (err) {
      return rpcError(err)
    }
  })

  server.respond('model.show', async (req: Buffer) => {
    try {
      const { model } = JSON.parse(req.toString()) as { model: string }
      const info = await runtime.show(model)
      return Buffer.from(JSON.stringify(info))
    } catch (err) {
      return rpcError(err)
    }
  })

  server.respond('inference.chat', async (req: Buffer) => {
    try {
      const { model, messages, options } = JSON.parse(req.toString()) as {
        model: string
        messages: Array<{ role: string; content: string }>
        options?: Record<string, unknown>
      }
      const result = await runtime.chat(model, messages, { ...options, stream: false })
      return Buffer.from(JSON.stringify(result))
    } catch (err) {
      return rpcError(err)
    }
  })

  const shutdown = async () => {
    await server.close()
    await rpc.destroy()
    if (ownsDht) {
      await dht.destroy()
    }
  }

  return { publicKey, shutdown }
}
