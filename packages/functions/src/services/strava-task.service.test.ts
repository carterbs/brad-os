import { describe, expect, it, vi } from 'vitest';
import type { CloudTasksClient } from '@google-cloud/tasks';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  LoginTicket,
  OAuth2Client,
  TokenPayload,
} from 'google-auth-library';
import { runWithEnvironment } from '../runtime/environment-context.js';
import type {
  StravaActivityTaskPayload,
  StravaTaskConfig,
  StravaWebhookEventInput,
} from '../shared.js';
import {
  buildStravaTaskRequest,
  deriveStravaEventId,
  enqueueStravaTaskWithClient,
  FirestoreStravaTaskStore,
  parseStravaTaskConfig,
  StravaTaskAuthenticationError,
  verifyStravaTaskAuthorizationWithClient,
} from './strava-task.service.js';

const config: StravaTaskConfig = {
  projectId: 'brad-os',
  queue: 'brad-os-strava',
  location: 'us-central1',
  cloudRunServiceUrl: 'https://brad-os-api-abc-uc.a.run.app',
  oidcAudience: 'https://brad-os-api-abc-uc.a.run.app',
  oidcServiceAccount: 'brad-os-strava-tasks@brad-os.iam.gserviceaccount.com',
};

const event: StravaWebhookEventInput = {
  aspect_type: 'create',
  event_time: 1705320000,
  object_id: 999,
  object_type: 'activity',
  owner_id: 12345,
  subscription_id: 1,
};

function createCloudTasksClient(
  createTask: ReturnType<typeof vi.fn> = vi.fn()
): CloudTasksClient {
  return {
    queuePath: vi.fn(
      (project: string, location: string, queue: string) =>
        `projects/${project}/locations/${location}/queues/${queue}`
    ),
    taskPath: vi.fn(
      (project: string, location: string, queue: string, task: string) =>
        `projects/${project}/locations/${location}/queues/${queue}/tasks/${task}`
    ),
    createTask,
  } as unknown as CloudTasksClient;
}

function createVerifier(
  payload: TokenPayload,
  rejection?: Error
): Pick<OAuth2Client, 'verifyIdToken'> {
  const ticket = {
    getPayload: () => payload,
  } as LoginTicket;
  return {
    verifyIdToken:
      rejection === undefined
        ? vi.fn().mockResolvedValue(ticket)
        : vi.fn().mockRejectedValue(rejection),
  } as unknown as Pick<OAuth2Client, 'verifyIdToken'>;
}

function validTokenPayload(): TokenPayload {
  return {
    iss: 'https://accounts.google.com',
    aud: config.oidcAudience,
    email: config.oidcServiceAccount,
    email_verified: true,
    sub: '1234567890',
    iat: 1,
    exp: 9999999999,
  };
}

interface InMemoryFirestore {
  firestore: Firestore;
  readRecord: () => Record<string, unknown> | undefined;
}

function createInMemoryFirestore(): InMemoryFirestore {
  let record: Record<string, unknown> | undefined;
  const reference = {};
  const transaction = {
    get: vi.fn(async () => ({
      exists: record !== undefined,
      data: () => record,
    })),
    set: vi.fn(
      (
        _reference: unknown,
        data: Record<string, unknown>,
        _options: { merge: boolean }
      ) => {
        record = { ...record, ...data };
      }
    ),
  };
  const firestore = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => reference),
    })),
    runTransaction: vi.fn(
      async (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction)
    ),
  } as unknown as Firestore;

  return {
    firestore,
    readRecord: () => record,
  };
}

