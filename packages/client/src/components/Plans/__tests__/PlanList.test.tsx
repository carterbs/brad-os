import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanList } from '../PlanList';
import type { Plan } from '@lifting/shared';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../hooks/usePlans', () => ({
  useDeletePlan: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const mockPlans: Plan[] = [
  {
    id: 1,
    name: 'Push Pull Legs',
    duration_weeks: 6,
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 2,
    name: 'Upper Lower',
    duration_weeks: 8,
    created_at: '2024-01-16T10:00:00.000Z',
    updated_at: '2024-01-16T10:00:00.000Z',
  },
];

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Theme>{ui}</Theme>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('PlanList', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('should display loading skeleton when isLoading is true', () => {
    renderWithProviders(<PlanList plans={[]} isLoading={true} />);
    expect(screen.getByTestId('plan-list-loading')).toBeInTheDocument();
  });

  it('should display empty state when no plans', () => {
    renderWithProviders(<PlanList plans={[]} />);
    expect(screen.getByTestId('empty-plans-message')).toBeInTheDocument();
    expect(screen.getByText("You haven't created any workout plans yet.")).toBeInTheDocument();
  });

  it('should show create first plan button in empty state', () => {
    renderWithProviders(<PlanList plans={[]} />);
    expect(screen.getByTestId('create-first-plan-button')).toBeInTheDocument();
  });

  it('should navigate to create plan page when create button clicked', () => {
    renderWithProviders(<PlanList plans={[]} />);
    fireEvent.click(screen.getByTestId('create-first-plan-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/plans/new');
  });

  it('should display list of plans', () => {
    renderWithProviders(<PlanList plans={mockPlans} />);
    expect(screen.getByTestId('plan-list')).toBeInTheDocument();
    expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
    expect(screen.getByText('Upper Lower')).toBeInTheDocument();
  });

  it('should render correct number of plan cards', () => {
    renderWithProviders(<PlanList plans={mockPlans} />);
    expect(screen.getByTestId('plan-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('plan-card-2')).toBeInTheDocument();
  });
});
