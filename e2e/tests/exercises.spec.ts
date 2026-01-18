import { test, expect, testData } from '../helpers/fixtures.js';

test.describe('Exercise Library', () => {
  // Run serially to avoid database conflicts between parallel tests
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ api }) => {
    await api.resetDatabase();
  });

  test.describe('viewing exercises', () => {
    test('should show default exercises', async ({ exercisesPage }) => {
      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      // Should have at least the default exercises
      const count = await exercisesPage.getExerciseCount();
      expect(count).toBeGreaterThan(0);
    });

    test('should show exercise list', async ({ exercisesPage }) => {
      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      // Check a known default exercise exists
      const exists = await exercisesPage.exerciseExists('Dumbbell Press (flat)');
      expect(exists).toBe(true);
    });
  });

  test.describe('creating exercises', () => {
    test('should create a custom exercise', async ({ exercisesPage }) => {
      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      const exerciseName = testData.uniqueName('Custom Barbell Curl');

      await exercisesPage.addExercise(exerciseName, 2.5);

      // Verify exercise was created
      const exists = await exercisesPage.exerciseExists(exerciseName);
      expect(exists).toBe(true);
    });

    test('should show custom exercise as deletable', async ({
      exercisesPage,
    }) => {
      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      const exerciseName = testData.uniqueName('Deletable Exercise');
      await exercisesPage.addExercise(exerciseName, 5);

      const isCustom = await exercisesPage.isExerciseCustom(exerciseName);
      expect(isCustom).toBe(true);
    });
  });

  test.describe('editing exercises', () => {
    test('should edit exercise name', async ({ exercisesPage, api }) => {
      // Create a custom exercise via API
      const exercise = await api.createExercise('Original Name', 5);

      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      const newName = testData.uniqueName('Updated Name');
      await exercisesPage.editExercise(exercise.name, newName);

      // Verify original name is gone
      const oldExists = await exercisesPage.exerciseExists(exercise.name);
      expect(oldExists).toBe(false);

      // Verify new name exists
      const newExists = await exercisesPage.exerciseExists(newName);
      expect(newExists).toBe(true);
    });

    test('should edit weight increment', async ({ exercisesPage, api }) => {
      const exercise = await api.createExercise('Exercise to Edit', 5);

      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      await exercisesPage.editExercise(exercise.name, exercise.name, 10);

      // Verify exercise still exists
      const exists = await exercisesPage.exerciseExists(exercise.name);
      expect(exists).toBe(true);
    });
  });

  test.describe('deleting exercises', () => {
    test('should delete a custom exercise', async ({ exercisesPage, api }) => {
      const exercise = await api.createExercise('Exercise to Delete', 5);

      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      // Verify it exists
      const existsBefore = await exercisesPage.exerciseExists(exercise.name);
      expect(existsBefore).toBe(true);

      // Delete it
      await exercisesPage.deleteExercise(exercise.name);

      // Verify it's gone
      const existsAfter = await exercisesPage.exerciseExists(exercise.name);
      expect(existsAfter).toBe(false);
    });

    test('should not be able to delete built-in exercise', async ({
      exercisesPage,
    }) => {
      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      // Built-in exercises should not have delete button
      const isCustom = await exercisesPage.isExerciseCustom(
        'Dumbbell Press (flat)'
      );
      expect(isCustom).toBe(false);
    });
  });

  test.describe('exercise constraints', () => {
    test('should not delete exercise used in active plan', async ({
      exercisesPage,
      api,
    }) => {
      // Create exercise and plan that uses it
      const exercise = await api.createExercise('Used Exercise', 5);
      await api.createCompletePlan({
        planName: 'Plan Using Exercise',
        days: [
          {
            dayOfWeek: 1,
            name: 'Monday',
            exercises: [{ exerciseId: exercise.id, sets: 3 }],
          },
        ],
      });

      await exercisesPage.goto();
      await exercisesPage.waitForLoad();

      // Try to delete - this should show an error
      await exercisesPage.clickDeleteExercise(exercise.name);

      // The delete dialog should have an error or the delete should fail
      // This depends on implementation - we verify the exercise still exists
      const exists = await exercisesPage.exerciseExists(exercise.name);
      expect(exists).toBe(true);
    });
  });
});
