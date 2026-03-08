import type Hypercore from 'hypercore'
import type DHT from 'hyperdht'
import Hyperswarm from 'hyperswarm'
import type pino from 'pino'

/**
 * Serves the gateway's HyperDB core for replication over Hyperswarm.
 *
 * Workers discover the core's discovery key, connect, and replicate
 * the Hypercore to maintain read-only DB replicas.
 */
export class DbReplicator {
  private swarm: Hyperswarm | null = null

  constructor(
    private core: Hypercore,
    private dht: DHT,
    private logger: pino.Logger,
  ) {}

  async start(): Promise<void> {
    this.swarm = new Hyperswarm({ dht: this.dht })

    this.swarm.on('connection', (connection) => {
      this.core.replicate(connection)
    })

    const discovery = this.swarm.join(this.core.discoveryKey, { server: true, client: false })
    await discovery.flushed()

    this.logger.info(
      { discoveryKey: this.core.discoveryKey.toString('hex').slice(0, 16) },
      'DB replication serving on swarm',
    )
  }

  async shutdown(): Promise<void> {
    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
  }
}
