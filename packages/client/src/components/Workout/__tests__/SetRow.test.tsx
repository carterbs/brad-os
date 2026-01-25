import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { SetRow } from '../SetRow';
import type { WorkoutSet } from '@brad-os/shared';

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
  const mockOnUnlog = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display set number in a badge', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should show "pending" class for pending sets', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    expect(setRow).toHaveClass('pending');
  });

  it('should show "logged" class for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const setRow = screen.getByTestId('set-row-2');
    expect(setRow).toHaveClass('logged');
  });

  it('should show "skipped" class for skipped sets', () => {
    renderWithTheme(
      <SetRow
        set={mockSkippedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const setRow = screen.getByTestId('set-row-3');
    expect(setRow).toHaveClass('skipped');
  });

  it('should have inline weight input with target value', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    expect(weightInput).toHaveValue('135');
  });

  it('should have inline reps input with target value', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const repsInput = screen.getByTestId('reps-input-1');
    expect(repsInput).toHaveValue('10');
  });

  it('should have checkbox unchecked for pending sets', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const checkbox = screen.getByTestId('log-checkbox-1');
    expect(checkbox).not.toBeChecked();
  });

  it('should have checkbox checked for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const checkbox = screen.getByTestId('log-checkbox-2');
    expect(checkbox).toBeChecked();
  });

  it('should call onLog when checkbox is checked', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const checkbox = screen.getByTestId('log-checkbox-1');
    await user.click(checkbox);

    expect(mockOnLog).toHaveBeenCalledWith({
      actual_weight: 135,
      actual_reps: 10,
    });
  });

  it('should call onLog with custom input values', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    // Change the input values
    const weightInput = screen.getByTestId('weight-input-1');
    const repsInput = screen.getByTestId('reps-input-1');

    await user.clear(weightInput);
    await user.type(weightInput, '145');
    await user.clear(repsInput);
    await user.type(repsInput, '8');

    const checkbox = screen.getByTestId('log-checkbox-1');
    await user.click(checkbox);

    expect(mockOnLog).toHaveBeenCalledWith({
      actual_weight: 145,
      actual_reps: 8,
    });
  });

  it('should call onUnlog when checkbox is unchecked', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const checkbox = screen.getByTestId('log-checkbox-2');
    await user.click(checkbox);

    expect(mockOnUnlog).toHaveBeenCalled();
    expect(mockOnLog).not.toHaveBeenCalled();
  });

  it('should highlight active row with border', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={true}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    expect(setRow).toHaveStyle('border: 2px solid var(--accent-9)');
  });

  it('should not highlight inactive row', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const setRow = screen.getByTestId('set-row-1');
    expect(setRow).toHaveStyle('border: 2px solid transparent');
  });

  it('should disable inputs when workout completed', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="completed"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    const repsInput = screen.getByTestId('reps-input-1');
    const checkbox = screen.getByTestId('log-checkbox-1');

    expect(weightInput).toBeDisabled();
    expect(repsInput).toBeDisabled();
    expect(checkbox).toBeDisabled();
  });

  it('should disable inputs when workout skipped', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="skipped"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    const repsInput = screen.getByTestId('reps-input-1');
    const checkbox = screen.getByTestId('log-checkbox-1');

    expect(weightInput).toBeDisabled();
    expect(repsInput).toBeDisabled();
    expect(checkbox).toBeDisabled();
  });

  it('should disable inputs for skipped sets', () => {
    renderWithTheme(
      <SetRow
        set={mockSkippedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-3');
    const repsInput = screen.getByTestId('reps-input-3');
    const checkbox = screen.getByTestId('log-checkbox-3');

    expect(weightInput).toBeDisabled();
    expect(repsInput).toBeDisabled();
    expect(checkbox).toBeDisabled();
  });

  it('should show actual values in inputs for logged sets', () => {
    renderWithTheme(
      <SetRow
        set={mockLoggedSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-2');
    const repsInput = screen.getByTestId('reps-input-2');

    expect(weightInput).toHaveValue('140');
    expect(repsInput).toHaveValue('8');
  });

  it('should call onWeightChange when weight input changes', async () => {
    const user = userEvent.setup();
    const mockOnWeightChange = vi.fn();

    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
        onWeightChange={mockOnWeightChange}
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    await user.clear(weightInput);
    await user.type(weightInput, '150');

    // onWeightChange is called for each character typed after clear
    expect(mockOnWeightChange).toHaveBeenCalledWith('1');
    expect(mockOnWeightChange).toHaveBeenCalledWith('15');
    expect(mockOnWeightChange).toHaveBeenCalledWith('150');
  });

  it('should use weightOverride when provided', () => {
    renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
        weightOverride="200"
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    expect(weightInput).toHaveValue('200');
  });

  it('should update weight when weightOverride changes', () => {
    const { rerender } = renderWithTheme(
      <SetRow
        set={mockPendingSet}
        workoutStatus="in_progress"
        isActive={false}
        onLog={mockOnLog}
        onUnlog={mockOnUnlog}
      />
    );

    const weightInput = screen.getByTestId('weight-input-1');
    expect(weightInput).toHaveValue('135');

    // Re-render with weightOverride
    rerender(
      <Theme>
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          weightOverride="180"
        />
      </Theme>
    );

    expect(weightInput).toHaveValue('180');
  });

  describe('pendingEdit restoration', () => {
    it('should use pendingEdit weight when provided on initial render', () => {
      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          pendingEdit={{ weight: '150' }}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      expect(weightInput).toHaveValue('150');
    });

    it('should use pendingEdit reps when provided on initial render', () => {
      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          pendingEdit={{ reps: '12' }}
        />
      );

      const repsInput = screen.getByTestId('reps-input-1');
      expect(repsInput).toHaveValue('12');
    });

    it('should use both pendingEdit weight and reps when provided', () => {
      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          pendingEdit={{ weight: '160', reps: '15' }}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      const repsInput = screen.getByTestId('reps-input-1');
      expect(weightInput).toHaveValue('160');
      expect(repsInput).toHaveValue('15');
    });

    it('should restore pendingEdit when it becomes available after mount (page refresh scenario)', () => {
      // First render without pendingEdit (simulates initial mount before localStorage loads)
      const { rerender } = renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      const repsInput = screen.getByTestId('reps-input-1');

      // Should have default target values
      expect(weightInput).toHaveValue('135');
      expect(repsInput).toHaveValue('10');

      // Re-render with pendingEdit (simulates localStorage becoming available)
      rerender(
        <Theme>
          <SetRow
            set={mockPendingSet}
            workoutStatus="in_progress"
            isActive={false}
            onLog={mockOnLog}
            onUnlog={mockOnUnlog}
            pendingEdit={{ weight: '175', reps: '8' }}
          />
        </Theme>
      );

      // Should now show pendingEdit values
      expect(weightInput).toHaveValue('175');
      expect(repsInput).toHaveValue('8');
    });

    it('should restore only pendingEdit weight when only weight is in pendingEdit', () => {
      const { rerender } = renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      const repsInput = screen.getByTestId('reps-input-1');

      rerender(
        <Theme>
          <SetRow
            set={mockPendingSet}
            workoutStatus="in_progress"
            isActive={false}
            onLog={mockOnLog}
            onUnlog={mockOnUnlog}
            pendingEdit={{ weight: '200' }}
          />
        </Theme>
      );

      expect(weightInput).toHaveValue('200');
      expect(repsInput).toHaveValue('10'); // Should remain unchanged
    });

    it('should call onPendingEdit when weight is changed', async () => {
      const user = userEvent.setup();
      const mockOnPendingEdit = vi.fn();

      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          onPendingEdit={mockOnPendingEdit}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      await user.clear(weightInput);
      await user.type(weightInput, '155');

      expect(mockOnPendingEdit).toHaveBeenCalledWith({ weight: '155' });
    });

    it('should call onPendingEdit when reps is changed', async () => {
      const user = userEvent.setup();
      const mockOnPendingEdit = vi.fn();

      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          onPendingEdit={mockOnPendingEdit}
        />
      );

      const repsInput = screen.getByTestId('reps-input-1');
      await user.clear(repsInput);
      await user.type(repsInput, '12');

      expect(mockOnPendingEdit).toHaveBeenCalledWith({ reps: '12' });
    });

    it('should prioritize pendingEdit over weightOverride', () => {
      renderWithTheme(
        <SetRow
          set={mockPendingSet}
          workoutStatus="in_progress"
          isActive={false}
          onLog={mockOnLog}
          onUnlog={mockOnUnlog}
          weightOverride="180"
          pendingEdit={{ weight: '190' }}
        />
      );

      const weightInput = screen.getByTestId('weight-input-1');
      expect(weightInput).toHaveValue('190');
    });
  });
});
