import { type Static, Type } from 'typebox'
import { Value } from 'typebox/value'

/**
 * TypeBox schema for worker environment variables.
 * Validated at startup — fails fast on missing required vars.
 */
export const WorkerEnvSchema = Type.Object({
  // Optional — all have sensible defaults
  WORKER_ID: Type.Optional(Type.String()),
  OLLAMA_URL: Type.Optional(Type.String()),
  MODEL_RUNTIME: Type.Optional(Type.String()),
  CLUSTER_TOPIC: Type.Optional(Type.String()),
  DHT_BOOTSTRAP: Type.Optional(Type.String()),
  WORKER_STREAM_PORT: Type.Optional(Type.String()),
  WORKER_STREAM_HOST: Type.Optional(Type.String()),
  WORKER_SECRET: Type.Optional(Type.String()),
  LOG_LEVEL: Type.Optional(Type.String()),
  NODE_ENV: Type.Optional(Type.String()),
})

export type WorkerEnv = Static<typeof WorkerEnvSchema>

export function parseWorkerEnv(env: Record<string, string | undefined> = process.env): WorkerEnv {
  return Value.Decode(WorkerEnvSchema, env)
}
