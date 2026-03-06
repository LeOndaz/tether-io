import { RateLimitError } from '../errors.js'

export interface RateLimitCheckResult {
  allowed: boolean
  remaining?: number
  resetAt?: Date
  retryAfter?: number
  limitName?: string
}

export interface RateLimitStrategy {
  check(identifier: string, cost?: number): Promise<RateLimitCheckResult>
  consume(identifier: string, cost?: number): Promise<void>
}

export interface NamedStrategy {
  name: string
  strategy: RateLimitStrategy
}

export class CompositeRateLimiter {
  private strategies: NamedStrategy[]

  constructor(strategies: NamedStrategy[]) {
    this.strategies = strategies
  }

  async check(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    for (const { name, strategy } of this.strategies) {
      const result = await strategy.check(identifier, cost)
      if (!result.allowed) {
        return { ...result, limitName: name }
      }
    }
    return { allowed: true }
  }

  async consume(identifier: string, cost = 1): Promise<void> {
    for (const { strategy } of this.strategies) {
      await strategy.consume(identifier, cost)
    }
  }

  async checkAndConsume(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    const result = await this.check(identifier, cost)
    if (!result.allowed) {
      throw new RateLimitError(result.retryAfter ?? 0, {
        limit: result.limitName,
        remaining: result.remaining,
        resetAt: result.resetAt?.toISOString(),
      })
    }
    await this.consume(identifier, cost)
    return result
  }
}
