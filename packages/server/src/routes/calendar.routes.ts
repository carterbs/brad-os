import { Router, type Request, type Response } from 'express';
import {
  createSuccessResponse,
  createErrorResponse,
  type CalendarDataResponse,
} from '@brad-os/shared';
import { getCalendarService } from '../services/index.js';

export const calendarRouter = Router();

/**
 * Validate year parameter - must be a valid 4-digit year (1000-9999)
 */
function isValidYear(value: string): boolean {
  const year = parseInt(value, 10);
  return !isNaN(year) && year >= 1000 && year <= 9999;
}

/**
 * Validate month parameter - must be 1-12
 */
function isValidMonth(value: string): boolean {
  const month = parseInt(value, 10);
  return !isNaN(month) && month >= 1 && month <= 12;
}

/**
 * GET /api/calendar/:year/:month
 * Get calendar data for a specific month.
 */
calendarRouter.get('/:year/:month', (req: Request, res: Response): void => {
  const yearParam = req.params['year'] ?? '';
  const monthParam = req.params['month'] ?? '';

  // Validate year
  if (!isValidYear(yearParam)) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid year parameter: must be a valid 4-digit year (1000-9999)'
      )
    );
    return;
  }

  // Validate month
  if (!isValidMonth(monthParam)) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid month parameter: must be a number between 1 and 12'
      )
    );
    return;
  }

  const year = parseInt(yearParam, 10);
  const month = parseInt(monthParam, 10);

  try {
    const service = getCalendarService();
    const data: CalendarDataResponse = service.getMonthData(year, month);
    res.json(createSuccessResponse(data));
  } catch (error) {
    console.error('Failed to get calendar data:', error);
    res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to get calendar data')
    );
  }
});
