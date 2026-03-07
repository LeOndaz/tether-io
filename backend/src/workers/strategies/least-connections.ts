import type { LBStrategy, WorkerInfo } from '../dispatcher'

export class LeastConnectionsStrategy implements LBStrategy {
  select(workers: WorkerInfo[], _request: unknown): WorkerInfo | null {
    if (workers.length === 0) return null
    return workers.reduce(
      (min, w) => (w.activeJobs < min.activeJobs ? w : min),
      workers[0] as WorkerInfo,
    )
  }
}
