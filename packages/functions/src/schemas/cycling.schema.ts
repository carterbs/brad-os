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

export const experienceLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);

export const ftpSourceSchema = z.enum(['manual', 'test']);

const coachingSessionTypeSchema = z.enum([
  'vo2max',
  'threshold',
  'endurance',
  'tempo',
  'fun',
  'recovery',
  'off',
]);

/**
 * Valid session types for schedule generation.
 */
const scheduleSessionTypeSchema = z.enum([
  'vo2max',
  'threshold',
  'endurance',
  'tempo',
  'fun',
  'recovery',
]);

/**
 * Schema for session recommendations returned by the cycling coach.
 */
export const sessionRecommendationSchema = z.object({
  type: coachingSessionTypeSchema,
  durationMinutes: z.number().positive(),
  pelotonClassTypes: z.array(z.string()),
  pelotonTip: z.string(),
  targetTSS: z.object({
    min: z.number(),
    max: z.number(),
  }).strict(),
  targetZones: z.string(),
}).strict();

const coachWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
});

/**
 * Schema for AI coaching response payloads.
 */
export const cyclingCoachResponseSchema = z.object({
  session: sessionRecommendationSchema,
  reasoning: z.string(),
  coachingTips: z.array(z.string()).optional(),
  warnings: z.array(coachWarningSchema).nullable().optional(),
  suggestFTPTest: z.boolean().optional(),
}).strict();

export const generateScheduleSessionSchema = z.object({
  order: z.number().int().positive(),
  sessionType: scheduleSessionTypeSchema,
  pelotonClassTypes: z.array(z.string()),
  suggestedDurationMinutes: z.number().positive(),
  description: z.string(),
});

const generateSchedulePhaseSchema = z.object({
  name: z.string(),
  weeks: z.string(),
  description: z.string(),
});

/**
 * Schema for AI schedule generation response payloads.
 */
export const generateScheduleResponseSchema = z.object({
  sessions: z.array(generateScheduleSessionSchema),
  weeklyPlan: z.object({
    totalEstimatedHours: z.number(),
    phases: z.array(generateSchedulePhaseSchema),
  }).strict(),
  rationale: z.string(),
}).strict();

export type SessionRecommendationSchema = z.infer<typeof sessionRecommendationSchema>;
export type CyclingCoachResponseDTO = z.infer<typeof cyclingCoachResponseSchema>;
export type GenerateScheduleResponseDTO = z.infer<typeof generateScheduleResponseSchema>;
export type GenerateScheduleSessionDTO = z.infer<typeof generateScheduleSessionSchema>;

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

// --- Weekly Session Schema ---

export const weeklySessionSchema = z.object({
  order: z.number().int().positive(),
  sessionType: z.string(),
  pelotonClassTypes: z.array(z.string()),
  suggestedDurationMinutes: z.number().positive(),
  description: z.string(),
  preferredDay: z.number().int().min(0).max(6).optional(),
});

/**
 * Schema for creating a new training block.
 */
export const createTrainingBlockSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  goals: z.array(trainingGoalSchema).min(1).max(3),
  daysPerWeek: z.number().int().min(2).max(5).optional(),
  weeklySessions: z.array(weeklySessionSchema).optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  experienceLevel: experienceLevelSchema.optional(),
  weeklyHoursAvailable: z.number().min(1).max(20).optional(),
});

export type CreateTrainingBlockInput = z.infer<typeof createTrainingBlockSchema>;

// --- Generate Schedule Schema ---

/**
 * Schema for the schedule generation endpoint request.
 */
export const generateScheduleSchema = z.object({
  sessionsPerWeek: z.number().int().min(2).max(5),
  preferredDays: z.array(z.number().int().min(0).max(6)),
  goals: z.array(trainingGoalSchema).min(1).max(3),
  experienceLevel: experienceLevelSchema,
  weeklyHoursAvailable: z.number().min(1).max(20),
  ftp: z.number().positive().max(500).optional(),
});

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;

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
 * Schema for syncing Strava tokens from the iOS app to Firestore.
 * Called after the iOS app completes Strava OAuth.
 */
export const syncStravaTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().int().positive(),
  athleteId: z.number().int().positive(),
});

export type SyncStravaTokensInput = z.infer<typeof syncStravaTokensSchema>;

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
  updates: z.record(z.string(), z.unknown()).optional(),
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

// --- VO2 Max Schemas ---

/**
 * Schema for triggering VO2 max calculation.
 */
export const calculateVO2MaxSchema = z.object({
  weightKg: z.number().positive().max(300),
});

export type CalculateVO2MaxInput = z.infer<typeof calculateVO2MaxSchema>;

// --- Cycling Profile Schema ---

/**
 * Schema for updating the cycling profile.
 */
export const updateCyclingProfileSchema = z.object({
  weightKg: z.number().positive().max(300),
  maxHR: z.number().int().positive().max(250).optional(),
  restingHR: z.number().int().positive().max(150).optional(),
});

export type UpdateCyclingProfileInput = z.infer<typeof updateCyclingProfileSchema>;

// --- Cycling Activity Creation Schema ---

const cyclingActivityTypeSchema = z.enum([
  'vo2max',
  'threshold',
  'fun',
  'recovery',
  'unknown',
]);

const cyclingActivitySourceSchema = z.enum(['strava']);

/**
 * Schema for creating a cycling activity.
 * Validates the body of POST /cycling/activities.
 */
export const createCyclingActivitySchema = z.object({
  stravaId: z.number().int().positive(),
  userId: z.string().min(1).optional(),
  date: z.string().min(1),
  durationMinutes: z.number().positive(),
  avgPower: z.number().min(0),
  normalizedPower: z.number().min(0),
  maxPower: z.number().min(0),
  avgHeartRate: z.number().min(0),
  maxHeartRate: z.number().min(0),
  tss: z.number().min(0),
  intensityFactor: z.number().min(0),
  type: cyclingActivityTypeSchema,
  source: cyclingActivitySourceSchema,
  ef: z.number().positive().optional(),
  peak5MinPower: z.number().positive().optional(),
  peak20MinPower: z.number().positive().optional(),
  hrCompleteness: z.number().min(0).max(100).optional(),
  createdAt: z.string().min(1).optional(),
});

export const cyclingActivityDocSchema = createCyclingActivitySchema.extend({
  type: createCyclingActivitySchema.shape.type.or(z.literal('virtual')).transform((value) => {
    return value === 'virtual' ? 'unknown' : value;
  }),
  userId: z.string(),
  createdAt: z.string(),
});

export type CreateCyclingActivityInput = z.infer<typeof createCyclingActivitySchema>;
