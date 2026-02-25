/**
 * Integration Tests for Cycling API
 *
 * These tests run against the Firebase emulator and verify core cycling read/write flows:
 * - Activities CRUD (POST, GET, GET/:id, DELETE)
 * - FTP read/write (POST, GET, GET /history)
 * - Cycling profile read/write (PUT, GET)
 * - Schema validation (FTP negative value failure path)
 *
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const CYCLING_URL = `${FUNCTIONS_URL}/devCycling`;

// Local interfaces for assertions
interface CyclingActivity {
  id: string;
  stravaId: number;
  userId: string;
  date: string;
  durationMinutes: number;
  avgPower: number;
  normalizedPower: number;
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  tss: number;
  intensityFactor: number;
  type: string;
  source: string;
  createdAt: string;
}

interface FTPEntry {
  id: string;
  userId: string;
  value: number;
  date: string;
  source: string;
}

interface CyclingProfile {
  userId: string;
  weightKg: number;
  maxHR?: number;
  restingHR?: number;
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

// Helper functions

/**
 * Check if the emulator is running by hitting the health endpoint.
 */
async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a unique user ID for test isolation.
 * @param scope A descriptive scope (e.g., "activities", "ftp", "profile")
 */
function makeUserId(scope: string): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  return `test-${scope}-${timestamp}-${random}`;
}

/**
 * Build JSON headers with x-user-id for requests.
 */
