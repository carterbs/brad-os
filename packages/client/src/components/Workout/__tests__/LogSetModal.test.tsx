import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Theme } from '@radix-ui/themes';
import { LogSetModal } from '../LogSetModal';
import type { WorkoutSet } from '@lifting/shared';

const mockSet: WorkoutSet = {
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

const renderWithTheme = (ui: React.ReactElement): ReturnType<typeof render> => {
  return render(<Theme>{ui}</Theme>);
};

describe('LogSetModal', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display set number in title', () => {
    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Log Set 1')).toBeInTheDocument();
  });

  it('should pre-fill reps with target value for new log', () => {
    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const repsInput = screen.getByTestId('reps-input');
    expect(repsInput).toHaveValue(10);
  });

  it('should pre-fill weight with target value for new log', () => {
    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const weightInput = screen.getByTestId('weight-input');
    expect(weightInput).toHaveValue(135);
  });

  it('should pre-fill with actual values when re-logging', () => {
    const loggedSet: WorkoutSet = {
      ...mockSet,
      actual_reps: 8,
      actual_weight: 140,
      status: 'completed',
    };

    renderWithTheme(
      <LogSetModal
        open={true}
        set={loggedSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const repsInput = screen.getByTestId('reps-input');
    const weightInput = screen.getByTestId('weight-input');

    expect(repsInput).toHaveValue(8);
    expect(weightInput).toHaveValue(140);
  });

  it('should allow editing reps', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const repsInput = screen.getByTestId('reps-input');
    await user.clear(repsInput);
    await user.type(repsInput, '12');

    expect(repsInput).toHaveValue(12);
  });

  it('should allow editing weight', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const weightInput = screen.getByTestId('weight-input');
    await user.clear(weightInput);
    await user.type(weightInput, '150');

    expect(weightInput).toHaveValue(150);
  });

  it('should call onSave with values when saved', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const repsInput = screen.getByTestId('reps-input');
    const weightInput = screen.getByTestId('weight-input');

    await user.clear(repsInput);
    await user.type(repsInput, '12');
    await user.clear(weightInput);
    await user.type(weightInput, '140');

    const saveButton = screen.getByTestId('save-button');
    await user.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith({
      actual_reps: 12,
      actual_weight: 140,
    });
  });

  it('should call onClose when cancelled', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const cancelButton = screen.getByTestId('cancel-button');
    await user.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should validate reps is non-negative', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const repsInput = screen.getByTestId('reps-input');
    await user.clear(repsInput);
    await user.type(repsInput, '-1');

    const saveButton = screen.getByTestId('save-button');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should validate weight is non-negative', async () => {
    const user = userEvent.setup();

    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    const weightInput = screen.getByTestId('weight-input');
    await user.clear(weightInput);
    await user.type(weightInput, '-5');

    const saveButton = screen.getByTestId('save-button');
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should not render when set is null', () => {
    const { container } = renderWithTheme(
      <LogSetModal
        open={true}
        set={null}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(container.querySelector('[data-testid="log-set-modal"]')).not.toBeInTheDocument();
  });

  it('should display target values in description', () => {
    renderWithTheme(
      <LogSetModal
        open={true}
        set={mockSet}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Target: 10 reps @ 135 lbs')).toBeInTheDocument();
  });
});
