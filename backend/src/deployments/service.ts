import crypto from 'node:crypto'
import type { HyperDB } from 'hyperdb'
import type pino from 'pino'
import { ValidationError } from '../shared/errors'
import type { Dispatcher } from '../workers/dispatcher'

const DEPLOYMENTS_COLLECTION = '@aipaas/deployments' as const
const DEPLOYMENTS_BY_MODEL_INDEX = '@aipaas/deployments-by-model' as const

export type DeploymentStatus = 'pending' | 'pulling' | 'ready' | 'failed' | 'removing'

export interface DeploymentRecord {
  id: string
  model: string
  status: DeploymentStatus
  verbose: boolean
  contextWindow: number
  temperature: number
  maxTokens: number
  createdAt: number
  updatedAt: number
}

export interface CreateDeploymentParams {
  model: string
  verbose?: boolean
  contextWindow?: number
  temperature?: number
  maxTokens?: number
}

export interface UpdateDeploymentParams {
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

const MAX_LOG_BUFFER_SIZE = 200
const LOG_BUFFER_CLEANUP_DELAY_MS = 5 * 60 * 1000

export class DeploymentService {
  private logStreams = new Map<string, Set<LogCallback>>()
  private logBuffers = new Map<string, LogEvent[]>()
  private cancelledDeployments = new Set<string>()
  private createLocks = new Map<string, Promise<void>>()
  private cleanupTimers = new Map<string, NodeJS.Timeout>()
  private activePulls = new Set<Promise<void>>()
  private activeSyncs = new Set<Promise<void>>()

  constructor(
    private db: HyperDB,
    private dispatcher: Dispatcher,
    private logger: pino.Logger,
    private workerSecret = '',
  ) {}

  /**
   * Serializes concurrent creates for the same model to prevent duplicate deployments (TOCTOU).
   *
   * Chains onto any in-flight create for this model so the duplicate check in
   * createDeploymentRecord runs only after the previous one completes.
   */
  async create(params: CreateDeploymentParams): Promise<DeploymentRecord> {
    const existing = this.createLocks.get(params.model)
    const operation = (existing ?? Promise.resolve()).then(() =>
      this.createDeploymentRecord(params),
    )
    const settled = operation.then(
      () => {},
      () => {},
    )
    this.createLocks.set(params.model, settled)
    settled
      .then(() => {
        if (this.createLocks.get(params.model) === settled) {
          this.createLocks.delete(params.model)
        }
      })
      .catch(() => {})
    return operation
  }

