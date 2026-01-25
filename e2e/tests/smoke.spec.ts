import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title).toContain('Lifting');
  });

  test('should display the app heading', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('h1').first();
    await expect(heading).toContainText('Today');
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to Activities hub
    await page.getByRole('link', { name: /activities/i }).click();
    await expect(page.locator('h1').first()).toContainText('Activities');

    // Navigate to Lifting (via activity card)
    await page.getByTestId('activity-card-lifting').click();
    await expect(page.locator('h1').first()).toContainText('Mesocycle');

    // Navigate to Exercises within Lifting nav
    await page.getByRole('link', { name: /exercises/i }).click();
    await expect(page.locator('h1').first()).toContainText('Exercise Library');

    // Navigate to Plans within Lifting nav
    await page.getByRole('link', { name: /plans/i }).click();
    await expect(page.locator('h1').first()).toContainText('My Plans');

    // Navigate back to Activities via Back button, then to Today via global nav
    await page.getByRole('button', { name: /back to activities/i }).click();
    await expect(page.locator('h1').first()).toContainText('Activities');
    await page.getByRole('link', { name: /today/i }).click();
    await expect(page.locator('h1').first()).toContainText('Today');
  });
});
