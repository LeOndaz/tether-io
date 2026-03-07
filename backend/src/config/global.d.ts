declare namespace NodeJS {
  interface ProcessEnv {
    // Required
    PORT: string
    HOST: string
    RATE_LIMIT_REQUESTS_PER_MIN: string
    RATE_LIMIT_TOKENS_PER_HOUR: string

    // Optional
    NODE_ENV?: string
    LOG_LEVEL?: string
    DHT_BOOTSTRAP?: string
    CLUSTER_TOPIC?: string
    FRONTEND_URL?: string
  }
}
