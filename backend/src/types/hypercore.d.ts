declare module 'hypercore' {
  class Hypercore {
    constructor(storage: string, options?: Record<string, unknown>)
    ready(): Promise<void>
    close(): Promise<void>
  }

  export default Hypercore
}
