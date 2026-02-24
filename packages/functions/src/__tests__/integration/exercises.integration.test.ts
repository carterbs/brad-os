/**
 * Integration Tests for Exercises API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

// Functions emulator runs at port 5001
// URLs follow pattern: http://127.0.0.1:5001/{project-id}/us-central1/{functionName}
const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const EXERCISES_URL = `${FUNCTIONS_URL}/devExercises`;

interface Exercise {
  id: string;
  name: string;
  weight_increment: number;
  is_custom: boolean;
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

describe('Exercises API (Integration)', () => {
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

  it('should create and retrieve an exercise', async () => {
    // Create exercise
    const createResponse = await fetch(EXERCISES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Integration Test Exercise',
        weight_increment: 5,
      }),
    });

    expect(createResponse.status).toBe(201);
    const createResult = (await createResponse.json()) as ApiResponse<Exercise>;
    expect(createResult.success).toBe(true);
    expect(createResult.data.name).toBe('Integration Test Exercise');
    expect(createResult.data.weight_increment).toBe(5);
    expect(createResult.data.is_custom).toBe(true);
    expect(createResult.data.id).toBeDefined();

    const exerciseId = createResult.data.id;

    // Retrieve exercise
    const getResponse = await fetch(`${EXERCISES_URL}/${exerciseId}`);
    expect(getResponse.status).toBe(200);
    const getResult = (await getResponse.json()) as ApiResponse<Exercise>;
    expect(getResult.success).toBe(true);
    expect(getResult.data.id).toBe(exerciseId);
    expect(getResult.data.name).toBe('Integration Test Exercise');

    // Clean up
    const deleteResponse = await fetch(`${EXERCISES_URL}/${exerciseId}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
  });

  it('should list all exercises', async () => {
    const response = await fetch(EXERCISES_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Exercise[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should update an exercise', async () => {
    // Create
    const createResponse = await fetch(EXERCISES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Update Test', weight_increment: 2.5 }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Exercise>;
    const exerciseId = createResult.data.id;

    // Update
    const updateResponse = await fetch(`${EXERCISES_URL}/${exerciseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Name', weight_increment: 10 }),
    });
    expect(updateResponse.status).toBe(200);

    const updateResult = (await updateResponse.json()) as ApiResponse<Exercise>;
    expect(updateResult.data.name).toBe('Updated Name');
    expect(updateResult.data.weight_increment).toBe(10);

    // Clean up
    await fetch(`${EXERCISES_URL}/${exerciseId}`, { method: 'DELETE' });
  });

  it('should return 404 for non-existent exercise', async () => {
    const response = await fetch(`${EXERCISES_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should validate exercise creation', async () => {
    // Empty name should fail
    const response = await fetch(EXERCISES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', weight_increment: 5 }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
