import { resolve } from 'node:path'
import HyperDB from 'hyperdb/builder'
import Hyperschema from 'hyperschema'

const SPEC_DIR = resolve(import.meta.dirname, '../spec')
const SCHEMA_DIR = resolve(SPEC_DIR, 'hyperschema')
const DB_DIR = resolve(SPEC_DIR, 'hyperdb')

// --- Schema definitions ---
const schema = Hyperschema.from(SCHEMA_DIR)
const ns = schema.namespace('aipaas')

ns.register({
  name: 'apiKey',
  compact: true,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'name', type: 'string', required: true },
    { name: 'hash', type: 'string', required: true },
    { name: 'prefix', type: 'string', required: true },
    { name: 'permissions', type: 'string', required: false },
    { name: 'rateLimitRequestsPerMin', type: 'uint', required: false },
    { name: 'rateLimitTokensPerHour', type: 'uint', required: false },
    { name: 'lastUsedAt', type: 'uint', required: false },
    { name: 'createdAt', type: 'uint', required: true },
  ],
})

ns.register({
  name: 'deployment',
  compact: true,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'model', type: 'string', required: true },
    { name: 'status', type: 'string', required: true },
    { name: 'contextWindow', type: 'uint', required: false },
    { name: 'temperature', type: 'float32', required: false },
    { name: 'maxTokens', type: 'uint', required: false },
    { name: 'createdAt', type: 'uint', required: true },
    { name: 'updatedAt', type: 'uint', required: true },
  ],
})

ns.register({
  name: 'usageRecord',
  compact: true,
  fields: [
    { name: 'id', type: 'string', required: true },
    { name: 'keyId', type: 'string', required: true },
    { name: 'model', type: 'string', required: true },
    { name: 'inputTokens', type: 'uint', required: true },
    { name: 'outputTokens', type: 'uint', required: true },
    { name: 'latencyMs', type: 'uint', required: true },
    { name: 'timestamp', type: 'uint', required: true },
  ],
})

Hyperschema.toDisk(schema)

// --- DB collection definitions ---
const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const dbNs = db.namespace('aipaas')

dbNs.collections.register({
  name: 'apiKeys',
  schema: '@aipaas/apiKey',
  key: ['id'],
})

dbNs.collections.register({
  name: 'deployments',
  schema: '@aipaas/deployment',
  key: ['id'],
})

dbNs.collections.register({
  name: 'usageRecords',
  schema: '@aipaas/usageRecord',
  key: ['id'],
})

dbNs.indexes.register({
  name: 'apiKeys-by-hash',
  collection: '@aipaas/apiKeys',
  unique: true,
  key: ['hash'],
})

dbNs.indexes.register({
  name: 'deployments-by-model',
  collection: '@aipaas/deployments',
  unique: false,
  key: ['model'],
})

dbNs.indexes.register({
  name: 'usageRecords-by-keyId',
  collection: '@aipaas/usageRecords',
  unique: false,
  key: ['keyId'],
})

dbNs.indexes.register({
  name: 'usageRecords-by-model',
  collection: '@aipaas/usageRecords',
  unique: false,
  key: ['model'],
})

dbNs.indexes.register({
  name: 'usageRecords-by-timestamp',
  collection: '@aipaas/usageRecords',
  unique: false,
  key: ['timestamp'],
})

HyperDB.toDisk(db, DB_DIR, { esm: true })

console.log('Schema and DB definitions built successfully')
