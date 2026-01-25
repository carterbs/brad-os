import { describe, it, expect, beforeEach } from 'vitest';
import { DeloadService } from '../deload.service.js';
import type { ExerciseProgression } from '@brad-os/shared';

describe('DeloadService', () => {
  let service: DeloadService;

  const baseExercise: ExerciseProgression = {
    exerciseId: 'exercise-1',
    planExerciseId: 'plan-exercise-1',
    baseWeight: 30,
    baseReps: 8,
    baseSets: 3,
    weightIncrement: 5,
    minReps: 8,
    maxReps: 12,
  };

  beforeEach(() => {
    service = new DeloadService();
  });

  describe('calculateDeloadTargets', () => {
    it('should calculate 50% sets (rounded up)', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      expect(result.targetSets).toBe(2); // 3 * 0.5 = 1.5 -> 2
    });

    it('should calculate 85% weight (rounded to 2.5)', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      // 40 * 0.85 = 34, rounded to nearest 2.5 = 35
      expect(result.targetWeight).toBe(35);
    });

    it('should preserve reps from current week', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      expect(result.targetReps).toBe(9);
    });

    it('should round weight correctly for edge cases', () => {
      // 45 * 0.85 = 38.25 -> 37.5
      const result = service.calculateDeloadTargets(baseExercise, 45, 8);

      expect(result.targetWeight).toBe(37.5);
    });

    it('should ensure minimum of 1 set', () => {
      const exercise = { ...baseExercise, baseSets: 1 };
      const result = service.calculateDeloadTargets(exercise, 40, 9);

      expect(result.targetSets).toBe(1);
    });

    it('should handle 4 sets correctly', () => {
      const exercise = { ...baseExercise, baseSets: 4 };
      const result = service.calculateDeloadTargets(exercise, 40, 9);

      expect(result.targetSets).toBe(2); // 4 * 0.5 = 2
    });

    it('should handle 5 sets correctly', () => {
      const exercise = { ...baseExercise, baseSets: 5 };
      const result = service.calculateDeloadTargets(exercise, 40, 9);

      expect(result.targetSets).toBe(3); // 5 * 0.5 = 2.5 -> 3
    });

    it('should preserve exerciseId and planExerciseId', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      expect(result.exerciseId).toBe('exercise-1');
      expect(result.planExerciseId).toBe('plan-exercise-1');
    });

    it('should set weekNumber to deload week (6)', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      expect(result.weekNumber).toBe(6);
    });

    it('should mark as deload', () => {
      const result = service.calculateDeloadTargets(baseExercise, 40, 9);

      expect(result.isDeload).toBe(true);
    });
  });

  describe('isDeloadWeek', () => {
    it('should return true for week 6', () => {
      expect(service.isDeloadWeek(6)).toBe(true);
    });

    it('should return false for weeks 0-5', () => {
      for (let week = 0; week <= 5; week++) {
        expect(service.isDeloadWeek(week)).toBe(false);
      }
    });

    it('should return false for weeks beyond 6', () => {
      expect(service.isDeloadWeek(7)).toBe(false);
      expect(service.isDeloadWeek(13)).toBe(false);
    });
  });

  describe('getDeloadWeightFactor', () => {
    it('should return 0.85', () => {
      expect(service.getDeloadWeightFactor()).toBe(0.85);
    });
  });

  describe('getDeloadVolumeFactor', () => {
    it('should return 0.5', () => {
      expect(service.getDeloadVolumeFactor()).toBe(0.5);
    });
  });
});
