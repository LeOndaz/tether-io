import { loadWorkerConfig } from './config.js'
import { createRuntime } from './runtime/factory.js'
import { createRpcServer } from './rpc-server.js'

async function main() {
  const config = loadWorkerConfig()
  console.log(`[${config.workerId}] starting worker...`)

  const runtime = createRuntime(config)

  const healthy = await runtime.isHealthy()
  if (!healthy) {
    console.error(`[${config.workerId}] model runtime is not reachable at ${config.ollamaUrl}`)
    process.exit(1)
  }
  console.log(`[${config.workerId}] model runtime connected`)

  // RPC server uses DHT for P2P communication
  const bootstrap = config.dhtBootstrap
    ? [{ host: config.dhtBootstrap.split(':')[0], port: Number(config.dhtBootstrap.split(':')[1]) }]
    : undefined

  const { publicKey, shutdown: shutdownRpc } = await createRpcServer(config, runtime, { bootstrap })
  const rpcPublicKeyHex = publicKey.toString('hex')
  console.log(`[${config.workerId}] rpc server listening, public key: ${rpcPublicKeyHex.slice(0, 16)}...`)

  // Register with the gateway via HTTP
  const gatewayUrl = config.gatewayUrl
  const registerPayload = { workerId: config.workerId, rpcPublicKey: rpcPublicKeyHex }

  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch(`${gatewayUrl}/internal/workers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      console.log(`[${config.workerId}] registered with gateway`)
      break
    } catch (err) {
      if (attempt === 15) {
        console.error(`[${config.workerId}] failed to register after 15 attempts: ${err.message}`)
        process.exit(1)
      }
      console.log(`[${config.workerId}] gateway not ready, retrying (${attempt}/15)...`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  const shutdown = async () => {
    console.log(`[${config.workerId}] shutting down...`)
    try {
      await fetch(`${gatewayUrl}/internal/workers/deregister`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rpcPublicKey: rpcPublicKeyHex }),
      })
    } catch {}
    await shutdownRpc()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('worker fatal error:', err)
  process.exit(1)
})
