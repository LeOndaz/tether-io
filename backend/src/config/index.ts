import crypto from 'node:crypto'

export interface RateLimitConfig {
  requestsPerMin: number
  tokensPerHour: number
}

export interface AppConfig {
  port: number
  host: string
  logLevel: string
  ollamaUrl: string
  modelRuntime: string
  clusterTopic: string
  rateLimit: RateLimitConfig
  clusterTopicBuffer: Buffer
  dhtBootstrap: string | null
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    port: Number.parseInt(env.PORT || '3000', 10),
    host: env.HOST || '0.0.0.0',
    logLevel: env.LOG_LEVEL || 'info',
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    modelRuntime: env.MODEL_RUNTIME || 'ollama',
    clusterTopic: env.CLUSTER_TOPIC || 'ai-paas-cluster-v1',
    rateLimit: {
      requestsPerMin: Number.parseInt(env.RATE_LIMIT_REQUESTS_PER_MIN || '60', 10),
      tokensPerHour: Number.parseInt(env.RATE_LIMIT_TOKENS_PER_HOUR || '100000', 10),
    },
    clusterTopicBuffer: crypto
      .createHash('sha256')
      .update(env.CLUSTER_TOPIC || 'ai-paas-cluster-v1')
      .digest(),
    dhtBootstrap: env.DHT_BOOTSTRAP || null,
  }
}
