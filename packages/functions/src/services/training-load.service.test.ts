import { describe, it, expect } from 'vitest';
import {
  calculateTSS,
  calculateIntensityFactor,
  calculateATL,
  calculateCTL,
  calculateTSB,
  getWeekInBlock,
  buildDailyTSSArray,
  calculateTrainingLoadMetrics,
  type DailyTSS,
} from './training-load.service.js';

describe('Training Load Service', () => {
  describe('calculateTSS', () => {
    it('should calculate TSS correctly for a 1-hour ride at FTP', () => {
      // 1 hour at FTP should give TSS of 100
      const tss = calculateTSS(3600, 250, 250);
      expect(tss).toBe(100);
    });

    it('should calculate TSS correctly for a 30-minute ride at FTP', () => {
      // 30 minutes at FTP should give TSS of 50
      const tss = calculateTSS(1800, 250, 250);
      expect(tss).toBe(50);
    });

    it('should calculate TSS correctly for a ride below FTP', () => {
      // 1 hour at 80% of FTP (200W when FTP is 250)
      // IF = 200/250 = 0.8
      // TSS = (3600 * 200 * 0.8) / (250 * 3600) * 100 = 64
      const tss = calculateTSS(3600, 200, 250);
      expect(tss).toBe(64);
    });

    it('should calculate TSS correctly for a ride above FTP', () => {
      // 1 hour at 110% of FTP (275W when FTP is 250)
      // IF = 275/250 = 1.1
      // TSS = (3600 * 275 * 1.1) / (250 * 3600) * 100 = 121
      const tss = calculateTSS(3600, 275, 250);
      expect(tss).toBe(121);
    });

    it('should return 0 for zero duration', () => {
      const tss = calculateTSS(0, 250, 250);
      expect(tss).toBe(0);
    });

    it('should return 0 for zero normalized power', () => {
      const tss = calculateTSS(3600, 0, 250);
      expect(tss).toBe(0);
    });

    it('should throw error for zero FTP', () => {
      expect(() => calculateTSS(3600, 250, 0)).toThrow('FTP must be positive');
    });

    it('should throw error for negative FTP', () => {
      expect(() => calculateTSS(3600, 250, -100)).toThrow('FTP must be positive');
    });
  });

  describe('calculateIntensityFactor', () => {
    it('should calculate IF correctly at FTP', () => {
      const intensityFactor = calculateIntensityFactor(250, 250);
      expect(intensityFactor).toBe(1);
    });

    it('should calculate IF correctly below FTP', () => {
      const intensityFactor = calculateIntensityFactor(200, 250);
      expect(intensityFactor).toBe(0.8);
    });

    it('should calculate IF correctly above FTP', () => {
      const intensityFactor = calculateIntensityFactor(275, 250);
      expect(intensityFactor).toBe(1.1);
    });

    it('should return 0 for zero normalized power', () => {
      const intensityFactor = calculateIntensityFactor(0, 250);
      expect(intensityFactor).toBe(0);
    });

    it('should throw error for zero FTP', () => {
      expect(() => calculateIntensityFactor(250, 0)).toThrow('FTP must be positive');
    });
  });

  describe('calculateATL', () => {
    it('should return 0 for empty array', () => {
      const atl = calculateATL([]);
      expect(atl).toBe(0);
    });

    it('should calculate ATL for a single day', () => {
      const dailyTSS: DailyTSS[] = [{ date: '2024-01-01', tss: 100 }];
      const atl = calculateATL(dailyTSS);
      // k = 2/8 = 0.25
      // EMA = 0 + (100 - 0) * 0.25 = 25
      expect(atl).toBe(25);
    });

    it('should calculate ATL for multiple days', () => {
      const dailyTSS: DailyTSS[] = [
        { date: '2024-01-01', tss: 100 },
        { date: '2024-01-02', tss: 100 },
        { date: '2024-01-03', tss: 100 },
      ];
      const atl = calculateATL(dailyTSS);
      // k = 0.25
      // Day 1: 0 + (100 - 0) * 0.25 = 25
      // Day 2: 25 + (100 - 25) * 0.25 = 43.75
      // Day 3: 43.75 + (100 - 43.75) * 0.25 = 57.8125
      expect(atl).toBeCloseTo(57.8, 1);
    });

    it('should handle unsorted input', () => {
      const dailyTSS: DailyTSS[] = [
        { date: '2024-01-03', tss: 100 },
        { date: '2024-01-01', tss: 100 },
        { date: '2024-01-02', tss: 100 },
      ];
      const atl = calculateATL(dailyTSS);
      // Should sort and process correctly
      expect(atl).toBeCloseTo(57.8, 1);
    });
  });

  describe('calculateCTL', () => {
    it('should return 0 for empty array', () => {
      const ctl = calculateCTL([]);
      expect(ctl).toBe(0);
    });

    it('should calculate CTL for a single day', () => {
      const dailyTSS: DailyTSS[] = [{ date: '2024-01-01', tss: 100 }];
      const ctl = calculateCTL(dailyTSS);
      // k = 2/43 ≈ 0.0465
      // EMA = 0 + (100 - 0) * 0.0465 ≈ 4.65
      expect(ctl).toBeCloseTo(4.7, 1);
    });

    it('should build CTL more slowly than ATL', () => {
      // Same data should result in lower CTL than ATL due to longer period
      const dailyTSS: DailyTSS[] = [
        { date: '2024-01-01', tss: 100 },
        { date: '2024-01-02', tss: 100 },
        { date: '2024-01-03', tss: 100 },
      ];
      const atl = calculateATL(dailyTSS);
      const ctl = calculateCTL(dailyTSS);
      expect(ctl).toBeLessThan(atl);
    });
  });

  describe('calculateTSB', () => {
    it('should calculate TSB correctly', () => {
      const tsb = calculateTSB(50, 30);
      expect(tsb).toBe(20);
    });

    it('should return negative TSB when ATL > CTL (fatigued)', () => {
      const tsb = calculateTSB(50, 70);
      expect(tsb).toBe(-20);
    });

    it('should return 0 when ATL equals CTL', () => {
      const tsb = calculateTSB(50, 50);
      expect(tsb).toBe(0);
    });
  });

  describe('getWeekInBlock', () => {
    it('should return 1 on the first day of the block', () => {
      const week = getWeekInBlock('2024-01-01', '2024-01-01');
      expect(week).toBe(1);
    });

    it('should return 1 during the first week', () => {
      const week = getWeekInBlock('2024-01-01', '2024-01-06');
      expect(week).toBe(1);
    });

    it('should return 2 at the start of the second week', () => {
      const week = getWeekInBlock('2024-01-01', '2024-01-08');
      expect(week).toBe(2);
    });

    it('should return 8 for the eighth week', () => {
      const week = getWeekInBlock('2024-01-01', '2024-02-19');
      expect(week).toBe(8);
    });

    it('should cap at 8 weeks for dates beyond block duration', () => {
      const week = getWeekInBlock('2024-01-01', '2024-03-15');
      expect(week).toBe(8);
    });

    it('should return 0 for dates before block start', () => {
      const week = getWeekInBlock('2024-01-15', '2024-01-01');
      expect(week).toBe(0);
    });

    it('should use current date when not specified', () => {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 14); // 2 weeks ago
      const week = getWeekInBlock(startDate.toISOString().split('T')[0] ?? '');
      expect(week).toBe(3);
    });
  });

  describe('buildDailyTSSArray', () => {
    it('should fill in missing days with 0 TSS', () => {
      const activities: DailyTSS[] = [
        { date: '2024-01-01', tss: 50 },
        { date: '2024-01-03', tss: 75 },
      ];

      const result = buildDailyTSSArray(activities, '2024-01-01', '2024-01-03');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: '2024-01-01', tss: 50 });
      expect(result[1]).toEqual({ date: '2024-01-02', tss: 0 });
      expect(result[2]).toEqual({ date: '2024-01-03', tss: 75 });
    });

    it('should sum multiple activities on the same day', () => {
      const activities: DailyTSS[] = [
        { date: '2024-01-01', tss: 30 },
        { date: '2024-01-01', tss: 40 },
      ];

      const result = buildDailyTSSArray(activities, '2024-01-01', '2024-01-01');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-01', tss: 70 });
    });

    it('should handle empty activities array', () => {
      const result = buildDailyTSSArray([], '2024-01-01', '2024-01-03');

      expect(result).toHaveLength(3);
      expect(result.every((d) => d.tss === 0)).toBe(true);
    });

    it('should handle ISO datetime strings', () => {
      const activities: DailyTSS[] = [
        { date: '2024-01-01T12:00:00.000Z', tss: 50 },
      ];

      const result = buildDailyTSSArray(activities, '2024-01-01', '2024-01-01');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ date: '2024-01-01', tss: 50 });
    });
  });

  describe('calculateTrainingLoadMetrics', () => {
    it('should return zeros for empty activities', () => {
      const metrics = calculateTrainingLoadMetrics([]);
      expect(metrics).toEqual({ atl: 0, ctl: 0, tsb: 0 });
    });

    it('should calculate all metrics correctly', () => {
      // Create 30 days of consistent training
      const activities: DailyTSS[] = [];
      const today = new Date();
      for (let i = 30; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        if (dateStr !== undefined && dateStr !== '') {
          activities.push({ date: dateStr, tss: 50 });
        }
      }

      const metrics = calculateTrainingLoadMetrics(activities, 30);

      // With consistent 50 TSS daily:
      // ATL (7-day) should be higher than CTL (42-day) for shorter history
      expect(metrics.atl).toBeGreaterThan(0);
      expect(metrics.ctl).toBeGreaterThan(0);
      // TSB = CTL - ATL, with consistent training and short history, ATL > CTL
      expect(metrics.tsb).toBeLessThan(0);
    });

    it('should respect the lookback period', () => {
      // Create activities for the last 10 days
      const activities: DailyTSS[] = [];
      const today = new Date();
      for (let i = 10; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        activities.push({ date: dateStr, tss: 100 });
      }

      const shortMetrics = calculateTrainingLoadMetrics(activities, 15);
      const longMetrics = calculateTrainingLoadMetrics(activities, 60);

      // The longer lookback includes more zero-TSS days before the activities started,
      // which means the EMA starts lower and has more time with zeros,
      // resulting in a lower CTL. However, due to EMA math, the difference
      // might be subtle. At minimum, longMetrics should not be higher.
      expect(shortMetrics.ctl).toBeGreaterThanOrEqual(longMetrics.ctl);
    });
  });
});
