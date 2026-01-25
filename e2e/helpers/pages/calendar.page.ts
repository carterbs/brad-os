import { type Locator, expect } from '@playwright/test';
import { BasePage } from './base.page.js';

/**
 * Page object for the History page (/history)
 */
export class CalendarPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto(this.getFullUrl('/history'));
  }

  async waitForLoad(): Promise<void> {
    await this.page.waitForSelector('h1:has-text("History")');
  }

  // ============ Locators ============

  get calendar(): Locator {
    return this.page.locator('.react-calendar');
  }

  get prevMonthButton(): Locator {
    return this.page.getByRole('button', { name: '< Prev' });
  }

  get nextMonthButton(): Locator {
    return this.page.getByRole('button', { name: 'Next >' });
  }

  get monthYearButton(): Locator {
    // The month/year navigation button (e.g., "January 2026")
    return this.page.locator('.react-calendar__navigation__label');
  }

  get dayDetailDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  get dialogCloseButton(): Locator {
    return this.page.getByRole('button', { name: 'Close' });
  }

  // ============ Actions ============

  /**
   * Get the currently displayed month and year
   */
  async getDisplayedMonthYear(): Promise<string> {
    const button = this.monthYearButton;
    return (await button.textContent()) ?? '';
  }

  /**
   * Navigate to the previous month
   */
  async goToPreviousMonth(): Promise<void> {
    await this.prevMonthButton.click();
  }

  /**
   * Navigate to the next month
   */
  async goToNextMonth(): Promise<void> {
    await this.nextMonthButton.click();
  }

  /**
   * Click on a specific day in the calendar
   */
  async clickDay(dayNumber: number): Promise<void> {
    // Find the day tile with the specific number
    // react-calendar uses abbr with aria-label containing the full date
    const dayButton = this.page.getByRole('button', { name: new RegExp(`\\b${dayNumber}\\b`) }).first();
    await dayButton.click();
  }

  /**
   * Click on a specific date (handles month boundary days)
   */
  async clickDate(date: Date): Promise<void> {
    // react-calendar uses format like "January 24, 2026" for aria-label
    const monthName = date.toLocaleDateString('en-US', { month: 'long' });
    const day = date.getDate();
    const year = date.getFullYear();
    // Use a regex pattern to match the date regardless of day-of-week prefix
    const datePattern = new RegExp(`${monthName}\\s+${day},\\s+${year}`);
    const dayButton = this.page.getByRole('button', { name: datePattern });
    await dayButton.click();
  }

  /**
   * Check if the day detail dialog is visible
   */
  async isDayDialogVisible(): Promise<boolean> {
    return this.dayDetailDialog.isVisible();
  }

  /**
   * Close the day detail dialog
   */
  async closeDayDialog(): Promise<void> {
    await this.dialogCloseButton.click();
    await expect(this.dayDetailDialog).not.toBeVisible();
  }

  /**
   * Get the title of the day detail dialog
   */
  async getDialogTitle(): Promise<string> {
    const heading = this.dayDetailDialog.getByRole('heading');
    return (await heading.textContent()) ?? '';
  }

  /**
   * Check if an activity dot is visible for a specific date
   * The dots have data-testid attributes like "workout-dot-2026-01-24"
   */
  async hasActivityDot(date: Date, activityType: 'workout' | 'stretch' | 'meditation'): Promise<boolean> {
    const dateStr = this.formatDateKey(date);
    const dot = this.page.locator(`[data-testid="${activityType}-dot-${dateStr}"]`);
    return dot.isVisible();
  }

  /**
   * Format a date to YYYY-MM-DD
   */
  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get all activity items in the day detail dialog
   */
  getActivityItems(): Locator {
    // Activity items have data-testid="activity-item-{id}" pattern
    return this.dayDetailDialog.locator('[data-testid^="activity-item-"]');
  }

  /**
   * Get an activity item by index
   */
  getActivityItem(index: number): Locator {
    return this.getActivityItems().nth(index);
  }

  /**
   * Click on an activity item in the dialog
   */
  async clickActivityItem(index: number): Promise<void> {
    await this.getActivityItem(index).click();
  }

  /**
   * Check if the "No activities" message is shown in the dialog
   */
  async hasNoActivitiesMessage(): Promise<boolean> {
    const message = this.dayDetailDialog.getByText('No activities on this day');
    return message.isVisible();
  }

  /**
   * Get the number of activity items in the dialog
   */
  async getActivityCount(): Promise<number> {
    return this.getActivityItems().count();
  }

  /**
   * Check if a workout activity is in the dialog
   */
  async hasWorkoutActivity(): Promise<boolean> {
    const workoutBadge = this.dayDetailDialog.getByText('Workout');
    return workoutBadge.isVisible();
  }

  /**
   * Check if a stretch activity is in the dialog
   */
  async hasStretchActivity(): Promise<boolean> {
    const stretchBadge = this.dayDetailDialog.getByText('Stretch');
    return stretchBadge.isVisible();
  }

  /**
   * Wait for activity dot to appear on a specific date
   */
  async waitForActivityDot(date: Date, activityType: 'workout' | 'stretch' | 'meditation'): Promise<void> {
    const dateStr = this.formatDateKey(date);
    const dot = this.page.locator(`[data-testid="${activityType}-dot-${dateStr}"]`);
    await expect(dot).toBeVisible({ timeout: 5000 });
  }

  /**
   * Wait for any activity indicators to load on the calendar (after data fetch)
   */
  async waitForCalendarDataLoaded(): Promise<void> {
    // Wait for loading state to complete - calendar shows dots after React Query fetches
    // We wait for either an activity dot OR confirm the calendar tiles are interactive
    await this.page.waitForFunction(() => {
      // Check if any activity dots exist OR if the calendar is done loading
      const dots = document.querySelectorAll('[data-testid$="-dot-"]');
      const calendar = document.querySelector('.react-calendar');
      return dots.length > 0 || (calendar && !document.querySelector('[data-loading="true"]'));
    }, { timeout: 5000 }).catch(() => {
      // If no dots appear, that's fine - might be empty calendar
    });
  }
}