describe('Strava task service', () => {
  it('requires every explicit task setting and normalizes URL slashes', () => {
    const parsed = parseStravaTaskConfig({
      GOOGLE_CLOUD_PROJECT: 'brad-os',
      STRAVA_TASK_QUEUE: 'brad-os-strava',
      STRAVA_TASK_QUEUE_LOCATION: 'us-central1',
      CLOUD_RUN_SERVICE_URL: 'https://service.run.app/',
      STRAVA_TASK_OIDC_AUDIENCE: 'https://service.run.app/',
      STRAVA_TASK_OIDC_SERVICE_ACCOUNT:
        'brad-os-strava-tasks@brad-os.iam.gserviceaccount.com',
    });

    expect(parsed.cloudRunServiceUrl).toBe('https://service.run.app');
    expect(parsed.oidcAudience).toBe('https://service.run.app');
    expect(() => parseStravaTaskConfig({})).toThrow();
  });

  it('derives stable namespace-specific IDs from every identity field', () => {
    const productionId = deriveStravaEventId('prod', event);

    expect(productionId).toMatch(/^strava-prod-[a-f0-9]{64}$/);
    expect(deriveStravaEventId('prod', { ...event })).toBe(productionId);
    expect(deriveStravaEventId('dev', event)).not.toBe(productionId);
    expect(
      deriveStravaEventId('prod', {
        ...event,
        event_time: event.event_time + 1,
      })
    ).not.toBe(productionId);
  });

  it('builds an environment-fixed task with exact OIDC settings', () => {
    const client = createCloudTasksClient();
    const request = buildStravaTaskRequest(client, config, 'prod', event);
    const encodedBody = request.task?.httpRequest?.body;
    const decodedBody =
      typeof encodedBody === 'string'
        ? JSON.parse(Buffer.from(encodedBody, 'base64').toString('utf8'))
        : undefined;

    expect(request.parent).toBe(
      'projects/brad-os/locations/us-central1/queues/brad-os-strava'
    );
    expect(request.task?.name).toContain('/tasks/strava-prod-');
    expect(request.task?.httpRequest?.url).toBe(
      'https://brad-os-api-abc-uc.a.run.app/internal/tasks/prod/strava-activity'
    );
    expect(request.task?.httpRequest?.oidcToken).toEqual({
      serviceAccountEmail:
        'brad-os-strava-tasks@brad-os.iam.gserviceaccount.com',
      audience: 'https://brad-os-api-abc-uc.a.run.app',
    });
    expect(decodedBody).toEqual({
      eventId: deriveStravaEventId('prod', event),
      event,
    });
  });

  it('acknowledges deterministic AlreadyExists without hiding other errors', async () => {
    const duplicateClient = createCloudTasksClient(
      vi.fn().mockRejectedValue({ code: 6 })
    );
    const duplicate = await enqueueStravaTaskWithClient(
      duplicateClient,
      config,
      'prod',
      event
    );

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.eventId).toBe(deriveStravaEventId('prod', event));

    const unavailableClient = createCloudTasksClient(
      vi.fn().mockRejectedValue(new Error('unavailable'))
    );
    await expect(
      enqueueStravaTaskWithClient(unavailableClient, config, 'prod', event)
    ).rejects.toThrow('unavailable');
  });

  it('verifies signature, issuer, audience, email, verification, and subject', async () => {
    const verifier = createVerifier(validTokenPayload());

    await expect(
      verifyStravaTaskAuthorizationWithClient(
        'Bearer signed-token',
        verifier,
        config
      )
    ).resolves.toEqual({
      issuer: 'https://accounts.google.com',
      audience: config.oidcAudience,
      email: config.oidcServiceAccount,
      subject: '1234567890',
    });
    expect(verifier.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-token',
      audience: config.oidcAudience,
    });
  });

  it.each([
    ['issuer', { iss: 'accounts.google.com' }],
    ['audience', { aud: 'https://other.run.app' }],
    ['email', { email: 'other@brad-os.iam.gserviceaccount.com' }],
    ['email verification', { email_verified: false }],
    ['subject', { sub: '' }],
  ])('rejects a token with the wrong exact %s', async (_label, override) => {
    const verifier = createVerifier({
      ...validTokenPayload(),
      ...override,
    });

    await expect(
      verifyStravaTaskAuthorizationWithClient(
        'Bearer signed-token',
        verifier,
        config
      )
    ).rejects.toMatchObject<Partial<StravaTaskAuthenticationError>>({
      code: 'TASK_AUTH_FORBIDDEN',
      statusCode: 403,
    });
  });

  it('rejects missing, malformed, and cryptographically invalid tokens', async () => {
    const verifier = createVerifier(
      validTokenPayload(),
      new Error('bad signature')
    );

    await expect(
      verifyStravaTaskAuthorizationWithClient(undefined, verifier, config)
    ).rejects.toMatchObject({ code: 'TASK_AUTH_MISSING' });
    await expect(
      verifyStravaTaskAuthorizationWithClient(
        'bearer wrong-case',
        verifier,
        config
      )
    ).rejects.toMatchObject({ code: 'TASK_AUTH_INVALID' });
    await expect(
      verifyStravaTaskAuthorizationWithClient(
        'Bearer signed-token',
        verifier,
        config
      )
    ).rejects.toMatchObject({ code: 'TASK_AUTH_INVALID' });
  });

  it('claims, leases, completes, and deduplicates in Firestore', async () => {
    const memory = createInMemoryFirestore();
    let nowMs = 1_700_000_000_000;
    const store = new FirestoreStravaTaskStore({
      firestore: memory.firestore,
      collectionName: () => 'dev_strava_webhook_events',
      now: () => nowMs,
      createClaimToken: () => 'claim-1',
    });
    const payload: StravaActivityTaskPayload = {
      eventId: deriveStravaEventId('dev', event),
      event: {
        ...event,
        object_type: 'activity',
      },
    };

    const claim = await runWithEnvironment('dev', () => store.claim(payload));
    expect(claim).toEqual({ status: 'claimed', claimToken: 'claim-1' });
    expect(memory.readRecord()).toMatchObject({
      environment: 'dev',
      status: 'processing',
      attempts: 1,
    });

    nowMs += 1_000;
    await expect(
      runWithEnvironment('dev', () => store.claim(payload))
    ).resolves.toEqual({ status: 'in_progress' });

    await runWithEnvironment('dev', () =>
      store.complete(payload.eventId, 'claim-1')
    );
    expect(memory.readRecord()).toMatchObject({ status: 'completed' });
    await expect(
      runWithEnvironment('dev', () => store.claim(payload))
    ).resolves.toEqual({ status: 'completed' });
  });

  it('reclaims a hard-crashed lease before five queue attempts are exhausted', async () => {
    const memory = createInMemoryFirestore();
    const startedAtMs = 1_700_000_000_000;
    let nowMs = startedAtMs;
    const claimTokens = ['crashed-claim', 'recovery-claim'];
    const store = new FirestoreStravaTaskStore({
      firestore: memory.firestore,
      collectionName: () => 'dev_strava_webhook_events',
      now: () => nowMs,
      createClaimToken: () => claimTokens.shift() ?? 'unexpected',
    });
    const payload: StravaActivityTaskPayload = {
      eventId: deriveStravaEventId('dev', event),
      event: {
        ...event,
        object_type: 'activity',
      },
    };

    const queueAttemptOffsetsMs = [0, 10_000, 30_000, 70_000, 150_000];
    const outcomes: string[] = [];
    for (const offsetMs of queueAttemptOffsetsMs) {
      nowMs = startedAtMs + offsetMs;
      const outcome = await runWithEnvironment('dev', () =>
        store.claim(payload)
      );
      outcomes.push(outcome.status);
      if (offsetMs > 0 && outcome.status === 'claimed') {
        break;
      }
    }

    expect(outcomes).toEqual([
      'claimed',
      'in_progress',
      'in_progress',
      'claimed',
    ]);
    expect(memory.readRecord()).toMatchObject({
      attempts: 2,
      claimToken: 'recovery-claim',
      leaseExpiresAtMs: startedAtMs + 130_000,
    });
  });

  it('records a bounded failure and permits a retry claim', async () => {
    const memory = createInMemoryFirestore();
    const claimTokens = ['claim-1', 'claim-2'];
    const store = new FirestoreStravaTaskStore({
      firestore: memory.firestore,
      collectionName: () => 'strava_webhook_events',
      now: () => 1_700_000_000_000,
      createClaimToken: () => claimTokens.shift() ?? 'unexpected',
    });
    const payload: StravaActivityTaskPayload = {
      eventId: deriveStravaEventId('prod', event),
      event: {
        ...event,
        object_type: 'activity',
      },
    };

    await runWithEnvironment('prod', async () => {
      await store.claim(payload);
      await store.fail(payload.eventId, 'claim-1', new Error('retry me'));
    });
    expect(memory.readRecord()).toMatchObject({
      status: 'failed',
      lastError: 'retry me',
    });

    await expect(
      runWithEnvironment('prod', () => store.claim(payload))
    ).resolves.toEqual({ status: 'claimed', claimToken: 'claim-2' });
    expect(memory.readRecord()).toMatchObject({ attempts: 2 });
  });
});
