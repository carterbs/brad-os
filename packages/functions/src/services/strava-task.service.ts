import { createHash, randomUUID } from 'node:crypto';
import { CloudTasksClient, protos } from '@google-cloud/tasks';
import {
  OAuth2Client,
  type LoginTicket,
  type TokenPayload,
} from 'google-auth-library';
import type { Firestore } from 'firebase-admin/firestore';
import { getCollectionName, getFirestoreDb } from '../firebase.js';
import {
  stravaTaskConfigSchema,
  type EnqueueStravaTaskResult,
  type StravaActivityTaskPayload,
  type StravaTaskClaimResult,
  type StravaTaskConfig,
  type StravaWebhookEventInput,
  type VerifiedStravaTaskIdentity,
} from '../shared.js';
import {
  getRequestEnvironment,
  type ApiEnvironment,
} from '../runtime/environment-context.js';
import { logger } from '../runtime/logger.js';

const TAG = '[Strava Task]';
const GOOGLE_OIDC_ISSUER = 'https://accounts.google.com';
const IDEMPOTENCY_COLLECTION = 'strava_webhook_events';
// The queue's five attempts begin at approximately 0s, 10s, 30s, 70s,
// and 150s. A one-minute lease keeps immediate duplicate deliveries out while
// allowing attempt four to recover a claim left behind by a hard process exit,
// with attempt five still available if the recovery attempt fails.
const CLAIM_LEASE_MS = 60 * 1000;
const ENQUEUE_DEADLINE_MS = 1_500;

export class StravaTaskAuthenticationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TASK_AUTH_MISSING'
      | 'TASK_AUTH_INVALID'
      | 'TASK_AUTH_FORBIDDEN',
    public readonly statusCode: 401 | 403
  ) {
    super(message);
    this.name = 'StravaTaskAuthenticationError';
  }
}

export class StravaTaskClaimLostError extends Error {
  constructor(eventId: string) {
    super(`Strava task claim was lost for event ${eventId}`);
    this.name = 'StravaTaskClaimLostError';
  }
}

/**
 * Read the task configuration without applying project or region defaults.
 * Cloud Run startup/deployment must provide every value explicitly.
 */
export function parseStravaTaskConfig(
  environment: NodeJS.ProcessEnv = process.env
): StravaTaskConfig {
  const parsed = stravaTaskConfigSchema.parse({
    projectId: environment['GOOGLE_CLOUD_PROJECT'],
    queue: environment['STRAVA_TASK_QUEUE'],
    location: environment['STRAVA_TASK_QUEUE_LOCATION'],
    cloudRunServiceUrl: environment['CLOUD_RUN_SERVICE_URL'],
    oidcAudience: environment['STRAVA_TASK_OIDC_AUDIENCE'],
    oidcServiceAccount: environment['STRAVA_TASK_OIDC_SERVICE_ACCOUNT'],
  });
  const cloudRunServiceUrl = normalizeAudience(parsed.cloudRunServiceUrl);
  const oidcAudience = normalizeAudience(parsed.oidcAudience);
  if (cloudRunServiceUrl !== oidcAudience) {
    throw new Error(
      'STRAVA_TASK_OIDC_AUDIENCE must exactly match CLOUD_RUN_SERVICE_URL'
    );
  }

  return {
    ...parsed,
    cloudRunServiceUrl,
    oidcAudience,
  };
}

/**
 * The event ID is stable across duplicate Strava deliveries and Cloud Tasks
 * retries. It intentionally includes the namespace so dev and prod can never
 * collide.
 */
export function deriveStravaEventId(
  environment: ApiEnvironment,
  event: StravaWebhookEventInput
): string {
  const canonical = [
    environment,
    event.subscription_id,
    event.owner_id,
    event.object_type,
    event.object_id,
    event.aspect_type,
    event.event_time,
  ].join(':');
  const digest = createHash('sha256').update(canonical).digest('hex');
  return `strava-${environment}-${digest}`;
}

/**
 * Build the exact Cloud Tasks request used in production. Exported so the
 * queue/URL/OIDC contract can be tested without contacting GCP.
 */
