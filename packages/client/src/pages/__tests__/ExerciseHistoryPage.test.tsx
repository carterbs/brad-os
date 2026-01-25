import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Exercise, ExerciseHistory } from '@brad-os/shared';
import type { ApiClientError } from '../../api/exerciseApi';
import { ExerciseHistoryPage } from '../ExerciseHistoryPage';

vi.mock('../../hooks/useExercises', () => ({
  useExerciseHistory: vi.fn(),
  useExercise: vi.fn(),
}));

vi.mock('../../components/ExerciseLibrary/EditExerciseDialog', () => ({
  EditExerciseDialog: ({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }): JSX.Element | null => {
    if (exercise === null) return null;
    return (
      <div data-testid="edit-exercise-dialog">
        <span>Editing: {exercise.name}</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

vi.mock('../../components/ExerciseHistory/WeightProgressionChart', () => ({
  WeightProgressionChart: (): JSX.Element => <div data-testid="weight-chart">Weight Chart Mock</div>,
}));

vi.mock('../../components/ExerciseHistory/SetHistoryTable', () => ({
  SetHistoryTable: (): JSX.Element => <div data-testid="set-history-table">Set History Mock</div>,
}));

import { useExerciseHistory, useExercise } from '../../hooks/useExercises';

const mockUseExerciseHistory = vi.mocked(useExerciseHistory);
const mockUseExercise = vi.mocked(useExercise);

const mockExercise: Exercise = {
  id: 1,
  name: 'Bench Press',
  weight_increment: 5,
  is_custom: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockHistory: ExerciseHistory = {
  exercise_id: 1,
  exercise_name: 'Bench Press',
  entries: [
    {
      workout_id: 10,
      date: '2024-01-15',
      week_number: 1,
      mesocycle_id: 1,
      sets: [
        { set_number: 1, weight: 135, reps: 8 },
        { set_number: 2, weight: 135, reps: 7 },
      ],
      best_weight: 135,
      best_set_reps: 8,
    },
    {
      workout_id: 20,
      date: '2024-01-22',
      week_number: 2,
      mesocycle_id: 1,
      sets: [
        { set_number: 1, weight: 140, reps: 8 },
        { set_number: 2, weight: 140, reps: 7 },
      ],
      best_weight: 140,
      best_set_reps: 8,
    },
  ],
  personal_record: {
    weight: 140,
    reps: 8,
    date: '2024-01-22',
  },
};

function renderWithRouter(exerciseId: string = '1'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/exercises/${exerciseId}/history`]}>
      <Theme>
        <Routes>
          <Route path="/exercises/:id/history" element={<ExerciseHistoryPage />} />
        </Routes>
      </Theme>
    </MemoryRouter>
  );
}

describe('ExerciseHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseExercise.mockReturnValue({
      data: mockExercise,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<Exercise, ApiClientError>);
  });

  it('should show loading spinner while fetching', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isSuccess: false,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByText('Loading history...')).toBeInTheDocument();
  });

  it('should show error message on fetch failure', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      isError: true,
      isSuccess: false,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByText('Failed to load exercise history')).toBeInTheDocument();
  });

  it('should show "No history yet" when entries array is empty', () => {
    const emptyHistory: ExerciseHistory = {
      ...mockHistory,
      entries: [],
      personal_record: null,
    };

    mockUseExerciseHistory.mockReturnValue({
      data: emptyHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByText('No history yet')).toBeInTheDocument();
  });

  it('should render exercise name as heading', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bench Press');
  });

  it('should render chart component when data has entries', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByTestId('weight-chart')).toBeInTheDocument();
  });

  it('should render set history table when data has entries', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByTestId('set-history-table')).toBeInTheDocument();
  });

  it('should display personal record when present', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByText('PR')).toBeInTheDocument();
    expect(screen.getByText(/140 lbs x 8 reps/)).toBeInTheDocument();
  });

  it('should show edit button in the header', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    expect(screen.getByLabelText('Edit exercise')).toBeInTheDocument();
  });

  it('should open edit dialog when edit button is clicked', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    fireEvent.click(screen.getByLabelText('Edit exercise'));

    expect(screen.getByTestId('edit-exercise-dialog')).toBeInTheDocument();
    expect(screen.getByText('Editing: Bench Press')).toBeInTheDocument();
  });

  it('should close edit dialog when onClose is called', () => {
    mockUseExerciseHistory.mockReturnValue({
      data: mockHistory,
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
    } as unknown as UseQueryResult<ExerciseHistory, ApiClientError>);

    renderWithRouter();

    fireEvent.click(screen.getByLabelText('Edit exercise'));
    expect(screen.getByTestId('edit-exercise-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('edit-exercise-dialog')).not.toBeInTheDocument();
  });
});
