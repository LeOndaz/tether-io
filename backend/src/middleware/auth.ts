import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyRecord, KeyService } from '../keys/service.js'
import { AuthError } from '../shared/errors.js'
import type { CompositeRateLimiter } from '../shared/rate-limit/limiter.js'

declare module 'fastify' {
  interface FastifyRequest {
    apiKey: ApiKeyRecord
  }
}

export function createAuthMiddleware(
  keyService: KeyService,
  rateLimiter: CompositeRateLimiter,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
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

    // Rate limit check
    await rateLimiter.checkAndConsume(keyRecord.id)

    // Attach key info to request for downstream handlers
    request.apiKey = keyRecord
  }
}
