import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter.js'

interface FixedWindowConfig {
  limit: number
  windowMs: number
}

interface WindowEntry {
  count: number
  windowStart: number
}

export class FixedWindowStrategy implements RateLimitStrategy {
  private limit: number
  private windowMs: number
  private windows = new Map<string, WindowEntry>()

  constructor({ limit, windowMs }: FixedWindowConfig) {
    this.limit = limit
    this.windowMs = windowMs
  }

  async check(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const now = Date.now()
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs
    const windowKey = `${identifier}:${windowStart}`

    const entry = this.windows.get(windowKey) || { count: 0, windowStart }

    if (entry.count + cost > this.limit) {
      return {
        allowed: false,
        remaining: Math.max(0, this.limit - entry.count),
        resetAt: new Date(windowStart + this.windowMs),
        retryAfter: Math.ceil((windowStart + this.windowMs - now) / 1000),
      }
    }

    return {
      allowed: true,
      remaining: this.limit - entry.count - cost,
      resetAt: new Date(windowStart + this.windowMs),
    }
  }

  async consume(identifier: string, cost = 1): Promise<void> {
    const now = Date.now()
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs
    const windowKey = `${identifier}:${windowStart}`

    const entry = this.windows.get(windowKey) || { count: 0, windowStart }
    entry.count += cost
    this.windows.set(windowKey, entry)

    // Clean up old windows
    for (const [key, val] of this.windows) {
      if (val.windowStart + this.windowMs < now) {
        this.windows.delete(key)
      }
    }
  }
}