  private async createDeploymentRecord({
    model,
    verbose,
    contextWindow,
    temperature,
    maxTokens,
  }: CreateDeploymentParams): Promise<DeploymentRecord> {
    const indexed = await this.getByModel(model)

    // Index results may include phantom records (see getByModel comment), so verify
    // each via primary key lookup. Also auto-fail deployments stuck in pending/pulling
    // after a gateway restart — no active pull process exists for them anymore.
    const STUCK_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes
    const checkTime = Date.now()
    const existing: DeploymentRecord[] = []

    for (const d of indexed) {
      const verified = await this.getById(d.id)
      if (!verified) continue

      const isInFlight = verified.status === 'pending' || verified.status === 'pulling'
      const isStuck = isInFlight && checkTime - verified.updatedAt > STUCK_THRESHOLD_MS

      if (isStuck) {
        this.logger.warn(
          { deploymentId: verified.id, status: verified.status, updatedAt: verified.updatedAt },
          'auto-failing stuck deployment',
        )
        await this.updateStatus(verified.id, 'failed')
        continue
      }

      existing.push(verified)
    }

    const activeExists = existing.some((d) => d.status !== 'failed' && d.status !== 'removing')
    if (activeExists) {
      throw new ValidationError(`An active deployment for model "${model}" already exists`)
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    const deployment: DeploymentRecord = {
      id,
      model,
      status: 'pending',
      verbose: verbose ?? false,
      contextWindow: contextWindow ?? 4096,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 2048,
      createdAt: now,
      updatedAt: now,
    }

    await this.db.insert(DEPLOYMENTS_COLLECTION, deployment as unknown as Record<string, unknown>)
    await this.db.flush()

    const pullPromise = this.pullModel(id, model, deployment.verbose).catch((err) => {
      this.logger.error({ err, deploymentId: id }, 'unexpected pullModel error')
    })
    this.activePulls.add(pullPromise)
    pullPromise.finally(() => this.activePulls.delete(pullPromise))

    return deployment
  }

  async getById(id: string): Promise<DeploymentRecord | null> {
    const record = (await this.db.get(DEPLOYMENTS_COLLECTION, { id })) as DeploymentRecord | null
    return record ? this.normalize(record) : null
  }

  async list(): Promise<DeploymentRecord[]> {
    const stream = this.db.find(DEPLOYMENTS_COLLECTION, {})
    const records = (await stream.toArray()) as DeploymentRecord[]
    return records.map((r) => this.normalize(r))
  }

  /** Backfill defaults for fields added after initial schema (guards against old DB records). */
  private normalize(record: DeploymentRecord): DeploymentRecord {
    return {
      ...record,
      verbose: record.verbose ?? false,
      contextWindow: record.contextWindow ?? 4096,
      temperature: record.temperature ?? 0.7,
      maxTokens: record.maxTokens ?? 2048,
    }
  }

  async update(id: string, updates: UpdateDeploymentParams): Promise<DeploymentRecord | null> {
    const existing = (await this.db.get(DEPLOYMENTS_COLLECTION, { id })) as DeploymentRecord | null
    if (!existing) return null

    const updated: DeploymentRecord = {
      ...existing,
      contextWindow: updates.contextWindow ?? existing.contextWindow,
      temperature: updates.temperature ?? existing.temperature,
      maxTokens: updates.maxTokens ?? existing.maxTokens,
      updatedAt: Date.now(),
    }

    await this.db.insert(DEPLOYMENTS_COLLECTION, updated as unknown as Record<string, unknown>)
    await this.db.flush()
    return updated
  }

  async remove(id: string): Promise<boolean> {
    const existing = (await this.db.get(DEPLOYMENTS_COLLECTION, { id })) as DeploymentRecord | null
    if (!existing) return false

    this.cancelledDeployments.add(id)
    await this.updateStatus(id, 'removing')

    const otherDeployments = await this.getByModel(existing.model)
    const hasOtherActive = otherDeployments.some(
      (d) => d.id !== id && d.status !== 'failed' && d.status !== 'removing',
    )

    if (!hasOtherActive) {
      try {
        await this.dispatcher.broadcast('model.delete', { model: existing.model })
      } catch (err) {
        this.logger.warn(
          { err, model: existing.model },
          'model delete broadcast failed — worker might be down',
        )
      }
    }
    await this.db.delete(DEPLOYMENTS_COLLECTION, { id })
    await this.db.flush()
    this.cleanupBuffers(id)
    // If no pull was in-flight, the flag is orphaned — clean up after a delay
    setTimeout(() => this.cancelledDeployments.delete(id), 60_000).unref()
    return true
  }

  async cancel(id: string): Promise<boolean> {
    const existing = (await this.db.get(DEPLOYMENTS_COLLECTION, { id })) as DeploymentRecord | null
    if (!existing) return false
    if (existing.status !== 'pending' && existing.status !== 'pulling') return false

    this.cancelledDeployments.add(id)
    await this.updateStatus(id, 'failed')
    this.emitLog(id, { type: 'status', message: 'Deployment cancelled', timestamp: Date.now() })
    this.cleanupBuffers(id)
    return true
  }

  /** Subscribes to live log events. Replays buffered events to the new subscriber immediately. */
  subscribeLogs(deploymentId: string, callback: LogCallback): () => void {
    if (!this.logStreams.has(deploymentId)) {
      this.logStreams.set(deploymentId, new Set())
    }
    const listeners = this.logStreams.get(deploymentId)
    if (!listeners) return () => {}
    listeners.add(callback)

    const buffered = this.logBuffers.get(deploymentId)
    if (buffered) {
      for (const event of buffered) {
        callback(event)
      }
    }

    return () => {
      const current = this.logStreams.get(deploymentId)
      if (current) {
        current.delete(callback)
        if (current.size === 0) this.logStreams.delete(deploymentId)
      }
    }
  }

  async getByModel(model: string): Promise<DeploymentRecord[]> {
    const stream = this.db.find(DEPLOYMENTS_BY_MODEL_INDEX, { model })
    const results = (await stream.toArray()) as DeploymentRecord[]
    // HyperDB's append-only index can map deleted keys to reused slots, returning records
    // for a different model. Filter to exact match to avoid false duplicate-deploy blocks.
    return results.filter((d) => d.model === model)
  }

  private emitLog(deploymentId: string, event: LogEvent): void {
    if (!this.logBuffers.has(deploymentId)) {
      this.logBuffers.set(deploymentId, [])
    }
    const buffer = this.logBuffers.get(deploymentId)
    if (!buffer) return
    buffer.push(event)
    if (buffer.length > MAX_LOG_BUFFER_SIZE) {
      buffer.splice(0, buffer.length - MAX_LOG_BUFFER_SIZE)
    }

    const listeners = this.logStreams.get(deploymentId)
    if (listeners) {
      for (const cb of listeners) {
        cb(event)
      }
    }
  }

  private cleanupBuffers(deploymentId: string): void {
    const existing = this.cleanupTimers.get(deploymentId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.logBuffers.delete(deploymentId)
      this.cleanupTimers.delete(deploymentId)
    }, LOG_BUFFER_CLEANUP_DELAY_MS)
    timer.unref()
    this.cleanupTimers.set(deploymentId, timer)
  }

