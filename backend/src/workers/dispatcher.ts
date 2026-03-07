import RPC from '@hyperswarm/rpc'
import DHT from 'hyperdht'
import type pino from 'pino'
import type { AppConfig } from '../config/index'
import { WorkerUnavailableError } from './errors'

export interface WorkerInfo {
  workerId: string
  publicKey: Buffer
  streamUrl: string | null
  activeJobs: number
  loadedModels: string[]
  lastHealthCheck: number
  healthy: boolean
  consecutiveFailures: number
}

export interface LBStrategy {
  select(workers: WorkerInfo[], request: unknown): WorkerInfo | null
}

export interface WorkerRegistration {
  workerId: string
  rpcPublicKey: string
  streamUrl?: string
}

export interface WorkerPublicInfo {
  publicKey: string
  workerId: string
  streamUrl: string | null
  activeJobs: number
  loadedModels: string[]
  healthy: boolean
  lastHealthCheck: number
}

export interface SelectedWorker {
  workerKey: string
  streamUrl: string | null
}

export interface Dispatcher {
  registerWorker(registration: WorkerRegistration): void
  deregisterWorker(registration: Pick<WorkerRegistration, 'rpcPublicKey'>): void
  selectWorker(payload: unknown): SelectedWorker | null
  acquireJob(workerKey: string): void
  releaseJob(workerKey: string): void
  request(method: string, payload: unknown): Promise<unknown>
  requestToWorker(publicKey: Buffer, method: string, payload: unknown): Promise<unknown>
  broadcast(method: string, payload: unknown): Promise<PromiseSettledResult<unknown>[]>
  getWorkers(): WorkerPublicInfo[]
  updateWorkerModels(rpcPublicKey: string, models: string[]): void
  shutdown(): Promise<void>
}

const HEALTH_CHECK_INTERVAL_MS = 30_000
const MAX_CONSECUTIVE_FAILURES = 3

/** Creates a shared DHT instance for both the dispatcher and worker discovery. */
export async function createDHT(config: AppConfig): Promise<DHT> {
  const bootstrap = config.dhtBootstrap
    ? (() => {
        const parts = config.dhtBootstrap.split(':')
        const host = parts[0] ?? 'localhost'
        const port = Number.parseInt(parts[1] ?? '49737', 10)
        if (Number.isNaN(port) || port < 1 || port > 65535) {
          throw new Error(`Invalid DHT_BOOTSTRAP port: ${parts[1]}`)
        }
        return [{ host, port }]
      })()
    : undefined
  const dht = new DHT({ bootstrap, firewalled: false })
  await dht.ready()
  return dht
}

