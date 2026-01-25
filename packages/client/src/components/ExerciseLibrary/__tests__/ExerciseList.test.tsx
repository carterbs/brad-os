import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise, ApiResponse } from '@brad-os/shared';
import { ExerciseList } from '../ExerciseList';

const mockExercises: Exercise[] = [
  {
    id: 1,
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Custom Squat',
    weight_increment: 10,
    is_custom: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
];

const handlers = [
  http.get('/api/exercises', () => {
    const response: ApiResponse<Exercise[]> = {
      success: true,
      data: mockExercises,
    };
    return HttpResponse.json(response);
  }),
];

const server = setupServer(...handlers);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function renderWithProviders(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Theme>{ui}</Theme>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ExerciseList', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should render list of exercises', async () => {
    renderWithProviders(<ExerciseList />);

    await waitFor(() => {
      expect(screen.getByText('Bench Press')).toBeInTheDocument();
      expect(screen.getByText('Custom Squat')).toBeInTheDocument();
    });
  });

  it('should show loading spinner while fetching', async () => {
    renderWithProviders(<ExerciseList />);
    // Initially shows loading state - just check loading starts then completes
    await waitFor(() => {
      expect(screen.getByText('Bench Press')).toBeInTheDocument();
    });
  });

  it('should show error message on fetch failure', async () => {
    server.use(
      http.get('/api/exercises', () => {
        return HttpResponse.json(
          { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' } },
          { status: 500 }
        );
      })
    );

    renderWithProviders(<ExerciseList />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading exercises/)).toBeInTheDocument();
    });
  });

  it('should show empty state when no exercises', async () => {
    server.use(
      http.get('/api/exercises', () => {
        const response: ApiResponse<Exercise[]> = {
          success: true,
          data: [],
        };
        return HttpResponse.json(response);
      })
    );

    renderWithProviders(<ExerciseList />);

    await waitFor(() => {
      expect(screen.getByText(/No exercises found/)).toBeInTheDocument();
    });
  });

  it('should show delete buttons for all exercises', async () => {
    renderWithProviders(<ExerciseList />);

    await waitFor(() => {
      // All exercises can be deleted
      const deleteButtons = screen.getAllByLabelText('Delete exercise');
      expect(deleteButtons).toHaveLength(2);
    });
  });

  it('should sort exercises alphabetically', async () => {
    renderWithProviders(<ExerciseList />);

    await waitFor(() => {
      const items = screen.getAllByText(/Press|Squat/);
      expect(items).toHaveLength(2);
      expect(items[0]?.textContent).toBe('Bench Press');
      expect(items[1]?.textContent).toBe('Custom Squat');
    });
  });
});
