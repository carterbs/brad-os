/**
 * Training Load Service
 *
 * Calculates TSS (Training Stress Score) and training load metrics
 * (ATL, CTL, TSB) for cycling activities.
 */

import type { WeeklySession, SessionType, DailyTSS } from '../shared.js';
// Re-export type so existing imports from this module continue to work
export type { DailyTSS } from '../shared.js';

/**
 * Calculate Training Stress Score (TSS) for a cycling activity.
 *
 * TSS = (duration_seconds * NP * IF) / (FTP * 3600) * 100
 * where IF = NP / FTP
 *
 * @param durationSeconds - Duration of the activity in seconds
 * @param normalizedPower - Normalized Power in watts
 * @param ftp - Functional Threshold Power in watts
 * @returns TSS value
 */
export function calculateTSS(
  durationSeconds: number,
  normalizedPower: number,
  ftp: number
): number {
  if (ftp <= 0) {
    throw new Error('FTP must be positive');
  }
  if (durationSeconds <= 0) {
    return 0;
  }
  if (normalizedPower <= 0) {
    return 0;
  }

  const intensityFactor = normalizedPower / ftp;
  const tss =
    ((durationSeconds * normalizedPower * intensityFactor) / (ftp * 3600)) *
    100;

  return Math.round(tss * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate Intensity Factor (IF) for a cycling activity.
 *
 * IF = NP / FTP
 *
 * @param normalizedPower - Normalized Power in watts
 * @param ftp - Functional Threshold Power in watts
 * @returns Intensity Factor (typically 0.5 - 1.2)
 */
export function calculateIntensityFactor(
  normalizedPower: number,
  ftp: number
): number {
  if (ftp <= 0) {
    throw new Error('FTP must be positive');
  }
  if (normalizedPower <= 0) {
    return 0;
  }

  const intensityFactor = normalizedPower / ftp;
  return Math.round(intensityFactor * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate exponential moving average (EMA) for training load.
 *
 * EMA_today = EMA_yesterday + (TSS_today - EMA_yesterday) * k
 * where k = 2 / (N + 1)
 *
 * @param dailyTSS - Array of daily TSS values, sorted by date ascending
 * @param period - Number of days for the moving average (7 for ATL, 42 for CTL)
 * @returns Current EMA value
 */
function calculateEMA(dailyTSS: DailyTSS[], period: number): number {
  if (dailyTSS.length === 0) {
    return 0;
  }

  // Sort by date ascending
  const sortedTSS = [...dailyTSS].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // k factor for EMA
  const k = 2 / (period + 1);

  // Start EMA at 0 (or could use first value for initial seed)
  let ema = 0;

  for (const entry of sortedTSS) {
    ema = ema + (entry.tss - ema) * k;
  }

  return Math.round(ema * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate Acute Training Load (ATL) - 7-day exponential moving average.
 *
 * ATL represents short-term fatigue. Higher values indicate more recent
 * training stress.
 *
 * @param dailyTSS - Array of daily TSS values
 * @returns ATL value
 */
export function calculateATL(dailyTSS: DailyTSS[]): number {
  return calculateEMA(dailyTSS, 7);
}

/**
 * Calculate Chronic Training Load (CTL) - 42-day exponential moving average.
 *
 * CTL represents long-term fitness. Higher values indicate better aerobic
 * fitness built over time.
 *
 * @param dailyTSS - Array of daily TSS values
 * @returns CTL value
 */
export function calculateCTL(dailyTSS: DailyTSS[]): number {
  return calculateEMA(dailyTSS, 42);
}

/**
 * Calculate Training Stress Balance (TSB).
 *
 * TSB = CTL - ATL
 *
 * Positive values indicate freshness (form), negative values indicate fatigue.
 * Optimal race readiness is typically TSB between +10 and +25.
 *
 * @param ctl - Chronic Training Load
 * @param atl - Acute Training Load
 * @returns TSB value
 */
export function calculateTSB(ctl: number, atl: number): number {
  const tsb = ctl - atl;
  return Math.round(tsb * 10) / 10; // Round to 1 decimal place
}

/**
 * Get the current week number within a training block.
 *
 * Training blocks are typically 8 weeks:
 * - Weeks 1-6: Progressive training
 * - Week 7: Peak/taper
 * - Week 8: Recovery/deload
 *
 * @param blockStartDate - ISO 8601 date string for block start
 * @param currentDate - Optional current date (defaults to today)
 * @returns Week number (1-8), or 0 if before block start
 */
export function getWeekInBlock(
  blockStartDate: string,
  currentDate?: string
): number {
  const start = new Date(blockStartDate);
  const current =
    currentDate !== undefined && currentDate !== ''
      ? new Date(currentDate)
      : new Date();

  // Reset to start of day for consistent comparison
  start.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);

  const diffMs = current.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 0; // Before block start
  }

  const weekNumber = Math.floor(diffDays / 7) + 1;

  // Cap at 8 weeks
  return Math.min(weekNumber, 8);
}

/**
 * Build a complete daily TSS array from sparse activity data.
 *
 * This fills in missing days with 0 TSS to ensure accurate EMA calculations.
 *
 * @param activities - Array of {date, tss} from actual activities
 * @param startDate - Start date for the range
 * @param endDate - End date for the range
 * @returns Complete array with all days filled in
 */
export function buildDailyTSSArray(
  activities: DailyTSS[],
  startDate: string,
  endDate: string
): DailyTSS[] {
  const result: DailyTSS[] = [];
  const activityMap = new Map<string, number>();

  // Build a map of date -> TSS (summing multiple activities on same day)
  for (const activity of activities) {
    const dateKey = activity.date.split('T')[0]; // Normalize to YYYY-MM-DD
    if (dateKey !== undefined && dateKey !== '') {
      const existing = activityMap.get(dateKey) ?? 0;
      activityMap.set(dateKey, existing + activity.tss);
    }
  }

  // Parse start and end dates as date components to avoid timezone issues
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);

  const startYear = startParts[0] ?? 2000;
  const startMonth = startParts[1] ?? 1;
  const startDay = startParts[2] ?? 1;

  const endYear = endParts[0] ?? 2000;
  const endMonth = endParts[1] ?? 1;
  const endDay = endParts[2] ?? 1;

  // Use UTC dates to avoid timezone issues
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);

  // Iterate through each day in the range
  let currentMs = start;
  while (currentMs <= end) {
    const currentDate = new Date(currentMs);
    const year = currentDate.getUTCFullYear();
    const month = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    result.push({
      date: dateStr,
      tss: activityMap.get(dateStr) ?? 0,
    });

    currentMs += 24 * 60 * 60 * 1000; // Add one day in milliseconds
  }

  return result;
}

/**
 * Calculate all training load metrics at once.
 *
 * @param activities - Array of {date, tss} from recent activities
 * @param lookbackDays - Number of days to look back (default 60 for CTL accuracy)
 * @returns Object with ATL, CTL, and TSB
 */
export function calculateTrainingLoadMetrics(
  activities: DailyTSS[],
  lookbackDays: number = 60
): { atl: number; ctl: number; tsb: number } {
  // Build end date (today in UTC)
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const endMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const endDay = String(now.getUTCDate()).padStart(2, '0');
  const endDateStr = `${endYear}-${endMonth}-${endDay}`;

  // Build start date (lookback days ago)
  const startMs = Date.UTC(endYear, now.getUTCMonth(), now.getUTCDate()) -
    lookbackDays * 24 * 60 * 60 * 1000;
  const startDate = new Date(startMs);
  const startYear = startDate.getUTCFullYear();
  const startMonth = String(startDate.getUTCMonth() + 1).padStart(2, '0');
  const startDay = String(startDate.getUTCDate()).padStart(2, '0');
  const startDateStr = `${startYear}-${startMonth}-${startDay}`;

  const dailyTSS = buildDailyTSSArray(activities, startDateStr, endDateStr);

  // Calculate metrics
  const atl = calculateATL(dailyTSS);
  const ctl = calculateCTL(dailyTSS);
  const tsb = calculateTSB(ctl, atl);

  return { atl, ctl, tsb };
}

/**
 * Get the Monday-Sunday boundaries for the week containing the given date.
 *
 * @param date - The date to get boundaries for (defaults to today)
 * @returns Start (Monday) and end (Sunday) dates in YYYY-MM-DD format
 */
export function getWeekBoundaries(date?: Date): { start: string; end: string } {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);

  // getDay() returns 0 for Sunday, 1 for Monday, etc.
  const dayOfWeek = d.getDay();
  // Calculate offset to Monday: Sunday (0) -> -6, Monday (1) -> 0, Tue (2) -> -1, etc.
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (dt: Date): string => {
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return { start: formatDate(monday), end: formatDate(sunday) };
}

/**
 * Map a cycling activity type to a session type for matching.
 * Used when matching Strava activities against the weekly session queue.
 */
function activityTypeToSessionType(activityType: string): SessionType | null {
  switch (activityType) {
    case 'vo2max':
      return 'vo2max';
    case 'threshold':
      return 'threshold';
    case 'fun':
      return 'fun';
    case 'recovery':
      return 'recovery';
    default:
      return null;
  }
}

/**
 * Determine which session is next in the weekly queue.
 *
 * Walks the session queue in order and tries to match each session against
 * completed activities by session type. Each activity can only match one
 * session (consumed in order). Returns the first unmatched session, or null
 * if all sessions have been completed this week.
 *
 * @param weeklySessions - The ordered list of sessions for the week
 * @param completedActivities - This week's completed cycling activities
 * @returns The next incomplete session, or null if all done
 */
export function determineNextSession(
  weeklySessions: WeeklySession[],
  completedActivities: { type: string }[]
): WeeklySession | null {
  if (weeklySessions.length === 0) {
    return null;
  }

  // Build a pool of available activity types (can be consumed)
  const availableActivities = completedActivities
    .map((a) => activityTypeToSessionType(a.type))
    .filter((t): t is SessionType => t !== null);

  // Track which activities have been consumed
  const consumed = new Array<boolean>(availableActivities.length).fill(false);

  for (const session of weeklySessions) {
    // Try to find a matching activity for this session
    let matched = false;
    for (let i = 0; i < availableActivities.length; i++) {
      if (consumed[i] !== true && availableActivities[i] === session.sessionType) {
        consumed[i] = true;
        matched = true;
        break;
      }
    }

    if (!matched) {
      return session;
    }
  }

  // All sessions matched - week is complete
  return null;
}
