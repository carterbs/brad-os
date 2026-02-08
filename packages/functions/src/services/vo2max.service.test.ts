import { describe, it, expect } from 'vitest';
import {
  estimateVO2MaxFromFTP,
  estimateVO2MaxFromPeakPower,
  applyACSMFormula,
  categorizeVO2Max,
} from './vo2max.service.js';

describe('VO2 Max Service', () => {
  describe('applyACSMFormula', () => {
    it('should calculate VO2 max correctly with known values', () => {
      // 250 watts, 75 kg = (10.8 * 250) / 75 + 7 = 36 + 7 = 43.0
      expect(applyACSMFormula(250, 75)).toBe(43);
    });

    it('should handle high power output', () => {
      // 400 watts, 70 kg = (10.8 * 400) / 70 + 7 = 61.71 + 7 = 68.7
      expect(applyACSMFormula(400, 70)).toBe(68.7);
    });

    it('should handle light body weight', () => {
      // 200 watts, 55 kg = (10.8 * 200) / 55 + 7 = 39.27 + 7 = 46.3
      expect(applyACSMFormula(200, 55)).toBe(46.3);
    });

    it('should handle heavy body weight', () => {
      // 300 watts, 100 kg = (10.8 * 300) / 100 + 7 = 32.4 + 7 = 39.4
      expect(applyACSMFormula(300, 100)).toBe(39.4);
    });
  });

  describe('estimateVO2MaxFromFTP', () => {
    it('should estimate VO2 max from FTP correctly', () => {
      // FTP 250, weight 75 kg
      // VO2 max power = 250 / 0.80 = 312.5
      // VO2 max = (10.8 * 312.5) / 75 + 7 = 45 + 7 = 52.0
      const result = estimateVO2MaxFromFTP(250, 75);
      expect(result).toBe(52);
    });

    it('should match plan success criteria: FTP=250, weight=75kg => ~52', () => {
      const result = estimateVO2MaxFromFTP(250, 75);
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(40);
      expect(result).toBeLessThan(60);
    });

    it('should return null for zero FTP', () => {
      expect(estimateVO2MaxFromFTP(0, 75)).toBeNull();
    });

    it('should return null for zero weight', () => {
      expect(estimateVO2MaxFromFTP(250, 0)).toBeNull();
    });

    it('should return null for negative FTP', () => {
      expect(estimateVO2MaxFromFTP(-100, 75)).toBeNull();
    });

    it('should return null for negative weight', () => {
      expect(estimateVO2MaxFromFTP(250, -10)).toBeNull();
    });

    it('should handle very high FTP values', () => {
      // FTP 400 (pro level), 68 kg
      const result = estimateVO2MaxFromFTP(400, 68);
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(70);
    });
  });

  describe('estimateVO2MaxFromPeakPower', () => {
    it('should estimate from 5-min peak power directly', () => {
      // 300 watts peak, 75 kg
      // VO2 max = (10.8 * 300) / 75 + 7 = 43.2 + 7 = 50.2
      const result = estimateVO2MaxFromPeakPower(300, 75, 'peak_5min');
      expect(result).toBe(50.2);
    });

    it('should estimate from 20-min peak power with FTP conversion', () => {
      // 280 watts 20-min, 75 kg
      // Estimated FTP = 280 * 0.95 = 266
      // VO2 max power = 266 / 0.80 = 332.5
      // VO2 max = (10.8 * 332.5) / 75 + 7 = 47.88 + 7 = 54.9
      const result = estimateVO2MaxFromPeakPower(280, 75, 'peak_20min');
      expect(result).toBe(54.9);
    });

    it('should return null for zero power', () => {
      expect(estimateVO2MaxFromPeakPower(0, 75)).toBeNull();
    });

    it('should return null for zero weight', () => {
      expect(estimateVO2MaxFromPeakPower(300, 0)).toBeNull();
    });

    it('should default to peak_5min method', () => {
      const result = estimateVO2MaxFromPeakPower(300, 75);
      const explicit = estimateVO2MaxFromPeakPower(300, 75, 'peak_5min');
      expect(result).toBe(explicit);
    });
  });

  describe('categorizeVO2Max', () => {
    it('should categorize poor (< 35)', () => {
      expect(categorizeVO2Max(20)).toBe('poor');
      expect(categorizeVO2Max(34.9)).toBe('poor');
    });

    it('should categorize fair (35-45)', () => {
      expect(categorizeVO2Max(35)).toBe('fair');
      expect(categorizeVO2Max(40)).toBe('fair');
      expect(categorizeVO2Max(44.9)).toBe('fair');
    });

    it('should categorize good (45-55)', () => {
      expect(categorizeVO2Max(45)).toBe('good');
      expect(categorizeVO2Max(50)).toBe('good');
      expect(categorizeVO2Max(54.9)).toBe('good');
    });

    it('should categorize excellent (55-65)', () => {
      expect(categorizeVO2Max(55)).toBe('excellent');
      expect(categorizeVO2Max(60)).toBe('excellent');
      expect(categorizeVO2Max(64.9)).toBe('excellent');
    });

    it('should categorize elite (65+)', () => {
      expect(categorizeVO2Max(65)).toBe('elite');
      expect(categorizeVO2Max(80)).toBe('elite');
      expect(categorizeVO2Max(90)).toBe('elite');
    });
  });
});
