import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RateLimitConfig } from '../config/index'
import type { ApiKeyRecord, KeyService } from '../keys/service'
import { AuthError } from '../shared/errors'
import { CompositeRateLimiter } from '../shared/rate-limit/limiter'
import { SlidingWindowStrategy } from '../shared/rate-limit/strategies/sliding-window'
import { TokenBucketStrategy } from '../shared/rate-limit/strategies/token-bucket'
import type { AuthPrincipal, AuthProvider } from './types'

declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ApiKeyRecord
  }
}

function createLimiterForKey(key: ApiKeyRecord): CompositeRateLimiter {
  return new CompositeRateLimiter([
    {
      name: 'requests',
      strategy: new TokenBucketStrategy({
        capacity: key.rateLimitRequestsPerMin,
        refillRate: Math.ceil(key.rateLimitRequestsPerMin / 6),
        refillIntervalMs: 10_000,
      }),
    },
    {
      name: 'tokens',
      strategy: new SlidingWindowStrategy({
        limit: key.rateLimitTokensPerHour,
        windowMs: 60 * 60 * 1000,
      }),
    },
  ])
}

export class ApiKeyAuthProvider implements AuthProvider {
  private limiterCache = new Map<string, CompositeRateLimiter>()
  private defaultLimiter: CompositeRateLimiter

  constructor(
    private keyService: KeyService,
    private defaultRateLimit: RateLimitConfig,
  ) {
    this.defaultLimiter = new CompositeRateLimiter([
      {
        name: 'requests',
        strategy: new TokenBucketStrategy({
          capacity: defaultRateLimit.requestsPerMin,
          refillRate: Math.ceil(defaultRateLimit.requestsPerMin / 6),
          refillIntervalMs: 10_000,
        }),
      },
      {
        name: 'tokens',
        strategy: new SlidingWindowStrategy({
          limit: defaultRateLimit.tokensPerHour,
          windowMs: 60 * 60 * 1000,
        }),
      },
    ])
  }

  async authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<AuthPrincipal | null> {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer sk-')) return null

    const apiKey = authHeader.slice(7)
    const keyRecord = await this.keyService.validateKey(apiKey)
    if (!keyRecord) throw new AuthError('Invalid API key')

    const limiter = this.getLimiter(keyRecord)
    await limiter.checkAndConsume(keyRecord.id)

    request.apiKey = keyRecord
    return {
      type: 'apikey',
      id: keyRecord.id,
      permissions: keyRecord.permissions,
    }
  }

  private getLimiter(key: ApiKeyRecord): CompositeRateLimiter {
    if (
      key.rateLimitRequestsPerMin === this.defaultRateLimit.requestsPerMin &&
      key.rateLimitTokensPerHour === this.defaultRateLimit.tokensPerHour
    ) {
      return this.defaultLimiter
    }

    let limiter = this.limiterCache.get(key.id)
    if (!limiter) {
      if (this.limiterCache.size >= 1000) {
        const firstKey = this.limiterCache.keys().next().value
        if (firstKey) this.limiterCache.delete(firstKey)
      }
      limiter = createLimiterForKey(key)
      this.limiterCache.set(key.id, limiter)
    }
    return limiter
  }
}
