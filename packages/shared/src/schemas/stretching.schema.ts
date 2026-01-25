import { z } from 'zod';

/**
 * Zod schema for a completed stretch within a session.
 */
export const completedStretchSchema = z.object({
  region: z.enum([
    'neck',
    'shoulders',
    'back',
    'hip_flexors',
    'glutes',
    'hamstrings',
    'quads',
    'calves',
  ]),
  stretchId: z.string().min(1),
  stretchName: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  skippedSegments: z.number().int().min(0).max(2),
});

/**
 * Zod schema for creating a stretch session record.
 */
export const createStretchSessionSchema = z.object({
  completedAt: z.string().datetime(),
  totalDurationSeconds: z.number().int().nonnegative(),
  regionsCompleted: z.number().int().nonnegative(),
  regionsSkipped: z.number().int().nonnegative(),
  stretches: z.array(completedStretchSchema).min(1),
});

export type CreateStretchSessionInput = z.infer<
  typeof createStretchSessionSchema
>;
