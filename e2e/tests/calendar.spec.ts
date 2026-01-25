import { test, expect } from '../helpers/fixtures.js';

test.describe('Calendar View', () => {
  // Run serially to avoid database conflicts between parallel tests
  // Parallel OK: each worker has isolated database

  test.beforeEach(async ({ api }) => {
    // Reset database before each test
    await api.resetDatabase();
  });

  test.describe('basic navigation', () => {
    test('should display the calendar page', async ({ calendarPage }) => {
      await calendarPage.goto();
      await calendarPage.waitForLoad();

      await expect(calendarPage.heading).toContainText('History');
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
      await page.getByRole('link', { name: /history/i }).click();
      await expect(page.locator('h1').first()).toContainText('History');
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
      await api.setupWorkoutScenario('E2E Bench Press');

      // Get today's workout and complete it
      const workout = await api.getTodaysWorkout();
      expect(workout).not.toBeNull();
      if (workout) {
        await api.completeWorkoutViaApi(workout.id);
      }
    });

    test('should show workout in day dialog', async ({ calendarPage, api }) => {
      // Get calendar data and find which date has the workout
      // (Use UTC date since server stores completed_at in UTC)
      const now = new Date();
      const calendarData = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);

      // Find the date that has workout activity
      const workoutDate = Object.keys(calendarData.days).find(dateKey => {
        const day = calendarData.days[dateKey] as { activities?: Array<{ type: string }> };
        return day.activities?.some(a => a.type === 'workout');
      });
      expect(workoutDate).toBeDefined();

      await calendarPage.goto();
      await calendarPage.waitForLoad();

      // Click on the date that has the workout (parse the date string)
      const [year, month, day] = (workoutDate ?? '').split('-').map(Number);
      const dateToClick = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

      // Wait for workout dot to appear before clicking
      await calendarPage.waitForActivityDot(dateToClick, 'workout');
      await calendarPage.clickDate(dateToClick);

      expect(await calendarPage.hasWorkoutActivity()).toBe(true);
      expect(await calendarPage.getActivityCount()).toBeGreaterThanOrEqual(1);
    });

    test('should navigate to workout detail when clicking workout activity', async ({
      calendarPage,
      page,
      api,
    }) => {
      // Get calendar data and find which date has the workout (UTC date)
      const now = new Date();
      const calendarData = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);
      const workoutDate = Object.keys(calendarData.days).find(dateKey => {
        const day = calendarData.days[dateKey] as { activities?: Array<{ type: string }> };
        return day.activities?.some(a => a.type === 'workout');
      });
      expect(workoutDate).toBeDefined();

      await calendarPage.goto();
      await calendarPage.waitForLoad();

      // Click on the date that has the workout
      const [year, month, day] = (workoutDate ?? '').split('-').map(Number);
      const dateToClick = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

      // Wait for workout dot to appear before clicking
      await calendarPage.waitForActivityDot(dateToClick, 'workout');
      await calendarPage.clickDate(dateToClick);

      // Click the first activity (should be the workout)
      await calendarPage.clickActivityItem(0);

      // Should navigate to workout detail page
      await expect(page).toHaveURL(/\/lifting\/workouts\/\d+/);
    });
  });

  test.describe('with completed stretch session', () => {
    test.beforeEach(async ({ api }) => {
      // Create a stretch session for today
      await api.createQuickStretchSession();
    });

    test('should show stretch in day dialog', async ({ calendarPage, api }) => {
      const now = new Date();
      const calendarData = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);
      const stretchDate = Object.keys(calendarData.days).find(dateKey => {
        const day = calendarData.days[dateKey] as { activities?: Array<{ type: string }> };
        return day.activities?.some(a => a.type === 'stretch');
      });
      expect(stretchDate).toBeDefined();

      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const [year, month, day] = (stretchDate ?? '').split('-').map(Number);
      const dateToClick = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

      // Wait for stretch dot to appear before clicking
      await calendarPage.waitForActivityDot(dateToClick, 'stretch');
      await calendarPage.clickDate(dateToClick);

      expect(await calendarPage.hasStretchActivity()).toBe(true);
      expect(await calendarPage.getActivityCount()).toBeGreaterThanOrEqual(1);
    });

    test('should close dialog when clicking stretch activity (no detail page)', async ({
      calendarPage,
      page,
      api,
    }) => {
      const now = new Date();
      const calendarData = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);
      const stretchDate = Object.keys(calendarData.days).find(dateKey => {
        const day = calendarData.days[dateKey] as { activities?: Array<{ type: string }> };
        return day.activities?.some(a => a.type === 'stretch');
      });
      expect(stretchDate).toBeDefined();

      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const [year, month, day] = (stretchDate ?? '').split('-').map(Number);
      const dateToClick = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

      // Wait for stretch dot to appear before clicking
      await calendarPage.waitForActivityDot(dateToClick, 'stretch');
      await calendarPage.clickDate(dateToClick);

      await calendarPage.clickActivityItem(0);

      // Dialog should close but we stay on history page (stretch has no detail page)
      await expect(page).toHaveURL(/\/history/);
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

    test('should show both workout and stretch in day dialog', async ({ calendarPage, api }) => {
      const now = new Date();
      const calendarData = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);
      // Find a date with both activities
      const activityDate = Object.keys(calendarData.days).find(dateKey => {
        const day = calendarData.days[dateKey] as { activities?: Array<{ type: string }> };
        return day.activities && day.activities.length >= 2;
      });
      expect(activityDate).toBeDefined();

      await calendarPage.goto();
      await calendarPage.waitForLoad();

      const [year, month, day] = (activityDate ?? '').split('-').map(Number);
      const dateToClick = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);

      // Wait for both activity dots to appear before clicking
      await calendarPage.waitForActivityDot(dateToClick, 'workout');
      await calendarPage.waitForActivityDot(dateToClick, 'stretch');
      await calendarPage.clickDate(dateToClick);

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

      // Today's date should have activities (use local date, not UTC)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      expect(data.days).toHaveProperty(todayStr);
    });

    test('should include stretch session in calendar data', async ({ api }) => {
      // Create a stretch session
      await api.createQuickStretchSession();

      const now = new Date();
      const data = await api.getCalendarMonth(now.getFullYear(), now.getMonth() + 1);

      // Today's date should have activities (use local date, not UTC)
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      expect(data.days).toHaveProperty(todayStr);
    });
  });
});
