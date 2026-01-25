import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { setupTestApp, teardownTestApp, type TestContext } from '../../test/test-app.js';
import type { ApiResult } from '@brad-os/shared';

// Mock web-push to avoid VAPID key validation errors
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

describe('Notification Routes', () => {
  let ctx: TestContext;
  let app: Express;
  const originalEnv = process.env;

  beforeEach(() => {
    // Set up VAPID keys for testing
    process.env = {
      ...originalEnv,
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@example.com',
    };

    ctx = setupTestApp(false); // no seeds needed
    app = ctx.app;
  });

  afterEach(() => {
    teardownTestApp(ctx);
    process.env = originalEnv;
  });

  describe('GET /api/notifications/vapid-key', () => {
    it('should return public key when configured', async () => {
      const response = await request(app).get('/api/notifications/vapid-key');
      const body = response.body as ApiResult<{ publicKey: string }>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.publicKey).toBe('test-public-key');
      }
    });

    it('should return 503 when VAPID key is not configured', async () => {
      // Clear VAPID config
      delete process.env['VAPID_PUBLIC_KEY'];

      // Need to recreate app to pick up new env
      teardownTestApp(ctx);
      ctx = setupTestApp(false);
      app = ctx.app;

      const response = await request(app).get('/api/notifications/vapid-key');
      const body = response.body as ApiResult<never>;

      expect(response.status).toBe(503);
      expect(body.success).toBe(false);
      if (!body.success) {
        expect(body.error.code).toBe('VAPID_NOT_CONFIGURED');
      }
    });
  });

  describe('POST /api/notifications/schedule', () => {
    const validPayload = {
      subscription: {
        endpoint: 'https://push.example.com/123',
        keys: {
          p256dh: 'test-p256dh-key',
          auth: 'test-auth-key',
        },
      },
      delayMs: 60000,
      title: 'Rest Complete',
      body: 'Time for Bench Press - Set 1',
      tag: 'rest-timer',
    };

    it('should schedule notification with valid payload', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send(validPayload);
      const body = response.body as ApiResult<{ scheduled: boolean }>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.scheduled).toBe(true);
      }
    });

    it('should validate payload structure', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send({
          // Missing required fields
          title: 'Test',
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid delay (exceeds max)', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send({
          ...validPayload,
          delayMs: 700000, // > 600000ms (10 min max)
        });

      expect(response.status).toBe(400);
    });

    it('should reject negative delay', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send({
          ...validPayload,
          delayMs: -1000,
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid subscription endpoint', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send({
          ...validPayload,
          subscription: {
            ...validPayload.subscription,
            endpoint: 'not-a-url',
          },
        });

      expect(response.status).toBe(400);
    });

    it('should reject missing subscription keys', async () => {
      const response = await request(app)
        .post('/api/notifications/schedule')
        .send({
          ...validPayload,
          subscription: {
            endpoint: 'https://push.example.com/123',
            // Missing keys
          },
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/notifications/cancel', () => {
    it('should cancel notification by tag', async () => {
      // First schedule a notification
      await request(app)
        .post('/api/notifications/schedule')
        .send({
          subscription: {
            endpoint: 'https://push.example.com/123',
            keys: { p256dh: 'key', auth: 'auth' },
          },
          delayMs: 60000,
          title: 'Test',
          body: 'Test',
          tag: 'rest-timer',
        });

      // Then cancel it
      const response = await request(app)
        .post('/api/notifications/cancel')
        .send({ tag: 'rest-timer' });
      const body = response.body as ApiResult<{ cancelled: boolean }>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.cancelled).toBe(true);
      }
    });

    it('should return cancelled: false when no notification exists', async () => {
      const response = await request(app)
        .post('/api/notifications/cancel')
        .send({ tag: 'non-existent-tag' });
      const body = response.body as ApiResult<{ cancelled: boolean }>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      if (body.success) {
        expect(body.data.cancelled).toBe(false);
      }
    });

    it('should validate tag is required', async () => {
      const response = await request(app)
        .post('/api/notifications/cancel')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should validate tag is a string', async () => {
      const response = await request(app)
        .post('/api/notifications/cancel')
        .send({ tag: 123 });

      expect(response.status).toBe(400);
    });
  });
});
