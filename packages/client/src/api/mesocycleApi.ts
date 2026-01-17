import type {
  Mesocycle,
  MesocycleWithDetails,
  CreateMesocycleRequest,
  ApiResponse,
  ApiError,
} from '@lifting/shared';
import {
  ApiClientError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from './exerciseApi';

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T> | ApiError;

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

export const mesocycleApi = {
  /**
   * Get all mesocycles
   */
  getMesocycles: async (): Promise<Mesocycle[]> => {
    const response = await fetch(`${API_BASE}/mesocycles`);
    return handleResponse<Mesocycle[]>(response);
  },

  /**
   * Get the active mesocycle with full details
   */
  getActiveMesocycle: async (): Promise<MesocycleWithDetails | null> => {
    const response = await fetch(`${API_BASE}/mesocycles/active`);
    return handleResponse<MesocycleWithDetails | null>(response);
  },

  /**
   * Get a mesocycle by ID with full details
   */
  getMesocycle: async (id: number): Promise<MesocycleWithDetails> => {
    const response = await fetch(`${API_BASE}/mesocycles/${id}`);
    return handleResponse<MesocycleWithDetails>(response);
  },

  /**
   * Create a new mesocycle from a plan
   */
  createMesocycle: async (
    data: CreateMesocycleRequest
  ): Promise<Mesocycle> => {
    const response = await fetch(`${API_BASE}/mesocycles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Mesocycle>(response);
  },

  /**
   * Mark a mesocycle as completed
   */
  completeMesocycle: async (id: number): Promise<Mesocycle> => {
    const response = await fetch(`${API_BASE}/mesocycles/${id}/complete`, {
      method: 'PUT',
    });
    return handleResponse<Mesocycle>(response);
  },

  /**
   * Cancel a mesocycle (preserves data)
   */
  cancelMesocycle: async (id: number): Promise<Mesocycle> => {
    const response = await fetch(`${API_BASE}/mesocycles/${id}/cancel`, {
      method: 'PUT',
    });
    return handleResponse<Mesocycle>(response);
  },
};
