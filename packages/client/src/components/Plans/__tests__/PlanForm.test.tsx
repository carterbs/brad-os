import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { PlanForm } from '../PlanForm';
import type { Exercise } from '@lifting/shared';

const mockExercises: Exercise[] = [
  {
    id: 1,
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Squat',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('PlanForm', () => {
  it('should show step 1 (name/duration) initially', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId('step-1')).toBeInTheDocument();
    expect(screen.getByTestId('plan-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('duration-select')).toBeInTheDocument();
  });

  it('should validate name is not empty before proceeding', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Try to proceed without name
    fireEvent.click(screen.getByTestId('next-button'));

    // Should still be on step 1 with error
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
    expect(screen.getByText('Plan name is required')).toBeInTheDocument();
  });

  it('should show step 2 (day selection) after step 1', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Fill in name
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });

    // Proceed to step 2
    fireEvent.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    expect(screen.getByTestId('day-selector')).toBeInTheDocument();
  });

  it('should show step 3 (exercises) after step 2', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Complete step 1
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));

    // Complete step 2 - select Monday
    fireEvent.click(screen.getByTestId('day-checkbox-1'));
    fireEvent.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-3')).toBeInTheDocument();
  });

  it('should show exercises only for selected days', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Complete step 1
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));

    // Select Monday and Wednesday
    fireEvent.click(screen.getByTestId('day-checkbox-1'));
    fireEvent.click(screen.getByTestId('day-checkbox-3'));
    fireEvent.click(screen.getByTestId('next-button'));

    // Should show tabs for Monday and Wednesday only
    expect(screen.getByTestId('day-tab-1')).toBeInTheDocument();
    expect(screen.getByTestId('day-tab-3')).toBeInTheDocument();
    expect(screen.queryByTestId('day-tab-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('day-tab-2')).not.toBeInTheDocument();
  });

  it('should navigate back from step 2 to step 1', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Go to step 2
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-2')).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  it('should navigate back from step 3 to step 2', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Go to step 3
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));
    fireEvent.click(screen.getByTestId('day-checkbox-1'));
    fireEvent.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('step-3')).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByText('Back'));

    expect(screen.getByTestId('step-2')).toBeInTheDocument();
  });

  it('should call onCancel when Cancel clicked on step 1', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('should show loading state when isSubmitting', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={true}
      />
    );

    // Go to step 3
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));
    fireEvent.click(screen.getByTestId('day-checkbox-1'));
    fireEvent.click(screen.getByTestId('next-button'));

    expect(screen.getByTestId('submit-button')).toHaveTextContent('Saving...');
    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  it('should prevent proceeding to step 3 without selecting days', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Go to step 2
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));

    // Try to proceed without selecting any days
    fireEvent.click(screen.getByTestId('next-button'));

    // Should still be on step 2 with error
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    expect(screen.getByText('Select at least one workout day')).toBeInTheDocument();
  });

  it('should clear days error when a day is selected', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Go to step 2
    fireEvent.change(screen.getByTestId('plan-name-input'), {
      target: { value: 'My Plan' },
    });
    fireEvent.click(screen.getByTestId('next-button'));

    // Try to proceed without selecting any days (triggers error)
    fireEvent.click(screen.getByTestId('next-button'));
    expect(screen.getByText('Select at least one workout day')).toBeInTheDocument();

    // Select a day
    fireEvent.click(screen.getByTestId('day-checkbox-1'));

    // Error should be cleared
    expect(screen.queryByText('Select at least one workout day')).not.toBeInTheDocument();
  });

  it('should render step indicators', () => {
    renderWithTheme(
      <PlanForm
        availableExercises={mockExercises}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('Basics')).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();
    expect(screen.getByText('Exercises')).toBeInTheDocument();
  });
});
