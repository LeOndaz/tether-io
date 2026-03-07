declare module 'hyperschema/runtime' {
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
}
