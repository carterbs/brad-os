import { test, expect } from '../helpers/fixtures.js';

test.describe('Calendar View', () => {
  // Run serially to avoid database conflicts between parallel tests
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ api }) => {
    // Reset database before each test
    await api.resetDatabase();
  });

  test.describe('basic navigation', () => {
    test('should display the calendar page', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      await expect(calendarPage.heading).toContainText('Calendar');
      await expect(calendarPage.calendar).toBeVisible();
    });

    test('should show current month by default', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const now = new Date();
      const expectedMonth = now.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });

      const displayedMonth = await calendarPage.getDisplayedMonthYear();
      expect(displayedMonth).toContain(expectedMonth);
    });

    test('should navigate to previous month', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const initialMonth = await calendarPage.getDisplayedMonthYear();
      await calendarPage.goToPreviousMonth();
      const newMonth = await calendarPage.getDisplayedMonthYear();

      expect(newMonth).not.toBe(initialMonth);
    });

    test('should navigate to next month', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const initialMonth = await calendarPage.getDisplayedMonthYear();
      await calendarPage.goToNextMonth();
      const newMonth = await calendarPage.getDisplayedMonthYear();

      expect(newMonth).not.toBe(initialMonth);
    });

    test('should navigate via bottom nav', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: /calendar/i }).click();
      await expect(page.locator('h1').first()).toContainText('Calendar');
    });
  });

  test.describe('day detail dialog', () => {
    test('should open dialog when clicking a day', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      // Click on today
      const today = new Date();
      await calendarPage.clickDate(today);

      expect(await calendarPage.isDayDialogVisible()).toBe(true);
    });

    test('should show "No activities" for empty days', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      expect(await calendarPage.hasNoActivitiesMessage()).toBe(true);
    });

    test('should close dialog when clicking close button', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);
      expect(await calendarPage.isDayDialogVisible()).toBe(true);

      await calendarPage.closeDayDialog();
      expect(await calendarPage.isDayDialogVisible()).toBe(false);
    });
  });

  test.describe('with completed workout', () => {
    test.beforeEach(async ({ api }) => {
      // Set up a workout scenario and complete it
      const { mesocycle } = await api.setupWorkoutScenario('E2E Bench Press');

      // Get today's workout and complete it
      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout) {
        await api.completeWorkoutViaApi(workout.id);
      }
    });

    test('should show workout in day dialog', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      expect(await calendarPage.hasWorkoutActivity()).toBe(true);
      expect(await calendarPage.getActivityCount()).toBeGreaterThanOrEqual(1);
    });

    test('should navigate to workout detail when clicking workout activity', async ({
      calendarPage,
      page,
    }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      // Click the first activity (should be the workout)
      await calendarPage.clickActivityItem(0);

      // Should navigate to workout detail page
      await expect(page).toHaveURL(/\/workouts\/\d+/);
    });
  });

  test.describe('with completed stretch session', () => {
    test.beforeEach(async ({ api }) => {
      // Create a stretch session for today
      await api.createQuickStretchSession();
    });

    test('should show stretch in day dialog', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      expect(await calendarPage.hasStretchActivity()).toBe(true);
      expect(await calendarPage.getActivityCount()).toBeGreaterThanOrEqual(1);
    });

    test('should close dialog when clicking stretch activity (no detail page)', async ({
      calendarPage,
      page,
    }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      const urlBefore = page.url();
      await calendarPage.clickActivityItem(0);

      // Dialog should close but we stay on calendar
      // (stretch has no detail page)
      await expect(page).toHaveURL(/\/calendar/);
    });
  });

  test.describe('with multiple activities', () => {
    test.beforeEach(async ({ api }) => {
      // Set up a workout scenario and complete it
      await api.setupWorkoutScenario('E2E Bench Press');
      const workout = await api.getTodaysWorkout();
      if (workout) {
        await api.completeWorkoutViaApi(workout.id);
      }

      // Also create a stretch session
      await api.createQuickStretchSession();
    });

    test('should show both workout and stretch in day dialog', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const today = new Date();
      await calendarPage.clickDate(today);

      expect(await calendarPage.hasWorkoutActivity()).toBe(true);
      expect(await calendarPage.hasStretchActivity()).toBe(true);
      expect(await calendarPage.getActivityCount()).toBe(2);
    });
  });

  test.describe('calendar API', () => {
    test('should return calendar data for current month', async ({ api }) => {
      const now = new Date();
      const data = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);

      expect(data.startDate).toBeDefined();
      expect(data.endDate).toBeDefined();
      expect(data.days).toBeDefined();
    });

    test('should include completed workout in calendar data', async ({ api }) => {
      // Set up and complete a workout
      await api.setupWorkoutScenario('E2E Bench Press');
      const workout = await api.getTodaysWorkout();
      if (workout) {
        await api.completeWorkoutViaApi(workout.id);
      }

      const now = new Date();
      const data = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);

      // Today's date should have activities
      const todayStr = now.toISOString().split('T')[0];
      expect(data.days).toHaveProperty(todayStr ?? '');
    });

    test('should include stretch session in calendar data', async ({ api }) => {
      // Create a stretch session
      await api.createQuickStretchSession();

      const now = new Date();
      const data = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);

      // Today's date should have activities
      const todayStr = now.toISOString().split('T')[0];
      expect(data.days).toHaveProperty(todayStr ?? '');
    });
  });
});
