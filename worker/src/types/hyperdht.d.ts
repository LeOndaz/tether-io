declare module 'hyperdht' {
  interface DHTOptions {
    bootstrap?: Array<{ host: string; port: number }>
    firewalled?: boolean
  }

  class DHT {
    firewalled: boolean
    constructor(options?: DHTOptions)
    ready(): Promise<void>
    destroy(): Promise<void>
  }

  export default DHT
}
