/**
 * Integration Tests for Stretches API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const STRETCHES_URL = `${FUNCTIONS_URL}/devStretches`;

interface StretchDefinition {
  id: string;
  name: string;
  description: string;
  bilateral: boolean;
  image?: string;
}

interface StretchRegion {
  id: string;
  region: string;
  displayName: string;
  iconName: string;
  stretches: StretchDefinition[];
  created_at: string;
  updated_at: string;
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

function createValidStretchRegion(overrides: Partial<StretchRegion> = {}): Record<string, unknown> {
  return {
    region: 'back',
    displayName: 'Back',
    iconName: 'figure.flexibility',
    stretches: [
      {
        id: 'back-childs-pose',
        name: "Child's Pose",
        description: 'Kneel on the floor and sit back on your heels.',
        bilateral: false,
      },
    ],
    ...overrides,
  };
}

describe('Stretches API (Integration)', () => {
  let createdStretchId: string | null = null;

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

  afterEach(async () => {
    if (createdStretchId) {
      try {
        await fetch(`${STRETCHES_URL}/${createdStretchId}`, { method: 'DELETE' });
      } catch {
        // ignore cleanup errors
      }
      createdStretchId = null;
    }
  });

  it('should create and retrieve a stretch region', async () => {
    const createResponse = await fetch(STRETCHES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchRegion()),
    });

    expect(createResponse.status).toBe(201);
    const createResult = (await createResponse.json()) as ApiResponse<StretchRegion>;
    expect(createResult.success).toBe(true);
    expect(createResult.data.region).toBe('back');
    expect(createResult.data.stretches).toHaveLength(1);
    createdStretchId = createResult.data.id;

    const getResponse = await fetch(`${STRETCHES_URL}/${createdStretchId}`);
    expect(getResponse.status).toBe(200);
    const getResult = (await getResponse.json()) as ApiResponse<StretchRegion>;
    expect(getResult.success).toBe(true);
    expect(getResult.data.id).toBe(createdStretchId);
  });

  it('should list stretch regions', async () => {
    const createResponse = await fetch(STRETCHES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchRegion({ region: 'quads', displayName: 'Quads' })),
    });
    const createResult = (await createResponse.json()) as ApiResponse<StretchRegion>;
    createdStretchId = createResult.data.id;

    const response = await fetch(STRETCHES_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<StretchRegion[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it('should update a stretch region', async () => {
    const createResponse = await fetch(STRETCHES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchRegion({ region: 'hamstrings', displayName: 'Hamstrings' })),
    });
    const createResult = (await createResponse.json()) as ApiResponse<StretchRegion>;
    const regionId = createResult.data.id;
    createdStretchId = regionId;

    const updateResponse = await fetch(`${STRETCHES_URL}/${regionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Rear Chain' }),
    });

    expect(updateResponse.status).toBe(200);
    const updateResult = (await updateResponse.json()) as ApiResponse<StretchRegion>;
    expect(updateResult.success).toBe(true);
    expect(updateResult.data.displayName).toBe('Rear Chain');
    expect(updateResult.data.region).toBe('hamstrings');
  });

  it('should delete a stretch region', async () => {
    const createResponse = await fetch(STRETCHES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidStretchRegion({ region: 'shoulders', displayName: 'Shoulders' })),
    });
    const createResult = (await createResponse.json()) as ApiResponse<StretchRegion>;
    const regionId = createResult.data.id;

    const response = await fetch(`${STRETCHES_URL}/${regionId}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<{ deleted: boolean }>;
    expect(result.success).toBe(true);
    expect(result.data.deleted).toBe(true);
  });

  it('should validate stretch creation payload', async () => {
    const response = await fetch(STRETCHES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: 'back',
        displayName: '',
        iconName: 'figure.flexibility',
        stretches: [],
      }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 404 for missing stretch region', async () => {
    const response = await fetch(`${STRETCHES_URL}/non-existent`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });
});
