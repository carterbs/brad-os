import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import type { Exercise, ApiResponse, ApiError } from '@lifting/shared';
import { AddExerciseForm } from '../AddExerciseForm';

const handlers = [
  http.post('/api/exercises', async ({ request }) => {
    const body = await request.json() as { name: string; weight_increment?: number };
    const response: ApiResponse<Exercise> = {
      success: true,
      data: {
        id: 1,
        name: body.name,
        weight_increment: body.weight_increment ?? 5,
        is_custom: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    };
    return HttpResponse.json(response, { status: 201 });
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

describe('AddExerciseForm', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should render name input field', () => {
    renderWithProviders(<AddExerciseForm />);
    expect(screen.getByLabelText(/Exercise Name/i)).toBeInTheDocument();
  });

  it('should render weight increment input with default value of 5', () => {
    renderWithProviders(<AddExerciseForm />);
    const input = screen.getByLabelText(/Weight Increment/i);
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('5');
  });

  it('should render submit button', () => {
    renderWithProviders(<AddExerciseForm />);
    expect(screen.getByRole('button', { name: /Add Exercise/i })).toBeInTheDocument();
  });

  it('should disable submit when name is empty', () => {
    renderWithProviders(<AddExerciseForm />);
    const button = screen.getByRole('button', { name: /Add Exercise/i });
    expect(button).toBeDisabled();
  });

  it('should show validation error for empty name on blur', async () => {
    renderWithProviders(<AddExerciseForm />);
    const input = screen.getByLabelText(/Exercise Name/i);

    await userEvent.click(input);
    await userEvent.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText(/Exercise name is required/i)).toBeInTheDocument();
    });
  });

  it('should call onSubmit with form data', async () => {
    renderWithProviders(<AddExerciseForm />);

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    await userEvent.type(nameInput, 'New Exercise');

    const button = screen.getByRole('button', { name: /Add Exercise/i });
    fireEvent.click(button);

    await waitFor(() => {
      // Form should reset after successful submission
      expect((nameInput as HTMLInputElement).value).toBe('');
    });
  });

  it('should reset form after successful submission', async () => {
    renderWithProviders(<AddExerciseForm />);

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    const incrementInput = screen.getByLabelText(/Weight Increment/i);

    await userEvent.type(nameInput, 'New Exercise');
    await userEvent.clear(incrementInput);
    await userEvent.type(incrementInput, '10');

    const button = screen.getByRole('button', { name: /Add Exercise/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect((nameInput as HTMLInputElement).value).toBe('');
      expect((incrementInput as HTMLInputElement).value).toBe('5');
    });
  });

  it('should show loading state during submission', async () => {
    renderWithProviders(<AddExerciseForm />);

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    await userEvent.type(nameInput, 'New Exercise');

    const button = screen.getByRole('button', { name: /Add Exercise/i });
    fireEvent.click(button);

    // Button text should change during submission
    expect(screen.getByRole('button')).toHaveTextContent(/Adding/i);
  });

  it('should show error message on submission failure', async () => {
    server.use(
      http.post('/api/exercises', () => {
        const response: ApiError = {
          success: false,
          error: { code: 'CONFLICT', message: 'Exercise already exists' },
        };
        return HttpResponse.json(response, { status: 409 });
      })
    );

    renderWithProviders(<AddExerciseForm />);

    const nameInput = screen.getByLabelText(/Exercise Name/i);
    await userEvent.type(nameInput, 'New Exercise');

    const button = screen.getByRole('button', { name: /Add Exercise/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Exercise already exists/i)).toBeInTheDocument();
    });
  });
});
