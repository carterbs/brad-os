import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Workout, WorkoutSet, LogWorkoutSetInput, ModifySetCountResult } from '@lifting/shared';
import {
  workoutApi,
  type WorkoutWithExercises,
  type ApiClientError,
} from '../api/workoutApi';
import { useWorkoutStorage } from './useLocalStorage';
import { useCallback } from 'react';

export const workoutKeys = {
  all: ['workouts'] as const,
  lists: () => [...workoutKeys.all, 'list'] as const,
  list: () => [...workoutKeys.lists()] as const,
  details: () => [...workoutKeys.all, 'detail'] as const,
  detail: (id: number) => [...workoutKeys.details(), id] as const,
  today: () => [...workoutKeys.all, 'today'] as const,
};

/**
 * Hook for fetching today's workout
 */
export function useTodaysWorkout(): UseQueryResult<
  WorkoutWithExercises | null,
  ApiClientError
> {
  return useQuery({
    queryKey: workoutKeys.today(),
    queryFn: workoutApi.getTodaysWorkout,
  });
}

/**
 * Hook for fetching a specific workout by ID
 */
export function useWorkout(
  id: number
): UseQueryResult<WorkoutWithExercises, ApiClientError> {
  return useQuery({
    queryKey: workoutKeys.detail(id),
    queryFn: () => workoutApi.getWorkout(id),
    enabled: id > 0,
  });
}

/**
 * Hook for starting a workout
 */
