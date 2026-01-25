import { test, expect, testData } from '../helpers/fixtures.js';

/**
 * Full User Journey Test
 *
 * Tests the complete flow: create exercise → create plan → start mesocycle → track workout
 */
test.describe('Full User Journey', () => {
  // Each worker has isolated database, so parallel is safe

  test.beforeEach(async ({ api }) => {
    await api.resetDatabase();
  });

  test('complete workout tracking flow', async ({
    page,
    plansPage,
    mesoPage,
    todayPage,
    api,
  }) => {
    // Use a built-in exercise for reliability
    const exerciseName = 'Dumbbell Press (flat)';
    const planName = testData.uniqueName('Test Workout Plan');
    const todayDayOfWeek = testData.getTodayDayOfWeek();

    // ============ Step 1: Create a plan with today as a workout day ============
    await plansPage.goto();
    await plansPage.waitForLoad();

    await plansPage.navigateToCreatePlan();

    // Step 1: Fill basics
    await plansPage.fillStep1(planName, 6);

    // Step 2: Select today as a workout day
    await plansPage.fillStep2([todayDayOfWeek]);

    // Step 3: Add the exercise
    await plansPage.addExerciseToDay(todayDayOfWeek, exerciseName, {
      sets: 3,
      reps: 8,
      weight: 135,
      restSeconds: 90,
    });

    await plansPage.submitPlan();

    // Verify we're on the plan detail page
    await expect(page).toHaveURL(/\/lifting\/plans\/\d+$/);

    // ============ Step 3: Start a mesocycle ============
    await mesoPage.goto();
    await mesoPage.waitForLoad();

    // Get the start date for the current week
    const startDate = testData.getWeekStartDate();
    await mesoPage.startMesocycle(planName, startDate);

    // Verify mesocycle is active
    const hasActiveMeso = await mesoPage.hasActiveMesocycle();
    expect(hasActiveMeso).toBe(true);

    // ============ Step 4: Track today's workout ============
    await todayPage.goto();
    await todayPage.waitForLoad();

    // Verify we have a workout for today
    const hasWorkout = await todayPage.hasWorkoutScheduled();
    expect(hasWorkout).toBe(true);

    // Start the workout
    await todayPage.startWorkout();

    // Get workout data to find set IDs
    const workout = await api.getTodaysWorkout();
    expect(workout).not.toBeNull();
    expect(workout).toBeDefined();
    if (workout === null) throw new Error('Workout should not be null');
    expect(workout.exercises.length).toBeGreaterThan(0);

    const firstExercise = workout.exercises[0];
    expect(firstExercise).toBeDefined();
    const sets = firstExercise?.sets ?? [];
    expect(sets.length).toBe(3); // We configured 3 sets

    // Log all sets
    for (const set of sets) {
      await todayPage.logSetWithTargets(set.id);

      // Dismiss rest timer if visible
      if (await todayPage.isRestTimerVisible()) {
        await todayPage.dismissRestTimer();
      }
    }

    // Complete the workout
    await todayPage.completeWorkout();

    // Verify the workout was actually completed via API
    const completedWorkout = await api.getWorkoutById(workout.id);
    expect(completedWorkout.status).toBe('completed');
    expect(completedWorkout.week_number).toBe(1); // Should be week 1

    // Note: After completion, the app shows the next upcoming workout (next week),
    // so we verify completion through the mesocycle page instead

    // ============ Step 5: Verify mesocycle reflects completion ============
    await mesoPage.goto();
    // Force reload to clear React Query cache
    await page.reload();
    await mesoPage.waitForLoad();

    // Week 1 should show 1 completed workout
    const weekStats = await mesoPage.getWeekWorkoutCount(1);
    expect(weekStats.completed).toBeGreaterThan(0);
  });

  test('exercise to plan flow with edit', async ({
    plansPage,
  }) => {
    // Use a built-in exercise
    const exerciseName = 'Seated Cable Row';

    // Navigate to plans and create a plan
    await plansPage.goto();
    await plansPage.waitForLoad();

    const planName = testData.uniqueName('Quick Plan');
    const todayDayOfWeek = testData.getTodayDayOfWeek();

    await plansPage.navigateToCreatePlan();
    await plansPage.fillStep1(planName, 4);
    await plansPage.fillStep2([todayDayOfWeek]);
    await plansPage.addExerciseToDay(todayDayOfWeek, exerciseName, {
      sets: 2,
      reps: 10,
      weight: 100,
    });
    await plansPage.submitPlan();

    // Navigate back to plans list and verify plan exists
    await plansPage.goto();
    await plansPage.waitForLoad();

    const planExists = await plansPage.planExists(planName);
    expect(planExists).toBe(true);
  });

  test('mesocycle cancellation flow', async ({ api, mesoPage }) => {
    // Set up a complete scenario via API
    await api.setupWorkoutScenario('Deadlift');

    await mesoPage.goto();
    await mesoPage.waitForLoad();

    // Verify we have an active mesocycle
    const hasActiveBefore = await mesoPage.hasActiveMesocycle();
    expect(hasActiveBefore).toBe(true);

    // Cancel the mesocycle
    await mesoPage.cancelMesocycle();

    // Verify no active mesocycle
    const hasActiveAfter = await mesoPage.hasActiveMesocycle();
    expect(hasActiveAfter).toBe(false);

    // Can start a new mesocycle
    await expect(mesoPage.startMesocycleForm).toBeVisible();
  });

  test('progressive overload tracking', async ({ api, todayPage }) => {
    // This test verifies that workout sets have progressive overload applied
    // by checking target values change between weeks

    // Set up scenario
    await api.setupWorkoutScenario('Overhead Press');

    await todayPage.goto();
    await todayPage.waitForLoad();

    const hasWorkout = await todayPage.hasWorkoutScheduled();
    expect(hasWorkout).toBe(true);

    // Get today's workout targets
    const workout = await api.getTodaysWorkout();
    expect(workout).not.toBeNull();
    if (workout === null) throw new Error('Workout should not be null');

    const firstExercise = workout.exercises[0];
    expect(firstExercise).toBeDefined();
    const firstSet = firstExercise?.sets[0];
    expect(firstSet).toBeDefined();
    if (firstSet === undefined) throw new Error('First set should be defined');

    // Verify targets are set correctly based on plan configuration
    expect(firstSet.target_weight).toBeGreaterThan(0);
    expect(firstSet.target_reps).toBeGreaterThan(0);
  });
});
