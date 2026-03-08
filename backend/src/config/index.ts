import { parseGatewayEnv } from './env'

// Must match worker's default — both sides join the same Hyperswarm topic
const DEFAULT_CLUSTER_TOPIC = 'ai-paas-cluster-v1'

export interface DhtBootstrapNode {
  host: string
  port: number
}

export interface RateLimitConfig {
  requestsPerMin: number
  tokensPerHour: number
}

export interface SessionConfig {
  secret: string
  salt: string
}

export interface AdminConfig {
  username: string
  password: string
}

export interface AppConfig {
  port: number
  host: string
  logLevel: string
  rateLimit: RateLimitConfig
  session: SessionConfig
  admin: AdminConfig
  dhtBootstrap: string | null
  dhtBootstrapNodes: DhtBootstrapNode[] | undefined
  clusterTopic: string
  frontendUrl: string | null
  workerSecret: string
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

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = parseGatewayEnv(env)

  const port = Number.parseInt(parsed.PORT, 10)
  const requestsPerMin = Number.parseInt(parsed.RATE_LIMIT_REQUESTS_PER_MIN, 10)
  const tokensPerHour = Number.parseInt(parsed.RATE_LIMIT_TOKENS_PER_HOUR, 10)

  if (Number.isNaN(port) || Number.isNaN(requestsPerMin) || Number.isNaN(tokensPerHour)) {
    throw new Error(
      'PORT, RATE_LIMIT_REQUESTS_PER_MIN, and RATE_LIMIT_TOKENS_PER_HOUR must be valid integers',
    )
  }

  if (parsed.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters')
  }
  if (parsed.SESSION_SALT.length !== 16) {
    throw new Error('SESSION_SALT must be exactly 16 characters')
  }

  const dhtBootstrap = parsed.DHT_BOOTSTRAP ?? null

  return {
    port,
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL ?? 'info',
    rateLimit: { requestsPerMin, tokensPerHour },
    session: { secret: parsed.SESSION_SECRET, salt: parsed.SESSION_SALT },
    admin: { username: parsed.ADMIN_USERNAME, password: parsed.ADMIN_PASSWORD },
    dhtBootstrap,
    dhtBootstrapNodes: parseDhtBootstrap(dhtBootstrap),
    clusterTopic: parsed.CLUSTER_TOPIC ?? DEFAULT_CLUSTER_TOPIC,
    frontendUrl: parsed.FRONTEND_URL ?? null,
    workerSecret: parsed.WORKER_SECRET ?? '',
  }
}
