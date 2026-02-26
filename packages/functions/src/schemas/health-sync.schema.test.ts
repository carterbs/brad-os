import { describe, expect, it } from 'vitest';
import {
  bulkHRVSyncSchema,
  bulkRHRSyncSchema,
  bulkSleepSyncSchema,
  bulkWeightSyncSchema,
  coachRecommendRequestSchema,
  getRecoveryQuerySchema,
  recoveryBaselineSchema,
  recoverySourceSchema,
  recoverySnapshotSchema,
  recoveryStateSchema,
  syncHealthDataSchema,
  weightEntrySchema,
  weightSourceSchema,
  type RecoveryBaselineInput,
  type RecoverySnapshotInput,
  type WeightEntryInput,
} from './recovery.schema.js';

function buildValidRecoverySnapshot(): RecoverySnapshotInput {
  return {
    date: '2026-02-21',
    hrvMs: 45,
    hrvVsBaseline: 12.5,
    rhrBpm: 55,
    rhrVsBaseline: -2,
    sleepHours: 7.5,
    sleepEfficiency: 89,
    deepSleepPercent: 19,
    score: 77,
    state: 'ready',
    source: 'healthkit',
  };
}

function buildValidBaseline(): RecoveryBaselineInput {
  return {
    hrvMedian: 42,
    hrvStdDev: 8,
    rhrMedian: 56,
    sampleCount: 30,
  };
}

function buildValidWeightEntry(): WeightEntryInput {
  return {
    weightLbs: 180.4,
    date: '2026-02-21',
  };
}

