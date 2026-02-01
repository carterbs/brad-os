import { z } from 'zod';

export const critiqueInputSchema = z.object({
  critique: z.string().min(1).max(2000),
});

export type CritiqueInput = z.infer<typeof critiqueInputSchema>;
