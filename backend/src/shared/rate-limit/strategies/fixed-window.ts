import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter'

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

  async checkAndConsume(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const now = Date.now()
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs
    const windowKey = `${identifier}:${windowStart}`

    // Clean old windows
    for (const [key, val] of this.windows) {
      if (val.windowStart + this.windowMs < now) {
        this.windows.delete(key)
      }
    }

    const entry = this.windows.get(windowKey) ?? { count: 0, windowStart }

    if (entry.count + cost > this.limit) {
      return {
        allowed: false,
        remaining: Math.max(0, this.limit - entry.count),
        resetAt: new Date(windowStart + this.windowMs),
        retryAfter: Math.ceil((windowStart + this.windowMs - now) / 1000),
      }
    }

    // Atomic: consume immediately after check passes
    entry.count += cost
    this.windows.set(windowKey, entry)

    return {
      allowed: true,
      remaining: this.limit - entry.count,
      resetAt: new Date(windowStart + this.windowMs),
    }
  }
}