describe('health sync schemas', () => {
  describe('recoveryStateSchema', () => {
    it('accepts ready|moderate|recover', () => {
      expect(recoveryStateSchema.safeParse('ready').success).toBe(true);
      expect(recoveryStateSchema.safeParse('moderate').success).toBe(true);
      expect(recoveryStateSchema.safeParse('recover').success).toBe(true);
    });

    it('rejects unknown state', () => {
      const result = recoveryStateSchema.safeParse('exhausted');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
    });
  });

  describe('recoverySourceSchema', () => {
    it('accepts healthkit', () => {
      expect(recoverySourceSchema.safeParse('healthkit').success).toBe(true);
    });

    it('rejects manual', () => {
      const result = recoverySourceSchema.safeParse('manual');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
    });
  });

  describe('weightSourceSchema', () => {
    it('accepts healthkit and manual', () => {
      expect(weightSourceSchema.safeParse('healthkit').success).toBe(true);
      expect(weightSourceSchema.safeParse('manual').success).toBe(true);
    });

    it('rejects unknown source', () => {
      const result = weightSourceSchema.safeParse('fitbit');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
    });
  });

  describe('recoverySnapshotSchema', () => {
    it('accepts a fully valid recovery snapshot', () => {
      const result = recoverySnapshotSchema.safeParse(buildValidRecoverySnapshot());

      expect(result.success).toBe(true);
    });

    it('accepts boundary numeric values', () => {
      const lower = recoverySnapshotSchema.safeParse({
        ...buildValidRecoverySnapshot(),
        hrvMs: 0,
        hrvVsBaseline: -200,
        rhrBpm: 30,
        rhrVsBaseline: -50,
        sleepHours: 0,
        sleepEfficiency: 0,
        deepSleepPercent: 0,
        score: 0,
      });
      const upper = recoverySnapshotSchema.safeParse({
        ...buildValidRecoverySnapshot(),
        hrvMs: 300,
        hrvVsBaseline: 200,
        rhrBpm: 200,
        rhrVsBaseline: 50,
        sleepHours: 24,
        sleepEfficiency: 100,
        deepSleepPercent: 100,
        score: 100,
      });

      expect(lower.success).toBe(true);
      expect(upper.success).toBe(true);
    });

    it('rejects numeric underflow, overflow, and non-integer score', () => {
      const base = buildValidRecoverySnapshot();
      const invalidCases: Array<{ field: keyof RecoverySnapshotInput; value: number; path: Array<string | number> }> = [
        { field: 'hrvMs', value: -0.1, path: ['hrvMs'] },
        { field: 'hrvMs', value: 300.1, path: ['hrvMs'] },
        { field: 'hrvVsBaseline', value: -200.1, path: ['hrvVsBaseline'] },
        { field: 'hrvVsBaseline', value: 200.1, path: ['hrvVsBaseline'] },
        { field: 'rhrBpm', value: 29.9, path: ['rhrBpm'] },
        { field: 'rhrBpm', value: 200.1, path: ['rhrBpm'] },
        { field: 'rhrVsBaseline', value: -50.1, path: ['rhrVsBaseline'] },
        { field: 'rhrVsBaseline', value: 50.1, path: ['rhrVsBaseline'] },
        { field: 'sleepHours', value: -0.1, path: ['sleepHours'] },
        { field: 'sleepHours', value: 24.1, path: ['sleepHours'] },
        { field: 'sleepEfficiency', value: -0.1, path: ['sleepEfficiency'] },
        { field: 'sleepEfficiency', value: 100.1, path: ['sleepEfficiency'] },
        { field: 'deepSleepPercent', value: -0.1, path: ['deepSleepPercent'] },
        { field: 'deepSleepPercent', value: 100.1, path: ['deepSleepPercent'] },
        { field: 'score', value: -0.1, path: ['score'] },
        { field: 'score', value: 100.1, path: ['score'] },
      ];

      const results = invalidCases.map(({ field, value }) =>
        recoverySnapshotSchema.safeParse({ ...base, [field]: value })
      );
      const nonIntegerScoreResult = recoverySnapshotSchema.safeParse({
        ...base,
        score: 77.4,
      });

      for (const result of results) {
        expect(result.success).toBe(false);
      }
      expect(nonIntegerScoreResult.success).toBe(false);
      expect(nonIntegerScoreResult.error?.issues[0]?.path).toEqual(['score']);
    });

    it('rejects invalid date format', () => {
      const result = recoverySnapshotSchema.safeParse({
        ...buildValidRecoverySnapshot(),
        date: '2026/02/21',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['date']);
      expect(result.error?.issues[0]?.message).toContain('Date must be in YYYY-MM-DD format');
    });

    it('rejects invalid enum fields', () => {
      const invalidState = recoverySnapshotSchema.safeParse({
        ...buildValidRecoverySnapshot(),
        state: 'unknown',
      });
      const invalidSource = recoverySnapshotSchema.safeParse({
        ...buildValidRecoverySnapshot(),
        source: 'manual',
      });

      expect(invalidState.success).toBe(false);
      expect(invalidState.error?.issues[0]?.path).toEqual(['state']);
      expect(invalidSource.success).toBe(false);
      expect(invalidSource.error?.issues[0]?.path).toEqual(['source']);
    });
  });

  describe('recoveryBaselineSchema', () => {
    it('accepts baseline with and without calculatedAt', () => {
      const withoutCalculatedAt = recoveryBaselineSchema.safeParse(buildValidBaseline());
      const withCalculatedAt = recoveryBaselineSchema.safeParse({
        ...buildValidBaseline(),
        calculatedAt: '2026-02-21T12:34:56.000Z',
      });

      expect(withoutCalculatedAt.success).toBe(true);
      expect(withCalculatedAt.success).toBe(true);
    });

    it('rejects invalid metric ranges and non-integer sampleCount', () => {
      const base = buildValidBaseline();
      const invalidCases: Array<{ field: keyof RecoveryBaselineInput; value: number; path: Array<string | number> }> = [
        { field: 'hrvMedian', value: -1, path: ['hrvMedian'] },
        { field: 'hrvMedian', value: 300.1, path: ['hrvMedian'] },
        { field: 'hrvStdDev', value: -0.1, path: ['hrvStdDev'] },
        { field: 'hrvStdDev', value: 100.1, path: ['hrvStdDev'] },
        { field: 'rhrMedian', value: 29.9, path: ['rhrMedian'] },
        { field: 'rhrMedian', value: 200.1, path: ['rhrMedian'] },
        { field: 'sampleCount', value: -1, path: ['sampleCount'] },
        { field: 'sampleCount', value: 1000.1, path: ['sampleCount'] },
      ];
      const nonIntegerSampleCount = recoveryBaselineSchema.safeParse({
        ...base,
        sampleCount: 30.5,
      });

      for (const invalidCase of invalidCases) {
        const result = recoveryBaselineSchema.safeParse({
          ...base,
          [invalidCase.field]: invalidCase.value,
        });
        expect(result.success).toBe(false);
      }

      expect(nonIntegerSampleCount.success).toBe(false);
      expect(nonIntegerSampleCount.error?.issues[0]?.path).toEqual(['sampleCount']);
    });
  });

  describe('weightEntrySchema', () => {
    it('accepts a valid weight entry', () => {
      const result = weightEntrySchema.safeParse(buildValidWeightEntry());

      expect(result.success).toBe(true);
    });

    it('rejects invalid weight values', () => {
      const nonPositiveWeight = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        weightLbs: 0,
      });
      const tooHeavyWeight = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        weightLbs: 1000.1,
      });

      expect(nonPositiveWeight.success).toBe(false);
      expect(nonPositiveWeight.error?.issues[0]?.path).toEqual(['weightLbs']);
      expect(tooHeavyWeight.success).toBe(false);
      expect(tooHeavyWeight.error?.issues[0]?.path).toEqual(['weightLbs']);
    });

    it('rejects invalid weight date format', () => {
      const result = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        date: '2026/02/21',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['date']);
    });
  });

  describe('bulkWeightSyncSchema', () => {
    it('accepts boundary array sizes', () => {
      const singleResult = bulkWeightSyncSchema.safeParse({
        weights: [buildValidWeightEntry()],
      });
      const maxResult = bulkWeightSyncSchema.safeParse({
        weights: Array.from({ length: 500 }, () => buildValidWeightEntry()),
      });

      expect(singleResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects empty and oversized arrays', () => {
      const emptyResult = bulkWeightSyncSchema.safeParse({ weights: [] });
      const overLimitResult = bulkWeightSyncSchema.safeParse({
        weights: Array.from({ length: 501 }, () => buildValidWeightEntry()),
      });

      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error?.issues[0]?.path).toEqual(['weights']);
      expect(overLimitResult.success).toBe(false);
      expect(overLimitResult.error?.issues[0]?.path).toEqual(['weights']);
    });

    it('rejects invalid source in weights entries', () => {
      const result = bulkWeightSyncSchema.safeParse({
        weights: [{ ...buildValidWeightEntry(), source: 'wearable' }],
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['weights', 0, 'source']);
    });
  });

  describe('bulkHRVSyncSchema', () => {
    it('accepts minimally valid payload', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('accepts boundary array sizes', () => {
      const minResult = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 1,
          },
        ],
      });
      const maxResult = bulkHRVSyncSchema.safeParse({
        entries: Array.from({ length: 500 }, () => ({
          date: '2026-02-21',
          avgMs: 44,
          minMs: 30,
          maxMs: 60,
          sampleCount: 10,
        })),
      });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects invalid date and source', () => {
      const invalidDate = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026/02/21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
          },
        ],
      });
      const invalidSource = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: '2026-02-21',
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
            source: 'manual',
          },
        ],
      });

      expect(invalidDate.success).toBe(false);
      expect(invalidDate.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSource.success).toBe(false);
      expect(invalidSource.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
    });

    it('rejects min/max violations and sampleCount constraints', () => {
      const base = {
        date: '2026-02-21',
        avgMs: 44,
        minMs: 30,
        maxMs: 60,
        sampleCount: 10,
      };
      const numericInvalid = [
        { ...base, avgMs: 300.1 },
        { ...base, avgMs: -0.1 },
        { ...base, minMs: 300.1 },
        { ...base, minMs: -0.1 },
        { ...base, maxMs: 300.1 },
        { ...base, maxMs: -0.1 },
      ];
      const invalidSampleCounts = [
        { ...base, sampleCount: 0 },
        { ...base, sampleCount: 1.5 },
      ];

      for (const payload of numericInvalid) {
        const result = bulkHRVSyncSchema.safeParse({ entries: [payload] });
        expect(result.success).toBe(false);
      }
      for (const payload of invalidSampleCounts) {
        const result = bulkHRVSyncSchema.safeParse({ entries: [payload] });
        expect(result.success).toBe(false);
      }

      const invalidPayload = bulkHRVSyncSchema.safeParse({ entries: [{ ...base, avgMs: 300.1 }] });
      expect(invalidPayload.error?.issues[0]?.path).toEqual(['entries', 0, 'avgMs']);
    });
  });

  describe('bulkRHRSyncSchema', () => {
    it('accepts minimally valid payload', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 18 }],
      });

      expect(result.success).toBe(true);
    });

    it('accepts boundary array sizes', () => {
      const minResult = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 1 }],
      });
      const maxResult = bulkRHRSyncSchema.safeParse({
        entries: Array.from({ length: 500 }, () => ({
          date: '2026-02-21',
          avgBpm: 58,
          sampleCount: 18,
        })),
      });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects invalid date, source, and metric bounds', () => {
      const invalidDate = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026/02/21', avgBpm: 58, sampleCount: 18 }],
      });
      const invalidSource = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 18, source: 'manual' }],
      });
      const invalidRange = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 29.9, sampleCount: 18 }],
      });

      expect(invalidDate.success).toBe(false);
      expect(invalidDate.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSource.success).toBe(false);
      expect(invalidSource.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
      expect(invalidRange.success).toBe(false);
      expect(invalidRange.error?.issues[0]?.path).toEqual(['entries', 0, 'avgBpm']);
    });

    it('rejects sampleCount integer constraints', () => {
      const belowMin = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 0 }],
      });
      const nonInteger = bulkRHRSyncSchema.safeParse({
        entries: [{ date: '2026-02-21', avgBpm: 58, sampleCount: 1.5 }],
      });

      expect(belowMin.success).toBe(false);
      expect(belowMin.error?.issues[0]?.path).toEqual(['entries', 0, 'sampleCount']);
      expect(nonInteger.success).toBe(false);
      expect(nonInteger.error?.issues[0]?.path).toEqual(['entries', 0, 'sampleCount']);
    });
  });

  describe('bulkSleepSyncSchema', () => {
    it('accepts minimally valid payload', () => {
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

    it('accepts boundary array sizes', () => {
      const minResult = bulkSleepSyncSchema.safeParse({
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
            source: 'healthkit',
          },
        ],
      });
      const maxResult = bulkSleepSyncSchema.safeParse({
        entries: Array.from({ length: 500 }, () => ({
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

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects invalid date and source', () => {
      const invalidDate = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: '2026/02/21',
            totalSleepMinutes: 420,
            inBedMinutes: 460,
            coreMinutes: 190,
            deepMinutes: 90,
            remMinutes: 120,
            awakeMinutes: 60,
            sleepEfficiency: 90,
          },
        ],
      });
      const invalidSource = bulkSleepSyncSchema.safeParse({
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
            source: 'manual',
          },
        ],
      });

      expect(invalidDate.success).toBe(false);
      expect(invalidDate.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSource.success).toBe(false);
      expect(invalidSource.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
    });

    it('rejects sleep metric min/max violations', () => {
      const outOfRangePayloads = [
        { totalSleepMinutes: -1 },
        { totalSleepMinutes: 1440.1 },
        { inBedMinutes: -1 },
        { inBedMinutes: 1440.1 },
        { coreMinutes: -1 },
        { coreMinutes: 1440.1 },
        { deepMinutes: -1 },
        { deepMinutes: 1440.1 },
        { remMinutes: -1 },
        { remMinutes: 1440.1 },
        { awakeMinutes: -1 },
        { awakeMinutes: 1440.1 },
        { sleepEfficiency: -0.1 },
        { sleepEfficiency: 110.1 },
      ].map((override) => {
        const base = {
          date: '2026-02-21',
          totalSleepMinutes: 420,
          inBedMinutes: 460,
          coreMinutes: 190,
          deepMinutes: 90,
          remMinutes: 120,
          awakeMinutes: 60,
          sleepEfficiency: 90,
        };
        return bulkSleepSyncSchema.safeParse({ entries: [{ ...base, ...override }] });
      });
      const firstIssuePath = outOfRangePayloads[0]?.error?.issues[0]?.path;

      for (const payload of outOfRangePayloads) {
        expect(payload.success).toBe(false);
      }
      expect(firstIssuePath).toEqual(['entries', 0, 'totalSleepMinutes']);
    });
  });

  describe('syncHealthDataSchema', () => {
    it('accepts full payload and minimal payload', () => {
      const fullPayload = {
        recovery: buildValidRecoverySnapshot(),
        baseline: buildValidBaseline(),
        weight: buildValidWeightEntry(),
      };
      const full = syncHealthDataSchema.safeParse(fullPayload);
      const minimal = syncHealthDataSchema.safeParse({ recovery: buildValidRecoverySnapshot() });

      expect(full.success).toBe(true);
      expect(minimal.success).toBe(true);
    });

    it('rejects invalid nested recovery', () => {
      const result = syncHealthDataSchema.safeParse({
        recovery: {
          ...buildValidRecoverySnapshot(),
          date: '2026/02/21',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['recovery', 'date']);
    });

    it('rejects invalid nested baseline', () => {
      const result = syncHealthDataSchema.safeParse({
        recovery: buildValidRecoverySnapshot(),
        baseline: {
          ...buildValidBaseline(),
          sampleCount: 1000.1,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['baseline', 'sampleCount']);
    });

    it('rejects invalid nested weight', () => {
      const result = syncHealthDataSchema.safeParse({
        recovery: buildValidRecoverySnapshot(),
        weight: {
          ...buildValidWeightEntry(),
          weightLbs: 0,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['weight', 'weightLbs']);
    });
  });

  describe('getRecoveryQuerySchema', () => {
    it('accepts an empty query and valid date query', () => {
      const empty = getRecoveryQuerySchema.safeParse({});
      const valid = getRecoveryQuerySchema.safeParse({ date: '2026-02-21' });

      expect(empty.success).toBe(true);
      expect(valid.success).toBe(true);
      expect(valid.data).toEqual({ date: '2026-02-21' });
    });

    it('rejects malformed date query', () => {
      const invalid = getRecoveryQuerySchema.safeParse({ date: '2026/02/21' });

      expect(invalid.success).toBe(false);
      expect(invalid.error?.issues[0]?.path).toEqual(['date']);
    });
  });

  describe('coachRecommendRequestSchema', () => {
    it('accepts request without recovery', () => {
      const result = coachRecommendRequestSchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('accepts recovery without source and strips source when provided', () => {
      const snapshotWithoutSource = buildValidRecoverySnapshot();
      delete snapshotWithoutSource.source;
      const withoutSource = coachRecommendRequestSchema.safeParse({
        recovery: {
          ...snapshotWithoutSource,
          score: 72,
        },
      });
      const withStrippedSource = coachRecommendRequestSchema.safeParse({
        recovery: {
          ...buildValidRecoverySnapshot(),
          source: 'healthkit',
          score: 72,
        },
      });

      expect(withoutSource.success).toBe(true);
      if (withoutSource.success) {
        expect('source' in withoutSource.data.recovery).toBe(false);
        expect(withoutSource.data).toEqual({
          recovery: {
            ...snapshotWithoutSource,
            score: 72,
          },
        });
      }

      expect(withStrippedSource.success).toBe(true);
      if (withStrippedSource.success) {
        expect('source' in withStrippedSource.data.recovery).toBe(false);
      }
    });
  });
});
