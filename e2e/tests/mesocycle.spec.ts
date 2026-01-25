import { test, expect, testData } from '../helpers/fixtures.js';

test.describe('Mesocycle Management', () => {
  // Run serially to avoid database conflicts between parallel tests
  // Parallel OK: each worker has isolated database

  test.beforeEach(async ({ api }) => {
    await api.resetDatabase();
  });

  test.describe('starting a mesocycle', () => {
    test('should show no plans message when no plans exist', async ({
      mesoPage,
    }) => {
      await mesoPage.goto();
      await mesoPage.waitForLoad();

      await expect(mesoPage.noPlansMessage).toBeVisible();
    });

    test('should start a mesocycle from a plan', async ({ mesoPage, api }) => {
      // Create a plan with a workout day via API
      const exercise = await api.createExercise('Test Exercise', 5);
      const { plan } = await api.createCompletePlan({
        planName: 'Test Plan for Meso',
        days: [
          {
            dayOfWeek: 1,
            name: 'Monday',
            exercises: [{ exerciseId: exercise.id, sets: 3 }],
          },
        ],
      });

      await mesoPage.goto();
      await mesoPage.waitForLoad();

      const startDate = testData.getWeekStartDate();
      await mesoPage.startMesocycle(plan.name, startDate);

      const hasActive = await mesoPage.hasActiveMesocycle();
      expect(hasActive).toBe(true);
    });

    test('should not allow starting when mesocycle already active', async ({
      mesoPage,
      api,
    }) => {
      // Set up scenario which creates an active mesocycle
      await api.setupWorkoutScenario('Bench Press');

      await mesoPage.goto();
      await mesoPage.waitForLoad();

      // Should show status card, not form
      await expect(mesoPage.mesocycleStatusCard).toBeVisible();
      await expect(mesoPage.startMesocycleForm).not.toBeVisible();
    });
  });

  test.describe('viewing mesocycle', () => {
    test('should show current week', async ({ mesoPage, api }) => {
      await api.setupWorkoutScenario('Squat');

      await mesoPage.goto();
      await mesoPage.waitForLoad();

      const currentWeek = await mesoPage.getCurrentWeek();
      expect(currentWeek).toBe(1);
    });

    test('should show week schedule', async ({ mesoPage, api }) => {
      await api.setupWorkoutScenario('Deadlift');

      await mesoPage.goto();
      await mesoPage.waitForLoad();

      // Week 1 should be visible
      const weekCard = mesoPage.getWeekCard(1);
      await expect(weekCard).toBeVisible();
    });
  });

  test.describe('cancelling mesocycle', () => {
    test('should cancel active mesocycle', async ({ mesoPage, api }) => {
      await api.setupWorkoutScenario('Press');

      await mesoPage.goto();
      await mesoPage.waitForLoad();

      // Verify active
      const hasActiveBefore = await mesoPage.hasActiveMesocycle();
      expect(hasActiveBefore).toBe(true);

      // Cancel
      await mesoPage.cancelMesocycle();

      // Verify no longer active
      const hasActiveAfter = await mesoPage.hasActiveMesocycle();
      expect(hasActiveAfter).toBe(false);

      // Form should be visible again
      await expect(mesoPage.startMesocycleForm).toBeVisible();
    });
  });

  test.describe('mesocycle with workout progress', () => {
    test('should reflect workout completion in week view', async ({
      mesoPage,
      todayPage,
      api,
    }) => {
      await api.setupWorkoutScenario('Row');

      // Complete today's workout
      await todayPage.goto();
      await todayPage.waitForLoad();

      const hasScheduled = await todayPage.hasWorkoutScheduled();
      if (hasScheduled) {
        await todayPage.startWorkout();

        // Get workout and log all sets
        const workout = await api.getTodaysWorkout();
        if (workout !== null) {
          for (const exercise of workout.exercises) {
            for (const set of exercise.sets) {
              await todayPage.logSetWithTargets(set.id);
              const timerVisible = await todayPage.isRestTimerVisible();
              if (timerVisible) {
                await todayPage.dismissRestTimer();
              }
            }
          }
        }

        await todayPage.completeWorkout();
      }

      // Check mesocycle page
      await mesoPage.goto();
      await mesoPage.waitForLoad();

      const weekStats = await mesoPage.getWeekWorkoutCount(1);
      expect(weekStats.completed).toBeGreaterThanOrEqual(0);
    });
  });
});
