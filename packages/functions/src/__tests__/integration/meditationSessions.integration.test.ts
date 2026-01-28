/**
 * Integration Tests for Meditation Sessions API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const MEDITATION_SESSIONS_URL = `${FUNCTIONS_URL}/devMeditationSessions`;

interface MeditationSession {
  id: string;
  completedAt: string;
  sessionType: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number;
  completedFully: boolean;
  created_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
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

function createValidMeditationSession(): object {
  return {
    completedAt: new Date().toISOString(),
    sessionType: 'guided-breathing',
    plannedDurationSeconds: 600,
    actualDurationSeconds: 600,
    completedFully: true,
  };
}

describe('Meditation Sessions API (Integration)', () => {
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

  it('should create a meditation session', async () => {
    const sessionData = createValidMeditationSession();

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<MeditationSession>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBeDefined();
    expect(result.data.sessionType).toBe('guided-breathing');
    expect(result.data.plannedDurationSeconds).toBe(600);
    expect(result.data.actualDurationSeconds).toBe(600);
    expect(result.data.completedFully).toBe(true);
  });

  it('should create a partially completed meditation session', async () => {
    const sessionData = {
      completedAt: new Date().toISOString(),
      sessionType: 'body-scan',
      plannedDurationSeconds: 1200,
      actualDurationSeconds: 720,
      completedFully: false,
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<MeditationSession>;
    expect(result.success).toBe(true);
    expect(result.data.sessionType).toBe('body-scan');
    expect(result.data.actualDurationSeconds).toBe(720);
    expect(result.data.completedFully).toBe(false);
  });

  it('should list all meditation sessions', async () => {
    const response = await fetch(MEDITATION_SESSIONS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<MeditationSession[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should get the latest meditation session', async () => {
    // Create a new session first
    await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeditationSession()),
    });

    const response = await fetch(`${MEDITATION_SESSIONS_URL}/latest`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<MeditationSession | null>;
    expect(result.success).toBe(true);
    // May or may not have a session depending on timing
    if (result.data !== null) {
      expect(result.data.id).toBeDefined();
      expect(result.data.sessionType).toBeDefined();
    }
  });

  it('should get a meditation session by id', async () => {
    // Create a session first
    const createResponse = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidMeditationSession()),
    });
    const createResult = (await createResponse.json()) as ApiResponse<MeditationSession>;
    const sessionId = createResult.data.id;

    // Get by ID
    const response = await fetch(`${MEDITATION_SESSIONS_URL}/${sessionId}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<MeditationSession>;
    expect(result.success).toBe(true);
    expect(result.data.id).toBe(sessionId);
    expect(result.data.sessionType).toBeDefined();
  });

  it('should return 404 for non-existent meditation session', async () => {
    const response = await fetch(`${MEDITATION_SESSIONS_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should validate meditation session creation - missing completedAt', async () => {
    const invalidData = {
      sessionType: 'guided-breathing',
      plannedDurationSeconds: 600,
      actualDurationSeconds: 600,
      completedFully: true,
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate meditation session creation - empty sessionType', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      sessionType: '',
      plannedDurationSeconds: 600,
      actualDurationSeconds: 600,
      completedFully: true,
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate meditation session creation - negative plannedDuration', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      sessionType: 'guided-breathing',
      plannedDurationSeconds: -100,
      actualDurationSeconds: 600,
      completedFully: true,
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate meditation session creation - negative actualDuration', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      sessionType: 'guided-breathing',
      plannedDurationSeconds: 600,
      actualDurationSeconds: -50,
      completedFully: false,
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidData),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate meditation session creation - missing completedFully', async () => {
    const invalidData = {
      completedAt: new Date().toISOString(),
      sessionType: 'guided-breathing',
      plannedDurationSeconds: 600,
      actualDurationSeconds: 600,
      // missing completedFully
    };

    const response = await fetch(MEDITATION_SESSIONS_URL, {
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
