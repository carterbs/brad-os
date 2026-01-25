import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

/**
 * Page object for the Exercise Library page (/lifting/exercises)
 */
export class ExercisesPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto(this.getFullUrl('/lifting/exercises'));
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('h1:has-text("Exercise Library")');
    // Wait for exercise list to load (either exercise items or "no exercises" message)
    await this.page.waitForSelector(
      '[data-testid="exercise-item"], [data-testid="exercise-list"], :text("No exercises found")',
      { timeout: 10000 }
    );
  }

  // ============ Locators ============

  get exerciseNameInput(): Locator {
    return this.page.locator('#exercise-name');
  }

  get weightIncrementInput(): Locator {
    return this.page.locator('#weight-increment');
  }

  get addExerciseButton(): Locator {
    return this.page.getByRole('button', { name: /Add Exercise/i });
  }

  get exerciseList(): Locator {
    return this.page.getByTestId('exercise-list');
  }

  get editExerciseDialog(): Locator {
    return this.page.getByTestId('edit-exercise-dialog');
  }

  get deleteExerciseDialog(): Locator {
    return this.page.getByTestId('delete-exercise-dialog');
  }

  // ============ Actions ============

  /**
   * Add a new custom exercise
   */
  async addExercise(name: string, weightIncrement = 5): Promise<void> {
    // Fill name and wait for value to be set
    await this.exerciseNameInput.fill(name);
    await expect(this.exerciseNameInput).toHaveValue(name);

    // Fill weight increment and wait for value to be set
    await this.weightIncrementInput.fill(String(weightIncrement));
    await expect(this.weightIncrementInput).toHaveValue(String(weightIncrement));

    // Now submit
    await this.addExerciseButton.click();

    // Wait for the exercise to appear in the list
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  /**
   * Get an exercise list item by name
   */
  getExerciseItem(name: string): Locator {
    return this.page.locator('[data-testid="exercise-item"]').filter({
      hasText: name,
    });
  }

  /**
   * Navigate to exercise history page by clicking the exercise link,
   * then click the edit button on the history page.
   */
  async clickEditExercise(name: string): Promise<void> {
    const item = this.getExerciseItem(name);
    await item.locator('[data-testid="exercise-link"]').click();

    // Wait for the history page to load
    await this.page.waitForSelector('button[aria-label="Edit exercise"]');

    // Click the edit button on the history page
    await this.page.getByRole('button', { name: /edit exercise/i }).click();
    await expect(this.editExerciseDialog).toBeVisible();
  }

  /**
   * Click delete button for a specific exercise
   */
  async clickDeleteExercise(name: string): Promise<void> {
    const item = this.getExerciseItem(name);
    await item.getByRole('button', { name: /delete/i }).click();
    await expect(this.deleteExerciseDialog).toBeVisible();
  }

  /**
   * Edit an exercise name and weight increment.
   * Navigates to the exercise history page, opens the edit dialog,
   * then navigates back to the exercises list.
   */
  async editExercise(
    currentName: string,
    newName: string,
    newWeightIncrement?: number
  ): Promise<void> {
    await this.clickEditExercise(currentName);

    // Fill in the new values using the input IDs
    const nameInput = this.page.locator('#edit-exercise-name');
    await nameInput.clear();
    await nameInput.fill(newName);

    if (newWeightIncrement !== undefined) {
      const incrementInput = this.page.locator('#edit-weight-increment');
      await incrementInput.clear();
      await incrementInput.fill(String(newWeightIncrement));
    }

    // Save
    await this.editExerciseDialog
      .getByRole('button', { name: /save/i })
      .click();
    await expect(this.editExerciseDialog).not.toBeVisible();

    // Navigate back to exercises list
    await this.page.getByRole('button', { name: /back to exercises/i }).click();
    await this.waitForLoad();
  }

  /**
   * Delete an exercise
   */
  async deleteExercise(name: string): Promise<void> {
    await this.clickDeleteExercise(name);

    // Confirm deletion
    await this.deleteExerciseDialog
      .getByRole('button', { name: /delete/i })
      .click();
    await expect(this.deleteExerciseDialog).not.toBeVisible();
  }

  /**
   * Get the count of exercises in the list
   */
  async getExerciseCount(): Promise<number> {
    const items = this.page.locator('[data-testid="exercise-item"]');
    return items.count();
  }

  /**
   * Check if an exercise exists in the list
   */
  async exerciseExists(name: string): Promise<boolean> {
    const item = this.getExerciseItem(name);
    return item.isVisible();
  }

  /**
   * Check if an exercise has a delete button
   */
  async hasDeleteButton(name: string): Promise<boolean> {
    const item = this.getExerciseItem(name);
    const deleteButton = item.getByRole('button', { name: /delete/i });
    return deleteButton.isVisible();
  }

  /**
   * @deprecated Use hasDeleteButton instead. All exercises are now deletable.
   */
  async isExerciseCustom(name: string): Promise<boolean> {
    return this.hasDeleteButton(name);
  }
}
