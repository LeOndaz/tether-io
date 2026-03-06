import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter.js'

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

  constructor({ capacity, refillRate, refillIntervalMs }: TokenBucketConfig) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.refillIntervalMs = refillIntervalMs
  }

  private _getBucket(identifier: string): Bucket {
    const now = Date.now()
    let bucket = this.buckets.get(identifier)

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now }
      this.buckets.set(identifier, bucket)
      return bucket
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill
    const refills = Math.floor(elapsed / this.refillIntervalMs)
    if (refills > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refills * this.refillRate)
      bucket.lastRefill = bucket.lastRefill + refills * this.refillIntervalMs
    }

    return bucket
  }

  async check(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const bucket = this._getBucket(identifier)

    if (bucket.tokens < cost) {
      const tokensNeeded = cost - bucket.tokens
      const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate)
      const retryAfterMs = intervalsNeeded * this.refillIntervalMs
      return {
        allowed: false,
        remaining: Math.max(0, Math.floor(bucket.tokens)),
        resetAt: new Date(Date.now() + retryAfterMs),
        retryAfter: Math.ceil(retryAfterMs / 1000),
      }
    }

    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens - cost),
      resetAt: new Date(Date.now() + this.refillIntervalMs),
    }
  }

  async consume(identifier: string, cost = 1): Promise<void> {
    const bucket = this._getBucket(identifier)
    bucket.tokens = Math.max(0, bucket.tokens - cost)
  }
}
