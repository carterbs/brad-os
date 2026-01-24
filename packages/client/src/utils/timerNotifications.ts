/**
 * Timer notification service for scheduling notifications when rest timers complete.
 * Supports both server-side push notifications and client-side local notifications.
 * Local notifications work in PWA mode without server VAPID configuration.
 */

import { subscribeToPush, getNotificationPermission } from './notifications';
import { saveSubscription, getSubscription } from './subscriptionStorage';
import type { PushSubscriptionInput } from '@lifting/shared';

const REST_TIMER_TAG = 'rest-timer';

let currentSubscription: PushSubscriptionJSON | null = null;
let initializationError: string | null = null;
let localNotificationTimeout: ReturnType<typeof setTimeout> | null = null;


/**
 * Converts PushSubscription to PushSubscriptionInput format for API.
 */
function toPushSubscriptionInput(subscription: PushSubscriptionJSON): PushSubscriptionInput {
  if (subscription.endpoint === null || subscription.endpoint === undefined || subscription.keys === null || subscription.keys === undefined) {
    throw new Error('Invalid subscription: missing endpoint or keys');
  }

  const p256dh = subscription.keys['p256dh'];
  const auth = subscription.keys['auth'];

  if (typeof p256dh !== 'string' || typeof auth !== 'string') {
    throw new Error('Invalid subscription: keys must be strings');
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh,
      auth,
    },
  };
}

/**
 * Initializes push notifications by subscribing to push service and saving subscription.
 *
 * @param vapidPublicKey - The VAPID public key from the server
 * @throws Error if subscription fails
 */
export async function initializeNotifications(vapidPublicKey: string): Promise<void> {
  try {
    initializationError = null;

    // Subscribe to push
    const subscription = await subscribeToPush(vapidPublicKey);
    if (!subscription) {
      throw new Error('Failed to create push subscription');
    }

    // Save subscription to localStorage
    const subscriptionJSON = subscription.toJSON();
    saveSubscription(subscriptionJSON);
    currentSubscription = subscriptionJSON;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    initializationError = errorMessage;
    throw error;
  }
}

/**
 * Schedules a timer notification to be sent when the rest period completes.
 *
 * @param delayMs - Delay in milliseconds before notification is sent
 * @param exerciseName - Name of the exercise for the notification body
 * @param setNumber - Set number for the notification body
 * @throws Error if scheduling fails
 */
export async function scheduleTimerNotification(
  delayMs: number,
  exerciseName: string,
  setNumber: number
): Promise<void> {
  // Check permission
  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission not granted: ${permission}`);
  }

  // Load subscription from storage if not in memory
  if (!currentSubscription) {
    currentSubscription = getSubscription();
  }

  if (!currentSubscription) {
    throw new Error('No push subscription available. Call initializeNotifications first.');
  }

  // Convert to API format
  const subscription = toPushSubscriptionInput(currentSubscription);

  // Schedule notification via API
  const response = await fetch('/api/notifications/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription,
      delayMs,
      title: 'Rest Complete',
      body: `Time for ${exerciseName} - Set ${setNumber}`,
      tag: REST_TIMER_TAG,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to schedule notification: ${response.status} ${errorText}`);
  }
}

/**
 * Cancels any pending timer notification.
 *
 * @throws Error if cancellation fails
 */
export async function cancelTimerNotification(): Promise<void> {
  const response = await fetch('/api/notifications/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tag: REST_TIMER_TAG,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to cancel notification: ${response.status} ${errorText}`);
  }
}

/**
 * Schedules a local notification using setTimeout + Notification API.
 * Works in PWA mode without server-side push infrastructure.
 * Uses the same tag as push notifications to prevent duplicates.
 *
 * @param delayMs - Delay in milliseconds before notification is shown
 * @param exerciseName - Name of the exercise for the notification body
 * @param setNumber - Set number for the notification body
 */
export function scheduleLocalNotification(
  delayMs: number,
  exerciseName: string,
  setNumber: number
): void {
  // Check permission
  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    return;
  }

  // Cancel any existing local notification
  cancelLocalNotification();

  localNotificationTimeout = setTimeout(() => {
    localNotificationTimeout = null;

    if (navigator.serviceWorker?.controller) {
      // Use service worker to show notification (required on iOS PWA)
      void navigator.serviceWorker.ready.then((reg) => {
        void reg.showNotification('Rest Complete', {
          body: `Time for ${exerciseName} - Set ${setNumber}`,
          tag: REST_TIMER_TAG,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        });
      });
    } else if (typeof Notification !== 'undefined') {
      // Fallback to Notification API directly (works on desktop)
      new Notification('Rest Complete', {
        body: `Time for ${exerciseName} - Set ${setNumber}`,
        tag: REST_TIMER_TAG,
        icon: '/icons/icon-192.png',
      });
    }
  }, delayMs);
}

/**
 * Cancels any pending local notification timeout.
 */
export function cancelLocalNotification(): void {
  if (localNotificationTimeout !== null) {
    clearTimeout(localNotificationTimeout);
    localNotificationTimeout = null;
  }
}

/**
 * Returns the last initialization error message, if any.
 *
 * @returns Error message or null if no error
 */
export function getInitializationError(): string | null {
  return initializationError;
}

/**
 * Resets the module state.
 * Primarily for testing purposes.
 */
export function resetTimerNotifications(): void {
  currentSubscription = null;
  initializationError = null;
  cancelLocalNotification();
}
