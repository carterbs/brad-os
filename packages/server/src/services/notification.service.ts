import webPush from 'web-push';
import type {
  PushSubscriptionData,
  ScheduleNotificationInput,
} from '@brad-os/shared';

/**
 * Notification service for scheduling and sending push notifications
 * Uses in-memory storage for pending notifications (fine for single-user app)
 */
export class NotificationService {
  private pendingNotifications: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    const publicKey = process.env['VAPID_PUBLIC_KEY'];
    const privateKey = process.env['VAPID_PRIVATE_KEY'];
    const subject = process.env['VAPID_SUBJECT'];

    if (
      publicKey !== null && publicKey !== undefined && publicKey !== '' &&
      privateKey !== null && privateKey !== undefined && privateKey !== '' &&
      subject !== null && subject !== undefined && subject !== ''
    ) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  /**
   * Get the VAPID public key from environment
   */
  getVapidPublicKey(): string | null {
    return process.env['VAPID_PUBLIC_KEY'] ?? null;
  }

  /**
   * Schedule a notification to be sent after a delay
   * Cancels any existing notification with the same tag
   */
  schedule(input: ScheduleNotificationInput): void {
    const { subscription, delayMs, title, body, tag } = input;

    // Cancel existing notification with same tag
    this.cancel(tag);

    // Schedule new notification
    const timeout = setTimeout(() => {
      this.send(subscription, { title, body, tag }).catch((error) => {
        console.error('Failed to send notification:', error);
      });
      this.pendingNotifications.delete(tag);
    }, delayMs);

    this.pendingNotifications.set(tag, timeout);
  }

  /**
   * Cancel a pending notification by tag
   * Returns true if a notification was cancelled, false otherwise
   */
  cancel(tag: string): boolean {
    const timeout = this.pendingNotifications.get(tag);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingNotifications.delete(tag);
      return true;
    }
    return false;
  }

  /**
   * Send a push notification
   * Private method called when timeout fires
   */
  private async send(
    subscription: PushSubscriptionData,
    payload: { title: string; body: string; tag: string }
  ): Promise<void> {
    try {
      await webPush.sendNotification(
        subscription as webPush.PushSubscription,
        JSON.stringify(payload)
      );
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  }
}
