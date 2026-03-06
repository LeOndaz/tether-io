import { AppError } from '../shared/errors.js'

export class DeploymentError extends AppError {
  constructor(message = 'Deployment failed', details?: unknown) {
    super(message, 500, 'DEPLOYMENT_ERROR', details)
  }
}
