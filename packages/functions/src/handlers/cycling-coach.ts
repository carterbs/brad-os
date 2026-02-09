/**
 * Cycling Coach Handlers
 *
 * Express app for AI cycling coach endpoints.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { defineSecret } from 'firebase-functions/params';
import { errorHandler } from '../middleware/error-handler.js';
import { stripPathPrefix } from '../middleware/strip-path-prefix.js';
import { requireAppCheck } from '../middleware/app-check.js';
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
import {
  getWorkoutRepository,
  getPlanDayRepository,
  getWorkoutSetRepository,
} from '../repositories/index.js';
import type {
  RecoverySnapshot,
  CyclingCoachRequest,
  GenerateScheduleRequest,
  WeeklySession,
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  Workout,
  WeightEntry,
  WeightGoal,
  WeightMetrics,
  VO2MaxContext,
  RecoveryHistoryEntry,
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

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(stripPathPrefix('cycling-coach'));
app.use(requireAppCheck);

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
 * Detect if a workout name suggests lower body exercises.
 */
function isLowerBodyWorkout(planDayName: string): boolean {
  const lower = planDayName.toLowerCase();
  return (
    lower.includes('leg') ||
    lower.includes('lower') ||
    lower.includes('squat') ||
    lower.includes('deadlift')
  );
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
 * Build lifting workout context from the last 7 days of completed workouts.
 */
async function buildLiftingContext(timezoneOffset: number): Promise<LiftingWorkoutSummary[]> {
  const workoutRepo = getWorkoutRepository();
  const planDayRepo = getPlanDayRepository();
  const workoutSetRepo = getWorkoutSetRepository();

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const startDate = formatDate(sevenDaysAgo);
  const endDate = formatDate(now);

  const completedWorkouts = await workoutRepo.findCompletedInDateRange(
    startDate,
    endDate,
    timezoneOffset
  );

  const summaries: LiftingWorkoutSummary[] = [];

  for (const workout of completedWorkouts) {
    // Look up plan day name
    let workoutDayName = 'Workout';
    let lowerBody = false;
    if (workout.plan_day_id) {
      const planDay = await planDayRepo.findById(workout.plan_day_id);
      if (planDay) {
        workoutDayName = planDay.name;
        lowerBody = isLowerBodyWorkout(planDay.name);
      }
    }

    // Calculate sets and volume
    const sets = await workoutSetRepo.findByWorkoutId(workout.id);
    let setsCompleted = 0;
    let totalVolume = 0;

    for (const set of sets) {
      if (set.status === 'completed') {
        setsCompleted++;
        if (set.actual_weight !== null && set.actual_reps !== null) {
          totalVolume += set.actual_weight * set.actual_reps;
        }
      }
    }

    // Calculate duration from timestamps
    let durationMinutes = 0;
    if (workout.started_at !== null && workout.completed_at !== null) {
      const startMs = new Date(workout.started_at).getTime();
      const endMs = new Date(workout.completed_at).getTime();
      durationMinutes = Math.round((endMs - startMs) / (1000 * 60));
    }

    summaries.push({
      date: workout.completed_at ?? workout.scheduled_date,
      durationMinutes,
      avgHeartRate: 0, // Not available from Firestore
      maxHeartRate: 0,
      activeCalories: 0,
      workoutDayName,
      setsCompleted,
      totalVolume,
      isLowerBody: lowerBody,
    });
  }

  return summaries;
}

/**
 * Build lifting schedule context for today/tomorrow/yesterday.
 */
async function buildLiftingSchedule(): Promise<LiftingScheduleContext> {
  const workoutRepo = getWorkoutRepository();
  const planDayRepo = getPlanDayRepository();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const todayStr = formatDate(now);
  const yesterdayStr = formatDate(yesterday);
  const tomorrowStr = formatDate(tomorrow);

  // Helper to get workout name and lower body status
  async function getWorkoutInfo(workout: Workout): Promise<{ name: string; isLowerBody: boolean }> {
    if (workout.plan_day_id) {
      const planDay = await planDayRepo.findById(workout.plan_day_id);
      if (planDay) {
        return { name: planDay.name, isLowerBody: isLowerBodyWorkout(planDay.name) };
      }
    }
    return { name: 'Workout', isLowerBody: false };
  }

  // Yesterday: completed workouts
  const yesterdayWorkouts = await workoutRepo.findCompletedInDateRange(yesterdayStr, yesterdayStr);
  let yesterdayResult: LiftingScheduleContext['yesterday'] = { completed: false };
  if (yesterdayWorkouts.length > 0 && yesterdayWorkouts[0]) {
    const info = await getWorkoutInfo(yesterdayWorkouts[0]);
    yesterdayResult = { completed: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  // Today: pending or in-progress workouts
  const todayWorkouts = await workoutRepo.findByDate(todayStr);
  const todayPlanned = todayWorkouts.filter(
    (w) => w.status === 'pending' || w.status === 'in_progress'
  );
  let todayResult: LiftingScheduleContext['today'] = { planned: false };
  if (todayPlanned.length > 0 && todayPlanned[0]) {
    const info = await getWorkoutInfo(todayPlanned[0]);
    todayResult = { planned: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  // Tomorrow: pending workouts
  const tomorrowWorkouts = await workoutRepo.findByDate(tomorrowStr);
  const tomorrowPlanned = tomorrowWorkouts.filter((w) => w.status === 'pending');
  let tomorrowResult: LiftingScheduleContext['tomorrow'] = { planned: false };
  if (tomorrowPlanned.length > 0 && tomorrowPlanned[0]) {
    const info = await getWorkoutInfo(tomorrowPlanned[0]);
    tomorrowResult = { planned: true, workoutName: info.name, isLowerBody: info.isLowerBody };
  }

  return {
    today: todayResult,
    tomorrow: tomorrowResult,
    yesterday: yesterdayResult,
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

    // Build lifting context in parallel
    const timezoneOffset = parseInt(req.headers['x-timezone-offset'] as string, 10) || 0;
    const [recentLiftingWorkouts, liftingSchedule] = await Promise.all([
      buildLiftingContext(timezoneOffset),
      buildLiftingSchedule(),
    ]);

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
