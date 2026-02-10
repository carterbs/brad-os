/**
 * Strava Service
 *
 * Functions for interacting with the Strava API including:
 * - Fetching activities
 * - Refreshing OAuth tokens
 * - Processing activities (calculating TSS, classifying workout types)
 */

import type {
  StravaTokens,
  CyclingActivity,
  CyclingActivityType,
} from '../shared.js';
import { calculateEF } from './efficiency-factor.service.js';
import { info, warn, error as logError } from 'firebase-functions/logger';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH_URL = 'https://www.strava.com/oauth/token';
const TAG = '[Strava API]';

/**
 * Raw activity data from the Strava API.
 */
export interface StravaActivity {
  id: number;
  type: string;
  moving_time: number;
  elapsed_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  device_watts?: boolean;
  kilojoules?: number;
  start_date: string;
  name?: string;
  distance?: number;
}

/**
 * Error thrown when Strava API calls fail.
 */
export class StravaApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'StravaApiError';
  }
}

/**
 * Fetch an activity from the Strava API.
 *
 * @param accessToken - Valid Strava access token
 * @param activityId - Strava activity ID
 * @returns The Strava activity
 * @throws StravaApiError if the API call fails
 */
export async function fetchStravaActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  const start = Date.now();
  const url = `${STRAVA_API_BASE}/activities/${activityId}`;
  info(`${TAG} fetchStravaActivity`, { activityId });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    logError(`${TAG} fetchStravaActivity failed`, {
      url,
      status: response.status,
      responseBody: body,
      activityId,
    });
    throw new StravaApiError(
      `Strava API error: ${response.status} - ${body}`,
      response.status
    );
  }

  const activity = (await response.json()) as StravaActivity;
  info(`${TAG} fetchStravaActivity success`, {
    activityId,
    type: activity.type,
    name: activity.name,
    date: activity.start_date,
    movingTime: activity.moving_time,
    avgWatts: activity.average_watts,
    weightedWatts: activity.weighted_average_watts,
    deviceWatts: activity.device_watts,
    elapsedMs: Date.now() - start,
  });
  return activity;
}

/**
 * Fetch recent activities from the Strava API.
 *
 * @param accessToken - Valid Strava access token
 * @param page - Page number (1-indexed)
 * @param perPage - Number of activities per page (max 200)
 * @returns Array of Strava activities
 * @throws StravaApiError if the API call fails
 */
export async function fetchStravaActivities(
  accessToken: string,
  page: number = 1,
  perPage: number = 30
): Promise<StravaActivity[]> {
  const start = Date.now();
  info(`${TAG} fetchStravaActivities`, { page, perPage });
  const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
  url.searchParams.set('page', page.toString());
  url.searchParams.set('per_page', Math.min(perPage, 200).toString());

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    logError(`${TAG} fetchStravaActivities failed`, {
      url: url.toString(),
      status: response.status,
      responseBody: body,
      page,
      perPage,
    });
    throw new StravaApiError(
      `Strava API error: ${response.status} - ${body}`,
      response.status
    );
  }

  const activities = (await response.json()) as StravaActivity[];
  info(`${TAG} fetchStravaActivities success`, { page, perPage, returned: activities.length, elapsedMs: Date.now() - start });
  return activities;
}

/**
 * Refresh Strava OAuth tokens using a refresh token.
 *
 * @param clientId - Strava application client ID
 * @param clientSecret - Strava application client secret
 * @param refreshToken - Current refresh token
 * @returns New Strava tokens
 * @throws StravaApiError if the token refresh fails
 */
export async function refreshStravaTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<StravaTokens> {
  const start = Date.now();
  info(`${TAG} refreshStravaTokens starting`);
  const response = await fetch(STRAVA_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    logError(`${TAG} Token refresh failed`, {
      status: response.status,
      responseBody: body,
    });
    throw new StravaApiError(
      `Token refresh failed: ${response.status} - ${body}`,
      response.status
    );
  }

  interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
  }

  const data = (await response.json()) as TokenResponse;
  info(`${TAG} refreshStravaTokens success`, { athleteId: data.athlete?.id, expiresAt: data.expires_at, elapsedMs: Date.now() - start });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteId: data.athlete?.id ?? 0,
  };
}

/**
 * Classify the workout type based on intensity factor.
 *
 * Based on standard cycling training zones:
 * - IF >= 1.05: VO2max intervals
 * - IF >= 0.88: Threshold work
 * - IF >= 0.75: Fun/endurance ride
 * - IF > 0: Recovery ride
 *
 * @param intensityFactor - Workout intensity factor (NP/FTP)
 * @returns The classified workout type
 */
