import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  return render(<Theme>{ui}</Theme>);
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

  it('should show edit button for custom exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={customExercise} />);
    expect(screen.getByLabelText('Edit exercise')).toBeInTheDocument();
  });

  it('should show delete button for custom exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={customExercise} />);
    expect(screen.getByLabelText('Delete exercise')).toBeInTheDocument();
  });

  it('should show edit button for built-in exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    expect(screen.getByLabelText('Edit exercise')).toBeInTheDocument();
  });

  it('should not show delete button for built-in exercises', () => {
    renderWithTheme(<ExerciseListItem exercise={builtInExercise} />);
    expect(screen.queryByLabelText('Delete exercise')).not.toBeInTheDocument();
  });

  it('should call onEdit when edit button clicked on built-in exercise', () => {
    const onEdit = vi.fn();
    renderWithTheme(
      <ExerciseListItem exercise={builtInExercise} onEdit={onEdit} />
    );
    fireEvent.click(screen.getByLabelText('Edit exercise'));
    expect(onEdit).toHaveBeenCalledWith(builtInExercise);
  });

  it('should call onEdit when edit button clicked', () => {
    const onEdit = vi.fn();
    renderWithTheme(
      <ExerciseListItem exercise={customExercise} onEdit={onEdit} />
    );
    fireEvent.click(screen.getByLabelText('Edit exercise'));
    expect(onEdit).toHaveBeenCalledWith(customExercise);
  });

  it('should call onDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    renderWithTheme(
      <ExerciseListItem exercise={customExercise} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByLabelText('Delete exercise'));
    expect(onDelete).toHaveBeenCalledWith(customExercise);
  });
});
