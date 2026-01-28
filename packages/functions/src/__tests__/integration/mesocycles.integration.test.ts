/**
 * Integration Tests for Mesocycles API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const MESOCYCLES_URL = `${FUNCTIONS_URL}/devMesocycles`;
const PLANS_URL = `${FUNCTIONS_URL}/devPlans`;
const EXERCISES_URL = `${FUNCTIONS_URL}/devExercises`;

interface Mesocycle {
  id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  current_week: number;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

interface MesocycleWithDetails extends Mesocycle {
  plan_name: string;
  weeks: Array<{
    week_number: number;
    workouts: Array<{
      id: string;
      status: string;
      scheduled_date: string;
    }>;
  }>;
}

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
}

interface PlanDay {
  id: string;
  plan_id: string;
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

// Track created resources for cleanup
const createdPlans: string[] = [];
const createdExercises: string[] = [];
const createdMesocycles: string[] = [];

async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function getTestStartDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7); // Start a week from now
  const dateStr = date.toISOString().split('T')[0];
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

async function createTestPlanWithDays(): Promise<{ planId: string; dayId: string }> {
  // Create exercise first
  const exerciseId = await createTestExercise();

  // Create plan
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

  // Create plan day
  const dayResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day_of_week: 1,
      name: 'Monday',
      sort_order: 0,
    }),
  });
  const dayResult = (await dayResponse.json()) as ApiResponse<PlanDay>;
  const dayId = dayResult.data.id;

  // Add exercise to day
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

async function cleanup(): Promise<void> {
  // Cancel any active mesocycles first
  for (const id of createdMesocycles) {
    try {
      await fetch(`${MESOCYCLES_URL}/${id}/cancel`, { method: 'PUT' });
    } catch {
      // Ignore errors during cleanup
    }
  }
  createdMesocycles.length = 0;

  // Delete plans
  for (const id of createdPlans) {
    try {
      await fetch(`${PLANS_URL}/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore errors during cleanup
    }
  }
  createdPlans.length = 0;

  // Delete exercises
  for (const id of createdExercises) {
    try {
      await fetch(`${EXERCISES_URL}/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore errors during cleanup
    }
  }
  createdExercises.length = 0;
}

describe('Mesocycles API (Integration)', () => {
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
    await cleanup();
  });

  it('should list all mesocycles', async () => {
    const response = await fetch(MESOCYCLES_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Mesocycle[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should create a mesocycle', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    const response = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as ApiResponse<Mesocycle>;
    expect(result.success).toBe(true);
    expect(result.data.plan_id).toBe(planId);
    expect(result.data.start_date).toBe(startDate);
    expect(result.data.status).toBe('active');
    expect(result.data.current_week).toBe(1);

    createdMesocycles.push(result.data.id);
  });

  it('should get mesocycle by id with details', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    // Create mesocycle
    const createResponse = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Mesocycle>;
    const mesocycleId = createResult.data.id;
    createdMesocycles.push(mesocycleId);

    // Get by ID
    const getResponse = await fetch(`${MESOCYCLES_URL}/${mesocycleId}`);
    expect(getResponse.status).toBe(200);

    const getResult = (await getResponse.json()) as ApiResponse<MesocycleWithDetails>;
    expect(getResult.success).toBe(true);
    expect(getResult.data.id).toBe(mesocycleId);
    expect(getResult.data.plan_name).toBeDefined();
    expect(getResult.data.weeks).toBeDefined();
    expect(Array.isArray(getResult.data.weeks)).toBe(true);
  });

  it('should get active mesocycle', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    // Create active mesocycle
    const createResponse = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Mesocycle>;
    createdMesocycles.push(createResult.data.id);

    // Get active
    const activeResponse = await fetch(`${MESOCYCLES_URL}/active`);
    expect(activeResponse.status).toBe(200);

    const activeResult = (await activeResponse.json()) as ApiResponse<MesocycleWithDetails | null>;
    expect(activeResult.success).toBe(true);
    // Should have an active mesocycle (may be the one we just created or a pre-existing one)
    if (activeResult.data !== null) {
      expect(activeResult.data.status).toBe('active');
    }
  });

  it('should complete a mesocycle', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    // Create mesocycle
    const createResponse = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Mesocycle>;
    const mesocycleId = createResult.data.id;
    createdMesocycles.push(mesocycleId);

    // Complete
    const completeResponse = await fetch(`${MESOCYCLES_URL}/${mesocycleId}/complete`, {
      method: 'PUT',
    });
    expect(completeResponse.status).toBe(200);

    const completeResult = (await completeResponse.json()) as ApiResponse<Mesocycle>;
    expect(completeResult.success).toBe(true);
    expect(completeResult.data.status).toBe('completed');
  });

  it('should cancel a mesocycle', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    // Create mesocycle
    const createResponse = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Mesocycle>;
    const mesocycleId = createResult.data.id;
    createdMesocycles.push(mesocycleId);

    // Cancel
    const cancelResponse = await fetch(`${MESOCYCLES_URL}/${mesocycleId}/cancel`, {
      method: 'PUT',
    });
    expect(cancelResponse.status).toBe(200);

    const cancelResult = (await cancelResponse.json()) as ApiResponse<Mesocycle>;
    expect(cancelResult.success).toBe(true);
    expect(cancelResult.data.status).toBe('cancelled');
  });

  it('should return 404 for non-existent mesocycle', async () => {
    const response = await fetch(`${MESOCYCLES_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 when creating mesocycle with non-existent plan', async () => {
    const response = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: 'non-existent-plan-id',
        start_date: getTestStartDate(),
      }),
    });

    expect(response.status).toBe(404);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should prevent completing a non-active mesocycle', async () => {
    const { planId } = await createTestPlanWithDays();
    const startDate = getTestStartDate();

    // Create and cancel mesocycle
    const createResponse = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: startDate,
      }),
    });
    const createResult = (await createResponse.json()) as ApiResponse<Mesocycle>;
    const mesocycleId = createResult.data.id;
    createdMesocycles.push(mesocycleId);

    // Cancel first
    await fetch(`${MESOCYCLES_URL}/${mesocycleId}/cancel`, { method: 'PUT' });

    // Try to complete cancelled mesocycle
    const completeResponse = await fetch(`${MESOCYCLES_URL}/${mesocycleId}/complete`, {
      method: 'PUT',
    });
    expect(completeResponse.status).toBe(400);

    const result = (await completeResponse.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate mesocycle creation with invalid date format', async () => {
    const { planId } = await createTestPlanWithDays();

    const response = await fetch(MESOCYCLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan_id: planId,
        start_date: 'invalid-date',
      }),
    });

    expect(response.status).toBe(400);
    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});
