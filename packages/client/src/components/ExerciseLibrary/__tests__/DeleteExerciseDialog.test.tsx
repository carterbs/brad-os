import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise } from '@brad-os/shared';
import { DeleteExerciseDialog } from '../DeleteExerciseDialog';

const mockExercise: Exercise = {
  id: 2,
  name: 'Custom Squat',
  weight_increment: 10,
  is_custom: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const handlers = [
  http.delete('/api/exercises/:id', () => {
    return new HttpResponse(null, { status: 204 });
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

describe('DeleteExerciseDialog', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should render confirmation message with exercise name', () => {
    renderWithProviders(
      <DeleteExerciseDialog exercise={mockExercise} onClose={() => {}} />
    );

    expect(screen.getByText(/Delete Exercise/i)).toBeInTheDocument();
    expect(screen.getByText(/Custom Squat/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('should close dialog on cancel', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <DeleteExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('should call onConfirm when delete confirmed', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <DeleteExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('should show loading state during deletion', async () => {
    // Use a delayed handler to make loading state visible
    server.use(
      http.delete('/api/exercises/:id', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithProviders(
      <DeleteExerciseDialog exercise={mockExercise} onClose={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/Deleting/i)).toBeInTheDocument();
    });
  });

  it('should not render when exercise is null', () => {
    renderWithProviders(
      <DeleteExerciseDialog exercise={null} onClose={() => {}} />
    );

    expect(screen.queryByText(/Delete Exercise/i)).not.toBeInTheDocument();
  });

  it('should show error message on deletion failure', async () => {
    server.use(
      http.delete('/api/exercises/:id', () => {
        return HttpResponse.json(
          { success: false, error: { code: 'CONFLICT', message: 'Cannot delete exercise that is used in a plan' } },
          { status: 409 }
        );
      })
    );

    const onClose = vi.fn();
    renderWithProviders(
      <DeleteExerciseDialog exercise={mockExercise} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));

    await waitFor(() => {
      expect(screen.getByText(/Cannot delete exercise that is used in a plan/i)).toBeInTheDocument();
    });

    expect(onClose).not.toHaveBeenCalled();
  });
});
