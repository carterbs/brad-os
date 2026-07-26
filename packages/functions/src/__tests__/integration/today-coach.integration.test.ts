/**
 * Integration Tests for Today Coach API
 *
 * These tests run against the standalone API backed by the Firestore emulator.
 * Run with: npm run test:integration:emulator
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';
import { HEALTH_URL, integrationApiUrl } from './api-config.js';

const TODAY_COACH_URL = integrationApiUrl('today-coach');

// Valid recovery snapshot matching coachRecommendRequestSchema
// (recoverySnapshotSchema without 'source' field)
const VALID_RECOVERY = {
  date: '2026-02-24',
  hrvMs: 55,
  hrvVsBaseline: 5,
  rhrBpm: 58,
  rhrVsBaseline: -2,
  sleepHours: 7.5,
  sleepEfficiency: 92,
  deepSleepPercent: 22,
  score: 75,
  state: 'ready' as const,
};

interface TodayCoachRecommendation {
  dailyBriefing: string;
  sections: Record<string, unknown>;
  warnings: unknown[];
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkApiRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Today Coach API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkApiRunning();
    if (!isRunning) {
      throw new Error(
        'Standalone integration API is not running.\n' +
          'Run the suite with: npm run test:integration:emulator'
      );
    }
  });

  it('should return RECOVERY_NOT_SYNCED when no recovery data exists', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('RECOVERY_NOT_SYNCED');
  });

  it('should accept valid recovery in request body', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // Without an OpenAI key: 500 CONFIG_ERROR
    // With key: 200 with recommendation
    if (response.status === 200) {
      const result =
        (await response.json()) as ApiResponse<TodayCoachRecommendation>;
      expect(result.success).toBe(true);
      expect(typeof result.data.dailyBriefing).toBe('string');
    } else {
      expect(response.status).toBe(500);
      const result = (await response.json()) as ApiError;
      expect(result.error.code).toBe('CONFIG_ERROR');
    }
  });

  it('should reject recovery with invalid score (out of range)', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, score: 200 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject recovery with missing required fields', async () => {
    const partialRecovery = { score: 50 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: partialRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject recovery with invalid state enum', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, state: 'invalid-state' };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should accept request with custom user ID header', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'test-integration-user',
      },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // Should get past validation — either 200 or 500 CONFIG_ERROR
    expect([200, 500]).toContain(response.status);

    if (response.status === 200) {
      const result =
        (await response.json()) as ApiResponse<TodayCoachRecommendation>;
      expect(result.success).toBe(true);
    } else {
      const result = (await response.json()) as ApiError;
      expect(result.error.code).toBe('CONFIG_ERROR');
    }
  });

  it('should accept request with timezone offset header', async () => {
    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timezone-offset': '-300',
      },
      body: JSON.stringify({ recovery: VALID_RECOVERY }),
    });

    // Should get past validation — either 200 or 500 CONFIG_ERROR
    expect([200, 500]).toContain(response.status);
  });

  it('should reject recovery with negative sleep hours', async () => {
    const invalidRecovery = { ...VALID_RECOVERY, sleepHours: -1 };

    const response = await fetch(`${TODAY_COACH_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recovery: invalidRecovery }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
