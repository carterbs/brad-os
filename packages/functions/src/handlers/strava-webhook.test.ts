import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Mock services - use vi.hoisted to define before vi.mock hoisting
const mockCyclingService = vi.hoisted(() => ({
  getCyclingActivityByStravaId: vi.fn(),
  getStravaTokens: vi.fn(),
  setStravaTokens: vi.fn(),
  getCurrentFTP: vi.fn(),
  createCyclingActivity: vi.fn(),
  deleteCyclingActivity: vi.fn(),
}));

const mockStravaService = vi.hoisted(() => ({
  areTokensExpired: vi.fn(),
  refreshStravaTokens: vi.fn(),
  fetchStravaActivity: vi.fn(),
  processStravaActivity: vi.fn(),
}));

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);
vi.mock('../services/strava.service.js', () => mockStravaService);

// Import after mocks
import { stravaWebhookApp } from './strava-webhook.js';

describe('Strava Webhook Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      STRAVA_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
      STRAVA_CLIENT_ID: 'test-client-id',
      STRAVA_CLIENT_SECRET: 'test-client-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET /strava/webhook - Verification', () => {
    it('should respond to valid verification challenge', async () => {
      const response = await request(stravaWebhookApp)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-verify-token',
          'hub.challenge': 'challenge-12345',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        'hub.challenge': 'challenge-12345',
      });
    });

    it('should reject invalid verify token', async () => {
      const response = await request(stravaWebhookApp)
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'challenge-12345',
        });

      expect(response.status).toBe(403);
    });

    it('should reject non-subscribe mode', async () => {
      const response = await request(stravaWebhookApp)
        .get('/webhook')
        .query({
          'hub.mode': 'unsubscribe',
          'hub.verify_token': 'test-verify-token',
          'hub.challenge': 'challenge-12345',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /strava/webhook - Activity Events', () => {
    it('should acknowledge valid activity create event', async () => {
      mockCyclingService.getCyclingActivityByStravaId.mockResolvedValue(null);
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        athleteId: 12345,
      });
      mockCyclingService.getCurrentFTP.mockResolvedValue({ value: 250 });
      mockStravaService.areTokensExpired.mockReturnValue(false);
      mockStravaService.fetchStravaActivity.mockResolvedValue({
        id: 999,
        type: 'VirtualRide',
        moving_time: 3600,
        elapsed_time: 3600,
        average_watts: 200,
        start_date: '2024-01-15T10:00:00Z',
      });
      mockStravaService.processStravaActivity.mockReturnValue({
        stravaId: 999,
        userId: '12345',
        date: '2024-01-15T10:00:00Z',
        durationMinutes: 60,
        avgPower: 200,
        normalizedPower: 200,
        maxPower: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        tss: 64,
        intensityFactor: 0.8,
        type: 'fun',
        source: 'strava',
        createdAt: '2024-01-15T12:00:00Z',
      });
      mockCyclingService.createCyclingActivity.mockResolvedValue({});

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'create',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('EVENT_RECEIVED');

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockStravaService.fetchStravaActivity).toHaveBeenCalledWith(
        'token',
        999
      );
    });

    it('should acknowledge athlete events', async () => {
      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'update',
          event_time: 1705320000,
          object_id: 12345,
          object_type: 'athlete',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('EVENT_RECEIVED');
    });

    it('should handle invalid payload gracefully', async () => {
      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          invalid: 'payload',
        });

      // Should still return 200 to acknowledge receipt
      expect(response.status).toBe(200);
      expect(response.text).toBe('EVENT_RECEIVED');
    });

    it('should skip non-cycling activities', async () => {
      mockCyclingService.getCyclingActivityByStravaId.mockResolvedValue(null);
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        athleteId: 12345,
      });
      mockStravaService.areTokensExpired.mockReturnValue(false);
      mockStravaService.fetchStravaActivity.mockResolvedValue({
        id: 999,
        type: 'Run', // Not a cycling activity
        moving_time: 3600,
        elapsed_time: 3600,
        start_date: '2024-01-15T10:00:00Z',
      });

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'create',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockCyclingService.createCyclingActivity).not.toHaveBeenCalled();
    });

    it('should skip duplicate activities', async () => {
      mockCyclingService.getCyclingActivityByStravaId.mockResolvedValue({
        id: 'existing-activity-id',
        stravaId: 999,
      });

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'create',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockStravaService.fetchStravaActivity).not.toHaveBeenCalled();
      expect(mockCyclingService.createCyclingActivity).not.toHaveBeenCalled();
    });

    it('should refresh tokens if expired', async () => {
      mockCyclingService.getCyclingActivityByStravaId.mockResolvedValue(null);
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'old-token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired
        athleteId: 12345,
      });
      mockStravaService.areTokensExpired.mockReturnValue(true);
      mockStravaService.refreshStravaTokens.mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        athleteId: 12345,
      });
      mockCyclingService.getCurrentFTP.mockResolvedValue({ value: 250 });
      mockStravaService.fetchStravaActivity.mockResolvedValue({
        id: 999,
        type: 'VirtualRide',
        moving_time: 3600,
        elapsed_time: 3600,
        average_watts: 200,
        start_date: '2024-01-15T10:00:00Z',
      });
      mockStravaService.processStravaActivity.mockReturnValue({
        stravaId: 999,
        userId: '12345',
        date: '2024-01-15T10:00:00Z',
        durationMinutes: 60,
        avgPower: 200,
        normalizedPower: 200,
        maxPower: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        tss: 64,
        intensityFactor: 0.8,
        type: 'fun',
        source: 'strava',
        createdAt: '2024-01-15T12:00:00Z',
      });
      mockCyclingService.createCyclingActivity.mockResolvedValue({});

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'create',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockStravaService.refreshStravaTokens).toHaveBeenCalled();
      expect(mockCyclingService.setStravaTokens).toHaveBeenCalled();
      expect(mockStravaService.fetchStravaActivity).toHaveBeenCalledWith(
        'new-token',
        999
      );
    });

    it('should handle delete events', async () => {
      mockCyclingService.getCyclingActivityByStravaId.mockResolvedValue({
        id: 'activity-to-delete',
        stravaId: 999,
      });
      mockCyclingService.deleteCyclingActivity.mockResolvedValue(true);

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'delete',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 12345,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockCyclingService.deleteCyclingActivity).toHaveBeenCalledWith(
        '12345',
        'activity-to-delete'
      );
    });
  });
});
