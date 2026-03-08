import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AuthError } from '../shared/errors'
import type { AuthMiddleware, AuthProvider } from './types'

/** CSRF protection that only applies to session-authenticated requests. API key users are exempt. */
export function createCsrfIfSession(fastify: FastifyInstance) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (req.headers.authorization?.startsWith('Bearer sk-')) return done()
    fastify.csrfProtection(req, reply, done)
  }
}

/** Try each provider in order. First non-null principal wins. */
export function createCompositeAuth(providers: AuthProvider[]): AuthMiddleware {
  return async (request, reply) => {
    for (const provider of providers) {
      const principal = await provider.authenticate(request, reply)
      if (principal) {
        request.principal = principal
        return
      }
    }
    throw new AuthError('Authentication required')
  }
}

/** Require that the authenticated principal has admin permissions. */
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (request.principal?.permissions !== 'admin') {
    throw new AuthError('Insufficient permissions')
  }
}

/** Single-provider auth — rejects if the provider returns null. */
export function createProviderAuth(provider: AuthProvider): AuthMiddleware {
  return async (request, reply) => {
    const principal = await provider.authenticate(request, reply)
    if (!principal) {
      throw new AuthError('Authentication required')
    }
    request.principal = principal
  }
}
