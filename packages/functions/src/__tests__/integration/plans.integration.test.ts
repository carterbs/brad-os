/**
 * Integration Tests for Plans API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const PLANS_URL = `${FUNCTIONS_URL}/devPlans`;
const EXERCISES_URL = `${FUNCTIONS_URL}/devExercises`;

interface Plan {
  id: string;
  name: string;
  duration_weeks: number;
  created_at: string;
  updated_at: string;
}

interface PlanDay {
  id: string;
  plan_id: string;
  day_of_week: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PlanDayExercise {
  id: string;
  plan_day_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  rest_seconds: number;
  sort_order: number;
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
  return result.data.id;
}

async function deleteTestExercise(id: string): Promise<void> {
  await fetch(`${EXERCISES_URL}/${id}`, { method: 'DELETE' });
}

describe('Plans API (Integration)', () => {
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

  // ============ Plans CRUD ============

  describe('Plans CRUD', () => {
    it('should create and retrieve a plan', async () => {
      // Create plan
      const createResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Integration Test Plan',
          duration_weeks: 6,
        }),
      });

      expect(createResponse.status).toBe(201);
      const createResult = (await createResponse.json()) as ApiResponse<Plan>;
      expect(createResult.success).toBe(true);
      expect(createResult.data.name).toBe('Integration Test Plan');
      expect(createResult.data.duration_weeks).toBe(6);
      expect(createResult.data.id).toBeDefined();

      const planId = createResult.data.id;

      // Retrieve plan
      const getResponse = await fetch(`${PLANS_URL}/${planId}`);
      expect(getResponse.status).toBe(200);
      const getResult = (await getResponse.json()) as ApiResponse<Plan>;
      expect(getResult.success).toBe(true);
      expect(getResult.data.id).toBe(planId);
      expect(getResult.data.name).toBe('Integration Test Plan');

      // Clean up
      const deleteResponse = await fetch(`${PLANS_URL}/${planId}`, {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(204);
    });

    it('should list all plans', async () => {
      const response = await fetch(PLANS_URL);
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<Plan[]>;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should update a plan', async () => {
      // Create
      const createResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Update Test Plan', duration_weeks: 4 }),
      });
      const createResult = (await createResponse.json()) as ApiResponse<Plan>;
      const planId = createResult.data.id;

      // Update
      const updateResponse = await fetch(`${PLANS_URL}/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Plan Name', duration_weeks: 8 }),
      });
      expect(updateResponse.status).toBe(200);

      const updateResult = (await updateResponse.json()) as ApiResponse<Plan>;
      expect(updateResult.data.name).toBe('Updated Plan Name');
      expect(updateResult.data.duration_weeks).toBe(8);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
    });

    it('should return 404 for non-existent plan', async () => {
      const response = await fetch(`${PLANS_URL}/non-existent-id`);
      expect(response.status).toBe(404);

      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('should validate plan creation with empty name', async () => {
      const response = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', duration_weeks: 6 }),
      });

      expect(response.status).toBe(400);
      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============ Plan Days CRUD ============

  describe('Plan Days CRUD', () => {
    it('should create and retrieve a plan day', async () => {
      // Create plan first
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Days Test', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      // Create plan day
      const createResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: 1,
          name: 'Monday Workout',
          sort_order: 0,
        }),
      });

      expect(createResponse.status).toBe(201);
      const createResult = (await createResponse.json()) as ApiResponse<PlanDay>;
      expect(createResult.success).toBe(true);
      expect(createResult.data.name).toBe('Monday Workout');
      expect(createResult.data.day_of_week).toBe(1);
      expect(createResult.data.plan_id).toBe(planId);

      // List plan days
      const listResponse = await fetch(`${PLANS_URL}/${planId}/days`);
      expect(listResponse.status).toBe(200);
      const listResult = (await listResponse.json()) as ApiResponse<PlanDay[]>;
      expect(listResult.success).toBe(true);
      expect(listResult.data.length).toBeGreaterThanOrEqual(1);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
    });

    it('should update a plan day', async () => {
      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Day Update', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      // Create plan day
      const createResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: 2,
          name: 'Tuesday',
          sort_order: 0,
        }),
      });
      const createResult = (await createResponse.json()) as ApiResponse<PlanDay>;
      const dayId = createResult.data.id;

      // Update
      const updateResponse = await fetch(`${PLANS_URL}/${planId}/days/${dayId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Tuesday', day_of_week: 3 }),
      });
      expect(updateResponse.status).toBe(200);
      const updateResult = (await updateResponse.json()) as ApiResponse<PlanDay>;
      expect(updateResult.data.name).toBe('Updated Tuesday');
      expect(updateResult.data.day_of_week).toBe(3);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
    });

    it('should delete a plan day', async () => {
      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Day Delete', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      // Create plan day
      const createResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: 4,
          name: 'Thursday',
          sort_order: 0,
        }),
      });
      const createResult = (await createResponse.json()) as ApiResponse<PlanDay>;
      const dayId = createResult.data.id;

      // Delete
      const deleteResponse = await fetch(`${PLANS_URL}/${planId}/days/${dayId}`, {
        method: 'DELETE',
      });
      expect(deleteResponse.status).toBe(204);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
    });

    it('should return 404 for plan day of non-existent plan', async () => {
      const response = await fetch(`${PLANS_URL}/non-existent-id/days`);
      expect(response.status).toBe(404);

      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  // ============ Plan Day Exercises CRUD ============

  describe('Plan Day Exercises CRUD', () => {
    it('should create and retrieve plan day exercises', async () => {
      // Create exercise
      const exerciseId = await createTestExercise();

      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Exercise Test', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

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

      // Create plan day exercise
      const createResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercise_id: exerciseId,
            sets: 3,
            reps: 10,
            weight: 50,
            rest_seconds: 90,
            sort_order: 0,
          }),
        }
      );

      expect(createResponse.status).toBe(201);
      const createResult = (await createResponse.json()) as ApiResponse<PlanDayExercise>;
      expect(createResult.success).toBe(true);
      expect(createResult.data.sets).toBe(3);
      expect(createResult.data.reps).toBe(10);
      expect(createResult.data.weight).toBe(50);

      // List plan day exercises
      const listResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises`
      );
      expect(listResponse.status).toBe(200);
      const listResult = (await listResponse.json()) as ApiResponse<PlanDayExercise[]>;
      expect(listResult.success).toBe(true);
      expect(listResult.data.length).toBeGreaterThanOrEqual(1);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
      await deleteTestExercise(exerciseId);
    });

    it('should update a plan day exercise', async () => {
      // Create exercise
      const exerciseId = await createTestExercise();

      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Exercise Update', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      // Create plan day
      const dayResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: 2,
          name: 'Tuesday',
          sort_order: 0,
        }),
      });
      const dayResult = (await dayResponse.json()) as ApiResponse<PlanDay>;
      const dayId = dayResult.data.id;

      // Create plan day exercise
      const createResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercise_id: exerciseId,
            sets: 2,
            reps: 8,
            weight: 30,
            rest_seconds: 60,
            sort_order: 0,
          }),
        }
      );
      const createResult = (await createResponse.json()) as ApiResponse<PlanDayExercise>;
      const exerciseConfigId = createResult.data.id;

      // Update
      const updateResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises/${exerciseConfigId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sets: 4, reps: 12, weight: 60 }),
        }
      );
      expect(updateResponse.status).toBe(200);
      const updateResult = (await updateResponse.json()) as ApiResponse<PlanDayExercise>;
      expect(updateResult.data.sets).toBe(4);
      expect(updateResult.data.reps).toBe(12);
      expect(updateResult.data.weight).toBe(60);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
      await deleteTestExercise(exerciseId);
    });

    it('should delete a plan day exercise', async () => {
      // Create exercise
      const exerciseId = await createTestExercise();

      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for Exercise Delete', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      // Create plan day
      const dayResponse = await fetch(`${PLANS_URL}/${planId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: 3,
          name: 'Wednesday',
          sort_order: 0,
        }),
      });
      const dayResult = (await dayResponse.json()) as ApiResponse<PlanDay>;
      const dayId = dayResult.data.id;

      // Create plan day exercise
      const createResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercise_id: exerciseId,
            sets: 3,
            reps: 10,
            weight: 40,
            rest_seconds: 60,
            sort_order: 0,
          }),
        }
      );
      const createResult = (await createResponse.json()) as ApiResponse<PlanDayExercise>;
      const exerciseConfigId = createResult.data.id;

      // Delete
      const deleteResponse = await fetch(
        `${PLANS_URL}/${planId}/days/${dayId}/exercises/${exerciseConfigId}`,
        { method: 'DELETE' }
      );
      expect(deleteResponse.status).toBe(204);

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
      await deleteTestExercise(exerciseId);
    });

    it('should return 404 for exercises of non-existent plan day', async () => {
      // Create plan
      const planResponse = await fetch(PLANS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Plan for 404 Test', duration_weeks: 6 }),
      });
      const planResult = (await planResponse.json()) as ApiResponse<Plan>;
      const planId = planResult.data.id;

      const response = await fetch(
        `${PLANS_URL}/${planId}/days/non-existent-id/exercises`
      );
      expect(response.status).toBe(404);

      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_FOUND');

      // Clean up
      await fetch(`${PLANS_URL}/${planId}`, { method: 'DELETE' });
    });
  });
});