  private clearAllTimers(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }
    this.cleanupTimers.clear()
  }

  async destroy(): Promise<void> {
    this.clearAllTimers()
    await Promise.allSettled([...this.activePulls, ...this.activeSyncs])
  }

  /** Waits for at least one healthy worker, retrying briefly for discovery to complete. */
  private async waitForWorkers(deploymentId: string, maxWaitMs = 30_000): Promise<boolean> {
    const interval = 2_000
    let elapsed = 0
    while (elapsed < maxWaitMs) {
      if (this.cancelledDeployments.has(deploymentId)) return false
      const workers = this.dispatcher.getWorkers()
      if (workers.some((w) => w.healthy)) return true
      this.emitLog(deploymentId, {
        type: 'status',
        message: 'Waiting for workers to become available...',
        timestamp: Date.now(),
      })
      await new Promise((r) => setTimeout(r, interval))
      elapsed += interval
    }
    return false
  }

  /** Fail any pending/pulling deployments left over from a previous gateway process. */
  async recoverStuckDeployments(): Promise<void> {
    const all = await this.list()
    for (const d of all) {
      if (d.status === 'pending' || d.status === 'pulling') {
        this.logger.warn(
          { deploymentId: d.id, model: d.model, status: d.status },
          'failing orphaned deployment on startup',
        )
        await this.updateStatus(d.id, 'failed')
      }
    }
  }

  private async pullModel(deploymentId: string, model: string, verbose: boolean): Promise<void> {
    try {
      if (this.cancelledDeployments.has(deploymentId)) return

      // Wait for at least one worker to be available (handles startup race with discovery)
      const hasWorkers = await this.waitForWorkers(deploymentId)
      if (!hasWorkers) {
        await this.updateStatus(deploymentId, 'failed')
        this.emitLog(deploymentId, {
          type: 'error',
          message: 'No workers available — timed out waiting for worker discovery',
          timestamp: Date.now(),
        })
        return
      }

      await this.updateStatus(deploymentId, 'pulling')
      this.emitLog(deploymentId, {
        type: 'status',
        message: 'Starting model pull...',
        timestamp: Date.now(),
      })

      // Always use HTTP streaming for pulls — RPC channels time out on large models.
      // The `verbose` flag controls whether per-layer progress events are emitted to logs.
      const anySuccess = await this.pullModelStreaming(deploymentId, model, verbose)

      if (this.cancelledDeployments.has(deploymentId)) return

      if (anySuccess) {
        if (this.cancelledDeployments.has(deploymentId)) return
        await this.updateStatus(deploymentId, 'ready')
        const syncPromise = this.syncWorkerModels().catch((err) => {
          this.logger.warn({ err }, 'syncWorkerModels failed after successful deployment')
        })
        this.activeSyncs.add(syncPromise)
        syncPromise.finally(() => this.activeSyncs.delete(syncPromise))
        this.emitLog(deploymentId, {
          type: 'status',
          message: 'Model deployed successfully',
          timestamp: Date.now(),
        })
      } else {
        await this.updateStatus(deploymentId, 'failed')
        this.emitLog(deploymentId, {
          type: 'error',
          message: 'All workers failed model pull',
          timestamp: Date.now(),
        })
      }
    } catch (err) {
      if (this.cancelledDeployments.has(deploymentId)) return
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error({ err, deploymentId }, 'pull error')
      await this.updateStatus(deploymentId, 'failed')
      this.emitLog(deploymentId, { type: 'error', message, timestamp: Date.now() })
    } finally {
      this.cancelledDeployments.delete(deploymentId)
      this.cleanupBuffers(deploymentId)
    }
  }

