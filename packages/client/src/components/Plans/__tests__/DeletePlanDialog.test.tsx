import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeletePlanDialog } from '../DeletePlanDialog';
import type { Plan } from '@lifting/shared';
import { ConflictError } from '../../../api/exerciseApi';

const mockMutate = vi.fn();
const mockDeletePlanReturn: {
  mutate: typeof mockMutate;
  isPending: boolean;
  isError: boolean;
  error: { message: string } | ConflictError | null;
} = {
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null,
};

vi.mock('../../../hooks/usePlans', () => ({
  useDeletePlan: () => mockDeletePlanReturn,
}));

const mockPlan: Plan = {
  id: 1,
  name: 'Push Pull Legs',
  duration_weeks: 6,
  created_at: '2024-01-15T10:00:00.000Z',
  updated_at: '2024-01-15T10:00:00.000Z',
};

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Theme>{ui}</Theme>
    </QueryClientProvider>
  );
}

describe('DeletePlanDialog', () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockDeletePlanReturn.isPending = false;
    mockDeletePlanReturn.isError = false;
    mockDeletePlanReturn.error = null;
  });

  it('should not render when plan is null', () => {
    renderWithProviders(<DeletePlanDialog plan={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId('delete-confirm-dialog')).not.toBeInTheDocument();
  });

  it('should render when plan is provided', () => {
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument();
  });

  it('should display plan name in confirmation message', () => {
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByText('Push Pull Legs')).toBeInTheDocument();
  });

  it('should show Delete button', () => {
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('confirm-delete-button')).toBeInTheDocument();
  });

  it('should show Cancel button', () => {
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('should call mutate when Delete is clicked', () => {
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('confirm-delete-button'));
    expect(mockMutate).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('should show loading state when deleting', () => {
    mockDeletePlanReturn.isPending = true;
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('confirm-delete-button')).toHaveTextContent('Deleting...');
    expect(screen.getByTestId('confirm-delete-button')).toBeDisabled();
  });

  it('should show error message when deletion fails', () => {
    mockDeletePlanReturn.isError = true;
    mockDeletePlanReturn.error = { message: 'Failed to delete' };
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('delete-error')).toHaveTextContent('Failed to delete');
  });

  it('should show conflict error message when plan has active mesocycle', () => {
    mockDeletePlanReturn.isError = true;
    mockDeletePlanReturn.error = new ConflictError('Plan has active mesocycle');
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('delete-error')).toHaveTextContent(
      'Cannot delete plan with an active mesocycle'
    );
  });

  it('should disable delete button when conflict error', () => {
    mockDeletePlanReturn.isError = true;
    mockDeletePlanReturn.error = new ConflictError('Plan has active mesocycle');
    renderWithProviders(<DeletePlanDialog plan={mockPlan} onClose={vi.fn()} />);
    expect(screen.getByTestId('confirm-delete-button')).toBeDisabled();
  });
});
