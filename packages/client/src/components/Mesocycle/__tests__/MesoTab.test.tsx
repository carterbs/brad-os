import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { MesoTab } from '../MesoTab';
import type { MesocycleWithDetails, Plan, WeekSummary } from '@brad-os/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

const mockWeeks: WeekSummary[] = [
  {
    week_number: 1,
    is_deload: false,
    workouts: [],
    total_workouts: 2,
    completed_workouts: 0,
    skipped_workouts: 0,
  },
  {
    week_number: 2,
    is_deload: false,
    workouts: [],
    total_workouts: 2,
    completed_workouts: 0,
    skipped_workouts: 0,
  },
];

const mockMesocycle: MesocycleWithDetails = {
  id: 1,
  plan_id: 1,
  start_date: '2024-01-01',
  current_week: 1,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  plan_name: 'Test Plan',
  weeks: mockWeeks,
  total_workouts: 14,
  completed_workouts: 4,
};

const mockPlans: Plan[] = [
  {
    id: 1,
    name: 'Push Pull Legs',
    duration_weeks: 6,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

describe('MesoTab', () => {
  it('should render no active mesocycle message when none exists', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={null}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(screen.getByText('No active mesocycle')).toBeInTheDocument();
  });

  it('should render start mesocycle form when no active mesocycle', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={null}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(screen.getByTestId('start-mesocycle-form')).toBeInTheDocument();
  });

  it('should render mesocycle status card when active mesocycle exists', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={mockMesocycle}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(screen.getByTestId('mesocycle-status-card')).toBeInTheDocument();
    expect(screen.getByTestId('mesocycle-plan-name')).toHaveTextContent(
      'Test Plan'
    );
  });

  it('should render week cards when active mesocycle exists', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={mockMesocycle}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(screen.getByTestId('week-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('week-card-2')).toBeInTheDocument();
  });

  it('should render Weekly Schedule heading when active mesocycle exists', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={mockMesocycle}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(screen.getByText('Weekly Schedule')).toBeInTheDocument();
  });

  it('should not render start form when active mesocycle exists', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={mockMesocycle}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId('start-mesocycle-form')
    ).not.toBeInTheDocument();
  });

  it('should pass create error to form', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={null}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
        createError="Something went wrong"
      />
    );

    expect(screen.getByTestId('form-error')).toHaveTextContent(
      'Something went wrong'
    );
  });

  it('should pass isCreating to form', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={null}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
        isCreating={true}
      />
    );

    expect(screen.getByTestId('start-mesocycle-button')).toHaveTextContent(
      'Starting...'
    );
  });

  it('should render complete and cancel buttons when callbacks provided', () => {
    renderWithTheme(
      <MesoTab
        activeMesocycle={mockMesocycle}
        plans={mockPlans}
        onCreateMesocycle={vi.fn()}
        onCompleteMesocycle={vi.fn()}
        onCancelMesocycle={vi.fn()}
      />
    );

    expect(
      screen.getByTestId('complete-mesocycle-button')
    ).toBeInTheDocument();
    expect(screen.getByTestId('cancel-mesocycle-button')).toBeInTheDocument();
  });
});
