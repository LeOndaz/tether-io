import crypto from 'node:crypto'

export interface WorkerConfig {
  workerId: string
  ollamaUrl: string
  modelRuntime: string
  clusterTopic: string
  clusterTopicBuffer: Buffer
  dhtBootstrap: string | null
  streamPort: number
  streamHost: string
  logLevel: string
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const streamPort = Number.parseInt(env.WORKER_STREAM_PORT || '0', 10)
  if (Number.isNaN(streamPort)) {
    throw new Error('WORKER_STREAM_PORT must be a valid integer')
  }

  const ollamaUrl = env.OLLAMA_URL || 'http://localhost:11434'
  const streamHost = env.WORKER_STREAM_HOST || 'localhost'

  if (!env.OLLAMA_URL) {
    console.warn('OLLAMA_URL not set — defaulting to http://localhost:11434 (unreachable inside Docker)')
  }
  if (!env.WORKER_STREAM_HOST) {
    console.warn(
      'WORKER_STREAM_HOST not set — defaulting to localhost (stream URL unreachable from other containers)',
    )
  }

  return {
    workerId: env.WORKER_ID || `worker-${crypto.randomBytes(4).toString('hex')}`,
    ollamaUrl,
    modelRuntime: env.MODEL_RUNTIME || 'ollama',
    clusterTopic: env.CLUSTER_TOPIC || 'ai-paas-cluster-v1',
    clusterTopicBuffer: crypto
      .createHash('sha256')
      .update(env.CLUSTER_TOPIC || 'ai-paas-cluster-v1')
      .digest(),
    dhtBootstrap: env.DHT_BOOTSTRAP || null,
    streamPort,
    streamHost,
    logLevel: env.LOG_LEVEL || 'info',
  }
}
