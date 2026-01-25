import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import { ExerciseListItem } from '../ExerciseListItem';
import type { Exercise } from '@lifting/shared';

const builtInExercise: Exercise = {
  id: 1,
  name: 'Bench Press',
  weight_increment: 5,
  is_custom: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const customExercise: Exercise = {
  id: 2,
  name: 'Custom Squat',
  weight_increment: 10,
  is_custom: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<MemoryRouter><Theme>{ui}</Theme></MemoryRouter>);
}

describe('ExerciseListItem', () => {
  it('should display exercise name', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
  });

  it('should display weight increment', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    expect(screen.getByText('+5 lbs per progression')).toBeInTheDocument();
  });

  it('should show delete button for all exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={customExercise} />);
    expect(screen.getByLabelText('Delete exercise')).toBeInTheDocument();
  });

  it('should show delete button for built-in exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    expect(screen.getByLabelText('Delete exercise')).toBeInTheDocument();
  });

  it('should call onDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    renderWithTheme(
      <ExerciseListItem exercise={customExercise} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByLabelText('Delete exercise'));
    expect(onDelete).toHaveBeenCalledWith(customExercise);
  });

  it('should render a link to exercise history', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    const link = screen.getByTestId('exercise-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/lifting/exercises/1/history');
  });

  it('should render link with correct href for custom exercise', () => {
    renderWithTheme(<ExerciseListItem exercise={customExercise} />);
    const link = screen.getByTestId('exercise-link');
    expect(link).toHaveAttribute('href', '/lifting/exercises/2/history');
  });

  it('should have cursor pointer style on the link', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    const link = screen.getByTestId('exercise-link');
    expect(link).toHaveStyle({ cursor: 'pointer' });
  });
});
