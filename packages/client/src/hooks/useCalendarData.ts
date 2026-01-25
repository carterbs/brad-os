import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CalendarDataResponse } from '@brad-os/shared';
import { calendarApi } from '../api/calendarApi';
import type { ApiClientError } from '../api/exerciseApi';

// ============ Query Keys ============

export const calendarKeys = {
  all: ['calendar'] as const,
  month: (year: number, month: number) =>
    [...calendarKeys.all, 'month', year, month] as const,
};

// ============ Query Hooks ============

/**
 * Fetch calendar data for a specific month
 * Uses a 5-minute stale time since calendar data doesn't change frequently
 *
 * @param year - The year (e.g., 2024)
 * @param month - The month (1-12)
 * @returns Query result with calendar data for the month
 */
export function useCalendarMonth(
  year: number,
  month: number
): UseQueryResult<CalendarDataResponse, ApiClientError> {
  return useQuery({
    queryKey: calendarKeys.month(year, month),
    queryFn: () => calendarApi.getMonthData(year, month),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
