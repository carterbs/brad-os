import { z } from 'zod';
import { recoverySnapshotSchema, recoveryStateSchema } from './recovery.schema.js';

const recoveryStatusSchema = z.enum(['great', 'good', 'caution', 'warning']);
const prioritySchema = z.enum(['high', 'normal', 'rest']);
const cyclingPrioritySchema = z.enum(['high', 'normal', 'skip']);
const stretchingPrioritySchema = z.enum(['high', 'normal', 'low']);
const meditationPrioritySchema = z.enum(['high', 'normal', 'low']);
const timeOfDaySchema = z.enum([
  'early_morning',
  'morning',
  'midday',
  'afternoon',
  'evening',
  'night',
]);
const workoutStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'skipped']);
const targetTssSchema = z.object({
  min: z.number(),
  max: z.number(),
}).strict();
const sessionTypeSchema = z.enum([
  'vo2max',
  'threshold',
  'endurance',
  'tempo',
  'fun',
  'recovery',
  'off',
]);
const trendSchema = z.enum(['rising', 'stable', 'declining']).nullable();

export const todayCoachRecoverySnapshotSchema = recoverySnapshotSchema.omit({ source: true });

export const todayCoachRecoveryHistoryEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  score: z.number().int().min(0).max(100),
  state: recoveryStateSchema,
  hrvMs: z.number().min(0).max(300),
  rhrBpm: z.number().min(30).max(200),
  sleepHours: z.number().min(0).max(24),
}).strict();

export const healthTrendsSchema = z.object({
  hrv7DayAvgMs: z.number().nullable(),
  hrv30DayAvgMs: z.number().nullable(),
  hrvTrend: trendSchema,
  rhr7DayAvgBpm: z.number().nullable(),
  rhr30DayAvgBpm: z.number().nullable(),
  rhrTrend: trendSchema,
}).strict();

export const todayCoachTimeContextSchema = z.object({
  timeOfDay: timeOfDaySchema,
  currentHour: z.number().int().min(0).max(23),
}).strict();

export const completedActivitiesSchema = z.object({
  hasLiftedToday: z.boolean(),
  liftedAt: z.string().nullable(),
  hasCycledToday: z.boolean(),
  cycledAt: z.string().nullable(),
  hasStretchedToday: z.boolean(),
  stretchedAt: z.string().nullable(),
  hasMeditatedToday: z.boolean(),
  meditatedAt: z.string().nullable(),
}).strict();

export const todayWorkoutContextSchema = z.object({
  planDayName: z.string(),
  weekNumber: z.number(),
  isDeload: z.boolean(),
  exerciseCount: z.number().nonnegative(),
  status: workoutStatusSchema,
  completedAt: z.string().nullable(),
}).strict();

export const todayCoachCyclingActivitySummarySchema = z.object({
  date: z.string(),
  type: z.string(),
  durationMinutes: z.number(),
  tss: z.number(),
}).strict();

export const vo2maxContextSchema = z.object({
  current: z.number(),
  date: z.string(),
  method: z.enum(['ftp_derived', 'peak_5min', 'peak_20min']),
  history: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      value: z.number(),
    }).strict()
  ),
}).strict();

export const efTrendSummarySchema = z.object({
  recent4WeekAvg: z.number(),
  previous4WeekAvg: z.number(),
  trend: z.enum(['improving', 'stable', 'declining']),
}).strict();

