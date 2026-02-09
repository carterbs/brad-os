/**
 * Cycling Types
 *
 * Types for the AI cycling coach feature including activities, training blocks,
 * FTP tracking, recovery metrics, and coach request/response interfaces.
 */

// Import recovery types used in this file
import type { RecoverySnapshot, RecoveryState } from './recovery.js';
// Re-export recovery types used by cycling coach
export type { RecoveryState, RecoverySnapshot } from './recovery.js';

// --- Cycling Activity Types ---

export type CyclingActivityType =
  | 'vo2max'
  | 'threshold'
  | 'fun'
  | 'recovery'
  | 'unknown';

export type CyclingActivitySource = 'strava';

/**
 * A cycling activity synced from Strava.
 */
export interface CyclingActivity {
  id: string;
  stravaId: number;
  userId: string;
  date: string; // ISO 8601 date
  durationMinutes: number;
  avgPower: number;
  normalizedPower: number;
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  tss: number; // Training Stress Score
  intensityFactor: number;
  type: CyclingActivityType;
  source: CyclingActivitySource;
  ef?: number; // Efficiency Factor (NP / avg_HR)
  peak5MinPower?: number; // Best 5-minute average power
  peak20MinPower?: number; // Best 20-minute average power
  hrCompleteness?: number; // 0-100, percentage of time with HR data
  createdAt: string; // ISO 8601 timestamp
}

// --- Training Block Types ---

export type TrainingGoal = 'regain_fitness' | 'maintain_muscle' | 'lose_weight';

export type TrainingBlockStatus = 'active' | 'completed';

/**
 * A training block representing a period of structured training.
 */
export interface TrainingBlock {
  id: string;
  userId: string;
  startDate: string; // ISO 8601 date
  endDate: string; // ISO 8601 date
  currentWeek: number;
  goals: TrainingGoal[];
  status: TrainingBlockStatus;
  daysPerWeek?: number;
  weeklySessions?: WeeklySession[];
  preferredDays?: number[];
  experienceLevel?: ExperienceLevel;
  weeklyHoursAvailable?: number;
}

// --- FTP Types ---

export type FTPSource = 'manual' | 'test';

/**
 * A Functional Threshold Power (FTP) entry.
 */
export interface FTPEntry {
  id: string;
  userId: string;
  value: number; // Watts
  date: string; // ISO 8601 date
  source: FTPSource;
}

// --- VO2 Max Estimation Types ---

export type VO2MaxMethod = 'ftp_derived' | 'peak_5min' | 'peak_20min';

/**
 * An estimated VO2 max entry.
 */
export interface VO2MaxEstimate {
  id: string;
  userId: string;
  date: string; // ISO 8601
  value: number; // mL/kg/min
  method: VO2MaxMethod;
  sourcePower: number; // watts used for calculation
  sourceWeight: number; // kg used for calculation
  activityId?: string; // Strava activity that produced peak power
  createdAt: string; // ISO 8601
}

// --- Efficiency Factor Types ---

/**
 * Efficiency Factor entry for a cycling activity.
 * EF = Normalized Power / Average Heart Rate
 */
export interface EfficiencyFactorEntry {
  activityId: string;
  date: string; // ISO 8601
  ef: number; // NP / avg_HR
  normalizedPower: number;
  avgHeartRate: number;
  activityType: CyclingActivityType;
}

// --- Cycling Profile Types ---

/**
 * User cycling profile with weight and HR data for VO2 max calculation.
 */
export interface CyclingProfile {
  userId: string;
  weightKg: number;
  maxHR?: number;
  restingHR?: number;
}

// --- Weight Goal Types ---

/**
 * A weight goal with target and tracking info.
 */
export interface WeightGoal {
  userId: string;
  targetWeightLbs: number;
  targetDate: string; // ISO 8601 date
  startWeightLbs: number;
  startDate: string; // ISO 8601 date
}

// --- Lifting Workout Summary ---

/**
 * Summary of a lifting workout for the cycling coach context.
 */
export interface LiftingWorkoutSummary {
  date: string; // ISO 8601 date
  durationMinutes: number;
  avgHeartRate: number;
  maxHeartRate: number;
  activeCalories: number;
  workoutDayName: string;
  setsCompleted: number;
  totalVolume: number; // Total weight moved (lbs)
  isLowerBody?: boolean;
}

// --- Strava Integration Types ---

/**
 * OAuth tokens for Strava API access.
 */
export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  athleteId: number;
}

// --- Cycling Coach Request/Response Types ---

export type SessionType = 'vo2max' | 'threshold' | 'endurance' | 'tempo' | 'fun' | 'recovery' | 'off';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * A session in the weekly training queue.
 * Sessions are ordered by priority (hardest first, fun last).
 */
