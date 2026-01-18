import { type Page, type Locator } from '@playwright/test';

/**
 * Base page class with common functionality
 */
export abstract class BasePage {
  constructor(protected page: Page) {}

  /**
   * Navigate to this page
   */
  abstract goto(): Promise<void>;

  /**
   * Wait for the page to be loaded and ready
   */
  abstract waitForLoad(): Promise<void>;

  /**
   * Get the main heading element
   */
  get heading(): Locator {
    return this.page.locator('h1').first();
  }

  /**
   * Click a button by its text
   */
  async clickButton(text: string): Promise<void> {
    await this.page.getByRole('button', { name: text }).click();
  }

  /**
   * Click a link by its text
   */
  async clickLink(text: string): Promise<void> {
    await this.page.getByRole('link', { name: text }).click();
  }

  /**
   * Fill an input field by its label
   */
  async fillInput(label: string, value: string): Promise<void> {
    await this.page.getByLabel(label).fill(value);
  }

  /**
   * Select an option from a dropdown by its label
   */
  async selectOption(label: string, value: string): Promise<void> {
    await this.page.getByLabel(label).selectOption(value);
  }

  /**
   * Wait for a toast/notification message
   */
  async waitForToast(text: string): Promise<void> {
    await this.page.getByText(text).waitFor({ state: 'visible' });
  }

  /**
   * Check if an element with specific text is visible
   */
  async isTextVisible(text: string): Promise<boolean> {
    const element = this.page.getByText(text).first();
    return element.isVisible();
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }
}
