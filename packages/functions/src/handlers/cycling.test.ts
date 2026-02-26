import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type {
  CyclingActivity,
  FTPEntry,
  TrainingBlock,
  WeightGoal,
} from '../shared.js';
import { type ApiResponse } from '../__tests__/utils/index.js';

// Mock the cycling service - use vi.hoisted to define before vi.mock hoisting
const mockCyclingService = vi.hoisted(() => ({
  getCyclingActivities: vi.fn(),
  getCyclingActivityById: vi.fn(),
  createCyclingActivity: vi.fn(),
  deleteCyclingActivity: vi.fn(),
  getCurrentFTP: vi.fn(),
  getFTPHistory: vi.fn(),
  createFTPEntry: vi.fn(),
  getCurrentTrainingBlock: vi.fn(),
  getTrainingBlocks: vi.fn(),
  createTrainingBlock: vi.fn(),
  completeTrainingBlock: vi.fn(),
  updateTrainingBlockWeek: vi.fn(),
  getWeightGoal: vi.fn(),
  setWeightGoal: vi.fn(),
  getActivityStreams: vi.fn(),
  saveActivityStreams: vi.fn(),
  getStravaTokens: vi.fn(),
  setStravaTokens: vi.fn(),
  saveVO2MaxEstimate: vi.fn(),
  getLatestVO2Max: vi.fn(),
  getVO2MaxHistory: vi.fn(),
  getCyclingProfile: vi.fn(),
  setCyclingProfile: vi.fn(),
}));

const mockStravaService = vi.hoisted(() => ({
  areTokensExpired: vi.fn(),
  refreshStravaTokens: vi.fn(),
  fetchActivityStreams: vi.fn(),
  fetchStravaActivities: vi.fn(),
  filterCyclingActivities: vi.fn(),
  processStravaActivity: vi.fn(),
}));

const mockTrainingLoadService = vi.hoisted(() => ({
  calculateTrainingLoadMetrics: vi.fn(),
  getWeekInBlock: vi.fn(),
}));

const mockVo2MaxService = vi.hoisted(() => ({
  estimateVO2MaxFromFTP: vi.fn(),
  categorizeVO2Max: vi.fn(),
}));

vi.mock('../services/strava.service.js', () => mockStravaService);
vi.mock('../services/training-load.service.js', () => mockTrainingLoadService);
vi.mock('../services/vo2max.service.js', () => mockVo2MaxService);

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void =>
    next(),
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);

// Import after mocks
import { cyclingApp } from './cycling.js';

// Helper functions to create test data
function createTestActivity(
  overrides: Partial<CyclingActivity> = {}
): CyclingActivity {
  return {
    id: 'activity-1',
    stravaId: 12345,
    userId: 'default-user',
    date: '2024-01-15',
    durationMinutes: 60,
    avgPower: 200,
    normalizedPower: 210,
    maxPower: 350,
    avgHeartRate: 145,
    maxHeartRate: 175,
    tss: 65,
    intensityFactor: 0.84,
    type: 'threshold',
    source: 'strava',
    createdAt: '2024-01-15T12:00:00.000Z',
    ...overrides,
  };
}

function createTestFTPEntry(overrides: Partial<FTPEntry> = {}): FTPEntry {
  return {
    id: 'ftp-1',
    userId: 'default-user',
    value: 250,
    date: '2024-01-01',
    source: 'test',
    ...overrides,
  };
}

function createTestTrainingBlock(
  overrides: Partial<TrainingBlock> = {}
): TrainingBlock {
  return {
    id: 'block-1',
    userId: 'default-user',
    startDate: '2024-01-01',
    endDate: '2024-02-25',
    currentWeek: 1,
    goals: ['regain_fitness'],
    status: 'active',
    ...overrides,
  };
}

function createTestWeightGoal(overrides: Partial<WeightGoal> = {}): WeightGoal {
  return {
    userId: 'default-user',
    targetWeightLbs: 175,
    targetDate: '2024-06-01',
    startWeightLbs: 185,
    startDate: '2024-01-01',
    ...overrides,
  };
}

