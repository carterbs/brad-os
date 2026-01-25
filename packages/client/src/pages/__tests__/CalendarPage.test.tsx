import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { CalendarDataResponse, CalendarDayData, ApiResponse } from '@brad-os/shared';
import { CalendarPage } from '../CalendarPage';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: (): typeof mockNavigate => mockNavigate,
  };
});

/**
 * Generate mock calendar data for a given year/month with activities on day 15 and 20
 */
function createMockCalendarResponse(year: number, month: number): CalendarDataResponse {
  const monthStr = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();

  const day15Key = `${year}-${monthStr}-15`;
  const day20Key = `${year}-${monthStr}-20`;

  const days: Record<string, CalendarDayData> = {};

  // Only add activities if day 15 and 20 exist in this month
  if (15 <= lastDay) {
    days[day15Key] = {
      date: day15Key,
      activities: [
        {
          id: 'workout-42',
          type: 'workout',
          date: day15Key,
          completedAt: `${day15Key}T10:30:00Z`,
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
    };
  }

  if (20 <= lastDay) {
    days[day20Key] = {
      date: day20Key,
      activities: [
        {
          id: 'stretch-5',
          type: 'stretch',
          date: day20Key,
          completedAt: `${day20Key}T08:00:00Z`,
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
    };
  }

  return {
    startDate: `${year}-${monthStr}-01`,
    endDate: `${year}-${monthStr}-${lastDay}`,
    days,
  };
}

const handlers = [
  http.get('/api/calendar/:year/:month', ({ params }) => {
    const year = Number(params['year']);
    const month = Number(params['month']);

    const response: ApiResponse<CalendarDataResponse> = {
      success: true,
      data: createMockCalendarResponse(year, month),
    };
    return HttpResponse.json(response);
  }),
];

const server = setupServer(...handlers);

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
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/calendar']}>
        <Theme>{children}</Theme>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { wrapper, queryClient };
};

// Helper to get current year/month for dynamic assertions
function getCurrentYearMonth(): { year: number; month: number; monthStr: string; monthName: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  return { year, month, monthStr: String(month).padStart(2, '0'), monthName };
}

// Helper to format a date for button name matching (e.g., "January 15, 2026")
function formatDayButtonName(day: number): string {
  const { year, monthName } = getCurrentYearMonth();
  return `${monthName} ${day}, ${year}`;
}

describe('CalendarPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('should show loading state initially', () => {
    // Override handler to never respond
    server.use(
      http.get('/api/calendar/:year/:month', () => {
        return new Promise(() => {}); // Never resolves
      })
    );

    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    expect(screen.getByText('Loading calendar...')).toBeInTheDocument();
  });

  it('should render calendar when data loads', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Should show the heading
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
  });

  it('should show error state when fetch fails', async () => {
    server.use(
      http.get('/api/calendar/:year/:month', () => {
        return HttpResponse.json(
          { success: false, error: { code: 'SERVER_ERROR', message: 'Network error' } },
          { status: 500 }
        );
      })
    );

    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for error to appear
    const errorMessage = await screen.findByText(/Error loading calendar/);
    expect(errorMessage).toBeInTheDocument();
  });

  it('should show workout indicator dot for days with workouts', async () => {
    const { year, monthStr } = getCurrentYearMonth();
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Should show a workout dot for day 15 of current month
    const expectedTestId = `workout-dot-${year}-${monthStr}-15`;
    expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
  });

  it('should show stretch indicator dot for days with stretches', async () => {
    const { year, monthStr } = getCurrentYearMonth();
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Should show a stretch dot for day 20 of current month
    const expectedTestId = `stretch-dot-${year}-${monthStr}-20`;
    expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
  });

  it('should open dialog when clicking a day with activities', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Find and click day 15 (has workout)
    // react-calendar renders buttons with full date name like "January 15, 2026"
    const day15Name = formatDayButtonName(15);
    const day15Button = screen.getByRole('button', { name: day15Name });
    fireEvent.click(day15Button);

    // Dialog should open with the day's activities
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Should show the workout activity in the dialog (format: "Push Day - 5 exercises")
    expect(screen.getByText(/Push Day - 5 exercises/)).toBeInTheDocument();
  });

  it('should navigate to workout page when clicking a workout activity', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Click day 15 to open dialog
    const day15Name = formatDayButtonName(15);
    const day15Button = screen.getByRole('button', { name: day15Name });
    fireEvent.click(day15Button);

    // Wait for dialog to open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Find and click the workout activity item (format: "Push Day - 5 exercises")
    const workoutItem = screen.getByText(/Push Day - 5 exercises/);
    fireEvent.click(workoutItem);

    // Should navigate to the workout detail page
    expect(mockNavigate).toHaveBeenCalledWith('/workouts/42');
  });

  it('should close dialog when clicking stretch activity (no detail page)', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Click day 20 to open dialog (stretch day)
    const day20Name = formatDayButtonName(20);
    const day20Button = screen.getByRole('button', { name: day20Name });
    fireEvent.click(day20Button);

    // Wait for dialog to open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click anywhere on the stretch activity
    const stretchActivity = screen.getByText(/15 min/);
    fireEvent.click(stretchActivity);

    // Dialog should close (stretch has no detail page)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Should NOT navigate anywhere
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should open dialog for empty days', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for the calendar to render
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    // Click a day with no activities (10th - not in mock data)
    const day10Name = formatDayButtonName(10);
    const day10Button = screen.getByRole('button', { name: day10Name });
    fireEvent.click(day10Button);

    // Dialog should open
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Should show "No activities" message
    expect(screen.getByText(/No activities on this day/)).toBeInTheDocument();
  });

  it('should display page heading', async () => {
    const { wrapper } = createWrapper();
    render(<CalendarPage />, { wrapper });

    // Wait for query to complete before checking heading
    await waitFor(() => {
      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
    });

    const heading = screen.getByRole('heading', { name: 'Calendar' });
    expect(heading).toBeInTheDocument();
  });
});
