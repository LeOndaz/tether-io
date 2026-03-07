import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter'

interface TokenBucketConfig {
  capacity: number
  refillRate: number
  refillIntervalMs: number
}

interface Bucket {
  tokens: number
  lastRefill: number
}

export class TokenBucketStrategy implements RateLimitStrategy {
  private capacity: number
  private refillRate: number
  private refillIntervalMs: number
  private buckets = new Map<string, Bucket>()
  private lastPurge = Date.now()
  private purgeIntervalMs: number

  constructor({ capacity, refillRate, refillIntervalMs }: TokenBucketConfig) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.refillIntervalMs = refillIntervalMs
    // Purge idle buckets every ~60s worth of refill intervals
    this.purgeIntervalMs = Math.max(refillIntervalMs * 60, 60_000)
  }

  private refill(bucket: Bucket): void {
    const now = Date.now()
    const elapsed = now - bucket.lastRefill
    const refills = Math.floor(elapsed / this.refillIntervalMs)
    if (refills > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refills * this.refillRate)
      bucket.lastRefill = bucket.lastRefill + refills * this.refillIntervalMs
    }
  }

  private purgeIdle(now: number): void {
    if (now - this.lastPurge < this.purgeIntervalMs) return
    this.lastPurge = now
    // Remove buckets that would be at full capacity (idle long enough to fully refill)
    const fullRefillMs = Math.ceil((this.capacity / this.refillRate) * this.refillIntervalMs)
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > fullRefillMs) {
        this.buckets.delete(key)
      }
    }
  }

  async checkAndConsume(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const now = Date.now()
    this.purgeIdle(now)
    let bucket = this.buckets.get(identifier)

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now }
      this.buckets.set(identifier, bucket)
    }

    this.refill(bucket)

    if (bucket.tokens < cost) {
      const tokensNeeded = cost - bucket.tokens
      const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate)
      const retryAfterMs = intervalsNeeded * this.refillIntervalMs
      return {
        allowed: false,
        remaining: Math.max(0, Math.floor(bucket.tokens)),
        resetAt: new Date(now + retryAfterMs),
        retryAfter: Math.ceil(retryAfterMs / 1000),
      }
    }

    // Atomic: consume immediately after check passes
    bucket.tokens -= cost
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetAt: new Date(now + this.refillIntervalMs),
    }
  }
}
