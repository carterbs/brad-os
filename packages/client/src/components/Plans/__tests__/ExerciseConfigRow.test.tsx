import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ExerciseConfigRow } from '../ExerciseConfigRow';
import type { PlanExerciseFormState } from '../types';
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

const defaultExerciseState: PlanExerciseFormState = {
  tempId: 'test-id',
  exerciseId: 1,
  sets: 3,
  reps: 10,
  weight: 45,
  restSeconds: 90,
  weightIncrement: 5,
};

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('ExerciseConfigRow', () => {
  it('should render exercise dropdown with available exercises', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('exercise-select-0')).toBeInTheDocument();
  });

  it('should render sets dropdown with correct value', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('sets-select-0')).toBeInTheDocument();
  });

  it('should render reps dropdown with correct value', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('reps-select-0')).toBeInTheDocument();
  });

  it('should render weight dropdown with correct value', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('weight-select-0')).toBeInTheDocument();
  });

  it('should render rest dropdown with correct value', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('rest-select-0')).toBeInTheDocument();
  });

  it('should render increment dropdown with correct value', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByTestId('increment-select-0')).toBeInTheDocument();
  });

  it('should call onRemove when remove button clicked', () => {
    const onRemove = vi.fn();
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={onRemove}
        index={0}
      />
    );

    fireEvent.click(screen.getByTestId('remove-exercise-0'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('should render remove button', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByLabelText('Remove exercise')).toBeInTheDocument();
  });

  it('should render with correct labels', () => {
    renderWithTheme(
      <ExerciseConfigRow
        exercise={defaultExerciseState}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('Sets')).toBeInTheDocument();
    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(screen.getByText('Increment')).toBeInTheDocument();
  });

  it('should render with empty exercise selection', () => {
    const emptyExercise: PlanExerciseFormState = {
      ...defaultExerciseState,
      exerciseId: null,
    };

    renderWithTheme(
      <ExerciseConfigRow
        exercise={emptyExercise}
        availableExercises={mockExercises}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        index={0}
      />
    );

    // Should render without errors
    expect(screen.getByTestId('exercise-config-row-0')).toBeInTheDocument();
  });
});
