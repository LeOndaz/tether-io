import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { AppError, RateLimitError } from '../errors'

export const errorHandlerPlugin = fp(async (fastify: FastifyInstance): Promise<void> => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof RateLimitError) {
      reply.header('Retry-After', error.retryAfter)
    }

    if (error instanceof AppError) {
      request.log.warn({ err: error }, error.message)
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details || undefined,
        },
      })
    }

    // Fastify validation errors
    const fastifyError = error as { validation?: unknown; statusCode?: number }
    if (fastifyError.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: fastifyError.validation,
        },
      })
    }

    // Fastify-native errors (413, 415, 404, etc.) — preserve their status code
    if (fastifyError.statusCode && fastifyError.statusCode !== 500) {
      const msg =
        fastifyError.statusCode === 413
          ? 'Payload too large'
          : fastifyError.statusCode === 415
            ? 'Unsupported media type'
            : error instanceof Error
              ? error.message
              : 'Request error'
      request.log.warn({ err: error }, msg)
      return reply.status(fastifyError.statusCode).send({
        error: {
          code: 'REQUEST_ERROR',
          message: msg,
        },
      })
    }

    // Unexpected errors — log full stack, return generic message
    request.log.error({ err: error }, 'unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    })
  })
})
