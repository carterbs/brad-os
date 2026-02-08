import { z } from 'zod';

/**
 * Cycling Schemas
 *
 * Zod validation schemas for cycling-related API inputs.
 */

// --- Shared Enums ---

export const trainingGoalSchema = z.enum([
  'regain_fitness',
  'maintain_muscle',
  'lose_weight',
]);

export const ftpSourceSchema = z.enum(['manual', 'test']);

// --- FTP Entry Schema ---

/**
 * Schema for creating a new FTP entry.
 */
export const createFTPEntrySchema = z.object({
  value: z.number().int().positive().max(500), // FTP in watts, reasonable max
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  source: ftpSourceSchema,
});

export type CreateFTPEntryInput = z.infer<typeof createFTPEntrySchema>;

// --- Training Block Schema ---

/**
 * Schema for creating a new training block.
 */
export const createTrainingBlockSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  goals: z.array(trainingGoalSchema).min(1).max(3),
});

export type CreateTrainingBlockInput = z.infer<typeof createTrainingBlockSchema>;

// --- Weight Goal Schema ---

/**
 * Schema for creating a weight goal.
 */
export const createWeightGoalSchema = z.object({
  targetWeightLbs: z.number().positive().max(500),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startWeightLbs: z.number().positive().max(500),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

export type CreateWeightGoalInput = z.infer<typeof createWeightGoalSchema>;

// --- Strava Integration Schemas ---

/**
 * Schema for Strava OAuth callback.
 */
export const stravaCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().optional(),
  scope: z.string().optional(),
});

export type StravaCallbackInput = z.infer<typeof stravaCallbackSchema>;

/**
 * Schema for Strava webhook subscription validation.
 * Used when Strava verifies the webhook endpoint.
 */
export const stravaWebhookValidationSchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.challenge': z.string().min(1),
  'hub.verify_token': z.string().min(1),
});

export type StravaWebhookValidationInput = z.infer<typeof stravaWebhookValidationSchema>;

/**
 * Schema for Strava webhook event payload.
 * Sent when activities are created, updated, or deleted.
 */
export const stravaWebhookEventSchema = z.object({
  aspect_type: z.enum(['create', 'update', 'delete']),
  event_time: z.number().int().positive(),
  object_id: z.number().int().positive(),
  object_type: z.enum(['activity', 'athlete']),
  owner_id: z.number().int().positive(),
  subscription_id: z.number().int().positive(),
  updates: z.record(z.unknown()).optional(),
});

export type StravaWebhookEventInput = z.infer<typeof stravaWebhookEventSchema>;

/**
 * Combined Strava webhook schema - can be either validation or event.
 */
export const stravaWebhookSchema = z.union([
  stravaWebhookValidationSchema,
  stravaWebhookEventSchema,
]);

export type StravaWebhookInput = z.infer<typeof stravaWebhookSchema>;
