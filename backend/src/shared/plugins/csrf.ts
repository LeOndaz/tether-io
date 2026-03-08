import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Origin-based CSRF protection for session-authenticated mutations.
 *
 * For non-safe HTTP methods, verifies that the Origin (or Referer) header
 * matches an allowed origin. Browsers always send Origin on cross-origin
 * requests; its absence on same-origin is acceptable.
 *
 * Combined with SameSite=lax cookies and CORS origin allowlist, this
 * provides defense-in-depth against CSRF.
 */
export function createCsrfPlugin(allowedOrigins: string[]) {
  return fp(async (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      if (SAFE_METHODS.has(request.method)) return

      const origin = request.headers.origin
      const referer = request.headers.referer

      // If no Origin header, check Referer. If neither is present,
      // allow the request — same-origin requests from some browsers
      // omit both, and API key auth doesn't use cookies.
      if (!origin && !referer) return

      const requestOrigin = origin || new URL(referer as string).origin

      if (!allowedOrigins.includes(requestOrigin)) {
        reply.status(403).send({ error: 'CSRF origin validation failed' })
      }
    })
  })
}
