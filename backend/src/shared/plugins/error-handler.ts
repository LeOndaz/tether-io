import type { FastifyInstance } from 'fastify'
import { AppError, RateLimitError } from '../errors.js'

export async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
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
    const fastifyError = error as { validation?: unknown }
    if (fastifyError.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: fastifyError.validation,
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
}
