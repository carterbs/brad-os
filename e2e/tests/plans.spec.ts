import { test, expect, testData } from '../helpers/fixtures.js';

test.describe('Plan Management', () => {
  // Run serially to avoid database conflicts between parallel tests
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ api }) => {
    await api.resetDatabase();
  });

  test.describe('plan creation', () => {
    test('should create a plan with a single day', async ({
      plansPage,
    }) => {
      await plansPage.goto();
      await plansPage.waitForLoad();

      const planName = testData.uniqueName('Single Day Plan');

      await plansPage.navigateToCreatePlan();
      await plansPage.fillStep1(planName, 6);
      await plansPage.fillStep2([1]); // Monday
      // Use a built-in exercise that's guaranteed to exist
      await plansPage.addExerciseToDay(1, 'Cable Curl', {
        sets: 3,
        reps: 10,
        weight: 100,
      });
      await plansPage.submitPlan();

      // Verify plan was created
      await plansPage.goto();
      await plansPage.waitForLoad();

      const exists = await plansPage.planExists(planName);
      expect(exists).toBe(true);
    });

    test('should create a plan with multiple days', async ({
      plansPage,
    }) => {
      await plansPage.goto();
      await plansPage.waitForLoad();

      const planName = testData.uniqueName('Multi Day Plan');

      await plansPage.navigateToCreatePlan();
      await plansPage.fillStep1(planName, 6);
      await plansPage.fillStep2([1, 3, 5]); // Mon, Wed, Fri
      // Use built-in exercises
      await plansPage.addExerciseToDay(1, 'Cable Curl');
      await plansPage.addExerciseToDay(3, 'Seated Cable Row');
      await plansPage.addExerciseToDay(5, 'Leg Extension');
      await plansPage.submitPlan();

      // Verify plan was created
      await plansPage.goto();
      await plansPage.waitForLoad();

      const exists = await plansPage.planExists(planName);
      expect(exists).toBe(true);
    });

    test('should add multiple exercises to a day', async ({
      plansPage,
    }) => {
      await plansPage.goto();
      await plansPage.waitForLoad();

      const planName = testData.uniqueName('Multiple Exercises Plan');

      await plansPage.navigateToCreatePlan();
      await plansPage.fillStep1(planName, 6);
      await plansPage.fillStep2([2]); // Tuesday

      // Add three built-in exercises to the same day
      await plansPage.addExerciseToDay(2, 'Cable Curl', { sets: 3 });
      await plansPage.addExerciseToDay(2, 'Cable Triceps Pushdown', { sets: 4 });
      await plansPage.addExerciseToDay(2, 'Leg Extension', { sets: 3 });

      await plansPage.submitPlan();

      // Verify plan was created
      await plansPage.goto();
      await plansPage.waitForLoad();

      const exists = await plansPage.planExists(planName);
      expect(exists).toBe(true);
    });

    test('should configure sets/reps/weight/rest for exercises', async ({
      plansPage,
    }) => {
      await plansPage.goto();
      await plansPage.waitForLoad();

      const planName = testData.uniqueName('Configured Plan');

      await plansPage.navigateToCreatePlan();
      await plansPage.fillStep1(planName, 4);
      await plansPage.fillStep2([4]); // Thursday

      // Add built-in exercise with specific configuration
      await plansPage.addExerciseToDay(4, 'Dumbbell Press (flat)', {
        sets: 5,
        reps: 5,
        weight: 225,
        restSeconds: 180,
      });

      await plansPage.submitPlan();

      // Verify plan exists
      await plansPage.goto();
      await plansPage.waitForLoad();

      const exists = await plansPage.planExists(planName);
      expect(exists).toBe(true);
    });
  });

  test.describe('plan list', () => {
    test('should show empty message when no plans', async ({ plansPage }) => {
      await plansPage.goto();
      await plansPage.waitForLoad();

      await expect(plansPage.emptyPlansMessage).toBeVisible();
    });

    test('should show plan count', async ({ plansPage, api }) => {
      // Create plans via API
      await api.createPlan('Plan 1');
      await api.createPlan('Plan 2');

      await plansPage.goto();
      await plansPage.waitForLoad();

      const count = await plansPage.getPlanCount();
      expect(count).toBe(2);
    });
  });

  test.describe('plan deletion', () => {
    test('should delete a plan without active mesocycle', async ({
      plansPage,
      api,
    }) => {
      // Create a plan via API
      await api.createPlan('Plan to Delete');

      await plansPage.goto();
      await plansPage.waitForLoad();

      // Verify plan exists
      const existsBefore = await plansPage.planExists('Plan to Delete');
      expect(existsBefore).toBe(true);

      // Delete the plan
      await plansPage.deletePlan('Plan to Delete');

      // Verify plan is gone
      const existsAfter = await plansPage.planExists('Plan to Delete');
      expect(existsAfter).toBe(false);
    });
  });
});
