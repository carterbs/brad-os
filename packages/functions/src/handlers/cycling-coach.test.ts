import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getUserLocalNow,
  formatDateUTC,
  getUserLocalDayName,
  getUserLocalWeekBoundaries,
  getSessionType,
} from './cycling-coach.js';

describe('Cycling Coach Timezone Utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserLocalNow', () => {
    it('should return UTC time when offset is 0', () => {
      const before = Date.now();
      const result = getUserLocalNow(0);
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });

    it('should shift time forward for positive offsets (east of UTC)', () => {
      // UTC+5:30 (India) = +330 minutes
      const utcNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(utcNow);

      const result = getUserLocalNow(330);
      const expected = utcNow + 330 * 60 * 1000;

      expect(result.getTime()).toBe(expected);
    });

    it('should shift time backward for negative offsets (west of UTC)', () => {
      // US Eastern EST = -300 minutes
      const utcNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(utcNow);

      const result = getUserLocalNow(-300);
      const expected = utcNow + (-300) * 60 * 1000;

      expect(result.getTime()).toBe(expected);
    });

    it('should cross date boundary when offset causes day change', () => {
      // 2am UTC on Wednesday → US Eastern (-300) → 9pm Tuesday
      const wednesdayAt2amUTC = Date.UTC(2025, 5, 4, 2, 0, 0); // June 4, 2025 02:00 UTC (Wednesday)
      vi.spyOn(Date, 'now').mockReturnValue(wednesdayAt2amUTC);

      const result = getUserLocalNow(-300);
      // Should be Tuesday 9pm in user's local time
      expect(result.getUTCDay()).toBe(2); // Tuesday
      expect(result.getUTCHours()).toBe(21); // 9pm
    });
  });

  describe('formatDateUTC', () => {
    it('should format a date as YYYY-MM-DD using UTC', () => {
      const date = new Date(Date.UTC(2025, 0, 15)); // Jan 15, 2025
      expect(formatDateUTC(date)).toBe('2025-01-15');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date(Date.UTC(2025, 2, 5)); // March 5, 2025
      expect(formatDateUTC(date)).toBe('2025-03-05');
    });

    it('should handle year boundaries', () => {
      const date = new Date(Date.UTC(2025, 11, 31)); // Dec 31, 2025
      expect(formatDateUTC(date)).toBe('2025-12-31');
    });

    it('should handle leap year dates', () => {
      const date = new Date(Date.UTC(2024, 1, 29)); // Feb 29, 2024
      expect(formatDateUTC(date)).toBe('2024-02-29');
    });
  });

  describe('getUserLocalDayName', () => {
    it('should return Sunday for UTC day 0', () => {
      const sunday = new Date(Date.UTC(2025, 5, 1)); // June 1, 2025 = Sunday
      expect(getUserLocalDayName(sunday)).toBe('Sunday');
    });

    it('should return Monday for UTC day 1', () => {
      const monday = new Date(Date.UTC(2025, 5, 2)); // June 2, 2025 = Monday
      expect(getUserLocalDayName(monday)).toBe('Monday');
    });

    it('should return Saturday for UTC day 6', () => {
      const saturday = new Date(Date.UTC(2025, 5, 7)); // June 7, 2025 = Saturday
      expect(getUserLocalDayName(saturday)).toBe('Saturday');
    });

    it('should give correct day for timezone-adjusted dates crossing midnight', () => {
      // Server UTC: Wednesday 3am → US Eastern (-300): Tuesday 10pm
      const wednesdayAt3amUTC = Date.UTC(2025, 5, 4, 3, 0, 0);
      vi.spyOn(Date, 'now').mockReturnValue(wednesdayAt3amUTC);

      const userNow = getUserLocalNow(-300);
      expect(getUserLocalDayName(userNow)).toBe('Tuesday');
    });

    it('should give correct day for timezone-adjusted dates east of UTC', () => {
      // Server UTC: Tuesday 11pm → UTC+2 (Europe): Wednesday 1am
      const tuesdayAt11pmUTC = Date.UTC(2025, 5, 3, 23, 0, 0);
      vi.spyOn(Date, 'now').mockReturnValue(tuesdayAt11pmUTC);

      const userNow = getUserLocalNow(120); // UTC+2
      expect(getUserLocalDayName(userNow)).toBe('Wednesday');
    });
  });

  describe('getUserLocalWeekBoundaries', () => {
    it('should return Monday-Sunday for a Wednesday', () => {
      // Wednesday June 4, 2025
      const wednesday = new Date(Date.UTC(2025, 5, 4, 12, 0, 0));
      const bounds = getUserLocalWeekBoundaries(wednesday);

      expect(bounds.start).toBe('2025-06-02'); // Monday
      expect(bounds.end).toBe('2025-06-08');   // Sunday
    });

    it('should return correct boundaries for a Monday', () => {
      // Monday June 2, 2025
      const monday = new Date(Date.UTC(2025, 5, 2, 12, 0, 0));
      const bounds = getUserLocalWeekBoundaries(monday);

      expect(bounds.start).toBe('2025-06-02'); // Monday
      expect(bounds.end).toBe('2025-06-08');   // Sunday
    });

    it('should return correct boundaries for a Sunday', () => {
      // Sunday June 8, 2025
      const sunday = new Date(Date.UTC(2025, 5, 8, 12, 0, 0));
      const bounds = getUserLocalWeekBoundaries(sunday);

      expect(bounds.start).toBe('2025-06-02'); // Monday
      expect(bounds.end).toBe('2025-06-08');   // Sunday
    });

    it('should handle timezone-adjusted date crossing into previous day', () => {
      // Server UTC: Wednesday 3am → US Eastern (-300): Tuesday 10pm
      // So the week should be Mon-Sun of the Tuesday week
      const wednesdayAt3amUTC = Date.UTC(2025, 5, 4, 3, 0, 0);
      vi.spyOn(Date, 'now').mockReturnValue(wednesdayAt3amUTC);

      const userNow = getUserLocalNow(-300);
      const bounds = getUserLocalWeekBoundaries(userNow);

      // Tuesday June 3 is in the week of Mon June 2 - Sun June 8
      expect(bounds.start).toBe('2025-06-02');
      expect(bounds.end).toBe('2025-06-08');
    });

    it('should handle month boundary crossing', () => {
      // Thursday May 1, 2025
      const thursday = new Date(Date.UTC(2025, 4, 1, 12, 0, 0));
      const bounds = getUserLocalWeekBoundaries(thursday);

      expect(bounds.start).toBe('2025-04-28'); // Monday (April)
      expect(bounds.end).toBe('2025-05-04');   // Sunday (May)
    });

    it('should handle timezone causing week boundary shift', () => {
      // Server UTC: Monday 1am → US Pacific (-480): Sunday 5pm previous day
      const mondayAt1amUTC = Date.UTC(2025, 5, 2, 1, 0, 0); // Monday June 2
      vi.spyOn(Date, 'now').mockReturnValue(mondayAt1amUTC);

      const userNow = getUserLocalNow(-480); // US Pacific
      const bounds = getUserLocalWeekBoundaries(userNow);

      // For the user it's Sunday June 1, so the week is Mon May 26 - Sun June 1
      expect(bounds.start).toBe('2025-05-26');
      expect(bounds.end).toBe('2025-06-01');
    });
  });

  describe('getSessionType', () => {
    it('should return vo2max for Tuesday (day 2)', () => {
      expect(getSessionType(2)).toBe('vo2max');
    });

    it('should return threshold for Thursday (day 4)', () => {
      expect(getSessionType(4)).toBe('threshold');
    });

    it('should return fun for Saturday (day 6)', () => {
      expect(getSessionType(6)).toBe('fun');
    });

    it('should return fun for all other days', () => {
      expect(getSessionType(0)).toBe('fun'); // Sunday
      expect(getSessionType(1)).toBe('fun'); // Monday
      expect(getSessionType(3)).toBe('fun'); // Wednesday
      expect(getSessionType(5)).toBe('fun'); // Friday
    });
  });

  describe('end-to-end timezone scenarios', () => {
    it('US Eastern morning: server UTC sees afternoon, user sees morning', () => {
      // It's 8am EST (1pm UTC) on a Tuesday
      const tuesdayAt1pmUTC = Date.UTC(2025, 5, 3, 13, 0, 0); // Tuesday June 3
      vi.spyOn(Date, 'now').mockReturnValue(tuesdayAt1pmUTC);

      const userNow = getUserLocalNow(-300); // EST = UTC-5

      expect(getUserLocalDayName(userNow)).toBe('Tuesday');
      expect(userNow.getUTCHours()).toBe(8); // 8am local
      expect(getSessionType(userNow.getUTCDay())).toBe('vo2max'); // Tuesday
      expect(formatDateUTC(userNow)).toBe('2025-06-03');
    });

    it('Australia late night: server UTC sees Wednesday, user sees Thursday', () => {
      // 3pm UTC Wednesday → AEST (+10) → 1am Thursday
      const wednesdayAt3pmUTC = Date.UTC(2025, 5, 4, 15, 0, 0); // Wednesday June 4 15:00 UTC
      vi.spyOn(Date, 'now').mockReturnValue(wednesdayAt3pmUTC);

      const userNow = getUserLocalNow(600); // AEST = UTC+10

      expect(getUserLocalDayName(userNow)).toBe('Thursday');
      expect(userNow.getUTCHours()).toBe(1); // 1am Thursday local
      expect(getSessionType(userNow.getUTCDay())).toBe('threshold'); // Thursday
      expect(formatDateUTC(userNow)).toBe('2025-06-05'); // Next day in local TZ
    });

    it('UTC+0 should match server time exactly', () => {
      const tuesdayAt10amUTC = Date.UTC(2025, 5, 3, 10, 0, 0);
      vi.spyOn(Date, 'now').mockReturnValue(tuesdayAt10amUTC);

      const userNow = getUserLocalNow(0);

      expect(getUserLocalDayName(userNow)).toBe('Tuesday');
      expect(userNow.getUTCHours()).toBe(10);
      expect(formatDateUTC(userNow)).toBe('2025-06-03');
    });
  });
});
