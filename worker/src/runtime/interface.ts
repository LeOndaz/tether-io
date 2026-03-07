export interface PullProgress {
  status: string
  digest: string | null
  total: number | null
  completed: number | null
}

export interface ModelInfo {
  name: string
  size: number
  modifiedAt: string | Date
  digest: string
  family: string | null
  parameterSize: string | null
  quantization: string | null
}

export interface ChatMessage {
  role: string
  content: string
}

export interface ChatOptions {
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatResponse {
  message: { role: string; content: string }
  model: string
  totalDuration: number
  promptEvalCount: number
  evalCount: number
}

export interface ModelMetadata {
  model: string
  template: string
  parameters: string
  modelInfo: Record<string, unknown>
  details: Record<string, unknown>
}

/**
 * ModelRuntime interface -- all model runtimes must implement these methods.
 *
 * Implementations: OllamaRuntime, DockerModelRuntime, VllmRuntime, RemoteRuntime
 * Selected via MODEL_RUNTIME env var through the factory.
 */
export abstract class ModelRuntime {
  /**
   * Pull/download a model.
   */
  abstract pull(model: string, onProgress?: (progress: PullProgress) => void): Promise<void>

  /**
   * List available models.
   */
  abstract list(): Promise<ModelInfo[]>

  /**
   * Delete a model.
   */
  abstract delete(model: string): Promise<void>

  /**
   * Run chat inference.
   */
  abstract chat(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse | AsyncIterable<unknown>>

  /**
   * Get model metadata.
   */
  abstract show(model: string): Promise<ModelMetadata>

  /**
   * Check if the runtime is reachable and healthy.
   */
  abstract isHealthy(): Promise<boolean>
}
