import type { LBStrategy, WorkerInfo } from '../dispatcher.js'

export class RoundRobinStrategy implements LBStrategy {
  private index = 0

  select(workers: WorkerInfo[], _request: unknown): WorkerInfo | null {
    if (workers.length === 0) return null
    const worker = workers[this.index % workers.length] as WorkerInfo
    this.index = (this.index + 1) % workers.length
    return worker
  }
}
