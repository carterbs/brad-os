/**
 * Integration Tests for Workout Sets API
 *
 * These tests run against the standalone API backed by the Firestore emulator.
 * Run with: npm run test:integration:emulator
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { type ApiResponse } from '../utils/index.js';
import { HEALTH_URL, integrationApiUrl } from './api-config.js';

const WORKOUT_SETS_URL = integrationApiUrl('workout-sets');
const WORKOUTS_URL = integrationApiUrl('workouts');
const MESOCYCLES_URL = integrationApiUrl('mesocycles');
const PLANS_URL = integrationApiUrl('plans');
const EXERCISES_URL = integrationApiUrl('exercises');

interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  target_reps: number;
  target_weight: number;
  actual_reps: number | null;
  actual_weight: number | null;
  status: 'pending' | 'completed' | 'skipped';
  created_at: string;
}

interface Workout {
  id: string;
  mesocycle_id: string;
  status: string;
}

interface Mesocycle {
  id: string;
  plan_id: string;
}

interface Plan {
  id: string;
  name: string;
}

interface PlanDay {
  id: string;
  plan_id: string;
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

// Track created resources for cleanup
const createdPlans: string[] = [];
const createdExercises: string[] = [];
const createdMesocycles: string[] = [];

async function checkApiRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function getTodayDate(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  if (dateStr === undefined || dateStr === '') {
    throw new Error('Failed to generate date string');
  }
  return dateStr;
}

async function createTestExercise(): Promise<string> {
  const response = await fetch(EXERCISES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Test Exercise ${Date.now()}`,
      weight_increment: 5,
    }),
  });
  const result = (await response.json()) as ApiResponse<{ id: string }>;
  createdExercises.push(result.data.id);
  return result.data.id;
}

async function createTestPlanWithDays(): Promise<{
  planId: string;
  dayId: string;
}> {
  const exerciseId = await createTestExercise();

  const planResponse = await fetch(PLANS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Test Plan ${Date.now()}`,
      duration_weeks: 6,
    }),
  });
  const planResult = (await planResponse.json()) as ApiResponse<Plan>;
  const planId = planResult.data.id;
  createdPlans.push(planId);

  const today = new Date().getDay();
  const dayResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day_of_week: today,
      name: 'Today',
      sort_order: 0,
    }),
  });
  const dayResult = (await dayResponse.json()) as ApiResponse<PlanDay>;
  const dayId = dayResult.data.id;

  await fetch(`${PLANS_URL}/${planId}/days/${dayId}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exercise_id: exerciseId,
      sets: 3,
      reps: 10,
      weight: 50,
      rest_seconds: 60,
      sort_order: 0,
    }),
  });

  return { planId, dayId };
}

async function createTestMesocycleWithWorkout(): Promise<{
  workoutId: string;
  setId: string;
}> {
  const { planId } = await createTestPlanWithDays();
  const startDate = getTodayDate();

  const mesocycleResponse = await fetch(MESOCYCLES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      start_date: startDate,
    }),
  });
  const mesocycleResult =
    (await mesocycleResponse.json()) as ApiResponse<Mesocycle>;
  const mesocycleId = mesocycleResult.data.id;
  createdMesocycles.push(mesocycleId);

  const startResponse = await fetch(`${MESOCYCLES_URL}/${mesocycleId}/start`, {
    method: 'PUT',
  });
  if (!startResponse.ok) {
    throw new Error(`Failed to start mesocycle: ${startResponse.status}`);
  }

  // List workouts to get one
  const workoutsResponse = await fetch(WORKOUTS_URL);
  const workoutsResult = (await workoutsResponse.json()) as ApiResponse<
    Workout[]
  >;

  const firstWorkout = workoutsResult.data.find(
    (workout) => workout.mesocycle_id === mesocycleId
  );
  if (!firstWorkout) {
    throw new Error('No workouts created from mesocycle');
  }

  const workoutId = firstWorkout.id;

  // Get sets for this workout
  const setsResponse = await fetch(`${WORKOUTS_URL}/${workoutId}/sets`);
  const setsResult = (await setsResponse.json()) as ApiResponse<WorkoutSet[]>;

  const firstSet = setsResult.data[0];
  if (!firstSet) {
    throw new Error('No workout sets created');
  }

  return { workoutId, setId: firstSet.id };
}

async function cleanup(): Promise<void> {
  for (const id of createdMesocycles) {
    try {
      await fetch(`${MESOCYCLES_URL}/${id}/cancel`, { method: 'PUT' });
    } catch {
      // Ignore errors
    }
  }
  createdMesocycles.length = 0;

  for (const id of createdPlans) {
    try {
      await fetch(`${PLANS_URL}/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore errors
    }
  }
  createdPlans.length = 0;

  for (const id of createdExercises) {
    try {
      await fetch(`${EXERCISES_URL}/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore errors
    }
  }
  createdExercises.length = 0;
}

describe('Workout Sets API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkApiRunning();
    if (!isRunning) {
      throw new Error(
        'Standalone integration API is not running.\n' +
          'Run the suite with: npm run test:integration:emulator'
      );
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should log a set with actual values', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: 10,
        actual_weight: 50,
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<WorkoutSet>;
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('completed');
    expect(result.data.actual_reps).toBe(10);
    expect(result.data.actual_weight).toBe(50);
  });

  it('should skip a set', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/skip`, {
      method: 'PUT',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<WorkoutSet>;
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('skipped');
  });

  it('should unlog a completed set', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    // Log the set first
    await fetch(`${WORKOUT_SETS_URL}/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: 10,
        actual_weight: 50,
      }),
    });

    // Unlog
    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/unlog`, {
      method: 'PUT',
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ApiResponse<WorkoutSet>;
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('pending');
    expect(result.data.actual_reps).toBeNull();
    expect(result.data.actual_weight).toBeNull();
  });

  it('should return 404 for non-existent set when logging', async () => {
    const response = await fetch(`${WORKOUT_SETS_URL}/non-existent-id/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: 10,
        actual_weight: 50,
      }),
    });

    expect(response.status).toBe(404);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 for non-existent set when skipping', async () => {
    const response = await fetch(`${WORKOUT_SETS_URL}/non-existent-id/skip`, {
      method: 'PUT',
    });

    expect(response.status).toBe(404);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 for non-existent set when unlogging', async () => {
    const response = await fetch(`${WORKOUT_SETS_URL}/non-existent-id/unlog`, {
      method: 'PUT',
    });

    expect(response.status).toBe(404);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should validate log input - negative reps', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: -5,
        actual_weight: 50,
      }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate log input - negative weight', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: 10,
        actual_weight: -20,
      }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate log input - missing fields', async () => {
    const { workoutId, setId } = await createTestMesocycleWithWorkout();

    // Start the workout first
    await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

    const response = await fetch(`${WORKOUT_SETS_URL}/${setId}/log`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_reps: 10,
        // missing actual_weight
      }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
