import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { NextWeekPreview } from '../NextWeekPreview';
import type { NextWeekResponse } from '@lifting/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

const mockNextWeekData: NextWeekResponse = {
  mesocycleId: 1,
  weekNumber: 2,
  isDeload: false,
  exercises: [
    {
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      targetWeight: 105,
      targetReps: 8,
      targetSets: 3,
      willProgress: true,
      previousWeekCompleted: true,
    },
    {
      exerciseId: 'ex-2',
      exerciseName: 'Squat',
      targetWeight: 135,
      targetReps: 9,
      targetSets: 3,
      willProgress: false,
      previousWeekCompleted: false,
    },
  ],
};

describe('NextWeekPreview', () => {
  it('should display week number', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.getByText('Week 2 Preview')).toBeInTheDocument();
  });

  it('should list all exercises', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Squat')).toBeInTheDocument();
  });

  it('should display exercise targets', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.getByText('105 lbs')).toBeInTheDocument();
    expect(screen.getByText('8 reps')).toBeInTheDocument();
    expect(screen.getByText('135 lbs')).toBeInTheDocument();
    expect(screen.getByText('9 reps')).toBeInTheDocument();
  });

  it('should show progression indicator for each exercise', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.getByTestId('progression-will-progress')).toBeInTheDocument();
    expect(
      screen.getByTestId('progression-will-not-progress')
    ).toBeInTheDocument();
  });

  it('should show deload badge when isDeload is true', () => {
    const deloadData: NextWeekResponse = {
      ...mockNextWeekData,
      weekNumber: 6,
      isDeload: true,
    };
    renderWithTheme(<NextWeekPreview data={deloadData} />);

    expect(screen.getByTestId('deload-badge')).toBeInTheDocument();
  });

  it('should not show deload badge for regular weeks', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.queryByTestId('deload-badge')).not.toBeInTheDocument();
  });

  it('should display set counts', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    // Both exercises have 3 sets
    const setElements = screen.getAllByText('3 sets');
    expect(setElements).toHaveLength(2);
  });

  it('should show empty state when no exercises', () => {
    const emptyData: NextWeekResponse = {
      ...mockNextWeekData,
      exercises: [],
    };
    renderWithTheme(<NextWeekPreview data={emptyData} />);

    expect(screen.getByText('No exercises scheduled')).toBeInTheDocument();
  });

  it('should have appropriate test id', () => {
    renderWithTheme(<NextWeekPreview data={mockNextWeekData} />);

    expect(screen.getByTestId('next-week-preview')).toBeInTheDocument();
  });
});
