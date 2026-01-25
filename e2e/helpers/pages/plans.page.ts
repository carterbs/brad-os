import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Page object for the Plans page (/plans)
 */
export class PlansPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto(this.getFullUrl('/plans'));
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('h1:has-text("My Plans")');
  }

  // ============ Locators ============

  get createPlanButton(): Locator {
    return this.page.getByTestId('create-plan-button');
  }

  get planList(): Locator {
    return this.page.getByTestId('plan-list');
  }

  get emptyPlansMessage(): Locator {
    return this.page.getByTestId('empty-plans-message');
  }

  // Plan Form Locators (on /plans/new)
  get planNameInput(): Locator {
    return this.page.getByTestId('plan-name-input');
  }

  get durationSelect(): Locator {
    return this.page.getByTestId('duration-select');
  }

  get nextButton(): Locator {
    return this.page.getByTestId('next-button');
  }

  get submitButton(): Locator {
    return this.page.getByTestId('submit-button');
  }

  get step1(): Locator {
    return this.page.getByTestId('step-1');
  }

  get step2(): Locator {
    return this.page.getByTestId('step-2');
  }

  get step3(): Locator {
    return this.page.getByTestId('step-3');
  }

  // ============ Actions ============

  /**
   * Navigate to create plan page
   */
  async navigateToCreatePlan(): Promise<void> {
    await this.createPlanButton.click();
    await this.page.waitForURL(/\/plans\/new/);
    await expect(this.step1).toBeVisible();
  }

  /**
   * Get a plan card by name
   */
  getPlanCard(name: string): Locator {
    return this.page.locator('[data-testid^="plan-card"]').filter({
      hasText: name,
    });
  }

  /**
   * Click edit button for a specific plan
   */
  async clickEditPlan(name: string): Promise<void> {
    const card = this.getPlanCard(name);
    await card.getByRole('button', { name: /edit/i }).click();
    await this.page.waitForURL(/\/plans\/\d+\/edit/);
  }

  /**
   * Click delete button for a specific plan (opens dropdown menu first)
   */
  async clickDeletePlan(name: string): Promise<void> {
    const card = this.getPlanCard(name);
    // Open the dropdown menu - find the icon button with aria-label
    const menuButton = card.getByRole('button', { name: 'Plan options' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    // Wait for dropdown to appear and click delete
    const deleteItem = this.page.getByRole('menuitem', { name: /delete/i });
    await expect(deleteItem).toBeVisible();
    await deleteItem.click();
  }

  /**
   * Delete a plan (handles confirmation)
   */
  async deletePlan(name: string): Promise<void> {
    // First, try to click from the plans list page
    // Check if we're on the list page or detail page
    const onListPage = await this.page.locator('[data-testid^="plan-card"]').first().isVisible().catch(() => false);

    if (onListPage) {
      // We're on the list page, click the plan to go to detail page
      const card = this.getPlanCard(name);
      await card.click();
    }

    // Now we should be on the plan detail page, click Delete button
    const deleteButton = this.page.getByRole('button', { name: /^delete$/i });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm deletion
    const deleteDialog = this.page.getByTestId('delete-confirm-dialog');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: /^delete$/i }).click();
    await expect(deleteDialog).not.toBeVisible();
  }

  /**
   * Get the count of plans in the list
   */
  async getPlanCount(): Promise<number> {
    const cards = this.page.locator('[data-testid^="plan-card"]');
    // Wait for at least one card or empty state before counting
    await Promise.race([
      cards.first().waitFor({ timeout: 5000 }).catch(() => {}),
      this.emptyPlansMessage.waitFor({ timeout: 5000 }).catch(() => {}),
    ]);
    return cards.count();
  }

  /**
   * Check if a plan exists (waits up to 5s for it to appear)
   */
  async planExists(name: string): Promise<boolean> {
    const card = this.getPlanCard(name);
    try {
      await expect(card).toBeVisible({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  // ============ Plan Creation Steps ============

  /**
   * Fill step 1: Plan basics (name and duration)
   */
  async fillStep1(name: string, durationWeeks = 6): Promise<void> {
    await expect(this.step1).toBeVisible();
    await this.planNameInput.fill(name);

    // Open duration dropdown and select
    await this.durationSelect.click();
    await this.page
      .getByTestId(`duration-option-${durationWeeks}`)
      .click();

    await this.nextButton.click();
    await expect(this.step2).toBeVisible();
  }

  /**
   * Fill step 2: Select workout days
   */
  async fillStep2(days: DayOfWeek[]): Promise<void> {
    await expect(this.step2).toBeVisible();

    // Click each day button
    for (const day of days) {
      const dayButton = this.page.getByTestId(`day-button-${day}`);
      await dayButton.click();
    }

    await this.nextButton.click();
    await expect(this.step3).toBeVisible();
  }

  /**
   * Fill step 3: Configure exercises for a day
   */
  async addExerciseToDay(
    dayOfWeek: DayOfWeek,
    exerciseName: string,
    config?: {
      sets?: number;
      reps?: number;
      weight?: number;
      restSeconds?: number;
    }
  ): Promise<void> {
    await expect(this.step3).toBeVisible();

    // Click on the day tab
    const dayTab = this.page.getByTestId(`day-tab-${dayOfWeek}`);
    await dayTab.click();

    // Click add exercise button
    const addButton = this.page.getByTestId(`add-exercise-day-${dayOfWeek}`);
    await addButton.click();

    // Find the last exercise row (the one we just added)
    const dayContent = this.page.getByTestId(`day-content-${dayOfWeek}`);
    const exerciseRows = dayContent.locator('[data-testid^="exercise-config-row"]');
    const lastRow = exerciseRows.last();

    // Select the exercise from the dropdown
    const exerciseSelect = lastRow.locator('[data-testid^="exercise-select"]');
    await exerciseSelect.click();

    // Wait for the options to load and then click the exercise option
    const option = this.page.getByRole('option', { name: exerciseName });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
    // Wait for dropdown to close before continuing
    await expect(option).not.toBeVisible();

    // Fill in config if provided - these are all Radix Select dropdowns
    // Must wait for each dropdown to close before opening the next
    if (config?.sets !== undefined) {
      const setsSelect = lastRow.locator('[data-testid^="sets-select"]');
      await setsSelect.click();
      const setsOption = this.page.getByTestId(`sets-option-${config.sets}`);
      await expect(setsOption).toBeVisible();
      await setsOption.click();
      await expect(setsOption).not.toBeVisible();
    }

    if (config?.reps !== undefined) {
      const repsSelect = lastRow.locator('[data-testid^="reps-select"]');
      await repsSelect.click();
      const repsOption = this.page.getByTestId(`reps-option-${config.reps}`);
      await expect(repsOption).toBeVisible();
      await repsOption.click();
      await expect(repsOption).not.toBeVisible();
    }

    if (config?.weight !== undefined) {
      const weightSelect = lastRow.locator('[data-testid^="weight-select"]');
      await weightSelect.click();
      const weightOption = this.page.getByTestId(`weight-option-${config.weight}`);
      await expect(weightOption).toBeVisible();
      await weightOption.click();
      await expect(weightOption).not.toBeVisible();
    }

    if (config?.restSeconds !== undefined) {
      const restSelect = lastRow.locator('[data-testid^="rest-select"]');
      await restSelect.click();
      const restOption = this.page.getByTestId(`rest-option-${config.restSeconds}`);
      await expect(restOption).toBeVisible();
      await restOption.click();
      await expect(restOption).not.toBeVisible();
    }
  }

  /**
   * Submit the plan form
   */
  async submitPlan(): Promise<void> {
    // Wait for the button to be enabled
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
    // Wait longer for the API call and navigation
    await this.page.waitForURL(/\/plans\/\d+$/, { timeout: 15000 });
  }

  /**
   * Create a complete plan with the wizard
   */
  async createPlan(config: {
    name: string;
    durationWeeks?: number;
    days: Array<{
      dayOfWeek: DayOfWeek;
      exercises: Array<{
        name: string;
        sets?: number;
        reps?: number;
        weight?: number;
        restSeconds?: number;
      }>;
    }>;
  }): Promise<void> {
    await this.navigateToCreatePlan();

    // Step 1: Basics
    await this.fillStep1(config.name, config.durationWeeks);

    // Step 2: Select days
    const selectedDays = config.days.map((d) => d.dayOfWeek);
    await this.fillStep2(selectedDays);

    // Step 3: Configure exercises
    for (const dayConfig of config.days) {
      for (const exercise of dayConfig.exercises) {
        const exerciseConfig: {
          sets?: number;
          reps?: number;
          weight?: number;
          restSeconds?: number;
        } = {};
        if (exercise.sets !== undefined) exerciseConfig.sets = exercise.sets;
        if (exercise.reps !== undefined) exerciseConfig.reps = exercise.reps;
        if (exercise.weight !== undefined) exerciseConfig.weight = exercise.weight;
        if (exercise.restSeconds !== undefined) exerciseConfig.restSeconds = exercise.restSeconds;

        await this.addExerciseToDay(dayConfig.dayOfWeek, exercise.name, exerciseConfig);
      }
    }

    await this.submitPlan();
  }
}
