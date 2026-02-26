import { type Request, type Response } from 'express';
import { error as logError } from 'firebase-functions/logger';
import {
  createSuccessResponse,
  createErrorResponse,
  type CalendarDataResponse,
} from '../shared.js';
import { getCalendarService } from '../services/index.js';
import { errorHandler } from '../middleware/error-handler.js';
import { createBaseApp } from '../middleware/create-resource-router.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  parseCalendarMonth,
  parseCalendarTimezoneOffset,
  parseCalendarYear,
} from '../schemas/calendar.schema.js';

const app = createBaseApp('calendar');

/**
 * GET /calendar/:year/:month
 * Get calendar data for a specific month.
 * @query tz - Optional timezone offset in minutes (from Date.getTimezoneOffset())
 */
app.get('/:year/:month', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const yearParam = req.params['year'] ?? '';
  const monthParam = req.params['month'] ?? '';
  const tzParam = req.query['tz'] as string | undefined;
  const year = parseCalendarYear(yearParam);
  const month = parseCalendarMonth(monthParam);
  const timezoneOffset = parseCalendarTimezoneOffset(tzParam);

  // Validate year
  if (year === null) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid year parameter: must be a valid 4-digit year (1000-9999)'
      )
    );
    return;
  }

  // Validate month
  if (month === null) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid month parameter: must be a number between 1 and 12'
      )
    );
    return;
  }

  // Validate timezone offset
  if (timezoneOffset === null) {
    res.status(400).json(
      createErrorResponse(
        'VALIDATION_ERROR',
        'Invalid timezone offset: must be a number between -720 and 840'
      )
    );
    return;
  }

  try {
    const service = getCalendarService();
    const data: CalendarDataResponse = await service.getMonthData(year, month, timezoneOffset);
    res.json(createSuccessResponse(data));
  } catch (error) {
    logError('Failed to get calendar data:', error);
    res.status(500).json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to get calendar data')
    );
  }
}));

// Error handler must be last
app.use(errorHandler);

export const calendarApp = app;
