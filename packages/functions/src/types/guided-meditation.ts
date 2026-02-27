import { z } from 'zod';

export type GuidedMeditationSegment = z.infer<
  typeof import('../schemas/guided-meditation.schema.js').guidedMeditationSegmentSchema
>;
export type GuidedMeditationInterjection = z.infer<
  typeof import('../schemas/guided-meditation.schema.js').guidedMeditationInterjectionSchema
>;
export type GuidedMeditationScript = z.infer<
  typeof import('../schemas/guided-meditation.schema.js').guidedMeditationScriptSchema
>;
export type GuidedMeditationCategory = z.infer<
  typeof import('../schemas/guided-meditation.schema.js').guidedMeditationCategorySchema
>;
export type CreateGuidedMeditationScriptDTO = z.infer<
  typeof import('../schemas/guided-meditation.schema.js').createGuidedMeditationScriptSchema
>;