export function buildStravaTaskRequest(
  client: CloudTasksClient,
  config: StravaTaskConfig,
  environment: ApiEnvironment,
  event: StravaWebhookEventInput
): protos.google.cloud.tasks.v2.ICreateTaskRequest {
  if (event.object_type !== 'activity') {
    throw new Error('Only Strava activity events can be enqueued');
  }
  const activityEvent = {
    ...event,
    object_type: 'activity' as const,
  };

  const eventId = deriveStravaEventId(environment, activityEvent);
  const parent = client.queuePath(
    config.projectId,
    config.location,
    config.queue
  );
  const taskName = client.taskPath(
    config.projectId,
    config.location,
    config.queue,
    eventId
  );
  const targetUrl = new URL(
    `/internal/tasks/${environment}/strava-activity`,
    `${config.cloudRunServiceUrl}/`
  ).toString();
  const payload: StravaActivityTaskPayload = {
    eventId,
    event: activityEvent,
  };

  return {
    parent,
    task: {
      name: taskName,
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: targetUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: config.oidcServiceAccount,
          audience: config.oidcAudience,
        },
      },
    },
  };
}

export async function enqueueStravaTaskWithClient(
  client: CloudTasksClient,
  config: StravaTaskConfig,
  environment: ApiEnvironment,
  event: StravaWebhookEventInput
): Promise<EnqueueStravaTaskResult> {
  const request = buildStravaTaskRequest(client, config, environment, event);
  const eventId = deriveStravaEventId(environment, event);
  const expectedTaskName =
    typeof request.task?.name === 'string' ? request.task.name : eventId;

  try {
    const [task] = await client.createTask(request, {
      timeout: ENQUEUE_DEADLINE_MS,
    });
    return {
      eventId,
      taskName: task.name ?? expectedTaskName,
      duplicate: false,
    };
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      logger.info(`${TAG} Duplicate task already exists`, {
        eventId,
        environment,
      });
      return {
        eventId,
        taskName: expectedTaskName,
        duplicate: true,
      };
    }
    throw error;
  }
}

let defaultCloudTasksClient: CloudTasksClient | undefined;

function getCloudTasksClient(): CloudTasksClient {
  defaultCloudTasksClient ??= new CloudTasksClient();
  return defaultCloudTasksClient;
}

/**
 * Enqueue a validated Strava event in the current request namespace.
 */
export async function enqueueStravaWebhookEvent(
  event: StravaWebhookEventInput
): Promise<EnqueueStravaTaskResult> {
  const environment = getRequestEnvironment();
  const config = parseStravaTaskConfig();
  return enqueueStravaTaskWithClient(
    getCloudTasksClient(),
    config,
    environment,
    event
  );
}

/**
 * Verify the bearer token's signature and every identity-bearing claim.
 * Merely reaching this public Cloud Run service is not authorization.
 */
export async function verifyStravaTaskAuthorizationWithClient(
  authorizationHeader: string | undefined,
  verifier: Pick<OAuth2Client, 'verifyIdToken'>,
  config: StravaTaskConfig
): Promise<VerifiedStravaTaskIdentity> {
  const token = extractBearerToken(authorizationHeader);
  let ticket: LoginTicket;

  try {
    ticket = await verifier.verifyIdToken({
      idToken: token,
      audience: config.oidcAudience,
    });
  } catch {
    throw new StravaTaskAuthenticationError(
      'Invalid task identity token',
      'TASK_AUTH_INVALID',
      401
    );
  }

  const payload = ticket.getPayload();
  assertExactTaskIdentity(payload, config);

  return {
    issuer: GOOGLE_OIDC_ISSUER,
    audience: config.oidcAudience,
    email: config.oidcServiceAccount,
    subject: payload.sub,
  };
}

let defaultOidcVerifier: OAuth2Client | undefined;

function getOidcVerifier(): OAuth2Client {
  defaultOidcVerifier ??= new OAuth2Client();
  return defaultOidcVerifier;
}

export async function verifyStravaTaskAuthorization(
  authorizationHeader: string | undefined
): Promise<VerifiedStravaTaskIdentity> {
  return verifyStravaTaskAuthorizationWithClient(
    authorizationHeader,
    getOidcVerifier(),
    parseStravaTaskConfig()
  );
}

interface StravaTaskStoreOptions {
  firestore: Firestore;
  collectionName: () => string;
  now?: () => number;
  createClaimToken?: () => string;
}

/**
 * Firestore-backed lease and completion record for durable task retries.
 * Collection selection is deferred until each operation so request-scoped
 * dev/prod isolation remains concurrency safe.
 */
export class FirestoreStravaTaskStore {
  private readonly firestore: Firestore;
  private readonly collectionName: () => string;
  private readonly now: () => number;
  private readonly createClaimToken: () => string;

  constructor(options: StravaTaskStoreOptions) {
    this.firestore = options.firestore;
    this.collectionName = options.collectionName;
    this.now = options.now ?? Date.now;
    this.createClaimToken = options.createClaimToken ?? randomUUID;
  }

