import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'
import { COLLECTIONS, INDEXES } from '../db/index.js'
import type { Dispatcher } from '../workers/dispatcher.js'

export interface DeploymentRecord {
  id: string
  model: string
  status: string
  contextWindow: number
  temperature: number
  maxTokens: number
  createdAt: number
  updatedAt: number
}

export interface CreateDeploymentParams {
  model: string
  contextWindow?: number
  temperature?: number
  maxTokens?: number
}

export interface LogEvent {
  type: string
  message: string
  timestamp: number
}

type LogCallback = (event: LogEvent) => void

export interface DeploymentService {
  create(params: CreateDeploymentParams): Promise<DeploymentRecord>
  getById(id: string): Promise<DeploymentRecord | null>
  list(): Promise<DeploymentRecord[]>
  update(id: string, updates: Partial<CreateDeploymentParams>): Promise<DeploymentRecord | null>
  remove(id: string): Promise<boolean>
  cancel(id: string): Promise<boolean>
  subscribeLogs(deploymentId: string, callback: LogCallback): () => void
  getByModel(model: string): Promise<DeploymentRecord[]>
}

export function createDeploymentService(db: HyperDB, dispatcher: Dispatcher): DeploymentService {
  // Active SSE connections for deployment log streaming
  const logStreams = new Map<string, Set<LogCallback>>()

  function emitLog(deploymentId: string, event: LogEvent): void {
    const listeners = logStreams.get(deploymentId)
    if (listeners) {
      for (const cb of listeners) {
        cb(event)
      }
    }
  }

  const service: DeploymentService = {
    async create({ model, contextWindow, temperature, maxTokens }) {
      const id = crypto.randomUUID()
      const now = Date.now()

      const deployment: DeploymentRecord = {
        id,
        model,
        status: 'pending',
        contextWindow: contextWindow || 4096,
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 2048,
        createdAt: now,
        updatedAt: now,
      }

      await db.insert(COLLECTIONS.DEPLOYMENTS, deployment as unknown as Record<string, unknown>)
      await db.flush()

      // Trigger async model pull on workers
      pullModel(id, model)

      return deployment
    },

    async getById(id) {
      return db.get(COLLECTIONS.DEPLOYMENTS, { id }) as Promise<DeploymentRecord | null>
    },

    async list() {
      const stream = db.find(COLLECTIONS.DEPLOYMENTS, {})
      return stream.toArray() as Promise<DeploymentRecord[]>
    },

    async update(id, updates) {
      const existing = (await db.get(COLLECTIONS.DEPLOYMENTS, { id })) as DeploymentRecord | null
      if (!existing) return null

      const updated = {
        ...existing,
        ...updates,
        id, // Ensure ID is not overwritten
        updatedAt: Date.now(),
      }

      await db.insert(COLLECTIONS.DEPLOYMENTS, updated as unknown as Record<string, unknown>)
      await db.flush()
      return updated
    },

    async remove(id) {
      const existing = (await db.get(COLLECTIONS.DEPLOYMENTS, { id })) as DeploymentRecord | null
      if (!existing) return false

      await updateStatus(id, 'removing')

      // Tell workers to delete the model
      try {
        await dispatcher.broadcast('model.delete', { model: existing.model })
      } catch {
        // Best effort — worker might be down
      }

      await db.delete(COLLECTIONS.DEPLOYMENTS, { id })
      await db.flush()
      return true
    },

    async cancel(id) {
      const existing = (await db.get(COLLECTIONS.DEPLOYMENTS, { id })) as DeploymentRecord | null
      if (!existing) return false
      if (existing.status !== 'pending' && existing.status !== 'pulling') return false

      await updateStatus(id, 'failed')
      emitLog(id, { type: 'status', message: 'Deployment cancelled', timestamp: Date.now() })
      return true
    },

    subscribeLogs(deploymentId, callback) {
      if (!logStreams.has(deploymentId)) {
        logStreams.set(deploymentId, new Set())
      }
      const listeners = logStreams.get(deploymentId) as Set<LogCallback>
      listeners.add(callback)
      return () => {
        const listeners = logStreams.get(deploymentId)
        if (listeners) {
          listeners.delete(callback)
          if (listeners.size === 0) logStreams.delete(deploymentId)
        }
      }
    },

    async getByModel(model) {
      const stream = db.find(INDEXES.DEPLOYMENTS_BY_MODEL, { model })
      return stream.toArray() as Promise<DeploymentRecord[]>
    },
  }

  async function pullModel(deploymentId: string, model: string): Promise<void> {
    try {
      await updateStatus(deploymentId, 'pulling')
      emitLog(deploymentId, {
        type: 'status',
        message: 'Starting model pull...',
        timestamp: Date.now(),
      })

      const results = await dispatcher.broadcast('model.pull', { model })

      const anySuccess = results.some((r) => r.status === 'fulfilled')
      if (anySuccess) {
        await updateStatus(deploymentId, 'ready')
        emitLog(deploymentId, {
          type: 'status',
          message: 'Model deployed successfully',
          timestamp: Date.now(),
        })
      } else {
        const reasons = results
          .map((r) => {
            if (r.status === 'rejected') {
              return (r.reason as Error)?.message || String(r.reason) || 'unknown'
            }
            return 'unknown'
          })
          .join('; ')
        console.error(`[deployment] all workers failed: ${reasons}`)
        await updateStatus(deploymentId, 'failed')
        emitLog(deploymentId, {
          type: 'error',
          message: `All workers failed: ${reasons}`,
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[deployment] pull error: ${message}`)
      await updateStatus(deploymentId, 'failed')
      emitLog(deploymentId, { type: 'error', message, timestamp: Date.now() })
    }
  }

  async function updateStatus(id: string, status: string): Promise<void> {
    const existing = (await db.get(COLLECTIONS.DEPLOYMENTS, { id })) as DeploymentRecord | null
    if (existing) {
      await db.insert(COLLECTIONS.DEPLOYMENTS, {
        ...existing,
        status,
        updatedAt: Date.now(),
      } as unknown as Record<string, unknown>)
      await db.flush()
    }
  }

  return service
}
