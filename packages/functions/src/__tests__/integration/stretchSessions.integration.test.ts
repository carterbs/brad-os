/**
 * Integration Tests for Stretch Sessions API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const STRETCH_SESSIONS_URL = `${FUNCTIONS_URL}/devStretchSessions`;

interface CompletedStretch {
  region: string;
  stretchId: string;
  stretchName: string;
  durationSeconds: number;
  skippedSegments: number;
}

interface StretchSession {
  id: string;
  completedAt: string;
  totalDurationSeconds: number;
  regionsCompleted: number;
  regionsSkipped: number;
  stretches: CompletedStretch[];
  created_at: string;
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function createValidStretchSession(): object {
  return {
    completedAt: new Date().toISOString(),
    totalDurationSeconds: 600,
    regionsCompleted: 4,
    regionsSkipped: 0,
    stretches: [
      {
        region: 'neck',
        stretchId: 'neck-stretch-1',
        stretchName: 'Neck Stretch',
        durationSeconds: 60,
        skippedSegments: 0,
      },
      {
        region: 'shoulders',
        stretchId: 'shoulder-stretch-1',
        stretchName: 'Shoulder Stretch',
        durationSeconds: 90,
        skippedSegments: 0,
      },
      {
        region: 'back',
        stretchId: 'back-stretch-1',
        stretchName: 'Back Stretch',
        durationSeconds: 120,
        skippedSegments: 1,
      },
      {
        region: 'hamstrings',
        stretchId: 'hamstring-stretch-1',
        stretchName: 'Hamstring Stretch',
        durationSeconds: 90,
        skippedSegments: 0,
      },
    ],
  };
}

describe('Stretch Sessions API (Integration)', () => {
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

  it('should create a stretch session', async () => {
    const sessionData = createValidStretchSession();

    const response = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<StretchSession>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBeDefined();
    expect(result.data.totalDurationSeconds).toBe(600);
    expect(result.data.regionsCompleted).toBe(4);
    expect(result.data.stretches).toHaveLength(4);
  });

  it('should list all stretch sessions', async () => {
    const response = await fetch(STRETCH_SESSIONS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<StretchSession[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should get the latest stretch session', async () => {
    // Create a new session first
    await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchSession()),
    });

    const response = await fetch(`${STRETCH_SESSIONS_URL}/latest`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<StretchSession | null>;
    expect(result.success).toBe(true);
    // May or may not have a session depending on timing
    if (result.data !== null) {
      expect(result.data.id).toBeDefined();
      expect(result.data.stretches).toBeDefined();
    }
  });

  it('should get a stretch session by id', async () => {
    // Create a session first
    const createResponse = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchSession()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<StretchSession>;
    const sessionId = createResult.data.id;

    // Get by ID
    const response = await fetch(`${STRETCH_SESSIONS_URL}/${sessionId}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<StretchSession>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBe(sessionId);
    expect(result.data.stretches).toBeDefined();
  });

  it('should return 404 for non-existent stretch session', async () => {
    const response = await fetch(`${STRETCH_SESSIONS_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should validate stretch session creation - missing completedAt', async () => {
    const invalidData = {
      totalDurationSeconds: 600,
      regionsCompleted: 4,
      regionsSkipped: 0,
      stretches: [
        {
          region: 'neck',
          stretchId: 'neck-stretch-1',
          stretchName: 'Neck Stretch',
          durationSeconds: 60,
          skippedSegments: 0,
        },
      ],
    };

    const response = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate stretch session creation - empty stretches array', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      totalDurationSeconds: 0,
      regionsCompleted: 0,
      regionsSkipped: 0,
      stretches: [],
    };

    const response = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate stretch session creation - invalid region', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      totalDurationSeconds: 60,
      regionsCompleted: 1,
      regionsSkipped: 0,
      stretches: [
        {
          region: 'invalid_region',
          stretchId: 'stretch-1',
          stretchName: 'Some Stretch',
          durationSeconds: 60,
          skippedSegments: 0,
        },
      ],
    };

    const response = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate stretch session creation - negative duration', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      totalDurationSeconds: -100,
      regionsCompleted: 1,
      regionsSkipped: 0,
      stretches: [
        {
          region: 'neck',
          stretchId: 'stretch-1',
          stretchName: 'Neck Stretch',
          durationSeconds: 60,
          skippedSegments: 0,
        },
      ],
    };

    const response = await fetch(STRETCH_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
