import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import type { ExerciseHistoryEntry } from '@brad-os/shared';
import { SetHistoryTable } from '../SetHistoryTable';

const mockEntries: ExerciseHistoryEntry[] = [
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
      { set_number: 3, weight: 140, reps: 6 },
    ],
    best_weight: 140,
    best_set_reps: 8,
  },
];

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

describe('SetHistoryTable', () => {
  it('should render with correct headers', () => {
    renderWithTheme(<SetHistoryTable entries={mockEntries} />);

    expect(screen.getByTestId('set-history-table')).toBeInTheDocument();
    expect(screen.getByText('Set History')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Weight')).toBeInTheDocument();
    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.getByText('Sets')).toBeInTheDocument();
  });

  it('should render entries in reverse chronological order', () => {
    renderWithTheme(<SetHistoryTable entries={mockEntries} />);

    // The most recent entry (140 lbs) should appear before the older one (135 lbs)
    const weightTexts = screen.getAllByText(/lbs/);
    expect(weightTexts[0]).toHaveTextContent('140 lbs');
    expect(weightTexts[1]).toHaveTextContent('135 lbs');
  });

  it('should display weight in lbs', () => {
    renderWithTheme(<SetHistoryTable entries={mockEntries} />);

    expect(screen.getByText('135 lbs')).toBeInTheDocument();
    expect(screen.getByText('140 lbs')).toBeInTheDocument();
  });
});
