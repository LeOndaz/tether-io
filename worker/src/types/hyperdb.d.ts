declare module 'hyperdb' {
  interface HyperDBDefinition {
    versions: unknown
    collections: unknown[]
    indexes: unknown[]
    resolveCollection: (name: string) => unknown
    resolveIndex: (name: string) => unknown
  }

  interface FindStream<T = unknown> {
    toArray(): Promise<T[]>
  }

  export interface HyperDB {
    ready(): Promise<void>
    close(): Promise<void>
    insert(collection: string, record: Record<string, unknown>): Promise<void>
    get(collection: string, query: Record<string, unknown>): Promise<Record<string, unknown> | null>
    find(collection: string, query: Record<string, unknown>): FindStream
    findOne(index: string, query: Record<string, unknown>): Promise<Record<string, unknown> | null>
    delete(collection: string, query: Record<string, unknown>): Promise<void>
    flush(): Promise<void>
  }

  const HyperDB: {
    bee(core: unknown, definition: HyperDBDefinition): HyperDB
  }

  export default HyperDB
}

declare module 'hyperdb/runtime' {
  export class IndexEncoder {
    static STRING: unknown
    constructor(fields: unknown[], options?: { prefix: number })
    encode(key: unknown[]): Buffer
    decode(buf: Buffer): unknown[]
    encodeRange(range: {
      gt: unknown[] | null
      lt: unknown[] | null
      gte: unknown[] | null
      lte: unknown[] | null
    }): unknown
  }
  export const c: {
    uint: {
      preencode(state: unknown, val: number): void
      encode(state: unknown, val: number): void
      decode(state: unknown): number
    }
    uint8: { encode(state: unknown, val: number): void; decode(state: unknown): number }
    string: {
      preencode(state: unknown, val: string): void
      encode(state: unknown, val: string): void
      decode(state: unknown): string
    }
    float32: {
      preencode(state: unknown, val: number): void
      encode(state: unknown, val: number): void
      decode(state: unknown): number
    }
    encode(enc: unknown, value: unknown): Buffer
    decode(enc: unknown, buffer: Buffer): unknown
  }
  export const b4a: {
    allocUnsafe(size: number): Buffer
  }
}
