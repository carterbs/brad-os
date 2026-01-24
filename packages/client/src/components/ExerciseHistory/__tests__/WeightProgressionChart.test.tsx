import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ExerciseHistoryEntry } from '@lifting/shared';
import { WeightProgressionChart } from '../WeightProgressionChart';

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
}));

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
    ],
    best_weight: 140,
    best_set_reps: 8,
  },
];

describe('WeightProgressionChart', () => {
  it('should render without crashing with valid data', () => {
    render(<WeightProgressionChart entries={mockEntries} />);

    expect(screen.getByTestId('weight-chart')).toBeInTheDocument();
    expect(screen.getByText('Weight Progression')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('should render with single data point', () => {
    const singleEntry: ExerciseHistoryEntry[] = [mockEntries[0]!];

    render(<WeightProgressionChart entries={singleEntry} />);

    expect(screen.getByTestId('weight-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });
});
