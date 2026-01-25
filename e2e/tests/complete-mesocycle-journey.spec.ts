import { type Page } from '@playwright/test';
import { test, expect, testData } from '../helpers/fixtures.js';
import type { DayOfWeek } from '../helpers/api.js';
import type { ApiHelper } from '../helpers/api.js';
import type { TodayPage } from '../helpers/pages/today.page.js';

// Exercise configurations with base weight and increment
const exerciseConfigs = [
  { name: 'E2E Bench Press', weightIncrement: 5, baseWeight: 100 },
  { name: 'E2E Squat', weightIncrement: 10, baseWeight: 135 },
  { name: 'E2E Deadlift', weightIncrement: 10, baseWeight: 185 },
  { name: 'E2E OHP', weightIncrement: 2.5, baseWeight: 65 },
];

/**
 * Calculate expected weight for a given mesocycle week based on dynamic progression rules.
 *
 * Dynamic progression algorithm (8-12 rep range):
 * - Weight only increases when user hits maxReps (12) in the previous week
 * - Starting at 8 reps and incrementing by 1 each week:
 *   - Week 1: 8 reps → Week 2: 9 reps → ... → Week 5: 12 reps
 *   - Week 6: weight increases (after hitting 12 in week 5), reps drop to 8
 * - Week 7: deload (85% of working weight)
 *
 * For this test, we start at 8 reps and hit targets each week:
 * - Weeks 1-5: base weight (building up reps)
 * - Week 6: base weight + increment (after hitting maxReps in week 5)
 * - Week 7: deload (85% of week 6 weight, rounded to 2.5)
 */
function calculateExpectedWeight(
  baseWeight: number,
  increment: number,
  weekNumber: number
): number {
  if (weekNumber === 7) {
    // Deload: 85% of week 6 weight, rounded to nearest 2.5
    const week6Weight = baseWeight + increment; // One weight increase by week 6
    const deloadWeight = week6Weight * 0.85;
    return Math.round(deloadWeight / 2.5) * 2.5;
  }

  if (weekNumber === 6) {
    // Week 6: weight increases after hitting maxReps (12) in week 5
    return baseWeight + increment;
  }

  // Weeks 1-5: building up reps, weight stays at base
  return baseWeight;
}

/**
 * Calculate expected reps for a given mesocycle week using dynamic progression:
 *
 * Dynamic progression (8-12 rep range, starting at 8):
 * - Week 1: 8 reps (base/min)
 * - Week 2: 9 reps (hit target → +1)
 * - Week 3: 10 reps
 * - Week 4: 11 reps
 * - Week 5: 12 reps (maxReps)
 * - Week 6: 8 reps (after weight increase, reset to min)
 * - Week 7: 8 reps (deload, at minReps)
 */
function calculateMinExpectedReps(_baseReps: number, weekNumber: number): number {
  const minReps = 8;
  const maxReps = 12;

  if (weekNumber === 7) {
    // Deload: use minReps
    return minReps;
  }

  if (weekNumber === 6) {
    // After weight increase, drop to minReps
    return minReps;
  }

  // Weeks 1-5: building up reps from minReps
  // Week 1: 8, Week 2: 9, Week 3: 10, Week 4: 11, Week 5: 12
  const reps = minReps + (weekNumber - 1);
  return Math.min(reps, maxReps);
}

/**
 * Track a single workout - log some sets, leave others pending
 */
async function trackWorkout(
  workoutId: number,
  skipExerciseIndex: number, // Which exercise to leave entirely pending (0 or 1)
  api: ApiHelper,
  todayPage: TodayPage,
  page: Page
): Promise<void> {
  const workout = await api.getWorkoutById(workoutId);

  // Navigate to workout if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes(`/lifting/workouts/${workoutId}`)) {
    await page.goto(`/lifting/workouts/${workoutId}`);
    await page.waitForURL(/\/lifting\/workouts\/\d+/);
  }

  // Wait for workout content to load
  await page.waitForSelector('[data-testid="workout-status"], [data-testid="start-workout"]', { timeout: 10000 });

  // Start workout if needed
  const startBtn = page.getByTestId('start-workout');
  if (await startBtn.isVisible()) {
    await startBtn.click();
    // Wait for status to update
    await expect(page.getByTestId('workout-status')).toContainText(
      'In Progress'
    );
  }

  // Track each exercise
  for (let exIdx = 0; exIdx < workout.exercises.length; exIdx++) {
    const exercise = workout.exercises[exIdx];
    const sets = exercise?.sets ?? [];

    if (exIdx === skipExerciseIndex) {
      // For "skipped" exercise: only log the first set (so progression has data)
      // This creates variety while still allowing progression algorithm to work
      const firstSet = sets[0];
      if (firstSet !== undefined) {
        await todayPage.logSetWithTargets(firstSet.id);
        // Dismiss rest timer if visible
        if (await todayPage.isRestTimerVisible()) {
          await todayPage.dismissRestTimer();
        }
      }
    } else {
      // Log first N-1 sets, leave last set pending (variety in tracking)
      for (let i = 0; i < sets.length; i++) {
        const set = sets[i];
        if (set === undefined) continue;

        if (i < sets.length - 1) {
          await todayPage.logSetWithTargets(set.id);
          // Dismiss rest timer if visible
          if (await todayPage.isRestTimerVisible()) {
            await todayPage.dismissRestTimer();
          }
        }
        // Last set is left unchecked (pending)
      }
    }
  }

  // Complete the workout
  await todayPage.completeWorkout();
}