export function useStartWorkout(): UseMutationResult<
  Workout,
  ApiClientError,
  number,
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: workoutApi.startWorkout,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(id)
      );

      // Optimistically update
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        };
        queryClient.setQueryData(workoutKeys.detail(id), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      return { previousWorkout };
    },
    onError: (_error, id, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(workoutKeys.detail(id), context.previousWorkout);
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: workoutKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for completing a workout
 */
export function useCompleteWorkout(): UseMutationResult<
  Workout,
  ApiClientError,
  number,
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();
  const { clearState } = useWorkoutStorage();

  return useMutation({
    mutationFn: workoutApi.completeWorkout,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(id)
      );

      // Optimistically update
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          status: 'completed',
          completed_at: new Date().toISOString(),
        };
        queryClient.setQueryData(workoutKeys.detail(id), optimisticWorkout);
        // Today's workout should return null after completion
        queryClient.setQueryData(workoutKeys.today(), null);
      }

      return { previousWorkout };
    },
    onSuccess: () => {
      // Clear localStorage when workout completes
      clearState();
    },
    onError: (_error, id, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(workoutKeys.detail(id), context.previousWorkout);
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: workoutKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for skipping a workout
 */
export function useSkipWorkout(): UseMutationResult<
  Workout,
  ApiClientError,
  number,
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();
  const { clearState } = useWorkoutStorage();

  return useMutation({
    mutationFn: workoutApi.skipWorkout,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(id) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(id)
      );

      // Optimistically update
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          status: 'skipped',
          exercises: previousWorkout.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((set) =>
              set.status === 'pending' ? { ...set, status: 'skipped' as const } : set
            ),
          })),
        };
        queryClient.setQueryData(workoutKeys.detail(id), optimisticWorkout);
        // Today's workout should return null after skipping
        queryClient.setQueryData(workoutKeys.today(), null);
      }

      return { previousWorkout };
    },
    onSuccess: () => {
      // Clear localStorage when workout is skipped
      clearState();
    },
    onError: (_error, id, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(workoutKeys.detail(id), context.previousWorkout);
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, id) => {
      void queryClient.invalidateQueries({ queryKey: workoutKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for logging a set
 */
export function useLogSet(): UseMutationResult<
  WorkoutSet,
  ApiClientError,
  { setId: number; data: LogWorkoutSetInput; workoutId: number },
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();
  const { updateSet } = useWorkoutStorage();

  return useMutation({
    mutationFn: ({ setId, data }) => workoutApi.logSet(setId, data),
    onMutate: async ({ setId, data, workoutId }) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(workoutId) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(workoutId)
      );

      // Optimistically update the workout
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          status: 'in_progress', // Auto-start if pending
          started_at: previousWorkout.started_at ?? new Date().toISOString(),
          exercises: previousWorkout.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    actual_reps: data.actual_reps,
                    actual_weight: data.actual_weight,
                    status: 'completed' as const,
                  }
                : set
            ),
            completed_sets: ex.sets.filter(
              (s) => s.id === setId || s.status === 'completed'
            ).length,
          })),
        };
        queryClient.setQueryData(workoutKeys.detail(workoutId), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      // Save to localStorage immediately
      updateSet(workoutId, setId, {
        actual_reps: data.actual_reps,
        actual_weight: data.actual_weight,
        status: 'completed',
      });

      return { previousWorkout };
    },
    onError: (_error, { workoutId }, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(
          workoutKeys.detail(workoutId),
          context.previousWorkout
        );
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, { workoutId }) => {
      void queryClient.invalidateQueries({
        queryKey: workoutKeys.detail(workoutId),
      });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for skipping a set
 */
export function useSkipSet(): UseMutationResult<
  WorkoutSet,
  ApiClientError,
  { setId: number; workoutId: number },
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();
  const { updateSet } = useWorkoutStorage();

  return useMutation({
    mutationFn: ({ setId }) => workoutApi.skipSet(setId),
    onMutate: async ({ setId, workoutId }) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(workoutId) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(workoutId)
      );

      // Optimistically update the workout
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          status: 'in_progress', // Auto-start if pending
          started_at: previousWorkout.started_at ?? new Date().toISOString(),
          exercises: previousWorkout.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    actual_reps: null,
                    actual_weight: null,
                    status: 'skipped' as const,
                  }
                : set
            ),
          })),
        };
        queryClient.setQueryData(workoutKeys.detail(workoutId), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      // Save to localStorage - using 0 for reps/weight since it's skipped
      updateSet(workoutId, setId, {
        actual_reps: 0,
        actual_weight: 0,
        status: 'skipped',
      });

      return { previousWorkout };
    },
    onError: (_error, { workoutId }, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(
          workoutKeys.detail(workoutId),
          context.previousWorkout
        );
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, { workoutId }) => {
      void queryClient.invalidateQueries({
        queryKey: workoutKeys.detail(workoutId),
      });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for unlogging a set (reverting to pending)
 */
export function useUnlogSet(): UseMutationResult<
  WorkoutSet,
  ApiClientError,
  { setId: number; workoutId: number },
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();
  const { removeSet } = useWorkoutStorage();

  return useMutation({
    mutationFn: ({ setId }) => workoutApi.unlogSet(setId),
    onMutate: async ({ setId, workoutId }) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(workoutId) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(workoutId)
      );

      // Optimistically update the workout
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          exercises: previousWorkout.exercises.map((ex) => ({
            ...ex,
            sets: ex.sets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    actual_reps: null,
                    actual_weight: null,
                    status: 'pending' as const,
                  }
                : set
            ),
            completed_sets: ex.sets.filter(
              (s) => s.id !== setId && s.status === 'completed'
            ).length,
          })),
        };
        queryClient.setQueryData(workoutKeys.detail(workoutId), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      // Remove the set from localStorage
      removeSet(workoutId, setId);

      return { previousWorkout };
    },
    onError: (_error, { workoutId }, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(
          workoutKeys.detail(workoutId),
          context.previousWorkout
        );
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, { workoutId }) => {
      void queryClient.invalidateQueries({
        queryKey: workoutKeys.detail(workoutId),
      });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for adding a set to an exercise
 */
export function useAddSet(): UseMutationResult<
  ModifySetCountResult,
  ApiClientError,
  { workoutId: number; exerciseId: number },
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workoutId, exerciseId }) =>
      workoutApi.addSet(workoutId, exerciseId),
    onMutate: async ({ workoutId, exerciseId }) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(workoutId) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(workoutId)
      );

      // Optimistically update the workout by adding a new set
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          exercises: previousWorkout.exercises.map((ex) => {
            if (ex.exercise_id !== exerciseId) return ex;

            const lastSet = ex.sets[ex.sets.length - 1];
            if (!lastSet) return ex;

            const newSet = {
              id: -Date.now(), // Temporary negative ID
              workout_id: workoutId,
              exercise_id: exerciseId,
              set_number: lastSet.set_number + 1,
              target_reps: lastSet.target_reps,
              target_weight: lastSet.target_weight,
              actual_reps: null,
              actual_weight: null,
              status: 'pending' as const,
            };

            return {
              ...ex,
              sets: [...ex.sets, newSet],
              total_sets: ex.total_sets + 1,
            };
          }),
        };
        queryClient.setQueryData(workoutKeys.detail(workoutId), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      return { previousWorkout };
    },
    onError: (_error, { workoutId }, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(
          workoutKeys.detail(workoutId),
          context.previousWorkout
        );
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, { workoutId }) => {
      void queryClient.invalidateQueries({
        queryKey: workoutKeys.detail(workoutId),
      });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Hook for removing a set from an exercise
 */
export function useRemoveSet(): UseMutationResult<
  ModifySetCountResult,
  ApiClientError,
  { workoutId: number; exerciseId: number },
  { previousWorkout: WorkoutWithExercises | null | undefined }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workoutId, exerciseId }) =>
      workoutApi.removeSet(workoutId, exerciseId),
    onMutate: async ({ workoutId, exerciseId }) => {
      await queryClient.cancelQueries({ queryKey: workoutKeys.detail(workoutId) });
      await queryClient.cancelQueries({ queryKey: workoutKeys.today() });

      const previousWorkout = queryClient.getQueryData<WorkoutWithExercises>(
        workoutKeys.detail(workoutId)
      );

      // Optimistically update the workout by removing the last pending set
      if (previousWorkout) {
        const optimisticWorkout: WorkoutWithExercises = {
          ...previousWorkout,
          exercises: previousWorkout.exercises.map((ex) => {
            if (ex.exercise_id !== exerciseId) return ex;

            // Find and remove the last pending set
            const pendingSets = ex.sets.filter((s) => s.status === 'pending');
            if (pendingSets.length === 0) return ex;

            const lastPendingSet = pendingSets[pendingSets.length - 1];
            if (!lastPendingSet) return ex;

            return {
              ...ex,
              sets: ex.sets.filter((s) => s.id !== lastPendingSet.id),
              total_sets: ex.total_sets - 1,
            };
          }),
        };
        queryClient.setQueryData(workoutKeys.detail(workoutId), optimisticWorkout);
        queryClient.setQueryData(workoutKeys.today(), optimisticWorkout);
      }

      return { previousWorkout };
    },
    onError: (_error, { workoutId }, context) => {
      if (context?.previousWorkout) {
        queryClient.setQueryData(
          workoutKeys.detail(workoutId),
          context.previousWorkout
        );
        queryClient.setQueryData(workoutKeys.today(), context.previousWorkout);
      }
    },
    onSettled: (_data, _error, { workoutId }) => {
      void queryClient.invalidateQueries({
        queryKey: workoutKeys.detail(workoutId),
      });
      void queryClient.invalidateQueries({ queryKey: workoutKeys.today() });
    },
  });
}

