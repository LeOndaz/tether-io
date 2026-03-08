import secureSession from '@fastify/secure-session'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export interface SessionPluginConfig {
  secret: string
  salt: string
}

export function createSecureSessionPlugin(config: SessionPluginConfig) {
  return fp(async (fastify: FastifyInstance): Promise<void> => {
    await fastify.register(secureSession, {
      secret: config.secret,
      salt: config.salt,
      cookie: {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
      },
    })
  })
}
