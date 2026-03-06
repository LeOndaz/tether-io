import crypto from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { MetricsService } from '../metrics/service.js'
import { ValidationError } from '../shared/errors.js'
import type { Dispatcher } from '../workers/dispatcher.js'

interface ChatRequestBody {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

interface InferenceResult {
  message?: { content?: string }
  promptEvalCount?: number
  evalCount?: number
}

export function createInferenceRoutes(
  dispatcher: Dispatcher,
  metricsService: MetricsService,
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
): (fastify: FastifyInstance) => Promise<void> {
  return async function inferenceRoutes(fastify) {
    fastify.post(
      '/v1/chat/completions',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Inference'],
          description: 'OpenAI-compatible chat completions endpoint',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            required: ['model', 'messages'],
            properties: {
              model: { type: 'string' },
              messages: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['role', 'content'],
                  properties: {
                    role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                    content: { type: 'string' },
                  },
                },
              },
              stream: { type: 'boolean', default: false },
              temperature: { type: 'number', minimum: 0, maximum: 2 },
              max_tokens: { type: 'integer', minimum: 1 },
            },
          },
        },
      },
      async (request: FastifyRequest, reply: FastifyReply) => {
        const { model, messages, stream, temperature, max_tokens } = request.body as ChatRequestBody

        if (!messages || messages.length === 0) {
          throw new ValidationError('messages array must not be empty')
        }

        const startTime = Date.now()

        if (stream) {
          return handleStreamingResponse(request, reply, dispatcher, metricsService, {
            model,
            messages,
            temperature,
            max_tokens,
            startTime,
          })
        }

        // Non-streaming response
        const result = (await dispatcher.request('inference.chat', {
          model,
          messages,
          options: { temperature, max_tokens, stream: false },
        })) as InferenceResult

        const latencyMs = Date.now() - startTime

        // Record usage
        await metricsService.recordUsage({
          keyId: request.apiKey.id,
          model,
          inputTokens: result.promptEvalCount || 0,
          outputTokens: result.evalCount || 0,
          latencyMs,
        })

        // Return OpenAI-compatible response format
        return {
          id: `chatcmpl-${crypto.randomUUID()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: result.message,
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: result.promptEvalCount || 0,
            completion_tokens: result.evalCount || 0,
            total_tokens: (result.promptEvalCount || 0) + (result.evalCount || 0),
          },
        }
      },
    )
  }
}

interface StreamingParams {
  model: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
  startTime: number
}

async function handleStreamingResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  dispatcher: Dispatcher,
  metricsService: MetricsService,
  params: StreamingParams,
): Promise<void> {
  const { model, messages, temperature, max_tokens, startTime } = params

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const completionId = `chatcmpl-${crypto.randomUUID()}`
  const created = Math.floor(Date.now() / 1000)

  try {
    // For streaming, we dispatch a non-streaming request to the worker
    // and simulate the streaming format back to the client.
    // True streaming would require bidirectional RPC which adds complexity.
    const result = (await dispatcher.request('inference.chat', {
      model,
      messages,
      options: { temperature, max_tokens, stream: false },
    })) as InferenceResult

    const content = result.message?.content || ''
    // Send content in chunks to simulate streaming
    const chunkSize = 4
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize)
      const data = {
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { content: chunk },
            finish_reason: null,
          },
        ],
      }
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    // Send finish
    const finishData = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }
    reply.raw.write(`data: ${JSON.stringify(finishData)}\n\n`)
    reply.raw.write('data: [DONE]\n\n')

    // Record usage
    const latencyMs = Date.now() - startTime
    await metricsService.recordUsage({
      keyId: request.apiKey.id,
      model,
      inputTokens: result.promptEvalCount || 0,
      outputTokens: result.evalCount || 0,
      latencyMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const errorData = {
      error: { message, type: 'server_error' },
    }
    reply.raw.write(`data: ${JSON.stringify(errorData)}\n\n`)
  }

  reply.raw.end()
}