export function classifyWorkoutType(
  intensityFactor: number
): CyclingActivityType {
  if (intensityFactor >= 1.05) return 'vo2max';
  if (intensityFactor >= 0.88) return 'threshold';
  if (intensityFactor >= 0.75) return 'fun';
  if (intensityFactor > 0) return 'recovery';
  return 'unknown';
}

/**
 * Calculate TSS (Training Stress Score) from power data.
 *
 * TSS = (duration_seconds x NP x IF) / (FTP x 3600) x 100
 *
 * @param durationSeconds - Workout duration in seconds
 * @param normalizedPower - Normalized power in watts
 * @param ftp - Functional Threshold Power in watts
 * @returns TSS value
 */
export function calculateTSS(
  durationSeconds: number,
  normalizedPower: number,
  ftp: number
): number {
  if (ftp <= 0 || normalizedPower <= 0 || durationSeconds <= 0) {
    return 0;
  }

  const intensityFactor = normalizedPower / ftp;
  const tss =
    ((durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600)) *
    100;

  return Math.round(tss);
}

/**
 * Calculate Intensity Factor from normalized power and FTP.
 *
 * @param normalizedPower - Normalized power in watts
 * @param ftp - Functional Threshold Power in watts
 * @returns Intensity factor (rounded to 2 decimal places)
 */
export function calculateIntensityFactor(
  normalizedPower: number,
  ftp: number
): number {
  if (ftp <= 0 || normalizedPower <= 0) {
    return 0;
  }

  return Math.round((normalizedPower / ftp) * 100) / 100;
}

/**
 * Process a Strava activity into a CyclingActivity for storage.
 *
 * This function:
 * 1. Calculates TSS from power data
 * 2. Classifies the workout type
 * 3. Transforms Strava data into our domain model
 *
 * @param stravaActivity - Raw activity from Strava API
 * @param ftp - User's current FTP in watts
 * @param userId - User ID for the activity
 * @returns Processed cycling activity (without id)
 */