/**
 * Combined hook for workout tracking functionality
 */
export function useWorkoutTracking(workoutId?: number): {
  workout: WorkoutWithExercises | null | undefined;
  isLoading: boolean;
  error: ApiClientError | null;
  startWorkout: () => void;
  completeWorkout: () => void;
  skipWorkout: () => void;
  logSet: (setId: number, data: LogWorkoutSetInput) => void;
  unlogSet: (setId: number) => void;
  isStarting: boolean;
  isCompleting: boolean;
  isSkippingWorkout: boolean;
  isLoggingSet: boolean;
  isUnloggingSet: boolean;
} {
  const todaysWorkoutQuery = useTodaysWorkout();
  const startMutation = useStartWorkout();
  const completeMutation = useCompleteWorkout();
  const skipWorkoutMutation = useSkipWorkout();
  const logSetMutation = useLogSet();
  const unlogSetMutation = useUnlogSet();

  // Use today's workout or specific workout if ID provided
  const effectiveWorkoutId = workoutId ?? todaysWorkoutQuery.data?.id;
  const workout = todaysWorkoutQuery.data;

  const startWorkout = useCallback(() => {
    if (effectiveWorkoutId !== undefined) {
      startMutation.mutate(effectiveWorkoutId);
    }
  }, [effectiveWorkoutId, startMutation]);

  const completeWorkout = useCallback(() => {
    if (effectiveWorkoutId !== undefined) {
      completeMutation.mutate(effectiveWorkoutId);
    }
  }, [effectiveWorkoutId, completeMutation]);

  const skipWorkout = useCallback(() => {
    if (effectiveWorkoutId !== undefined) {
      skipWorkoutMutation.mutate(effectiveWorkoutId);
    }
  }, [effectiveWorkoutId, skipWorkoutMutation]);

  const logSet = useCallback(
    (setId: number, data: LogWorkoutSetInput) => {
      if (effectiveWorkoutId !== undefined) {
        logSetMutation.mutate({ setId, data, workoutId: effectiveWorkoutId });
      }
    },
    [effectiveWorkoutId, logSetMutation]
  );

  const unlogSet = useCallback(
    (setId: number) => {
      if (effectiveWorkoutId !== undefined) {
        unlogSetMutation.mutate({ setId, workoutId: effectiveWorkoutId });
      }
    },
    [effectiveWorkoutId, unlogSetMutation]
  );

  return {
    workout,
    isLoading: todaysWorkoutQuery.isLoading,
    error: todaysWorkoutQuery.error,
    startWorkout,
    completeWorkout,
    skipWorkout,
    logSet,
    unlogSet,
    isStarting: startMutation.isPending,
    isCompleting: completeMutation.isPending,
    isSkippingWorkout: skipWorkoutMutation.isPending,
    isLoggingSet: logSetMutation.isPending,
    isUnloggingSet: unlogSetMutation.isPending,
  };
}
