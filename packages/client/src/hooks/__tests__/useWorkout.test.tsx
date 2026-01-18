import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useTodaysWorkout,
  useWorkout,
  useStartWorkout,
  useCompleteWorkout,
  useSkipWorkout,
  useLogSet,
  useSkipSet,
} from '../useWorkout';
import { workoutApi, type WorkoutWithExercises } from '../../api/workoutApi';
import type { Workout, WorkoutSet } from '@lifting/shared';

// Mock the API
vi.mock('../../api/workoutApi', () => ({
  workoutApi: {
    getTodaysWorkout: vi.fn(),
    getWorkout: vi.fn(),
    startWorkout: vi.fn(),
    completeWorkout: vi.fn(),
    skipWorkout: vi.fn(),
    logSet: vi.fn(),
    skipSet: vi.fn(),
  },
  NotFoundError: class extends Error {},
  ValidationError: class extends Error {},
  ApiClientError: class extends Error {},
}));

// Mock localStorage hook
vi.mock('../useLocalStorage', () => ({
  useWorkoutStorage: () => ({
    storedState: null,
    saveState: vi.fn(),
    clearState: vi.fn(),
    updateSet: vi.fn(),
    getStoredStateForWorkout: vi.fn(),
  }),
}));

const mockWorkout: WorkoutWithExercises = {
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

const createWrapper = (): {
  wrapper: ({ children }: { children: ReactNode }) => JSX.Element;
  queryClient: QueryClient;
} => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { wrapper, queryClient };
};

describe('useWorkout hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTodaysWorkout', () => {
    it('should fetch todays workout on mount', async () => {
      vi.mocked(workoutApi.getTodaysWorkout).mockResolvedValueOnce(mockWorkout);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTodaysWorkout(), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockWorkout);
      });

      expect(workoutApi.getTodaysWorkout).toHaveBeenCalledTimes(1);
    });

    it('should return null when no workout scheduled', async () => {
      vi.mocked(workoutApi.getTodaysWorkout).mockResolvedValueOnce(null);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTodaysWorkout(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      vi.mocked(workoutApi.getTodaysWorkout).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockWorkout), 100))
      );

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useTodaysWorkout(), { wrapper });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('useWorkout', () => {
    it('should fetch workout by ID', async () => {
      vi.mocked(workoutApi.getWorkout).mockResolvedValueOnce(mockWorkout);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useWorkout(1), { wrapper });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockWorkout);
      });

      expect(workoutApi.getWorkout).toHaveBeenCalledWith(1);
    });

    it('should not fetch when ID is 0', () => {
      const { wrapper } = createWrapper();
      renderHook(() => useWorkout(0), { wrapper });

      expect(workoutApi.getWorkout).not.toHaveBeenCalled();
    });
  });

  describe('useStartWorkout', () => {
    it('should start workout', async () => {
      const startedWorkout: Workout = {
        ...mockWorkout,
        status: 'in_progress',
        started_at: '2024-01-15T10:00:00Z',
      };

      vi.mocked(workoutApi.startWorkout).mockResolvedValueOnce(startedWorkout);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useStartWorkout(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(workoutApi.startWorkout).toHaveBeenCalled();
      expect(vi.mocked(workoutApi.startWorkout).mock.calls[0]?.[0]).toBe(1);
    });
  });

  describe('useCompleteWorkout', () => {
    it('should complete workout', async () => {
      const completedWorkout: Workout = {
        ...mockWorkout,
        status: 'completed',
        completed_at: '2024-01-15T11:00:00Z',
      };

      vi.mocked(workoutApi.completeWorkout).mockResolvedValueOnce(completedWorkout);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useCompleteWorkout(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(workoutApi.completeWorkout).toHaveBeenCalled();
      expect(vi.mocked(workoutApi.completeWorkout).mock.calls[0]?.[0]).toBe(1);
    });
  });

  describe('useSkipWorkout', () => {
    it('should skip workout', async () => {
      const skippedWorkout: Workout = {
        ...mockWorkout,
        status: 'skipped',
      };

      vi.mocked(workoutApi.skipWorkout).mockResolvedValueOnce(skippedWorkout);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSkipWorkout(), { wrapper });

      result.current.mutate(1);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(workoutApi.skipWorkout).toHaveBeenCalled();
      expect(vi.mocked(workoutApi.skipWorkout).mock.calls[0]?.[0]).toBe(1);
    });
  });

  describe('useLogSet', () => {
    it('should log set with actual values', async () => {
      const loggedSet: WorkoutSet = {
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

      vi.mocked(workoutApi.logSet).mockResolvedValueOnce(loggedSet);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useLogSet(), { wrapper });

      result.current.mutate({
        setId: 1,
        data: { actual_reps: 10, actual_weight: 140 },
        workoutId: 1,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(workoutApi.logSet).toHaveBeenCalledWith(1, {
        actual_reps: 10,
        actual_weight: 140,
      });
    });
  });

  describe('useSkipSet', () => {
    it('should skip set', async () => {
      const skippedSet: WorkoutSet = {
        id: 1,
        workout_id: 1,
        exercise_id: 1,
        set_number: 1,
        target_reps: 10,
        target_weight: 135,
        actual_reps: null,
        actual_weight: null,
        status: 'skipped',
      };

      vi.mocked(workoutApi.skipSet).mockResolvedValueOnce(skippedSet);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSkipSet(), { wrapper });

      result.current.mutate({ setId: 1, workoutId: 1 });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(workoutApi.skipSet).toHaveBeenCalledWith(1);
    });
  });
});
