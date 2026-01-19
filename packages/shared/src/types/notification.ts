export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ScheduleNotificationInput and CancelNotificationInput are exported from schemas/notification.schema.ts
// (inferred from Zod schemas)