/**
 * Verify progression values for a given week
 */
async function verifyWeekProgression(
  weekNumber: number,
  api: ApiHelper
): Promise<void> {
  const workouts = await api.getWorkouts();
  const weekWorkouts = workouts.filter((w) => w.week_number === weekNumber);

  for (const workoutSummary of weekWorkouts) {
    const workout = await api.getWorkoutById(workoutSummary.id);

    for (const exercise of workout.exercises) {
      const config = exerciseConfigs.find(
        (c) => c.name === exercise.exercise_name
      );
      if (!config) continue;

      const expectedWeight = calculateExpectedWeight(
        config.baseWeight,
        config.weightIncrement,
        weekNumber
      );
      const minExpectedReps = calculateMinExpectedReps(8, weekNumber);
      const expectedSets = weekNumber === 7 ? 2 : 3; // Deload = 50% volume

      const firstSet = exercise.sets[0];
      expect(firstSet?.target_weight).toBeGreaterThanOrEqual(expectedWeight);
      // With peak performance tracking, reps should be at least the min expected,
      // but may be higher if peak from a previous week exceeds the current target
      expect(firstSet?.target_reps).toBeGreaterThanOrEqual(minExpectedReps);
      expect(exercise.sets.length).toBe(expectedSets);
    }
  }
}

/**
 * Complete Mesocycle Journey Test
 *
 * Tests the ENTIRE user journey through the UI - from creating exercises
 * and plans to tracking ALL 14 workouts across all 7 weeks, then completing
 * the mesocycle and verifying everything works.
 */
