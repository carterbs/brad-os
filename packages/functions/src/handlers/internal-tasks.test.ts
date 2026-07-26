import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getRequestEnvironment } from '../runtime/environment-context.js';

const mockTaskService = vi.hoisted(() => ({
  verifyStravaTaskAuthorization: vi.fn(),
  getStravaTaskStore: vi.fn(),
}));

const mockProcessStravaActivityEvent = vi.hoisted(() => vi.fn());

vi.mock('../services/strava-task.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/strava-task.service.js')>();
  return {
    ...actual,
    verifyStravaTaskAuthorization:
      mockTaskService.verifyStravaTaskAuthorization,
    getStravaTaskStore: mockTaskService.getStravaTaskStore,
  };
});

vi.mock('./strava-webhook.js', () => ({
  processStravaActivityEvent: mockProcessStravaActivityEvent,
}));

import { internalTasksApp } from './internal-tasks.js';
import {
  deriveStravaEventId,
  StravaTaskAuthenticationError,
} from '../services/strava-task.service.js';

const event = {
  aspect_type: 'create' as const,
  event_time: 1705320000,
  object_id: 999,
  object_type: 'activity' as const,
  owner_id: 12345,
  subscription_id: 1,
};

describe('internal task handler', () => {
  const store = {
    claim: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskService.verifyStravaTaskAuthorization.mockResolvedValue({
      email: 'brad-os-strava-tasks@brad-os.iam.gserviceaccount.com',
    });
    mockTaskService.getStravaTaskStore.mockReturnValue(store);
    store.claim.mockResolvedValue({
      status: 'claimed',
      claimToken: 'claim-1',
    });
    store.complete.mockResolvedValue(undefined);
    store.fail.mockResolvedValue(undefined);
    mockProcessStravaActivityEvent.mockResolvedValue(undefined);
  });

  it('rejects requests without the exact authenticated task identity', async () => {
    mockTaskService.verifyStravaTaskAuthorization.mockRejectedValue(
      new StravaTaskAuthenticationError(
        'Missing task identity token',
        'TASK_AUTH_MISSING',
        401
      )
    );

    const response = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TASK_AUTH_MISSING');
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects unknown environments before any namespace is selected', async () => {
    const response = await request(internalTasksApp)
      .post('/staging/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('TASK_ROUTE_NOT_FOUND');
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads and event ID tampering', async () => {
    const invalid = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({ invalid: true });

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('TASK_PAYLOAD_INVALID');

    const tampered = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({
        eventId: `strava-prod-${'0'.repeat(64)}`,
        event,
      });

    expect(tampered.status).toBe(400);
    expect(tampered.body.error.code).toBe('TASK_EVENT_ID_INVALID');
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('processes and completes all work inside the fixed path environment', async () => {
    mockProcessStravaActivityEvent.mockImplementation(async () => {
      expect(getRequestEnvironment()).toBe('dev');
    });
    const eventId = deriveStravaEventId('dev', event);

    const response = await request(internalTasksApp)
      .post('/dev/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({ eventId, event });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      eventId,
      status: 'completed',
    });
    expect(store.claim).toHaveBeenCalledWith({ eventId, event });
    expect(mockProcessStravaActivityEvent).toHaveBeenCalledWith(event);
    expect(store.complete).toHaveBeenCalledWith(eventId, 'claim-1');
    expect(store.claim.mock.invocationCallOrder[0]).toBeLessThan(
      mockProcessStravaActivityEvent.mock.invocationCallOrder[0] ?? 0
    );
    expect(
      mockProcessStravaActivityEvent.mock.invocationCallOrder[0]
    ).toBeLessThan(store.complete.mock.invocationCallOrder[0] ?? 0);
  });

  it('returns success without repeating a completed event', async () => {
    store.claim.mockResolvedValue({ status: 'completed' });
    const eventId = deriveStravaEventId('prod', event);

    const response = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({ eventId, event });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('duplicate');
    expect(mockProcessStravaActivityEvent).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('returns a retryable response while another lease is active', async () => {
    store.claim.mockResolvedValue({ status: 'in_progress' });
    const eventId = deriveStravaEventId('prod', event);

    const response = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({ eventId, event });

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('10');
    expect(response.body.error.code).toBe('TASK_ALREADY_PROCESSING');
  });

  it('records failure and returns 500 so Cloud Tasks retries', async () => {
    mockProcessStravaActivityEvent.mockRejectedValue(
      new Error('Strava temporarily unavailable')
    );
    const eventId = deriveStravaEventId('prod', event);

    const response = await request(internalTasksApp)
      .post('/prod/strava-activity')
      .set('Authorization', 'Bearer signed-token')
      .send({ eventId, event });

    expect(response.status).toBe(500);
    expect(store.fail).toHaveBeenCalledWith(
      eventId,
      'claim-1',
      expect.objectContaining({ message: 'Strava temporarily unavailable' })
    );
    expect(store.complete).not.toHaveBeenCalled();
  });
});
