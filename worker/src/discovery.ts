import type DHT from 'hyperdht'
import Hyperswarm from 'hyperswarm'
import type { SwarmConnection } from 'hyperswarm'
import type pino from 'pino'

interface AnnounceIdentity {
  workerId: string
  rpcPublicKey: string
  streamUrl: string
}

interface AnnounceConfig {
  topicBuffer: Buffer
  dht?: DHT
}

/**
 * Announces this worker on a Hyperswarm topic.
 *
 * When the gateway (or any peer) connects, the announcer writes the worker's
 * identity as a JSON line over the encrypted connection. The gateway reads
 * this to register the worker in its dispatcher pool.
 *
 * If all peer connections drop (e.g., gateway restart), the topic is re-joined
 * to force immediate DHT re-discovery rather than waiting for the refresh cycle.
 */
export class WorkerAnnouncer {
  private swarm: Hyperswarm | null = null
  private connections = new Set<SwarmConnection>()
  private rejoinTimer: NodeJS.Timeout | null = null

  constructor(
    private identity: AnnounceIdentity,
    private config: AnnounceConfig,
    private logger: pino.Logger,
    private onDbKeyReceived?: (dbKeyHex: string) => void,
  ) {}

  async start(): Promise<void> {
    const opts: Record<string, unknown> = {}

    if (this.config.dht) {
      opts.dht = this.config.dht
    }

    this.swarm = new Hyperswarm(opts)

    this.swarm.on('connection', (connection) => {
      this.handleConnection(connection)
    })

    await this.joinTopic()

    this.logger.info({ workerId: this.identity.workerId }, 'announcing on swarm topic')
  }

  private async joinTopic(): Promise<void> {
    if (!this.swarm) return
    const discovery = this.swarm.join(this.config.topicBuffer, { server: true, client: true })
    await discovery.flushed()
  }

  private scheduleRejoin(): void {
    if (this.rejoinTimer || !this.swarm) return

    // Short delay to batch multiple close events from a single gateway restart
    this.rejoinTimer = setTimeout(async () => {
      this.rejoinTimer = null
      if (this.connections.size > 0) return // already reconnected

      this.logger.info('all peers disconnected — re-joining topic for discovery')
      try {
        await this.swarm?.leave(this.config.topicBuffer)
        await this.joinTopic()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.logger.warn({ err: msg }, 'rejoin failed')
      }
    }, 3_000)
  }

  private handleConnection(connection: SwarmConnection): void {
    this.connections.add(connection)

    // Send identity as a JSON line — gateway reads this to register the worker
    const payload = `${JSON.stringify(this.identity)}\n`
    connection.write(payload)

    // Listen for gateway's response (contains DB key for replication)
    let responseBuf = ''
    connection.on('data', (chunk: Buffer) => {
      responseBuf += chunk.toString()
      const idx = responseBuf.indexOf('\n')
      if (idx === -1) return
      const line = responseBuf.slice(0, idx)
      responseBuf = responseBuf.slice(idx + 1)
      try {
        const response = JSON.parse(line) as { dbKey?: string }
        if (response.dbKey && this.onDbKeyReceived) {
          this.onDbKeyReceived(response.dbKey)
        }
      } catch {
        this.logger.warn('unparseable response from gateway')
      }
    })

    connection.on('close', () => {
      this.connections.delete(connection)
      if (this.connections.size === 0) {
        this.scheduleRejoin()
      }
    })

    connection.on('error', (err) => {
      this.logger.warn({ err: err.message }, 'swarm connection error')
      this.connections.delete(connection)
    })
  }

  async shutdown(): Promise<void> {
    if (this.rejoinTimer) {
      clearTimeout(this.rejoinTimer)
      this.rejoinTimer = null
    }

    for (const conn of this.connections) {
      conn.destroy()
    }
    this.connections.clear()

    if (this.swarm) {
      await this.swarm.destroy()
      this.swarm = null
    }
  }
}
