import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';
import type { CalendarDataResponse, CalendarDayData, CalendarActivity } from '../shared.js';
import { type ApiResponse } from '../__tests__/utils/index.js';

// Mock firebase before importing the handler
vi.mock('../firebase.js', () => ({
  getFirestoreDb: vi.fn(),
}));

// Mock app-check middleware
vi.mock('../middleware/app-check.js', () => ({
  requireAppCheck: (_req: unknown, _res: unknown, next: () => void): void => next(),
}));

// Mock service
const mockCalendarService = {
  getMonthData: vi.fn(),
};

vi.mock('../services/index.js', () => ({
  getCalendarService: (): typeof mockCalendarService => mockCalendarService,
}));

// Import after mocks
import { calendarApp } from './calendar.js';

// Helper to create test calendar activity
function createTestActivity(overrides: Partial<CalendarActivity> = {}): CalendarActivity {
  return {
    id: 'activity-1',
    type: 'workout',
    date: '2024-01-15',
    completedAt: '2024-01-15T10:00:00.000Z',
    summary: {
      dayName: 'Push Day',
      exerciseCount: 5,
      setsCompleted: 15,
      totalSets: 15,
      weekNumber: 1,
      isDeload: false,
    },
    ...overrides,
  };
}

// Helper to create test day data
function createTestDayData(date: string, activities: CalendarActivity[] = []): CalendarDayData {
  return {
    date,
    activities,
    summary: {
      totalActivities: activities.length,
      completedActivities: activities.filter(a => a.completedAt !== null).length,
      hasWorkout: activities.some(a => a.type === 'workout'),
      hasStretch: activities.some(a => a.type === 'stretch'),
      hasMeditation: activities.some(a => a.type === 'meditation'),
    },
  };
}

// Helper to create test calendar response
function createTestCalendarResponse(overrides: Partial<CalendarDataResponse> = {}): CalendarDataResponse {
  return {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    days: {},
    ...overrides,
  };
}

describe('Calendar Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /calendar/:year/:month', () => {
    it('should return calendar data for valid year and month', async () => {
      const activity = createTestActivity();
      const dayData = createTestDayData('2024-01-15', [activity]);
      const calendarData = createTestCalendarResponse({
        days: { '2024-01-15': dayData },
      });
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: calendarData,
      });
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 1, 0);
    });

    it('should return calendar data for December (month 12)', async () => {
      const calendarData = createTestCalendarResponse({
        startDate: '2024-12-01',
        endDate: '2024-12-31',
      });
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/12');

      expect(response.status).toBe(200);
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 12, 0);
    });

    it('should pass timezone offset to service', async () => {
      const calendarData = createTestCalendarResponse();
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1?tz=-480');

      expect(response.status).toBe(200);
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 1, -480);
    });

    it('should handle positive timezone offset', async () => {
      const calendarData = createTestCalendarResponse();
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1?tz=330');

      expect(response.status).toBe(200);
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 1, 330);
    });

    it('should return empty days when no activities exist', async () => {
      const calendarData = createTestCalendarResponse({ days: {} });
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: calendarData,
      });
    });

    it('should return calendar data with multiple activity types', async () => {
      const workoutActivity = createTestActivity({ id: 'w1', type: 'workout' });
      const stretchActivity: CalendarActivity = {
        id: 's1',
        type: 'stretch',
        date: '2024-01-15',
        completedAt: '2024-01-15T11:00:00.000Z',
        summary: {
          totalDurationSeconds: 600,
          regionsCompleted: 8,
          regionsSkipped: 0,
        },
      };
      const meditationActivity: CalendarActivity = {
        id: 'm1',
        type: 'meditation',
        date: '2024-01-15',
        completedAt: '2024-01-15T08:00:00.000Z',
        summary: {
          durationSeconds: 600,
          meditationType: 'basic-breathing',
        },
      };
      const dayData = createTestDayData('2024-01-15', [
        workoutActivity,
        stretchActivity,
        meditationActivity,
      ]);
      const calendarData = createTestCalendarResponse({
        days: { '2024-01-15': dayData },
      });
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response: Response = await request(calendarApp).get('/2024/1');
      const body = response.body as ApiResponse<CalendarDataResponse>;

      expect(response.status).toBe(200);
      const dayData15 = body.data?.days['2024-01-15'];
      expect(dayData15?.summary.hasWorkout).toBe(true);
      expect(dayData15?.summary.hasStretch).toBe(true);
      expect(dayData15?.summary.hasMeditation).toBe(true);
    });

    // Validation error tests

    it('should return 400 for invalid year (non-numeric)', async () => {
      const response = await request(calendarApp).get('/invalid/1');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid year parameter: must be a valid 4-digit year (1000-9999)',
        },
      });
    });

    it('should return 400 for year less than 1000', async () => {
      const response: Response = await request(calendarApp).get('/999/1');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.message).toContain('year');
    });

    it('should return 400 for year greater than 9999', async () => {
      const response: Response = await request(calendarApp).get('/10000/1');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid month (non-numeric)', async () => {
      const response = await request(calendarApp).get('/2024/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid month parameter: must be a number between 1 and 12',
        },
      });
    });

    it('should return 400 for month less than 1', async () => {
      const response: Response = await request(calendarApp).get('/2024/0');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.message).toContain('month');
    });

    it('should return 400 for month greater than 12', async () => {
      const response: Response = await request(calendarApp).get('/2024/13');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid timezone offset (non-numeric)', async () => {
      const response = await request(calendarApp).get('/2024/1?tz=invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid timezone offset: must be a number between -720 and 840',
        },
      });
    });

    it('should return 400 for timezone offset less than -720', async () => {
      const response: Response = await request(calendarApp).get('/2024/1?tz=-721');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.message).toContain('timezone');
    });

    it('should return 400 for timezone offset greater than 840', async () => {
      const response: Response = await request(calendarApp).get('/2024/1?tz=841');
      const body = response.body as ApiResponse;

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    // Edge cases for valid timezones

    it('should accept minimum valid timezone offset (-720)', async () => {
      const calendarData = createTestCalendarResponse();
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1?tz=-720');

      expect(response.status).toBe(200);
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 1, -720);
    });

    it('should accept maximum valid timezone offset (840)', async () => {
      const calendarData = createTestCalendarResponse();
      mockCalendarService.getMonthData.mockResolvedValue(calendarData);

      const response = await request(calendarApp).get('/2024/1?tz=840');

      expect(response.status).toBe(200);
      expect(mockCalendarService.getMonthData).toHaveBeenCalledWith(2024, 1, 840);
    });

    // Error handling

    it('should return 500 when service throws error', async () => {
      mockCalendarService.getMonthData.mockRejectedValue(new Error('Database error'));

      const response = await request(calendarApp).get('/2024/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get calendar data',
        },
      });
    });
  });
});