test.describe('Complete Mesocycle Journey', () => {
  // Run serially to avoid database conflicts
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ api }) => {
    await api.resetDatabase();
  });

  test('full mesocycle journey: create → track all 14 workouts → complete', async ({
    exercisesPage,
    plansPage,
    mesoPage,
    todayPage,
    page,
    api,
  }) => {
    // Set a longer timeout for this comprehensive test
    test.setTimeout(300000); // 5 minutes

    // ============ Step 1: Create 4 Exercises via UI ============
    await exercisesPage.goto();
    await exercisesPage.waitForLoad();

    for (const config of exerciseConfigs) {
      await exercisesPage.addExercise(config.name, config.weightIncrement);
    }

    // Verify all 4 exercises exist
    for (const config of exerciseConfigs) {
      const exists = await exercisesPage.exerciseExists(config.name);
      expect(exists).toBe(true);
    }

    // ============ Step 2: Create 2-Day Plan via UI Wizard ============
    const today = testData.getTodayDayOfWeek();
    const otherDay = (((today + 3) % 7) as DayOfWeek);
    const planName = testData.uniqueName('Complete Meso Test Plan');

    await plansPage.goto();
    await plansPage.waitForLoad();

    await plansPage.createPlan({
      name: planName,
      durationWeeks: 6,
      days: [
        {
          dayOfWeek: today,
          exercises: [
            { name: 'E2E Bench Press', sets: 3, reps: 8, weight: 100 },
            { name: 'E2E Squat', sets: 3, reps: 8, weight: 135 },
          ],
        },
        {
          dayOfWeek: otherDay,
          exercises: [
            { name: 'E2E Deadlift', sets: 3, reps: 8, weight: 185 },
            { name: 'E2E OHP', sets: 3, reps: 8, weight: 65 },
          ],
        },
      ],
    });

    // Verify plan was created (we're on the plan detail page)
    await expect(page).toHaveURL(/\/lifting\/plans\/\d+$/);

    // ============ Step 3: Start Mesocycle via UI ============
    const startDate = testData.getWeekStartDate();

    await mesoPage.goto();
    await mesoPage.waitForLoad();
    await mesoPage.startMesocycle(planName, startDate);

    // Verify mesocycle is active
    const hasActiveMeso = await mesoPage.hasActiveMesocycle();
    expect(hasActiveMeso).toBe(true);

    // ============ Step 4: Track All 14 Workouts (Hybrid Approach) ============
    // Uses UI for key weeks (1, 6, 7) to test real user interactions,
    // and API for weeks 2-5 to speed up the test while still exercising progression logic.
    // Get all workouts and sort by scheduled date
    const allWorkouts = await api.getWorkouts();
    const sortedWorkouts = [...allWorkouts].sort((a, b) =>
      a.scheduled_date.localeCompare(b.scheduled_date)
    );

    // Verify we have 14 workouts (2 per week × 7 weeks)
    expect(sortedWorkouts.length).toBe(14);

    // Group workouts by week
    const workoutsByWeek = new Map<number, typeof sortedWorkouts>();
    for (const workout of sortedWorkouts) {
      const week = workout.week_number;
      if (!workoutsByWeek.has(week)) {
        workoutsByWeek.set(week, []);
      }
      workoutsByWeek.get(week)?.push(workout);
    }

    // Track all workouts for each week using hybrid approach
    for (let week = 1; week <= 7; week++) {
      const weekWorkouts = workoutsByWeek.get(week) ?? [];
      expect(weekWorkouts.length).toBe(2); // 2 workouts per week

      for (let i = 0; i < weekWorkouts.length; i++) {
        const workout = weekWorkouts[i];
        if (workout === undefined) continue;

        // UI tracking for key weeks: 1 (baseline), 6 (weight increase), 7 (deload)
        // Only track first workout of key weeks via UI to save time
        const isKeyWeek = week === 1 || week === 6 || week === 7;
        const useUI = isKeyWeek && i === 0;

        if (useUI) {
          // UI tracking - tests real user interactions
          // Alternate which exercise gets skipped entirely
          const skipIndex = (week + i) % 2;
          await trackWorkout(workout.id, skipIndex, api, todayPage, page);
        } else {
          // API tracking - fast, still exercises progression logic
          await api.completeWorkoutViaApi(workout.id);
        }

        // Verify workout is completed (same verification either way)
        const updated = await api.getWorkoutById(workout.id);
        expect(updated.status).toBe('completed');
      }

      // Verify week progression after completing the week
      await verifyWeekProgression(week, api);
    }

    // ============ Step 5: Complete Mesocycle ============
    await mesoPage.goto();
    await mesoPage.waitForLoad();

    // Check if mesocycle is still active and has a complete button
    const isStillActive = await mesoPage.hasActiveMesocycle();
    if (isStillActive) {
      // Click the complete button to open confirmation dialog
      const completeButton = page.getByTestId('complete-mesocycle-button');
      if (await completeButton.isVisible()) {
        await completeButton.click();
        // Wait for confirmation dialog and click confirm
        const confirmButton = page.getByTestId('confirm-complete-button');
        await expect(confirmButton).toBeVisible({ timeout: 5000 });
        await confirmButton.click();
        // Wait for the page to update (mesocycle becomes inactive after completion)
        await expect(page.getByText('No active mesocycle')).toBeVisible({
          timeout: 10000,
        });
      }
    }

    // ============ Step 6: Final Verification ============
    // Verify all 14 workouts are completed
    const finalWorkouts = await api.getWorkouts();
    const completedWorkouts = finalWorkouts.filter(
      (w) => w.status === 'completed'
    );
    expect(completedWorkouts.length).toBe(14);

    // Verify all weeks have correct progression
    for (let week = 1; week <= 7; week++) {
      await verifyWeekProgression(week, api);
    }

    // Verify no active mesocycle (since it's been completed)
    const activeMeso = await api.getActiveMesocycle();
    expect(activeMeso).toBeNull();

    // Reload page and verify persistence
    await page.reload();
    await mesoPage.waitForLoad();

    // After reload, should still show no active mesocycle
    expect(await mesoPage.hasActiveMesocycle()).toBe(false);

    // ============ Step 7: Verify Completed Mesocycle in History ============
    // The completed mesocycle should now appear in the History section
    await expect(page.getByTestId('completed-mesocycles-heading')).toBeVisible();
    await expect(page.getByTestId('completed-mesocycles-list')).toBeVisible();

    // Verify our completed mesocycle appears with the plan name
    const completedMesoCard = page.locator('[data-testid^="completed-mesocycle-"]').first();
    await expect(completedMesoCard).toBeVisible();
    await expect(completedMesoCard).toContainText('Complete Meso Test Plan');
    await expect(completedMesoCard).toContainText('Completed');
  });
});
