import { z } from 'zod';

export const synthesizeSchema = z.object({
  text: z.string().min(1).max(5000),
});

export type SynthesizeRequest = z.infer<typeof synthesizeSchema>;
