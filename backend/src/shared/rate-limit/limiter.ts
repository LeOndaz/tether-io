import { RateLimitError } from '../errors'

export interface RateLimitCheckResult {
  allowed: boolean
  remaining?: number
  resetAt?: Date
  retryAfter?: number
  limitName?: string
}

export interface RateLimitStrategy {
  /** Atomically check and consume in one step. Returns the result; throws nothing. */
  checkAndConsume(identifier: string, cost?: number): Promise<RateLimitCheckResult>
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

  async checkAndConsume(identifier: string, cost = 1): Promise<RateLimitCheckResult> {
    for (const { name, strategy } of this.strategies) {
      const result = await strategy.checkAndConsume(identifier, cost)
      if (!result.allowed) {
        throw new RateLimitError(result.retryAfter ?? 0, {
          limit: name,
          remaining: result.remaining,
          resetAt: result.resetAt?.toISOString(),
        })
      }
    }
    return { allowed: true }
  }
}
