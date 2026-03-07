declare module 'hyperswarm' {
  import type { Duplex } from 'node:stream'

  interface SwarmOptions {
    dht?: unknown
    keyPair?: { publicKey: Buffer; secretKey: Buffer }
    maxConnections?: number
  }

  interface PeerInfo {
    publicKey: Buffer
    topics: Buffer[]
  }

  export interface SwarmConnection extends Duplex {
    remotePublicKey: Buffer
    publicKey: Buffer
  }

  class Hyperswarm {
    constructor(options?: SwarmOptions)
    join(
      topic: Buffer,
      options?: { server?: boolean; client?: boolean },
    ): {
      flushed(): Promise<void>
    }
    leave(topic: Buffer): Promise<void>
    on(event: 'connection', listener: (connection: SwarmConnection, info: PeerInfo) => void): this
    destroy(): Promise<void>
  }

  export default Hyperswarm
}
