import { AppError } from '../shared/errors.js'

export class WorkerUnavailableError extends AppError {
  constructor(message = 'No workers available', details?: unknown) {
    super(message, 503, 'WORKER_UNAVAILABLE', details)
  }
}
