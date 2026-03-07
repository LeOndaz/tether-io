import crypto from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import type { DeploymentService } from '../deployments/service'
import type { MetricsService } from '../metrics/service'
import { NotFoundError, ValidationError } from '../shared/errors'
import type { Dispatcher } from '../workers/dispatcher'
import { WorkerUnavailableError } from '../workers/errors'

interface InferenceResult {
  message?: { content?: string }
  promptEvalCount?: number
  evalCount?: number
}

const ChatMessage = Type.Object({
  role: Type.Union([Type.Literal('system'), Type.Literal('user'), Type.Literal('assistant')]),
  content: Type.String({ maxLength: 100000 }),
})

const ChatCompletionsBody = Type.Object(
  {
    model: Type.String(),
    messages: Type.Array(ChatMessage, { maxItems: 256 }),
    stream: Type.Optional(Type.Boolean({ default: false })),
    temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
    max_tokens: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)

type ChatCompletionsBodyType = Static<typeof ChatCompletionsBody>

const UsageSchema = Type.Object({
  prompt_tokens: Type.Number(),
  completion_tokens: Type.Number(),
  total_tokens: Type.Number(),
})

const ChatCompletionResponse = Type.Object({
  id: Type.String(),
  object: Type.Literal('chat.completion'),
  created: Type.Number(),
  model: Type.String(),
  choices: Type.Array(
    Type.Object({
      index: Type.Number(),
      message: Type.Any(),
      finish_reason: Type.String(),
    }),
  ),
  usage: UsageSchema,
})

function buildCompletionResponse(model: string, result: InferenceResult) {
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
      prompt_tokens: result.promptEvalCount ?? 0,
      completion_tokens: result.evalCount ?? 0,
      total_tokens: (result.promptEvalCount ?? 0) + (result.evalCount ?? 0),
    },
  }
}

export function createInferenceRoutes(
  dispatcher: Dispatcher,
  metricsService: MetricsService,
  deploymentService: DeploymentService,
  authMiddleware: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
): (fastify: FastifyInstance) => Promise<void> {
  return async function inferenceRoutes(fastify) {
    fastify.post<{ Body: ChatCompletionsBodyType }>(
      '/v1/chat/completions',
      {
        preHandler: [authMiddleware],
        schema: {
          tags: ['Inference'],
          description: 'OpenAI-compatible chat completions endpoint',
          security: [{ bearerAuth: [] }],
          body: ChatCompletionsBody,
          response: { 200: ChatCompletionResponse },
        },
        sse: true,
      },
      async (request, reply: FastifyReply) => {
        const { model, messages, stream, temperature, max_tokens } = request.body

        if (!messages || messages.length === 0) {
          throw new ValidationError('messages array must not be empty')
        }

        // Validate that the model has an active deployment
        const deployments = await deploymentService.getByModel(model)
        const hasReady = deployments.some((d) => d.status === 'ready')
        if (!hasReady) {
          throw new NotFoundError(`No ready deployment for model "${model}"`)
        }

        const startTime = Date.now()

        if (stream) {
          if (!reply.sse) {
            throw new ValidationError('Streaming requires Accept: text/event-stream header')
          }
          return handleStreamingResponse(request, reply, dispatcher, metricsService, {
            model,
            messages,
            temperature,
            max_tokens,
            startTime,
          })
        }

        const result = await dispatchInference(dispatcher, model, messages, temperature, max_tokens)
        await recordUsage(metricsService, request.apiKey.id, model, result, startTime)
        return buildCompletionResponse(model, result)
      },
    )
  }
}

async function dispatchInference(
  dispatcher: Dispatcher,
  model: string,
  messages: Array<{ role: string; content: string }>,
  temperature?: number,
  max_tokens?: number,
): Promise<InferenceResult> {
  return (await dispatcher.request('inference.chat', {
    model,
    messages,
    options: { temperature, max_tokens, stream: false },
  })) as InferenceResult
}

async function recordUsage(
  metricsService: MetricsService,
  keyId: string,
  model: string,
  result: InferenceResult,
  startTime: number,
): Promise<void> {
  const latencyMs = Date.now() - startTime
  await metricsService.recordUsage({
    keyId,
    model,
    inputTokens: result.promptEvalCount ?? 0,
    outputTokens: result.evalCount ?? 0,
    latencyMs,
  })
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

  const selected = dispatcher.selectWorker({ model })
  if (!selected || !selected.streamUrl) {
    throw new WorkerUnavailableError(
      selected ? 'Selected worker has no streaming endpoint' : 'No healthy workers available',
    )
  }

  const workerKey = selected.workerKey
  // Acquire the job slot immediately after selection to prevent the load
  // balancer from over-assigning this worker before the stream starts.
  dispatcher.acquireJob(workerKey)

  const abort = new AbortController()
  request.raw.once('close', () => abort.abort())

  let workerResponse: Response
  try {
    workerResponse = await fetch(`${selected.streamUrl}/stream/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ model, messages, options: { temperature, max_tokens } }),
      signal: abort.signal,
    })
  } catch (err) {
    dispatcher.releaseJob(workerKey)
    throw err
  }

  if (!workerResponse.ok || !workerResponse.body) {
    dispatcher.releaseJob(workerKey)
    throw new WorkerUnavailableError('Worker stream request failed')
  }

  let promptTokens = 0
  let completionTokens = 0

  async function* proxyStream() {
    // biome-ignore lint/style/noNonNullAssertion: body is guaranteed non-null by the guard above
    const reader = workerResponse.body!.getReader()
    const decoder = new TextDecoder()
    let lineBuf = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!reply.sse.isConnected) {
          reader.cancel().catch(() => {})
          break
        }

        lineBuf += decoder.decode(value, { stream: true })
        const lines = lineBuf.split('\n')
        // Last element may be an incomplete line — keep it in the buffer
        lineBuf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload)
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens ?? 0
              completionTokens = parsed.usage.completion_tokens ?? 0
            }
            yield { data: parsed }
          } catch {
            // skip unparseable
          }
        }
      }
    } finally {
      dispatcher.releaseJob(workerKey)

      const latencyMs = Date.now() - startTime
      metricsService
        .recordUsage({
          keyId: request.apiKey.id,
          model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          latencyMs,
        })
        .catch((err) => {
          request.log.error({ err }, 'Failed to record streaming usage')
        })
    }
  }

  await reply.sse.send(proxyStream())
}
