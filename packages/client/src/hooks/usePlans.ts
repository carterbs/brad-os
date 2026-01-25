import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
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
} from '@brad-os/shared';
import { planApi, planDayApi, planDayExerciseApi } from '../api/planApi';
import type { ApiClientError } from '../api/exerciseApi';

// ============ Query Keys ============

export const planKeys = {
  all: ['plans'] as const,
  lists: () => [...planKeys.all, 'list'] as const,
  list: () => [...planKeys.lists()] as const,
  details: () => [...planKeys.all, 'detail'] as const,
  detail: (id: number) => [...planKeys.details(), id] as const,
  days: (planId: number) => [...planKeys.detail(planId), 'days'] as const,
  dayExercises: (planId: number, dayId: number) =>
    [...planKeys.days(planId), dayId, 'exercises'] as const,
};

// ============ Plan Hooks ============

export function usePlans(): UseQueryResult<Plan[], ApiClientError> {
  return useQuery({
    queryKey: planKeys.list(),
    queryFn: planApi.getPlans,
  });
}

export function usePlan(id: number): UseQueryResult<Plan, ApiClientError> {
  return useQuery({
    queryKey: planKeys.detail(id),
    queryFn: () => planApi.getPlan(id),
    enabled: id > 0,
  });
}

export function useCreatePlan(): UseMutationResult<
  Plan,
  ApiClientError,
  CreatePlanDTO,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: planApi.createPlan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.lists() });
    },
  });
}

export function useUpdatePlan(): UseMutationResult<
  Plan,
  ApiClientError,
  { id: number; data: UpdatePlanDTO },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => planApi.updatePlan(id, data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.lists() });
      queryClient.setQueryData(planKeys.detail(data.id), data);
    },
  });
}

export function useDeletePlan(): UseMutationResult<
  void,
  ApiClientError,
  number,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: planApi.deletePlan,
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.lists() });
      queryClient.removeQueries({ queryKey: planKeys.detail(id) });
    },
  });
}

// ============ Plan Day Hooks ============

export function usePlanDays(
  planId: number
): UseQueryResult<PlanDay[], ApiClientError> {
  return useQuery({
    queryKey: planKeys.days(planId),
    queryFn: () => planDayApi.getPlanDays(planId),
    enabled: planId > 0,
  });
}

export function useCreatePlanDay(): UseMutationResult<
  PlanDay,
  ApiClientError,
  { planId: number; data: Omit<CreatePlanDayDTO, 'plan_id'> },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, data }) => planDayApi.createPlanDay(planId, data),
    onSuccess: (_, { planId }) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.days(planId) });
    },
  });
}

export function useUpdatePlanDay(): UseMutationResult<
  PlanDay,
  ApiClientError,
  { planId: number; dayId: number; data: UpdatePlanDayDTO },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, dayId, data }) =>
      planDayApi.updatePlanDay(planId, dayId, data),
    onSuccess: (_, { planId }) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.days(planId) });
    },
  });
}

export function useDeletePlanDay(): UseMutationResult<
  void,
  ApiClientError,
  { planId: number; dayId: number },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, dayId }) => planDayApi.deletePlanDay(planId, dayId),
    onSuccess: (_, { planId }) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.days(planId) });
    },
  });
}

// ============ Plan Day Exercise Hooks ============

export function usePlanDayExercises(
  planId: number,
  dayId: number
): UseQueryResult<PlanDayExercise[], ApiClientError> {
  return useQuery({
    queryKey: planKeys.dayExercises(planId, dayId),
    queryFn: () => planDayExerciseApi.getPlanDayExercises(planId, dayId),
    enabled: planId > 0 && dayId > 0,
  });
}

export function useCreatePlanDayExercise(): UseMutationResult<
  PlanDayExercise,
  ApiClientError,
  {
    planId: number;
    dayId: number;
    data: Omit<CreatePlanDayExerciseDTO, 'plan_day_id'>;
  },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, dayId, data }) =>
      planDayExerciseApi.createPlanDayExercise(planId, dayId, data),
    onSuccess: (_, { planId, dayId }) => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.dayExercises(planId, dayId),
      });
    },
  });
}

export function useUpdatePlanDayExercise(): UseMutationResult<
  PlanDayExercise,
  ApiClientError,
  {
    planId: number;
    dayId: number;
    exerciseId: number;
    data: UpdatePlanDayExerciseDTO;
  },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, dayId, exerciseId, data }) =>
      planDayExerciseApi.updatePlanDayExercise(planId, dayId, exerciseId, data),
    onSuccess: (_, { planId, dayId }) => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.dayExercises(planId, dayId),
      });
    },
  });
}

export function useDeletePlanDayExercise(): UseMutationResult<
  void,
  ApiClientError,
  { planId: number; dayId: number; exerciseId: number },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, dayId, exerciseId }) =>
      planDayExerciseApi.deletePlanDayExercise(planId, dayId, exerciseId),
    onSuccess: (_, { planId, dayId }) => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.dayExercises(planId, dayId),
      });
    },
  });
}

/**
 * Fetch exercises for all days of a plan in parallel.
 * Returns a map of dayId -> exercises array.
 */
export function useAllPlanDayExercises(
  planId: number,
  days: PlanDay[]
): {
  data: Map<number, PlanDayExercise[]> | undefined;
  isLoading: boolean;
} {
  const queries = useQueries({
    queries: days.map((day) => ({
      queryKey: planKeys.dayExercises(planId, day.id),
      queryFn: (): Promise<PlanDayExercise[]> =>
        planDayExerciseApi.getPlanDayExercises(planId, day.id),
      enabled: planId > 0 && day.id > 0,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const allLoaded = queries.every((q) => q.isSuccess);

  if (!allLoaded || days.length === 0) {
    return { data: undefined, isLoading };
  }

  const exerciseMap = new Map<number, PlanDayExercise[]>();
  days.forEach((day, index) => {
    const query = queries[index];
    if (query?.data) {
      exerciseMap.set(day.id, query.data);
    }
  });

  return { data: exerciseMap, isLoading };
}
