/**
 * Today Coach Data Aggregation Service
 *
 * Collects all activity data needed for the Today Coach AI.
 * Fetches recovery, lifting, cycling, stretching, meditation, and weight
 * data in parallel and shapes it into the TodayCoachRequest format.
 */

import * as cyclingService from './firestore-cycling.service.js';
import * as recoveryService from './firestore-recovery.service.js';
import {
  calculateTrainingLoadMetrics,
  getWeekInBlock,
  determineNextSession,
  getWeekBoundaries,
  type DailyTSS,
} from './training-load.service.js';
import {
  buildLiftingContext,
  buildLiftingSchedule,
  buildMesocycleContext,
} from './lifting-context.service.js';
import {
  getWorkoutRepository,
  getPlanDayRepository,
  getWorkoutSetRepository,
  getStretchSessionRepository,
  getMeditationSessionRepository,
} from '../repositories/index.js';
import type {
  RecoverySnapshot,
  TodayCoachRequest,
  TodayCoachCyclingContext,
  TodayWorkoutContext,
  StretchingContext,
  MeditationContext,
  CyclingActivitySummary,
  WeightEntry,
  WeightGoal,
  WeightMetrics,
  RecoveryHistoryEntry,
  HealthTrends,
  HRVEntry,
  RHREntry,
  RecentRideStreamSummary,
  ActivityStreamData,
  CyclingActivity,
} from '../shared.js';

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate days since a date string.
 */
function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Compute weight metrics from weight history entries.
 */
function computeWeightMetrics(
  weightHistory: WeightEntry[],
  weightGoal: WeightGoal | null
): WeightMetrics | null {
  if (weightHistory.length === 0 && !weightGoal) {
    return null;
  }

  if (weightHistory.length === 0) {
    return { currentLbs: 0, trend7DayLbs: 0, trend30DayLbs: 0, goal: weightGoal ?? undefined };
  }

  const currentLbs = weightHistory[0]?.weightLbs ?? 0;

  const recent7 = weightHistory.slice(0, 7);
  const avg7 = recent7.reduce((sum, e) => sum + e.weightLbs, 0) / recent7.length;
  const trend7DayLbs = Math.round((currentLbs - avg7) * 10) / 10;

  const avg30 = weightHistory.reduce((sum, e) => sum + e.weightLbs, 0) / weightHistory.length;
  const trend30DayLbs = Math.round((currentLbs - avg30) * 10) / 10;

  return {
    currentLbs,
    trend7DayLbs,
    trend30DayLbs,
    goal: weightGoal ?? undefined,
  };
}

/**
 * Build today's workout context from the active mesocycle.
 * Looks for workouts that were:
 * - Completed today or yesterday (for recovery context)
 * - Scheduled for today (pending/in-progress)
 * @param timezoneOffset - Timezone offset in minutes from client
 */
