import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { CyclingActivity } from '../shared.js';

const mockCyclingService = vi.hoisted(() => ({
  getCyclingActivities: vi.fn(),
  getCyclingActivityById: vi.fn(),
  createCyclingActivity: vi.fn(),
  deleteCyclingActivity: vi.fn(),
  getActivityStreams: vi.fn(),
  saveActivityStreams: vi.fn(),
  getCurrentFTP: vi.fn(),
  getFTPHistory: vi.fn(),
  createFTPEntry: vi.fn(),
  getWeightGoal: vi.fn(),
  setWeightGoal: vi.fn(),
  getStravaTokens: vi.fn(),
  setStravaTokens: vi.fn(),
  getLatestVO2Max: vi.fn(),
  getVO2MaxHistory: vi.fn(),
  saveVO2MaxEstimate: vi.fn(),
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
}));

const mockVo2MaxService = vi.hoisted(() => ({
  estimateVO2MaxFromFTP: vi.fn(),
  categorizeVO2Max: vi.fn(),
}));

vi.mock('../services/firestore-cycling.service.js', () => mockCyclingService);
vi.mock('../services/strava.service.js', () => mockStravaService);
vi.mock('../services/training-load.service.js', () => mockTrainingLoadService);
vi.mock('../services/vo2max.service.js', () => mockVo2MaxService);
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
  getCollectionName: vi.fn((name: string) => name),
}));
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

import { cyclingApp } from './cycling.js';

function activity(): CyclingActivity {
  return {
    id: 'activity-1',
    stravaId: 12345,
    userId: 'default-user',
    date: '2026-07-26T12:00:00.000Z',
    durationMinutes: 45,
    avgPower: 180,
    normalizedPower: 190,
    maxPower: 350,
    avgHeartRate: 145,
    maxHeartRate: 170,
    tss: 55,
    intensityFactor: 0.8,
    type: 'threshold',
    source: 'strava',
    createdAt: '2026-07-26T13:00:00.000Z',
  };
}

describe('Cycling data handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stored Strava activities', async () => {
    mockCyclingService.getCyclingActivities.mockResolvedValue([activity()]);

    const response = await request(cyclingApp).get('/activities?limit=7');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [activity()] });
    expect(mockCyclingService.getCyclingActivities).toHaveBeenCalledWith('default-user', 7);
  });

  it('returns recent workload derived from stored activities', async () => {
    mockCyclingService.getCyclingActivities.mockResolvedValue([activity()]);
    mockTrainingLoadService.calculateTrainingLoadMetrics.mockReturnValue({
      atl: 40,
      ctl: 35,
      tsb: -5,
    });

    const response = await request(cyclingApp).get('/training-load');

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ atl: 40, ctl: 35, tsb: -5 });
  });

  it('keeps manual Strava sync available', async () => {
    mockCyclingService.getStravaTokens.mockResolvedValue(null);

    const response = await request(cyclingApp).post('/sync');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Strava not connected. Please connect Strava first.',
    });
  });

  it('does not expose training-block planning endpoints', async () => {
    const response = await request(cyclingApp).get('/block');

    expect(response.status).toBe(404);
  });
});
