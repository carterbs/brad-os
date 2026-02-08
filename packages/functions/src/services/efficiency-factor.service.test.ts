import { describe, it, expect } from 'vitest';
import { calculateEF, categorizeEF } from './efficiency-factor.service.js';

describe('Efficiency Factor Service', () => {
  describe('calculateEF', () => {
    it('should calculate EF correctly', () => {
      // NP 200, HR 140 = 200/140 = 1.43
      expect(calculateEF(200, 140)).toBe(1.43);
    });

    it('should handle typical beginner values', () => {
      // NP 150, HR 155 = 0.97
      expect(calculateEF(150, 155)).toBe(0.97);
    });

    it('should handle well-trained values', () => {
      // NP 250, HR 145 = 1.72
      expect(calculateEF(250, 145)).toBe(1.72);
    });

    it('should return null when avg HR is 0 (no HR data)', () => {
      expect(calculateEF(200, 0)).toBeNull();
    });

    it('should return null when NP is 0', () => {
      expect(calculateEF(0, 140)).toBeNull();
    });

    it('should return null for negative HR', () => {
      expect(calculateEF(200, -10)).toBeNull();
    });

    it('should return null for negative NP', () => {
      expect(calculateEF(-200, 140)).toBeNull();
    });

    it('should round to 2 decimal places', () => {
      // NP 233, HR 147 = 1.5850... -> 1.59
      expect(calculateEF(233, 147)).toBe(1.59);
    });
  });

  describe('categorizeEF', () => {
    it('should categorize beginner (< 1.1)', () => {
      expect(categorizeEF(0.8)).toBe('beginner');
      expect(categorizeEF(1.0)).toBe('beginner');
      expect(categorizeEF(1.09)).toBe('beginner');
    });

    it('should categorize intermediate (1.1-1.3)', () => {
      expect(categorizeEF(1.1)).toBe('intermediate');
      expect(categorizeEF(1.2)).toBe('intermediate');
      expect(categorizeEF(1.29)).toBe('intermediate');
    });

    it('should categorize trained (1.3-1.5)', () => {
      expect(categorizeEF(1.3)).toBe('trained');
      expect(categorizeEF(1.4)).toBe('trained');
      expect(categorizeEF(1.49)).toBe('trained');
    });

    it('should categorize well_trained (1.5+)', () => {
      expect(categorizeEF(1.5)).toBe('well_trained');
      expect(categorizeEF(1.8)).toBe('well_trained');
      expect(categorizeEF(2.0)).toBe('well_trained');
    });
  });
});
