import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { WorkoutView } from '../WorkoutView';
import type { WorkoutWithExercises } from '../../../api/workoutApi';

// Mock the audio module
vi.mock('../../../utils/audio', () => ({
  playRestCompleteBeep: vi.fn(),
}));

const createMockWorkout = (
  status: 'pending' | 'in_progress' | 'completed' | 'skipped'
): WorkoutWithExercises => ({
  id: 1,
  mesocycle_id: 1,
  plan_day_id: 1,
  week_number: 1,
  scheduled_date: '2024-01-15',
  status,
  started_at: status === 'pending' ? null : '2024-01-15T10:00:00Z',
  completed_at: status === 'completed' ? '2024-01-15T11:00:00Z' : null,
  plan_day_name: 'Push Day',
  exercises: [
    {
      exercise_id: 1,
      exercise_name: 'Bench Press',
      sets: [
        {
          id: 1,
          workout_id: 1,
          exercise_id: 1,
          set_number: 1,
          target_reps: 10,
          target_weight: 135,
          actual_reps: null,
          actual_weight: null,
          status: 'pending',
        },
        {
          id: 2,
          workout_id: 1,
          exercise_id: 1,
          set_number: 2,
          target_reps: 10,
          target_weight: 135,
          actual_reps: null,
          actual_weight: null,
          status: 'pending',
        },
      ],
      total_sets: 2,
      completed_sets: 0,
      rest_seconds: 90,
    },
  ],
});

// Helper to create a workout with all sets completed
const createMockWorkoutAllSetsCompleted = (): WorkoutWithExercises => ({
  id: 1,
  mesocycle_id: 1,
  plan_day_id: 1,
  week_number: 1,
  scheduled_date: '2024-01-15',
  status: 'in_progress',
  started_at: '2024-01-15T10:00:00Z',
  completed_at: null,
  plan_day_name: 'Push Day',
  exercises: [
    {
      exercise_id: 1,
      exercise_name: 'Bench Press',
      sets: [
        {
          id: 1,
          workout_id: 1,
          exercise_id: 1,
          set_number: 1,
          target_reps: 10,
          target_weight: 135,
          actual_reps: 10,
          actual_weight: 135,
          status: 'completed',
        },
        {
          id: 2,
          workout_id: 1,
          exercise_id: 1,
          set_number: 2,
          target_reps: 10,
          target_weight: 135,
          actual_reps: 10,
          actual_weight: 135,
          status: 'completed',
        },
      ],
      total_sets: 2,
      completed_sets: 2,
      rest_seconds: 90,
    },
  ],
});

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

