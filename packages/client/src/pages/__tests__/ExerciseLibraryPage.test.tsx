import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise, ApiResponse } from '@brad-os/shared';
import { ExerciseLibraryPage } from '../ExerciseLibraryPage';

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

let exercisesDb = [...mockExercises];

const handlers = [
  http.get('/api/exercises', () => {
    const response: ApiResponse<Exercise[]> = {
      success: true,
      data: exercisesDb,
    };
    return HttpResponse.json(response);
  }),

  http.post('/api/exercises', async ({ request }) => {
    const body = await request.json() as { name: string; weight_increment?: number };
    const newExercise: Exercise = {
      id: exercisesDb.length + 1,
      name: body.name,
      weight_increment: body.weight_increment ?? 5,
      is_custom: true,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    };
    exercisesDb.push(newExercise);
    const response: ApiResponse<Exercise> = {
      success: true,
      data: newExercise,
    };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.put('/api/exercises/:id', async ({ params, request }) => {
    const id = Number(params['id']);
    const body = await request.json() as { name?: string; weight_increment?: number };
    const index = exercisesDb.findIndex((e) => e.id === id);
    if (index !== -1) {
      const existing = exercisesDb[index];
      if (existing) {
        const updated: Exercise = {
          ...existing,
          name: body.name ?? existing.name,
          weight_increment: body.weight_increment ?? existing.weight_increment,
        };
        exercisesDb[index] = updated;
        const response: ApiResponse<Exercise> = {
          success: true,
          data: updated,
        };
        return HttpResponse.json(response);
      }
    }
    return HttpResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }),

  http.delete('/api/exercises/:id', ({ params }) => {
    const id = Number(params['id']);
    exercisesDb = exercisesDb.filter((e) => e.id !== id);
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Theme>{ui}</Theme>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ExerciseLibraryPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    exercisesDb = [...mockExercises];
  });
  afterEach(() => {
    server.resetHandlers();
  });

  it('should render page title', () => {
    renderWithProviders(<ExerciseLibraryPage />);
    expect(screen.getByText('Exercise Library')).toBeInTheDocument();
  });

  it('should render add exercise form', () => {
    renderWithProviders(<ExerciseLibraryPage />);
    expect(screen.getByText('Add Custom Exercise')).toBeInTheDocument();
  });

  it('should render exercise list', async () => {
    renderWithProviders(<ExerciseLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Bench Press')).toBeInTheDocument();
      expect(screen.getByText('Custom Squat')).toBeInTheDocument();
    });
  });

  it('should open delete dialog when delete clicked', async () => {
    renderWithProviders(<ExerciseLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Custom Squat')).toBeInTheDocument();
    });

    // Find the delete button within a specific exercise item
    const customSquatItem = screen.getByText('Custom Squat').closest('[data-testid="exercise-item"]');
    if (!customSquatItem) throw new Error('Exercise item not found');
    const deleteButton = customSquatItem.querySelector('[aria-label="Delete exercise"]');
    if (!deleteButton) throw new Error('Delete button not found');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Delete Exercise')).toBeInTheDocument();
    });
  });

  it('should update list after adding exercise', async () => {
    renderWithProviders(<ExerciseLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Bench Press')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    await userEvent.type(nameInput, 'New Exercise');

    const addButton = screen.getByRole('button', { name: /Add Exercise/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('New Exercise')).toBeInTheDocument();
    });
  });

  it('should update list after deleting exercise', async () => {
    renderWithProviders(<ExerciseLibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Custom Squat')).toBeInTheDocument();
    });

    // Find the delete button within the Custom Squat exercise item (only custom exercises have delete)
    const customSquatItem = screen.getByText('Custom Squat').closest('[data-testid="exercise-item"]');
    if (!customSquatItem) throw new Error('Exercise item not found');
    const deleteButton = customSquatItem.querySelector('[aria-label="Delete exercise"]');
    if (!deleteButton) throw new Error('Delete button not found');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText('Delete Exercise')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Custom Squat')).not.toBeInTheDocument();
    });
  });
});
