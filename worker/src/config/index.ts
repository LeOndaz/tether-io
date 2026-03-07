import crypto from 'node:crypto'
import { parseWorkerEnv } from './env'

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

export function loadWorkerConfig(env: Record<string, string | undefined> = process.env): WorkerConfig {
  const parsed = parseWorkerEnv(env)

  const streamPort = Number.parseInt(parsed.WORKER_STREAM_PORT ?? '0', 10)
  if (Number.isNaN(streamPort)) {
    throw new Error('WORKER_STREAM_PORT must be a valid integer')
  }

  const ollamaUrl = parsed.OLLAMA_URL ?? 'http://localhost:11434'
  const streamHost = parsed.WORKER_STREAM_HOST ?? 'localhost'

  if (!parsed.OLLAMA_URL) {
    console.warn('OLLAMA_URL not set — defaulting to http://localhost:11434 (unreachable inside Docker)')
  }
  if (!parsed.WORKER_STREAM_HOST) {
    console.warn(
      'WORKER_STREAM_HOST not set — defaulting to localhost (stream URL unreachable from other containers)',
    )
  }

  const clusterTopic = parsed.CLUSTER_TOPIC ?? 'ai-paas-cluster-v1'

  return {
    workerId: parsed.WORKER_ID ?? `worker-${crypto.randomBytes(4).toString('hex')}`,
    ollamaUrl,
    modelRuntime: parsed.MODEL_RUNTIME ?? 'ollama',
    clusterTopic,
    clusterTopicBuffer: crypto.createHash('sha256').update(clusterTopic).digest(),
    dhtBootstrap: parsed.DHT_BOOTSTRAP ?? null,
    streamPort,
    streamHost,
    logLevel: parsed.LOG_LEVEL ?? 'info',
  }
}
