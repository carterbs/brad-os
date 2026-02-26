import { z } from 'zod';

const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner']);

export const critiqueInputSchema = z.object({
  critique: z.string().min(1).max(2000),
});

export const critiqueOperationSchema = z.object({
  day_index: z.number().int().min(0).max(6),
  meal_type: mealTypeSchema,
  new_meal_id: z.string().nullable(),
});

export const critiqueResponseSchema = z.object({
  explanation: z.string().min(1).max(2000),
  operations: z.array(critiqueOperationSchema),
});

export type CritiqueInput = z.infer<typeof critiqueInputSchema>;
export type CritiqueOperationDTO = z.infer<typeof critiqueOperationSchema>;
export type CritiqueResponseDTO = z.infer<typeof critiqueResponseSchema>;
