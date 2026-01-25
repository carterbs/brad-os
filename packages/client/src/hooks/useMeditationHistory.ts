/**
 * Meditation History Hooks
 *
 * React Query hooks for fetching and saving meditation session history.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  MeditationSessionRecord,
  CreateMeditationSessionRequest,
  ApiResponse,
} from '@brad-os/shared';

const API_BASE = '/api/meditation-sessions';

const QUERY_KEYS = {
  meditationSessions: ['meditation-sessions'] as const,
  latestMeditationSession: ['meditation-sessions', 'latest'] as const,
  meditationStats: ['meditation-sessions', 'stats'] as const,
};

/**
 * Fetch the most recent meditation session.
 */
async function fetchLatestSession(): Promise<MeditationSessionRecord | null> {
  const response = await fetch(`${API_BASE}/latest`);
  if (!response.ok) {
    throw new Error('Failed to fetch latest meditation session');
  }
  const result = (await response.json()) as ApiResponse<MeditationSessionRecord | null>;
  return result.data;
}

/**
 * Fetch meditation session stats.
 */
async function fetchMeditationStats(): Promise<{ totalSessions: number; totalMinutes: number }> {
  const response = await fetch(`${API_BASE}/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch meditation stats');
  }
  const result = (await response.json()) as ApiResponse<{ totalSessions: number; totalMinutes: number }>;
  return result.data;
}

/**
 * Save a new meditation session to the server.
 */
async function saveSession(
  data: CreateMeditationSessionRequest
): Promise<MeditationSessionRecord> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to save meditation session');
  }

  const result = (await response.json()) as ApiResponse<MeditationSessionRecord>;
  return result.data;
}

/**
 * Hook to fetch the latest meditation session.
 */
export function useLatestMeditationSession(): UseQueryResult<
  MeditationSessionRecord | null,
  Error
> {
  return useQuery({
    queryKey: QUERY_KEYS.latestMeditationSession,
    queryFn: fetchLatestSession,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch meditation session stats.
 */
export function useMeditationStats(): UseQueryResult<
  { totalSessions: number; totalMinutes: number },
  Error
> {
  return useQuery({
    queryKey: QUERY_KEYS.meditationStats,
    queryFn: fetchMeditationStats,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to save a meditation session.
 */
export function useSaveMeditationSession(): UseMutationResult<
  MeditationSessionRecord,
  Error,
  CreateMeditationSessionRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSession,
    onSuccess: () => {
      // Invalidate all meditation session queries to refetch
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.meditationSessions,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.latestMeditationSession,
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.meditationStats,
      });
    },
  });
}
