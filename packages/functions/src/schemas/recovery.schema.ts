import { z } from 'zod';

/**
 * Recovery Schemas
 *
 * Zod validation schemas for health sync API inputs.
 */

// --- Shared Enums ---

export const recoveryStateSchema = z.enum(['ready', 'moderate', 'recover']);

export const recoverySourceSchema = z.enum(['healthkit']);

export const weightSourceSchema = z.enum(['healthkit', 'manual']);

// --- Date Pattern ---

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// --- Recovery Snapshot Schema ---

/**
 * Schema for a recovery snapshot (used in sync request).
 */
export const recoverySnapshotSchema = z.object({
  date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
  hrvMs: z.number().min(0).max(300), // Reasonable HRV range in ms
  hrvVsBaseline: z.number().min(-200).max(200), // % difference
  rhrBpm: z.number().min(30).max(200), // Reasonable RHR range
  rhrVsBaseline: z.number().min(-50).max(50), // BPM difference
  sleepHours: z.number().min(0).max(24),
  sleepEfficiency: z.number().min(0).max(100),
  deepSleepPercent: z.number().min(0).max(100),
  score: z.number().int().min(0).max(100),
  state: recoveryStateSchema,
  source: recoverySourceSchema,
});

export type RecoverySnapshotInput = z.infer<typeof recoverySnapshotSchema>;

// --- Recovery Baseline Schema ---

/**
 * Schema for recovery baseline data.
 */
export const recoveryBaselineSchema = z.object({
  hrvMedian: z.number().min(0).max(300),
  hrvStdDev: z.number().min(0).max(100),
  rhrMedian: z.number().min(30).max(200),
  calculatedAt: z.string().optional(), // ISO 8601 timestamp (optional, server sets if missing)
  sampleCount: z.number().int().min(0).max(1000),
});

export type RecoveryBaselineInput = z.infer<typeof recoveryBaselineSchema>;

// --- Weight Entry Schema ---

/**
 * Schema for a weight entry in sync request.
 */
export const weightEntrySchema = z.object({
  weightLbs: z.number().positive().max(1000),
  date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
});

export type WeightEntryInput = z.infer<typeof weightEntrySchema>;

export const createWeightEntrySchema = weightEntrySchema.extend({
  source: weightSourceSchema.optional(),
});

export type CreateWeightEntryInput = z.infer<typeof createWeightEntrySchema>;

// --- Bulk Weight Sync Schema ---

/**
 * Schema for bulk weight sync request body.
 * Used by the iOS app to sync HealthKit weight history to Firebase.
 */
export const bulkWeightSyncSchema = z.object({
  weights: z.array(weightEntrySchema.extend({
    source: weightSourceSchema.optional(),
  })).min(1).max(500),
});

export type BulkWeightSyncInput = z.infer<typeof bulkWeightSyncSchema>;

// --- Bulk HRV Sync Schema ---

export const bulkHRVSyncSchema = z.object({
  entries: z.array(z.object({
    date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
    avgMs: z.number().min(0).max(300),
    minMs: z.number().min(0).max(300),
    maxMs: z.number().min(0).max(300),
    sampleCount: z.number().int().min(1),
    source: z.enum(['healthkit']).optional(),
  })).min(1).max(500),
});

export type BulkHRVSyncInput = z.infer<typeof bulkHRVSyncSchema>;

// --- Bulk RHR Sync Schema ---

export const bulkRHRSyncSchema = z.object({
  entries: z.array(z.object({
    date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
    avgBpm: z.number().min(30).max(200),
    sampleCount: z.number().int().min(1),
    source: z.enum(['healthkit']).optional(),
  })).min(1).max(500),
});

export type BulkRHRSyncInput = z.infer<typeof bulkRHRSyncSchema>;

// --- Bulk Sleep Sync Schema ---

export const bulkSleepSyncSchema = z.object({
  entries: z.array(z.object({
    date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
    totalSleepMinutes: z.number().int().min(0).max(1440),
    inBedMinutes: z.number().int().min(0).max(1440),
    coreMinutes: z.number().int().min(0).max(1440),
    deepMinutes: z.number().int().min(0).max(1440),
    remMinutes: z.number().int().min(0).max(1440),
    awakeMinutes: z.number().int().min(0).max(1440),
    sleepEfficiency: z.number().min(0).max(110),
    source: z.enum(['healthkit']).optional(),
  })).min(1).max(500),
});

export type BulkSleepSyncInput = z.infer<typeof bulkSleepSyncSchema>;

// --- Sync Health Data Schema ---

/**
 * Schema for the health sync request body.
 */
export const syncHealthDataSchema = z.object({
  recovery: recoverySnapshotSchema,
  baseline: recoveryBaselineSchema.optional(),
  weight: weightEntrySchema.optional(),
});

export type SyncHealthDataInput = z.infer<typeof syncHealthDataSchema>;

// --- Get Recovery Query Schema ---

/**
 * Schema for the get recovery query parameters.
 */
export const getRecoveryQuerySchema = z.object({
  date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format').optional(),
});

export type GetRecoveryQueryInput = z.infer<typeof getRecoveryQuerySchema>;

// --- Coach Recommend Request Schema ---

/**
 * Schema for coach /recommend endpoints (cycling-coach, today-coach).
 * Accepts an optional recovery snapshot without the `source` field.
 */
export const coachRecommendRequestSchema = z.object({
  recovery: recoverySnapshotSchema.omit({ source: true }).optional(),
});
