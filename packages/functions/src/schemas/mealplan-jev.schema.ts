import { z } from 'zod';

const probabilitySchema = z.number().finite().min(0).max(1);

export const jevQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    instructions: z.string().min(1),
    criteria: z.record(z.string(), z.string()),
  }).strict(),
  z.object({
    type: z.literal('noul'),
    instructions: z.string().min(1),
    criteria: z.object({ true: z.string(), false: z.string() }).strict().optional(),
  }).strict(),
]);

export const jevAnswerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    confidence: probabilitySchema,
    probabilities: z.record(z.string(), probabilitySchema),
  }),
  z.object({ type: z.literal('noul'), noul: probabilitySchema }),
]);

export const jevQuestionsSchema = z.record(z.string(), jevQuestionSchema);

export const jevResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), jevAnswerSchema),
  usage: z.object({
    input_tokens: z.number().finite().int().nonnegative(),
    output_tokens: z.number().finite().int().nonnegative(),
  }).optional(),
});
