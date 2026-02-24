/**
 * Today Coach Types
 *
 * Types for the holistic Today Coach feature that aggregates all activity
 * domains (recovery, lifting, cycling, stretching, meditation, weight)
 * for AI-powered daily briefings.
 */

import type { RecoverySnapshot } from './recovery.js';
import type {
  SessionRecommendation,
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  MesocycleContext,
  WeightMetrics,
  RecoveryHistoryEntry,
  VO2MaxContext,
  EFTrendSummary,
} from './cycling.js';

// Re-export types used by consumers
export type {
  RecoverySnapshot,
  RecoveryHistoryEntry,
  LiftingWorkoutSummary,
  LiftingScheduleContext,
  MesocycleContext,
  WeightMetrics,
  SessionRecommendation,
} from './cycling.js';

// --- Health Trends ---

/**
 * HRV and RHR trend data computed from real HealthKit history.
 */
export interface HealthTrends {
  hrv7DayAvgMs: number | null;
  hrv30DayAvgMs: number | null;
  hrvTrend: 'rising' | 'stable' | 'declining' | null;
  rhr7DayAvgBpm: number | null;
  rhr30DayAvgBpm: number | null;
  rhrTrend: 'rising' | 'stable' | 'declining' | null;
}

// --- Today Coach Request Types ---

/**
 * Time-of-day context for coaching.
 */
export interface TimeContext {
  /** Time of day category based on user's local hour */
  timeOfDay: 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
  /** Current hour in user's local time (0-23) */
  currentHour: number;
}

/**
 * Activity completion tracking for today.
 */
export interface CompletedActivities {
  hasLiftedToday: boolean;
  liftedAt: string | null;
  hasCycledToday: boolean;
  cycledAt: string | null;
  hasStretchedToday: boolean;
  stretchedAt: string | null;
  hasMeditatedToday: boolean;
  meditatedAt: string | null;
}

/**
 * Today's workout context from the active mesocycle.
 */
export interface TodayWorkoutContext {
  planDayName: string;
  weekNumber: number;
  isDeload: boolean;
  exerciseCount: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completedAt: string | null;
}

/**
 * Pre-computed summary of stream data from the most recent ride.
 * Sent instead of raw arrays to stay within token limits.
 */
export interface RecentRideStreamSummary {
  avgPower: number;
  maxPower: number;
  normalizedPower: number;
  peak5MinPower: number | null;
  peak20MinPower: number | null;
  avgHR: number | null;
  maxHR: number | null;
  hrCompleteness: number;
  avgCadence: number | null;
  sampleCount: number;
  durationSeconds: number;
  /** Percentage of time in each Coggan power zone (Z1-Z7), keyed by zone name. */
  powerZoneDistribution: Record<string, number>;
}

/**
 * Cycling context for the Today Coach.
 */
export interface TodayCoachCyclingContext {
  ftp: number;
  trainingLoad: { atl: number; ctl: number; tsb: number };
  weekInBlock: number | null;
  totalWeeks: number | null;
  nextSession: { type: string; description: string } | null;
  recentActivities: TodayCoachCyclingActivitySummary[];
  vo2max: VO2MaxContext | null;
  efTrend: EFTrendSummary | null;
  ftpStaleDays: number;
  lastRideStreams: RecentRideStreamSummary | null;
}

/**
 * Summary of a cycling activity for the Today Coach (trimmed for token efficiency).
 */
export interface TodayCoachCyclingActivitySummary {
  date: string;
  type: string;
  durationMinutes: number;
  tss: number;
}

/**
 * Stretching context for the Today Coach.
 */
export interface StretchingContext {
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsThisWeek: number;
  lastRegions: string[];
}

/**
 * Meditation context for the Today Coach.
 */
export interface MeditationContext {
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsThisWeek: number;
  totalMinutesThisWeek: number;
  currentStreak: number;
}

/**
 * Full request payload sent to the Today Coach AI.
 */
export interface TodayCoachRequest {
  recovery: RecoverySnapshot;
  recoveryHistory: RecoveryHistoryEntry[];

  todaysWorkout: TodayWorkoutContext | null;
  liftingHistory: LiftingWorkoutSummary[];
  liftingSchedule: LiftingScheduleContext;
  mesocycleContext: MesocycleContext | null;

  cyclingContext: TodayCoachCyclingContext | null;

  stretchingContext: StretchingContext;
  meditationContext: MeditationContext;

  weightMetrics: WeightMetrics | null;

  healthTrends: HealthTrends | null;

  timezone: string;
  currentDate: string;

  timeContext: TimeContext;
  completedActivities: CompletedActivities;
}

// --- Today Coach Response Types ---

/**
 * Recovery section in the Today Coach response.
 */
export interface TodayCoachRecoverySection {
  insight: string;
  status: 'great' | 'good' | 'caution' | 'warning';
}

/**
 * Lifting section in the Today Coach response.
 */
export interface TodayCoachLiftingSection {
  insight: string;
  workout: {
    planDayName: string;
    weekNumber: number;
    isDeload: boolean;
    exerciseCount: number;
    status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  } | null;
  priority: 'high' | 'normal' | 'rest';
}

/**
 * Cycling section in the Today Coach response.
 */
export interface TodayCoachCyclingSection {
  insight: string;
  session: SessionRecommendation | null;
  priority: 'high' | 'normal' | 'skip';
}

/**
 * Stretching section in the Today Coach response.
 */
export interface TodayCoachStretchingSection {
  insight: string;
  suggestedRegions: string[];
  priority: 'high' | 'normal' | 'low';
}

/**
 * Meditation section in the Today Coach response.
 */
export interface TodayCoachMeditationSection {
  insight: string;
  suggestedDurationMinutes: number;
  priority: 'high' | 'normal' | 'low';
}

/**
 * Weight section in the Today Coach response.
 */
export interface TodayCoachWeightSection {
  insight: string;
}

/**
 * Warning from the Today Coach.
 */
export interface TodayCoachWarning {
  type: string;
  message: string;
}

/**
 * Sections in the Today Coach response.
 */
export interface TodayCoachSections {
  recovery: TodayCoachRecoverySection;
  lifting: TodayCoachLiftingSection | null;
  cycling: TodayCoachCyclingSection | null;
  stretching: TodayCoachStretchingSection;
  meditation: TodayCoachMeditationSection;
  weight: TodayCoachWeightSection | null;
}

/**
 * Full response from the Today Coach AI.
 */
export interface TodayCoachResponse {
  dailyBriefing: string;
  sections: TodayCoachSections;
  warnings: TodayCoachWarning[];
}