describe('Cycling Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockTrainingLoadService.calculateTrainingLoadMetrics.mockReturnValue({
      atl: 45,
      ctl: 39,
      tsb: 6,
    });
    mockTrainingLoadService.getWeekInBlock.mockReturnValue(2);
    mockVo2MaxService.estimateVO2MaxFromFTP.mockReturnValue(52);
    mockVo2MaxService.categorizeVO2Max.mockReturnValue('Excellent');
    mockStravaService.filterCyclingActivities.mockImplementation((items: unknown[]) => items);
    mockStravaService.processStravaActivity.mockImplementation((_activity: unknown, _ftp: number, userId: string) =>
      createTestActivity({ id: 'processed', userId, stravaId: 99999 })
    );
  });

  describe('GET /cycling/activities', () => {
    it('should return all activities', async () => {
      const activities = [
        createTestActivity({ id: '1' }),
        createTestActivity({ id: '2' }),
      ];
      mockCyclingService.getCyclingActivities.mockResolvedValue(activities);

      const response = await request(cyclingApp).get('/activities');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: activities,
      });
      expect(mockCyclingService.getCyclingActivities).toHaveBeenCalledWith(
        'default-user',
        undefined
      );
    });

    it('should respect limit parameter', async () => {
      mockCyclingService.getCyclingActivities.mockResolvedValue([]);

      await request(cyclingApp).get('/activities?limit=10');

      expect(mockCyclingService.getCyclingActivities).toHaveBeenCalledWith(
        'default-user',
        10
      );
    });

    it('should use user ID from header', async () => {
      mockCyclingService.getCyclingActivities.mockResolvedValue([]);

      await request(cyclingApp)
        .get('/activities')
        .set('x-user-id', 'custom-user');

      expect(mockCyclingService.getCyclingActivities).toHaveBeenCalledWith(
        'custom-user',
        undefined
      );
    });
  });

  describe('GET /cycling/activities/:id', () => {
    it('should return activity by id', async () => {
      const activity = createTestActivity({ id: 'activity-123' });
      mockCyclingService.getCyclingActivityById.mockResolvedValue(activity);

      const response = await request(cyclingApp).get('/activities/activity-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: activity,
      });
    });

    it('should return 404 when activity not found', async () => {
      mockCyclingService.getCyclingActivityById.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/activities/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'CyclingActivity with id non-existent not found',
        },
      });
    });
  });

  describe('POST /cycling/activities', () => {
    it('should create activity', async () => {
      const activity = createTestActivity();
      mockCyclingService.createCyclingActivity.mockResolvedValue(activity);

      const response = await request(cyclingApp)
        .post('/activities')
        .send({
          stravaId: 12345,
          date: '2024-01-15',
          durationMinutes: 60,
          avgPower: 200,
          normalizedPower: 210,
          maxPower: 350,
          avgHeartRate: 145,
          maxHeartRate: 175,
          tss: 65,
          intensityFactor: 0.84,
          type: 'threshold',
          source: 'strava',
          createdAt: '2024-01-15T12:00:00.000Z',
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: activity,
      });
    });
  });

  describe('DELETE /cycling/activities/:id', () => {
    it('should delete activity', async () => {
      mockCyclingService.deleteCyclingActivity.mockResolvedValue(true);

      const response = await request(cyclingApp).delete(
        '/activities/activity-123'
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: true },
      });
    });

    it('should return 404 when activity not found', async () => {
      mockCyclingService.deleteCyclingActivity.mockResolvedValue(false);

      const response = await request(cyclingApp).delete(
        '/activities/non-existent'
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /cycling/training-load', () => {
    it('should return training load metrics', async () => {
      const activities = [
        createTestActivity({ date: '2024-01-15', tss: 50 }),
        createTestActivity({ date: '2024-01-14', tss: 60 }),
      ];
      mockCyclingService.getCyclingActivities.mockResolvedValue(activities);

      const response = await request(cyclingApp).get('/training-load');
      const body = response.body as ApiResponse<{
        atl: number;
        ctl: number;
        tsb: number;
        recentCyclingWorkouts: CyclingActivity[];
      }>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('atl');
      expect(body.data).toHaveProperty('ctl');
      expect(body.data).toHaveProperty('tsb');
      expect(body.data).toHaveProperty('recentCyclingWorkouts');
    });
  });

  describe('GET /cycling/ftp', () => {
    it('should return current FTP', async () => {
      const ftp = createTestFTPEntry();
      mockCyclingService.getCurrentFTP.mockResolvedValue(ftp);

      const response = await request(cyclingApp).get('/ftp');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: ftp,
      });
    });

    it('should return null when no FTP exists', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/ftp');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('GET /cycling/ftp/history', () => {
    it('should return FTP history', async () => {
      const history = [
        createTestFTPEntry({ id: '1', value: 250, date: '2024-01-15' }),
        createTestFTPEntry({ id: '2', value: 245, date: '2024-01-01' }),
      ];
      mockCyclingService.getFTPHistory.mockResolvedValue(history);

      const response = await request(cyclingApp).get('/ftp/history');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: history,
      });
    });
  });

  describe('POST /cycling/ftp', () => {
    it('should create FTP entry with valid data', async () => {
      const ftp = createTestFTPEntry();
      mockCyclingService.createFTPEntry.mockResolvedValue(ftp);

      const response = await request(cyclingApp).post('/ftp').send({
        value: 250,
        date: '2024-01-15',
        source: 'test',
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: ftp,
      });
    });

    it('should return 400 for invalid FTP value', async () => {
      const response: Response = await request(cyclingApp).post('/ftp').send({
        value: -100,
        date: '2024-01-15',
        source: 'test',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid date format', async () => {
      const response: Response = await request(cyclingApp).post('/ftp').send({
        value: 250,
        date: 'invalid-date',
        source: 'test',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid source', async () => {
      const response: Response = await request(cyclingApp).post('/ftp').send({
        value: 250,
        date: '2024-01-15',
        source: 'invalid',
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /cycling/block', () => {
    it('should return current training block', async () => {
      const block = createTestTrainingBlock();
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(block);
      mockCyclingService.updateTrainingBlockWeek.mockResolvedValue(true);

      const response = await request(cyclingApp).get('/block');
      const body = response.body as ApiResponse<TrainingBlock>;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeTruthy();
    });

    it('should return null when no active block', async () => {
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/block');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('POST /cycling/block', () => {
    it('should create training block', async () => {
      const block = createTestTrainingBlock();
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);
      mockCyclingService.createTrainingBlock.mockResolvedValue(block);

      const response = await request(cyclingApp).post('/block').send({
        startDate: '2024-01-01',
        endDate: '2024-02-25',
        goals: ['regain_fitness'],
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: block,
      });
    });

    it('should complete existing block when creating new one', async () => {
      const existingBlock = createTestTrainingBlock({ id: 'old-block' });
      const newBlock = createTestTrainingBlock({ id: 'new-block' });
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(existingBlock);
      mockCyclingService.completeTrainingBlock.mockResolvedValue(true);
      mockCyclingService.createTrainingBlock.mockResolvedValue(newBlock);

      await request(cyclingApp).post('/block').send({
        startDate: '2024-03-01',
        endDate: '2024-04-25',
        goals: ['maintain_muscle'],
      });

      expect(mockCyclingService.completeTrainingBlock).toHaveBeenCalledWith(
        'default-user',
        'old-block'
      );
    });

    it('should create training block with weeklySessions from iOS', async () => {
      const block = createTestTrainingBlock();
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);
      mockCyclingService.createTrainingBlock.mockResolvedValue(block);

      const response = await request(cyclingApp).post('/block').send({
        startDate: '2024-01-01',
        endDate: '2024-02-25',
        goals: ['regain_fitness'],
        daysPerWeek: 3,
        weeklySessions: [
          { order: 1, sessionType: 'vo2max', pelotonClassTypes: ['Power Zone Max', 'HIIT & Hills'], suggestedDurationMinutes: 30, description: 'High-intensity session' },
          { order: 2, sessionType: 'threshold', pelotonClassTypes: ['Power Zone', 'Sweat Steady'], suggestedDurationMinutes: 45, description: 'Threshold session' },
          { order: 3, sessionType: 'fun', pelotonClassTypes: ['Music', 'Theme'], suggestedDurationMinutes: 30, description: 'Fun ride' },
        ],
        preferredDays: [2, 4, 6],
        experienceLevel: 'intermediate',
        weeklyHoursAvailable: 4.5,
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: block,
      });
    });

    it('should accept weeklySessions with AI-generated sessionType strings', async () => {
      const block = createTestTrainingBlock();
      mockCyclingService.getCurrentTrainingBlock.mockResolvedValue(null);
      mockCyclingService.createTrainingBlock.mockResolvedValue(block);

      const response = await request(cyclingApp).post('/block').send({
        startDate: '2024-01-01',
        endDate: '2024-02-25',
        goals: ['regain_fitness'],
        daysPerWeek: 3,
        weeklySessions: [
          { order: 1, sessionType: 'sweet_spot', pelotonClassTypes: ['Power Zone'], suggestedDurationMinutes: 45, description: 'Sweet spot session' },
          { order: 2, sessionType: 'base', pelotonClassTypes: ['PZ Endurance'], suggestedDurationMinutes: 60, description: 'Base building' },
        ],
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: block,
      });
    });

    it('should return 400 for invalid goals', async () => {
      const response: Response = await request(cyclingApp).post('/block').send({
        startDate: '2024-01-01',
        endDate: '2024-02-25',
        goals: ['invalid_goal'],
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 400 for empty goals', async () => {
      const response: Response = await request(cyclingApp).post('/block').send({
        startDate: '2024-01-01',
        endDate: '2024-02-25',
        goals: [],
      });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('PUT /cycling/block/:id/complete', () => {
    it('should complete training block', async () => {
      mockCyclingService.completeTrainingBlock.mockResolvedValue(true);

      const response = await request(cyclingApp).put('/block/block-123/complete');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { completed: true },
      });
    });

    it('should return 404 when block not found', async () => {
      mockCyclingService.completeTrainingBlock.mockResolvedValue(false);

      const response = await request(cyclingApp).put(
        '/block/non-existent/complete'
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /cycling/weight-goal', () => {
    it('should return weight goal', async () => {
      const goal = createTestWeightGoal();
      mockCyclingService.getWeightGoal.mockResolvedValue(goal);

      const response = await request(cyclingApp).get('/weight-goal');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: goal,
      });
    });

    it('should return null when no goal set', async () => {
      mockCyclingService.getWeightGoal.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/weight-goal');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe('POST /cycling/weight-goal', () => {
    it('should set weight goal', async () => {
      const goal = createTestWeightGoal();
      mockCyclingService.setWeightGoal.mockResolvedValue(goal);

      const response = await request(cyclingApp).post('/weight-goal').send({
        targetWeightLbs: 175,
        targetDate: '2024-06-01',
        startWeightLbs: 185,
        startDate: '2024-01-01',
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        data: goal,
      });
    });

    it('should return 400 for invalid weight', async () => {
      const response: Response = await request(cyclingApp)
        .post('/weight-goal')
        .send({
          targetWeightLbs: -10,
          targetDate: '2024-06-01',
          startWeightLbs: 185,
          startDate: '2024-01-01',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });

    it('should return 400 for invalid date format', async () => {
      const response: Response = await request(cyclingApp)
        .post('/weight-goal')
        .send({
          targetWeightLbs: 175,
          targetDate: 'invalid-date',
          startWeightLbs: 185,
          startDate: '2024-01-01',
        });
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /cycling/activities/:id/streams', () => {
    it('should return streams for an activity', async () => {
      const activity = createTestActivity({ id: 'activity-123' });
      mockCyclingService.getCyclingActivityById.mockResolvedValue(activity);
      mockCyclingService.getActivityStreams.mockResolvedValue({
        activityId: 'activity-123',
        stravaActivityId: 12345,
        watts: [150, 160, 170],
        heartrate: [130, 135, 140],
        time: [0, 1, 2],
        sampleCount: 3,
        createdAt: '2024-01-15T12:00:00.000Z',
      });

      const response = await request(cyclingApp).get('/activities/activity-123/streams');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          activityId: 'activity-123',
          stravaActivityId: 12345,
          watts: [150, 160, 170],
          heartrate: [130, 135, 140],
          time: [0, 1, 2],
          sampleCount: 3,
          createdAt: '2024-01-15T12:00:00.000Z',
        },
      });
    });

    it('should return 404 when activity not found', async () => {
      mockCyclingService.getCyclingActivityById.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/activities/non-existent/streams');

      expect(response.status).toBe(404);
    });

    it('should return 404 when streams not found', async () => {
      const activity = createTestActivity({ id: 'activity-123' });
      mockCyclingService.getCyclingActivityById.mockResolvedValue(activity);
      mockCyclingService.getActivityStreams.mockResolvedValue(null);

      const response = await request(cyclingApp).get('/activities/activity-123/streams');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Streams for activity activity-123 not found',
        },
      });
    });
  });

  describe('POST /cycling/activities/backfill-streams', () => {
    it('should backfill streams for activities without them', async () => {
      const activities = [
        createTestActivity({ id: 'a1', stravaId: 111 }),
        createTestActivity({ id: 'a2', stravaId: 222 }),
      ];
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        athleteId: 12345,
      });
      mockStravaService.areTokensExpired.mockReturnValue(false);
      mockCyclingService.getCyclingActivities.mockResolvedValue(activities);
      // First activity has no streams, second already has them
      mockCyclingService.getActivityStreams
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ activityId: 'a2', sampleCount: 100 });
      mockStravaService.fetchActivityStreams.mockResolvedValue({
        watts: { data: [100, 110], series_type: 'distance', original_size: 2, resolution: 'high' },
        heartrate: { data: [120, 125], series_type: 'distance', original_size: 2, resolution: 'high' },
        time: { data: [0, 1], series_type: 'distance', original_size: 2, resolution: 'high' },
      });
      mockCyclingService.saveActivityStreams.mockResolvedValue(undefined);

      const response = await request(cyclingApp).post('/activities/backfill-streams');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { backfilled: 1, skipped: 1, failed: 0 },
      });
      expect(mockCyclingService.saveActivityStreams).toHaveBeenCalledTimes(1);
      expect(mockCyclingService.saveActivityStreams).toHaveBeenCalledWith(
        'default-user',
        'a1',
        expect.objectContaining({
          activityId: 'a1',
          stravaActivityId: 111,
          sampleCount: 2,
        })
      );
    });

    it('should return 400 when Strava not connected', async () => {
      mockCyclingService.getStravaTokens.mockResolvedValue(null);

      const response = await request(cyclingApp).post('/activities/backfill-streams');

      expect(response.status).toBe(400);
      const body = response.body as ApiResponse;
      expect(body.success).toBe(false);
    });

    it('should return 500 when token refresh is needed but Strava credentials are missing', async () => {
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: 1,
        athleteId: 12345,
      });
      mockStravaService.areTokensExpired.mockReturnValue(true);
      const prevClientId = process.env['STRAVA_CLIENT_ID'];
      const prevClientSecret = process.env['STRAVA_CLIENT_SECRET'];
      delete process.env['STRAVA_CLIENT_ID'];
      delete process.env['STRAVA_CLIENT_SECRET'];

      const response = await request(cyclingApp).post('/activities/backfill-streams');

      process.env['STRAVA_CLIENT_ID'] = prevClientId;
      process.env['STRAVA_CLIENT_SECRET'] = prevClientSecret;
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Strava credentials not configured on server.',
      });
    });

    it('should count skipped and failed stream backfills correctly', async () => {
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        athleteId: 12345,
      });
      mockStravaService.areTokensExpired.mockReturnValue(false);
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        createTestActivity({ id: 'a1', stravaId: 1001 }),
        createTestActivity({ id: 'a2', stravaId: 1002 }),
      ]);
      mockCyclingService.getActivityStreams.mockResolvedValue(null);
      mockStravaService.fetchActivityStreams
        .mockResolvedValueOnce({
          watts: { data: [], series_type: 'distance', original_size: 0, resolution: 'high' },
          heartrate: { data: [], series_type: 'distance', original_size: 0, resolution: 'high' },
          time: { data: [], series_type: 'distance', original_size: 0, resolution: 'high' },
        })
        .mockRejectedValueOnce(new Error('strava timeout'));

      const response = await request(cyclingApp).post('/activities/backfill-streams');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { backfilled: 0, skipped: 1, failed: 1 },
      });
    });
  });

  describe('GET /cycling/blocks', () => {
    it('should return all training blocks', async () => {
      const blocks = [
        createTestTrainingBlock({ id: 'b1' }),
        createTestTrainingBlock({ id: 'b2', status: 'completed' }),
      ];
      mockCyclingService.getTrainingBlocks.mockResolvedValue(blocks);

      const response = await request(cyclingApp).get('/blocks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: blocks });
    });
  });

  describe('POST /cycling/sync', () => {
    it('should return 400 when Strava is not connected', async () => {
      mockCyclingService.getStravaTokens.mockResolvedValue(null);

      const response = await request(cyclingApp).post('/sync');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Strava not connected. Please connect Strava first.',
      });
    });

    it('should refresh expired tokens, import new rides, and skip duplicates/no-power rides', async () => {
      mockCyclingService.getStravaTokens.mockResolvedValue({
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: 1,
        athleteId: 12345,
      });
      mockCyclingService.getCurrentFTP.mockResolvedValue(createTestFTPEntry({ value: 260 }));
      mockStravaService.areTokensExpired.mockReturnValue(true);
      mockStravaService.refreshStravaTokens.mockResolvedValue({
        accessToken: 'fresh-token',
        refreshToken: 'refresh-2',
        expiresAt: Math.floor(Date.now() / 1000) + 7200,
        athleteId: 12345,
      });
      mockStravaService.fetchStravaActivities
        .mockResolvedValueOnce([
          {
            id: 2001,
            type: 'Ride',
            moving_time: 3600,
            elapsed_time: 3600,
            average_watts: 210,
            weighted_average_watts: 225,
            start_date: '2026-02-10T08:00:00.000Z',
          },
          {
            id: 2002,
            type: 'Ride',
            moving_time: 3600,
            elapsed_time: 3600,
            average_watts: 0,
            weighted_average_watts: 0,
            start_date: '2026-02-09T08:00:00.000Z',
          },
          {
            id: 2003,
            type: 'Ride',
            moving_time: 3600,
            elapsed_time: 3600,
            average_watts: 190,
            weighted_average_watts: 200,
            start_date: '2026-02-08T08:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([]);
      mockStravaService.filterCyclingActivities.mockImplementation((items: unknown[]) => items);
      mockStravaService.processStravaActivity.mockImplementation((activity: { id: number }, _ftp: number, userId: string) =>
        createTestActivity({ id: `created-${activity.id}`, stravaId: activity.id, userId })
      );
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        createTestActivity({ id: 'existing', stravaId: 2003 }),
      ]);
      mockCyclingService.createCyclingActivity.mockResolvedValue(createTestActivity({ id: 'created-2001', stravaId: 2001 }));

      const prevClientId = process.env['STRAVA_CLIENT_ID'];
      const prevClientSecret = process.env['STRAVA_CLIENT_SECRET'];
      process.env['STRAVA_CLIENT_ID'] = 'client';
      process.env['STRAVA_CLIENT_SECRET'] = 'secret';

      const response = await request(cyclingApp).post('/sync');

      process.env['STRAVA_CLIENT_ID'] = prevClientId;
      process.env['STRAVA_CLIENT_SECRET'] = prevClientSecret;

      expect(response.status).toBe(200);
      expect(mockCyclingService.setStravaTokens).toHaveBeenCalledTimes(1);
      expect(mockCyclingService.createCyclingActivity).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        success: true,
        data: {
          total: 3,
          imported: 1,
          skipped: 2,
          message: 'Imported 1 activities, skipped 2 (already synced or no power data).',
        },
      });
    });
  });

  describe('VO2 max endpoints', () => {
    it('should return latest VO2 max with categorized value', async () => {
      mockCyclingService.getLatestVO2Max.mockResolvedValue({
        id: 'vo2-1',
        userId: 'default-user',
        date: '2026-02-10',
        value: 53,
        method: 'ftp_derived',
        sourcePower: 250,
        sourceWeight: 75,
        createdAt: '2026-02-10T12:00:00.000Z',
      });
      mockCyclingService.getVO2MaxHistory.mockResolvedValue([
        { id: 'vo2-1', date: '2026-02-10', value: 53 },
      ]);
      mockVo2MaxService.categorizeVO2Max.mockReturnValue('Excellent');

      const response = await request(cyclingApp).get('/vo2max');
      const body = response.body as ApiResponse<{
        latest: { category: string } | null;
        history: unknown[];
      }>;

      expect(response.status).toBe(200);
      expect(body.data?.latest && 'category' in body.data.latest ? body.data.latest.category : null).toBe('Excellent');
      expect(body.data?.history).toHaveLength(1);
    });

    it('should return 400 when no FTP is set before VO2 calculation', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(null);

      const response = await request(cyclingApp).post('/vo2max/calculate').send({ weightKg: 75 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'No FTP set. Please set your FTP first.',
      });
    });

    it('should return 400 when VO2 estimate cannot be computed', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(createTestFTPEntry({ value: 250 }));
      mockVo2MaxService.estimateVO2MaxFromFTP.mockReturnValue(null);

      const response = await request(cyclingApp).post('/vo2max/calculate').send({ weightKg: 75 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid FTP or weight values.',
      });
    });

    it('should save VO2 estimate and profile weight on successful calculation', async () => {
      mockCyclingService.getCurrentFTP.mockResolvedValue(createTestFTPEntry({ value: 260 }));
      mockVo2MaxService.estimateVO2MaxFromFTP.mockReturnValue(54);
      mockVo2MaxService.categorizeVO2Max.mockReturnValue('Excellent');
      mockCyclingService.saveVO2MaxEstimate.mockResolvedValue({
        id: 'vo2-saved',
        userId: 'default-user',
        date: '2026-02-10',
        value: 54,
        method: 'ftp_derived',
        sourcePower: 260,
        sourceWeight: 75,
        createdAt: '2026-02-10T12:00:00.000Z',
      });
      mockCyclingService.setCyclingProfile.mockResolvedValue({
        userId: 'default-user',
        weightKg: 75,
      });

      const response = await request(cyclingApp).post('/vo2max/calculate').send({ weightKg: 75 });
      const body = response.body as ApiResponse<{ category: string }>;

      expect(response.status).toBe(201);
      expect(mockCyclingService.saveVO2MaxEstimate).toHaveBeenCalledTimes(1);
      expect(mockCyclingService.setCyclingProfile).toHaveBeenCalledWith('default-user', { weightKg: 75 });
      expect(body.data?.category).toBe('Excellent');
    });
  });

  describe('Cycling profile and EF endpoints', () => {
    it('should get and update cycling profile', async () => {
      mockCyclingService.getCyclingProfile.mockResolvedValue({
        userId: 'default-user',
        weightKg: 76,
        maxHR: 188,
        restingHR: 50,
      });
      mockCyclingService.setCyclingProfile.mockResolvedValue({
        userId: 'default-user',
        weightKg: 75,
        maxHR: 186,
        restingHR: 49,
      });

      const getResponse = await request(cyclingApp).get('/profile');
      const putResponse = await request(cyclingApp).put('/profile').send({
        weightKg: 75,
        maxHR: 186,
        restingHR: 49,
      });
      const getBody = getResponse.body as ApiResponse<{ weightKg: number }>;
      const putBody = putResponse.body as ApiResponse<{ maxHR: number }>;

      expect(getResponse.status).toBe(200);
      expect(getBody.data?.weightKg).toBe(76);
      expect(putResponse.status).toBe(200);
      expect(putBody.data?.maxHR).toBe(186);
    });

    it('should return EF history filtered to steady rides with valid EF', async () => {
      mockCyclingService.getCyclingActivities.mockResolvedValue([
        createTestActivity({ id: 'a1', ef: 1.3, intensityFactor: 0.8 }),
        createTestActivity({ id: 'a2', ef: 1.2, intensityFactor: 0.9 }),
        createTestActivity({ id: 'a3', ef: 0, intensityFactor: 0.7 }),
      ]);

      const response = await request(cyclingApp).get('/ef');
      const body = response.body as ApiResponse<Array<{ activityId: string; ef: number }>>;

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(1);
      expect(body.data?.[0]).toEqual(
        expect.objectContaining({
          activityId: 'a1',
          ef: 1.3,
        }),
      );
    });
  });
});
