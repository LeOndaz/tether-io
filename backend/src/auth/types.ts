import type { FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/secure-session'

export interface AuthPrincipal {
  type: 'apikey' | 'session'
  id: string
  permissions: string
}

export interface AuthProvider {
  /** Return principal if authenticated, null to skip to next provider. Throw to reject. */
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<AuthPrincipal | null>
}

export type AuthMiddleware = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal
  }
}

declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string
    username: string
    permissions: string
  }
}
