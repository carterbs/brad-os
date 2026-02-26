/**
 * Strava Webhook Handler
 *
 * Handles Strava webhook events for activity sync.
 *
 * Endpoints:
 * - GET /strava/webhook - Verification challenge for webhook subscription
 * - POST /strava/webhook - Activity events (create, update, delete)
 * - POST /strava/tokens - Sync Strava tokens from iOS app (App Check protected)
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { info, warn, error as logError } from 'firebase-functions/logger';
import { stravaWebhookEventSchema, syncStravaTokensSchema, createSuccessResponse } from '../shared.js';
import * as stravaService from '../services/strava.service.js';
import * as cyclingService from '../services/firestore-cycling.service.js';
import {
  estimateVO2MaxFromPeakPower,
} from '../services/vo2max.service.js';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';

const TAG = '[Strava Webhook]';
const pendingActivityTasks = new Set<Promise<void>>();

// Strava webhook uses manual middleware — no global App Check since Strava calls
// the webhook endpoints. Only /tokens uses App Check (iOS app calls it).
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('strava'));

/**
 * POST /strava/tokens - Sync Strava tokens from iOS app
 *
 * Called after the iOS app completes Strava OAuth.
 * Saves tokens to Firestore and creates the athlete-to-user mapping
 * so webhooks can resolve athleteId → userId.
 *
 * Protected by App Check (only our iOS app can call this).
 */
