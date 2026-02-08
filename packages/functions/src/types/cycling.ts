/**
 * Cycling Types
 *
 * Types for the AI cycling coach feature including activities, training blocks,
 * FTP tracking, recovery metrics, and coach request/response interfaces.
 */

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

// --- Recovery Types ---

export type RecoveryState = 'ready' | 'moderate' | 'recover';

/**
 * A snapshot of recovery metrics for a given day.
 */
export interface RecoverySnapshot {
  date: string; // ISO 8601 date
  hrvMs: number; // Heart Rate Variability in milliseconds
  hrvVsBaseline: number; // Percentage vs baseline
  rhrBpm: number; // Resting Heart Rate in BPM
  rhrVsBaseline: number; // Percentage vs baseline
  sleepHours: number;
  sleepEfficiency: number; // 0-1
  deepSleepPercent: number; // 0-1
  score: number; // Overall recovery score
  state: RecoveryState;
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

export type SessionType = 'vo2max' | 'threshold' | 'fun' | 'recovery' | 'off';

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
  today: { planned: boolean; workoutName?: string };
  tomorrow: { planned: boolean; workoutName?: string };
  yesterday: { completed: boolean; workoutName?: string };
}

/**
 * Schedule context for the cycling coach.
 */
export interface ScheduleContext {
  dayOfWeek: string;
  sessionType: 'vo2max' | 'threshold' | 'fun';
  liftingSchedule: LiftingScheduleContext;
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
  intervals?: IntervalWorkout;
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
