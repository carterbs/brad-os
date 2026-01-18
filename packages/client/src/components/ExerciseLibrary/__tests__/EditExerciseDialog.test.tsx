import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise, ApiResponse } from '@lifting/shared';
import { EditExerciseDialog } from '../EditExerciseDialog';

const mockExercise: Exercise = {
  id: 2,
  name: 'Custom Squat',
  weight_increment: 10,
  is_custom: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const handlers = [
  http.put('/api/exercises/:id', async ({ params, request }) => {
    const id = Number(params['id']);
    const body = await request.json() as { name?: string; weight_increment?: number };
    const response: ApiResponse<Exercise> = {
      success: true,
      data: { ...mockExercise, id, ...body },
    };
    return HttpResponse.json(response);
  }),
];

const server = setupServer(...handlers);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Theme>{ui}</Theme>
    </QueryClientProvider>
  );
}

describe('EditExerciseDialog', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should render dialog with exercise data pre-filled', () => {
    renderWithProviders(
      <EditExerciseDialog exercise={mockExercise} onClose={() => {}} />
    );

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    const incrementInput = screen.getByLabelText(/Weight Increment/i);

    expect((nameInput as HTMLInputElement).value).toBe('Custom Squat');
    expect((incrementInput as HTMLInputElement).value).toBe('10');
  });

  it('should close dialog on cancel', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EditExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onSave with updated data', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EditExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should validate inputs before submission', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EditExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    fireEvent.change(nameInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText(/Exercise name is required/i)).toBeInTheDocument();
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('should show loading state during save', async () => {
    // Use a delayed handler to make loading state visible
    server.use(
      http.put('/api/exercises/:id', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const response: ApiResponse<Exercise> = {
          success: true,
          data: mockExercise,
        };
        return HttpResponse.json(response);
      })
    );

    renderWithProviders(
      <EditExerciseDialog exercise={mockExercise} onClose={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() => {
      expect(screen.getByText(/Saving/i)).toBeInTheDocument();
    });
  });

  it('should not render when exercise is null', () => {
    renderWithProviders(
      <EditExerciseDialog exercise={null} onClose={() => {}} />
    );

    // Dialog should not be visible
    expect(screen.queryByText(/Edit Exercise/i)).not.toBeInTheDocument();
  });
});
