import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { ActivityItem } from '../ActivityItem';
import type { CalendarActivity } from '@brad-os/shared';

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

const mockMeditationActivity: CalendarActivity = {
  id: 'meditation-1',
  type: 'meditation',
  date: '2024-01-15',
  completedAt: '2024-01-15T12:00:00.000Z',
  summary: {
    durationSeconds: 300,
    meditationType: 'guided',
  },
};

describe('ActivityItem', () => {
  describe('rendering workout activities', () => {
    it('should render workout badge', () => {
      renderWithTheme(
        <ActivityItem activity={mockWorkoutActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText('Workout')).toBeInTheDocument();
    });

    it('should render workout day name', () => {
      renderWithTheme(
        <ActivityItem activity={mockWorkoutActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText(/Push Day/i)).toBeInTheDocument();
    });

    it('should render exercise count summary', () => {
      renderWithTheme(
        <ActivityItem activity={mockWorkoutActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText(/5 exercises/i)).toBeInTheDocument();
    });

    it('should have indigo background for workout type', () => {
      renderWithTheme(
        <ActivityItem activity={mockWorkoutActivity} onClick={vi.fn()} />
      );

      const item = screen.getByTestId('activity-item-workout-1');
      expect(item).toHaveStyle({ backgroundColor: 'rgba(99, 102, 241, 0.15)' });
    });
  });

  describe('rendering stretch activities', () => {
    it('should render stretch badge', () => {
      renderWithTheme(
        <ActivityItem activity={mockStretchActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText('Stretch')).toBeInTheDocument();
    });

    it('should render regions summary', () => {
      renderWithTheme(
        <ActivityItem activity={mockStretchActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText(/4 regions/i)).toBeInTheDocument();
    });

    it('should have teal background for stretch type', () => {
      renderWithTheme(
        <ActivityItem activity={mockStretchActivity} onClick={vi.fn()} />
      );

      const item = screen.getByTestId('activity-item-stretch-1');
      expect(item).toHaveStyle({ backgroundColor: 'rgba(20, 184, 166, 0.15)' });
    });
  });

  describe('rendering meditation activities', () => {
    it('should render meditation badge', () => {
      renderWithTheme(
        <ActivityItem activity={mockMeditationActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText('Meditation')).toBeInTheDocument();
    });

    it('should render duration summary', () => {
      renderWithTheme(
        <ActivityItem activity={mockMeditationActivity} onClick={vi.fn()} />
      );

      expect(screen.getByText(/5 min/i)).toBeInTheDocument();
    });

    it('should have purple background for meditation type', () => {
      renderWithTheme(
        <ActivityItem activity={mockMeditationActivity} onClick={vi.fn()} />
      );

      const item = screen.getByTestId('activity-item-meditation-1');
      expect(item).toHaveStyle({ backgroundColor: 'rgba(168, 85, 247, 0.15)' });
    });
  });

  describe('click handling', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      renderWithTheme(
        <ActivityItem activity={mockWorkoutActivity} onClick={handleClick} />
      );

      const item = screen.getByTestId('activity-item-workout-1');
      await user.click(item);

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(mockWorkoutActivity);
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      renderWithTheme(
        <ActivityItem activity={mockStretchActivity} onClick={handleClick} />
      );

      const item = screen.getByTestId('activity-item-stretch-1');
      item.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
