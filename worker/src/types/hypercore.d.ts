declare module 'hypercore' {
  class Hypercore {
    constructor(storage: string, options?: Record<string, unknown>)
    constructor(storage: string, key: Buffer, options?: Record<string, unknown>)
    key: Buffer
    discoveryKey: Buffer
    writable: boolean
    ready(): Promise<void>
    close(): Promise<void>
    replicate(stream: unknown): unknown
  }

  export default Hypercore
}