  /**
   * Pulls model via workers' HTTP stream endpoints (not RPC — avoids channel timeouts).
   * When verbose=true, per-layer progress events are emitted to deployment logs.
   */
  private async pullModelStreaming(
    deploymentId: string,
    model: string,
    verbose: boolean,
  ): Promise<boolean> {
    const workers = this.dispatcher.getWorkers().filter((w) => w.healthy && w.streamUrl)
    if (workers.length === 0) return false

    const results = await Promise.allSettled(
      workers.map(async (worker) => {
        this.emitLog(deploymentId, {
          type: 'status',
          message: `Pulling on ${worker.workerId}...`,
          timestamp: Date.now(),
        })

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }
        if (this.workerSecret) {
          headers['x-worker-secret'] = this.workerSecret
        }
        const response = await fetch(`${worker.streamUrl}/stream/pull`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model }),
        })

        if (!response.ok || !response.body) {
          throw new Error(`Worker ${worker.workerId} stream pull failed: ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let lineBuf = ''

        while (true) {
          if (this.cancelledDeployments.has(deploymentId)) {
            reader.cancel().catch(() => {})
            return
          }
          const { done, value } = await reader.read()
          if (done) break

          if (!verbose) continue

          lineBuf += decoder.decode(value, { stream: true })

          // Guard against a malicious worker sending an unbounded line to OOM the gateway
          if (lineBuf.length > 1_048_576) {
            this.logger.error(
              { workerId: worker.workerId },
              'SSE pull lineBuf exceeded 1MB — aborting stream',
            )
            reader.cancel().catch(() => {})
            break
          }

          const lines = lineBuf.split('\n')
          lineBuf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
            try {
              const event = JSON.parse(line.slice(6)) as {
                type: string
                status?: string
                total?: number
                completed?: number
                message?: string
              }
              if (event.type === 'pull_progress' && event.status) {
                const pct =
                  event.total && event.completed
                    ? ` (${Math.round((event.completed / event.total) * 100)}%)`
                    : ''
                this.emitLog(deploymentId, {
                  type: 'progress',
                  message: `[${worker.workerId}] ${event.status}${pct}`,
                  timestamp: Date.now(),
                })
              } else if (event.type === 'error') {
                throw new Error(event.message ?? 'unknown worker error')
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) {
                // Skip unparseable SSE lines
              } else {
                throw parseErr
              }
            }
          }
        }
      }),
    )

    return results.some((r) => r.status === 'fulfilled')
  }

  private async syncWorkerModels(): Promise<void> {
    const workers = this.dispatcher.getWorkers()
    for (const worker of workers) {
      try {
        const result = (await this.dispatcher.requestToWorker(
          Buffer.from(worker.publicKey, 'hex'),
          'model.list',
          {},
        )) as Array<{ name: string }>
        const models = result.map((m) => m.name)
        this.dispatcher.updateWorkerModels(worker.publicKey, models)
      } catch (err) {
        this.logger.warn({ err, workerKey: worker.publicKey }, 'failed to list models from worker')
      }
    }
  }

  private async updateStatus(id: string, status: DeploymentStatus): Promise<void> {
    if (status !== 'removing' && this.cancelledDeployments.has(id)) return
    const existing = (await this.db.get(DEPLOYMENTS_COLLECTION, { id })) as DeploymentRecord | null
    if (!existing) return

    await this.db.insert(DEPLOYMENTS_COLLECTION, {
      ...existing,
      status,
      updatedAt: Date.now(),
    } as unknown as Record<string, unknown>)
    await this.db.flush()
  }
}
