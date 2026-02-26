import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// Mock services - use vi.hoisted to define before vi.mock hoisting
const mockCyclingService = vi.hoisted(() => ({
  getCyclingActivityByStravaId: vi.fn(),
  getStravaTokens: vi.fn(),
  setStravaTokens: vi.fn(),
  setAthleteToUserMapping: vi.fn(),
  getUserIdByAthleteId: vi.fn(),
  getCurrentFTP: vi.fn(),
  createCyclingActivity: vi.fn(),
  deleteCyclingActivity: vi.fn(),
  updateCyclingActivity: vi.fn(),
  saveActivityStreams: vi.fn(),
  getCyclingProfile: vi.fn(),
  saveVO2MaxEstimate: vi.fn(),
}));

const mockStravaService = vi.hoisted(() => ({
  areTokensExpired: vi.fn(),
  refreshStravaTokens: vi.fn(),
  fetchStravaActivity: vi.fn(),
  processStravaActivity: vi.fn(),
  fetchActivityStreams: vi.fn(),
  calculatePeakPower: vi.fn(),
  calculateHRCompleteness: vi.fn(),
}));

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => { next(); },
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);
vi.mock('../services/strava.service.js', () => mockStravaService);
vi.mock('../services/vo2max.service.js', () => ({
  estimateVO2MaxFromPeakPower: vi.fn(),
}));

// Import after mocks
import { stravaWebhookApp, waitForStravaWebhookProcessing } from './strava-webhook.js';

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
    // Default: athlete 12345 maps to 'default-user'
    mockCyclingService.getUserIdByAthleteId.mockResolvedValue('default-user');
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

      await waitForStravaWebhookProcessing();

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

      await waitForStravaWebhookProcessing();

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

      await waitForStravaWebhookProcessing();

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

      await waitForStravaWebhookProcessing();

      expect(mockStravaService.refreshStravaTokens).toHaveBeenCalled();
      expect(mockCyclingService.setStravaTokens).toHaveBeenCalled();
      expect(mockStravaService.fetchStravaActivity).toHaveBeenCalledWith(
        'new-token',
        999
      );
    });

    it('should save stream data during activity enrichment', async () => {
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
      mockCyclingService.createCyclingActivity.mockResolvedValue({ id: 'new-activity-id' });
      mockStravaService.fetchActivityStreams.mockResolvedValue({
        watts: { data: [150, 160, 170], series_type: 'distance', original_size: 3, resolution: 'high' },
        heartrate: { data: [130, 135, 140], series_type: 'distance', original_size: 3, resolution: 'high' },
        time: { data: [0, 1, 2], series_type: 'distance', original_size: 3, resolution: 'high' },
        cadence: { data: [80, 82, 85], series_type: 'distance', original_size: 3, resolution: 'high' },
      });
      mockStravaService.calculatePeakPower.mockReturnValue(0);
      mockStravaService.calculateHRCompleteness.mockReturnValue(100);
      mockCyclingService.updateCyclingActivity.mockResolvedValue(true);
      mockCyclingService.saveActivityStreams.mockResolvedValue(undefined);
      mockCyclingService.getCyclingProfile.mockResolvedValue(null);

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

      await waitForStravaWebhookProcessing();

      expect(mockCyclingService.saveActivityStreams).toHaveBeenCalledWith(
        'default-user',
        'new-activity-id',
        expect.objectContaining({
          activityId: 'new-activity-id',
          stravaActivityId: 999,
          watts: [150, 160, 170],
          heartrate: [130, 135, 140],
          time: [0, 1, 2],
          cadence: [80, 82, 85],
          sampleCount: 3,
        })
      );
    });

    it('should ignore webhook when no athlete mapping exists', async () => {
      mockCyclingService.getUserIdByAthleteId.mockResolvedValue(null);

      const response = await request(stravaWebhookApp)
        .post('/webhook')
        .send({
          aspect_type: 'create',
          event_time: 1705320000,
          object_id: 999,
          object_type: 'activity',
          owner_id: 99999,
          subscription_id: 1,
        });

      expect(response.status).toBe(200);

      await waitForStravaWebhookProcessing();

      expect(mockCyclingService.getStravaTokens).not.toHaveBeenCalled();
      expect(mockCyclingService.createCyclingActivity).not.toHaveBeenCalled();
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

      await waitForStravaWebhookProcessing();

      expect(mockCyclingService.deleteCyclingActivity).toHaveBeenCalledWith(
        'default-user',
        'activity-to-delete'
      );
    });
  });

  describe('POST /strava/tokens - Token Sync', () => {
    it('should sync tokens and create athlete mapping', async () => {
      mockCyclingService.setStravaTokens.mockResolvedValue(undefined);
      mockCyclingService.setAthleteToUserMapping.mockResolvedValue(undefined);

      const response = await request(stravaWebhookApp)
        .post('/tokens')
        .send({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: 1705320000,
          athleteId: 12345,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { synced: true },
      });

      expect(mockCyclingService.setStravaTokens).toHaveBeenCalledWith(
        'default-user',
        {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: 1705320000,
          athleteId: 12345,
        }
      );
      expect(mockCyclingService.setAthleteToUserMapping).toHaveBeenCalledWith(
        12345,
        'default-user'
      );
    });

    it('should reject invalid token payload', async () => {
      const response = await request(stravaWebhookApp)
        .post('/tokens')
        .send({
          accessToken: '',
          refreshToken: 'test',
          expiresAt: -1,
        });

      expect(response.status).toBe(400);
    });
  });
});
