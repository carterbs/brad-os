import { z } from 'zod';

const phaseSchema = z.enum(['opening', 'teachings', 'closing']);

export const guidedMeditationSegmentSchema = z.object({
  id: z.string(),
  startSeconds: z.number().min(0),
  text: z.string(),
  phase: phaseSchema,
}).strict();

export const guidedMeditationInterjectionSchema = z.object({
  windowStartSeconds: z.number().min(0),
  windowEndSeconds: z.number().min(0),
  textOptions: z.array(z.string()),
}).strict();

export const createGuidedMeditationSegmentSchema = z.object({
  startSeconds: z.number().min(0),
  text: z.string(),
  phase: phaseSchema,
}).strict();

export const guidedMeditationScriptSchema = z.object({
  id: z.string(),
  category: z.string(),
  title: z.string(),
  subtitle: z.string(),
  orderIndex: z.number().int().min(0),
  durationSeconds: z.number().min(1),
  segments: z.array(guidedMeditationSegmentSchema),
  interjections: z.array(guidedMeditationInterjectionSchema),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const guidedMeditationCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  scriptCount: z.number().int().min(0),
}).strict();

export const createGuidedMeditationScriptSchema = z.object({
  category: z.string(),
  title: z.string(),
  subtitle: z.string(),
  orderIndex: z.number().int().min(0),
  durationSeconds: z.number().min(1),
  segments: z.array(createGuidedMeditationSegmentSchema),
  interjections: z.array(guidedMeditationInterjectionSchema),
}).strict();

export type GuidedMeditationSegmentDTO = z.infer<typeof guidedMeditationSegmentSchema>;
export type GuidedMeditationInterjectionDTO = z.infer<typeof guidedMeditationInterjectionSchema>;
export type GuidedMeditationScriptDTO = z.infer<typeof guidedMeditationScriptSchema>;
export type GuidedMeditationCategoryDTO = z.infer<typeof guidedMeditationCategorySchema>;
