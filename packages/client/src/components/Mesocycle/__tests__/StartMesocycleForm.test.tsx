import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { StartMesocycleForm } from '../StartMesocycleForm';
import type { Plan } from '@lifting/shared';

function renderWithTheme(ui: React.ReactElement): ReturnType<typeof render> {
  return render(<Theme>{ui}</Theme>);
}

const mockPlans: Plan[] = [
  {
    id: 1,
    name: 'Push Pull Legs',
    duration_weeks: 6,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Upper Lower',
    duration_weeks: 4,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

describe('StartMesocycleForm', () => {
  it('should render form with heading', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    expect(screen.getByText('Start New Mesocycle')).toBeInTheDocument();
  });

  it('should render plan select', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('plan-select')).toBeInTheDocument();
  });

  it('should render start date input', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('start-date-input')).toBeInTheDocument();
  });

  it('should render submit button', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('start-mesocycle-button')).toBeInTheDocument();
  });

  it('should disable submit button when no plan selected', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('start-mesocycle-button')).toBeDisabled();
  });

  it('should render error message when provided', () => {
    renderWithTheme(
      <StartMesocycleForm
        plans={mockPlans}
        onSubmit={vi.fn()}
        error="An error occurred"
      />
    );

    expect(screen.getByTestId('form-error')).toHaveTextContent(
      'An error occurred'
    );
  });

  it('should show loading state when submitting', () => {
    renderWithTheme(
      <StartMesocycleForm
        plans={mockPlans}
        onSubmit={vi.fn()}
        isSubmitting={true}
      />
    );

    expect(screen.getByTestId('start-mesocycle-button')).toHaveTextContent(
      'Starting...'
    );
  });

  it('should show no plans message when plans array is empty', () => {
    renderWithTheme(<StartMesocycleForm plans={[]} onSubmit={vi.fn()} />);

    expect(screen.getByTestId('no-plans-message')).toBeInTheDocument();
    expect(screen.getByText('No plans available.')).toBeInTheDocument();
    expect(
      screen.getByText('Create a plan first to start a mesocycle.')
    ).toBeInTheDocument();
  });

  it('should default start date to today', () => {
    renderWithTheme(<StartMesocycleForm plans={mockPlans} onSubmit={vi.fn()} />);

    const input = screen.getByTestId('start-date-input') as HTMLInputElement;
    const today = new Date();
    const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    expect(input.value).toBe(expectedDate);
  });
});
