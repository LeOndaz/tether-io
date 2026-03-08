import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthPrincipal, AuthProvider } from './types'

export class SessionAuthProvider implements AuthProvider {
  async authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<AuthPrincipal | null> {
    const userId = request.session?.get('userId')
    if (!userId) return null

    return {
      type: 'session',
      id: userId,
      permissions: request.session.get('permissions') ?? 'inference',
    }
  }
}