async function buildTodayWorkoutContext(timezoneOffset: number): Promise<TodayWorkoutContext | null> {
  const workoutRepo = getWorkoutRepository();
  const planDayRepo = getPlanDayRepository();
  const workoutSetRepo = getWorkoutSetRepository();

  // Calculate today in user's timezone
  const now = new Date();
  const userNow = new Date(now.getTime() - timezoneOffset * 60 * 1000);
  const todayStr = formatDate(userNow);

  // Get yesterday's date for recent completions
  const yesterday = new Date(userNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  // Query for workouts scheduled today
  const scheduledToday = await workoutRepo.findByDate(todayStr);

  // Check for pending/in-progress workout scheduled for today
  let todayWorkout = scheduledToday.find(
    (w) => w.status === 'pending' || w.status === 'in_progress'
  );

  // If no scheduled workout, find workouts completed today (regardless of scheduled date)
  if (!todayWorkout) {
    const todayStart = `${todayStr}T00:00:00.000Z`;
    const todayEnd = `${todayStr}T23:59:59.999Z`;

    const completedToday = await workoutRepo.findByCompletedAtRange(todayStart, todayEnd);
    todayWorkout = completedToday[0]; // Take most recent
  }

  // If still no workout, check yesterday for recent completion context
  if (!todayWorkout) {
    const yesterdayStart = `${yesterdayStr}T00:00:00.000Z`;
    const yesterdayEnd = `${yesterdayStr}T23:59:59.999Z`;

    const completedYesterday = await workoutRepo.findByCompletedAtRange(yesterdayStart, yesterdayEnd);
    todayWorkout = completedYesterday[0];
  }

  if (!todayWorkout) {
    return null;
  }

  let planDayName = 'Workout';
  if (todayWorkout.plan_day_id) {
    const planDay = await planDayRepo.findById(todayWorkout.plan_day_id);
    if (planDay) {
      planDayName = planDay.name;
    }
  }

  // Count exercises via workout sets
  const sets = await workoutSetRepo.findByWorkoutId(todayWorkout.id);
  const uniqueExercises = new Set(sets.map((s) => s.exercise_id));

  return {
    planDayName,
    weekNumber: todayWorkout.week_number,
    isDeload: todayWorkout.week_number === 7,
    exerciseCount: uniqueExercises.size,
    status: todayWorkout.status as TodayWorkoutContext['status'],
  };
}

/** Standard Coggan power zone boundaries as fraction of FTP. */
const COGGAN_ZONES: { name: string; min: number; max: number }[] = [
  { name: 'Z1_Recovery', min: 0, max: 0.55 },
  { name: 'Z2_Endurance', min: 0.55, max: 0.75 },
  { name: 'Z3_Tempo', min: 0.75, max: 0.90 },
  { name: 'Z4_Threshold', min: 0.90, max: 1.05 },
  { name: 'Z5_VO2max', min: 1.05, max: 1.20 },
  { name: 'Z6_Anaerobic', min: 1.20, max: 1.50 },
  { name: 'Z7_Neuromuscular', min: 1.50, max: Infinity },
];

/**
 * Compute the best N-second average from a power array.
 * Returns null if the array is shorter than the window.
 */
function bestNSecondPower(watts: number[], windowSeconds: number): number | null {
  if (watts.length < windowSeconds) return null;
  let windowSum = 0;
  for (let i = 0; i < windowSeconds; i++) {
    windowSum += watts[i] ?? 0;
  }
  let best = windowSum;
  for (let i = windowSeconds; i < watts.length; i++) {
    windowSum += (watts[i] ?? 0) - (watts[i - windowSeconds] ?? 0);
    if (windowSum > best) best = windowSum;
  }
  return Math.round(best / windowSeconds);
}

/**
 * Compute normalized power from second-by-second power data.
 * Uses the standard 30-second rolling average method.
 */
function computeNormalizedPower(watts: number[]): number {
  if (watts.length < 30) {
    const avg = watts.reduce((a, b) => a + b, 0) / watts.length;
    return Math.round(avg);
  }
  const windowSize = 30;
  let windowSum = 0;
  for (let i = 0; i < windowSize; i++) {
    windowSum += watts[i] ?? 0;
  }
  let fourthPowerSum = Math.pow(windowSum / windowSize, 4);
  let count = 1;
  for (let i = windowSize; i < watts.length; i++) {
    windowSum += (watts[i] ?? 0) - (watts[i - windowSize] ?? 0);
    fourthPowerSum += Math.pow(windowSum / windowSize, 4);
    count++;
  }
  return Math.round(Math.pow(fourthPowerSum / count, 0.25));
}

/**
 * Compute power zone distribution as percentage of time in each zone.
 */
function computePowerZoneDistribution(watts: number[], ftp: number): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const zone of COGGAN_ZONES) {
    counts[zone.name] = 0;
  }
  for (const w of watts) {
    const ratio = w / ftp;
    for (const zone of COGGAN_ZONES) {
      if (ratio >= zone.min && ratio < zone.max) {
        counts[zone.name] = (counts[zone.name] ?? 0) + 1;
        break;
      }
    }
  }
  const total = watts.length || 1;
  const distribution: Record<string, number> = {};
  for (const zone of COGGAN_ZONES) {
    distribution[zone.name] = Math.round(((counts[zone.name] ?? 0) / total) * 100);
  }
  return distribution;
}

/**
 * Build a RecentRideStreamSummary from raw stream data.
 * Returns null if streams lack power data.
 */
