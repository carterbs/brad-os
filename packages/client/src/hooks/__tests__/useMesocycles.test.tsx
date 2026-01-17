import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Mesocycle, MesocycleWithDetails, ApiResponse } from '@lifting/shared';
import {
  useMesocycles,
  useActiveMesocycle,
  useMesocycle,
  useCreateMesocycle,
  useCompleteMesocycle,
  useCancelMesocycle,
} from '../useMesocycles';

const mockMesocycle: Mesocycle = {
  id: 1,
  plan_id: 1,
  start_date: '2024-01-01',
  current_week: 1,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockMesocycleWithDetails: MesocycleWithDetails = {
  ...mockMesocycle,
  plan_name: 'Test Plan',
  weeks: [
    {
      week_number: 1,
      is_deload: false,
      workouts: [],
      total_workouts: 2,
      completed_workouts: 0,
      skipped_workouts: 0,
    },
  ],
  total_workouts: 14,
  completed_workouts: 0,
};

const handlers = [
  http.get('/api/mesocycles', () => {
    const response: ApiResponse<Mesocycle[]> = {
      success: true,
      data: [mockMesocycle],
    };
    return HttpResponse.json(response);
  }),

  http.get('/api/mesocycles/active', () => {
    const response: ApiResponse<MesocycleWithDetails | null> = {
      success: true,
      data: mockMesocycleWithDetails,
    };
    return HttpResponse.json(response);
  }),

  http.get('/api/mesocycles/:id', ({ params }) => {
    const id = Number(params['id']);
    if (id === 1) {
      const response: ApiResponse<MesocycleWithDetails> = {
        success: true,
        data: mockMesocycleWithDetails,
      };
      return HttpResponse.json(response);
    }
    return HttpResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    );
  }),

  http.post('/api/mesocycles', async ({ request }) => {
    const body = (await request.json()) as { plan_id: number; start_date: string };
    const response: ApiResponse<Mesocycle> = {
      success: true,
      data: {
        id: 2,
        plan_id: body.plan_id,
        start_date: body.start_date,
        current_week: 1,
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.put('/api/mesocycles/:id/complete', ({ params }) => {
    const id = Number(params['id']);
    const response: ApiResponse<Mesocycle> = {
      success: true,
      data: { ...mockMesocycle, id, status: 'completed' },
    };
    return HttpResponse.json(response);
  }),

  http.put('/api/mesocycles/:id/cancel', ({ params }) => {
    const id = Number(params['id']);
    const response: ApiResponse<Mesocycle> = {
      success: true,
      data: { ...mockMesocycle, id, status: 'cancelled' },
    };
    return HttpResponse.json(response);
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

function createWrapper(): ({
  children,
}: {
  children: ReactNode;
}) => JSX.Element {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMesocycles', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch and return mesocycles', async () => {
    const { result } = renderHook(() => useMesocycles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.id).toBe(1);
  });

  it('should set loading state while fetching', async () => {
    const { result } = renderHook(() => useMesocycles(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.isLoading).toBe(false);
  });

  it('should handle empty list', async () => {
    server.use(
      http.get('/api/mesocycles', () => {
        const response: ApiResponse<Mesocycle[]> = {
          success: true,
          data: [],
        };
        return HttpResponse.json(response);
      })
    );

    const { result } = renderHook(() => useMesocycles(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});

describe('useActiveMesocycle', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch active mesocycle with details', async () => {
    const { result } = renderHook(() => useActiveMesocycle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe(1);
    expect(result.current.data?.plan_name).toBe('Test Plan');
    expect(result.current.data?.weeks).toHaveLength(1);
  });

  it('should handle no active mesocycle', async () => {
    server.use(
      http.get('/api/mesocycles/active', () => {
        const response: ApiResponse<MesocycleWithDetails | null> = {
          success: true,
          data: null,
        };
        return HttpResponse.json(response);
      })
    );

    const { result } = renderHook(() => useActiveMesocycle(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });
});

describe('useMesocycle', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should fetch single mesocycle by id', async () => {
    const { result } = renderHook(() => useMesocycle(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.id).toBe(1);
    expect(result.current.data?.plan_name).toBe('Test Plan');
  });

  it('should not fetch when id is 0', async () => {
    const { result } = renderHook(() => useMesocycle(0), {
      wrapper: createWrapper(),
    });

    // Query should not be enabled
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('should handle not found error', async () => {
    const { result } = renderHook(() => useMesocycle(999), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});

describe('useCreateMesocycle', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should create mesocycle and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateMesocycle(), { wrapper });

    result.current.mutate({ plan_id: 1, start_date: '2024-03-01' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.plan_id).toBe(1);
    expect(result.current.data?.start_date).toBe('2024-03-01');
    expect(result.current.data?.status).toBe('active');
  });

  it('should handle conflict error', async () => {
    server.use(
      http.post('/api/mesocycles', () => {
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'CONFLICT',
              message: 'An active mesocycle already exists',
            },
          },
          { status: 409 }
        );
      })
    );

    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateMesocycle(), { wrapper });

    result.current.mutate({ plan_id: 1, start_date: '2024-03-01' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe(
      'An active mesocycle already exists'
    );
  });
});

describe('useCompleteMesocycle', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should complete mesocycle and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCompleteMesocycle(), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('completed');
  });
});

describe('useCancelMesocycle', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should cancel mesocycle and invalidate cache', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCancelMesocycle(), { wrapper });

    result.current.mutate(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.status).toBe('cancelled');
  });
});
