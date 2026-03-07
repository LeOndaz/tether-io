import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'

const EnvSchema = Type.Object({
  PORT: Type.String(),
  HOST: Type.String(),
  LOG_LEVEL: Type.Optional(Type.String()),
  DHT_BOOTSTRAP: Type.Optional(Type.String()),
  CLUSTER_TOPIC: Type.Optional(Type.String()),
  RATE_LIMIT_REQUESTS_PER_MIN: Type.String(),
  RATE_LIMIT_TOKENS_PER_HOUR: Type.String(),
  FRONTEND_URL: Type.Optional(Type.String()),
})

type Env = Static<typeof EnvSchema>

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
  const parsed = Value.Decode(EnvSchema, env)
  const validated: Env = parsed

  const port = Number.parseInt(validated.PORT, 10)
  const requestsPerMin = Number.parseInt(validated.RATE_LIMIT_REQUESTS_PER_MIN, 10)
  const tokensPerHour = Number.parseInt(validated.RATE_LIMIT_TOKENS_PER_HOUR, 10)

  if (Number.isNaN(port) || Number.isNaN(requestsPerMin) || Number.isNaN(tokensPerHour)) {
    throw new Error(
      'PORT, RATE_LIMIT_REQUESTS_PER_MIN, and RATE_LIMIT_TOKENS_PER_HOUR must be valid integers',
    )
  }

  return {
    port,
    host: validated.HOST,
    logLevel: validated.LOG_LEVEL ?? 'info',
    rateLimit: { requestsPerMin, tokensPerHour },
    dhtBootstrap: validated.DHT_BOOTSTRAP ?? null,
    clusterTopic: validated.CLUSTER_TOPIC ?? 'ai-paas-cluster-v1',
    frontendUrl: validated.FRONTEND_URL ?? null,
  }
}
