/**
 * Cycling Types
 *
 * Types for stored Strava activities and derived wellness metrics.
 */

import type { RecoveryState } from './recovery.js';
export type { RecoveryState } from './recovery.js';

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

/**
 * Partial update for cycling activity optional fields.
 */
export type CyclingActivityUpdate = Partial<
  Pick<CyclingActivity, 'ef' | 'peak5MinPower' | 'peak20MinPower' | 'hrCompleteness'>
>;

/**
 * Result of deleting a cycling activity.
 */
export interface DeleteCyclingActivityResult {
  deleted: boolean;
  hadStreams: boolean;
}

/**
 * Raw time-series stream data stored per activity.
 * Stored in subcollection: cyclingActivities/{activityId}/streams/data
 */
export interface ActivityStreamData {
  activityId: string;
  stravaActivityId: number;
  watts?: number[];
  heartrate?: number[];
  time?: number[];
  cadence?: number[];
  sampleCount: number;
  createdAt: string;
}

// --- Training Load Types ---

/**
 * Daily TSS entry for training load calculations.
 */
export interface DailyTSS {
  date: string; // ISO 8601 date (YYYY-MM-DD)
  tss: number;
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

// --- Strava API Types ---

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

/**
 * Training load metrics derived from stored rides.
 */
export interface TrainingLoadMetrics {
  recentCyclingWorkouts: CyclingActivity[];
  atl: number; // Acute Training Load
  ctl: number; // Chronic Training Load
  tsb: number; // Training Stress Balance
}

/**
 * Weight metrics supplied to Today Coach.
 */
export interface WeightMetrics {
  currentLbs: number;
  trend7DayLbs: number;
  trend30DayLbs: number;
  goal?: WeightGoal;
}

/** Lifting schedule context supplied to Today Coach. */
export interface LiftingScheduleContext {
  today: { planned: boolean; workoutName?: string; isLowerBody?: boolean };
  tomorrow: { planned: boolean; workoutName?: string; isLowerBody?: boolean };
  yesterday: { completed: boolean; workoutName?: string; isLowerBody?: boolean };
}

// --- VO2 Max Context ---

/**
 * VO2 max context with current value and trend history for the cycling coach.
 */
export interface VO2MaxContext {
  current: number; // mL/kg/min
  date: string;
  method: VO2MaxMethod;
  history: Array<{ date: string; value: number }>;
}

// --- Recovery History ---

/**
 * A trimmed recovery entry for multi-day trend analysis.
 */
export interface RecoveryHistoryEntry {
  date: string;
  score: number;
  state: RecoveryState;
  hrvMs: number;
  rhrBpm: number;
  sleepHours: number;
}

// --- EF Trend Summary ---

export type EFTrend = 'improving' | 'stable' | 'declining';

/**
 * Efficiency Factor trend over recent weeks.
 */
export interface EFTrendSummary {
  recent4WeekAvg: number;
  previous4WeekAvg: number;
  trend: EFTrend;
}

// --- Mesocycle Context ---

/**
 * Context about the current lifting mesocycle for the cycling coach.
 */
export interface MesocycleContext {
  currentWeek: number; // 1-7
  isDeloadWeek: boolean;
  planName: string;
}
