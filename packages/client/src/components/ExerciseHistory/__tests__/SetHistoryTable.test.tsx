import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExerciseHistoryEntry } from '@lifting/shared';
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

describe('SetHistoryTable', () => {
  it('should render table with correct headers', () => {
    render(<SetHistoryTable entries={mockEntries} />);

    expect(screen.getByTestId('set-history-table')).toBeInTheDocument();
    expect(screen.getByText('Set History')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Best Weight')).toBeInTheDocument();
    expect(screen.getByText('Reps')).toBeInTheDocument();
    expect(screen.getByText('Sets')).toBeInTheDocument();
  });

  it('should render entries in reverse chronological order', () => {
    render(<SetHistoryTable entries={mockEntries} />);

    const rows = screen.getAllByRole('row');
    // First row is header, subsequent rows are data
    // Most recent entry (workout_id 20) should come first in the table body
    expect(rows).toHaveLength(3); // 1 header + 2 data rows

    // Check that the most recent entry (140 lbs, 3 sets) appears first
    const cells = rows[1]!.querySelectorAll('td');
    expect(cells[1]!.textContent).toBe('140 lbs');
    expect(cells[3]!.textContent).toBe('3');
  });

  it('should display weight in lbs', () => {
    render(<SetHistoryTable entries={mockEntries} />);

    expect(screen.getByText('135 lbs')).toBeInTheDocument();
    expect(screen.getByText('140 lbs')).toBeInTheDocument();
  });
});
