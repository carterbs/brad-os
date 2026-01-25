import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

/**
 * Page object for the Mesocycle tab/page (/lifting)
 */
export class MesoPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto(this.getFullUrl('/lifting'));
  }

  async waitForLoad(): Promise<void> {
    // Wait for either the form, the active mesocycle card, or the no-plans message
    await this.page.waitForSelector(
      '[data-testid="start-mesocycle-form"], [data-testid="mesocycle-status-card"], [data-testid="no-plans-message"]'
    );
  }

  // ============ Locators ============

  get startMesocycleForm(): Locator {
    return this.page.getByTestId('start-mesocycle-form');
  }

  get mesocycleStatusCard(): Locator {
    return this.page.getByTestId('mesocycle-status-card');
  }

  get planSelect(): Locator {
    return this.page.getByTestId('plan-select');
  }

  get startDateInput(): Locator {
    return this.page.getByTestId('start-date-input');
  }

  get startMesocycleButton(): Locator {
    return this.page.getByTestId('start-mesocycle-button');
  }

  get completeMesocycleButton(): Locator {
    return this.page.getByTestId('complete-mesocycle-button');
  }

  get cancelMesocycleButton(): Locator {
    return this.page.getByTestId('cancel-mesocycle-button');
  }

  get noPlansMessage(): Locator {
    return this.page.getByTestId('no-plans-message');
  }

  get formError(): Locator {
    return this.page.getByTestId('form-error');
  }

  // ============ Actions ============

  /**
   * Check if there's an active mesocycle
   */
  async hasActiveMesocycle(): Promise<boolean> {
    return this.mesocycleStatusCard.isVisible();
  }

  /**
   * Start a new mesocycle
   */
  async startMesocycle(planName: string, startDate?: string): Promise<void> {
    await expect(this.startMesocycleForm).toBeVisible();

    // Select the plan
    await this.planSelect.click();
    await this.page.getByRole('option', { name: planName }).click();

    // Set start date if provided
    if (startDate !== undefined && startDate !== '') {
      await this.startDateInput.fill(startDate);
    }

    // Click start
    await this.startMesocycleButton.click();

    // Wait for the mesocycle to be created
    await expect(this.mesocycleStatusCard).toBeVisible();
  }

  /**
   * Get the current week number from the status card progress text.
   * The progress text format is: "Week {n} of 7 · {x}/{y} workouts"
   */
  async getCurrentWeek(): Promise<number> {
    const progressText = await this.mesocycleStatusCard
      .locator('[data-testid="mesocycle-progress-text"]')
      .textContent();
    const match = progressText?.match(/Week (\d+) of/);
    return match ? parseInt(match[1] ?? '0', 10) : 0;
  }

  /**
   * Get the mesocycle status
   */
  async getMesocycleStatus(): Promise<string> {
    const status = await this.mesocycleStatusCard
      .locator('[data-testid="mesocycle-status"]')
      .textContent();
    return status?.toLowerCase() ?? '';
  }

  /**
   * Complete the current mesocycle
   */
  async completeMesocycle(): Promise<void> {
    await this.completeMesocycleButton.click();

    // Handle confirmation if needed
    const confirmButton = this.page.getByRole('button', {
      name: /confirm|complete/i,
    });
    const isConfirmVisible = await confirmButton.isVisible();
    if (isConfirmVisible) {
      await confirmButton.click();
    }

    // Wait for status to change
    await expect(
      this.mesocycleStatusCard.locator('[data-testid="mesocycle-status"]')
    ).toContainText(/completed/i);
  }

  /**
   * Cancel the current mesocycle
   */
  async cancelMesocycle(): Promise<void> {
    await this.cancelMesocycleButton.click();

    // Wait for the form to reappear (no active mesocycle)
    await expect(this.startMesocycleForm).toBeVisible();
  }

  /**
   * Get a week card by week number
   */
  getWeekCard(weekNumber: number): Locator {
    return this.page.getByTestId(`week-card-${weekNumber}`);
  }

  /**
   * Check if a specific week is marked as current (indicated by accent left border)
   */
  async isCurrentWeek(weekNumber: number): Promise<boolean> {
    const weekCard = this.getWeekCard(weekNumber);
    const borderLeft = await weekCard.evaluate(
      (el) => window.getComputedStyle(el).borderLeftWidth
    );
    // Current week has 3px border, non-current has 1px
    return borderLeft === '3px';
  }

  /**
   * Get workout summary from a week card.
   * Waits for the summary element to be visible before reading.
   */
  async getWeekWorkoutCount(weekNumber: number): Promise<{
    total: number;
    completed: number;
  }> {
    const weekCard = this.getWeekCard(weekNumber);
    const summaryLocator = weekCard.locator('[data-testid="workout-summary"]');

    // Wait for the element to be visible
    await expect(summaryLocator).toBeVisible();

    const summaryText = await summaryLocator.textContent();

    // Parse "1 / 1 completed" (format: "completed / total completed")
    const match = summaryText?.match(/(\d+)\s*\/\s*(\d+)/);
    if (match !== null && match !== undefined) {
      const completedStr = match[1] ?? '0';
      const totalStr = match[2] ?? '0';
      return {
        completed: parseInt(completedStr, 10),
        total: parseInt(totalStr, 10),
      };
    }

    return { total: 0, completed: 0 };
  }

  /**
   * Wait for a week to show at least the expected number of completed workouts.
   * Useful after completing a workout to ensure the UI has updated.
   */
  async waitForCompletedWorkouts(
    weekNumber: number,
    minCompleted: number
  ): Promise<void> {
    const weekCard = this.getWeekCard(weekNumber);
    const summaryLocator = weekCard.locator('[data-testid="workout-summary"]');

    // Wait for the text to include at least minCompleted
    await expect(summaryLocator).toContainText(
      new RegExp(`^${minCompleted}\\s*/`),
      { timeout: 10000 }
    );
  }

  /**
   * Click on a workout to navigate to it
   */
  async clickWorkout(weekNumber: number, workoutIndex = 0): Promise<void> {
    const weekCard = this.getWeekCard(weekNumber);
    const workoutItems = weekCard.locator('[data-testid="workout-item"]');
    await workoutItems.nth(workoutIndex).click();
  }

  /**
   * Check if deload badge is shown for a week
   */
  async isDeloadWeek(weekNumber: number): Promise<boolean> {
    const weekCard = this.getWeekCard(weekNumber);
    const deloadBadge = weekCard.locator('[data-testid="deload-badge"]');
    return deloadBadge.isVisible();
  }
}