function buildStreamSummary(
  streams: ActivityStreamData,
  activity: CyclingActivity,
  ftp: number
): RecentRideStreamSummary | null {
  const watts = streams.watts;
  if (!watts || watts.length === 0) return null;

  const avgPower = Math.round(watts.reduce((a, b) => a + b, 0) / watts.length);
  const maxPower = Math.max(...watts);
  const normalizedPower = computeNormalizedPower(watts);
  const peak5MinPower = bestNSecondPower(watts, 300);
  const peak20MinPower = bestNSecondPower(watts, 1200);

  const hr = streams.heartrate;
  let avgHR: number | null = null;
  let maxHR: number | null = null;
  if (hr && hr.length > 0) {
    avgHR = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
    maxHR = Math.max(...hr);
  }

  const cadence = streams.cadence;
  let avgCadence: number | null = null;
  if (cadence && cadence.length > 0) {
    const nonZero = cadence.filter((c) => c > 0);
    if (nonZero.length > 0) {
      avgCadence = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
    }
  }

  return {
    avgPower,
    maxPower,
    normalizedPower,
    peak5MinPower,
    peak20MinPower,
    avgHR,
    maxHR,
    hrCompleteness: activity.hrCompleteness ?? 0,
    avgCadence,
    sampleCount: streams.sampleCount,
    durationSeconds: watts.length,
    powerZoneDistribution: computePowerZoneDistribution(watts, ftp),
  };
}

/**
 * Build cycling context for the Today Coach.
 * Returns null if cycling is not set up (no FTP).
 */
async function buildCyclingContext(userId: string): Promise<TodayCoachCyclingContext | null> {
  const [ftp, block, activities] = await Promise.all([
    cyclingService.getCurrentFTP(userId),
    cyclingService.getCurrentTrainingBlock(userId),
    cyclingService.getCyclingActivities(userId, 60),
  ]);

  if (!ftp) {
    return null;
  }

  // Training load
  const dailyTSS: DailyTSS[] = activities.map((a) => ({ date: a.date, tss: a.tss }));
  const metrics = calculateTrainingLoadMetrics(dailyTSS, 60);

  // Week in block
  const weekInBlock = block ? getWeekInBlock(block.startDate) : null;
  const totalWeeks = block ? 8 : null;

  // Next session
  const now = new Date();
  const weeklySessions = block?.weeklySessions ?? [];
  const weekBoundaries = getWeekBoundaries(now);
  const thisWeekActivities = activities.filter((a) => {
    const actDate = a.date.split('T')[0] ?? a.date;
    return actDate >= weekBoundaries.start && actDate <= weekBoundaries.end;
  });
  const nextSessionRaw = determineNextSession(weeklySessions, thisWeekActivities);
  const nextSession = nextSessionRaw
    ? { type: nextSessionRaw.sessionType, description: nextSessionRaw.description }
    : null;

  // Recent activities (trimmed for token efficiency)
  const recentActivities: CyclingActivitySummary[] = activities.slice(0, 7).map((a) => ({
    date: a.date,
    type: a.type,
    durationMinutes: a.durationMinutes,
    tss: a.tss,
  }));

  // VO2 max
  const [latestVO2Max, vo2maxHistory] = await Promise.all([
    cyclingService.getLatestVO2Max(userId),
    cyclingService.getVO2MaxHistory(userId, 5),
  ]);
  const vo2max = latestVO2Max
    ? {
        current: latestVO2Max.value,
        date: latestVO2Max.date,
        method: latestVO2Max.method,
        history: vo2maxHistory.map((e) => ({ date: e.date, value: e.value })),
      }
    : null;

  // EF trend
  const withEF = activities.filter((a) => a.ef !== undefined && a.ef > 0);
  let efTrend = null;
  if (withEF.length >= 4) {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const fourWeeksAgoStr = formatDate(fourWeeksAgo);
    const eightWeeksAgoStr = formatDate(eightWeeksAgo);

    const recent = withEF.filter((a) => (a.date.split('T')[0] ?? a.date) >= fourWeeksAgoStr);
    const previous = withEF.filter((a) => {
      const d = a.date.split('T')[0] ?? a.date;
      return d >= eightWeeksAgoStr && d < fourWeeksAgoStr;
    });

    if (recent.length > 0 && previous.length > 0) {
      const recentAvg = recent.reduce((sum, a) => sum + (a.ef ?? 0), 0) / recent.length;
      const previousAvg = previous.reduce((sum, a) => sum + (a.ef ?? 0), 0) / previous.length;
      const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;
      const trend = changePercent > 3 ? 'improving' as const : changePercent < -3 ? 'declining' as const : 'stable' as const;
      efTrend = {
        recent4WeekAvg: Math.round(recentAvg * 100) / 100,
        previous4WeekAvg: Math.round(previousAvg * 100) / 100,
        trend,
      };
    }
  }

  // Stream summary for the most recent ride within 24 hours
  let lastRideStreams: RecentRideStreamSummary | null = null;
  if (activities.length > 0) {
    const mostRecent = activities[0];
    if (mostRecent) {
      const activityDate = new Date(mostRecent.date);
      const hoursSince = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60);
      if (hoursSince <= 24) {
        const streams = await cyclingService.getActivityStreams(userId, mostRecent.id);
        if (streams) {
          lastRideStreams = buildStreamSummary(streams, mostRecent, ftp.value);
        }
      }
    }
  }

  return {
    ftp: ftp.value,
    trainingLoad: { atl: metrics.atl, ctl: metrics.ctl, tsb: metrics.tsb },
    weekInBlock,
    totalWeeks,
    nextSession,
    recentActivities,
    vo2max,
    efTrend,
    ftpStaleDays: daysSince(ftp.date),
    lastRideStreams,
  };
}

