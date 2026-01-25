import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  Mesocycle,
  MesocycleWithDetails,
  CreateMesocycleRequest,
} from '@brad-os/shared';
import { mesocycleApi } from '../api/mesocycleApi';
import type { ApiClientError } from '../api/exerciseApi';

// ============ Query Keys ============

export const mesocycleKeys = {
  all: ['mesocycles'] as const,
  lists: () => [...mesocycleKeys.all, 'list'] as const,
  list: () => [...mesocycleKeys.lists()] as const,
  active: () => [...mesocycleKeys.all, 'active'] as const,
  details: () => [...mesocycleKeys.all, 'detail'] as const,
  detail: (id: number) => [...mesocycleKeys.details(), id] as const,
};

// ============ Query Hooks ============

/**
 * Get all mesocycles
 */
export function useMesocycles(): UseQueryResult<Mesocycle[], ApiClientError> {
  return useQuery({
    queryKey: mesocycleKeys.list(),
    queryFn: mesocycleApi.getMesocycles,
  });
}

/**
 * Get the active mesocycle with full details
 */
export function useActiveMesocycle(): UseQueryResult<
  MesocycleWithDetails | null,
  ApiClientError
> {
  return useQuery({
    queryKey: mesocycleKeys.active(),
    queryFn: mesocycleApi.getActiveMesocycle,
  });
}

/**
 * Get a specific mesocycle by ID with full details
 */
export function useMesocycle(
  id: number
): UseQueryResult<MesocycleWithDetails, ApiClientError> {
  return useQuery({
    queryKey: mesocycleKeys.detail(id),
    queryFn: () => mesocycleApi.getMesocycle(id),
    enabled: id > 0,
  });
}

// ============ Mutation Hooks ============

/**
 * Create a new mesocycle from a plan
 */
export function useCreateMesocycle(): UseMutationResult<
  Mesocycle,
  ApiClientError,
  CreateMesocycleRequest,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mesocycleApi.createMesocycle,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.active() });
    },
  });
}

/**
 * Mark a mesocycle as completed
 */
export function useCompleteMesocycle(): UseMutationResult<
  Mesocycle,
  ApiClientError,
  number,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mesocycleApi.completeMesocycle,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.active() });
      queryClient.setQueryData(mesocycleKeys.detail(data.id), (old: MesocycleWithDetails | undefined) => {
        if (!old) return old;
        return { ...old, status: data.status };
      });
    },
  });
}

/**
 * Cancel a mesocycle
 */
export function useCancelMesocycle(): UseMutationResult<
  Mesocycle,
  ApiClientError,
  number,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mesocycleApi.cancelMesocycle,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: mesocycleKeys.active() });
      queryClient.setQueryData(mesocycleKeys.detail(data.id), (old: MesocycleWithDetails | undefined) => {
        if (!old) return old;
        return { ...old, status: data.status };
      });
    },
  });
}
