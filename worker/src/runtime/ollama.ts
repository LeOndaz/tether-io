import { Ollama } from 'ollama'
import type { WorkerConfig } from '../config'
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelInfo,
  ModelMetadata,
  PullProgress,
} from './interface'
import { ModelRuntime } from './interface'

export class OllamaRuntime extends ModelRuntime {
  private client: Ollama
  private ollamaUrl: string

  constructor(config: WorkerConfig) {
    super()
    this.ollamaUrl = config.ollamaUrl
    this.client = new Ollama({ host: config.ollamaUrl })
  }

  async pull(model: string, onProgress?: (progress: PullProgress) => void): Promise<void> {
    const stream = await this.client.pull({ model, stream: true })
    for await (const event of stream) {
      // Ollama streams errors as data events (HTTP 200), not as HTTP errors
      if ('error' in event && event.error) {
        throw new Error(String(event.error))
      }
      if (onProgress) {
        onProgress({
          status: event.status,
          digest: event.digest ?? null,
          total: event.total ?? null,
          completed: event.completed ?? null,
        })
      }
    }
  }

  async list(): Promise<ModelInfo[]> {
    const response = await this.client.list()
    return response.models.map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
      digest: m.digest,
      family: m.details?.family || null,
      parameterSize: m.details?.parameter_size || null,
      quantization: m.details?.quantization_level || null,
    }))
  }

  async delete(model: string): Promise<void> {
    await this.client.delete({ model })
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResponse | AsyncIterable<unknown>> {
    if (options.stream) {
      const response = await this.client.chat({
        model,
        messages,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.max_tokens,
        },
      })
      // Streaming returns an async iterator
      return response as AsyncIterable<unknown>
    }

    const response = await this.client.chat({
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.max_tokens,
      },
    })

    return {
      message: response.message,
      model: response.model,
      totalDuration: response.total_duration,
      promptEvalCount: response.prompt_eval_count,
      evalCount: response.eval_count,
    }
  }

  async show(model: string): Promise<ModelMetadata> {
    const info = await this.client.show({ model })
    return {
      model,
      template: info.template,
      parameters: info.parameters,
      modelInfo: info.model_info as unknown as Record<string, unknown>,
      details: info.details as unknown as Record<string, unknown>,
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.ollamaUrl, { signal: AbortSignal.timeout(5_000) })
      return response.ok
    } catch {
      return false
    }
  }
}