export interface WeeklySession {
  order: number;
  sessionType: string;
  pelotonClassTypes: string[];
  suggestedDurationMinutes: number;
  description: string;
  preferredDay?: number; // 0-6 (Sun-Sat), hint only
}

/**
 * Request to generate a weekly schedule via AI.
 */
export interface GenerateScheduleRequest {
  sessionsPerWeek: number;
  preferredDays: number[];
  goals: TrainingGoal[];
  experienceLevel: ExperienceLevel;
  weeklyHoursAvailable: number;
  ftp?: number;
}

/**
 * Phase summary within the 8-week block.
 */
export interface PhaseSummary {
  name: string;
  weeks: string;
  description: string;
}

/**
 * Weekly plan summary returned by schedule generation.
 */
export interface WeeklyPlanSummary {
  totalEstimatedHours: number;
  phases: PhaseSummary[];
}

/**
 * Response from the schedule generation endpoint.
 */
export interface GenerateScheduleResponse {
  sessions: WeeklySession[];
  weeklyPlan: WeeklyPlanSummary;
  rationale: string;
}

/**
 * Training load metrics for the cycling coach.
 */
export interface TrainingLoadMetrics {
  recentCyclingWorkouts: CyclingActivity[];
  atl: number; // Acute Training Load
  ctl: number; // Chronic Training Load
  tsb: number; // Training Stress Balance
}

/**
 * Athlete profile for the cycling coach.
 */
export interface AthleteProfile {
  ftp: number; // Functional Threshold Power in watts
  ftpLastTestedDate: string; // ISO 8601 date
  goals: string[];
  weekInBlock: number;
  blockStartDate: string; // ISO 8601 date
  experienceLevel?: ExperienceLevel;
  maxHR?: number;
  restingHR?: number;
  ftpHistory?: Array<{ date: string; value: number; source: FTPSource }>;
}

/**
 * Weight metrics for the cycling coach.
 */
export interface WeightMetrics {
  currentLbs: number;
  trend7DayLbs: number;
  trend30DayLbs: number;
  goal?: WeightGoal;
}

/**
 * Lifting schedule context for the cycling coach.
 */
export interface LiftingScheduleContext {
  today: { planned: boolean; workoutName?: string; isLowerBody?: boolean };
  tomorrow: { planned: boolean; workoutName?: string; isLowerBody?: boolean };
  yesterday: { completed: boolean; workoutName?: string; isLowerBody?: boolean };
}

/**
 * Schedule context for the cycling coach.
 */
export interface ScheduleContext {
  dayOfWeek: string;
  sessionType: 'vo2max' | 'threshold' | 'fun';
  nextSession: WeeklySession | null;
  sessionsCompletedThisWeek: number;
  totalSessionsThisWeek: number;
  weeklySessionQueue: WeeklySession[];
  liftingSchedule: LiftingScheduleContext;
}

// --- VO2 Max Context for Coach ---

/**
 * VO2 max context with current value and trend history for the cycling coach.
 */
export interface VO2MaxContext {
  current: number; // mL/kg/min
  date: string;
  method: VO2MaxMethod;
  history: Array<{ date: string; value: number }>;
}

// --- Recovery History for Coach ---

/**
 * A trimmed recovery entry for multi-day trend analysis.
 */
export interface RecoveryHistoryEntry {
  date: string;
  score: number;
  state: RecoveryState;
  hrvMs: number;
  sleepHours: number;
}

/**
 * Request payload for the cycling coach AI.
 */
export interface CyclingCoachRequest {
  recovery: RecoverySnapshot;
  trainingLoad: TrainingLoadMetrics;
  recentLiftingWorkouts: LiftingWorkoutSummary[];
  athlete: AthleteProfile;
  weight: WeightMetrics;
  schedule: ScheduleContext;
  recoveryHistory?: RecoveryHistoryEntry[];
  vo2max?: VO2MaxContext;
}

/**
 * Interval workout definition.
 */
export interface IntervalWorkout {
  protocol: string;
  count: number;
  workSeconds: number;
  restSeconds: number;
  targetPowerPercent: { min: number; max: number };
}

/**
 * Target TSS range for a session.
 */
export interface TargetTSSRange {
  min: number;
  max: number;
}

/**
 * Session recommendation from the cycling coach.
 */
export interface SessionRecommendation {
  type: SessionType;
  durationMinutes: number;
  pelotonClassTypes: string[];
  pelotonTip: string;
  targetTSS: TargetTSSRange;
  targetZones: string;
}

/**
 * Warning from the cycling coach.
 */
export interface CoachWarning {
  type: string;
  message: string;
}

/**
 * Response payload from the cycling coach AI.
 */
export interface CyclingCoachResponse {
  session: SessionRecommendation;
  reasoning: string;
  coachingTips?: string[];
  warnings?: CoachWarning[];
  suggestFTPTest?: boolean;
}
