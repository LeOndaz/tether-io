import { Ollama } from 'ollama'
import { ModelRuntime } from './interface.js'

export class OllamaRuntime extends ModelRuntime {
  constructor(config) {
    super()
    this.client = new Ollama({ host: config.ollamaUrl })
  }

  async pull(model, onProgress) {
    const stream = await this.client.pull({ model, stream: true })
    for await (const event of stream) {
      if (onProgress) {
        onProgress({
          status: event.status,
          digest: event.digest || null,
          total: event.total || null,
          completed: event.completed || null,
        })
      }
    }
  }

  async list() {
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

  async delete(model) {
    await this.client.delete({ model })
  }

  async chat(model, messages, options = {}) {
    const response = await this.client.chat({
      model,
      messages,
      stream: options.stream ?? false,
      options: {
        temperature: options.temperature,
        num_predict: options.max_tokens,
      },
    })

    // Non-streaming returns the full response
    if (!options.stream) {
      return {
        message: response.message,
        model: response.model,
        totalDuration: response.total_duration,
        promptEvalCount: response.prompt_eval_count,
        evalCount: response.eval_count,
      }
    }

    // Streaming returns an async iterator
    return response
  }

  async show(model) {
    const info = await this.client.show({ model })
    return {
      model,
      template: info.template,
      parameters: info.parameters,
      modelInfo: info.model_info,
      details: info.details,
    }
  }

  async isHealthy() {
    try {
      // Ollama exposes a simple GET / endpoint that returns "Ollama is running"
      const response = await fetch(`${this.client.config.host}`)
      return response.ok
    } catch {
      return false
    }
  }
}
