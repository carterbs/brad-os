import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type {
  CyclingActivity,
  FTPEntry,
  TrainingBlock,
  WeightGoal,
} from '../shared.js';

// Type for API response body
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

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
}));

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
});
