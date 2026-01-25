import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calendarApi } from '../calendarApi';
import { NotFoundError, ApiClientError } from '../exerciseApi';
import type { CalendarDataResponse, CalendarDayData } from '@brad-os/shared';

describe('calendarApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getMonthData', () => {
    it('should return calendar data for a month', async () => {
      const mockDayData: CalendarDayData = {
        date: '2024-01-15',
        activities: [
          {
            id: 'workout-1',
            type: 'workout',
            date: '2024-01-15',
            completedAt: '2024-01-15T10:30:00Z',
            summary: {
              dayName: 'Push Day',
              exerciseCount: 5,
              setsCompleted: 15,
              totalSets: 15,
              weekNumber: 2,
              isDeload: false,
            },
          },
        ],
        summary: {
          totalActivities: 1,
          completedActivities: 1,
          hasWorkout: true,
          hasStretch: false,
          hasMeditation: false,
        },
      };

      const calendarResponse: CalendarDataResponse = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        days: {
          '2024-01-15': mockDayData,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: calendarResponse }),
      });

      const result = await calendarApi.getMonthData(2024, 1);

      expect(mockFetch).toHaveBeenCalledWith('/api/calendar/2024/1');
      expect(result).toEqual(calendarResponse);
      expect(result.days['2024-01-15']).toEqual(mockDayData);
    });

    it('should return empty days object when no activities', async () => {
      const calendarResponse: CalendarDataResponse = {
        startDate: '2024-02-01',
        endDate: '2024-02-29',
        days: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: calendarResponse }),
      });

      const result = await calendarApi.getMonthData(2024, 2);

      expect(mockFetch).toHaveBeenCalledWith('/api/calendar/2024/2');
      expect(result.days).toEqual({});
    });

    it('should handle multiple days with activities', async () => {
      const calendarResponse: CalendarDataResponse = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        days: {
          '2024-01-01': {
            date: '2024-01-01',
            activities: [
              {
                id: 'workout-1',
                type: 'workout',
                date: '2024-01-01',
                completedAt: '2024-01-01T09:00:00Z',
                summary: {
                  dayName: 'Push Day',
                  exerciseCount: 4,
                  setsCompleted: 12,
                  totalSets: 12,
                  weekNumber: 1,
                  isDeload: false,
                },
              },
            ],
            summary: {
              totalActivities: 1,
              completedActivities: 1,
              hasWorkout: true,
              hasStretch: false,
              hasMeditation: false,
            },
          },
          '2024-01-02': {
            date: '2024-01-02',
            activities: [
              {
                id: 'stretch-1',
                type: 'stretch',
                date: '2024-01-02',
                completedAt: '2024-01-02T08:00:00Z',
                summary: {
                  totalDurationSeconds: 600,
                  regionsCompleted: 5,
                  regionsSkipped: 0,
                },
              },
            ],
            summary: {
              totalActivities: 1,
              completedActivities: 1,
              hasWorkout: false,
              hasStretch: true,
              hasMeditation: false,
            },
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: calendarResponse }),
      });

      const result = await calendarApi.getMonthData(2024, 1);

      expect(Object.keys(result.days)).toHaveLength(2);
      expect(result.days['2024-01-01']?.summary.hasWorkout).toBe(true);
      expect(result.days['2024-01-02']?.summary.hasStretch).toBe(true);
    });

    it('should throw NotFoundError for invalid month', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Invalid month' },
          }),
      });

      await expect(calendarApi.getMonthData(2024, 13)).rejects.toThrow(
        NotFoundError
      );
    });

    it('should throw ApiClientError for server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Server error' },
          }),
      });

      await expect(calendarApi.getMonthData(2024, 1)).rejects.toThrow(
        ApiClientError
      );
    });

    it('should correctly format URL for different months', async () => {
      const calendarResponse: CalendarDataResponse = {
        startDate: '2024-12-01',
        endDate: '2024-12-31',
        days: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: calendarResponse }),
      });

      await calendarApi.getMonthData(2024, 12);

      expect(mockFetch).toHaveBeenCalledWith('/api/calendar/2024/12');
    });
  });
});
