/**
 * Cycling Coach Handlers
 *
 * Express app for AI cycling coach endpoints.
 */

import { type Request, type Response, type NextFunction } from 'express';
import { defineSecret } from 'firebase-functions/params';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import * as cyclingService from '../services/firestore-cycling.service.js';
import * as recoveryService from '../services/firestore-recovery.service.js';
import { getCyclingRecommendation, generateSchedule } from '../services/cycling-coach.service.js';
import {
  calculateTrainingLoadMetrics,
  getWeekInBlock,
  determineNextSession,
  getWeekBoundaries,
  type DailyTSS,
} from '../services/training-load.service.js';
import { generateScheduleSchema } from '../schemas/cycling.schema.js';
import { coachRecommendRequestSchema } from '../schemas/recovery.schema.js';
import { validate } from '../middleware/validate.js';
import {
  buildLiftingContext,
  buildLiftingSchedule,
  buildMesocycleContext,
} from '../services/lifting-context.service.js';
import type {
  RecoverySnapshot,
  CyclingCoachRequest,
  CyclingActivity,
  GenerateScheduleRequest,
  WeeklySession,
  WeightEntry,
  WeightGoal,
  WeightMetrics,
  VO2MaxContext,
  RecoveryHistoryEntry,
  EFTrendSummary,
  EFTrend,
} from '../shared.js';

// Define secret for OpenAI API key
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Training philosophy - condensed key points for the AI coach (Peloton-aware)
const TRAINING_PHILOSOPHY = `## Weekly Structure

Sessions are an ordered queue — the athlete works through them in order each week. The next incomplete session is always "next up."

### Peloton Class Type Mapping
- VO2max sessions: Power Zone Max, HIIT & Hills, Tabata
- Threshold sessions: Power Zone, Sweat Steady, Climb
- Endurance sessions: Power Zone Endurance, Low Impact (45-60 min)
- Tempo sessions: Power Zone, Intervals
- Fun sessions: Music/Theme rides, Scenic, Live DJ — whatever the athlete enjoys
- Recovery sessions: Low Impact (20 min), Recovery Ride

## 8-Week Periodization

Weeks 1-2 (Adaptation): Shorter classes (20-30 min for intensity, 30 min for others)
Weeks 3-4 (Build): Standard classes (30-45 min)
Week 5 (Recovery): Shorter/easier classes, reduce intensity
Weeks 6-7 (Peak): Longer classes (45-60 min), highest intensity
Week 8 (Test): FTP retest, easy riding

## Recovery-Based Adjustments

Ready (score >= 70): Full planned session — go for the longer class duration
Moderate (score 50-69): Shorter class or slightly easier class type
Recover (score < 50): 20-min Low Impact or Recovery Ride, or day off

## Lifting Interference

Heavy lower body yesterday: Swap hard session for Low Impact or Recovery Ride
Heavy lower body today: Recovery Ride only
Upper body only: No adjustments needed`;

const app = createBaseApp('cycling-coach');

/**
 * Get user ID from request headers.
 * In production, this would come from Firebase Auth.
 */
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (typeof userId === 'string' && userId.length > 0) {
    return userId;
  }
  return 'default-user';
}

/**
 * Determine session type based on day of week.
 */
function getSessionType(date: Date): 'vo2max' | 'threshold' | 'fun' {
  const day = date.getDay();
  switch (day) {
    case 2: return 'vo2max';    // Tuesday
    case 4: return 'threshold'; // Thursday
    case 6: return 'fun';       // Saturday
    default: return 'fun';      // Other days default to fun
  }
}

/**
 * Calculate days since a date.
 */
