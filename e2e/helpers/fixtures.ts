import { test as base } from '@playwright/test';
import { ApiHelper } from './api.js';
import { TodayPage } from './pages/today.page.js';
import { ExercisesPage } from './pages/exercises.page.js';
import { PlansPage } from './pages/plans.page.js';
import { MesoPage } from './pages/meso.page.js';
import { CalendarPage } from './pages/calendar.page.js';
import { BASE_PORT, PORT_SPACING } from '../global-setup.js';

/**
 * Get the base URL for a specific worker.
 * Each worker gets its own client instance on PORT and server on PORT+1.
 * The base URL points to the client which proxies API requests to the server.
 */
function getWorkerBaseUrl(workerIndex: number): string {
  const port = BASE_PORT + (workerIndex * PORT_SPACING);
  return `http://localhost:${port}`;
}

// Extend the base test with our custom fixtures
// Using WorkerFixtures for worker-scoped fixtures and TestFixtures for test-scoped
export const test = base.extend<
  {
    api: ApiHelper;
    todayPage: TodayPage;
    exercisesPage: ExercisesPage;
    plansPage: PlansPage;
    mesoPage: MesoPage;
    calendarPage: CalendarPage;
  },
  {
    workerBaseUrl: string;
  }
>({
  // Worker-specific base URL based on parallel worker index (worker-scoped)
  workerBaseUrl: [
    // eslint-disable-next-line no-empty-pattern, @typescript-eslint/explicit-function-return-type
    async ({}, use, workerInfo) => {
      const baseUrl = getWorkerBaseUrl(workerInfo.parallelIndex);
      await use(baseUrl);
    },
    { scope: 'worker' },
  ],

  // Override baseURL to use worker-specific URL (test-scoped, depends on worker fixture)
  baseURL: async ({ workerBaseUrl }, use) => {
    await use(workerBaseUrl);
  },

  api: async ({ request, workerBaseUrl }, use) => {
    const api = new ApiHelper(request, workerBaseUrl);
    await use(api);
  },

  // Pass workerBaseUrl to page objects so they can navigate to the correct server
  todayPage: async ({ page, workerBaseUrl }, use) => {
    const todayPage = new TodayPage(page, workerBaseUrl);
    await use(todayPage);
  },

  exercisesPage: async ({ page, workerBaseUrl }, use) => {
    const exercisesPage = new ExercisesPage(page, workerBaseUrl);
    await use(exercisesPage);
  },

  plansPage: async ({ page, workerBaseUrl }, use) => {
    const plansPage = new PlansPage(page, workerBaseUrl);
    await use(plansPage);
  },

  mesoPage: async ({ page, workerBaseUrl }, use) => {
    const mesoPage = new MesoPage(page, workerBaseUrl);
    await use(mesoPage);
  },

  calendarPage: async ({ page, workerBaseUrl }, use) => {
    const calendarPage = new CalendarPage(page, workerBaseUrl);
    await use(calendarPage);
  },
});

export { expect } from '@playwright/test';

// Test data factories
export const testData = {
  exercises: {
    benchPress: {
      name: 'E2E Bench Press',
      weightIncrement: 5,
    },
    squat: {
      name: 'E2E Squat',
      weightIncrement: 10,
    },
    deadlift: {
      name: 'E2E Deadlift',
      weightIncrement: 10,
    },
    overheadPress: {
      name: 'E2E Overhead Press',
      weightIncrement: 2.5,
    },
  },

  plans: {
    simple: {
      name: 'E2E Simple Plan',
      durationWeeks: 6,
    },
    fullBody: {
      name: 'E2E Full Body Plan',
      durationWeeks: 6,
    },
  },

  /**
   * Get the current day of week (0-6)
   */
  getTodayDayOfWeek(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
    return new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  },

  /**
   * Format a date as YYYY-MM-DD in local timezone.
   * This avoids UTC conversion issues with toISOString().
   */
  formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Get a date string for the start of the current week (Sunday)
   */
  getWeekStartDate(): string {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return this.formatLocalDate(sunday);
  },

  /**
   * Get today's date as YYYY-MM-DD
   */
  getTodayDate(): string {
    return this.formatLocalDate(new Date());
  },

  /**
   * Generate a unique name with timestamp
   */
  uniqueName(prefix: string): string {
    return `${prefix} ${Date.now()}`;
  },
};
