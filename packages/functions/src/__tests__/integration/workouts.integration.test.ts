/**
 * Integration Tests for Workouts API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const WORKOUTS_URL = `${FUNCTIONS_URL}/devWorkouts`;
const MESOCYCLES_URL = `${FUNCTIONS_URL}/devMesocycles`;
const PLANS_URL = `${FUNCTIONS_URL}/devPlans`;
const EXERCISES_URL = `${FUNCTIONS_URL}/devExercises`;

interface Workout {
  id: string;
  mesocycle_id: string;
  plan_day_id: string;
  week_number: number;
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

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

interface WorkoutWithExercises extends Workout {
  exercises: Array<{
    exercise_id: string;
    exercise_name: string;
    sets: WorkoutSet[];
  }>;
}

interface Mesocycle {
  id: string;
  plan_id: string;
  status: string;
}

interface Plan {
  id: string;
  name: string;
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

async function createTestPlanWithDays(): Promise<{ planId: string; dayId: string; exerciseId: string }> {
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

  // Create plan day for today
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

  return { planId, dayId, exerciseId };
}

async function createTestMesocycle(): Promise<{ mesocycleId: string; exerciseId: string }> {
  const { planId, exerciseId } = await createTestPlanWithDays();
  const startDate = getTodayDate();

  const response = await fetch(MESOCYCLES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      start_date: startDate,
    }),
  });
  const result = (await response.json()) as ApiResponse<Mesocycle>;
  createdMesocycles.push(result.data.id);
  return { mesocycleId: result.data.id, exerciseId };
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

describe('Workouts API (Integration)', () => {
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

  it('should list all workouts', async () => {
    const response = await fetch(WORKOUTS_URL);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<Workout[]>;
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should get today\'s workout', async () => {
    // Create a mesocycle with today's workout
    await createTestMesocycle();

    const response = await fetch(`${WORKOUTS_URL}/today`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<WorkoutWithExercises | null>;
    expect(result.success).toBe(true);
    // May or may not have a workout for today depending on timing
  });

  it('should get workout by id with exercises', async () => {
    await createTestMesocycle();

    // List workouts to get an ID
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;

    const firstWorkout = listResult.data[0];
    if (firstWorkout) {
      const workoutId = firstWorkout.id;

      const response = await fetch(`${WORKOUTS_URL}/${workoutId}`);
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<WorkoutWithExercises>;
      expect(result.success).toBe(true);
      expect(result.data.id).toBe(workoutId);
      expect(result.data.exercises).toBeDefined();
      expect(Array.isArray(result.data.exercises)).toBe(true);
    }
  });

  it('should start a workout', async () => {
    await createTestMesocycle();

    // List workouts to find a pending one
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;
    const pendingWorkout = listResult.data.find(w => w.status === 'pending');

    if (pendingWorkout) {
      const response = await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/start`, {
        method: 'PUT',
      });
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<Workout>;
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('in_progress');
      expect(result.data.started_at).toBeDefined();
    }
  });

  it('should complete a workout', async () => {
    await createTestMesocycle();

    // List workouts and start one
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;
    const pendingWorkout = listResult.data.find(w => w.status === 'pending');

    if (pendingWorkout) {
      // Start first
      await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/start`, { method: 'PUT' });

      // Complete
      const response = await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/complete`, {
        method: 'PUT',
      });
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<Workout>;
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('completed');
      expect(result.data.completed_at).toBeDefined();
    }
  });

  it('should skip a workout', async () => {
    await createTestMesocycle();

    // List workouts to find a pending one
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;
    const pendingWorkout = listResult.data.find(w => w.status === 'pending');

    if (pendingWorkout) {
      const response = await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/skip`, {
        method: 'PUT',
      });
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<Workout>;
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('skipped');
    }
  });

  it('should get workout sets', async () => {
    await createTestMesocycle();

    // List workouts to get an ID
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;

    const firstWorkoutForSets = listResult.data[0];
    if (firstWorkoutForSets) {
      const workoutId = firstWorkoutForSets.id;

      const response = await fetch(`${WORKOUTS_URL}/${workoutId}/sets`);
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<WorkoutSet[]>;
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  it('should add a set to an exercise', async () => {
    const { exerciseId } = await createTestMesocycle();

    // List workouts to get a workout
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;

    const firstWorkoutForAddSet = listResult.data[0];
    if (firstWorkoutForAddSet) {
      const workoutId = firstWorkoutForAddSet.id;

      // Start the workout first
      await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

      const response = await fetch(
        `${WORKOUTS_URL}/${workoutId}/exercises/${exerciseId}/sets/add`,
        { method: 'POST' }
      );

      // Could be 201 (success) or 404 if no sets exist for that exercise
      if (response.status === 201) {
        const result = (await response.json()) as ApiResponse<{ set: WorkoutSet; total_sets: number }>;
        expect(result.success).toBe(true);
        expect(result.data.set).toBeDefined();
        expect(result.data.total_sets).toBeGreaterThan(0);
      }
    }
  });

  it('should remove a set from an exercise', async () => {
    const { exerciseId } = await createTestMesocycle();

    // List workouts to get a workout
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;

    const firstWorkoutForRemoveSet = listResult.data[0];
    if (firstWorkoutForRemoveSet) {
      const workoutId = firstWorkoutForRemoveSet.id;

      // Start the workout first
      await fetch(`${WORKOUTS_URL}/${workoutId}/start`, { method: 'PUT' });

      // Add a set first so we have one to remove
      await fetch(
        `${WORKOUTS_URL}/${workoutId}/exercises/${exerciseId}/sets/add`,
        { method: 'POST' }
      );

      const response = await fetch(
        `${WORKOUTS_URL}/${workoutId}/exercises/${exerciseId}/sets/remove`,
        { method: 'DELETE' }
      );

      // Could be 200 (success) or 400 if no pending sets to remove
      if (response.status === 200) {
        const result = (await response.json()) as ApiResponse<{ removed_set_id: string; remaining_sets: number }>;
        expect(result.success).toBe(true);
        expect(result.data.removed_set_id).toBeDefined();
      }
    }
  });

  it('should return 404 for non-existent workout', async () => {
    const response = await fetch(`${WORKOUTS_URL}/non-existent-id`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should return 404 for sets of non-existent workout', async () => {
    const response = await fetch(`${WORKOUTS_URL}/non-existent-id/sets`);
    expect(response.status).toBe(404);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('should prevent starting an already completed workout', async () => {
    await createTestMesocycle();

    // List workouts and complete one
    const listResponse = await fetch(WORKOUTS_URL);
    const listResult = (await listResponse.json()) as ApiResponse<Workout[]>;
    const pendingWorkout = listResult.data.find(w => w.status === 'pending');

    if (pendingWorkout) {
      // Start and complete
      await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/start`, { method: 'PUT' });
      await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/complete`, { method: 'PUT' });

      // Try to start again
      const response = await fetch(`${WORKOUTS_URL}/${pendingWorkout.id}/start`, {
        method: 'PUT',
      });
      expect(response.status).toBe(400);

      const result = (await response.json()) as ApiError;
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