app.post(
  '/tokens',
  requireAppCheck,
  (req: Request, res: Response): void => {
    const rawBody: unknown = req.body;
    const parseResult = syncStravaTokensSchema.safeParse(rawBody);

    if (!parseResult.success) {
      warn(`${TAG} Invalid token sync payload`, { errors: parseResult.error.issues });
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid token payload' } });
      return;
    }

    const { accessToken, refreshToken, expiresAt, athleteId } = parseResult.data;

    // Hard-coded userId for single-user app
    const userId = 'default-user';

    info(`${TAG} Syncing Strava tokens`, { athleteId, userId, expiresAt });

    Promise.all([
      cyclingService.setStravaTokens(userId, { accessToken, refreshToken, expiresAt, athleteId }),
      cyclingService.setAthleteToUserMapping(athleteId, userId),
    ])
      .then(() => {
        info(`${TAG} Tokens synced and athlete mapping created`, { athleteId, userId });
        res.json(createSuccessResponse({ synced: true }));
      })
      .catch((error: unknown) => {
        logError(`${TAG} Failed to sync tokens`, {
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to sync tokens' } });
      });
  }
);

/**
 * GET /strava/webhook - Verification challenge
 *
 * Strava sends a GET request to verify webhook subscriptions.
 * We must echo back the hub.challenge value.
 */
app.get(
  '/webhook',
  (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env['STRAVA_WEBHOOK_VERIFY_TOKEN'];

    // Validate the request
    if (mode === 'subscribe' && token === verifyToken) {
      info(`${TAG} Verification successful`);
      res.json({ 'hub.challenge': challenge });
    } else {
      warn(`${TAG} Verification failed - invalid token`);
      res.status(403).send('Forbidden');
    }
  }
);

/**
 * POST /strava/webhook - Activity events
 *
 * Strava sends POST requests when activities are created, updated, or deleted.
 * We process these asynchronously and return 200 immediately to acknowledge receipt.
 */
app.post(
  '/webhook',
  (req: Request, res: Response) => {
    const rawBody: unknown = req.body;
    info(`${TAG} Incoming webhook POST`, { body: rawBody });

    const parseResult = stravaWebhookEventSchema.safeParse(rawBody);

    if (!parseResult.success) {
      warn(`${TAG} Invalid payload`, {
        errors: parseResult.error.issues,
        rawBody,
      });
      // Still return 200 to acknowledge receipt (Strava expects this)
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const event = parseResult.data;
    info(`${TAG} Parsed event`, {
      aspect: event.aspect_type,
      objectType: event.object_type,
      objectId: event.object_id,
      ownerId: event.owner_id,
    });

    // Acknowledge receipt immediately
    res.status(200).send('EVENT_RECEIVED');

    // Process in background (in production, this should use a queue like Cloud Tasks)
    if (event.object_type === 'activity') {
      const task = processActivityEvent(
        event.owner_id,
        event.object_id,
        event.aspect_type
      ).catch((error: unknown) => {
        logError(`${TAG} FATAL: Background processing failed`, {
          activityId: event.object_id,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        });
      });
      pendingActivityTasks.add(task);
      task.finally(() => {
        pendingActivityTasks.delete(task);
      });
    } else {
      info(`${TAG} Ignoring non-activity event`, { objectType: event.object_type });
    }
  }
);

/**
 * Process an activity event from Strava.
 *
 * @param athleteId - Strava athlete ID
 * @param activityId - Strava activity ID
 * @param aspectType - Event type (create, update, delete)
 */
async function processActivityEvent(
  athleteId: number,
  activityId: number,
  aspectType: 'create' | 'update' | 'delete'
): Promise<void> {
  const startTime = Date.now();
  info(`${TAG} Processing event`, { aspectType, activityId, athleteId });

  try {
    // Find user by athlete ID
    const userId = await findUserByAthleteId(athleteId);
    if (userId === null || userId === '') {
      warn(`${TAG} No user found for athlete — webhook ignored`, { athleteId });
      return;
    }
    info(`${TAG} Mapped athlete to user`, { athleteId, userId });

    switch (aspectType) {
      case 'create':
        await handleActivityCreate(userId, activityId);
        break;
      case 'update':
        await handleActivityUpdate(userId, activityId);
        break;
      case 'delete':
        await handleActivityDelete(userId, activityId);
        break;
    }

    const elapsedMs = Date.now() - startTime;
    info(`${TAG} Completed event processing`, { aspectType, activityId, elapsedMs });
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    logError(`${TAG} Error processing activity`, {
      activityId,
      elapsedMs,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
    throw error;
  }
}

/**
 * Find a user ID by their Strava athlete ID.
 *
 * Queries the /athleteToUser/{athleteId} mapping in Firestore,
 * which is created when the iOS app syncs tokens via POST /strava/tokens.
 *
 * @param athleteId - Strava athlete ID
 * @returns User ID or null if not found
 */
async function findUserByAthleteId(athleteId: number): Promise<string | null> {
  const userId = await cyclingService.getUserIdByAthleteId(athleteId);
  if (userId !== null) {
    info(`${TAG} findUserByAthleteId — resolved`, { athleteId, userId });
  } else {
    warn(`${TAG} findUserByAthleteId — no mapping found`, { athleteId });
  }
  return userId;
}

/**
 * Handle a new activity creation from Strava.
 *
 * @param userId - User ID
 * @param activityId - Strava activity ID
 */
async function handleActivityCreate(
  userId: string,
  activityId: number
): Promise<void> {
  // Check if we already have this activity
  info(`${TAG} Checking for existing activity`, { stravaId: activityId, userId });
  const existing = await cyclingService.getCyclingActivityByStravaId(
    userId,
    activityId
  );
  if (existing) {
    info(`${TAG} Activity already exists, skipping`, { stravaId: activityId, docId: existing.id });
    return;
  }

  // Get user's Strava tokens
  info(`${TAG} Fetching Strava tokens`, { userId });
  const tokens = await cyclingService.getStravaTokens(userId);
  if (!tokens) {
    warn(`${TAG} No Strava tokens — cannot fetch activity`, { userId });
    return;
  }
  info(`${TAG} Tokens found`, {
    athleteId: tokens.athleteId,
    expiresAt: tokens.expiresAt,
    expiresAtISO: new Date(tokens.expiresAt * 1000).toISOString(),
  });

  // Refresh tokens if needed
  let accessToken = tokens.accessToken;
  if (stravaService.areTokensExpired(tokens)) {
    info(`${TAG} Tokens expired, refreshing...`);
    const clientId = process.env['STRAVA_CLIENT_ID'];
    const clientSecret = process.env['STRAVA_CLIENT_SECRET'];

    if (
      clientId === undefined ||
      clientId === '' ||
      clientSecret === undefined ||
      clientSecret === ''
    ) {
      logError(`${TAG} Missing Strava client credentials`, {
        clientIdSet: Boolean(clientId),
        clientSecretSet: Boolean(clientSecret),
      });
      return;
    }

    const refreshStart = Date.now();
    const newTokens = await stravaService.refreshStravaTokens(
      clientId,
      clientSecret,
      tokens.refreshToken
    );
    info(`${TAG} Tokens refreshed`, {
      elapsedMs: Date.now() - refreshStart,
      newExpiresAt: newTokens.expiresAt,
    });
    await cyclingService.setStravaTokens(userId, newTokens);
    accessToken = newTokens.accessToken;
  } else {
    info(`${TAG} Tokens still valid`);
  }

  // Fetch the activity from Strava
  info(`${TAG} Fetching activity from Strava API`, { activityId });
  const fetchStart = Date.now();
  const stravaActivity = await stravaService.fetchStravaActivity(
    accessToken,
    activityId
  );
  info(`${TAG} Fetched activity from Strava`, {
    elapsedMs: Date.now() - fetchStart,
    type: stravaActivity.type,
    name: stravaActivity.name ?? '(unnamed)',
    startDate: stravaActivity.start_date,
    durationMin: Math.round(stravaActivity.moving_time / 60),
    avgWatts: stravaActivity.average_watts ?? null,
    normalizedPower: stravaActivity.weighted_average_watts ?? null,
    avgHR: stravaActivity.average_heartrate ?? null,
    maxHR: stravaActivity.max_heartrate ?? null,
    deviceWatts: stravaActivity.device_watts ?? null,
    kilojoules: stravaActivity.kilojoules ?? null,
  });

  // Only process cycling activities
  const cyclingTypes = ['VirtualRide', 'Ride'];
  if (!cyclingTypes.includes(stravaActivity.type)) {
    info(`${TAG} Skipping non-cycling activity`, {
      type: stravaActivity.type,
      accepted: cyclingTypes,
    });
    return;
  }

  // Get user's FTP for TSS calculation
  const ftp = await cyclingService.getCurrentFTP(userId);
  const ftpValue = ftp?.value ?? 200;
  info(`${TAG} FTP for TSS calculation`, {
    ftp: ftpValue,
    source: ftp ? 'history' : 'default (no FTP set!)',
  });

  // Process and store the activity
  const processedActivity = stravaService.processStravaActivity(
    stravaActivity,
    ftpValue,
    userId
  );
  info(`${TAG} Processed activity`, {
    tss: processedActivity.tss,
    intensityFactor: processedActivity.intensityFactor,
    type: processedActivity.type,
    normalizedPower: processedActivity.normalizedPower,
    avgPower: processedActivity.avgPower,
    durationMin: processedActivity.durationMinutes,
    avgHR: processedActivity.avgHeartRate,
  });

  const saveStart = Date.now();
  const savedActivity = await cyclingService.createCyclingActivity(userId, processedActivity);
  info(`${TAG} Saved activity`, {
    docId: savedActivity.id,
    stravaId: activityId,
    elapsedMs: Date.now() - saveStart,
  });

  // Enrich with streams data (peak power, HR completeness, auto VO2 max)
  info(`${TAG} Starting streams enrichment`, { activityId });
  await enrichActivityWithStreams(userId, savedActivity.id, activityId, accessToken);
}

/**
 * Fetch Strava streams for an activity and enrich it with peak power,
 * HR completeness, and auto-estimated VO2 max.
 */
async function enrichActivityWithStreams(
  userId: string,
  activityDocId: string,
  stravaActivityId: number,
  accessToken: string
): Promise<void> {
  try {
    const fetchStart = Date.now();
    const streams = await stravaService.fetchActivityStreams(
      accessToken,
      stravaActivityId,
      ['watts', 'heartrate', 'time', 'cadence']
    );
    info(`${TAG} Fetched streams`, {
      stravaActivityId,
      elapsedMs: Date.now() - fetchStart,
      wattsSamples: streams.watts?.data.length ?? 0,
      hrSamples: streams.heartrate?.data.length ?? 0,
      timeSamples: streams.time?.data.length ?? 0,
      cadenceSamples: streams.cadence?.data.length ?? 0,
    });

    // Persist raw stream data to subcollection
    try {
      const sampleCount = streams.time?.data.length
        ?? streams.watts?.data.length
        ?? streams.heartrate?.data.length
        ?? 0;

      if (sampleCount > 0) {
        await cyclingService.saveActivityStreams(userId, activityDocId, {
          activityId: activityDocId,
          stravaActivityId,
          watts: streams.watts?.data,
          heartrate: streams.heartrate?.data,
          time: streams.time?.data,
          cadence: streams.cadence?.data,
          sampleCount,
        });
        info(`${TAG} Saved stream samples`, { stravaActivityId, sampleCount });
      } else {
        warn(`${TAG} No stream samples to save`, { stravaActivityId });
      }
    } catch (streamSaveError) {
      warn(`${TAG} Failed to save stream data`, {
        stravaActivityId,
        error: streamSaveError instanceof Error ? streamSaveError.message : streamSaveError,
      });
    }

    const updates: Parameters<typeof cyclingService.updateCyclingActivity>[2] = {};

    // Calculate peak power from watts stream
    if (streams.watts && streams.time) {
      const peak5 = stravaService.calculatePeakPower(
        streams.watts.data,
        streams.time.data,
        300
      );
      if (peak5 > 0) updates.peak5MinPower = peak5;

      const peak20 = stravaService.calculatePeakPower(
        streams.watts.data,
        streams.time.data,
        1200
      );
      if (peak20 > 0) updates.peak20MinPower = peak20;

      info(`${TAG} Peak power calculated`, { stravaActivityId, peak5min: peak5, peak20min: peak20 });
    } else {
      info(`${TAG} No watts/time streams — skipping peak power`, { stravaActivityId });
    }

    // Calculate HR completeness
    if (streams.heartrate) {
      updates.hrCompleteness = stravaService.calculateHRCompleteness(
        streams.heartrate.data
      );
      info(`${TAG} HR completeness`, { stravaActivityId, hrCompleteness: updates.hrCompleteness });
    } else {
      info(`${TAG} No HR stream — skipping HR completeness`, { stravaActivityId });
    }

    // Update the activity with streams-derived data
    if (Object.keys(updates).length > 0) {
      await cyclingService.updateCyclingActivity(userId, activityDocId, updates);
      info(`${TAG} Enriched activity with streams data`, { stravaActivityId, updates });
    }

    // Auto-estimate VO2 max from peak 5-min power if we have weight
    if (updates.peak5MinPower !== undefined && updates.peak5MinPower > 0) {
      const profile = await cyclingService.getCyclingProfile(userId);
      if (profile && profile.weightKg > 0) {
        const vo2max = estimateVO2MaxFromPeakPower(
          updates.peak5MinPower,
          profile.weightKg,
          'peak_5min'
        );
        if (vo2max !== null) {
          await cyclingService.saveVO2MaxEstimate(userId, {
            userId,
            date: new Date().toISOString().split('T')[0] ?? new Date().toISOString(),
            value: vo2max,
            method: 'peak_5min',
            sourcePower: updates.peak5MinPower,
            sourceWeight: profile.weightKg,
            activityId: activityDocId,
            createdAt: new Date().toISOString(),
          });
          info(`${TAG} VO2 max estimated`, {
            vo2max,
            peak5min: updates.peak5MinPower,
            weightKg: profile.weightKg,
          });
        } else {
          info(`${TAG} VO2 max estimation returned null`, {
            peak5min: updates.peak5MinPower,
            weightKg: profile.weightKg,
          });
        }
      } else {
        info(`${TAG} Skipping VO2 max — no cycling profile or weight`, {
          hasProfile: Boolean(profile),
          weightKg: profile?.weightKg ?? null,
        });
      }
    }
  } catch (error) {
    // Streams enrichment is best-effort; don't fail the whole webhook
    warn(`${TAG} Failed to enrich activity with streams`, {
      stravaActivityId,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  }
}

/**
 * Handle an activity update from Strava.
 *
 * @param userId - User ID
 * @param activityId - Strava activity ID
 */
async function handleActivityUpdate(
  userId: string,
  activityId: number
): Promise<void> {
  info(`${TAG} Handling UPDATE — will delete-and-recreate`, { activityId });
  // For updates, we delete and recreate the activity
  // This ensures we have the latest data
  const existing = await cyclingService.getCyclingActivityByStravaId(
    userId,
    activityId
  );

  if (existing) {
    await cyclingService.deleteCyclingActivity(userId, existing.id);
    info(`${TAG} Deleted old version`, { stravaId: activityId, docId: existing.id });
  } else {
    info(`${TAG} No existing activity found, will create fresh`, { stravaId: activityId });
  }

  // Recreate with updated data
  await handleActivityCreate(userId, activityId);
}

/**
 * Handle an activity deletion from Strava.
 *
 * @param userId - User ID
 * @param activityId - Strava activity ID
 */
async function handleActivityDelete(
  userId: string,
  activityId: number
): Promise<void> {
  const existing = await cyclingService.getCyclingActivityByStravaId(
    userId,
    activityId
  );

  if (existing) {
    await cyclingService.deleteCyclingActivity(userId, existing.id);
    info(`${TAG} Deleted activity`, { stravaId: activityId, docId: existing.id, userId });
  } else {
    info(`${TAG} Activity not found, nothing to delete`, { stravaId: activityId });
  }
}

// Error handler must be last
app.use(errorHandler);

export const stravaWebhookApp = app;

/**
 * Test-only helper to await completion of in-flight webhook background tasks.
 */
export async function waitForStravaWebhookProcessing(): Promise<void> {
  if (pendingActivityTasks.size === 0) {
    return;
  }
  await Promise.allSettled(Array.from(pendingActivityTasks));
}
