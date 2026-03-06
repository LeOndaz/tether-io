import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter.js'

interface SlidingWindowConfig {
  limit: number
  windowMs: number
}

export class SlidingWindowStrategy implements RateLimitStrategy {
  private limit: number
  private windowMs: number
  private logs = new Map<string, number[]>()

  constructor({ limit, windowMs }: SlidingWindowConfig) {
    this.limit = limit
    this.windowMs = windowMs
  }

  async check(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const now = Date.now()
    this._cleanup(identifier, now)

    const timestamps = this.logs.get(identifier) || []
    const currentCount = timestamps.length

    if (currentCount + cost > this.limit) {
      const oldestInWindow = timestamps[0] || now
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000)
      return {
        allowed: false,
        remaining: Math.max(0, this.limit - currentCount),
        resetAt: new Date(oldestInWindow + this.windowMs),
        retryAfter: Math.max(1, retryAfter),
      }
    }

    return {
      allowed: true,
      remaining: this.limit - currentCount - cost,
      resetAt: new Date(now + this.windowMs),
    }
  }

  async consume(identifier: string, cost = 1): Promise<void> {
    const now = Date.now()
    this._cleanup(identifier, now)

    const timestamps = this.logs.get(identifier) || []
    for (let i = 0; i < cost; i++) {
      timestamps.push(now)
    }
    this.logs.set(identifier, timestamps)
  }

  private _cleanup(identifier: string, now: number): void {
    const timestamps = this.logs.get(identifier)
    if (!timestamps) return

    const cutoff = now - this.windowMs
    const filtered = timestamps.filter((t) => t > cutoff)

    if (filtered.length === 0) {
      this.logs.delete(identifier)
    } else {
      this.logs.set(identifier, filtered)
    }
  }
}
