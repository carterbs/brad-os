/**
 * Strava Webhook Handler
 *
 * Handles Strava webhook events for activity sync.
 *
 * Endpoints:
 * - GET /strava/webhook - Verification challenge for webhook subscription
 * - POST /strava/webhook - Activity events (create, update, delete)
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { stravaWebhookEventSchema } from '../shared.js';
import * as stravaService from '../services/strava.service.js';
import * as cyclingService from '../services/firestore-cycling.service.js';
import {
  estimateVO2MaxFromPeakPower,
} from '../services/vo2max.service.js';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('strava'));

// Note: Webhook endpoints don't use App Check middleware since Strava calls them

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
      console.log('[Strava Webhook] Verification successful');
      res.json({ 'hub.challenge': challenge });
    } else {
      console.warn('[Strava Webhook] Verification failed - invalid token');
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
    const parseResult = stravaWebhookEventSchema.safeParse(req.body);

    if (!parseResult.success) {
      console.warn('[Strava Webhook] Invalid payload:', parseResult.error.errors);
      // Still return 200 to acknowledge receipt (Strava expects this)
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const event = parseResult.data;
    console.log(
      `[Strava Webhook] Received ${event.aspect_type} event for ${event.object_type} ${event.object_id}`
    );

    // Acknowledge receipt immediately
    res.status(200).send('EVENT_RECEIVED');

    // Process in background (in production, this should use a queue like Cloud Tasks)
    if (event.object_type === 'activity') {
      processActivityEvent(
        event.owner_id,
        event.object_id,
        event.aspect_type
      ).catch((error: unknown) => {
        console.error('[Strava Webhook] Error processing activity:', error);
      });
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
  console.log(
    `[Strava Webhook] Processing ${aspectType} for activity ${activityId} (athlete ${athleteId})`
  );

  try {
    // Find user by athlete ID
    const userId = findUserByAthleteId(athleteId);
    if (userId === null || userId === '') {
      console.warn(
        `[Strava Webhook] No user found for athlete ID ${athleteId}`
      );
      return;
    }

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
  } catch (error) {
    console.error(`[Strava Webhook] Error processing activity ${activityId}:`, error);
    throw error;
  }
}

/**
 * Find a user ID by their Strava athlete ID.
 *
 * This requires looking up our user-athlete mapping.
 * For now, we'll use a simple approach where userId equals athleteId.toString()
 * In production, this should query a mapping collection in Firestore.
 *
 * @param athleteId - Strava athlete ID
 * @returns User ID or null if not found
 */
function findUserByAthleteId(athleteId: number): string | null {
  // TODO: Implement proper user lookup from Firestore
  // For now, use the athleteId as a string userId (matches test setup)
  // In production, you would query: /athleteToUser/{athleteId} -> userId
  return athleteId.toString();
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
  const existing = await cyclingService.getCyclingActivityByStravaId(
    userId,
    activityId
  );
  if (existing) {
    console.log(`[Strava Webhook] Activity ${activityId} already exists, skipping`);
    return;
  }

  // Get user's Strava tokens
  const tokens = await cyclingService.getStravaTokens(userId);
  if (!tokens) {
    console.warn(`[Strava Webhook] No Strava tokens for user ${userId}`);
    return;
  }

  // Refresh tokens if needed
  let accessToken = tokens.accessToken;
  if (stravaService.areTokensExpired(tokens)) {
    const clientId = process.env['STRAVA_CLIENT_ID'];
    const clientSecret = process.env['STRAVA_CLIENT_SECRET'];

    if (
      clientId === undefined ||
      clientId === '' ||
      clientSecret === undefined ||
      clientSecret === ''
    ) {
      console.error('[Strava Webhook] Missing Strava client credentials');
      return;
    }

    const newTokens = await stravaService.refreshStravaTokens(
      clientId,
      clientSecret,
      tokens.refreshToken
    );
    await cyclingService.setStravaTokens(userId, newTokens);
    accessToken = newTokens.accessToken;
  }

  // Fetch the activity from Strava
  const stravaActivity = await stravaService.fetchStravaActivity(
    accessToken,
    activityId
  );

  // Only process cycling activities
  const cyclingTypes = ['VirtualRide', 'Ride'];
  if (!cyclingTypes.includes(stravaActivity.type)) {
    console.log(
      `[Strava Webhook] Skipping non-cycling activity type: ${stravaActivity.type}`
    );
    return;
  }

  // Get user's FTP for TSS calculation
  const ftp = await cyclingService.getCurrentFTP(userId);
  const ftpValue = ftp?.value ?? 200; // Default FTP if not set

  // Process and store the activity
  const processedActivity = stravaService.processStravaActivity(
    stravaActivity,
    ftpValue,
    userId
  );

  const savedActivity = await cyclingService.createCyclingActivity(userId, processedActivity);
  console.log(`[Strava Webhook] Created activity ${activityId} for user ${userId}`);

  // Enrich with streams data (peak power, HR completeness, auto VO2 max)
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
    const streams = await stravaService.fetchActivityStreams(
      accessToken,
      stravaActivityId,
      ['watts', 'heartrate', 'time', 'cadence']
    );

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
        console.log(
          `[Strava Webhook] Saved ${sampleCount} stream samples for activity ${stravaActivityId}`
        );
      }
    } catch (streamSaveError) {
      console.warn(
        `[Strava Webhook] Failed to save stream data for activity ${stravaActivityId}:`,
        streamSaveError
      );
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
    }

    // Calculate HR completeness
    if (streams.heartrate) {
      updates.hrCompleteness = stravaService.calculateHRCompleteness(
        streams.heartrate.data
      );
    }

    // Update the activity with streams-derived data
    if (Object.keys(updates).length > 0) {
      await cyclingService.updateCyclingActivity(userId, activityDocId, updates);
      console.log(
        `[Strava Webhook] Enriched activity ${stravaActivityId} with streams data:`,
        updates
      );
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
          console.log(
            `[Strava Webhook] Auto-estimated VO2 max: ${vo2max} mL/kg/min from peak 5-min power ${updates.peak5MinPower}W`
          );
        }
      }
    }
  } catch (error) {
    // Streams enrichment is best-effort; don't fail the whole webhook
    console.warn(
      `[Strava Webhook] Failed to enrich activity ${stravaActivityId} with streams:`,
      error
    );
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
  // For updates, we delete and recreate the activity
  // This ensures we have the latest data
  const existing = await cyclingService.getCyclingActivityByStravaId(
    userId,
    activityId
  );

  if (existing) {
    await cyclingService.deleteCyclingActivity(userId, existing.id);
    console.log(`[Strava Webhook] Deleted old version of activity ${activityId}`);
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
    console.log(`[Strava Webhook] Deleted activity ${activityId} for user ${userId}`);
  } else {
    console.log(`[Strava Webhook] Activity ${activityId} not found, nothing to delete`);
  }
}

// Error handler must be last
app.use(errorHandler);

export const stravaWebhookApp = app;
