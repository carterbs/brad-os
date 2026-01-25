import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise, ExerciseHistory, ApiResponse } from '@brad-os/shared';
import {
  useExercises,
  useExercise,
  useExerciseHistory,
  useCreateExercise,
  useUpdateExercise,
  useDeleteExercise,
} from '../useExercises';

const mockExercise: Exercise = {
  id: 1,
  name: 'Bench Press',
  weight_increment: 5,
  is_custom: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockCustomExercise: Exercise = {
  id: 2,
  name: 'Custom Squat',
  weight_increment: 10,
  is_custom: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockExerciseHistory: ExerciseHistory = {
  exercise_id: 1,
  exercise_name: 'Bench Press',
  entries: [
    {
      workout_id: 10,
      date: '2024-01-15',
      week_number: 1,
      mesocycle_id: 1,
      sets: [
        { set_number: 1, weight: 135, reps: 8 },
        { set_number: 2, weight: 135, reps: 7 },
      ],
      best_weight: 135,
      best_set_reps: 8,
    },
    {
      workout_id: 20,
      date: '2024-01-22',
      week_number: 2,
      mesocycle_id: 1,
      sets: [
        { set_number: 1, weight: 140, reps: 8 },
        { set_number: 2, weight: 140, reps: 7 },
      ],
      best_weight: 140,
      best_set_reps: 8,
    },
  ],
  personal_record: {
    weight: 140,
    reps: 8,
    date: '2024-01-22',
  },
};

const handlers = [
  http.get('/api/exercises', () => {
    const response: ApiResponse<Exercise[]> = {
      success: true,
      data: [mockExercise, mockCustomExercise],
    };
    return HttpResponse.json(response);
  }),

  http.get('/api/exercises/:id/history', ({ params }) => {
    const id = Number(params['id']);
    if (id === 1) {
      const response: ApiResponse<ExerciseHistory> = {
        success: true,
        data: mockExerciseHistory,
      };
      return HttpResponse.json(response);
    }
    return HttpResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    );
  }),

  http.get('/api/exercises/:id', ({ params }) => {
    const id = Number(params['id']);
    if (id === 1) {
      const response: ApiResponse<Exercise> = {
        success: true,
        data: mockExercise,
      };
      return HttpResponse.json(response);
    }
    return HttpResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    );
  }),

  http.post('/api/exercises', async ({ request }) => {
    const body = await request.json() as { name: string; weight_increment?: number };
    const response: ApiResponse<Exercise> = {
      success: true,
      data: {
        id: 3,
        name: body.name,
        weight_increment: body.weight_increment ?? 5,
        is_custom: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.put('/api/exercises/:id', async ({ params, request }) => {
    const id = Number(params['id']);
    const body = await request.json() as { name?: string; weight_increment?: number };
    const response: ApiResponse<Exercise> = {
      success: true,
      data: { ...mockExercise, id, ...body },
    };
    return HttpResponse.json(response);
  }),

  http.delete('/api/exercises/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];

const server = setupServer(...handlers);

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function createWrapper(): ({ children }: { children: ReactNode }) => JSX.Element {
  const queryClient = createTestQueryClient();
  const TestWrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  TestWrapper.displayName = 'TestWrapper';
  return TestWrapper;
}

describe('useExercises', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch and return exercises', async () => {
    const { result } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.name).toBe('Bench Press');
  });

  it('should set loading state while fetching', async () => {
    const { result } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isLoading).toBe(false);
  });

  it('should handle errors', async () => {
    server.use(
      http.get('/api/exercises', () => {
        return HttpResponse.json(
          { success: false, error: { code: 'SERVER_ERROR', message: 'Server error' } },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useExercises(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});

describe('useExercise', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch single exercise by id', async () => {
    const { result } = renderHook(() => useExercise(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.name).toBe('Bench Press');
    expect(result.current.data?.id).toBe(1);
  });
});

describe('useCreateExercise', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should create exercise and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateExercise(), { wrapper });

    result.current.mutate({ name: 'New Exercise', weight_increment: 5 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.name).toBe('New Exercise');
    expect(result.current.data?.is_custom).toBe(true);
  });
});

describe('useUpdateExercise', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should update exercise and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateExercise(), { wrapper });

    result.current.mutate({ id: 1, data: { name: 'Updated Name' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.name).toBe('Updated Name');
  });
});

describe('useDeleteExercise', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should delete exercise and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteExercise(), { wrapper });

    result.current.mutate(2);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useExerciseHistory', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should return loading state initially', () => {
    const { result } = renderHook(() => useExerciseHistory(1), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('should return data on success', async () => {
    const { result } = renderHook(() => useExerciseHistory(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.exercise_id).toBe(1);
    expect(result.current.data?.exercise_name).toBe('Bench Press');
    expect(result.current.data?.entries).toHaveLength(2);
    expect(result.current.data?.personal_record?.weight).toBe(140);
  });

  it('should not fetch when id is 0', () => {
    const { result } = renderHook(() => useExerciseHistory(0), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('should return error state on API failure', async () => {
    server.use(
      http.get('/api/exercises/:id/history', () => {
        return HttpResponse.json(
          { success: false, error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useExerciseHistory(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});
