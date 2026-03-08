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

export interface ModelRuntime {
  pull(model: string, onProgress?: (progress: PullProgress) => void): Promise<void>
  list(): Promise<ModelInfo[]>
  delete(model: string): Promise<void>
  chat(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse | AsyncIterable<unknown>>
  show(model: string): Promise<ModelMetadata>
  isHealthy(): Promise<boolean>
}
