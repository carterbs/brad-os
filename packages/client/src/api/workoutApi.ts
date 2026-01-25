import type {
  Workout,
  WorkoutSet,
  WorkoutExercise,
  ApiResponse,
  ApiError,
  LogWorkoutSetInput,
  ModifySetCountResult,
} from '@brad-os/shared';
import {
  ApiClientError,
  NotFoundError,
  ValidationError,
} from './exerciseApi';

const API_BASE = '/api';

// Re-export error classes for convenience
export { ApiClientError, NotFoundError, ValidationError };

/**
 * Extended workout type with exercises grouped
 */
export interface WorkoutWithExercises extends Workout {
  plan_day_name: string;
  exercises: WorkoutExerciseWithSets[];
}

export interface WorkoutExerciseWithSets extends WorkoutExercise {
  rest_seconds: number;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as ApiResponse<T> | ApiError;

  if (!response.ok || !result.success) {
    const errorResult = result as ApiError;
    const message = errorResult.error?.message ?? 'An error occurred';
    const code = errorResult.error?.code ?? 'UNKNOWN_ERROR';

    switch (response.status) {
      case 404:
        throw new NotFoundError(message);
      case 400:
        throw new ValidationError(message);
      default:
        throw new ApiClientError(message, response.status, code);
    }
  }

  return result.data;
}

export const workoutApi = {
  /**
   * Get today's workout (pending or in_progress)
   * Returns null if no workout scheduled or already completed/skipped
   */
  getTodaysWorkout: async (): Promise<WorkoutWithExercises | null> => {
    const response = await fetch(`${API_BASE}/workouts/today`);
    return handleResponse<WorkoutWithExercises | null>(response);
  },

  /**
   * Get a workout by ID with all sets grouped by exercise
   */
  getWorkout: async (id: number): Promise<WorkoutWithExercises> => {
    const response = await fetch(`${API_BASE}/workouts/${id}`);
    return handleResponse<WorkoutWithExercises>(response);
  },

  /**
   * Start a workout (mark as in_progress)
   */
  startWorkout: async (id: number): Promise<Workout> => {
    const response = await fetch(`${API_BASE}/workouts/${id}/start`, {
      method: 'PUT',
    });
    return handleResponse<Workout>(response);
  },

  /**
   * Complete a workout
   */
  completeWorkout: async (id: number): Promise<Workout> => {
    const response = await fetch(`${API_BASE}/workouts/${id}/complete`, {
      method: 'PUT',
    });
    return handleResponse<Workout>(response);
  },

  /**
   * Skip a workout
   */
  skipWorkout: async (id: number): Promise<Workout> => {
    const response = await fetch(`${API_BASE}/workouts/${id}/skip`, {
      method: 'PUT',
    });
    return handleResponse<Workout>(response);
  },

  /**
   * Log actual reps and weight for a set
   */
  logSet: async (
    setId: number,
    data: LogWorkoutSetInput
  ): Promise<WorkoutSet> => {
    const response = await fetch(`${API_BASE}/workout-sets/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<WorkoutSet>(response);
  },

  /**
   * Skip a set
   */
  skipSet: async (setId: number): Promise<WorkoutSet> => {
    const response = await fetch(`${API_BASE}/workout-sets/${setId}/skip`, {
      method: 'PUT',
    });
    return handleResponse<WorkoutSet>(response);
  },

  /**
   * Unlog a set (revert to pending)
   */
  unlogSet: async (setId: number): Promise<WorkoutSet> => {
    const response = await fetch(`${API_BASE}/workout-sets/${setId}/unlog`, {
      method: 'PUT',
    });
    return handleResponse<WorkoutSet>(response);
  },

  /**
   * Add a new set to an exercise in a workout
   * Copies target values from the last set and propagates to future workouts
   */
  addSet: async (
    workoutId: number,
    exerciseId: number
  ): Promise<ModifySetCountResult> => {
    const response = await fetch(
      `${API_BASE}/workouts/${workoutId}/exercises/${exerciseId}/sets/add`,
      { method: 'POST' }
    );
    return handleResponse<ModifySetCountResult>(response);
  },

  /**
   * Remove the last pending set from an exercise in a workout
   * Propagates the change to future workouts
   */
  removeSet: async (
    workoutId: number,
    exerciseId: number
  ): Promise<ModifySetCountResult> => {
    const response = await fetch(
      `${API_BASE}/workouts/${workoutId}/exercises/${exerciseId}/sets/remove`,
      { method: 'DELETE' }
    );
    return handleResponse<ModifySetCountResult>(response);
  },
};