function daysSince(dateString: string): number {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

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
 * Compute weight metrics from weight history entries.
 * Returns actual weight data instead of hardcoded zeros.
 */
function computeWeightMetrics(
  weightHistory: WeightEntry[],
  weightGoal: WeightGoal | null
): WeightMetrics {
  if (weightHistory.length === 0) {
    return { currentLbs: 0, trend7DayLbs: 0, trend30DayLbs: 0 };
  }

  // weightHistory is sorted most recent first
  const currentLbs = weightHistory[0]?.weightLbs ?? 0;

  // 7-day average: entries within first 7 entries (already sorted by date desc)
  const recent7 = weightHistory.slice(0, 7);
  const avg7 = recent7.reduce((sum, e) => sum + e.weightLbs, 0) / recent7.length;
  const trend7DayLbs = Math.round((currentLbs - avg7) * 10) / 10;

  // 30-day average: all entries (fetched with 30-day limit)
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
 * Compute EF trend from cycling activities that have valid EF values.
 * Compares recent 4-week avg to previous 4-week avg.
 * >3% change = improving/declining, otherwise stable.
 */
function computeEFTrend(activities: CyclingActivity[]): EFTrendSummary | undefined {
  const withEF = activities.filter((a) => a.ef !== undefined && a.ef > 0);
  if (withEF.length < 4) {
    return undefined;
  }

  const now = new Date();
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(now.getDate() - 28);
  const eightWeeksAgo = new Date(now);
  eightWeeksAgo.setDate(now.getDate() - 56);

  const fourWeeksAgoStr = formatDate(fourWeeksAgo);
  const eightWeeksAgoStr = formatDate(eightWeeksAgo);

  const recent = withEF.filter((a) => {
    const d = a.date.split('T')[0] ?? a.date;
    return d >= fourWeeksAgoStr;
  });
  const previous = withEF.filter((a) => {
    const d = a.date.split('T')[0] ?? a.date;
    return d >= eightWeeksAgoStr && d < fourWeeksAgoStr;
  });

  if (recent.length === 0 || previous.length === 0) {
    return undefined;
  }

  const recentAvg = recent.reduce((sum, a) => sum + (a.ef ?? 0), 0) / recent.length;
  const previousAvg = previous.reduce((sum, a) => sum + (a.ef ?? 0), 0) / previous.length;

  const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;
  let trend: EFTrend = 'stable';
  if (changePercent > 3) trend = 'improving';
  else if (changePercent < -3) trend = 'declining';

  return {
    recent4WeekAvg: Math.round(recentAvg * 100) / 100,
    previous4WeekAvg: Math.round(previousAvg * 100) / 100,
    trend,
  };
}

// POST /cycling-coach/generate-schedule
app.post(
  '/generate-schedule',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const parsed = generateScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.issues,
        },
      });
      return;
    }

    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
      return;
    }

    const scheduleRequest: GenerateScheduleRequest = parsed.data;
    const scheduleResponse = await generateSchedule(scheduleRequest, apiKey);

    res.json({ success: true, data: scheduleResponse });
  })
);

