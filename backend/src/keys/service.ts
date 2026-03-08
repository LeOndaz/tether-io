import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'

const KEYS_COLLECTION = '@aipaas/apiKeys' as const
const KEYS_BY_HASH_INDEX = '@aipaas/apiKeys-by-hash' as const

function hashKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export interface GenerateKeyParams {
  name: string
  permissions?: string
  rateLimitRequestsPerMin?: number
  rateLimitTokensPerHour?: number
}

/** sk- (3 chars) + 8 chars of the random suffix = visible prefix for display */
const KEY_PREFIX_LENGTH = 11

export interface ApiKeyRecord {
  id: string
  name: string
  hash: string
  prefix: string
  permissions: string
  rateLimitRequestsPerMin: number
  rateLimitTokensPerHour: number
  lastUsedAt: number | null
  createdAt: number
}

const ONE_MINUTE_MS = 60_000

export class KeyService {
  constructor(private db: HyperDB) {}

  async generate({
    name,
    permissions,
    rateLimitRequestsPerMin,
    rateLimitTokensPerHour,
  }: GenerateKeyParams): Promise<ApiKeyRecord & { key: string }> {
    const apiKey = `sk-${crypto.randomBytes(32).toString('base64url')}`
    const hash = hashKey(apiKey)
    const prefix = apiKey.slice(0, KEY_PREFIX_LENGTH)
    const id = crypto.randomUUID()

    const record: ApiKeyRecord = {
      id,
      name,
      hash,
      prefix,
      permissions: permissions ?? 'inference',
      rateLimitRequestsPerMin: rateLimitRequestsPerMin ?? 60,
      rateLimitTokensPerHour: rateLimitTokensPerHour ?? 100000,
      lastUsedAt: null,
      createdAt: Date.now(),
    }

    await this.db.insert(KEYS_COLLECTION, record as unknown as Record<string, unknown>)
    await this.db.flush()

    return { ...record, key: apiKey }
  }

  /** Validates key by hash lookup. Throttles lastUsedAt writes to at most once per minute. */
  async validateKey(apiKey: string): Promise<ApiKeyRecord | null> {
    const hash = hashKey(apiKey)
    const record = (await this.db.findOne(KEYS_BY_HASH_INDEX, {
      gte: { hash },
      lte: { hash },
    })) as ApiKeyRecord | null
    if (!record) return null

    if (record.lastUsedAt === null || Date.now() - record.lastUsedAt > ONE_MINUTE_MS) {
      await this.db.insert(KEYS_COLLECTION, {
        ...record,
        lastUsedAt: Date.now(),
      } as unknown as Record<string, unknown>)
      await this.db.flush()
    }

    return record
  }

  async getById(id: string): Promise<ApiKeyRecord | null> {
    return this.db.get(KEYS_COLLECTION, { id }) as Promise<ApiKeyRecord | null>
  }

  async list(): Promise<ApiKeyRecord[]> {
    const stream = this.db.find(KEYS_COLLECTION, {})
    return stream.toArray() as Promise<ApiKeyRecord[]>
  }

  async deleteKey(id: string): Promise<void> {
    await this.db.delete(KEYS_COLLECTION, { id })
    await this.db.flush()
  }
}
