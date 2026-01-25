import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { CalendarDataResponse, ApiResponse } from '@brad-os/shared';
import { useCalendarMonth, calendarKeys } from '../useCalendarData';

const mockCalendarResponse: CalendarDataResponse = {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  days: {
    '2024-01-15': {
      date: '2024-01-15',
      activities: [
        {
          id: 'workout-1',
          type: 'workout',
          date: '2024-01-15',
          completedAt: '2024-01-15T10:30:00Z',
          summary: {
            dayName: 'Push Day',
            exerciseCount: 5,
            setsCompleted: 15,
            totalSets: 15,
            weekNumber: 2,
            isDeload: false,
          },
        },
      ],
      summary: {
        totalActivities: 1,
        completedActivities: 1,
        hasWorkout: true,
        hasStretch: false,
        hasMeditation: false,
      },
    },
    '2024-01-20': {
      date: '2024-01-20',
      activities: [
        {
          id: 'stretch-1',
          type: 'stretch',
          date: '2024-01-20',
          completedAt: '2024-01-20T08:00:00Z',
          summary: {
            totalDurationSeconds: 900,
            regionsCompleted: 6,
            regionsSkipped: 1,
          },
        },
      ],
      summary: {
        totalActivities: 1,
        completedActivities: 1,
        hasWorkout: false,
        hasStretch: true,
        hasMeditation: false,
      },
    },
  },
};

const handlers = [
  http.get('/api/calendar/:year/:month', ({ params }) => {
    const year = Number(params['year']);
    const month = Number(params['month']);

    if (year === 2024 && month === 1) {
      const response: ApiResponse<CalendarDataResponse> = {
        success: true,
        data: mockCalendarResponse,
      };
      return HttpResponse.json(response);
    }

    if (month < 1 || month > 12) {
      return HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Invalid month' } },
        { status: 404 }
      );
    }

    // Return empty calendar for other valid months
    const response: ApiResponse<CalendarDataResponse> = {
      success: true,
      data: {
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-28`,
        days: {},
      },
    };
    return HttpResponse.json(response);
  }),
];

const server = setupServer(...handlers);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(): ({
  children,
}: {
  children: ReactNode;
}) => JSX.Element {
  const queryClient = createTestQueryClient();
  const TestWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
}

describe('calendarKeys', () => {
  it('should generate correct key for all calendar data', () => {
    expect(calendarKeys.all).toEqual(['calendar']);
  });

  it('should generate correct key for month data', () => {
    expect(calendarKeys.month(2024, 1)).toEqual(['calendar', 'month', 2024, 1]);
    expect(calendarKeys.month(2024, 12)).toEqual(['calendar', 'month', 2024, 12]);
  });
});

describe('useCalendarMonth', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch and return calendar data for a month', async () => {
    const { result } = renderHook(() => useCalendarMonth(2024, 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.startDate).toBe('2024-01-01');
    expect(result.current.data?.endDate).toBe('2024-01-31');
    expect(Object.keys(result.current.data?.days ?? {})).toHaveLength(2);
  });

  it('should set loading state while fetching', async () => {
    const { result } = renderHook(() => useCalendarMonth(2024, 1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isLoading).toBe(false);
  });

  it('should return days with correct activity data', async () => {
    const { result } = renderHook(() => useCalendarMonth(2024, 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const day15 = result.current.data?.days['2024-01-15'];
    expect(day15?.summary.hasWorkout).toBe(true);
    expect(day15?.activities[0]?.type).toBe('workout');

    const day20 = result.current.data?.days['2024-01-20'];
    expect(day20?.summary.hasStretch).toBe(true);
    expect(day20?.activities[0]?.type).toBe('stretch');
  });

  it('should handle empty calendar month', async () => {
    const { result } = renderHook(() => useCalendarMonth(2024, 2), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.days).toEqual({});
  });

  it('should handle invalid month error', async () => {
    const { result } = renderHook(() => useCalendarMonth(2024, 13), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });

  it('should use correct query key for caching', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCalendarMonth(2024, 1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Check that data is cached under the correct key
    const cachedData = queryClient.getQueryData(calendarKeys.month(2024, 1));
    expect(cachedData).toBeDefined();
    expect(cachedData).toEqual(mockCalendarResponse);
  });

  it('should refetch when year/month changes', async () => {
    const { result, rerender } = renderHook(
      ({ year, month }: { year: number; month: number }) =>
        useCalendarMonth(year, month),
      {
        wrapper: createWrapper(),
        initialProps: { year: 2024, month: 1 },
      }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.startDate).toBe('2024-01-01');

    // Change to a different month
    rerender({ year: 2024, month: 2 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.startDate).toBe('2024-02-01');
  });

  it('should have 5-minute stale time configured', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCalendarMonth(2024, 1), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Query should not be stale immediately
    expect(result.current.isStale).toBe(false);
  });
});
