import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'

/**
 * TypeBox schema for gateway environment variables.
 * Validated at startup — fails fast on missing required vars.
 */
export const GatewayEnvSchema = Type.Object({
  // Required
  PORT: Type.String(),
  HOST: Type.String(),
  RATE_LIMIT_REQUESTS_PER_MIN: Type.String(),
  RATE_LIMIT_TOKENS_PER_HOUR: Type.String(),

  // Session auth
  SESSION_SECRET: Type.String(),
  SESSION_SALT: Type.String(),
  ADMIN_USERNAME: Type.String(),
  ADMIN_PASSWORD: Type.String(),

  // Optional with defaults applied in loadConfig()
  NODE_ENV: Type.Optional(Type.String()),
  LOG_LEVEL: Type.Optional(Type.String()),
  DHT_BOOTSTRAP: Type.Optional(Type.String()),
  CLUSTER_TOPIC: Type.Optional(Type.String()),
  FRONTEND_URL: Type.Optional(Type.String()),
  WORKER_SECRET: Type.Optional(Type.String()),
})

export type GatewayEnv = Static<typeof GatewayEnvSchema>

export function parseGatewayEnv(env: Record<string, string | undefined> = process.env): GatewayEnv {
  return Value.Decode(GatewayEnvSchema, env)
}
