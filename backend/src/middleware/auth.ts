import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RateLimitConfig } from '../config/index'
import type { ApiKeyRecord, KeyService } from '../keys/service'
import { AuthError } from '../shared/errors'
import { CompositeRateLimiter } from '../shared/rate-limit/limiter'
import { SlidingWindowStrategy } from '../shared/rate-limit/strategies/sliding-window'
import { TokenBucketStrategy } from '../shared/rate-limit/strategies/token-bucket'

declare module 'fastify' {
  interface FastifyRequest {
    apiKey: ApiKeyRecord
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

export function createAuthMiddleware(
  keyService: KeyService,
  defaultRateLimit: RateLimitConfig,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  // Cache limiters per key ID so state persists across requests
  const limiterCache = new Map<string, CompositeRateLimiter>()

  // Shared limiter for keys using default limits — each key is still rate-limited
  // independently via its key ID as the identifier in checkAndConsume().
  // Note: "tokens" strategy counts requests (cost=1), not actual token usage,
  // because token counts are only known after inference completes.
  const defaultLimiter = new CompositeRateLimiter([
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

  function getLimiter(key: ApiKeyRecord): CompositeRateLimiter {
    // Keys with default limits share the default limiter
    if (
      key.rateLimitRequestsPerMin === defaultRateLimit.requestsPerMin &&
      key.rateLimitTokensPerHour === defaultRateLimit.tokensPerHour
    ) {
      return defaultLimiter
    }

    let limiter = limiterCache.get(key.id)
    if (!limiter) {
      // Evict oldest entries to prevent unbounded growth
      if (limiterCache.size >= 1000) {
        const firstKey = limiterCache.keys().next().value
        if (firstKey) limiterCache.delete(firstKey)
      }
      limiter = createLimiterForKey(key)
      limiterCache.set(key.id, limiter)
    }
    return limiter
  }

  return async function authenticate(request, _reply) {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Missing or malformed Authorization header')
    }

    const apiKey = authHeader.slice(7)
    if (!apiKey || !apiKey.startsWith('sk-')) {
      throw new AuthError('Invalid API key format')
    }

    const keyRecord = await keyService.validateKey(apiKey)
    if (!keyRecord) {
      throw new AuthError('Invalid API key')
    }

    // Per-key rate limit check
    const limiter = getLimiter(keyRecord)
    await limiter.checkAndConsume(keyRecord.id)

    request.apiKey = keyRecord
  }
}
