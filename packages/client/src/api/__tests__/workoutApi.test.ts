import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workoutApi, NotFoundError, ValidationError } from '../workoutApi';
import type { WorkoutWithExercises } from '../workoutApi';
import type { Workout, WorkoutSet } from '@brad-os/shared';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('workoutApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  const mockWorkoutWithExercises: WorkoutWithExercises = {
    id: 1,
    mesocycle_id: 1,
    plan_day_id: 1,
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'pending',
    started_at: null,
    completed_at: null,
    plan_day_name: 'Day 1',
    exercises: [
      {
        exercise_id: 1,
        exercise_name: 'Bench Press',
        sets: [
          {
            id: 1,
            workout_id: 1,
            exercise_id: 1,
            set_number: 1,
            target_reps: 10,
            target_weight: 135,
            actual_reps: null,
            actual_weight: null,
            status: 'pending',
          },
        ],
        total_sets: 1,
        completed_sets: 0,
        rest_seconds: 90,
      },
    ],
  };

  const mockWorkout: Workout = {
    id: 1,
    mesocycle_id: 1,
    plan_day_id: 1,
    week_number: 1,
    scheduled_date: '2024-01-15',
    status: 'in_progress',
    started_at: '2024-01-15T10:00:00Z',
    completed_at: null,
  };

  const mockWorkoutSet: WorkoutSet = {
    id: 1,
    workout_id: 1,
    exercise_id: 1,
    set_number: 1,
    target_reps: 10,
    target_weight: 135,
    actual_reps: 10,
    actual_weight: 140,
    status: 'completed',
  };

  describe('getTodaysWorkout', () => {
    it('should return workout when scheduled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockWorkoutWithExercises }),
      });

      const result = await workoutApi.getTodaysWorkout();

      expect(result).toEqual(mockWorkoutWithExercises);
      expect(mockFetch).toHaveBeenCalledWith('/api/workouts/today');
    });

    it('should return null when no workout scheduled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: null }),
      });

      const result = await workoutApi.getTodaysWorkout();

      expect(result).toBeNull();
    });
  });

  describe('getWorkout', () => {
    it('should return workout by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockWorkoutWithExercises }),
      });

      const result = await workoutApi.getWorkout(1);

      expect(result).toEqual(mockWorkoutWithExercises);
      expect(mockFetch).toHaveBeenCalledWith('/api/workouts/1');
    });

    it('should throw NotFoundError for non-existent workout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { message: 'Workout with id 999 not found', code: 'NOT_FOUND' },
        }),
      });

      await expect(workoutApi.getWorkout(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('startWorkout', () => {
    it('should start workout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockWorkout }),
      });

      const result = await workoutApi.startWorkout(1);

      expect(result.status).toBe('in_progress');
      expect(mockFetch).toHaveBeenCalledWith('/api/workouts/1/start', {
        method: 'PUT',
      });
    });

    it('should throw ValidationError when already started', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: { message: 'Workout is already in progress', code: 'VALIDATION_ERROR' },
        }),
      });

      await expect(workoutApi.startWorkout(1)).rejects.toThrow(ValidationError);
    });
  });

  describe('completeWorkout', () => {
    it('should complete workout', async () => {
      const completedWorkout: Workout = {
        ...mockWorkout,
        status: 'completed',
        completed_at: '2024-01-15T11:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: completedWorkout }),
      });

      const result = await workoutApi.completeWorkout(1);

      expect(result.status).toBe('completed');
      expect(result.completed_at).not.toBeNull();
    });

    it('should throw ValidationError when not started', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            message: 'Cannot complete a workout that has not been started',
            code: 'VALIDATION_ERROR',
          },
        }),
      });

      await expect(workoutApi.completeWorkout(1)).rejects.toThrow(ValidationError);
    });
  });

  describe('skipWorkout', () => {
    it('should skip workout', async () => {
      const skippedWorkout: Workout = {
        ...mockWorkout,
        status: 'skipped',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: skippedWorkout }),
      });

      const result = await workoutApi.skipWorkout(1);

      expect(result.status).toBe('skipped');
    });
  });

  describe('logSet', () => {
    it('should log set with actual values', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockWorkoutSet }),
      });

      const result = await workoutApi.logSet(1, {
        actual_reps: 10,
        actual_weight: 140,
      });

      expect(result.actual_reps).toBe(10);
      expect(result.actual_weight).toBe(140);
      expect(result.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledWith('/api/workout-sets/1/log', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_reps: 10, actual_weight: 140 }),
      });
    });

    it('should throw ValidationError for completed workout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: {
            message: 'Cannot log sets for a completed workout',
            code: 'VALIDATION_ERROR',
          },
        }),
      });

      await expect(
        workoutApi.logSet(1, { actual_reps: 10, actual_weight: 140 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('skipSet', () => {
    it('should skip set', async () => {
      const skippedSet: WorkoutSet = {
        ...mockWorkoutSet,
        status: 'skipped',
        actual_reps: null,
        actual_weight: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: skippedSet }),
      });

      const result = await workoutApi.skipSet(1);

      expect(result.status).toBe('skipped');
      expect(mockFetch).toHaveBeenCalledWith('/api/workout-sets/1/skip', {
        method: 'PUT',
      });
    });
  });
});
