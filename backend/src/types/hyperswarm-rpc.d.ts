declare module '@hyperswarm/rpc' {
  interface RPCOptions {
    dht?: unknown
  }

  class RPC {
    constructor(options?: RPCOptions)
    request(publicKey: Buffer, method: string, payload: Buffer): Promise<Buffer>
    destroy(): Promise<void>
  }

  export default RPC
}
