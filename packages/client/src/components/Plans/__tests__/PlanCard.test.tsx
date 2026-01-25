import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BrowserRouter } from 'react-router-dom';
import { PlanCard } from '../PlanCard';
import type { Plan } from '@lifting/shared';

const mockPlan: Plan = {
  id: 1,
  name: 'Push Pull Legs',
  duration_weeks: 6,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-15T10:00:00.000Z',
};

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: (): typeof mockNavigate => mockNavigate,
  };
});

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <BrowserRouter>
      <Theme>{ui}</Theme>
    </BrowserRouter>
  );
}

describe('PlanCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('should display plan name', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
  });

  it('should display duration weeks', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    expect(screen.getByTestId('plan-duration')).toHaveTextContent('6 weeks');
  });

  it('should display singular week for 1 week duration', () => {
    const oneWeekPlan = { ...mockPlan, duration_weeks: 1 };
    renderWithProviders(<PlanCard plan={oneWeekPlan} />);
    expect(screen.getByTestId('plan-duration')).toHaveTextContent('1 week');
  });

  it('should display created date', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    expect(screen.getByText(/Created Jan 15, 2024/)).toBeInTheDocument();
  });

  it('should display days count when provided', () => {
    renderWithProviders(<PlanCard plan={mockPlan} daysCount={3} />);
    expect(screen.getByText('3 days')).toBeInTheDocument();
  });

  it('should display singular day for 1 day', () => {
    renderWithProviders(<PlanCard plan={mockPlan} daysCount={1} />);
    expect(screen.getByText('1 day')).toBeInTheDocument();
  });

  it('should display exercises count when provided', () => {
    renderWithProviders(<PlanCard plan={mockPlan} exercisesCount={5} />);
    expect(screen.getByText('5 exercises')).toBeInTheDocument();
  });

  it('should display singular exercise for 1 exercise', () => {
    renderWithProviders(<PlanCard plan={mockPlan} exercisesCount={1} />);
    expect(screen.getByText('1 exercise')).toBeInTheDocument();
  });

  it('should navigate to plan detail page on click', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('plan-card-1'));
    expect(mockNavigate).toHaveBeenCalledWith('/lifting/plans/1');
  });

  it('should show menu button', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    expect(screen.getByTestId('plan-menu-1')).toBeInTheDocument();
  });

  it('should not navigate when menu button is clicked', () => {
    renderWithProviders(<PlanCard plan={mockPlan} />);
    fireEvent.click(screen.getByTestId('plan-menu-1'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
