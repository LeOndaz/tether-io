export class AppError extends Error {
  statusCode: number
  code: string
  details: unknown

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class AuthError extends AppError {
  constructor(message = 'Invalid or missing API key', details?: unknown) {
    super(message, 401, 'AUTH_ERROR', details)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details)
  }
}

export class RateLimitError extends AppError {
  retryAfter: number

  constructor(retryAfter: number, details?: unknown) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', details)
    this.retryAfter = retryAfter
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', details?: unknown) {
    super(`${resource} not found`, 404, 'NOT_FOUND', details)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details)
  }
}
