import crypto from 'node:crypto'
import fastifySSE from '@fastify/sse'
import Fastify from 'fastify'
import { type Static, Type } from 'typebox'
import type { Logger } from './logger'
import type { ModelRuntime } from './runtime/interface'

const StreamChatBody = Type.Object({
  model: Type.String(),
  messages: Type.Array(
    Type.Object({
      role: Type.String(),
      content: Type.String({ maxLength: 100000 }),
    }),
    { maxItems: 256 },
  ),
  options: Type.Optional(
    Type.Object({
      temperature: Type.Optional(Type.Number()),
      max_tokens: Type.Optional(Type.Integer()),
    }),
  ),
})

type StreamChatBodyType = Static<typeof StreamChatBody>

interface OllamaStreamChunk {
  message?: { role: string; content: string }
  done: boolean
  prompt_eval_count?: number
  eval_count?: number
}

function buildChunk(
  id: string,
  created: number,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
) {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  }
}

export async function createStreamServer(
  runtime: ModelRuntime,
  port: number,
  advertisedHost: string,
  logger: Logger,
  workerSecret = '',
): Promise<{ server: ReturnType<typeof Fastify>; url: string; shutdown: () => Promise<void> }> {
  const fastify = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
  })

  await fastify.register(fastifySSE)

  // Shared-secret auth for /stream/* routes (skip /health)
  if (workerSecret) {
    fastify.addHook('onRequest', async (request, reply) => {
      if (request.url === '/health') return
      const provided = request.headers['x-worker-secret']
      if (provided !== workerSecret) {
        reply.code(403).send({ error: 'Forbidden' })
      }
    })
  }

  fastify.post<{ Body: StreamChatBodyType }>(
    '/stream/chat',
    {
      schema: { body: StreamChatBody },
      sse: true,
    },
    async (request, reply) => {
      const { model, messages, options } = request.body
      const completionId = `chatcmpl-${crypto.randomUUID()}`
      const created = Math.floor(Date.now() / 1000)

      async function* generateChat() {
        try {
          const stream = await runtime.chat(model, messages, {
            stream: true,
            temperature: options?.temperature,
            max_tokens: options?.max_tokens,
          })

          yield { data: buildChunk(completionId, created, model, { role: 'assistant' }, null) }

          let promptEvalCount = 0
          let evalCount = 0

          for await (const rawChunk of stream as AsyncIterable<OllamaStreamChunk>) {
            if (!reply.sse.isConnected) break
            if (rawChunk.done) {
              promptEvalCount = rawChunk.prompt_eval_count ?? 0
              evalCount = rawChunk.eval_count ?? 0
              break
            }

            const content = rawChunk.message?.content
            if (content) {
              yield { data: buildChunk(completionId, created, model, { content }, null) }
            }
          }

          if (reply.sse.isConnected) {
            const usage = {
              prompt_tokens: promptEvalCount,
              completion_tokens: evalCount,
              total_tokens: promptEvalCount + evalCount,
            }
            yield { data: buildChunk(completionId, created, model, {}, 'stop', usage) }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.error({ err, model }, 'stream chat error')
          yield { data: { error: { message, type: 'server_error' } } }
        }
      }

      await reply.sse.send(generateChat())
    },
  )

  const StreamPullBody = Type.Object({
    model: Type.String(),
  })

  fastify.post<{ Body: Static<typeof StreamPullBody> }>(
    '/stream/pull',
    { schema: { body: StreamPullBody }, sse: true },
    async (request, reply) => {
      const { model } = request.body

      reply.sse.keepAlive()

      try {
        await runtime.pull(model, (progress) => {
          if (!reply.sse.isConnected) return
          reply.sse.send({
            data: {
              type: 'pull_progress',
              status: progress.status,
              digest: progress.digest,
              total: progress.total,
              completed: progress.completed,
            },
          })
        })

        if (reply.sse.isConnected) {
          await reply.sse.send({ data: { type: 'pull_complete', model } })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error({ err, model }, 'stream pull error')
        if (reply.sse.isConnected) {
          await reply.sse.send({ data: { type: 'error', message } })
        }
      }

      reply.sse.close()
    },
  )

  fastify.get('/health', async () => {
    return { status: 'ok' }
  })

  await fastify.listen({ port, host: '0.0.0.0' })

  const address = fastify.server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  const url = `http://${advertisedHost}:${actualPort}`
  logger.info({ port: actualPort, url }, 'stream server listening')

  return {
    server: fastify,
    url,
    shutdown: () => fastify.close(),
  }
}
