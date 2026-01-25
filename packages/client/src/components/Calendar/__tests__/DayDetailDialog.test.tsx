import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { DayDetailDialog } from '../DayDetailDialog';
import type { CalendarDayData, CalendarActivity } from '@brad-os/shared';

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

const mockWorkoutActivity: CalendarActivity = {
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
};

const mockStretchActivity: CalendarActivity = {
  id: 'stretch-1',
  type: 'stretch',
  date: '2024-01-15',
  completedAt: '2024-01-15T11:00:00.000Z',
  summary: {
    totalDurationSeconds: 600,
    regionsCompleted: 4,
    regionsSkipped: 1,
  },
};

const mockDayData: CalendarDayData = {
  date: '2024-01-15',
  activities: [mockWorkoutActivity, mockStretchActivity],
  summary: {
    totalActivities: 2,
    completedActivities: 2,
    hasWorkout: true,
    hasStretch: true,
    hasMeditation: false,
  },
};

const mockEmptyDayData: CalendarDayData = {
  date: '2024-01-16',
  activities: [],
  summary: {
    totalActivities: 0,
    completedActivities: 0,
    hasWorkout: false,
    hasStretch: false,
    hasMeditation: false,
  },
};

describe('DayDetailDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnActivityClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when closed', () => {
    it('should not render dialog content when open is false', () => {
      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={false}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('when open', () => {
    it('should render dialog with formatted date as title', () => {
      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // January 15, 2024 in a readable format - check the heading specifically
      expect(screen.getByRole('heading', { name: /January 15, 2024/i })).toBeInTheDocument();
    });

    it('should render all activities for the day', () => {
      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.getByText('Workout')).toBeInTheDocument();
      expect(screen.getByText('Stretch')).toBeInTheDocument();
    });

    it('should render close button', () => {
      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('should call onActivityClick when an activity is clicked', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <DayDetailDialog
          day={mockDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      const workoutItem = screen.getByTestId('activity-item-workout-1');
      await user.click(workoutItem);

      expect(mockOnActivityClick).toHaveBeenCalledTimes(1);
      expect(mockOnActivityClick).toHaveBeenCalledWith(mockWorkoutActivity);
    });
  });

  describe('when day has no activities', () => {
    it('should show no activities message', () => {
      renderWithTheme(
        <DayDetailDialog
          day={mockEmptyDayData}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.getByText(/no activities/i)).toBeInTheDocument();
    });
  });

  describe('when day is null', () => {
    it('should not render dialog content', () => {
      renderWithTheme(
        <DayDetailDialog
          day={null}
          open={true}
          onClose={mockOnClose}
          onActivityClick={mockOnActivityClick}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
