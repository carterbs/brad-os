/**
 * Recovery Types
 *
 * Types for HealthKit recovery data synced to Firebase.
 * Used by the health sync endpoint and cycling coach.
 */

// --- Recovery State ---

export type RecoveryState = 'ready' | 'moderate' | 'recover';

export type RecoverySource = 'healthkit';

// --- Recovery Snapshot ---

/**
 * Base recovery metrics for a given day.
 * Used in API requests (from iOS to coach endpoint).
 */
export interface RecoverySnapshot {
  date: string; // YYYY-MM-DD format
  hrvMs: number; // Heart Rate Variability in milliseconds
  hrvVsBaseline: number; // Percentage vs baseline (-100 to +100)
  rhrBpm: number; // Resting Heart Rate in BPM
  rhrVsBaseline: number; // BPM difference from baseline
  sleepHours: number;
  sleepEfficiency: number; // 0-100
  deepSleepPercent: number; // 0-100
  score: number; // Overall recovery score 0-100
  state: RecoveryState;
}

/**
 * Stored recovery snapshot with sync metadata.
 * Used when storing/retrieving from Firestore.
 */
export interface StoredRecoverySnapshot extends RecoverySnapshot {
  source: RecoverySource;
  syncedAt: string; // ISO 8601 timestamp
}

// --- Recovery Baseline ---

/**
 * Baseline values for recovery calculation (60-day rolling medians).
 * Calculated on iOS and synced to Firestore for reference.
 */
export interface RecoveryBaseline {
  hrvMedian: number; // 60-day rolling median HRV in ms
  hrvStdDev: number; // For smallest worthwhile change
  rhrMedian: number; // 60-day rolling median RHR in BPM
  calculatedAt: string; // ISO 8601 timestamp
  sampleCount: number; // Number of samples used in calculation
}

// --- Weight Entry ---

export type WeightSource = 'healthkit' | 'manual';

/**
 * A weight reading synced from HealthKit.
 */
export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD format
  weightLbs: number;
  source: WeightSource;
  syncedAt: string; // ISO 8601 timestamp
}

// --- Sync Request/Response Types ---

/**
 * Request payload for syncing health data from iOS.
 */
export interface SyncHealthDataRequest {
  recovery: RecoverySnapshot & { source: RecoverySource };
  baseline?: Omit<RecoveryBaseline, 'calculatedAt'> & { calculatedAt?: string };
  weight?: {
    weightLbs: number;
    date: string;
  };
}

/**
 * Response payload for health sync.
 */
export interface SyncHealthDataResponse {
  synced: boolean;
  recoveryDate: string;
  baselineUpdated: boolean;
  weightAdded: boolean;
}
