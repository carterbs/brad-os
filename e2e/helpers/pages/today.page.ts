import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

/**
 * Page object for the Today page (/)
 */
export class TodayPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('h1:has-text("Today")');
  }

  // ============ Locators ============

  get noWorkoutMessage(): Locator {
    return this.page.getByTestId('no-workout-message');
  }

  get startWorkoutButton(): Locator {
    return this.page.getByTestId('start-workout');
  }

  get completeWorkoutButton(): Locator {
    return this.page.getByTestId('complete-workout');
  }

  get skipWorkoutButton(): Locator {
    return this.page.getByTestId('skip-workout');
  }

  get workoutStatus(): Locator {
    return this.page.getByTestId('workout-status');
  }

  get restTimer(): Locator {
    return this.page.getByTestId('rest-timer');
  }

  get logSetModal(): Locator {
    return this.page.getByTestId('log-set-modal');
  }

  get repsInput(): Locator {
    return this.page.getByTestId('reps-input');
  }

  get weightInput(): Locator {
    return this.page.getByTestId('weight-input');
  }

  get saveButton(): Locator {
    return this.page.getByTestId('save-button');
  }

  get cancelButton(): Locator {
    return this.page.getByTestId('cancel-button');
  }

  get confirmDialog(): Locator {
    return this.page.getByTestId('confirm-dialog');
  }

  get confirmButton(): Locator {
    return this.page.getByTestId('confirm-button');
  }

  // ============ Actions ============

  /**
   * Check if there's a workout scheduled for today
   */
  async hasWorkoutScheduled(): Promise<boolean> {
    const noWorkout = await this.noWorkoutMessage.isVisible();
    return !noWorkout;
  }

  /**
   * Start the current workout
   */
  async startWorkout(): Promise<void> {
    await this.startWorkoutButton.click();
    await expect(this.workoutStatus).toContainText('In Progress');
  }

  /**
   * Get a set row by its ID
   */
  getSetRow(setId: number): Locator {
    return this.page.getByTestId(`set-row-${setId}`);
  }

  /**
   * Click on a set row to open the log modal
   */
  async clickSet(setId: number): Promise<void> {
    await this.getSetRow(setId).click();
    await expect(this.logSetModal).toBeVisible();
  }

  /**
   * Log a set with specific reps and weight
   */
  async logSet(setId: number, reps: number, weight: number): Promise<void> {
    await this.clickSet(setId);

    // Clear and fill reps
    await this.repsInput.clear();
    await this.repsInput.fill(String(reps));

    // Clear and fill weight
    await this.weightInput.clear();
    await this.weightInput.fill(String(weight));

    // Save
    await this.saveButton.click();
    await expect(this.logSetModal).not.toBeVisible();
  }

  /**
   * Log a set using target values (just click save)
   */
  async logSetWithTargets(setId: number): Promise<void> {
    await this.clickSet(setId);
    await this.saveButton.click();
    await expect(this.logSetModal).not.toBeVisible();
  }

  /**
   * Skip a specific set
   */
  async skipSet(setId: number): Promise<void> {
    const setRow = this.getSetRow(setId);
    const skipButton = setRow.getByTestId('skip-set-button');
    await skipButton.click();
  }

  /**
   * Complete the current workout
   */
  async completeWorkout(): Promise<void> {
    await this.completeWorkoutButton.click();

    // If confirmation dialog appears, confirm it
    const dialogVisible = await this.confirmDialog.isVisible();
    if (dialogVisible) {
      await this.confirmButton.click();
    }

    // After completion, the workout disappears (query returns null)
    // So we wait for either "Completed" status or "No workout scheduled" message
    await expect(
      this.workoutStatus.or(this.noWorkoutMessage)
    ).toBeVisible();
  }

  /**
   * Skip the current workout
   */
  async skipWorkout(): Promise<void> {
    await this.skipWorkoutButton.click();

    // Confirm the skip
    await expect(this.confirmDialog).toBeVisible();
    await this.confirmButton.click();

    // After skipping, the workout disappears (query returns null)
    // So we wait for either "Skipped" status or "No workout scheduled" message
    await expect(
      this.workoutStatus.or(this.noWorkoutMessage)
    ).toBeVisible();
  }

  /**
   * Check if the rest timer is visible
   */
  async isRestTimerVisible(): Promise<boolean> {
    return this.restTimer.isVisible();
  }

  /**
   * Dismiss the rest timer
   */
  async dismissRestTimer(): Promise<void> {
    const dismissButton = this.page.getByTestId('dismiss-timer-button');
    if (await dismissButton.isVisible()) {
      await dismissButton.click();
    }
  }

  /**
   * Get the current workout status text
   */
  async getWorkoutStatus(): Promise<string> {
    return this.workoutStatus.textContent() as Promise<string>;
  }

  /**
   * Check if set is logged (has green background / completed status)
   */
  async isSetLogged(setId: number): Promise<boolean> {
    const setRow = this.getSetRow(setId);
    const badge = setRow.getByText('Logged');
    return badge.isVisible();
  }

  /**
   * Check if set is skipped
   */
  async isSetSkipped(setId: number): Promise<boolean> {
    const setRow = this.getSetRow(setId);
    // Wait a moment for the UI to update
    await this.page.waitForTimeout(500);
    // Check for the Badge with "Skipped" text (the span element)
    const skippedBadge = setRow.getByText('Skipped', { exact: true });
    return skippedBadge.isVisible();
  }

  /**
   * Get the actual values logged for a set
   */
  async getLoggedValues(
    setId: number
  ): Promise<{ reps: number; weight: number } | null> {
    const setRow = this.getSetRow(setId);
    const repsEl = setRow.getByTestId('actual-reps');
    const weightEl = setRow.getByTestId('actual-weight');

    // Wait for the element to appear (gives UI time to update)
    try {
      await repsEl.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return null;
    }

    const repsText = await repsEl.textContent();
    const weightText = await weightEl.textContent();

    return {
      reps: parseInt(repsText ?? '0', 10),
      weight: parseFloat(weightText ?? '0'),
    };
  }
}
