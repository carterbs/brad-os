import { z } from 'zod';

/**
 * Zod schema for creating a meditation session record.
 */
export const createMeditationSessionSchema = z.object({
  completedAt: z.string().datetime(),
  sessionType: z.string().min(1),
  plannedDurationSeconds: z.number().int().positive(),
  actualDurationSeconds: z.number().int().nonnegative(),
  completedFully: z.boolean(),
});

export type CreateMeditationSessionInput = z.infer<
  typeof createMeditationSessionSchema
>;
