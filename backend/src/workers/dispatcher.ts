import RPC from '@hyperswarm/rpc'
import DHT from 'hyperdht'
import type { AppConfig } from '../config/index.js'
import { WorkerUnavailableError } from './errors.js'

export interface WorkerInfo {
  workerId: string
  publicKey: Buffer
  activeJobs: number
  loadedModels: string[]
  lastHealthCheck: number
  healthy: boolean
}

export interface LBStrategy {
  select(workers: WorkerInfo[], request: unknown): WorkerInfo | null
}

export interface WorkerRegistration {
  workerId: string
  rpcPublicKey: string
}

export interface WorkerPublicInfo {
  publicKey: string
  workerId: string
  activeJobs: number
  loadedModels: string[]
  healthy: boolean
  lastHealthCheck: number
}

export interface Dispatcher {
  registerWorker(registration: WorkerRegistration): void
  deregisterWorker(registration: Pick<WorkerRegistration, 'rpcPublicKey'>): void
  request(method: string, payload: unknown): Promise<unknown>
  requestToWorker(publicKey: Buffer, method: string, payload: unknown): Promise<unknown>
  broadcast(method: string, payload: unknown): Promise<PromiseSettledResult<unknown>[]>
  getWorkers(): WorkerPublicInfo[]
  shutdown(): Promise<void>
}

export async function createDispatcher(
  config: AppConfig,
  lbStrategy: LBStrategy,
): Promise<Dispatcher> {
  const bootstrap = config.dhtBootstrap
    ? [
        {
          host: config.dhtBootstrap.split(':')[0] ?? '',
          port: Number(config.dhtBootstrap.split(':')[1]),
        },
      ]
    : undefined
  const dht = new DHT({ bootstrap, firewalled: false })
  await dht.ready()
  const rpc = new RPC({ dht })
  const workers = new Map<string, WorkerInfo>()

  console.log(
    `[dispatcher] RPC ready, DHT bootstrap: ${config.dhtBootstrap || 'public'}, firewalled: ${dht.firewalled}`,
  )

  function registerWorker({ workerId, rpcPublicKey }: WorkerRegistration): void {
    console.log(`[dispatcher] registered worker ${workerId}: ${rpcPublicKey.slice(0, 16)}...`)
    workers.set(rpcPublicKey, {
      workerId,
      publicKey: Buffer.from(rpcPublicKey, 'hex'),
      activeJobs: 0,
      loadedModels: [],
      lastHealthCheck: Date.now(),
      healthy: true,
    })
  }

  function deregisterWorker({ rpcPublicKey }: Pick<WorkerRegistration, 'rpcPublicKey'>): void {
    const worker = workers.get(rpcPublicKey)
    if (worker) {
      console.log(`[dispatcher] deregistered worker ${worker.workerId}`)
      workers.delete(rpcPublicKey)
    }
  }

  async function request(method: string, payload: unknown): Promise<unknown> {
    const workerList = [...workers.values()].filter((w) => w.healthy)

    const selected = lbStrategy.select(workerList, payload)
    if (!selected) {
      throw new WorkerUnavailableError('No healthy workers available')
    }

    selected.activeJobs++
    try {
      const response = await rpc.request(
        selected.publicKey,
        method,
        Buffer.from(JSON.stringify(payload)),
      )
      return JSON.parse(response.toString())
    } finally {
      selected.activeJobs--
    }
  }

  async function requestToWorker(
    publicKey: Buffer,
    method: string,
    payload: unknown,
  ): Promise<unknown> {
    const response = await rpc.request(publicKey, method, Buffer.from(JSON.stringify(payload)))
    return JSON.parse(response.toString())
  }

  async function broadcast(
    method: string,
    payload: unknown,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const workerList = [...workers.values()].filter((w) => w.healthy)
    return Promise.allSettled(
      workerList.map(async (w) => {
        const response = await rpc.request(
          w.publicKey,
          method,
          Buffer.from(JSON.stringify(payload)),
        )
        return JSON.parse(response.toString())
      }),
    )
  }

  function getWorkers(): WorkerPublicInfo[] {
    return [...workers.values()].map((w) => ({
      publicKey: w.publicKey.toString('hex'),
      workerId: w.workerId,
      activeJobs: w.activeJobs,
      loadedModels: w.loadedModels,
      healthy: w.healthy,
      lastHealthCheck: w.lastHealthCheck,
    }))
  }

  async function shutdown(): Promise<void> {
    await rpc.destroy()
  }

  return {
    registerWorker,
    deregisterWorker,
    request,
    requestToWorker,
    broadcast,
    getWorkers,
    shutdown,
  }
}