  async claim(
    payload: StravaActivityTaskPayload
  ): Promise<StravaTaskClaimResult> {
    const environment = getRequestEnvironment();
    const reference = this.firestore
      .collection(this.collectionName())
      .doc(payload.eventId);
    const nowMs = this.now();

    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      const status = data?.['status'];

      if (status === 'completed') {
        return { status: 'completed' } as const;
      }

      const leaseExpiresAtMs = data?.['leaseExpiresAtMs'];
      if (
        status === 'processing' &&
        typeof leaseExpiresAtMs === 'number' &&
        leaseExpiresAtMs > nowMs
      ) {
        return { status: 'in_progress' } as const;
      }

      const attempts =
        typeof data?.['attempts'] === 'number' ? data['attempts'] + 1 : 1;
      const claimToken = this.createClaimToken();
      const timestamp = new Date(nowMs).toISOString();

      transaction.set(
        reference,
        {
          eventId: payload.eventId,
          environment,
          status: 'processing',
          claimToken,
          attempts,
          claimedAt: timestamp,
          updatedAt: timestamp,
          leaseExpiresAtMs: nowMs + CLAIM_LEASE_MS,
          event: persistedEvent(payload.event),
        },
        { merge: true }
      );

      return { status: 'claimed', claimToken } as const;
    });
  }

  async complete(eventId: string, claimToken: string): Promise<void> {
    const reference = this.firestore
      .collection(this.collectionName())
      .doc(eventId);
    const completedAt = new Date(this.now()).toISOString();

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();

      if (data?.['status'] === 'completed') {
        return;
      }
      if (!snapshot.exists || data?.['claimToken'] !== claimToken) {
        throw new StravaTaskClaimLostError(eventId);
      }

      transaction.set(
        reference,
        {
          status: 'completed',
          completedAt,
          updatedAt: completedAt,
          leaseExpiresAtMs: 0,
        },
        { merge: true }
      );
    });
  }

  async fail(
    eventId: string,
    claimToken: string,
    processingError: unknown
  ): Promise<void> {
    const reference = this.firestore
      .collection(this.collectionName())
      .doc(eventId);
    const failedAt = new Date(this.now()).toISOString();

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();

      if (data?.['status'] === 'completed') {
        return;
      }
      if (!snapshot.exists || data?.['claimToken'] !== claimToken) {
        throw new StravaTaskClaimLostError(eventId);
      }

      transaction.set(
        reference,
        {
          status: 'failed',
          failedAt,
          updatedAt: failedAt,
          leaseExpiresAtMs: 0,
          lastError: safeErrorMessage(processingError),
        },
        { merge: true }
      );
    });
  }
}

let defaultTaskStore: FirestoreStravaTaskStore | undefined;

export function getStravaTaskStore(): FirestoreStravaTaskStore {
  defaultTaskStore ??= new FirestoreStravaTaskStore({
    firestore: getFirestoreDb(),
    collectionName: () => getCollectionName(IDEMPOTENCY_COLLECTION),
  });
  return defaultTaskStore;
}

function extractBearerToken(authorizationHeader: string | undefined): string {
  if (authorizationHeader === undefined || authorizationHeader === '') {
    throw new StravaTaskAuthenticationError(
      'Missing task identity token',
      'TASK_AUTH_MISSING',
      401
    );
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  if (match?.[1] === undefined) {
    throw new StravaTaskAuthenticationError(
      'Malformed task identity token',
      'TASK_AUTH_INVALID',
      401
    );
  }
  return match[1];
}

function assertExactTaskIdentity(
  payload: TokenPayload | undefined,
  config: StravaTaskConfig
): asserts payload is TokenPayload {
  if (payload === undefined) {
    throw new StravaTaskAuthenticationError(
      'Missing task identity claims',
      'TASK_AUTH_INVALID',
      401
    );
  }

  if (
    payload.iss !== GOOGLE_OIDC_ISSUER ||
    payload.aud !== config.oidcAudience ||
    payload.email !== config.oidcServiceAccount ||
    payload.email_verified !== true ||
    typeof payload.sub !== 'string' ||
    payload.sub === ''
  ) {
    throw new StravaTaskAuthenticationError(
      'Task identity is not authorized',
      'TASK_AUTH_FORBIDDEN',
      403
    );
  }
}

function normalizeAudience(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isAlreadyExistsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = error.code;
  return code === 6 || code === '6' || code === 'ALREADY_EXISTS';
}

function persistedEvent(
  event: StravaActivityTaskPayload['event']
): Record<string, string | number> {
  return {
    aspectType: event.aspect_type,
    eventTime: event.event_time,
    objectId: event.object_id,
    objectType: event.object_type,
    ownerId: event.owner_id,
    subscriptionId: event.subscription_id,
  };
}

function safeErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'Unknown Strava task error';
  return message.slice(0, 500);
}
