import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/** CSRF protection that only applies to session-authenticated requests. API key users are exempt. */
export function createCsrfIfSession(fastify: FastifyInstance) {
  return (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (req.headers.authorization?.startsWith('Bearer sk-')) return done()
    fastify.csrfProtection(req, reply, done)
  }
}
