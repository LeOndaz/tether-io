import type { LBStrategy, WorkerInfo } from '../dispatcher'

export class ModelAffinityStrategy implements LBStrategy {
  select(workers: WorkerInfo[], request: unknown): WorkerInfo | null {
    if (workers.length === 0) return null

    const model = (request as { model?: string })?.model
    if (!model) return workers[0] as WorkerInfo

    // Prefer workers that already have the model loaded
    const withModel = workers.filter((w) => w.loadedModels?.includes(model))
    if (withModel.length > 0) {
      // Among workers with the model, pick the one with least active jobs
      return withModel.reduce(
        (min, w) => (w.activeJobs < min.activeJobs ? w : min),
        withModel[0] as WorkerInfo,
      )
    }

    // Fall back to least connections if no worker has the model
    return workers.reduce(
      (min, w) => (w.activeJobs < min.activeJobs ? w : min),
      workers[0] as WorkerInfo,
    )
  }
}
