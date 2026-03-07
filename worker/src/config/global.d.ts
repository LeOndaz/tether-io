declare namespace NodeJS {
  interface ProcessEnv {
    WORKER_ID?: string
    OLLAMA_URL?: string
    MODEL_RUNTIME?: string
    CLUSTER_TOPIC?: string
    DHT_BOOTSTRAP?: string
    WORKER_STREAM_PORT?: string
    WORKER_STREAM_HOST?: string
    LOG_LEVEL?: string
    NODE_ENV?: string
  }
}
