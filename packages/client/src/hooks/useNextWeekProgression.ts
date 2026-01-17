import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { NextWeekResponse } from '@lifting/shared';
import { mesocycleApi } from '../api/mesocycleApi';
import type { ApiClientError } from '../api/exerciseApi';
import { mesocycleKeys } from './useMesocycles';

/**
 * Query key for next week progression
 */
export const nextWeekKeys = {
  all: ['next-week'] as const,
  detail: (mesocycleId: number) =>
    [...mesocycleKeys.detail(mesocycleId), 'next-week'] as const,
};

/**
 * Hook to fetch next week progression preview for a mesocycle.
 *
 * Returns the calculated targets for next week including:
 * - Target weights, reps, and sets for each exercise
 * - Whether each exercise will progress (based on completion status)
 * - Whether it's a deload week
 *
 * @param mesocycleId - The ID of the mesocycle
 * @returns React Query result with NextWeekResponse data
 */
export function useNextWeekProgression(
  mesocycleId: number | undefined
): UseQueryResult<NextWeekResponse, ApiClientError> {
  return useQuery({
    queryKey: mesocycleId !== undefined ? nextWeekKeys.detail(mesocycleId) : [],
    queryFn: async () => {
      if (mesocycleId === undefined) {
        throw new Error('Mesocycle ID is required');
      }
      return mesocycleApi.getNextWeekProgression(mesocycleId);
    },
    enabled: mesocycleId !== undefined && mesocycleId > 0,
    staleTime: 30000, // 30 seconds - refresh periodically as workout completion may change
  });
}
