import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { MonthCalendar } from '../MonthCalendar';
import type { CalendarDayData } from '@brad-os/shared';

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

const mockActivities: CalendarDayData[] = [
  {
    date: '2024-01-15',
    activities: [
      {
        id: 'workout-1',
        type: 'workout',
        date: '2024-01-15',
        completedAt: '2024-01-15T10:30:00.000Z',
        summary: {
          dayName: 'Push Day',
          exerciseCount: 5,
          setsCompleted: 15,
          totalSets: 15,
          weekNumber: 3,
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
  {
    date: '2024-01-16',
    activities: [
      {
        id: 'stretch-1',
        type: 'stretch',
        date: '2024-01-16',
        completedAt: '2024-01-16T11:00:00.000Z',
        summary: {
          totalDurationSeconds: 600,
          regionsCompleted: 4,
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
  {
    date: '2024-01-20',
    activities: [
      {
        id: 'workout-2',
        type: 'workout',
        date: '2024-01-20',
        completedAt: '2024-01-20T10:00:00.000Z',
        summary: {
          dayName: 'Pull Day',
          exerciseCount: 4,
          setsCompleted: 12,
          totalSets: 12,
          weekNumber: 3,
          isDeload: false,
        },
      },
      {
        id: 'stretch-2',
        type: 'stretch',
        date: '2024-01-20',
        completedAt: '2024-01-20T11:00:00.000Z',
        summary: {
          totalDurationSeconds: 300,
          regionsCompleted: 3,
          regionsSkipped: 0,
        },
      },
    ],
    summary: {
      totalActivities: 2,
      completedActivities: 2,
      hasWorkout: true,
      hasStretch: true,
      hasMeditation: false,
    },
  },
];

describe('MonthCalendar', () => {
  const mockOnDayClick = vi.fn();
  const mockOnMonthChange = vi.fn();
  const currentDate = new Date('2024-01-15');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the calendar component', () => {
    renderWithTheme(
      <MonthCalendar
        activities={mockActivities}
        currentDate={currentDate}
        onDayClick={mockOnDayClick}
        onMonthChange={mockOnMonthChange}
      />
    );

    expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
  });

  it('should display the current month', () => {
    renderWithTheme(
      <MonthCalendar
        activities={mockActivities}
        currentDate={currentDate}
        onDayClick={mockOnDayClick}
        onMonthChange={mockOnMonthChange}
      />
    );

    expect(screen.getByText(/January 2024/i)).toBeInTheDocument();
  });

  describe('activity dots', () => {
    it('should render indigo dot for days with workouts', () => {
      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Day 15 has a workout
      const dot = screen.getByTestId('workout-dot-2024-01-15');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveStyle({ backgroundColor: '#6366f1' });
    });

    it('should render teal dot for days with stretches', () => {
      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Day 16 has a stretch
      const dot = screen.getByTestId('stretch-dot-2024-01-16');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveStyle({ backgroundColor: '#14b8a6' });
    });

    it('should render multiple dots for days with multiple activity types', () => {
      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Day 20 has both workout and stretch
      expect(screen.getByTestId('workout-dot-2024-01-20')).toBeInTheDocument();
      expect(screen.getByTestId('stretch-dot-2024-01-20')).toBeInTheDocument();
    });

    it('should not render dots for days without activities', () => {
      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Day 17 has no activities
      expect(screen.queryByTestId('workout-dot-2024-01-17')).not.toBeInTheDocument();
      expect(screen.queryByTestId('stretch-dot-2024-01-17')).not.toBeInTheDocument();
    });
  });

  describe('day click handling', () => {
    it('should call onDayClick when a day is clicked', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Click on a day tile (the 15th)
      const dayTile = screen.getByText('15');
      await user.click(dayTile);

      expect(mockOnDayClick).toHaveBeenCalledTimes(1);
      expect(mockOnDayClick).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should pass correct date when day is clicked', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      const dayTile = screen.getByText('20');
      await user.click(dayTile);

      const calls = mockOnDayClick.mock.calls as Array<[Date]>;
      const firstCall = calls[0];
      if (!firstCall) throw new Error('Expected onDayClick to be called');
      const calledDate = firstCall[0];
      expect(calledDate.getDate()).toBe(20);
      expect(calledDate.getMonth()).toBe(0); // January
      expect(calledDate.getFullYear()).toBe(2024);
    });
  });

  describe('month navigation', () => {
    it('should call onMonthChange when navigating to next month', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Find and click the next month button
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
    });

    it('should call onMonthChange when navigating to previous month', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <MonthCalendar
          activities={mockActivities}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      // Find and click the previous month button
      const prevButton = screen.getByRole('button', { name: /prev/i });
      await user.click(prevButton);

      expect(mockOnMonthChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty activities', () => {
    it('should render calendar without dots when no activities', () => {
      renderWithTheme(
        <MonthCalendar
          activities={[]}
          currentDate={currentDate}
          onDayClick={mockOnDayClick}
          onMonthChange={mockOnMonthChange}
        />
      );

      expect(screen.getByTestId('month-calendar')).toBeInTheDocument();
      expect(screen.queryByTestId(/workout-dot/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(/stretch-dot/)).not.toBeInTheDocument();
    });
  });
});
