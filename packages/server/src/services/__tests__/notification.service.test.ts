import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock web-push before importing the service
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webPush from 'web-push';
import { NotificationService } from '../notification.service.js';
import type { ScheduleNotificationInput } from '@brad-os/shared';

describe('NotificationService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset environment
    process.env = {
      ...originalEnv,
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@example.com',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should set VAPID details on construction when env vars are set', () => {
      new NotificationService();

      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'test-public-key',
        'test-private-key'
      );
    });

    it('should not set VAPID details when env vars are missing', () => {
      delete process.env['VAPID_PUBLIC_KEY'];
      delete process.env['VAPID_PRIVATE_KEY'];
      delete process.env['VAPID_SUBJECT'];

      new NotificationService();

      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });

    it('should not set VAPID details when env vars are empty', () => {
      process.env['VAPID_PUBLIC_KEY'] = '';
      process.env['VAPID_PRIVATE_KEY'] = '';
      process.env['VAPID_SUBJECT'] = '';

      new NotificationService();

      expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    });
  });

  describe('getVapidPublicKey', () => {
    it('should return public key from env', () => {
      const service = new NotificationService();

      const key = service.getVapidPublicKey();

      expect(key).toBe('test-public-key');
    });

    it('should return null when key is not configured', () => {
      delete process.env['VAPID_PUBLIC_KEY'];

      const service = new NotificationService();

      const key = service.getVapidPublicKey();

      expect(key).toBeNull();
    });
  });

  describe('schedule', () => {
    it('should send notification after delay', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);

      const service = new NotificationService();
      const input: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 5000,
        title: 'Test Title',
        body: 'Test Body',
        tag: 'test-tag',
      };

      service.schedule(input);

      // Should not send immediately
      expect(webPush.sendNotification).not.toHaveBeenCalled();

      // Advance timers
      await vi.advanceTimersByTimeAsync(5000);

      expect(webPush.sendNotification).toHaveBeenCalledWith(
        input.subscription,
        JSON.stringify({
          title: 'Test Title',
          body: 'Test Body',
          tag: 'test-tag',
        })
      );
    });

    it('should cancel previous notification with same tag', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);

      const service = new NotificationService();

      const input1: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 10000,
        title: 'First',
        body: 'First notification',
        tag: 'rest-timer',
      };

      const input2: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 5000,
        title: 'Second',
        body: 'Second notification',
        tag: 'rest-timer',
      };

      // Schedule first notification
      service.schedule(input1);

      // Advance 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Schedule second notification (should cancel first)
      service.schedule(input2);

      // Advance past first notification's original time
      await vi.advanceTimersByTimeAsync(7000);

      // Only second notification should have been sent
      expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
      expect(webPush.sendNotification).toHaveBeenCalledWith(
        expect.anything(),
        JSON.stringify({
          title: 'Second',
          body: 'Second notification',
          tag: 'rest-timer',
        })
      );
    });

    it('should handle send errors gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(webPush.sendNotification).mockRejectedValue(
        new Error('Push failed')
      );

      const service = new NotificationService();
      const input: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 1000,
        title: 'Test',
        body: 'Test',
        tag: 'test',
      };

      service.schedule(input);

      // Should not throw when timeout fires
      await vi.advanceTimersByTimeAsync(1000);

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to send notification:',
        expect.any(Error)
      );
    });
  });

  describe('cancel', () => {
    it('should return true when notification was cancelled', () => {
      const service = new NotificationService();
      const input: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 10000,
        title: 'Test',
        body: 'Test',
        tag: 'test-tag',
      };

      service.schedule(input);

      const result = service.cancel('test-tag');

      expect(result).toBe(true);
    });

    it('should return false when no notification exists for tag', () => {
      const service = new NotificationService();

      const result = service.cancel('non-existent-tag');

      expect(result).toBe(false);
    });

    it('should prevent scheduled notification from being sent', async () => {
      vi.mocked(webPush.sendNotification).mockResolvedValue({} as never);

      const service = new NotificationService();
      const input: ScheduleNotificationInput = {
        subscription: {
          endpoint: 'https://push.example.com/123',
          keys: { p256dh: 'key1', auth: 'key2' },
        },
        delayMs: 5000,
        title: 'Test',
        body: 'Test',
        tag: 'test-tag',
      };

      service.schedule(input);

      // Cancel before timeout fires
      service.cancel('test-tag');

      // Advance past the original timeout
      await vi.advanceTimersByTimeAsync(10000);

      // Should not have sent
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
  });
});
