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
