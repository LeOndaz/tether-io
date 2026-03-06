import crypto from 'node:crypto'

export function loadWorkerConfig(env = process.env) {
  return {
    workerId: env.WORKER_ID || `worker-${crypto.randomBytes(4).toString('hex')}`,
    ollamaUrl: env.OLLAMA_URL || 'http://localhost:11434',
    modelRuntime: env.MODEL_RUNTIME || 'ollama',
    clusterTopic: env.CLUSTER_TOPIC || 'ai-paas-cluster-v1',
    clusterTopicBuffer: crypto
      .createHash('sha256')
      .update(env.CLUSTER_TOPIC || 'ai-paas-cluster-v1')
      .digest(),
    gatewayUrl: env.GATEWAY_URL || 'http://localhost:3000',
    dhtBootstrap: env.DHT_BOOTSTRAP || null,
    logLevel: env.LOG_LEVEL || 'info',
  }
}
