import RPC from '@hyperswarm/rpc'
import DHT from 'hyperdht'

export async function createRpcServer(config, runtime, rpcOpts = {}) {
  const dht = new DHT({ ...rpcOpts, firewalled: false })
  await dht.ready()
  console.log(`[rpc-server] DHT ready, firewalled: ${dht.firewalled}`)
  const rpc = new RPC({ dht })
  const server = rpc.createServer()

  await server.listen()

  const publicKey = server.address().publicKey

  server.respond('health.check', async () => {
    const healthy = await runtime.isHealthy()
    return Buffer.from(
      JSON.stringify({
        workerId: config.workerId,
        healthy,
        timestamp: Date.now(),
      }),
    )
  })

  server.respond('model.list', async () => {
    const models = await runtime.list()
    return Buffer.from(JSON.stringify(models))
  })

  server.respond('model.pull', async (req) => {
    const { model } = JSON.parse(req.toString())
    const events = []
    await runtime.pull(model, (progress) => {
      events.push(progress)
    })
    return Buffer.from(JSON.stringify({ status: 'completed', model, events }))
  })

  server.respond('model.delete', async (req) => {
    const { model } = JSON.parse(req.toString())
    await runtime.delete(model)
    return Buffer.from(JSON.stringify({ status: 'deleted', model }))
  })

  server.respond('model.show', async (req) => {
    const { model } = JSON.parse(req.toString())
    const info = await runtime.show(model)
    return Buffer.from(JSON.stringify(info))
  })

  server.respond('inference.chat', async (req) => {
    const { model, messages, options } = JSON.parse(req.toString())
    const result = await runtime.chat(model, messages, { ...options, stream: false })
    return Buffer.from(JSON.stringify(result))
  })

  const shutdown = async () => {
    await server.close()
    await rpc.destroy()
  }

  return { rpc, server, publicKey, shutdown }
}
