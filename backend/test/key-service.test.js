import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { createDatabase } from '../src/db/index.js'
import { createKeyService } from '../src/keys/service.js'

const TEST_DB = './storage/_test_keys'

describe('key-service', () => {
  let db, keyService

  before(async () => {
    db = await createDatabase(TEST_DB)
    keyService = createKeyService(db)
  })

  after(async () => {
    await db.close()
    rmSync(TEST_DB, { recursive: true, force: true })
  })

  it('generates a key with sk- prefix', async () => {
    const result = await keyService.generate({ name: 'test-key' })
    assert.ok(result.key.startsWith('sk-'))
    assert.ok(result.id)
    assert.equal(result.name, 'test-key')
    assert.ok(result.prefix.startsWith('sk-'))
    assert.equal(result.prefix.length, 11)
  })

  it('validates a correct key', async () => {
    const result = await keyService.generate({ name: 'valid-key' })
    const validated = await keyService.validateKey(result.key)
    assert.ok(validated)
    assert.equal(validated.id, result.id)
    assert.equal(validated.name, 'valid-key')
  })

  it('rejects an invalid key', async () => {
    const validated = await keyService.validateKey('sk-invalid-key-that-does-not-exist')
    assert.equal(validated, null)
  })

  it('lists all keys', async () => {
    const keys = await keyService.list()
    assert.ok(keys.length >= 2) // from previous tests
  })

  it('deletes a key', async () => {
    const result = await keyService.generate({ name: 'to-delete' })
    await keyService.deleteKey(result.id)
    const found = await keyService.getById(result.id)
    assert.equal(found, null)
  })
})
