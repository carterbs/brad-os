import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const scheduleNotificationSchema = z.object({
  subscription: pushSubscriptionSchema,
  delayMs: z.number().int().positive().max(600000), // Max 10 minutes
  title: z.string().min(1),
  body: z.string().min(1),
  tag: z.string().min(1),
});

export const cancelNotificationSchema = z.object({
  tag: z.string().min(1),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
export type ScheduleNotificationInput = z.infer<typeof scheduleNotificationSchema>;
export type CancelNotificationInput = z.infer<typeof cancelNotificationSchema>;
