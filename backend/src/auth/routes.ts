import type { FastifyInstance, FastifyReply } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import { AuthError } from '../shared/errors'
import type { UserService } from './user-service'

const LoginBody = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
})

const MeResponse = Type.Object({
  id: Type.String(),
  username: Type.String(),
  permissions: Type.String(),
})

export function createAuthRoutes(
  userService: UserService,
): (fastify: FastifyInstance) => Promise<void> {
  return async function authRoutes(fastify) {
    fastify.post<{ Body: Static<typeof LoginBody> }>(
      '/auth/login',
      {
        schema: {
          tags: ['Auth'],
          description: 'Log in with username and password',
          body: LoginBody,
          response: { 200: MeResponse },
        },
      },
      async (request, _reply: FastifyReply) => {
        const { username, password } = request.body
        const user = await userService.validateCredentials(username, password)
        if (!user) throw new AuthError('Invalid username or password')

        request.session.set('userId', user.id)
        request.session.set('username', user.username)
        request.session.set('permissions', user.permissions)

        return { id: user.id, username: user.username, permissions: user.permissions }
      },
    )

    fastify.post(
      '/auth/logout',
      {
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
          response: { 200: MeResponse },
        },
      },
      async (request) => {
        const userId = request.session?.get('userId')
        if (!userId) throw new AuthError('Not logged in')

        const user = await userService.getById(userId)
        if (!user) throw new AuthError('Session invalid')

        return { id: user.id, username: user.username, permissions: user.permissions }
      },
    )
  }
}
