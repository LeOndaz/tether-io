import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CompositeRateLimiter, type NamedStrategy } from '../src/shared/rate-limit/limiter'
import { FixedWindowStrategy } from '../src/shared/rate-limit/strategies/fixed-window'
import { SlidingWindowStrategy } from '../src/shared/rate-limit/strategies/sliding-window'
import { TokenBucketStrategy } from '../src/shared/rate-limit/strategies/token-bucket'

describe('FixedWindowStrategy', () => {
  it('allows requests within limit', async () => {
    const strategy = new FixedWindowStrategy({ limit: 3, windowMs: 60000 })
    const r1 = await strategy.checkAndConsume('user1')
    assert.equal(r1.allowed, true)
    assert.equal(r1.remaining, 2)
  })

  it('blocks requests over limit', async () => {
    const strategy = new FixedWindowStrategy({ limit: 2, windowMs: 60000 })
    await strategy.checkAndConsume('user1')
    await strategy.checkAndConsume('user1')
    const result = await strategy.checkAndConsume('user1')
    assert.equal(result.allowed, false)
    assert.equal(result.remaining, 0)
  })
})

describe('SlidingWindowStrategy', () => {
  it('allows requests within limit', async () => {
    const strategy = new SlidingWindowStrategy({ limit: 5, windowMs: 60000 })
    const result = await strategy.checkAndConsume('user1')
    assert.equal(result.allowed, true)
  })

  it('blocks after consuming all', async () => {
    const strategy = new SlidingWindowStrategy({ limit: 2, windowMs: 60000 })
    await strategy.checkAndConsume('user1')
    await strategy.checkAndConsume('user1')
    const result = await strategy.checkAndConsume('user1')
    assert.equal(result.allowed, false)
  })
})

describe('TokenBucketStrategy', () => {
  it('starts with full capacity', async () => {
    const strategy = new TokenBucketStrategy({
      capacity: 10,
      refillRate: 1,
      refillIntervalMs: 1000,
    })
    const result = await strategy.checkAndConsume('user1')
    assert.equal(result.allowed, true)
    assert.equal(result.remaining, 9)
  })

  it('blocks when bucket is empty', async () => {
    const strategy = new TokenBucketStrategy({
      capacity: 2,
      refillRate: 1,
      refillIntervalMs: 60000,
    })
    await strategy.checkAndConsume('user1', 2)
    const result = await strategy.checkAndConsume('user1')
    assert.equal(result.allowed, false)
    assert.ok(result.retryAfter !== undefined && result.retryAfter > 0)
  })
})

describe('CompositeRateLimiter', () => {
  it('passes when all strategies allow', async () => {
    const strategies: NamedStrategy[] = [
      { name: 'a', strategy: new FixedWindowStrategy({ limit: 10, windowMs: 60000 }) },
      {
        name: 'b',
        strategy: new TokenBucketStrategy({ capacity: 10, refillRate: 1, refillIntervalMs: 1000 }),
      },
    ]
    const limiter = new CompositeRateLimiter(strategies)
    // Should not throw
    const result = await limiter.checkAndConsume('user1')
    assert.equal(result.allowed, true)
  })

  it('throws RateLimitError when any strategy blocks', async () => {
    const tight = new FixedWindowStrategy({ limit: 1, windowMs: 60000 })
    await tight.checkAndConsume('user1') // exhaust the limit
    const strategies: NamedStrategy[] = [
      { name: 'tight', strategy: tight },
      {
        name: 'loose',
        strategy: new TokenBucketStrategy({
          capacity: 100,
          refillRate: 10,
          refillIntervalMs: 1000,
        }),
      },
    ]
    const limiter = new CompositeRateLimiter(strategies)
    await assert.rejects(() => limiter.checkAndConsume('user1'), {
      message: 'Rate limit exceeded',
    })
  })
})
