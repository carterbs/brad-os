import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { MesocycleStatusCard } from '../MesocycleStatusCard';
import type { MesocycleWithDetails } from '@lifting/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

const mockMesocycle: MesocycleWithDetails = {
  id: 1,
  plan_id: 1,
  start_date: '2024-01-01',
  current_week: 2,
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  plan_name: 'Test Plan',
  weeks: [],
  total_workouts: 14,
  completed_workouts: 4,
};

describe('MesocycleStatusCard', () => {
  it('should render mesocycle details', () => {
    renderWithTheme(<MesocycleStatusCard mesocycle={mockMesocycle} />);

    expect(screen.getByTestId('mesocycle-plan-name')).toHaveTextContent(
      'Test Plan'
    );
    expect(screen.getByTestId('mesocycle-status-badge')).toHaveTextContent(
      'Active'
    );
    expect(screen.getByTestId('mesocycle-progress-text')).toHaveTextContent(
      '4 / 14 workouts (29%)'
    );
  });

  it('should render start date', () => {
    renderWithTheme(<MesocycleStatusCard mesocycle={mockMesocycle} />);

    expect(screen.getByText(/Started/)).toBeInTheDocument();
  });

  it('should render week info', () => {
    renderWithTheme(<MesocycleStatusCard mesocycle={mockMesocycle} />);

    expect(screen.getByText('Week 2 of 7')).toBeInTheDocument();
  });

  it('should render complete button when callback provided', () => {
    const onComplete = vi.fn();
    renderWithTheme(
      <MesocycleStatusCard mesocycle={mockMesocycle} onComplete={onComplete} />
    );

    const button = screen.getByTestId('complete-mesocycle-button');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('should render cancel button when callback provided', () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <MesocycleStatusCard mesocycle={mockMesocycle} onCancel={onCancel} />
    );

    const button = screen.getByTestId('cancel-mesocycle-button');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should disable buttons when completing', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(
      <MesocycleStatusCard
        mesocycle={mockMesocycle}
        onComplete={onComplete}
        onCancel={onCancel}
        isCompleting={true}
      />
    );

    expect(screen.getByTestId('complete-mesocycle-button')).toBeDisabled();
    expect(screen.getByTestId('cancel-mesocycle-button')).toBeDisabled();
    expect(
      screen.getByTestId('complete-mesocycle-button')
    ).toHaveTextContent('Completing...');
  });

  it('should disable buttons when cancelling', () => {
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(
      <MesocycleStatusCard
        mesocycle={mockMesocycle}
        onComplete={onComplete}
        onCancel={onCancel}
        isCancelling={true}
      />
    );

    expect(screen.getByTestId('complete-mesocycle-button')).toBeDisabled();
    expect(screen.getByTestId('cancel-mesocycle-button')).toBeDisabled();
    expect(screen.getByTestId('cancel-mesocycle-button')).toHaveTextContent(
      'Cancelling...'
    );
  });

  it('should not render buttons for completed mesocycle', () => {
    const completedMeso: MesocycleWithDetails = {
      ...mockMesocycle,
      status: 'completed',
    };
    const onComplete = vi.fn();
    const onCancel = vi.fn();

    renderWithTheme(
      <MesocycleStatusCard
        mesocycle={completedMeso}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );

    expect(
      screen.queryByTestId('complete-mesocycle-button')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('cancel-mesocycle-button')
    ).not.toBeInTheDocument();
  });

  it('should show correct status badge for completed', () => {
    const completedMeso: MesocycleWithDetails = {
      ...mockMesocycle,
      status: 'completed',
    };

    renderWithTheme(<MesocycleStatusCard mesocycle={completedMeso} />);

    expect(screen.getByTestId('mesocycle-status-badge')).toHaveTextContent(
      'Completed'
    );
  });

  it('should show correct status badge for cancelled', () => {
    const cancelledMeso: MesocycleWithDetails = {
      ...mockMesocycle,
      status: 'cancelled',
    };

    renderWithTheme(<MesocycleStatusCard mesocycle={cancelledMeso} />);

    expect(screen.getByTestId('mesocycle-status-badge')).toHaveTextContent(
      'Cancelled'
    );
  });
});
