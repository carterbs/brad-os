import type { z } from 'zod';

export type JevQuestion = z.infer<
  typeof import('../schemas/mealplan-jev.schema.js').jevQuestionSchema
>;

export type JevAnswer = z.infer<
  typeof import('../schemas/mealplan-jev.schema.js').jevAnswerSchema
>;