function buildJsonHeaders(userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

/**
 * Create a valid cycling activity payload.
 */
function createValidActivity(
  overrides?: Partial<Record<string, unknown>>
): Record<string, unknown> {
  return {
    stravaId: 987654321,
    date: '2026-02-20',
    durationMinutes: 75,
    avgPower: 210,
    normalizedPower: 225,
    maxPower: 430,
    avgHeartRate: 148,
    maxHeartRate: 178,
    tss: 88,
    intensityFactor: 0.86,
    type: 'threshold',
    source: 'strava',
    createdAt: '2026-02-20T12:00:00.000Z',
    ...overrides,
  };
}

// Test suite

describe('Cycling API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  describe('Activities CRUD', () => {
    it('should create, list, fetch, and delete cycling activities', async () => {
      const userId = makeUserId('activities');
      const headers = buildJsonHeaders(userId);

      // Create activity
      const createResponse = await fetch(`${CYCLING_URL}/activities`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createValidActivity()),
      });
      expect(createResponse.status).toBe(201);
      const createResult = (await createResponse.json()) as ApiResponse<CyclingActivity>;
      expect(createResult.success).toBe(true);
      expect(createResult.data.id).toBeDefined();
      const activityId = createResult.data.id;
      expect(createResult.data.stravaId).toBe(987654321);
      expect(createResult.data.type).toBe('threshold');
      expect(createResult.data.tss).toBe(88);
      expect(createResult.data.userId).toBe(userId);

      // List activities
      const listResponse = await fetch(`${CYCLING_URL}/activities`, {
        headers,
      });
      expect(listResponse.status).toBe(200);
      const listResult = (await listResponse.json()) as ApiResponse<CyclingActivity[]>;
      expect(listResult.success).toBe(true);
      expect(Array.isArray(listResult.data)).toBe(true);
      const activityInList = listResult.data.find((a) => a.id === activityId);
      expect(activityInList).toBeDefined();
      expect(activityInList?.stravaId).toBe(987654321);

      // Get activity by ID
      const getResponse = await fetch(`${CYCLING_URL}/activities/${activityId}`, {
        headers,
      });
      expect(getResponse.status).toBe(200);
      const getResult = (await getResponse.json()) as ApiResponse<CyclingActivity>;
      expect(getResult.success).toBe(true);
      expect(getResult.data.id).toBe(activityId);
      expect(getResult.data.stravaId).toBe(987654321);
      expect(getResult.data.type).toBe('threshold');
      expect(getResult.data.tss).toBe(88);
      expect(getResult.data.userId).toBe(userId);

      // Delete activity
      const deleteResponse = await fetch(`${CYCLING_URL}/activities/${activityId}`, {
        method: 'DELETE',
        headers,
      });
      expect(deleteResponse.status).toBe(200);
      const deleteResult = (await deleteResponse.json()) as ApiResponse<{ deleted: boolean }>;
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.data.deleted).toBe(true);

      // Verify activity is deleted (404)
      const getDeletedResponse = await fetch(
        `${CYCLING_URL}/activities/${activityId}`,
        { headers }
      );
      expect(getDeletedResponse.status).toBe(404);
      const getDeletedResult = (await getDeletedResponse.json()) as ApiError;
      expect(getDeletedResult.success).toBe(false);
      expect(getDeletedResult.error.code).toBe('NOT_FOUND');
    });
  });

  describe('FTP Operations', () => {
    it('should create FTP entry and return it from current + history endpoints', async () => {
      const userId = makeUserId('ftp');
      const headers = buildJsonHeaders(userId);

      // Initial GET /ftp should return null
      const initialGetResponse = await fetch(`${CYCLING_URL}/ftp`, {
        headers,
      });
      expect(initialGetResponse.status).toBe(200);
      const initialGetResult = (await initialGetResponse.json()) as ApiResponse<FTPEntry | null>;
      expect(initialGetResult.success).toBe(true);
      expect(initialGetResult.data).toBe(null);

      // Create FTP entry
      const createResponse = await fetch(`${CYCLING_URL}/ftp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          value: 265,
          date: '2026-02-21',
          source: 'test',
        }),
      });
      expect(createResponse.status).toBe(201);
      const createResult = (await createResponse.json()) as ApiResponse<FTPEntry>;
      expect(createResult.success).toBe(true);
      expect(createResult.data.id).toBeDefined();
      const ftpId = createResult.data.id;
      expect(createResult.data.value).toBe(265);
      expect(createResult.data.source).toBe('test');

      // Get current FTP
      const getCurrentResponse = await fetch(`${CYCLING_URL}/ftp`, {
        headers,
      });
      expect(getCurrentResponse.status).toBe(200);
      const getCurrentResult = (await getCurrentResponse.json()) as ApiResponse<FTPEntry>;
      expect(getCurrentResult.success).toBe(true);
      expect(getCurrentResult.data.id).toBe(ftpId);
      expect(getCurrentResult.data.value).toBe(265);
      expect(getCurrentResult.data.source).toBe('test');

      // Get FTP history
      const historyResponse = await fetch(`${CYCLING_URL}/ftp/history`, {
        headers,
      });
      expect(historyResponse.status).toBe(200);
      const historyResult = (await historyResponse.json()) as ApiResponse<FTPEntry[]>;
      expect(historyResult.success).toBe(true);
      expect(Array.isArray(historyResult.data)).toBe(true);
      const createdInHistory = historyResult.data.find((f) => f.id === ftpId);
      expect(createdInHistory).toBeDefined();
      expect(createdInHistory?.value).toBe(265);
    });
  });

  describe('Cycling Profile Operations', () => {
    it('should upsert cycling profile and read it back', async () => {
      const userId = makeUserId('profile');
      const headers = buildJsonHeaders(userId);

      // Initial GET /profile should return null
      const initialGetResponse = await fetch(`${CYCLING_URL}/profile`, {
        headers,
      });
      expect(initialGetResponse.status).toBe(200);
      const initialGetResult = (await initialGetResponse.json()) as ApiResponse<CyclingProfile | null>;
      expect(initialGetResult.success).toBe(true);
      expect(initialGetResult.data).toBe(null);

      // PUT profile
      const putResponse = await fetch(`${CYCLING_URL}/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          weightKg: 74.5,
          maxHR: 190,
          restingHR: 52,
        }),
      });
      expect(putResponse.status).toBe(200);
      const putResult = (await putResponse.json()) as ApiResponse<CyclingProfile>;
      expect(putResult.success).toBe(true);
      expect(putResult.data.weightKg).toBe(74.5);
      expect(putResult.data.maxHR).toBe(190);
      expect(putResult.data.restingHR).toBe(52);
      expect(putResult.data.userId).toBe(userId);

      // GET profile and verify it persisted
      const getResponse = await fetch(`${CYCLING_URL}/profile`, {
        headers,
      });
      expect(getResponse.status).toBe(200);
      const getResult = (await getResponse.json()) as ApiResponse<CyclingProfile>;
      expect(getResult.success).toBe(true);
      expect(getResult.data.weightKg).toBe(74.5);
      expect(getResult.data.maxHR).toBe(190);
      expect(getResult.data.restingHR).toBe(52);
      expect(getResult.data.userId).toBe(userId);
    });
  });

  describe('Validation Failure Path', () => {
    it('should reject invalid FTP payload (negative value)', async () => {
      const userId = makeUserId('ftp-validation');
      const headers = buildJsonHeaders(userId);

      const response = await fetch(`${CYCLING_URL}/ftp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          value: -10,
          date: '2026-02-21',
          source: 'test',
        }),
      });

      expect(response.status).toBe(400);
      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
