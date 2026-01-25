import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlansPage } from '../PlansPage';
import type { Plan } from '@brad-os/shared';

const mockPlans: Plan[] = [
  {
    id: 1,
    name: 'Push Pull Legs',
    duration_weeks: 6,
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-15T10:00:00.000Z',
  },
];

interface MockUsePlansReturn {
  data: Plan[] | undefined;
  isLoading: boolean;
  error: { message: string } | null;
}

const mockUsePlans = vi.fn<[], MockUsePlansReturn>();
const mockNavigate = vi.fn();

vi.mock('../../hooks/usePlans', () => ({
  usePlans: (): MockUsePlansReturn => mockUsePlans(),
  useDeletePlan: (): {
    mutate: ReturnType<typeof vi.fn>;
    isPending: boolean;
    isError: boolean;
    error: null;
  } => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: (): typeof mockNavigate => mockNavigate,
  };
});

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

describe('PlansPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockUsePlans.mockReturnValue({
      data: mockPlans,
      isLoading: false,
      error: null,
    });
  });

  it('should display page title', () => {
    renderWithProviders(<PlansPage />);
    expect(screen.getByText('My Plans')).toBeInTheDocument();
  });

  it('should display create plan button', () => {
    renderWithProviders(<PlansPage />);
    expect(screen.getByTestId('create-plan-button')).toBeInTheDocument();
  });

  it('should navigate to create page when create button clicked', () => {
    renderWithProviders(<PlansPage />);
    fireEvent.click(screen.getByTestId('create-plan-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/lifting/plans/new');
  });

  it('should display loading state', () => {
    mockUsePlans.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    renderWithProviders(<PlansPage />);
    expect(screen.getByTestId('plan-list-loading')).toBeInTheDocument();
  });

  it('should display error message on error', () => {
    mockUsePlans.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
    });
    renderWithProviders(<PlansPage />);
    expect(screen.getByText(/Failed to load plans/)).toBeInTheDocument();
  });

  it('should display list of plans', () => {
    renderWithProviders(<PlansPage />);
    expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
  });
});
