import { z } from 'zod';
import { stravaWebhookEventSchema } from './cycling.schema.js';

const STRAVA_EVENT_ID_PATTERN = /^strava-(?:dev|prod)-[a-f0-9]{64}$/;

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === 'https:', {
    message: 'must use https',
  });

export const stravaTaskConfigSchema = z.object({
  projectId: z.string().min(1),
  queue: z.string().regex(/^[a-z][a-z0-9-]{0,98}[a-z0-9]$/),
  location: z.string().regex(/^[a-z]+[a-z0-9-]*[a-z0-9]$/),
  cloudRunServiceUrl: httpsUrlSchema,
  oidcAudience: httpsUrlSchema,
  oidcServiceAccount: z.string().email(),
});

export const stravaTaskEnvironmentSchema = z.enum(['dev', 'prod']);

/**
 * Payload written by the public Strava webhook and consumed by Cloud Tasks.
 *
 * The environment is intentionally absent from the body. The authenticated
 * worker takes it exclusively from its fixed URL path.
 */
export const stravaActivityTaskPayloadSchema = z
  .object({
    eventId: z.string().regex(STRAVA_EVENT_ID_PATTERN),
    event: stravaWebhookEventSchema.extend({
      object_type: z.literal('activity'),
    }),
  })
  .strict();

export type StravaActivityTaskPayload = z.infer<
  typeof stravaActivityTaskPayloadSchema
>;
