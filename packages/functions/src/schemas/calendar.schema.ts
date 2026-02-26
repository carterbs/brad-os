import { z } from 'zod';

const intLikeStringSchema = z.string().regex(/^-?\d+$/);

export const calendarYearParamSchema = intLikeStringSchema.refine(
  (value) => {
    const year = Number.parseInt(value, 10);
    return year >= 1000 && year <= 9999;
  },
  { message: 'Invalid year parameter: must be a valid 4-digit year (1000-9999)' },
);

export const calendarMonthParamSchema = intLikeStringSchema.refine(
  (value) => {
    const month = Number.parseInt(value, 10);
    return month >= 1 && month <= 12;
  },
  { message: 'Invalid month parameter: must be a number between 1 and 12' },
);

export const calendarTimezoneOffsetQuerySchema = intLikeStringSchema.refine(
  (value) => {
    const tz = Number.parseInt(value, 10);
    return tz >= -720 && tz <= 840;
  },
  { message: 'Invalid timezone offset: must be a number between -720 and 840' },
).optional();

function parseIntOrNull(schema: z.ZodType<string | undefined>, value: string | undefined): number | null {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    return null;
  }
  const parsed = Number.parseInt(result.data, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseCalendarYear(value: string): number | null {
  return parseIntOrNull(calendarYearParamSchema, value);
}

export function parseCalendarMonth(value: string): number | null {
  return parseIntOrNull(calendarMonthParamSchema, value);
}

export function parseCalendarTimezoneOffset(value: string | undefined): number | null {
  if (value === undefined) return 0;
  return parseIntOrNull(calendarTimezoneOffsetQuerySchema, value);
}