// POST /cycling-coach/recommend
app.post(
  '/recommend',
  validate(coachRecommendRequestSchema),
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const userId = getUserId(req);

    // Recovery data: prefer from request body (iOS-provided), fallback to Firestore
    const requestBody = req.body as { recovery?: RecoverySnapshot };
    let recovery: RecoverySnapshot | undefined = requestBody.recovery;

    if (!recovery) {
      // Fetch from Firestore if not provided in request
      const storedRecovery = await recoveryService.getLatestRecoverySnapshot(userId);
      if (!storedRecovery) {
        res.status(400).json({
          success: false,
          error: {
            code: 'RECOVERY_NOT_SYNCED',
            message: 'No recovery data available. Enable HealthKit sync in the app.'
          },
        });
        return;
      }
      recovery = storedRecovery;
    }

    // Fetch data from Firestore in parallel
    const [
      activities,
      ftp,
      block,
      weightHistory,
      weightGoal,
      latestVO2Max,
      vo2maxHistory,
      cyclingProfile,
      ftpHistory,
      recoveryHistory,
    ] = await Promise.all([
      cyclingService.getCyclingActivities(userId, 60), // Last 60 days for CTL
      cyclingService.getCurrentFTP(userId),
      cyclingService.getCurrentTrainingBlock(userId),
      recoveryService.getWeightHistory(userId, 30),
      cyclingService.getWeightGoal(userId),
      cyclingService.getLatestVO2Max(userId),
      cyclingService.getVO2MaxHistory(userId, 5),
      cyclingService.getCyclingProfile(userId),
      cyclingService.getFTPHistory(userId),
      recoveryService.getRecoveryHistory(userId, 7),
    ]);

    if (!ftp) {
      res.status(400).json({
        success: false,
        error: { code: 'FTP_REQUIRED', message: 'FTP not set. Please set your FTP first.' },
      });
      return;
    }

    // Calculate training load metrics
    const dailyTSS: DailyTSS[] = activities.map((a) => ({
      date: a.date,
      tss: a.tss,
    }));
    const metrics = calculateTrainingLoadMetrics(dailyTSS, 60);

    // Build coach request
    const now = new Date();
    const weekInBlock = block ? getWeekInBlock(block.startDate) : 1;

    // Determine next session from the weekly queue
    const weeklySessions: WeeklySession[] = block?.weeklySessions ?? [];
    const weekBoundaries = getWeekBoundaries(now);

    // Filter this week's activities to determine what's been completed
    const thisWeekActivities = activities.filter((a) => {
      const actDate = a.date.split('T')[0] ?? a.date;
      return actDate >= weekBoundaries.start && actDate <= weekBoundaries.end;
    });

    const nextSession = determineNextSession(weeklySessions, thisWeekActivities);
    const sessionsCompletedThisWeek = weeklySessions.length - (nextSession
      ? weeklySessions.filter((s) => s.order >= nextSession.order).length
      : 0);

    // Build lifting context, mesocycle context in parallel
    const timezoneOffset = parseInt(req.headers['x-timezone-offset'] as string, 10) || 0;
    const [recentLiftingWorkouts, liftingSchedule, mesocycleContext] = await Promise.all([
      buildLiftingContext(timezoneOffset),
      buildLiftingSchedule(),
      buildMesocycleContext(),
    ]);

    // Compute EF trend from the 60-day activities (no extra Firestore reads)
    const efTrend = computeEFTrend(activities);

    // Build VO2 max context if available
    const vo2max: VO2MaxContext | undefined = latestVO2Max
      ? {
          current: latestVO2Max.value,
          date: latestVO2Max.date,
          method: latestVO2Max.method,
          history: vo2maxHistory.map((e) => ({ date: e.date, value: e.value })),
        }
      : undefined;

    // Build recovery history (trimmed fields for token efficiency)
    const recoveryHistoryEntries: RecoveryHistoryEntry[] = recoveryHistory.map((r) => ({
      date: r.date,
      score: r.score,
      state: r.state,
      hrvMs: r.hrvMs,
      rhrBpm: r.rhrBpm,
      sleepHours: r.sleepHours,
    }));

    // Build FTP history (last 5 entries)
    const ftpHistoryTrimmed = ftpHistory.slice(0, 5).map((e) => ({
      date: e.date,
      value: e.value,
      source: e.source,
    }));

    const coachRequest: CyclingCoachRequest = {
      recovery,
      trainingLoad: {
        recentCyclingWorkouts: activities.slice(0, 7), // Last 7 activities
        atl: metrics.atl,
        ctl: metrics.ctl,
        tsb: metrics.tsb,
      },
      recentLiftingWorkouts,
      athlete: {
        ftp: ftp.value,
        ftpLastTestedDate: ftp.date,
        goals: block?.goals ?? [],
        weekInBlock,
        blockStartDate: block?.startDate ?? (now.toISOString().split('T')[0] ?? ''),
        experienceLevel: block?.experienceLevel,
        maxHR: cyclingProfile?.maxHR,
        restingHR: cyclingProfile?.restingHR,
        ftpHistory: ftpHistoryTrimmed.length > 0 ? ftpHistoryTrimmed : undefined,
      },
      weight: computeWeightMetrics(weightHistory, weightGoal),
      schedule: {
        dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
        sessionType: getSessionType(now),
        nextSession,
        sessionsCompletedThisWeek,
        totalSessionsThisWeek: weeklySessions.length,
        weeklySessionQueue: weeklySessions,
        liftingSchedule,
      },
      recoveryHistory: recoveryHistoryEntries.length > 0 ? recoveryHistoryEntries : undefined,
      vo2max,
      efTrend,
      mesocycleContext,
    };

    // Get OpenAI API key
    const apiKey = openaiApiKey.value();
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'OpenAI API key not configured' },
      });
      return;
    }

    // Get recommendation from AI coach
    const recommendation = await getCyclingRecommendation(
      coachRequest,
      TRAINING_PHILOSOPHY,
      apiKey
    );

    // Check if FTP test should be suggested (8+ weeks since last test)
    if (recommendation.suggestFTPTest !== true && daysSince(ftp.date) >= 56) {
      recommendation.suggestFTPTest = true;
      recommendation.warnings = recommendation.warnings ?? [];
      recommendation.warnings.push({
        type: 'ftp_stale',
        message: `Your FTP was last tested ${daysSince(ftp.date)} days ago. Consider retesting.`,
      });
    }

    res.json({ success: true, data: recommendation });
  })
);

// Error handler must be last
app.use(errorHandler);

export const cyclingCoachApp = app;
