import { AppError } from '../shared/errors'

export class WorkerUnavailableError extends AppError {
  constructor(message = 'No workers available', details?: unknown) {
    super(message, 503, 'WORKER_UNAVAILABLE', details)
  }
}
