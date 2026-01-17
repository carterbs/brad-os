import type { Exercise, CreateExerciseDTO, UpdateExerciseDTO, ApiResponse, ApiError } from '@lifting/shared';

const API_BASE = '/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class NotFoundError extends ApiClientError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ForbiddenError extends ApiClientError {
  constructor(message: string) {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends ApiClientError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends ApiClientError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const result = await response.json() as ApiResponse<T> | ApiError;

  if (!response.ok || !result.success) {
    const errorResult = result as ApiError;
    const message = errorResult.error?.message ?? 'An error occurred';
    const code = errorResult.error?.code ?? 'UNKNOWN_ERROR';

    switch (response.status) {
      case 404:
        throw new NotFoundError(message);
      case 403:
        throw new ForbiddenError(message);
      case 409:
        throw new ConflictError(message);
      case 400:
        throw new ValidationError(message);
      default:
        throw new ApiClientError(message, response.status, code);
    }
  }

  return (result).data;
}

export const exerciseApi = {
  getExercises: async (): Promise<Exercise[]> => {
    const response = await fetch(`${API_BASE}/exercises`);
    return handleResponse<Exercise[]>(response);
  },

  getExercise: async (id: number): Promise<Exercise> => {
    const response = await fetch(`${API_BASE}/exercises/${id}`);
    return handleResponse<Exercise>(response);
  },

  createExercise: async (data: CreateExerciseDTO): Promise<Exercise> => {
    const response = await fetch(`${API_BASE}/exercises`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Exercise>(response);
  },

  updateExercise: async (id: number, data: UpdateExerciseDTO): Promise<Exercise> => {
    const response = await fetch(`${API_BASE}/exercises/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Exercise>(response);
  },

  deleteExercise: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/exercises/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const result = await response.json() as ApiError;
      const message = result.error?.message ?? 'An error occurred';
      const code = result.error?.code ?? 'UNKNOWN_ERROR';

      switch (response.status) {
        case 404:
          throw new NotFoundError(message);
        case 403:
          throw new ForbiddenError(message);
        case 409:
          throw new ConflictError(message);
        default:
          throw new ApiClientError(message, response.status, code);
      }
    }
  },
};
