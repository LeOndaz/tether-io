import type { LBStrategy, WorkerInfo } from '../dispatcher'
import { LeastConnectionsStrategy } from './least-connections'

export class ModelAffinityStrategy implements LBStrategy {
  private fallback = new LeastConnectionsStrategy()

  select(workers: WorkerInfo[], request: unknown): WorkerInfo | null {
    if (workers.length === 0) return null

    const model = (request as { model?: string })?.model
    if (!model) return this.fallback.select(workers, request)

    // Prefer workers that already have the model loaded
    const withModel = workers.filter((w) => w.loadedModels?.includes(model))
    if (withModel.length > 0) {
      return this.fallback.select(withModel, request)
    }

    // No worker has the model — fall back to least connections
    return this.fallback.select(workers, request)
  }
}
