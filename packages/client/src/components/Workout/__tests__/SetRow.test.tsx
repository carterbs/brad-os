import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { SetRow } from '../SetRow';
import type { WorkoutSet } from '@lifting/shared';

const mockPendingSet: WorkoutSet = {
  id: 1,
  workout_id: 1,
  exercise_id: 1,
  set_number: 1,
  target_reps: 10,
  target_weight: 135,
  actual_reps: null,
  actual_weight: null,
  status: 'pending',
};

const mockLoggedSet: WorkoutSet = {
  id: 2,
  workout_id: 1,
  exercise_id: 1,
  set_number: 2,
  target_reps: 10,
  target_weight: 135,
  actual_reps: 8,
  actual_weight: 140,
  status: 'completed',
};

const mockSkippedSet: WorkoutSet = {
  id: 3,
  workout_id: 1,
  exercise_id: 1,
  set_number: 3,
  target_reps: 10,
  target_weight: 135,
  actual_reps: null,
  actual_weight: null,
  status: 'skipped',
};

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

describe('SetRow', () => {
  const mockOnLog = vi.fn();
  const mockOnSkip = vi.fn();
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display set number', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Set 1')).toBeInTheDocument();
  });

  it('should display target reps and weight', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Target: 10 reps @ 135 lbs')).toBeInTheDocument();
  });

  it('should show "pending" class for pending sets', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    expect(setRow).toHaveClass('pending');
  });

  it('should show "logged" class with actual values for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-2');
    expect(setRow).toHaveClass('logged');
    expect(screen.getByTestId('actual-reps')).toHaveTextContent('8');
    expect(screen.getByTestId('actual-weight')).toHaveTextContent('140');
  });

  it('should show "skipped" class for skipped sets', () => {
    renderWithTheme(
      <SetRow
        set={mockSkippedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-3');
    expect(setRow).toHaveClass('skipped');
  });

  it('should call onClick when clicked (pending set)', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    await user.click(setRow);

    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should call onClick when clicked (logged set for re-logging)', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-2');
    await user.click(setRow);

    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should show skip button for pending sets', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByTestId('skip-set-button')).toBeInTheDocument();
  });

  it('should show skip button for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByTestId('skip-set-button')).toBeInTheDocument();
  });

  it('should not show skip button for already skipped sets', () => {
    renderWithTheme(
      <SetRow
        set={mockSkippedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.queryByTestId('skip-set-button')).not.toBeInTheDocument();
  });

  it('should call onSkip when skip button clicked', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const skipButton = screen.getByTestId('skip-set-button');
    await user.click(skipButton);

    expect(mockOnSkip).toHaveBeenCalled();
    // Should not trigger onClick when clicking skip button
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should disable interactions when workout completed', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="completed"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    await user.click(setRow);

    expect(mockOnClick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('skip-set-button')).not.toBeInTheDocument();
  });

  it('should disable interactions when workout skipped', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="skipped"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    await user.click(setRow);

    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should show Logged badge for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Logged')).toBeInTheDocument();
  });

  it('should show Skipped badge for skipped sets', () => {
    renderWithTheme(
      <SetRow
        set={mockSkippedSet}
        workoutStatus="in_progress"
        onLog={mockOnLog}
        onSkip={mockOnSkip}
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Skipped')).toBeInTheDocument();
  });
});
