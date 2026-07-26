/**
 * Integration Tests for Calendar API
 *
 * These tests run against the standalone API backed by the Firestore emulator.
 * Run with: npm run test:integration:emulator
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { type ApiResponse } from '../utils/index.js';
import { HEALTH_URL, integrationApiUrl } from './api-config.js';

const CALENDAR_URL = integrationApiUrl('calendar');

interface CalendarDay {
  date: string;
  activities: Array<{
    id: string;
    type: 'workout' | 'stretch' | 'meditation' | 'cycling';
    date: string;
    completedAt: string | null;
    summary: Record<string, unknown>;
  }>;
  summary: {
    totalActivities: number;
    completedActivities: number;
    hasWorkout: boolean;
    hasStretch: boolean;
    hasMeditation: boolean;
    hasCycling: boolean;
  };
}

interface CalendarDataResponse {
  startDate: string;
  endDate: string;
  days: Record<string, CalendarDay>;
}

interface ApiError {
  success: boolean;
  error: {
    code: string;
    message: string;
  };
}

async function checkApiRunning(): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

describe('Calendar API (Integration)', () => {
  beforeAll(async () => {
    const isRunning = await checkApiRunning();
    if (!isRunning) {
      throw new Error(
        'Standalone integration API is not running.\n' +
          'Run the suite with: npm run test:integration:emulator'
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
    expect(result.data.startDate).toBe(`${monthPrefix(year, month)}-01`);
    expect(result.data.endDate.startsWith(monthPrefix(year, month))).toBe(true);
    expect(result.data.days).toBeDefined();
    expect(Array.isArray(result.data.days)).toBe(false);
  });

  it('should get calendar data with timezone offset', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const tzOffset = now.getTimezoneOffset();

    const response = await fetch(
      `${CALENDAR_URL}/${year}/${month}?tz=${tzOffset}`
    );
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.startDate).toBe(`${monthPrefix(year, month)}-01`);
    expect(result.data.endDate.startsWith(monthPrefix(year, month))).toBe(true);
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
    for (const day of Object.values(result.data.days)) {
      expect(day.date).toBeDefined();
      expect(Array.isArray(day.activities)).toBe(true);
      expect(day.summary.totalActivities).toBe(day.activities.length);
      for (const activity of day.activities) {
        expect(activity.id).toBeDefined();
        expect(activity.date).toBe(day.date);
        expect(['workout', 'stretch', 'meditation', 'cycling']).toContain(
          activity.type
        );
      }
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
    expect(result.data.startDate).toBe(`${monthPrefix(futureYear, month)}-01`);
    expect(result.data.endDate.startsWith(monthPrefix(futureYear, month))).toBe(
      true
    );

    // Future months should have no activities
    for (const day of Object.values(result.data.days)) {
      expect(day.activities).toHaveLength(0);
    }
  });

  it('should get calendar data for January', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/1`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.startDate).toBe(`${year}-01-01`);
  });

  it('should get calendar data for December', async () => {
    const year = new Date().getFullYear();

    const response = await fetch(`${CALENDAR_URL}/${year}/12`);
    expect(response.status).toBe(200);

    const result = (await response.json()) as ApiResponse<CalendarDataResponse>;
    expect(result.success).toBe(true);
    expect(result.data.startDate).toBe(`${year}-12-01`);
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
      const response = await fetch(
        `${CALENDAR_URL}/${year}/${month}?tz=${offset}`
      );
      expect(response.status).toBe(200);

      const result =
        (await response.json()) as ApiResponse<CalendarDataResponse>;
      expect(result.success).toBe(true);
    }
  });
});
