import type { RateLimitCheckResult, RateLimitStrategy } from '../limiter'

interface SlidingWindowConfig {
  limit: number
  windowMs: number
}

export class SlidingWindowStrategy implements RateLimitStrategy {
  private limit: number
  private windowMs: number
  private logs = new Map<string, number[]>()
  private lastPurge = Date.now()
  private purgeIntervalMs: number

  constructor({ limit, windowMs }: SlidingWindowConfig) {
    this.limit = limit
    this.windowMs = windowMs
    this.purgeIntervalMs = windowMs * 2
  }

  async checkAndConsume(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const now = Date.now()
    this.purgeStale(now)
    this.cleanup(identifier, now)

    const timestamps = this.logs.get(identifier) ?? []
    const currentCount = timestamps.length

    if (currentCount + cost > this.limit) {
      const oldestInWindow = timestamps[0] ?? now
      const retryAfter = Math.ceil((oldestInWindow + this.windowMs - now) / 1000)
      return {
        allowed: false,
        remaining: Math.max(0, this.limit - currentCount),
        resetAt: new Date(oldestInWindow + this.windowMs),
        retryAfter: Math.max(1, retryAfter),
      }
    }

    // Atomic: consume immediately after check passes
    for (let i = 0; i < cost; i++) {
      timestamps.push(now)
    }
    this.logs.set(identifier, timestamps)

    return {
      allowed: true,
      remaining: this.limit - currentCount - cost,
      resetAt: new Date(now + this.windowMs),
    }
  }

  private purgeStale(now: number): void {
    if (now - this.lastPurge < this.purgeIntervalMs) return
    this.lastPurge = now
    const cutoff = now - this.windowMs
    for (const [key, timestamps] of this.logs) {
      const latest = timestamps[timestamps.length - 1] ?? 0
      if (latest <= cutoff) this.logs.delete(key)
    }
  }

  private cleanup(identifier: string, now: number): void {
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
