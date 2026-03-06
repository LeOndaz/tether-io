import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FixedWindowStrategy } from '../src/shared/rate-limit/strategies/fixed-window.js'
import { SlidingWindowStrategy } from '../src/shared/rate-limit/strategies/sliding-window.js'
import { TokenBucketStrategy } from '../src/shared/rate-limit/strategies/token-bucket.js'
import { CompositeRateLimiter } from '../src/shared/rate-limit/limiter.js'

describe('FixedWindowStrategy', () => {
  it('allows requests within limit', async () => {
    const strategy = new FixedWindowStrategy({ limit: 3, windowMs: 60000 })
    const r1 = await strategy.check('user1')
    assert.equal(r1.allowed, true)
    assert.equal(r1.remaining, 2)
  })

  it('blocks requests over limit', async () => {
    const strategy = new FixedWindowStrategy({ limit: 2, windowMs: 60000 })
    await strategy.consume('user1', 1)
    await strategy.consume('user1', 1)
    const result = await strategy.check('user1')
    assert.equal(result.allowed, false)
    assert.equal(result.remaining, 0)
  })
})

describe('SlidingWindowStrategy', () => {
  it('allows requests within limit', async () => {
    const strategy = new SlidingWindowStrategy({ limit: 5, windowMs: 60000 })
    const result = await strategy.check('user1')
    assert.equal(result.allowed, true)
  })

  it('blocks after consuming all', async () => {
    const strategy = new SlidingWindowStrategy({ limit: 2, windowMs: 60000 })
    await strategy.consume('user1')
    await strategy.consume('user1')
    const result = await strategy.check('user1')
    assert.equal(result.allowed, false)
  })
})

describe('TokenBucketStrategy', () => {
  it('starts with full capacity', async () => {
    const strategy = new TokenBucketStrategy({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 })
    const result = await strategy.check('user1')
    assert.equal(result.allowed, true)
    assert.equal(result.remaining, 9)
  })

  it('blocks when bucket is empty', async () => {
    const strategy = new TokenBucketStrategy({ capacity: 2, refillRate: 1, refillIntervalMs: 60000 })
    await strategy.consume('user1', 2)
    const result = await strategy.check('user1')
    assert.equal(result.allowed, false)
    assert.ok(result.retryAfter > 0)
  })
})

describe('CompositeRateLimiter', () => {
  it('passes when all strategies allow', async () => {
    const limiter = new CompositeRateLimiter([
      { name: 'a', strategy: new FixedWindowStrategy({ limit: 10, windowMs: 60000 }) },
      { name: 'b', strategy: new TokenBucketStrategy({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 }) },
    ])
    const result = await limiter.check('user1')
    assert.equal(result.allowed, true)
  })

  it('fails when any strategy blocks', async () => {
    const tight = new FixedWindowStrategy({ limit: 1, windowMs: 60000 })
    await tight.consume('user1')
    const limiter = new CompositeRateLimiter([
      { name: 'tight', strategy: tight },
      { name: 'loose', strategy: new TokenBucketStrategy({ capacity: 100, refillRate: 10, refillIntervalMs: 1000 }) },
    ])
    const result = await limiter.check('user1')
    assert.equal(result.allowed, false)
    assert.equal(result.limitName, 'tight')
  })
})
