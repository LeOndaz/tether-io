import { parseGatewayEnv } from './env'

export interface RateLimitConfig {
  requestsPerMin: number
  tokensPerHour: number
}

export interface AppConfig {
  port: number
  host: string
  logLevel: string
  rateLimit: RateLimitConfig
  dhtBootstrap: string | null
  clusterTopic: string
  frontendUrl: string | null
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

  return {
    port,
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL ?? 'info',
    rateLimit: { requestsPerMin, tokensPerHour },
    dhtBootstrap: parsed.DHT_BOOTSTRAP ?? null,
    clusterTopic: parsed.CLUSTER_TOPIC ?? 'ai-paas-cluster-v1',
    frontendUrl: parsed.FRONTEND_URL ?? null,
  }
}
