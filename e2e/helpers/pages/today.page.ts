import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

/**
 * Page object for the Lifting Today page (/lifting/today)
 * This is the full workout tracking UI for lifting.
 */
export class TodayPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto(this.getFullUrl('/lifting/today'));
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

  get confirmDialog(): Locator {
    return this.page.getByTestId('confirm-dialog');
  }

  get confirmButton(): Locator {
    return this.page.getByTestId('confirm-button');
  }

  get allSetsDoneDialog(): Locator {
    return this.page.getByTestId('all-sets-done-dialog');
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
   * Get the weight input for a set
   */
  getWeightInput(setId: number): Locator {
    return this.page.getByTestId(`weight-input-${setId}`);
  }

  /**
   * Get the reps input for a set
   */
  getRepsInput(setId: number): Locator {
    return this.page.getByTestId(`reps-input-${setId}`);
  }

  /**
   * Get the log checkbox for a set
   */
  getLogCheckbox(setId: number): Locator {
    return this.page.getByTestId(`log-checkbox-${setId}`);
  }

  /**
   * Log a set with specific reps and weight using inline inputs
   */
  async logSet(setId: number, reps: number, weight: number): Promise<void> {
    const weightInput = this.getWeightInput(setId);
    const repsInput = this.getRepsInput(setId);
    const checkbox = this.getLogCheckbox(setId);

    // Fill weight - use fill() which clears first, then wait for value to be set
    await weightInput.fill(String(weight));
    await expect(weightInput).toHaveValue(String(weight));

    // Fill reps - use fill() which clears first, then wait for value to be set
    await repsInput.fill(String(reps));
    await expect(repsInput).toHaveValue(String(reps));

    // Click the checkbox to log and wait for it to become checked
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    // Dismiss "all sets done" dialog if it appears (when logging the final set)
    await this.dismissAllSetsDoneDialog();
  }

  /**
   * Log a set using target values (just click checkbox, inputs already have targets)
   */
  async logSetWithTargets(setId: number): Promise<void> {
    const checkbox = this.getLogCheckbox(setId);
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    // Dismiss "all sets done" dialog if it appears (when logging the final set)
    await this.dismissAllSetsDoneDialog();
  }

  /**
   * Unlog a set (uncheck the checkbox)
   */
  async unlogSet(setId: number): Promise<void> {
    const checkbox = this.getLogCheckbox(setId);
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
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
   * Dismiss the "all sets done" dialog if it's visible
   */
  async dismissAllSetsDoneDialog(): Promise<void> {
    // Use a short timeout to check if dialog appears
    const dialog = this.allSetsDoneDialog;
    const isVisible = await dialog.isVisible().catch(() => false);
    if (isVisible) {
      // Click "Not Yet" button to dismiss
      await this.page.getByRole('button', { name: 'Not Yet' }).click();
      // Wait for dialog to close
      await expect(dialog).not.toBeVisible();
    }
  }

  /**
   * Get the current workout status text
   */
  async getWorkoutStatus(): Promise<string> {
    return this.workoutStatus.textContent() as Promise<string>;
  }

  /**
   * Check if set is logged (checkbox is checked)
   */
  async isSetLogged(setId: number): Promise<boolean> {
    const checkbox = this.getLogCheckbox(setId);
    const isChecked = await checkbox.isChecked();
    return isChecked;
  }

  /**
   * Get the actual values entered for a set
   */
  async getLoggedValues(
    setId: number
  ): Promise<{ reps: number; weight: number } | null> {
    const weightInput = this.getWeightInput(setId);
    const repsInput = this.getRepsInput(setId);

    try {
      const weightText = await weightInput.inputValue();
      const repsText = await repsInput.inputValue();

      return {
        reps: parseInt(repsText ?? '0', 10),
        weight: parseFloat(weightText ?? '0'),
      };
    } catch {
      return null;
    }
  }
}