export async function createDispatcher(
  dht: DHT,
  lbStrategy: LBStrategy,
  logger: pino.Logger,
): Promise<Dispatcher> {
  const rpc = new RPC({ dht })
  const workers = new Map<string, WorkerInfo>()

  logger.info({ firewalled: dht.firewalled }, 'dispatcher RPC ready')

  const healthCheckInterval = setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS)

  function registerWorker({ workerId, rpcPublicKey, streamUrl }: WorkerRegistration): void {
    const existing = workers.get(rpcPublicKey)
    logger.info({ workerId, rpcPublicKey: rpcPublicKey.slice(0, 16) }, 'registered worker')
    workers.set(rpcPublicKey, {
      workerId,
      publicKey: Buffer.from(rpcPublicKey, 'hex'),
      streamUrl: streamUrl ?? existing?.streamUrl ?? null,
      activeJobs: existing?.activeJobs ?? 0,
      loadedModels: existing?.loadedModels ?? [],
      lastHealthCheck: Date.now(),
      healthy: true,
      consecutiveFailures: 0,
    })
  }

  function selectWorker(payload: unknown): SelectedWorker | null {
    const healthyWorkers = [...workers.values()].filter((w) => w.healthy)
    const selected = lbStrategy.select(healthyWorkers, payload)
    if (!selected) return null
    return {
      workerKey: selected.publicKey.toString('hex'),
      streamUrl: selected.streamUrl,
    }
  }

  function acquireJob(workerKey: string): void {
    const worker = workers.get(workerKey)
    if (worker) {
      worker.activeJobs++
    }
  }

  function releaseJob(workerKey: string): void {
    const worker = workers.get(workerKey)
    if (worker && worker.activeJobs > 0) {
      worker.activeJobs--
    }
  }

  function deregisterWorker({ rpcPublicKey }: Pick<WorkerRegistration, 'rpcPublicKey'>): void {
    const worker = workers.get(rpcPublicKey)
    if (worker) {
      logger.info({ workerId: worker.workerId }, 'deregistered worker')
      workers.delete(rpcPublicKey)
    }
  }

  function markWorkerUnhealthy(worker: WorkerInfo): void {
    worker.consecutiveFailures++
    if (worker.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      worker.healthy = false
      logger.warn(
        { workerId: worker.workerId, failures: worker.consecutiveFailures },
        'worker marked unhealthy',
      )
    }
  }

  function markWorkerHealthy(worker: WorkerInfo): void {
    worker.consecutiveFailures = 0
    worker.healthy = true
    worker.lastHealthCheck = Date.now()
  }

  function updateWorkerModels(rpcPublicKey: string, models: string[]): void {
    const worker = workers.get(rpcPublicKey)
    if (worker) {
      worker.loadedModels = models
    }
  }

  async function rpcRequest(publicKey: Buffer, method: string, payload: unknown): Promise<unknown> {
    const response = await rpc.request(publicKey, method, Buffer.from(JSON.stringify(payload)))
    return JSON.parse(response.toString())
  }

  async function request(method: string, payload: unknown): Promise<unknown> {
    const healthyWorkers = [...workers.values()].filter((w) => w.healthy)
    const selected = lbStrategy.select(healthyWorkers, payload)
    if (!selected) {
      throw new WorkerUnavailableError('No healthy workers available')
    }

    selected.activeJobs++
    try {
      const result = await rpcRequest(selected.publicKey, method, payload)
      markWorkerHealthy(selected)
      return result
    } catch (err) {
      markWorkerUnhealthy(selected)
      throw err
    } finally {
      selected.activeJobs--
    }
  }

  async function requestToWorker(
    publicKey: Buffer,
    method: string,
    payload: unknown,
  ): Promise<unknown> {
    return rpcRequest(publicKey, method, payload)
  }

  async function broadcast(
    method: string,
    payload: unknown,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const healthyWorkers = [...workers.values()].filter((w) => w.healthy)
    return Promise.allSettled(
      healthyWorkers.map(async (w) => {
        try {
          const result = await rpcRequest(w.publicKey, method, payload)
          markWorkerHealthy(w)
          return result
        } catch (err) {
          markWorkerUnhealthy(w)
          throw err
        }
      }),
    )
  }

  async function runHealthChecks(): Promise<void> {
    await Promise.allSettled(
      [...workers.values()].map(async (worker) => {
        try {
          const result = (await rpcRequest(worker.publicKey, 'health.check', {})) as {
            healthy?: boolean
            models?: string[]
          }
          markWorkerHealthy(worker)
          if (result.models) {
            worker.loadedModels = result.models
          }
        } catch {
          markWorkerUnhealthy(worker)
        }
      }),
    )
  }

  function getWorkers(): WorkerPublicInfo[] {
    return [...workers.values()].map((w) => ({
      publicKey: w.publicKey.toString('hex'),
      workerId: w.workerId,
      streamUrl: w.streamUrl,
      activeJobs: w.activeJobs,
      loadedModels: w.loadedModels,
      healthy: w.healthy,
      lastHealthCheck: w.lastHealthCheck,
    }))
  }

  async function shutdown(): Promise<void> {
    clearInterval(healthCheckInterval)
    await rpc.destroy()
  }

  return {
    registerWorker,
    deregisterWorker,
    selectWorker,
    acquireJob,
    releaseJob,
    request,
    requestToWorker,
    broadcast,
    getWorkers,
    updateWorkerModels,
    shutdown,
  }
}
