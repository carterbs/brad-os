/**
 * Integration Tests for Calendar API
 *
 * These tests run against the Firebase emulator.
 * Prerequisites:
 * - Emulator running: npm run emulators:fresh
 * - Run tests: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';

const FUNCTIONS_URL = 'http://127.0.0.1:5001/brad-os/us-central1';
const HEALTH_URL = `${FUNCTIONS_URL}/devHealth`;
const CALENDAR_URL = `${FUNCTIONS_URL}/devCalendar`;

interface CalendarDay {
  date: string;
  workouts: Array<{
    id: string;
    status: string;
    day_name: string;
  }>;
  stretching: Array<{
    id: string;
    totalDurationSeconds: number;
    regionsCompleted: number;
  }>;
  meditation: Array<{
    id: string;
    sessionType: string;
    actualDurationSeconds: number;
    completedFully: boolean;
  }>;
}

interface CalendarDataResponse {
  year: number;
  month: number;
  days: CalendarDay[];
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Calendar API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkEmulatorRunning();
    if (!isRunning) {
      throw new Error(
        'Firebase emulator is not running.\n' +
          'Start it with: npm run emulators:fresh\n' +
          'Then run tests with: npm run test:integration'
      );
    }
  });

  it('should get calendar data for current month', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const response = await fetch(`${CALENDAR_URL}/${year}/${month}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.year).toBe(year);
    expect(result.data.month).toBe(month);
    expect(result.data.days).toBeDefined();
    expect(Array.isArray(result.data.days)).toBe(true);
  });

  it('should get calendar data with timezone offset', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const tzOffset = now.getTimezoneOffset();

    const response = await fetch(`${CALENDAR_URL}/${year}/${month}?tz=${tzOffset}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.year).toBe(year);
    expect(result.data.month).toBe(month);
  });

  it('should include all activity types in calendar data', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const response = await fetch(`${CALENDAR_URL}/${year}/${month}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);

    // Check that days have the expected structure
    for (const day of result.data.days) {
      expect(day.date).toBeDefined();
      expect(day.workouts).toBeDefined();
      expect(Array.isArray(day.workouts)).toBe(true);
      expect(day.stretching).toBeDefined();
      expect(Array.isArray(day.stretching)).toBe(true);
      expect(day.meditation).toBeDefined();
      expect(Array.isArray(day.meditation)).toBe(true);
    }
  });

  it('should return empty days for future month', async () => {
    const now = new Date();
    const futureYear = now.getFullYear() + 1;
    const month = 6; // June of next year

    const response = await fetch(`${CALENDAR_URL}/${futureYear}/${month}`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.year).toBe(futureYear);
    expect(result.data.month).toBe(month);

    // Future months should have no activities
    for (const day of result.data.days) {
      expect(day.workouts).toHaveLength(0);
      expect(day.stretching).toHaveLength(0);
      expect(day.meditation).toHaveLength(0);
    }
  });

  it('should get calendar data for January', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/1`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.month).toBe(1);
  });

  it('should get calendar data for December', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/12`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.month).toBe(12);
  });

  it('should validate year parameter - invalid year', async () => {
    const response = await fetch(`${CALENDAR_URL}/invalid/6`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate month parameter - month 0', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/0`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate month parameter - month 13', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/13`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate month parameter - negative month', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/-1`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate timezone offset - too negative', async () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    const response = await fetch(`${CALENDAR_URL}/${year}/${month}?tz=-1000`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should validate timezone offset - too positive', async () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    const response = await fetch(`${CALENDAR_URL}/${year}/${month}?tz=1000`);
    expect(response.status).toBe(400);

    const result = (await response.json()) as ApiError;
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('should accept valid timezone offsets', async () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    // Test common timezone offsets
    const offsets = [
      -720, // UTC-12
      -480, // UTC-8 (Pacific)
      -300, // UTC-5 (Eastern)
      0, // UTC
      60, // UTC+1
      330, // UTC+5:30 (India)
      540, // UTC+9 (Japan)
      840, // UTC+14
    ];

    for (const offset of offsets) {
      const response = await fetch(`${CALENDAR_URL}/${year}/${month}?tz=${offset}`);
      expect(response.status).toBe(200);

      const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
      expect(result.success).toBe(true);
    }
  });
});