export const weightGoalSchema = z.object({
  userId: z.string(),
  targetWeightLbs: z.number(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startWeightLbs: z.number(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const weightMetricsSchema = z.object({
  currentLbs: z.number(),
  trend7DayLbs: z.number(),
  trend30DayLbs: z.number(),
  goal: weightGoalSchema.optional(),
}).strict();

export const liftingWorkoutSummarySchema = z.object({
  date: z.string(),
  durationMinutes: z.number(),
  avgHeartRate: z.number(),
  maxHeartRate: z.number(),
  activeCalories: z.number(),
  workoutDayName: z.string(),
  setsCompleted: z.number().nonnegative(),
  totalVolume: z.number(),
  isLowerBody: z.boolean().optional(),
}).strict();

export const liftingScheduleContextSchema = z.object({
  today: z.object({
    planned: z.boolean(),
    workoutName: z.string().optional(),
    isLowerBody: z.boolean().optional(),
  }).strict(),
  tomorrow: z.object({
    planned: z.boolean(),
    workoutName: z.string().optional(),
    isLowerBody: z.boolean().optional(),
  }).strict(),
  yesterday: z.object({
    completed: z.boolean(),
    workoutName: z.string().optional(),
    isLowerBody: z.boolean().optional(),
  }).strict(),
}).strict();

export const mesocycleContextSchema = z.object({
  currentWeek: z.number().int().min(1).max(7),
  isDeloadWeek: z.boolean(),
  planName: z.string(),
}).strict();

export const recentRideStreamSummarySchema = z.object({
  avgPower: z.number(),
  maxPower: z.number(),
  normalizedPower: z.number(),
  peak5MinPower: z.number().nullable(),
  peak20MinPower: z.number().nullable(),
  avgHR: z.number().nullable(),
  maxHR: z.number().nullable(),
  hrCompleteness: z.number(),
  avgCadence: z.number().nullable(),
  sampleCount: z.number(),
  durationSeconds: z.number(),
  powerZoneDistribution: z.record(z.string(), z.number()),
}).strict();

export const tomorrowSessionSchema = z.object({
  type: z.string(),
  description: z.string(),
}).strict();

export const todayCoachSessionSchema = z.object({
  type: sessionTypeSchema,
  durationMinutes: z.number(),
  pelotonClassTypes: z.array(z.string()),
  pelotonTip: z.string(),
  targetTSS: targetTssSchema,
  targetZones: z.string(),
}).strict();

export const todayCoachCyclingContextSchema = z.object({
  ftp: z.number(),
  trainingLoad: z.object({
    atl: z.number(),
    ctl: z.number(),
    tsb: z.number(),
  }).strict(),
  weekInBlock: z.number().nullable(),
  totalWeeks: z.number().nullable(),
  nextSession: tomorrowSessionSchema.nullable(),
  recentActivities: z.array(todayCoachCyclingActivitySummarySchema),
  vo2max: vo2maxContextSchema.nullable(),
  efTrend: efTrendSummarySchema.nullable(),
  ftpStaleDays: z.number(),
  lastRideStreams: recentRideStreamSummarySchema.nullable(),
}).strict();

export const stretchingContextSchema = z.object({
  lastSessionDate: z.string().nullable(),
  daysSinceLastSession: z.number().nullable(),
  sessionsThisWeek: z.number(),
  lastRegions: z.array(z.string()),
}).strict();

export const meditationContextSchema = z.object({
  lastSessionDate: z.string().nullable(),
  daysSinceLastSession: z.number().nullable(),
  sessionsThisWeek: z.number(),
  totalMinutesThisWeek: z.number(),
  currentStreak: z.number(),
}).strict();

export const todayCoachRequestSchema = z.object({
  recovery: todayCoachRecoverySnapshotSchema,
  recoveryHistory: z.array(todayCoachRecoveryHistoryEntrySchema),
  todaysWorkout: todayWorkoutContextSchema.nullable(),
  liftingHistory: z.array(liftingWorkoutSummarySchema),
  liftingSchedule: liftingScheduleContextSchema,
  mesocycleContext: mesocycleContextSchema.nullable(),
  cyclingContext: todayCoachCyclingContextSchema.nullable(),
  stretchingContext: stretchingContextSchema,
  meditationContext: meditationContextSchema,
  weightMetrics: weightMetricsSchema.nullable(),
  healthTrends: healthTrendsSchema.nullable(),
  timezone: z.string(),
  currentDate: z.string(),
  timeContext: todayCoachTimeContextSchema,
  completedActivities: completedActivitiesSchema,
}).strict();

export const todayCoachResponseSchema = z.object({
  dailyBriefing: z.string(),
  sections: z.object({
    recovery: z.object({
      insight: z.string(),
      status: recoveryStatusSchema,
    }).strict(),
    lifting: z.object({
      insight: z.string(),
      workout: z.object({
        planDayName: z.string(),
        weekNumber: z.number(),
        isDeload: z.boolean(),
        exerciseCount: z.number(),
        status: workoutStatusSchema,
      }).strict().nullable(),
      priority: prioritySchema,
    }).strict().nullable(),
    cycling: z.object({
      insight: z.string(),
      session: todayCoachSessionSchema.nullable(),
      priority: cyclingPrioritySchema,
    }).strict().nullable(),
    stretching: z.object({
      insight: z.string(),
      suggestedRegions: z.array(z.string()),
      priority: stretchingPrioritySchema,
    }).strict(),
    meditation: z.object({
      insight: z.string(),
      suggestedDurationMinutes: z.number(),
      priority: meditationPrioritySchema,
    }).strict(),
    weight: z.object({
      insight: z.string(),
    }).strict().nullable(),
  }).strict(),
  warnings: z.array(
    z.object({
      type: z.string(),
      message: z.string(),
    }).strict()
  ),
}).strict();

export type TodayCoachRecoverySnapshotDTO = z.infer<typeof todayCoachRecoverySnapshotSchema>;
export type TodayCoachRecoveryHistoryEntryDTO = z.infer<typeof todayCoachRecoveryHistoryEntrySchema>;
export type HealthTrendsDTO = z.infer<typeof healthTrendsSchema>;
export type TimeContextDTO = z.infer<typeof todayCoachTimeContextSchema>;
export type CompletedActivitiesDTO = z.infer<typeof completedActivitiesSchema>;
export type TodayWorkoutContextDTO = z.infer<typeof todayWorkoutContextSchema>;
export type TodayCoachCyclingActivitySummaryDTO = z.infer<typeof todayCoachCyclingActivitySummarySchema>;
export type VO2MaxContextDTO = z.infer<typeof vo2maxContextSchema>;
export type EFTrendSummaryDTO = z.infer<typeof efTrendSummarySchema>;
export type WeightGoalDTO = z.infer<typeof weightGoalSchema>;
export type WeightMetricsDTO = z.infer<typeof weightMetricsSchema>;
export type LiftingWorkoutSummaryDTO = z.infer<typeof liftingWorkoutSummarySchema>;
export type LiftingScheduleContextDTO = z.infer<typeof liftingScheduleContextSchema>;
export type MesocycleContextDTO = z.infer<typeof mesocycleContextSchema>;
export type RecentRideStreamSummaryDTO = z.infer<typeof recentRideStreamSummarySchema>;
export type TodayCoachCyclingContextDTO = z.infer<typeof todayCoachCyclingContextSchema>;
export type StretchingContextDTO = z.infer<typeof stretchingContextSchema>;
export type MeditationContextDTO = z.infer<typeof meditationContextSchema>;
export type TodayCoachRequestDTO = z.infer<typeof todayCoachRequestSchema>;
export type TodayCoachRecoverySectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['recovery'];
export type TodayCoachLiftingSectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['lifting'];
export type TodayCoachCyclingSectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['cycling'];
export type TodayCoachStretchingSectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['stretching'];
export type TodayCoachMeditationSectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['meditation'];
export type TodayCoachWeightSectionDTO = z.infer<typeof todayCoachResponseSchema>['sections']['weight'];
export type TodayCoachWarningDTO = z.infer<typeof todayCoachResponseSchema>['warnings'][number];
export type TodayCoachSectionsDTO = z.infer<typeof todayCoachResponseSchema>['sections'];
export type TodayCoachResponseDTO = z.infer<typeof todayCoachResponseSchema>;
