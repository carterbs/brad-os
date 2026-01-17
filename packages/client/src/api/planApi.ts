import type {
  Plan,
  PlanDay,
  PlanDayExercise,
  CreatePlanDTO,
  UpdatePlanDTO,
  CreatePlanDayDTO,
  UpdatePlanDayDTO,
  CreatePlanDayExerciseDTO,
  UpdatePlanDayExerciseDTO,
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

  return (result as ApiResponse<T>).data;
}

async function handleDeleteResponse(response: Response): Promise<void> {
  if (!response.ok) {
    const result = (await response.json()) as ApiError;
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
}

// ============ Plans ============

export const planApi = {
  getPlans: async (): Promise<Plan[]> => {
    const response = await fetch(`${API_BASE}/plans`);
    return handleResponse<Plan[]>(response);
  },

  getPlan: async (id: number): Promise<Plan> => {
    const response = await fetch(`${API_BASE}/plans/${id}`);
    return handleResponse<Plan>(response);
  },

  createPlan: async (data: CreatePlanDTO): Promise<Plan> => {
    const response = await fetch(`${API_BASE}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Plan>(response);
  },

  updatePlan: async (id: number, data: UpdatePlanDTO): Promise<Plan> => {
    const response = await fetch(`${API_BASE}/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Plan>(response);
  },

  deletePlan: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/plans/${id}`, {
      method: 'DELETE',
    });
    await handleDeleteResponse(response);
  },
};

// ============ Plan Days ============

export const planDayApi = {
  getPlanDays: async (planId: number): Promise<PlanDay[]> => {
    const response = await fetch(`${API_BASE}/plans/${planId}/days`);
    return handleResponse<PlanDay[]>(response);
  },

  createPlanDay: async (
    planId: number,
    data: Omit<CreatePlanDayDTO, 'plan_id'>
  ): Promise<PlanDay> => {
    const response = await fetch(`${API_BASE}/plans/${planId}/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PlanDay>(response);
  },

  updatePlanDay: async (
    planId: number,
    dayId: number,
    data: UpdatePlanDayDTO
  ): Promise<PlanDay> => {
    const response = await fetch(`${API_BASE}/plans/${planId}/days/${dayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PlanDay>(response);
  },

  deletePlanDay: async (planId: number, dayId: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/plans/${planId}/days/${dayId}`, {
      method: 'DELETE',
    });
    await handleDeleteResponse(response);
  },
};

// ============ Plan Day Exercises ============

export const planDayExerciseApi = {
  getPlanDayExercises: async (
    planId: number,
    dayId: number
  ): Promise<PlanDayExercise[]> => {
    const response = await fetch(
      `${API_BASE}/plans/${planId}/days/${dayId}/exercises`
    );
    return handleResponse<PlanDayExercise[]>(response);
  },

  createPlanDayExercise: async (
    planId: number,
    dayId: number,
    data: Omit<CreatePlanDayExerciseDTO, 'plan_day_id'>
  ): Promise<PlanDayExercise> => {
    const response = await fetch(
      `${API_BASE}/plans/${planId}/days/${dayId}/exercises`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleResponse<PlanDayExercise>(response);
  },

  updatePlanDayExercise: async (
    planId: number,
    dayId: number,
    exerciseId: number,
    data: UpdatePlanDayExerciseDTO
  ): Promise<PlanDayExercise> => {
    const response = await fetch(
      `${API_BASE}/plans/${planId}/days/${dayId}/exercises/${exerciseId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleResponse<PlanDayExercise>(response);
  },

  deletePlanDayExercise: async (
    planId: number,
    dayId: number,
    exerciseId: number
  ): Promise<void> => {
    const response = await fetch(
      `${API_BASE}/plans/${planId}/days/${dayId}/exercises/${exerciseId}`,
      {
        method: 'DELETE',
      }
    );
    await handleDeleteResponse(response);
  },
};