export function processStravaActivity(
  stravaActivity: StravaActivity,
  ftp: number,
  userId: string
): Omit<CyclingActivity, 'id'> {
  // Use weighted average watts (normalized power) if available, otherwise average
  const normalizedPower =
    stravaActivity.weighted_average_watts ?? stravaActivity.average_watts ?? 0;
  const avgPower = stravaActivity.average_watts ?? 0;
  const durationSeconds = stravaActivity.moving_time;

  // Calculate metrics
  const intensityFactor = calculateIntensityFactor(normalizedPower, ftp);
  const tss = calculateTSS(durationSeconds, normalizedPower, ftp);
  const type = classifyWorkoutType(intensityFactor);

  const avgHeartRate = stravaActivity.average_heartrate ?? 0;
  const ef = calculateEF(normalizedPower, avgHeartRate) ?? undefined;

  info(`${TAG} processStravaActivity`, {
    stravaId: stravaActivity.id,
    activityType: stravaActivity.type,
    date: stravaActivity.start_date,
    durationMin: Math.round(durationSeconds / 60),
    ftp,
    normalizedPower,
    avgPower,
    intensityFactor,
    tss,
    classifiedType: type,
    avgHeartRate,
    ef,
  });

  return {
    stravaId: stravaActivity.id,
    userId,
    date: stravaActivity.start_date,
    durationMinutes: Math.round(stravaActivity.moving_time / 60),
    avgPower,
    normalizedPower,
    maxPower: stravaActivity.max_watts ?? 0,
    avgHeartRate,
    maxHeartRate: stravaActivity.max_heartrate ?? 0,
    tss,
    intensityFactor,
    type,
    source: 'strava',
    ef,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Filter activities to only include cycling activities.
 *
 * Currently filters to VirtualRide (Peloton, Zwift) and Ride types.
 *
 * @param activities - Array of Strava activities
 * @returns Filtered array of cycling activities
 */
export function filterCyclingActivities(
  activities: StravaActivity[]
): StravaActivity[] {
  const cyclingTypes = ['VirtualRide', 'Ride'];
  return activities.filter((activity) => cyclingTypes.includes(activity.type));
}

/**
 * Check if Strava tokens are expired.
 *
 * Includes a 5-minute buffer to ensure tokens are refreshed before expiry.
 *
 * @param tokens - Strava tokens to check
 * @returns True if tokens are expired or about to expire
 */
export function areTokensExpired(tokens: StravaTokens): boolean {
  const bufferSeconds = 5 * 60; // 5 minute buffer
  const now = Math.floor(Date.now() / 1000);
  return now >= tokens.expiresAt - bufferSeconds;
}

// --- Strava Streams ---

/**
 * A single data stream from the Strava Streams API.
 */
export interface StravaStream {
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

/**
 * Combined activity streams from Strava.
 */
export interface ActivityStreams {
  watts?: StravaStream;
  heartrate?: StravaStream;
  time?: StravaStream;
  cadence?: StravaStream;
}

/**
 * Fetch time-series streams for a Strava activity.
 *
 * @param accessToken - Valid Strava access token
 * @param activityId - Strava activity ID
 * @param keys - Stream types to fetch (default: watts, heartrate, time)
 * @returns Activity streams
 * @throws StravaApiError if the API call fails
 */
export async function fetchActivityStreams(
  accessToken: string,
  activityId: number,
  keys: string[] = ['watts', 'heartrate', 'time']
): Promise<ActivityStreams> {
  const start = Date.now();
  info(`${TAG} fetchActivityStreams`, { activityId, keys });
  const url = new URL(
    `${STRAVA_API_BASE}/activities/${activityId}/streams`
  );
  url.searchParams.set('keys', keys.join(','));
  url.searchParams.set('key_by_type', 'true');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)');
    warn(`${TAG} fetchActivityStreams failed`, {
      url: url.toString(),
      status: response.status,
      responseBody: body,
      activityId,
    });
    throw new StravaApiError(
      `Strava Streams API error: ${response.status} - ${body}`,
      response.status
    );
  }

  const data = (await response.json()) as ActivityStreams;
  info(`${TAG} fetchActivityStreams success`, {
    activityId,
    wattsSamples: data.watts?.data.length ?? 0,
    hrSamples: data.heartrate?.data.length ?? 0,
    timeSamples: data.time?.data.length ?? 0,
    cadenceSamples: data.cadence?.data.length ?? 0,
    elapsedMs: Date.now() - start,
  });
  return data;
}

/**
 * Calculate peak (best) average power over a rolling window.
 *
 * Uses a sliding window over the watts stream to find the highest
 * average power for the given duration.
 *
 * @param wattsStream - Array of per-second power values
 * @param timeStream - Array of per-second elapsed time values
 * @param windowSeconds - Duration of the window (300 for 5-min, 1200 for 20-min)
 * @returns Peak average power for the window, or 0 if data is too short
 */
export function calculatePeakPower(
  wattsStream: number[],
  timeStream: number[],
  windowSeconds: number
): number {
  if (wattsStream.length === 0 || timeStream.length === 0) {
    return 0;
  }

  // Find indices that span the window duration
  let maxAvg = 0;

  for (let startIdx = 0; startIdx < wattsStream.length; startIdx++) {
    const startTime = timeStream[startIdx];
    if (startTime === undefined) continue;

    // Find the end index for this window
    let endIdx = startIdx;
    while (
      endIdx < timeStream.length - 1 &&
      (timeStream[endIdx + 1] ?? 0) - startTime < windowSeconds
    ) {
      endIdx++;
    }

    const endTime = timeStream[endIdx];
    if (endTime === undefined) continue;

    const duration = endTime - startTime;

    // Only consider windows that are at least the requested duration
    if (duration < windowSeconds - 1) continue; // Allow 1s tolerance

    // Calculate average power for this window
    let sum = 0;
    let count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const w = wattsStream[i];
      if (w !== undefined) {
        sum += w;
        count++;
      }
    }

    if (count > 0) {
      const avg = sum / count;
      if (avg > maxAvg) {
        maxAvg = avg;
      }
    }
  }

  return Math.round(maxAvg);
}

/**
 * Calculate HR data completeness from a heart rate stream.
 *
 * Counts non-zero HR samples as a percentage of total samples.
 * < 80% indicates significant HR data gaps (common with Peloton).
 *
 * @param heartRateStream - Array of HR values (bpm)
 * @returns Completeness percentage (0-100)
 */
export function calculateHRCompleteness(
  heartRateStream: number[]
): number {
  if (heartRateStream.length === 0) {
    return 0;
  }

  const nonZero = heartRateStream.filter((hr) => hr > 0).length;
  const completeness = (nonZero / heartRateStream.length) * 100;

  return Math.round(completeness);
}
