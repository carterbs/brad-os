import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '../shared.js';
import { AppError } from '../types/errors.js';

// Re-export error classes so existing handler imports keep working
export { AppError, NotFoundError, ValidationError, ConflictError, ForbiddenError } from '../types/errors.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error using Cloud Functions logger
  console.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ApiError = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
      },
    };
    res.status(400).json(response);
    return;
  }

  // Handle known application errors
  if (err instanceof AppError) {
    const response: ApiError = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle Firestore constraint-like errors
  if (err.message?.includes('already exists')) {
    const response: ApiError = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with this value already exists',
      },
    };
    res.status(409).json(response);
    return;
  }

  // Unknown errors
  const response: ApiError = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  res.status(500).json(response);
}
