import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Exercise, ApiResponse } from '@brad-os/shared';
import { App } from './App';

const mockExercises: Exercise[] = [
  {
    id: 1,
    name: 'Bench Press',
    weight_increment: 5,
    is_custom: false,
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
  http.get('/api/workouts/today', () => {
    // Return null/no workout scheduled for today
    const response: ApiResponse<null> = {
      success: true,
      data: null,
    };
    return HttpResponse.json(response);
  }),
  http.get('/api/stretch-sessions/latest', () => {
    const response: ApiResponse<null> = {
      success: true,
      data: null,
    };
    return HttpResponse.json(response);
  }),
  http.get('/api/meditation-sessions/latest', () => {
    const response: ApiResponse<null> = {
      success: true,
      data: null,
    };
    return HttpResponse.json(response);
  }),
];

const server = setupServer(...handlers);

describe('App', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => server.resetHandlers());

  it('should render the app with global navigation', () => {
    render(
      <Theme>
        <App />
      </Theme>
    );

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    // Global nav has: Today, Activities, History, Profile
    expect(screen.getByRole('link', { name: /Today/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Activities/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /History/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Profile/i })).toBeInTheDocument();
  });

  it('should show Today Dashboard by default', async () => {
    render(
      <Theme>
        <App />
      </Theme>
    );

    // Wait for the heading to appear after query completes
    const heading = await screen.findByRole('heading', { name: 'Today' });
    expect(heading).toBeInTheDocument();
  });
});
