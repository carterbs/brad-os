import { describe, expect, it } from 'vitest';
import {
  calendarMonthParamSchema,
  calendarTimezoneOffsetQuerySchema,
  calendarYearParamSchema,
  parseCalendarMonth,
  parseCalendarTimezoneOffset,
  parseCalendarYear,
} from './calendar.schema.js';

describe('calendar schema', () => {
  describe('year', () => {
    it('accepts 4-digit boundary values and rejects out-of-range values', () => {
      expect(calendarYearParamSchema.safeParse('1000').success).toBe(true);
      expect(calendarYearParamSchema.safeParse('9999').success).toBe(true);
      expect(calendarYearParamSchema.safeParse('999').success).toBe(false);
      expect(calendarYearParamSchema.safeParse('10000').success).toBe(false);
    });

    it('rejects non-numeric input and parses valid input to integer', () => {
      expect(calendarYearParamSchema.safeParse('abcd').success).toBe(false);
      expect(parseCalendarYear('2026')).toBe(2026);
    });
  });

  describe('month', () => {
    it('accepts 1..12 and rejects 0, 13, non-numeric input', () => {
      expect(calendarMonthParamSchema.safeParse('1').success).toBe(true);
      expect(calendarMonthParamSchema.safeParse('12').success).toBe(true);
      expect(calendarMonthParamSchema.safeParse('0').success).toBe(false);
      expect(calendarMonthParamSchema.safeParse('13').success).toBe(false);
      expect(calendarMonthParamSchema.safeParse('jan').success).toBe(false);
    });

    it('parses valid month and returns null when invalid', () => {
      expect(parseCalendarMonth('6')).toBe(6);
      expect(parseCalendarMonth('-1')).toBeNull();
    });
  });

  describe('timezone offset', () => {
    it('accepts undefined, boundary values, and rejects out-of-range values', () => {
      expect(calendarTimezoneOffsetQuerySchema.safeParse(undefined).success).toBe(true);
      expect(calendarTimezoneOffsetQuerySchema.safeParse('-720').success).toBe(true);
      expect(calendarTimezoneOffsetQuerySchema.safeParse('840').success).toBe(true);
      expect(calendarTimezoneOffsetQuerySchema.safeParse('-721').success).toBe(false);
      expect(calendarTimezoneOffsetQuerySchema.safeParse('841').success).toBe(false);
    });

    it('parses undefined to UTC default and valid string to integer', () => {
      expect(parseCalendarTimezoneOffset(undefined)).toBe(0);
      expect(parseCalendarTimezoneOffset('-300')).toBe(-300);
      expect(parseCalendarTimezoneOffset('330')).toBe(330);
    });

    it('returns null for malformed timezone strings', () => {
      expect(parseCalendarTimezoneOffset('5.5')).toBeNull();
      expect(parseCalendarTimezoneOffset('abc')).toBeNull();
    });
  });
});