/**
 * Build stretching context for the Today Coach.
 */
async function buildStretchingContext(timezoneOffset: number): Promise<StretchingContext> {
  const stretchRepo = getStretchSessionRepository();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)

  const [latest, thisWeek] = await Promise.all([
    stretchRepo.findLatest(),
    stretchRepo.findInDateRange(formatDate(weekStart), formatDate(now), timezoneOffset),
  ]);

  const lastSessionDate = latest?.completedAt?.split('T')[0] ?? null;
  const daysSinceLastSession = lastSessionDate !== null ? daysSince(lastSessionDate) : null;

  // Extract body regions from last session
  const lastRegions: string[] = [];
  if (latest?.stretches) {
    const regions = new Set(latest.stretches.map((s) => s.region));
    lastRegions.push(...regions);
  }

  return {
    lastSessionDate,
    daysSinceLastSession,
    sessionsThisWeek: thisWeek.length,
    lastRegions,
  };
}

/**
 * Build meditation context for the Today Coach.
 */
async function buildMeditationContext(timezoneOffset: number): Promise<MeditationContext> {
  const meditationRepo = getMeditationSessionRepository();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)

  const [latest, thisWeek] = await Promise.all([
    meditationRepo.findLatest(),
    meditationRepo.findInDateRange(formatDate(weekStart), formatDate(now), timezoneOffset),
  ]);

  const lastSessionDate = latest?.completedAt?.split('T')[0] ?? null;
  const daysSinceLastSession = lastSessionDate !== null ? daysSince(lastSessionDate) : null;

  const totalMinutesThisWeek = thisWeek.reduce(
    (sum, s) => sum + Math.floor(s.actualDurationSeconds / 60),
    0
  );

  // Calculate streak: consecutive days with at least one session
  let currentStreak = 0;
  if (latest) {
    // Look back up to 30 days for streak calculation
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const recentSessions = await meditationRepo.findInDateRange(
      formatDate(thirtyDaysAgo),
      formatDate(now),
      timezoneOffset
    );

    // Build a set of dates with sessions
    const sessionDates = new Set(
      recentSessions.map((s) => s.completedAt.split('T')[0])
    );

    // Count consecutive days going backwards from today (max 30)
    const checkDate = new Date(now);
    for (let i = 0; i < 30; i++) {
      const dateStr = formatDate(checkDate);
      if (sessionDates.has(dateStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return {
    lastSessionDate,
    daysSinceLastSession,
    sessionsThisWeek: thisWeek.length,
    totalMinutesThisWeek,
    currentStreak,
  };
}

/**
 * Compute health trends from real HRV and RHR history data.
 * Compares 7-day avg to 30-day avg to determine trend direction.
 * >5% difference = rising/declining, else stable.
 */
function computeHealthTrends(
  hrvHistory: HRVEntry[],
  rhrHistory: RHREntry[]
): HealthTrends | null {
  if (hrvHistory.length === 0 && rhrHistory.length === 0) {
    return null;
  }

  const hrv7 = hrvHistory.slice(0, 7);
  const hrv7DayAvgMs = hrv7.length > 0
    ? Math.round((hrv7.reduce((sum, e) => sum + e.avgMs, 0) / hrv7.length) * 10) / 10
    : null;
  const hrv30DayAvgMs = hrvHistory.length > 0
    ? Math.round((hrvHistory.reduce((sum, e) => sum + e.avgMs, 0) / hrvHistory.length) * 10) / 10
    : null;

  let hrvTrend: HealthTrends['hrvTrend'] = null;
  if (hrv7DayAvgMs !== null && hrv30DayAvgMs !== null && hrv30DayAvgMs > 0) {
    const changePercent = ((hrv7DayAvgMs - hrv30DayAvgMs) / hrv30DayAvgMs) * 100;
    hrvTrend = changePercent > 5 ? 'rising' : changePercent < -5 ? 'declining' : 'stable';
  }

  const rhr7 = rhrHistory.slice(0, 7);
  const rhr7DayAvgBpm = rhr7.length > 0
    ? Math.round((rhr7.reduce((sum, e) => sum + e.avgBpm, 0) / rhr7.length) * 10) / 10
    : null;
  const rhr30DayAvgBpm = rhrHistory.length > 0
    ? Math.round((rhrHistory.reduce((sum, e) => sum + e.avgBpm, 0) / rhrHistory.length) * 10) / 10
    : null;

  let rhrTrend: HealthTrends['rhrTrend'] = null;
  if (rhr7DayAvgBpm !== null && rhr30DayAvgBpm !== null && rhr30DayAvgBpm > 0) {
    const changePercent = ((rhr7DayAvgBpm - rhr30DayAvgBpm) / rhr30DayAvgBpm) * 100;
    rhrTrend = changePercent > 5 ? 'rising' : changePercent < -5 ? 'declining' : 'stable';
  }

  return {
    hrv7DayAvgMs,
    hrv30DayAvgMs,
    hrvTrend,
    rhr7DayAvgBpm,
    rhr30DayAvgBpm,
    rhrTrend,
  };
}

/**
 * Fetches and shapes all data needed for the Today Coach.
 *
 * @param userId - The user ID
 * @param recovery - The recovery snapshot (provided by iOS)
 * @param timezoneOffset - Timezone offset in minutes
 * @returns Fully populated TodayCoachRequest
 */
export async function buildTodayCoachContext(
  userId: string,
  recovery: RecoverySnapshot,
  timezoneOffset: number
): Promise<TodayCoachRequest> {
  // Fetch everything in parallel
  const [
    recoveryHistory,
    todaysWorkout,
    liftingHistory,
    liftingSchedule,
    mesocycleContext,
    cyclingContext,
    stretchingContext,
    meditationContext,
    weightHistory,
    weightGoal,
    hrvHistory,
    rhrHistory,
  ] = await Promise.all([
    recoveryService.getRecoveryHistory(userId, 7),
    buildTodayWorkoutContext(timezoneOffset),
    buildLiftingContext(timezoneOffset),
    buildLiftingSchedule(),
    buildMesocycleContext(),
    buildCyclingContext(userId),
    buildStretchingContext(timezoneOffset),
    buildMeditationContext(timezoneOffset),
    recoveryService.getWeightHistory(userId, 30),
    cyclingService.getWeightGoal(userId),
    recoveryService.getHRVHistory(userId, 30),
    recoveryService.getRHRHistory(userId, 30),
  ]);

  // Build recovery history entries (trimmed for token efficiency)
  const recoveryHistoryEntries: RecoveryHistoryEntry[] = recoveryHistory.map((r) => ({
    date: r.date,
    score: r.score,
    state: r.state,
    hrvMs: r.hrvMs,
    rhrBpm: r.rhrBpm,
    sleepHours: r.sleepHours,
  }));

  const now = new Date();

  return {
    recovery,
    recoveryHistory: recoveryHistoryEntries,

    todaysWorkout,
    liftingHistory,
    liftingSchedule,
    mesocycleContext: mesocycleContext ?? null,

    cyclingContext,

    stretchingContext,
    meditationContext,

    weightMetrics: computeWeightMetrics(weightHistory, weightGoal),

    healthTrends: computeHealthTrends(hrvHistory, rhrHistory),

    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currentDate: formatDate(now),
  };
}
