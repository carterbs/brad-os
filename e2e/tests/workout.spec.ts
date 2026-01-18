import { test, expect } from '../helpers/fixtures.js';

test.describe('Workout Tracking', () => {
  // Run serially to avoid database conflicts between parallel tests
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ api }) => {
    // Reset database before each test
    await api.resetDatabase();
  });

  test.describe('with active mesocycle scheduled for today', () => {
    test.beforeEach(async ({ api }) => {
      // Set up a workout scenario for today
      await api.setupWorkoutScenario('Bench Press');
    });

    test('should display today\'s workout', async ({ todayPage }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();

      const hasWorkout = await todayPage.hasWorkoutScheduled();
      expect(hasWorkout).toBe(true);
    });

    test('should start a workout', async ({ todayPage }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();

      await todayPage.startWorkout();

      const status = await todayPage.getWorkoutStatus();
      expect(status).toContain('In Progress');
    });

    test('should log a set with custom values', async ({ todayPage, api }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      // Get the workout to find set IDs
      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      expect(firstExercise).toBeDefined();
      const firstSet = firstExercise?.sets[0];
      expect(firstSet).toBeDefined();
      if (firstSet === undefined) throw new Error('First set should be defined');

      // Log the set with custom values
      await todayPage.logSet(firstSet.id, 10, 145);

      // Verify the set is logged
      const isLogged = await todayPage.isSetLogged(firstSet.id);
      expect(isLogged).toBe(true);

      // Verify the logged values
      const values = await todayPage.getLoggedValues(firstSet.id);
      expect(values).toEqual({ reps: 10, weight: 145 });
    });

    test('should log a set using target values', async ({ todayPage, api }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      // Get the workout to find set IDs and target values
      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      expect(firstExercise).toBeDefined();
      const firstSet = firstExercise?.sets[0];
      expect(firstSet).toBeDefined();
      if (firstSet === undefined) throw new Error('First set should be defined');

      // Log the set with target values (just click save)
      await todayPage.logSetWithTargets(firstSet.id);

      // Verify the set is logged with target values
      const values = await todayPage.getLoggedValues(firstSet.id);
      expect(values).toEqual({
        reps: firstSet.target_reps,
        weight: firstSet.target_weight,
      });
    });

    test('should show rest timer after logging a set', async ({
      todayPage,
      api,
    }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      expect(firstExercise).toBeDefined();
      const firstSet = firstExercise?.sets[0];
      expect(firstSet).toBeDefined();
      if (firstSet === undefined) throw new Error('First set should be defined');

      await todayPage.logSetWithTargets(firstSet.id);

      // Check that rest timer is visible
      const timerVisible = await todayPage.isRestTimerVisible();
      expect(timerVisible).toBe(true);
    });

    test('should skip a set', async ({ todayPage, api }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      expect(firstExercise).toBeDefined();
      const firstSet = firstExercise?.sets[0];
      expect(firstSet).toBeDefined();
      if (firstSet === undefined) throw new Error('First set should be defined');

      await todayPage.skipSet(firstSet.id);

      // Verify the set is skipped
      const isSkipped = await todayPage.isSetSkipped(firstSet.id);
      expect(isSkipped).toBe(true);
    });

    test('should complete a workout with all sets logged', async ({
      todayPage,
      api,
    }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      // Log all sets
      for (const exercise of workout.exercises) {
        for (const set of exercise.sets) {
          await todayPage.logSetWithTargets(set.id);
          // Dismiss rest timer if visible to continue
          const timerVisible = await todayPage.isRestTimerVisible();
          if (timerVisible) {
            await todayPage.dismissRestTimer();
          }
        }
      }

      // Complete the workout
      await todayPage.completeWorkout();

      // After completion, the workout disappears and shows "No workout scheduled"
      await expect(todayPage.noWorkoutMessage).toBeVisible();
    });

    test('should complete a workout with some sets skipped', async ({
      todayPage,
      api,
    }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      const sets = firstExercise?.sets ?? [];

      // Log first set, skip the rest
      const firstSetInSets = sets[0];
      if (firstSetInSets !== undefined) {
        await todayPage.logSetWithTargets(firstSetInSets.id);
        const timerVisible = await todayPage.isRestTimerVisible();
        if (timerVisible) {
          await todayPage.dismissRestTimer();
        }
      }

      // Skip remaining sets
      for (let i = 1; i < sets.length; i++) {
        const set = sets[i];
        if (set !== undefined) {
          await todayPage.skipSet(set.id);
        }
      }

      // Complete the workout
      await todayPage.completeWorkout();

      // After completion, the workout disappears and shows "No workout scheduled"
      await expect(todayPage.noWorkoutMessage).toBeVisible();
    });

    test('should skip the entire workout', async ({ todayPage }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      await todayPage.skipWorkout();

      // After skipping, the workout disappears and shows "No workout scheduled"
      await expect(todayPage.noWorkoutMessage).toBeVisible();
    });

    test('workout state should persist on page reload', async ({
      todayPage,
      page,
      api,
    }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();
      await todayPage.startWorkout();

      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout === null) throw new Error('Workout should not be null');

      const firstExercise = workout.exercises[0];
      expect(firstExercise).toBeDefined();
      const firstSet = firstExercise?.sets[0];
      expect(firstSet).toBeDefined();
      if (firstSet === undefined) throw new Error('First set should be defined');

      // Log a set
      await todayPage.logSetWithTargets(firstSet.id);

      // Reload the page
      await page.reload();
      await todayPage.waitForLoad();

      // Verify the set is still logged
      const isLogged = await todayPage.isSetLogged(firstSet.id);
      expect(isLogged).toBe(true);

      // Verify workout is still in progress
      const status = await todayPage.getWorkoutStatus();
      expect(status).toContain('In Progress');
    });
  });

  test.describe('without scheduled workout', () => {
    test('should show no workout message', async ({ todayPage }) => {
      await todayPage.goto();
      await todayPage.waitForLoad();

      const hasWorkout = await todayPage.hasWorkoutScheduled();
      expect(hasWorkout).toBe(false);

      await expect(todayPage.noWorkoutMessage).toBeVisible();
    });
  });
});
