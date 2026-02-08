import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStravaActivity,
  fetchStravaActivities,
  refreshStravaTokens,
  processStravaActivity,
  classifyWorkoutType,
  calculateTSS,
  calculateIntensityFactor,
  filterCyclingActivities,
  areTokensExpired,
  StravaApiError,
  type StravaActivity,
} from './strava.service.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Strava Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchStravaActivity', () => {
    it('should fetch an activity by ID', async () => {
      const mockActivity: StravaActivity = {
        id: 12345,
        type: 'VirtualRide',
        moving_time: 3600,
        elapsed_time: 3900,
        average_watts: 200,
        weighted_average_watts: 210,
        max_watts: 350,
        average_heartrate: 145,
        max_heartrate: 175,
        start_date: '2024-01-15T10:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivity),
      });

      const result = await fetchStravaActivity('test-token', 12345);

      expect(result).toEqual(mockActivity);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.strava.com/api/v3/activities/12345',
        { headers: { Authorization: 'Bearer test-token' } }
      );
    });

    it('should throw StravaApiError on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(fetchStravaActivity('bad-token', 12345)).rejects.toThrow(
        StravaApiError
      );
    });
  });

  describe('fetchStravaActivities', () => {
    it('should fetch activities with pagination', async () => {
      const mockActivities: StravaActivity[] = [
        {
          id: 1,
          type: 'VirtualRide',
          moving_time: 3600,
          elapsed_time: 3600,
          start_date: '2024-01-15T10:00:00Z',
        },
        {
          id: 2,
          type: 'Ride',
          moving_time: 7200,
          elapsed_time: 7500,
          start_date: '2024-01-14T10:00:00Z',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockActivities),
      });

      const result = await fetchStravaActivities('test-token', 1, 30);

      expect(result).toEqual(mockActivities);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=30'),
        expect.any(Object)
      );
    });

    it('should limit perPage to 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchStravaActivities('test-token', 1, 500);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('per_page=200'),
        expect.any(Object)
      );
    });
  });

  describe('refreshStravaTokens', () => {
    it('should refresh tokens successfully', async () => {
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_at: 1705400000,
        athlete: { id: 12345 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshStravaTokens(
        'client-id',
        'client-secret',
        'old-refresh-token'
      );

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: 1705400000,
        athleteId: 12345,
      });
    });

    it('should throw StravaApiError on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(
        refreshStravaTokens('client-id', 'client-secret', 'bad-token')
      ).rejects.toThrow(StravaApiError);
    });

    it('should handle missing athlete in response', async () => {
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_at: 1705400000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshStravaTokens(
        'client-id',
        'client-secret',
        'refresh-token'
      );

      expect(result.athleteId).toBe(0);
    });
  });

  describe('classifyWorkoutType', () => {
    it('should classify VO2max workouts (IF >= 1.05)', () => {
      expect(classifyWorkoutType(1.05)).toBe('vo2max');
      expect(classifyWorkoutType(1.15)).toBe('vo2max');
    });

    it('should classify threshold workouts (IF >= 0.88)', () => {
      expect(classifyWorkoutType(0.88)).toBe('threshold');
      expect(classifyWorkoutType(0.95)).toBe('threshold');
      expect(classifyWorkoutType(1.04)).toBe('threshold');
    });

    it('should classify fun/endurance workouts (IF >= 0.75)', () => {
      expect(classifyWorkoutType(0.75)).toBe('fun');
      expect(classifyWorkoutType(0.82)).toBe('fun');
      expect(classifyWorkoutType(0.87)).toBe('fun');
    });

    it('should classify recovery workouts (IF > 0)', () => {
      expect(classifyWorkoutType(0.5)).toBe('recovery');
      expect(classifyWorkoutType(0.74)).toBe('recovery');
    });

    it('should return unknown for zero intensity', () => {
      expect(classifyWorkoutType(0)).toBe('unknown');
    });
  });

  describe('calculateTSS', () => {
    it('should calculate TSS correctly', () => {
      // 1 hour at FTP = 100 TSS
      const tss = calculateTSS(3600, 250, 250);
      expect(tss).toBe(100);
    });

    it('should handle high intensity workouts', () => {
      // 30 min at 10% above FTP
      const tss = calculateTSS(1800, 275, 250);
      expect(tss).toBeGreaterThan(50);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateTSS(0, 200, 250)).toBe(0);
      expect(calculateTSS(3600, 0, 250)).toBe(0);
      expect(calculateTSS(3600, 200, 0)).toBe(0);
      expect(calculateTSS(-100, 200, 250)).toBe(0);
    });
  });

  describe('calculateIntensityFactor', () => {
    it('should calculate IF correctly', () => {
      expect(calculateIntensityFactor(250, 250)).toBe(1.0);
      expect(calculateIntensityFactor(275, 250)).toBe(1.1);
      expect(calculateIntensityFactor(200, 250)).toBe(0.8);
    });

    it('should round to 2 decimal places', () => {
      expect(calculateIntensityFactor(233, 250)).toBe(0.93);
    });

    it('should return 0 for invalid inputs', () => {
      expect(calculateIntensityFactor(0, 250)).toBe(0);
      expect(calculateIntensityFactor(200, 0)).toBe(0);
    });
  });

  describe('processStravaActivity', () => {
    it('should process a Strava activity correctly', () => {
      const stravaActivity: StravaActivity = {
        id: 12345,
        type: 'VirtualRide',
        moving_time: 3600,
        elapsed_time: 3900,
        average_watts: 200,
        weighted_average_watts: 210,
        max_watts: 350,
        average_heartrate: 145,
        max_heartrate: 175,
        start_date: '2024-01-15T10:00:00Z',
      };

      const result = processStravaActivity(stravaActivity, 250, 'user-123');

      expect(result).toMatchObject({
        stravaId: 12345,
        userId: 'user-123',
        date: '2024-01-15T10:00:00Z',
        durationMinutes: 60,
        avgPower: 200,
        normalizedPower: 210,
        maxPower: 350,
        avgHeartRate: 145,
        maxHeartRate: 175,
        source: 'strava',
      });
      expect(result.tss).toBeGreaterThan(0);
      expect(result.intensityFactor).toBe(0.84);
      expect(result.type).toBe('fun'); // 0.84 IF = fun ride
      expect(result.createdAt).toBeDefined();
    });

    it('should use average watts when weighted not available', () => {
      const stravaActivity: StravaActivity = {
        id: 12345,
        type: 'VirtualRide',
        moving_time: 3600,
        elapsed_time: 3600,
        average_watts: 200,
        start_date: '2024-01-15T10:00:00Z',
      };

      const result = processStravaActivity(stravaActivity, 250, 'user-123');

      expect(result.normalizedPower).toBe(200);
      expect(result.avgPower).toBe(200);
    });

    it('should handle missing power data', () => {
      const stravaActivity: StravaActivity = {
        id: 12345,
        type: 'Ride',
        moving_time: 3600,
        elapsed_time: 3600,
        start_date: '2024-01-15T10:00:00Z',
      };

      const result = processStravaActivity(stravaActivity, 250, 'user-123');

      expect(result.avgPower).toBe(0);
      expect(result.normalizedPower).toBe(0);
      expect(result.tss).toBe(0);
      expect(result.type).toBe('unknown');
    });
  });

  describe('filterCyclingActivities', () => {
    it('should filter to only cycling activities', () => {
      const activities: StravaActivity[] = [
        {
          id: 1,
          type: 'VirtualRide',
          moving_time: 3600,
          elapsed_time: 3600,
          start_date: '2024-01-15',
        },
        {
          id: 2,
          type: 'Run',
          moving_time: 1800,
          elapsed_time: 1800,
          start_date: '2024-01-14',
        },
        {
          id: 3,
          type: 'Ride',
          moving_time: 7200,
          elapsed_time: 7200,
          start_date: '2024-01-13',
        },
        {
          id: 4,
          type: 'Swim',
          moving_time: 2700,
          elapsed_time: 2700,
          start_date: '2024-01-12',
        },
      ];

      const result = filterCyclingActivities(activities);

      expect(result).toHaveLength(2);
      expect(result.map((a) => a.id)).toEqual([1, 3]);
    });

    it('should return empty array when no cycling activities', () => {
      const activities: StravaActivity[] = [
        {
          id: 1,
          type: 'Run',
          moving_time: 1800,
          elapsed_time: 1800,
          start_date: '2024-01-15',
        },
      ];

      const result = filterCyclingActivities(activities);

      expect(result).toHaveLength(0);
    });
  });

  describe('areTokensExpired', () => {
    it('should return true for expired tokens', () => {
      const tokens = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired 100 seconds ago
        athleteId: 123,
      };

      expect(areTokensExpired(tokens)).toBe(true);
    });

    it('should return true for tokens expiring within buffer period', () => {
      const tokens = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 60, // Expires in 1 minute (within 5 min buffer)
        athleteId: 123,
      };

      expect(areTokensExpired(tokens)).toBe(true);
    });

    it('should return false for valid tokens', () => {
      const tokens = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
        athleteId: 123,
      };

      expect(areTokensExpired(tokens)).toBe(false);
    });
  });
});
