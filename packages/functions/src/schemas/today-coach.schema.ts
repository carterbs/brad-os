import { z } from 'zod';

const recoveryStatusSchema = z.enum(['great', 'good', 'caution', 'warning']);
const prioritySchema = z.enum(['high', 'normal', 'rest']);
const cyclingPrioritySchema = z.enum(['high', 'normal', 'skip']);
const stretchingPrioritySchema = z.enum(['high', 'normal', 'low']);
const mealTypePrioritySchema = z.enum(['high', 'normal', 'low']);

const todayCoachSessionSchema = z.object({
  type: z.enum(['vo2max', 'threshold', 'endurance', 'tempo', 'fun', 'recovery', 'off']),
  durationMinutes: z.number(),
  pelotonClassTypes: z.array(z.string()),
  pelotonTip: z.string(),
  targetTSS: z.object({
    min: z.number(),
    max: z.number(),
  }).strict(),
  targetZones: z.string(),
}).strict();

export const todayCoachResponseSchema = z.object({
  dailyBriefing: z.string(),
  sections: z.object({
    recovery: z.object({
      insight: z.string(),
      status: recoveryStatusSchema,
    }).strict(),
    lifting: z.object({
      insight: z.string(),
      workout: z.object({
        planDayName: z.string(),
        weekNumber: z.number(),
        isDeload: z.boolean(),
        exerciseCount: z.number(),
        status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
      }).strict().nullable(),
      priority: prioritySchema,
    }).strict().nullable(),
    cycling: z.object({
      insight: z.string(),
      session: todayCoachSessionSchema.nullable(),
      priority: cyclingPrioritySchema,
    }).strict().nullable(),
    stretching: z.object({
      insight: z.string(),
      suggestedRegions: z.array(z.string()),
      priority: stretchingPrioritySchema,
    }).strict(),
    meditation: z.object({
      insight: z.string(),
      suggestedDurationMinutes: z.number(),
      priority: mealTypePrioritySchema,
    }).strict(),
    weight: z.object({
      insight: z.string(),
    }).strict().nullable(),
  }).strict(),
  warnings: z.array(
    z.object({
      type: z.string(),
      message: z.string(),
    }).strict()
  ),
}).strict();

export type TodayCoachResponseDTO = z.infer<typeof todayCoachResponseSchema>;
