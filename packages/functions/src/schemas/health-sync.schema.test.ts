import { describe, expect, it } from 'vitest';
import {
  bulkHRVSyncSchema,
  bulkRHRSyncSchema,
  bulkSleepSyncSchema,
  bulkWeightSyncSchema,
  coachRecommendRequestSchema,
  getRecoveryQuerySchema,
  recoveryBaselineSchema,
  recoverySnapshotSchema,
  syncHealthDataSchema,
  weightEntrySchema,
} from './recovery.schema.js';

describe('health sync schemas', () => {
  describe('recoverySnapshotSchema', () => {
    const validSnapshot = {
      date: '2026-02-20',
      hrvMs: 45,
      hrvVsBaseline: 12.5,
      rhrBpm: 54,
      rhrVsBaseline: -2,
      sleepHours: 7.5,
      sleepEfficiency: 89,
      deepSleepPercent: 19,
      score: 77,
      state: 'ready' as const,
      source: 'healthkit' as const,
    };

    it('accepts a fully valid recovery snapshot', () => {
      const result = recoverySnapshotSchema.safeParse(validSnapshot);
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = recoverySnapshotSchema.safeParse({
        ...validSnapshot,
        date: '02/20/2026',
      });

      expect(result.success).toBe(false);
    });

    it('rejects out-of-range score and invalid state', () => {
      const result = recoverySnapshotSchema.safeParse({
        ...validSnapshot,
        score: 101,
        state: 'unknown',
      });

      expect(result.success).toBe(false);
    });

    it('accepts lower and upper numeric bounds', () => {
      const lower = recoverySnapshotSchema.safeParse({
        ...validSnapshot,
        hrvMs: 0,
        hrvVsBaseline: -200,
        rhrBpm: 30,
        rhrVsBaseline: -50,
        sleepHours: 0,
        sleepEfficiency: 0,
        deepSleepPercent: 0,
        score: 0,
        state: 'recover',
      });
      const upper = recoverySnapshotSchema.safeParse({
        ...validSnapshot,
        hrvMs: 300,
        hrvVsBaseline: 200,
        rhrBpm: 200,
        rhrVsBaseline: 50,
        sleepHours: 24,
        sleepEfficiency: 100,
        deepSleepPercent: 100,
        score: 100,
        state: 'ready',
      });

      expect(lower.success).toBe(true);
      expect(upper.success).toBe(true);
    });
  });

  describe('recoveryBaselineSchema', () => {
    it('accepts baseline with optional calculatedAt omitted', () => {
      const result = recoveryBaselineSchema.safeParse({
        hrvMedian: 42,
        hrvStdDev: 8,
        rhrMedian: 56,
        sampleCount: 30,
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid sampleCount and rhrMedian', () => {
      const result = recoveryBaselineSchema.safeParse({
        hrvMedian: 42,
        hrvStdDev: 8,
        rhrMedian: 22,
        sampleCount: -1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('weight schemas', () => {
    it('accepts valid weight entry', () => {
      const result = weightEntrySchema.safeParse({
        weightLbs: 180.4,
        date: '2026-02-21',
      });

      expect(result.success).toBe(true);
    });

    it('rejects non-positive weight entry', () => {
      const result = weightEntrySchema.safeParse({
        weightLbs: 0,
        date: '2026-02-21',
      });

      expect(result.success).toBe(false);
    });

    it('accepts bulk weight sync up to max limit and both sources', () => {
      const entries = Array.from({ length: 500 }, (_, i) => ({
        weightLbs: 170 + i * 0.01,
        date: '2026-02-21',
        source: i % 2 === 0 ? 'healthkit' : 'manual',
      }));

      const result = bulkWeightSyncSchema.safeParse({ weights: entries });
      expect(result.success).toBe(true);
    });

    it('rejects bulk weight sync when array is empty or over limit', () => {
      const emptyResult = bulkWeightSyncSchema.safeParse({ weights: [] });
      const overLimit = bulkWeightSyncSchema.safeParse({
        weights: Array.from({ length: 501 }, () => ({ weightLbs: 180, date: '2026-02-21' })),
      });

      expect(emptyResult.success).toBe(false);
      expect(overLimit.success).toBe(false);
    });
  });

  describe('bulk HRV schema', () => {
    it('accepts valid HRV payload and optional source', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
            source: 'healthkit',
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid HRV ranges and sample counts', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 301,
            minMs: -1,
            maxMs: 999,
            sampleCount: 0,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('bulk RHR schema', () => {
    it('accepts valid RHR payload', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 18 }],
      });

      expect(result.success).toBe(true);
    });

    it('rejects invalid avgBpm and sampleCount', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 201, sampleCount: 0 }],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('bulk sleep schema', () => {
    it('accepts valid sleep payload including efficiency up to 110', () => {
      const result = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            totalSleepMinutes: 420,
            inBedMinutes: 460,
            coreMinutes: 190,
            deepMinutes: 90,
            remMinutes: 120,
            awakeMinutes: 60,
            sleepEfficiency: 110,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('rejects out-of-range minute fields and invalid date', () => {
      const result = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: '2026/02/21',
            totalSleepMinutes: 1500,
            inBedMinutes: 460,
            coreMinutes: 190,
            deepMinutes: 90,
            remMinutes: 120,
            awakeMinutes: 60,
            sleepEfficiency: -1,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('sync and query schemas', () => {
    const validSyncPayload = {
      recovery: {
        date: '2026-02-21',
        hrvMs: 44,
        hrvVsBaseline: 11,
        rhrBpm: 56,
        rhrVsBaseline: -3,
        sleepHours: 7.2,
        sleepEfficiency: 88,
        deepSleepPercent: 17,
        score: 75,
        state: 'ready' as const,
        source: 'healthkit' as const,
      },
      baseline: {
        hrvMedian: 42,
        hrvStdDev: 8,
        rhrMedian: 56,
        sampleCount: 30,
      },
      weight: {
        weightLbs: 179.2,
        date: '2026-02-21',
      },
    };

    it('accepts full sync payload and supports missing optional fields', () => {
      const full = syncHealthDataSchema.safeParse(validSyncPayload);
      const minimal = syncHealthDataSchema.safeParse({ recovery: validSyncPayload.recovery });

      expect(full.success).toBe(true);
      expect(minimal.success).toBe(true);
    });

    it('rejects malformed sync payload when recovery is invalid', () => {
      const invalid = syncHealthDataSchema.safeParse({
        ...validSyncPayload,
        recovery: {
          ...validSyncPayload.recovery,
          source: 'manual',
        },
      });

      expect(invalid.success).toBe(false);
    });

    it('accepts empty query and valid date query; rejects malformed date query', () => {
      const empty = getRecoveryQuerySchema.safeParse({});
      const valid = getRecoveryQuerySchema.safeParse({ date: '2026-02-21' });
      const invalid = getRecoveryQuerySchema.safeParse({ date: '21-02-2026' });

      expect(empty.success).toBe(true);
      expect(valid.success).toBe(true);
      expect(invalid.success).toBe(false);
    });
  });

  describe('coachRecommendRequestSchema', () => {
    it('accepts request without recovery section', () => {
      const result = coachRecommendRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts recovery section without source and strips source if present', () => {
      const valid = coachRecommendRequestSchema.safeParse({
        recovery: {
          date: '2026-02-21',
          hrvMs: 44,
          hrvVsBaseline: 11,
          rhrBpm: 56,
          rhrVsBaseline: -3,
          sleepHours: 7.2,
          sleepEfficiency: 88,
          deepSleepPercent: 17,
          score: 75,
          state: 'ready',
        },
      });

      const invalid = coachRecommendRequestSchema.safeParse({
        recovery: {
          date: '2026-02-21',
          hrvMs: 44,
          hrvVsBaseline: 11,
          rhrBpm: 56,
          rhrVsBaseline: -3,
          sleepHours: 7.2,
          sleepEfficiency: 88,
          deepSleepPercent: 17,
          score: 75,
          state: 'ready',
          source: 'healthkit',
        },
      });

      expect(valid.success).toBe(true);
      expect(invalid.success).toBe(true);
      if (invalid.success) {
        expect(invalid.data.recovery?.source).toBeUndefined();
      }
    });
  });
});
