import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@brad-os/shared';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: number | string) {
    super(404, 'NOT_FOUND', `${resource} with id ${id} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, 'FORBIDDEN', message);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging (in production, use a proper logger)
  if (process.env['NODE_ENV'] !== 'test') {
    console.error('Error:', err);
  }

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

  // Handle SQLite constraint errors
  if (err.message?.includes('UNIQUE constraint failed')) {
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

  if (err.message?.includes('FOREIGN KEY constraint failed')) {
    const response: ApiError = {
      success: false,
      error: {
        code: 'CONSTRAINT_ERROR',
        message: 'Referenced record does not exist or cannot be deleted',
      },
    };
    res.status(400).json(response);
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
