import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { Exercise, ExerciseHistory, CreateExerciseDTO, UpdateExerciseDTO } from '@brad-os/shared';
import { exerciseApi, type ApiClientError } from '../api/exerciseApi';

export const exerciseKeys = {
  all: ['exercises'] as const,
  lists: () => [...exerciseKeys.all, 'list'] as const,
  list: () => [...exerciseKeys.lists()] as const,
  details: () => [...exerciseKeys.all, 'detail'] as const,
  detail: (id: number) => [...exerciseKeys.details(), id] as const,
  history: (id: number) => [...exerciseKeys.detail(id), 'history'] as const,
};

export function useExercises(): UseQueryResult<Exercise[], ApiClientError> {
  return useQuery({
    queryKey: exerciseKeys.list(),
    queryFn: exerciseApi.getExercises,
  });
}

export function useExercise(id: number): UseQueryResult<Exercise, ApiClientError> {
  return useQuery({
    queryKey: exerciseKeys.detail(id),
    queryFn: () => exerciseApi.getExercise(id),
    enabled: id > 0,
  });
}

export function useExerciseHistory(id: number): UseQueryResult<ExerciseHistory, ApiClientError> {
  return useQuery({
    queryKey: exerciseKeys.history(id),
    queryFn: () => exerciseApi.getExerciseHistory(id),
    enabled: id > 0,
  });
}

export function useCreateExercise(): UseMutationResult<
  Exercise,
  ApiClientError,
  CreateExerciseDTO,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: exerciseApi.createExercise,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
    },
  });
}

export function useUpdateExercise(): UseMutationResult<
  Exercise,
  ApiClientError,
  { id: number; data: UpdateExerciseDTO },
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => exerciseApi.updateExercise(id, data),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
      queryClient.setQueryData(exerciseKeys.detail(data.id), data);
    },
  });
}

export function useDeleteExercise(): UseMutationResult<
  void,
  ApiClientError,
  number,
  unknown
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: exerciseApi.deleteExercise,
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.lists() });
      queryClient.removeQueries({ queryKey: exerciseKeys.detail(id) });
    },
  });
}
