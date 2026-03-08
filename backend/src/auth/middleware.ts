import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthError } from '../shared/errors'
import type { AuthMiddleware, AuthProvider } from './types'

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

/** Require that the authenticated principal has the given permission. */
export function createPermissionGuard(
  requiredPermission: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, _reply) => {
    if (request.principal?.permissions !== requiredPermission) {
      throw new AuthError('Insufficient permissions')
    }
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
