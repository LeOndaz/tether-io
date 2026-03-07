declare module '@hyperswarm/rpc' {
  interface RPCOptions {
    dht?: unknown
  }

  interface RPCServer {
    listen(): Promise<void>
    close(): Promise<void>
    address(): { publicKey: Buffer }
    respond(method: string, handler: (req: Buffer) => Promise<Buffer>): void
  }

  class RPC {
    constructor(options?: RPCOptions)
    createServer(): RPCServer
    request(publicKey: Buffer, method: string, payload: Buffer): Promise<Buffer>
    destroy(): Promise<void>
  }

  export default RPC
}
