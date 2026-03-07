export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface ApiKey {
  id: string
  name: string
  prefix: string
  createdAt: number
  lastUsedAt: number
}

export interface ApiKeyCreateResponse {
  id: string
  key: string
  name: string
  prefix: string
  createdAt: number
}

export interface Deployment {
  id: string
  model: string
  status: string
  verbose: boolean
  contextWindow: number
  temperature: number
  maxTokens: number
  createdAt: number
  updatedAt: number
}

export interface ModelStats {
  requests: number
  inputTokens: number
  outputTokens: number
  avgLatencyMs: number
}

export interface Metrics {
  lastHour?: {
    totalRequests: number
    totalInputTokens: number
    totalOutputTokens: number
  }
  last24h?: {
    totalRequests: number
    totalInputTokens: number
    totalOutputTokens: number
  }
  byModel?: Record<string, ModelStats>
}

export interface Worker {
  publicKey: string
  workerId: string
  healthy: boolean
  activeJobs: number
  loadedModels: string[]
  streamUrl: string | null
  lastHealthCheck: number
}

export interface WorkersResponse {
  workers: Worker[]
}

class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers = { 'Content-Type': 'application/json', ...options.headers }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(
      body.error?.message || `Request failed: ${response.status}`,
      response.status,
      body.error,
    )
  }

  if (response.status === 204) return null as T
  return response.json()
}

// API Keys
export const keysApi = {
  list: () => request<ApiKey[]>('/api/keys'),
  get: (id: string) => request<ApiKey>(`/api/keys/${id}`),
  create: (data: { name: string }) =>
    request<ApiKeyCreateResponse>('/api/keys', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id: string) => request<null>(`/api/keys/${id}`, { method: 'DELETE' }),
}

// Deployments
export const deploymentsApi = {
  list: () => request<Deployment[]>('/api/deployments'),
  get: (id: string) => request<Deployment>(`/api/deployments/${id}`),
  create: (data: { model: string; verbose?: boolean }) =>
    request<Deployment>('/api/deployments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Deployment>) =>
    request<Deployment>(`/api/deployments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => request<null>(`/api/deployments/${id}`, { method: 'DELETE' }),
  cancel: (id: string) => request<null>(`/api/deployments/${id}/cancel`, { method: 'POST' }),
  logsUrl: (id: string) => `${API_BASE}/api/deployments/${id}/logs`,
}

// Metrics
export const metricsApi = {
  get: () => request<Metrics>('/api/metrics'),
  getByKey: (keyId: string) => request<Metrics>(`/api/metrics/keys/${keyId}`),
  getWorkers: () => request<WorkersResponse>('/api/metrics/workers'),
}