describe('WorkoutView', () => {
  const mockOnSetLogged = vi.fn();
  const mockOnSetUnlogged = vi.fn();
  const mockOnWorkoutStarted = vi.fn();
  const mockOnWorkoutCompleted = vi.fn();
  const mockOnWorkoutSkipped = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('should display workout date', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    // Date format: Monday, Jan 15
    expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
  });

  it('should display workout status badge', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('workout-status')).toHaveTextContent('Scheduled');
  });

  it('should display plan day name', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByText('Push Day')).toBeInTheDocument();
  });

  it('should render all exercises', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByText('Bench Press')).toBeInTheDocument();
  });

  it('should show "Start Workout" button when scheduled', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('start-workout')).toBeInTheDocument();
  });

  it('should hide "Start Workout" when in_progress', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.queryByTestId('start-workout')).not.toBeInTheDocument();
  });

  it('should show "Complete Workout" button when in_progress', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('complete-workout')).toBeInTheDocument();
  });

  it('should show "Skip Workout" button when scheduled or in_progress', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('skip-workout')).toBeInTheDocument();
  });

  it('should disable buttons when completed', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('completed')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.queryByTestId('start-workout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('complete-workout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skip-workout')).not.toBeInTheDocument();
  });

  it('should call onWorkoutStarted when start clicked', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    await user.click(screen.getByTestId('start-workout'));

    expect(mockOnWorkoutStarted).toHaveBeenCalled();
  });

  it('should show confirmation dialog before completing with pending sets', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    await user.click(screen.getByTestId('complete-workout'));

    // Confirmation dialog should appear
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/2 sets not logged/)).toBeInTheDocument();
  });

  it('should call onWorkoutCompleted when confirmed', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    await user.click(screen.getByTestId('complete-workout'));

    // Click confirm button in dialog
    const dialog = screen.getByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-button'));

    expect(mockOnWorkoutCompleted).toHaveBeenCalled();
  });

  it('should show skip confirmation dialog', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    await user.click(screen.getByTestId('skip-workout'));

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Skip Workout\?/)).toBeInTheDocument();
  });

  it('should call onWorkoutSkipped when skip confirmed', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    await user.click(screen.getByTestId('skip-workout'));

    const dialog = screen.getByTestId('confirm-dialog');
    await user.click(within(dialog).getByTestId('confirm-button'));

    expect(mockOnWorkoutSkipped).toHaveBeenCalled();
  });

  it('should display In Progress status badge', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('workout-status')).toHaveTextContent('In Progress');
  });

  it('should display Completed status badge', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('completed')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('workout-status')).toHaveTextContent('Completed');
  });

  it('should display Skipped status badge', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('skipped')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
      />
    );

    expect(screen.getByTestId('workout-status')).toHaveTextContent('Skipped');
  });

  it('should show loading state when starting', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
        isStarting={true}
      />
    );

    expect(screen.getByTestId('start-workout')).toHaveTextContent('Starting...');
  });

  it('should show loading state when completing', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('in_progress')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
        isCompleting={true}
      />
    );

    expect(screen.getByTestId('complete-workout')).toHaveTextContent('Completing...');
  });

  it('should show loading state when skipping', () => {
    renderWithTheme(
      <WorkoutView
        workout={createMockWorkout('pending')}
        onSetLogged={mockOnSetLogged}
        onSetUnlogged={mockOnSetUnlogged}
        onWorkoutStarted={mockOnWorkoutStarted}
        onWorkoutCompleted={mockOnWorkoutCompleted}
        onWorkoutSkipped={mockOnWorkoutSkipped}
        isSkipping={true}
      />
    );

    expect(screen.getByTestId('skip-workout')).toHaveTextContent('Skipping...');
  });

  describe('RestTimer integration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not show rest timer initially', () => {
      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });

    it('should restore timer from localStorage on mount', () => {
      const savedState = {
        startedAt: Date.now() - 10000, // 10 seconds ago
        targetSeconds: 90,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      // Timer should be visible
      expect(screen.getByRole('timer')).toBeInTheDocument();
    });

    it('should display correct target time from restored state', () => {
      const savedState = {
        startedAt: Date.now(),
        targetSeconds: 120, // 2 minutes
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      // Verify timer shows correct target time (2:00)
      expect(screen.getByText(/2:00/)).toBeInTheDocument();
    });

    it('should dismiss timer when dismiss button is clicked', () => {
      const savedState = {
        startedAt: Date.now(),
        targetSeconds: 90,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.getByRole('timer')).toBeInTheDocument();

      // Use fireEvent instead of userEvent with fake timers
      const dismissButton = screen.getByRole('button', { name: /dismiss timer/i });
      act(() => {
        dismissButton.click();
      });

      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(window.localStorage.getItem('rest-timer-state')).toBeNull();
    });

    it('should clear timer when workout is completed', () => {
      const savedState = {
        startedAt: Date.now(),
        targetSeconds: 90,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      const { rerender } = renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.getByRole('timer')).toBeInTheDocument();

      // Simulate workout completion by re-rendering with completed status
      rerender(
        <Theme>
          <WorkoutView
            workout={createMockWorkout('completed')}
            onSetLogged={mockOnSetLogged}
            onSetUnlogged={mockOnSetUnlogged}
            onWorkoutStarted={mockOnWorkoutStarted}
            onWorkoutCompleted={mockOnWorkoutCompleted}
            onWorkoutSkipped={mockOnWorkoutSkipped}
          />
        </Theme>
      );

      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    });

    it('should not restore expired timer from localStorage', () => {
      const expiredState = {
        startedAt: Date.now() - 120000, // 2 minutes ago
        targetSeconds: 90, // 1.5 minute timer (should be expired)
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(expiredState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      // Timer should NOT be visible because it's expired
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      // localStorage should be cleared
      expect(window.localStorage.getItem('rest-timer-state')).toBeNull();
    });

    it('should show reset button on timer', () => {
      const savedState = {
        startedAt: Date.now(),
        targetSeconds: 90,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.getByRole('button', { name: /reset timer/i })).toBeInTheDocument();
    });

    it('should show progress bar updating over time', () => {
      const savedState = {
        startedAt: Date.now(),
        targetSeconds: 100,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');

      act(() => {
        vi.advanceTimersByTime(50000);
      });

      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('should restore timer with correct initial elapsed time', () => {
      const now = Date.now();
      const savedState = {
        startedAt: now - 30000, // 30 seconds ago
        targetSeconds: 90,
        exerciseId: 1,
        setIndex: 0,
      };

      window.localStorage.setItem('rest-timer-state', JSON.stringify(savedState));

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      // Timer should show ~30 seconds elapsed
      expect(screen.getByText('00:30')).toBeInTheDocument();
    });
  });

  describe('All sets done prompt', () => {
    it('should show prompt when all sets are completed in an in_progress workout', () => {
      renderWithTheme(
        <WorkoutView
          workout={createMockWorkoutAllSetsCompleted()}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.getByTestId('all-sets-done-dialog')).toBeInTheDocument();
      expect(screen.getByText(/All Sets Complete!/)).toBeInTheDocument();
      expect(screen.getByText(/logged all 2 sets/)).toBeInTheDocument();
    });

    it('should not show prompt when workout has pending sets', () => {
      renderWithTheme(
        <WorkoutView
          workout={createMockWorkout('in_progress')}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.queryByTestId('all-sets-done-dialog')).not.toBeInTheDocument();
    });

    it('should not show prompt when workout is already completed', () => {
      const completedWorkout: WorkoutWithExercises = {
        ...createMockWorkoutAllSetsCompleted(),
        status: 'completed',
        completed_at: '2024-01-15T11:00:00Z',
      };

      renderWithTheme(
        <WorkoutView
          workout={completedWorkout}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      expect(screen.queryByTestId('all-sets-done-dialog')).not.toBeInTheDocument();
    });

    it('should call onWorkoutCompleted when Complete Workout is clicked in prompt', async () => {
      const user = userEvent.setup();

      renderWithTheme(
        <WorkoutView
          workout={createMockWorkoutAllSetsCompleted()}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      const dialog = screen.getByTestId('all-sets-done-dialog');
      await user.click(within(dialog).getByTestId('complete-workout-prompt-button'));

      expect(mockOnWorkoutCompleted).toHaveBeenCalled();
    });

    it('should not show prompt again after being dismissed', async () => {
      const user = userEvent.setup();

      const { rerender } = renderWithTheme(
        <WorkoutView
          workout={createMockWorkoutAllSetsCompleted()}
          onSetLogged={mockOnSetLogged}
          onSetUnlogged={mockOnSetUnlogged}
          onWorkoutStarted={mockOnWorkoutStarted}
          onWorkoutCompleted={mockOnWorkoutCompleted}
          onWorkoutSkipped={mockOnWorkoutSkipped}
        />
      );

      // Prompt should be shown
      expect(screen.getByTestId('all-sets-done-dialog')).toBeInTheDocument();

      // Click "Not Yet" to dismiss
      await user.click(screen.getByText('Not Yet'));

      // Prompt should be hidden
      expect(screen.queryByTestId('all-sets-done-dialog')).not.toBeInTheDocument();

      // Re-render with same props (simulating a state update)
      rerender(
        <Theme>
          <WorkoutView
            workout={createMockWorkoutAllSetsCompleted()}
            onSetLogged={mockOnSetLogged}
            onSetUnlogged={mockOnSetUnlogged}
            onWorkoutStarted={mockOnWorkoutStarted}
            onWorkoutCompleted={mockOnWorkoutCompleted}
            onWorkoutSkipped={mockOnWorkoutSkipped}
          />
        </Theme>
      );

      // Prompt should still not be shown
      expect(screen.queryByTestId('all-sets-done-dialog')).not.toBeInTheDocument();
    });
  });
});
