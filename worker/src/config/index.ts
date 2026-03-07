import crypto from 'node:crypto'
import { parseWorkerEnv } from './env'

// Must match gateway's default — both sides join the same Hyperswarm topic
const DEFAULT_CLUSTER_TOPIC = 'ai-paas-cluster-v1'

export interface DhtBootstrapNode {
  host: string
  port: number
}

export interface WorkerConfig {
  workerId: string
  ollamaUrl: string
  modelRuntime: string
  clusterTopic: string
  clusterTopicBuffer: Buffer
  dhtBootstrap: string | null
  dhtBootstrapNodes: DhtBootstrapNode[] | undefined
  streamPort: number
  streamHost: string
  logLevel: string
}

export function parseDhtBootstrap(raw: string | null): DhtBootstrapNode[] | undefined {
  if (!raw) return undefined
  const parts = raw.split(':')
  const host = parts[0] ?? 'localhost'
  const port = Number.parseInt(parts[1] ?? '49737', 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid DHT_BOOTSTRAP port: ${parts[1]}`)
  }
  return [{ host, port }]
}

export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const parsed = parseWorkerEnv(env)

  const streamPort = Number.parseInt(parsed.WORKER_STREAM_PORT ?? '0', 10)
  if (Number.isNaN(streamPort)) {
    throw new Error('WORKER_STREAM_PORT must be a valid integer')
  }

  const ollamaUrl = parsed.OLLAMA_URL ?? 'http://localhost:11434'
  const streamHost = parsed.WORKER_STREAM_HOST ?? 'localhost'

  if (!parsed.OLLAMA_URL) {
    console.warn(
      'OLLAMA_URL not set — defaulting to http://localhost:11434 (unreachable inside Docker)',
    )
  }
  if (!parsed.WORKER_STREAM_HOST) {
    console.warn(
      'WORKER_STREAM_HOST not set — defaulting to localhost (stream URL unreachable from other containers)',
    )
  }

  const dhtBootstrap = parsed.DHT_BOOTSTRAP ?? null
  const clusterTopic = parsed.CLUSTER_TOPIC ?? DEFAULT_CLUSTER_TOPIC

  return {
    workerId: parsed.WORKER_ID ?? `worker-${crypto.randomBytes(4).toString('hex')}`,
    ollamaUrl,
    modelRuntime: parsed.MODEL_RUNTIME ?? 'ollama',
    clusterTopic,
    clusterTopicBuffer: crypto.createHash('sha256').update(clusterTopic).digest(),
    dhtBootstrap,
    dhtBootstrapNodes: parseDhtBootstrap(dhtBootstrap),
    streamPort,
    streamHost,
    logLevel: parsed.LOG_LEVEL ?? 'info',
  }
}
