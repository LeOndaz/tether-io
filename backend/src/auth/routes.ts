import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import { AuthError } from '../shared/errors'
import type { UserService } from './user-service'

const LoginBody = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
})

const AuthResponse = Type.Object({
  id: Type.String(),
  username: Type.String(),
  permissions: Type.String(),
  csrfToken: Type.String(),
})

export function createAuthRoutes(
  userService: UserService,
): (fastify: FastifyInstance) => Promise<void> {
  return async function authRoutes(fastify) {
    // In-memory login rate limiter: 5 attempts per 60s per IP
    const LOGIN_WINDOW_MS = 60_000
    const LOGIN_MAX_ATTEMPTS = 5
    const loginAttempts = new Map<string, { count: number; resetAt: number }>()

    const cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [ip, entry] of loginAttempts) {
        if (entry.resetAt <= now) loginAttempts.delete(ip)
      }
    }, 60_000)

    fastify.addHook('onClose', () => {
      clearInterval(cleanupInterval)
    })

    fastify.post<{ Body: Static<typeof LoginBody> }>(
      '/auth/login',
      {
        schema: {
          tags: ['Auth'],
          description: 'Log in with username and password',
          body: LoginBody,
          response: { 200: AuthResponse },
        },
      },
      async (request, reply: FastifyReply) => {
        const ip = request.ip
        const now = Date.now()
        const entry = loginAttempts.get(ip)

        if (entry && entry.resetAt > now) {
          if (entry.count >= LOGIN_MAX_ATTEMPTS) {
            const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
            reply.header('Retry-After', retryAfter)
            return reply.status(429).send({
              error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts' },
            })
          }
          entry.count++
        } else {
          loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
        }

        const { username, password } = request.body
        const user = await userService.validateCredentials(username, password)
        if (!user) throw new AuthError('Invalid username or password')

        // Clear stale session data before binding the new identity.
        // regenerate() wipes all keys but keeps deleted=false, so subsequent
        // set() calls are serialized into the response cookie. delete() would
        // mark the session for destruction, silently discarding set() writes.
        request.session.regenerate()
        request.session.set('userId', user.id)
        request.session.set('username', user.username)
        request.session.set('permissions', user.permissions)

        const csrfToken = reply.generateCsrf()

        return { id: user.id, username: user.username, permissions: user.permissions, csrfToken }
      },
    )

    fastify.post(
      '/auth/logout',
      {
        onRequest: fastify.csrfProtection,
        schema: {
          tags: ['Auth'],
          description: 'Log out and destroy session',
          response: { 204: Type.Null() },
        },
      },
      async (request, reply: FastifyReply) => {
        request.session.delete()
        return reply.status(204).send()
      },
    )

    fastify.get(
      '/auth/me',
      {
        schema: {
          tags: ['Auth'],
          description: 'Get current session user',
          response: { 200: AuthResponse },
        },
      },
      async (request, reply: FastifyReply) => {
        const userId = request.session?.get('userId')
        if (!userId) throw new AuthError('Not logged in')

        const user = await userService.getById(userId)
        if (!user) throw new AuthError('Session invalid')

        const csrfToken = reply.generateCsrf()

        return { id: user.id, username: user.username, permissions: user.permissions, csrfToken }
      },
    )
  }
}
