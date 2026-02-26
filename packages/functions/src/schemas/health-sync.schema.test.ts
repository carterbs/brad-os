import { describe, expect, it } from 'vitest';
import {
  bulkHRVSyncSchema,
  bulkRHRSyncSchema,
  bulkSleepSyncSchema,
  bulkWeightSyncSchema,
  coachRecommendRequestSchema,
  recoveryBaselineSchema,
  recoverySourceSchema,
  recoveryStateSchema,
  recoverySnapshotSchema,
  getRecoveryQuerySchema,
  syncHealthDataSchema,
  weightEntrySchema,
  weightSourceSchema,
} from './recovery.schema.js';

const validRecoverySnapshot = {
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
};

describe('recovery schemas', () => {
  describe('shared enums', () => {
    it('validates recoveryStateSchema values', () => {
      expect(recoveryStateSchema.safeParse('ready').success).toBe(true);
      expect(recoveryStateSchema.safeParse('moderate').success).toBe(true);
      expect(recoveryStateSchema.safeParse('recover').success).toBe(true);
      expect(recoveryStateSchema.safeParse('unknown').success).toBe(false);
    });

    it('validates recoverySourceSchema values', () => {
      expect(recoverySourceSchema.safeParse('healthkit').success).toBe(true);
      expect(recoverySourceSchema.safeParse('manual').success).toBe(false);
      expect(recoverySourceSchema.safeParse('app').success).toBe(false);
    });

    it('validates weightSourceSchema values', () => {
      expect(weightSourceSchema.safeParse('healthkit').success).toBe(true);
      expect(weightSourceSchema.safeParse('manual').success).toBe(true);
      expect(weightSourceSchema.safeParse('watch').success).toBe(false);
    });
  });

  describe('recoverySnapshotSchema', () => {
    it('accepts a fully valid recovery snapshot', () => {
      const result = recoverySnapshotSchema.safeParse(validRecoverySnapshot);
      expect(result.success).toBe(true);
    });

    it('rejects invalid date format', () => {
      const result = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        date: '02/20/2026',
      });

      expect(result.success).toBe(false);
    });

    it('accepts explicit min/max bounds for numeric metrics', () => {
      const lower = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
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
        ...validRecoverySnapshot,
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

    it('requires integer score values', () => {
      const result = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        score: 75.5,
      });

      expect(result.success).toBe(false);
    });

    it('requires mandatory state and source fields', () => {
      const missingStateSnapshot: Record<string, unknown> = { ...validRecoverySnapshot };
      delete missingStateSnapshot.state;

      const missingSourceSnapshot: Record<string, unknown> = { ...validRecoverySnapshot };
      delete missingSourceSnapshot.source;

      const missingState = recoverySnapshotSchema.safeParse(missingStateSnapshot);
      const missingSource = recoverySnapshotSchema.safeParse(missingSourceSnapshot);

      expect(missingState.success).toBe(false);
      expect(missingSource.success).toBe(false);
    });

    it('rejects score outside numeric bounds', () => {
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        score: 101,
      });
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        score: -1,
      });

      expect(tooHigh.success).toBe(false);
      expect(tooLow.success).toBe(false);
    });

    it('rejects hrvMs outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        hrvMs: -1,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        hrvMs: 301,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects hrvVsBaseline outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        hrvVsBaseline: -201,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        hrvVsBaseline: 201,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects rhrBpm outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        rhrBpm: 29,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        rhrBpm: 201,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects rhrVsBaseline outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        rhrVsBaseline: -51,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        rhrVsBaseline: 51,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects sleepHours outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        sleepHours: -0.1,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        sleepHours: 24.01,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects sleepEfficiency outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        sleepEfficiency: -1,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        sleepEfficiency: 101,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
    });

    it('rejects deepSleepPercent outside bounds', () => {
      const tooLow = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        deepSleepPercent: -1,
      });
      const tooHigh = recoverySnapshotSchema.safeParse({
        ...validRecoverySnapshot,
        deepSleepPercent: 101,
      });

      expect(tooLow.success).toBe(false);
      expect(tooHigh.success).toBe(false);
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

    it('passes through provided calculatedAt and accepts it', () => {
      const calculatedAt = '2026-02-21T00:00:00.000Z';
      const result = recoveryBaselineSchema.safeParse({
        hrvMedian: 42,
        hrvStdDev: 8,
        rhrMedian: 56,
        sampleCount: 30,
        calculatedAt,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.calculatedAt).toBe(calculatedAt);
      }
    });

    it('rejects fractional sampleCount values', () => {
      const result = recoveryBaselineSchema.safeParse({
        hrvMedian: 42,
        hrvStdDev: 8,
        rhrMedian: 56,
        sampleCount: 30.5,
      });

      expect(result.success).toBe(false);
    });

    it('rejects invalid sampleCount and invalid rhrMedian', () => {
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
        weights: Array.from({ length: 501 }, () => ({
          weightLbs: 180,
          date: '2026-02-21',
        })),
      });

      expect(emptyResult.success).toBe(false);
      expect(overLimit.success).toBe(false);
    });

    it('rejects bulk weight source enum mismatch', () => {
      const result = bulkWeightSyncSchema.safeParse({
        weights: [
          {
            weightLbs: 180,
            date: '2026-02-21',
            source: 'watch',
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('bulkHRVSyncSchema array bounds', () => {
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

    it('rejects empty and oversized arrays', () => {
      const emptyResult = bulkHRVSyncSchema.safeParse({ entries: [] });
      const overLimit = bulkHRVSyncSchema.safeParse({
        entries: Array.from({ length: 501 }, () => ({
          date: '2026-02-21',
          avgMs: 44,
          minMs: 30,
          maxMs: 60,
          sampleCount: 10,
        })),
      });

      expect(emptyResult.success).toBe(false);
      expect(overLimit.success).toBe(false);
    });

    it('rejects invalid source enum value', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
            source: 'watch',
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('requires integer sampleCount', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10.5,
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('rejects out-of-range HRV values', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 301,
            minMs: -1,
            maxMs: 999,
            sampleCount: 1,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('bulkRHRSyncSchema array bounds', () => {
    it('accepts valid RHR payload', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{
          date: '2026-02-21',
          avgBpm: 58,
          sampleCount: 18,
        }],
      });

      expect(result.success).toBe(true);
    });

    it('rejects empty and oversized arrays', () => {
      const emptyResult = bulkRHRSyncSchema.safeParse({ entries: [] });
      const overLimit = bulkRHRSyncSchema.safeParse({
        entries: Array.from({ length: 501 }, () => ({
          date: '2026-02-21',
          avgBpm: 58,
          sampleCount: 18,
        })),
      });

      expect(emptyResult.success).toBe(false);
      expect(overLimit.success).toBe(false);
    });

    it('rejects invalid source enum value', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgBpm: 58,
            sampleCount: 18,
            source: 'watch',
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('requires integer sampleCount', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{
          date: '2026-02-21',
          avgBpm: 58,
          sampleCount: 18.5,
        }],
      });

      expect(result.success).toBe(false);
    });

    it('rejects out-of-range avgBpm values', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{
          date: '2026-02-21',
          avgBpm: 201,
          sampleCount: 18,
        }],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('bulkSleepSyncSchema array bounds', () => {
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

    it('rejects empty and oversized arrays', () => {
      const emptyResult = bulkSleepSyncSchema.safeParse({ entries: [] });
      const overLimit = bulkSleepSyncSchema.safeParse({
        entries: Array.from({ length: 501 }, () => ({
          date: '2026-02-21',
          totalSleepMinutes: 420,
          inBedMinutes: 460,
          coreMinutes: 190,
          deepMinutes: 90,
          remMinutes: 120,
          awakeMinutes: 60,
          sleepEfficiency: 90,
        })),
      });

      expect(emptyResult.success).toBe(false);
      expect(overLimit.success).toBe(false);
    });

    it('rejects invalid source enum value', () => {
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
            sleepEfficiency: 90,
            source: 'watch',
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('requires integer minute fields', () => {
      const baseEntry = {
        date: '2026-02-21',
        totalSleepMinutes: 420,
        inBedMinutes: 460,
        coreMinutes: 190,
        deepMinutes: 90,
        remMinutes: 120,
        awakeMinutes: 60,
        sleepEfficiency: 90,
      };

      type SleepMinuteField =
        | 'totalSleepMinutes'
        | 'inBedMinutes'
        | 'coreMinutes'
        | 'deepMinutes'
        | 'remMinutes'
        | 'awakeMinutes';

      const minuteFields: SleepMinuteField[] = [
        'totalSleepMinutes',
        'inBedMinutes',
        'coreMinutes',
        'deepMinutes',
        'remMinutes',
        'awakeMinutes',
      ];

      for (const field of minuteFields) {
        const result = bulkSleepSyncSchema.safeParse({
          entries: [
            {
              ...baseEntry,
              [field]: 420.5,
            },
          ],
        });

        expect(result.success).toBe(false);
      }
    });

    it('rejects out-of-range sleep fields', () => {
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

  describe('sync/get/coach composition schemas', () => {
    const validSyncPayload = {
      recovery: validRecoverySnapshot,
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

    it('accepts full sync payload and valid minimal recovery-only payload', () => {
      const full = syncHealthDataSchema.safeParse(validSyncPayload);
      const minimal = syncHealthDataSchema.safeParse({ recovery: validSyncPayload.recovery });

      expect(full.success).toBe(true);
      expect(minimal.success).toBe(true);
    });

    it('rejects malformed nested baseline and weight objects', () => {
      const invalidBaseline = syncHealthDataSchema.safeParse({
        ...validSyncPayload,
        baseline: {
          ...validSyncPayload.baseline,
          sampleCount: -1,
        },
      });

      const invalidWeight = syncHealthDataSchema.safeParse({
        ...validSyncPayload,
        weight: {
          ...validSyncPayload.weight,
          weightLbs: -1,
        },
      });

      expect(invalidBaseline.success).toBe(false);
      expect(invalidWeight.success).toBe(false);
    });

    it('accepts empty query and strict date query values', () => {
      const empty = getRecoveryQuerySchema.safeParse({});
      const valid = getRecoveryQuerySchema.safeParse({ date: '2026-02-21' });
      const malformedToken = getRecoveryQuerySchema.safeParse({ date: '21-02-2026' });

      expect(empty.success).toBe(true);
      expect(valid.success).toBe(true);
      expect(malformedToken.success).toBe(false);
    });

    it('rejects malformed date token patterns', () => {
      const invalidSeparator = getRecoveryQuerySchema.safeParse({ date: '2026/02/21' });
      const missingSegment = getRecoveryQuerySchema.safeParse({ date: '21-02-2026' });

      expect(invalidSeparator.success).toBe(false);
      expect(missingSegment.success).toBe(false);
    });

    it('accepts coach request without recovery and strips source when present', () => {
      const minimal = coachRecommendRequestSchema.safeParse({});
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
      const stripped = coachRecommendRequestSchema.safeParse({
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

      expect(minimal.success).toBe(true);
      expect(valid.success).toBe(true);
      expect(stripped.success).toBe(true);

      if (stripped.success) {
        expect(stripped.data.recovery?.source).toBeUndefined();
      }

      if (valid.success) {
        expect(valid.data.recovery?.state).toBe('ready');
      }
    });

    it('rejects coach request with malformed nested recovery', () => {
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
          score: '75',
          state: 'ready',
        },
      });

      expect(invalid.success).toBe(false);
    });
  });
});
