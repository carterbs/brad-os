import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { WeekCard } from '../WeekCard';
import type { WeekSummary } from '@brad-os/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

const mockWeek: WeekSummary = {
  week_number: 1,
  is_deload: false,
  workouts: [
    {
      id: 1,
      plan_day_id: 1,
      plan_day_name: 'Push Day',
      day_of_week: 1,
      week_number: 1,
      scheduled_date: '2024-01-01',
      status: 'pending',
      completed_at: null,
      exercise_count: 5,
      set_count: 15,
      completed_set_count: 0,
    },
    {
      id: 2,
      plan_day_id: 2,
      plan_day_name: 'Pull Day',
      day_of_week: 3,
      week_number: 1,
      scheduled_date: '2024-01-03',
      status: 'completed',
      completed_at: '2024-01-03T14:30:00.000Z',
      exercise_count: 5,
      set_count: 15,
      completed_set_count: 15,
    },
  ],
  total_workouts: 2,
  completed_workouts: 1,
  skipped_workouts: 0,
};

describe('WeekCard', () => {
  it('should render week number', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    expect(screen.getByText('Week 1')).toBeInTheDocument();
  });

  it('should render workout count', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    expect(screen.getByText('1/2 completed')).toBeInTheDocument();
  });

  it('should render workout items', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    expect(screen.getByText('Push Day')).toBeInTheDocument();
    expect(screen.getByText('Pull Day')).toBeInTheDocument();
  });

  it('should render set counts for workouts', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    expect(screen.getByText('0/15 sets')).toBeInTheDocument();
    expect(screen.getByText('15/15 sets')).toBeInTheDocument();
  });

  it('should render deload badge for deload week', () => {
    const deloadWeek: WeekSummary = {
      ...mockWeek,
      week_number: 7,
      is_deload: true,
    };

    renderWithTheme(<WeekCard week={deloadWeek} />);

    expect(screen.getByText('Deload')).toBeInTheDocument();
  });

  it('should render accent border when isCurrentWeek is true', () => {
    renderWithTheme(<WeekCard week={mockWeek} isCurrentWeek={true} />);

    const weekCard = screen.getByTestId('week-card-1');
    expect(weekCard).toHaveStyle({ borderLeft: '3px solid var(--accent-9)' });
  });

  it('should not render accent border when isCurrentWeek is false', () => {
    renderWithTheme(<WeekCard week={mockWeek} isCurrentWeek={false} />);

    const weekCard = screen.getByTestId('week-card-1');
    expect(weekCard).toHaveStyle({ borderLeft: '1px solid var(--gray-4)' });
  });

  it('should call onWorkoutClick when workout is clicked', () => {
    const onWorkoutClick = vi.fn();
    renderWithTheme(<WeekCard week={mockWeek} onWorkoutClick={onWorkoutClick} />);

    const workout = screen.getByTestId('workout-item-1');
    fireEvent.click(workout);

    expect(onWorkoutClick).toHaveBeenCalledWith(1);
  });

  it('should show no workouts message for empty week', () => {
    const emptyWeek: WeekSummary = {
      ...mockWeek,
      workouts: [],
      total_workouts: 0,
      completed_workouts: 0,
    };

    renderWithTheme(<WeekCard week={emptyWeek} />);

    expect(screen.getByText('No workouts this week')).toBeInTheDocument();
  });

  it('should display completion timestamp for completed workouts', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    // The completed workout should show "Completed" with the timestamp
    expect(screen.getByText(/Completed.*Jan/)).toBeInTheDocument();
  });

  it('should display scheduled date for non-completed workouts', () => {
    renderWithTheme(<WeekCard week={mockWeek} />);

    // The pending workout should show the scheduled date (format varies by timezone)
    // Just verify the element exists and contains date-like content
    const pushDayWorkout = screen.getByTestId('workout-item-1');
    expect(pushDayWorkout).toHaveTextContent(/\w+, \w+ \d+/); // e.g., "Sun, Dec 31" or "Mon, Jan 1"
  });

  it('should display correct status badges for workouts', () => {
    const workout0 = mockWeek.workouts[0];
    const workout1 = mockWeek.workouts[1];
    if (!workout0 || !workout1) {
      throw new Error('Test setup error: mockWeek workouts not defined');
    }
    const weekWithStatuses: WeekSummary = {
      ...mockWeek,
      workouts: [
        { ...workout0, status: 'pending' },
        { ...workout1, status: 'completed' },
        {
          id: 3,
          plan_day_id: 3,
          plan_day_name: 'Leg Day',
          day_of_week: 5,
          week_number: 1,
          scheduled_date: '2024-01-05',
          status: 'in_progress',
          completed_at: null,
          exercise_count: 4,
          set_count: 12,
          completed_set_count: 6,
        },
        {
          id: 4,
          plan_day_id: 4,
          plan_day_name: 'Rest Day',
          day_of_week: 6,
          week_number: 1,
          scheduled_date: '2024-01-06',
          status: 'skipped',
          completed_at: null,
          exercise_count: 0,
          set_count: 0,
          completed_set_count: 0,
        },
      ],
      total_workouts: 4,
    };

    renderWithTheme(<WeekCard week={weekWithStatuses} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });
});
