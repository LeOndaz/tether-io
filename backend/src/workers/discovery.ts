import crypto from 'node:crypto'
import Hyperswarm from 'hyperswarm'
import type { SwarmConnection } from 'hyperswarm'
import type pino from 'pino'
import type { Dispatcher, WorkerRegistration } from './dispatcher'

/**
 * Discovers workers via Hyperswarm topic.
 *
 * Workers announce themselves by joining the same topic and writing their
 * identity (workerId, rpcPublicKey, streamUrl) over the encrypted connection.
 * The gateway reads this and registers the worker with the dispatcher.
 * On disconnect, the worker is automatically deregistered.
 *
 * After registration, the gateway sends back its DB public key so the worker
 * can start replicating the HyperDB as a read-only replica.
 *
 * Shares the dispatcher's DHT instance so that swarm connections and RPC
 * requests route through the same peer network.
 */
export class WorkerDiscovery {
  private swarm: Hyperswarm | null = null
  private topicBuffer: Buffer
  private connections = new Map<string, SwarmConnection>()

  constructor(
    private dispatcher: Dispatcher,
    private dht: unknown,
    private clusterTopic: string,
    private logger: pino.Logger,
    private dbKey: Buffer,
  ) {
    this.topicBuffer = crypto.createHash('sha256').update(clusterTopic).digest()
  }

  async start(): Promise<void> {
    this.swarm = new Hyperswarm({ dht: this.dht })

    this.swarm.on('connection', (connection, info) => {
      this.handleConnection(connection, info.publicKey)
    })

    const discovery = this.swarm.join(this.topicBuffer, { server: true, client: true })
    await discovery.flushed()

    this.logger.info({ topic: this.clusterTopic }, 'worker discovery started')
  }

  private handleConnection(connection: SwarmConnection, peerKey: Buffer): void {
    const peerHex = peerKey.toString('hex').slice(0, 16)
    let buffer = ''

    connection.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()

      // Identity message is a single JSON line terminated by newline
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) return

      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)

      try {
        const identity = JSON.parse(line) as WorkerRegistration
        if (!identity.workerId || !identity.rpcPublicKey) {
          this.logger.warn({ peerKey: peerHex }, 'peer sent invalid identity')
          return
        }

        this.connections.set(identity.rpcPublicKey, connection)
        this.dispatcher.registerWorker(identity)
        this.logger.info(
          { workerId: identity.workerId, peerKey: peerHex },
          'worker discovered via swarm',
        )

        // Send gateway's DB key so the worker can start a read-only replica
        connection.write(`${JSON.stringify({ dbKey: this.dbKey.toString('hex') })}\n`)

        connection.on('close', () => {
          this.connections.delete(identity.rpcPublicKey)
          this.dispatcher.deregisterWorker({ rpcPublicKey: identity.rpcPublicKey })
          this.logger.info({ workerId: identity.workerId }, 'worker disconnected — deregistered')
        })

        connection.on('error', (err: Error) => {
          this.logger.warn(
            { workerId: identity.workerId, err: err.message },
            'swarm connection error',
          )
        })
      } catch {
        this.logger.warn({ peerKey: peerHex }, 'peer sent unparseable identity')
      }
    })
  }

  async shutdown(): Promise<void> {
    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
    this.connections.clear()
  }
}
