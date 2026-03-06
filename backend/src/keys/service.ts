import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'
import { COLLECTIONS, INDEXES } from '../db/index.js'

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

function base62Encode(buffer: Buffer): string {
  let result = ''
  for (const byte of buffer) {
    result += BASE62_CHARS[byte % 62]
  }
  return result
}

function hashKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export interface GenerateKeyParams {
  name: string
  permissions?: string
  rateLimitRequestsPerMin?: number
  rateLimitTokensPerHour?: number
}

export interface ApiKeyRecord {
  id: string
  name: string
  hash: string
  prefix: string
  permissions: string
  rateLimitRequestsPerMin: number
  rateLimitTokensPerHour: number
  lastUsedAt: number
  createdAt: number
}

export interface KeyService {
  generate(params: GenerateKeyParams): Promise<ApiKeyRecord & { key: string }>
  validateKey(apiKey: string): Promise<ApiKeyRecord | null>
  getById(id: string): Promise<ApiKeyRecord | null>
  list(): Promise<ApiKeyRecord[]>
  deleteKey(id: string): Promise<void>
}

export function createKeyService(db: HyperDB): KeyService {
  return {
    async generate({ name, permissions, rateLimitRequestsPerMin, rateLimitTokensPerHour }) {
      const raw = crypto.randomBytes(32)
      const apiKey = `sk-${base62Encode(raw)}`
      const hash = hashKey(apiKey)
      const prefix = apiKey.slice(0, 11)
      const id = crypto.randomUUID()

      const record: ApiKeyRecord = {
        id,
        name,
        hash,
        prefix,
        permissions: permissions || 'inference',
        rateLimitRequestsPerMin: rateLimitRequestsPerMin || 60,
        rateLimitTokensPerHour: rateLimitTokensPerHour || 100000,
        lastUsedAt: 0,
        createdAt: Date.now(),
      }

      await db.insert(COLLECTIONS.API_KEYS, record as unknown as Record<string, unknown>)
      await db.flush()

      // Return full key only once (view-once pattern)
      return { ...record, key: apiKey }
    },

    async validateKey(apiKey) {
      const hash = hashKey(apiKey)
      const record = (await db.findOne(INDEXES.API_KEYS_BY_HASH, {
        gte: { hash },
        lte: { hash },
      })) as ApiKeyRecord | null
      if (!record) return null

      // Update last used timestamp
      await db.insert(COLLECTIONS.API_KEYS, {
        ...record,
        lastUsedAt: Date.now(),
      } as unknown as Record<string, unknown>)
      await db.flush()

      return record
    },

    async getById(id) {
      return db.get(COLLECTIONS.API_KEYS, { id }) as Promise<ApiKeyRecord | null>
    },

    async list() {
      const stream = db.find(COLLECTIONS.API_KEYS, {})
      return stream.toArray() as Promise<ApiKeyRecord[]>
    },

    async deleteKey(id) {
      await db.delete(COLLECTIONS.API_KEYS, { id })
      await db.flush()
    },
  }
}
