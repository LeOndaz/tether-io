import secureSession from '@fastify/secure-session'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { SessionConfig } from '../../config/index'

export function createSecureSessionPlugin(config: SessionConfig) {
  return fp(async (fastify: FastifyInstance): Promise<void> => {
    await fastify.register(secureSession, {
      secret: config.secret,
      salt: config.salt,
      cookie: {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400, // 24 hours
      },
    })
  })
}
