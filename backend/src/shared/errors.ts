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

export class RateLimitError extends AppError {
  retryAfter: number

  constructor(retryAfter: number, details?: unknown) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', details)
    this.retryAfter = retryAfter
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details)
  }
}
