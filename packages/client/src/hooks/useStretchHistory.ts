/**
 * Stretch History Hooks
 *
 * React Query hooks for fetching and saving stretch session history.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  StretchSessionRecord,
  CreateStretchSessionRequest,
  ApiResponse,
} from '@brad-os/shared';

const API_BASE = '/api/stretch-sessions';

/**
 * Fetch a stretch session by ID.
 */
async function fetchSessionById(id: string): Promise<StretchSessionRecord> {
  const response = await fetch(`${API_BASE}/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Stretch session not found');
    }
    throw new Error('Failed to fetch stretch session');
  }
  const result = (await response.json()) as ApiResponse<StretchSessionRecord>;
  return result.data;
}

/**
 * Fetch the most recent stretch session.
 */
async function fetchLatestSession(): Promise<StretchSessionRecord | null> {
  const response = await fetch(`${API_BASE}/latest`);
  if (!response.ok) {
    throw new Error('Failed to fetch latest stretch session');
  }
  const result = (await response.json()) as ApiResponse<StretchSessionRecord | null>;
  return result.data;
}

/**
 * Save a new stretch session to the server.
 */
async function saveSession(
  data: CreateStretchSessionRequest
): Promise<StretchSessionRecord> {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to save stretch session');
  }

  const result = (await response.json()) as ApiResponse<StretchSessionRecord>;
  return result.data;
}

/**
 * Hook to fetch a stretch session by ID.
 */
export function useStretchSession(
  id: string | undefined
): UseQueryResult<StretchSessionRecord, Error> {
  const isEnabled = id !== undefined && id.length > 0;
  return useQuery({
    queryKey: ['stretch-sessions', id],
    queryFn: () => fetchSessionById(id ?? ''),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch the latest stretch session.
 */
export function useLatestStretchSession(): UseQueryResult<
  StretchSessionRecord | null,
  Error
> {
  return useQuery({
    queryKey: ['stretch-sessions', 'latest'],
    queryFn: fetchLatestSession,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to save a stretch session.
 */
export function useSaveStretchSession(): UseMutationResult<
  StretchSessionRecord,
  Error,
  CreateStretchSessionRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSession,
    onSuccess: () => {
      // Invalidate the latest session query to refetch
      void queryClient.invalidateQueries({
        queryKey: ['stretch-sessions', 'latest'],
      });
    },
  });
}
