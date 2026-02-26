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

const VALID_DATE = '2026-02-21';

function buildValidRecoverySnapshot(): RecoverySnapshotInput {
  return {
    date: VALID_DATE,
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
    date: VALID_DATE,
  };
}

describe('health sync schemas', () => {
  describe('recoveryStateSchema', () => {
    it('accepts ready|moderate|recover', () => {
      const readyResult = recoveryStateSchema.safeParse('ready');
      const moderateResult = recoveryStateSchema.safeParse('moderate');
      const recoverResult = recoveryStateSchema.safeParse('recover');

      expect(readyResult.success).toBe(true);
      expect(moderateResult.success).toBe(true);
      expect(recoverResult.success).toBe(true);
    });

    it('rejects unknown value', () => {
      const result = recoveryStateSchema.safeParse('exhausted');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
          });
  });

  describe('recoverySourceSchema', () => {
    it('accepts healthkit', () => {
      const result = recoverySourceSchema.safeParse('healthkit');

      expect(result.success).toBe(true);
    });

    it('rejects manual', () => {
      const result = recoverySourceSchema.safeParse('manual');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
    });
  });

  describe('weightSourceSchema', () => {
    it('accepts healthkit and manual', () => {
      const healthkitResult = weightSourceSchema.safeParse('healthkit');
      const manualResult = weightSourceSchema.safeParse('manual');

      expect(healthkitResult.success).toBe(true);
      expect(manualResult.success).toBe(true);
    });

    it('rejects unknown value', () => {
      const result = weightSourceSchema.safeParse('fitbit');

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual([]);
    });
  });

  describe('recoverySnapshotSchema', () => {
    it('accepts fully valid snapshot payload', () => {
      const result = recoverySnapshotSchema.safeParse(buildValidRecoverySnapshot());

      expect(result.success).toBe(true);
    });

    it('accepts boundary numeric values', () => {
      const lowerBoundPayload = buildValidRecoverySnapshot();
      lowerBoundPayload.hrvMs = 0;
      lowerBoundPayload.hrvVsBaseline = -200;
      lowerBoundPayload.rhrBpm = 30;
      lowerBoundPayload.rhrVsBaseline = -50;
      lowerBoundPayload.sleepHours = 0;
      lowerBoundPayload.sleepEfficiency = 0;
      lowerBoundPayload.deepSleepPercent = 0;
      lowerBoundPayload.score = 0;

      const upperBoundPayload = buildValidRecoverySnapshot();
      upperBoundPayload.hrvMs = 300;
      upperBoundPayload.hrvVsBaseline = 200;
      upperBoundPayload.rhrBpm = 200;
      upperBoundPayload.rhrVsBaseline = 50;
      upperBoundPayload.sleepHours = 24;
      upperBoundPayload.sleepEfficiency = 100;
      upperBoundPayload.deepSleepPercent = 100;
      upperBoundPayload.score = 100;

      const lowerBoundResult = recoverySnapshotSchema.safeParse(lowerBoundPayload);
      const upperBoundResult = recoverySnapshotSchema.safeParse(upperBoundPayload);

      expect(lowerBoundResult.success).toBe(true);
      expect(upperBoundResult.success).toBe(true);
    });

    it('rejects numeric boundaries and non-integer score', () => {
      const base = buildValidRecoverySnapshot();
      const boundaryInvalidCases: Array<{ field: keyof RecoverySnapshotInput; value: number; path: Array<string | number> }> = [
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

      for (const invalidCase of boundaryInvalidCases) {
        const result = recoverySnapshotSchema.safeParse({ ...base, [invalidCase.field]: invalidCase.value });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(invalidCase.path);
      }

      const nonIntegerScoreResult = recoverySnapshotSchema.safeParse({ ...base, score: 77.4 });
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

    it('rejects invalid enum values', () => {
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
      const withoutCalculatedAtResult = recoveryBaselineSchema.safeParse(buildValidBaseline());
      const withCalculatedAtResult = recoveryBaselineSchema.safeParse({
        ...buildValidBaseline(),
        calculatedAt: '2026-02-21T12:34:56.000Z',
      });

      expect(withCalculatedAtResult.success).toBe(true);
      expect(withCalculatedAtResult.success).toBe(true);
      expect(withoutCalculatedAtResult.success).toBe(true);
    });

    it('rejects invalid hrv/rhr/sampleCount boundaries and non-integer sampleCount', () => {
      const base = buildValidBaseline();
      const boundaryInvalidCases: Array<{ field: keyof RecoveryBaselineInput; value: number; path: Array<string | number> }> = [
        { field: 'hrvMedian', value: -1, path: ['hrvMedian'] },
        { field: 'hrvMedian', value: 300.1, path: ['hrvMedian'] },
        { field: 'hrvStdDev', value: -1, path: ['hrvStdDev'] },
        { field: 'hrvStdDev', value: 100.1, path: ['hrvStdDev'] },
        { field: 'rhrMedian', value: 29.9, path: ['rhrMedian'] },
        { field: 'rhrMedian', value: 200.1, path: ['rhrMedian'] },
        { field: 'sampleCount', value: -1, path: ['sampleCount'] },
        { field: 'sampleCount', value: 1001, path: ['sampleCount'] },
        { field: 'sampleCount', value: 1000.1, path: ['sampleCount'] },
      ];

      for (const invalidCase of boundaryInvalidCases) {
        const result = recoveryBaselineSchema.safeParse({
          ...base,
          [invalidCase.field]: invalidCase.value,
        });
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(invalidCase.path);
      }

      const nonIntegerSampleCountResult = recoveryBaselineSchema.safeParse({
        ...base,
        sampleCount: 30.5,
      });
      expect(nonIntegerSampleCountResult.success).toBe(false);
      expect(nonIntegerSampleCountResult.error?.issues[0]?.path).toEqual(['sampleCount']);
    });
  });

  describe('weightEntrySchema', () => {
    it('accepts a valid weight entry', () => {
      const result = weightEntrySchema.safeParse(buildValidWeightEntry());

      expect(result.success).toBe(true);
    });

    it('rejects out-of-range weights', () => {
      const nonPositiveWeightResult = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        weightLbs: 0,
      });
      const aboveMaxWeightResult = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        weightLbs: 1001,
      });

      expect(nonPositiveWeightResult.success).toBe(false);
      expect(nonPositiveWeightResult.error?.issues[0]?.path).toEqual(['weightLbs']);
      expect(aboveMaxWeightResult.success).toBe(false);
      expect(aboveMaxWeightResult.error?.issues[0]?.path).toEqual(['weightLbs']);
    });

    it('rejects invalid date format', () => {
      const result = weightEntrySchema.safeParse({
        ...buildValidWeightEntry(),
        date: '2026/02/21',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['date']);
    });
  });

  describe('bulkWeightSyncSchema', () => {
    it('accepts min and max array sizes', () => {
      const minResult = bulkWeightSyncSchema.safeParse({
        weights: [buildValidWeightEntry()],
      });
      const maxResult = bulkWeightSyncSchema.safeParse({
        weights: Array.from({ length: 500 }, () => buildValidWeightEntry()),
      });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects min and max array violations', () => {
      const emptyResult = bulkWeightSyncSchema.safeParse({ weights: [] });
      const overLimitResult = bulkWeightSyncSchema.safeParse({
        weights: Array.from({ length: 501 }, () => buildValidWeightEntry()),
      });

      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error?.issues[0]?.path).toEqual(['weights']);
      expect(overLimitResult.success).toBe(false);
      expect(overLimitResult.error?.issues[0]?.path).toEqual(['weights']);
    });

    it('rejects invalid source value within entry payload', () => {
      const invalidSourceResult = bulkWeightSyncSchema.safeParse({
        weights: [
          {
            ...buildValidWeightEntry(),
            source: 'wearable',
          },
        ],
      });

      expect(invalidSourceResult.success).toBe(false);
      expect(invalidSourceResult.error?.issues[0]?.path).toEqual(['weights', 0, 'source']);
    });
  });

  describe('bulkHRVSyncSchema', () => {
    it('accepts minimally valid payload', () => {
      const result = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('accepts min and max array sizes', () => {
      const minResult = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 1,
          },
        ],
      });
      const maxResult = bulkHRVSyncSchema.safeParse({
        entries: Array.from({ length: 500 }, () => ({
          date: VALID_DATE,
          avgMs: 44,
          minMs: 30,
          maxMs: 60,
          sampleCount: 10,
        })),
      });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects invalid date or source', () => {
      const invalidDateResult = bulkHRVSyncSchema.safeParse({
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
      const invalidSourceResult = bulkHRVSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgMs: 44,
            minMs: 30,
            maxMs: 60,
            sampleCount: 10,
            source: 'manual',
          },
        ],
      });

      expect(invalidDateResult.success).toBe(false);
      expect(invalidDateResult.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSourceResult.success).toBe(false);
      expect(invalidSourceResult.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
    });

    it('rejects metric and sampleCount boundary violations', () => {
      const base = {
        date: VALID_DATE,
        avgMs: 44,
        minMs: 30,
        maxMs: 60,
        sampleCount: 10,
      };
      const metricOutOfRangePayloads = [
        { ...base, avgMs: -0.1 },
        { ...base, avgMs: 300.1 },
        { ...base, minMs: -0.1 },
        { ...base, minMs: 300.1 },
        { ...base, maxMs: -0.1 },
        { ...base, maxMs: 300.1 },
      ].map((payload) => bulkHRVSyncSchema.safeParse({ entries: [payload] }));

      const sampleCountOutOfRangePayloads = [
        bulkHRVSyncSchema.safeParse({
          entries: [
            {
              ...base,
              sampleCount: 0,
            },
          ],
        }),
        bulkHRVSyncSchema.safeParse({
          entries: [
            {
              ...base,
              sampleCount: 1.5,
            },
          ],
        }),
      ];

      for (const result of metricOutOfRangePayloads) {
        expect(result.success).toBe(false);
      }
      expect(metricOutOfRangePayloads[0]?.error?.issues[0]?.path).toEqual(['entries', 0, 'avgMs']);

      for (const result of sampleCountOutOfRangePayloads) {
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(['entries', 0, 'sampleCount']);
      }
    });
  });

  describe('bulkRHRSyncSchema', () => {
    it('accepts minimally valid payload', () => {
      const result = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 58,
            sampleCount: 18,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('accepts min and max array sizes', () => {
      const minResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 58,
            sampleCount: 1,
          },
        ],
      });
      const maxResult = bulkRHRSyncSchema.safeParse({
        entries: Array.from({ length: 500 }, () => ({
          date: VALID_DATE,
          avgBpm: 58,
          sampleCount: 18,
        })),
      });

      expect(minResult.success).toBe(true);
      expect(maxResult.success).toBe(true);
    });

    it('rejects invalid date/source and metric/sampleCount bounds', () => {
      const invalidDateResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: '2026/02/21',
            avgBpm: 58,
            sampleCount: 18,
          },
        ],
      });
      const invalidSourceResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 58,
            sampleCount: 18,
            source: 'manual',
          },
        ],
      });
      const invalidMetricResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 29.9,
            sampleCount: 18,
          },
        ],
      });
      const invalidMetricMaxResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 200.1,
            sampleCount: 18,
          },
        ],
      });
      const belowMinSampleCountResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 58,
            sampleCount: 0,
          },
        ],
      });
      const nonIntegerSampleCountResult = bulkRHRSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
            avgBpm: 58,
            sampleCount: 1.5,
          },
        ],
      });

      expect(invalidDateResult.success).toBe(false);
      expect(invalidDateResult.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSourceResult.success).toBe(false);
      expect(invalidSourceResult.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
      expect(invalidMetricResult.success).toBe(false);
      expect(invalidMetricResult.error?.issues[0]?.path).toEqual(['entries', 0, 'avgBpm']);
      expect(invalidMetricMaxResult.success).toBe(false);
      expect(invalidMetricMaxResult.error?.issues[0]?.path).toEqual(['entries', 0, 'avgBpm']);
      expect(belowMinSampleCountResult.success).toBe(false);
      expect(belowMinSampleCountResult.error?.issues[0]?.path).toEqual(['entries', 0, 'sampleCount']);
      expect(nonIntegerSampleCountResult.success).toBe(false);
      expect(nonIntegerSampleCountResult.error?.issues[0]?.path).toEqual(['entries', 0, 'sampleCount']);
    });
  });

  describe('bulkSleepSyncSchema', () => {
    it('accepts minimally valid payload', () => {
      const result = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
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

    it('accepts min and max array sizes', () => {
      const minResult = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
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
          date: VALID_DATE,
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
      const invalidDateResult = bulkSleepSyncSchema.safeParse({
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
      const invalidSourceResult = bulkSleepSyncSchema.safeParse({
        entries: [
          {
            date: VALID_DATE,
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

      expect(invalidDateResult.success).toBe(false);
      expect(invalidDateResult.error?.issues[0]?.path).toEqual(['entries', 0, 'date']);
      expect(invalidSourceResult.success).toBe(false);
      expect(invalidSourceResult.error?.issues[0]?.path).toEqual(['entries', 0, 'source']);
    });

    it('rejects metric min/max violations', () => {
      const base = {
        date: VALID_DATE,
        totalSleepMinutes: 420,
        inBedMinutes: 460,
        coreMinutes: 190,
        deepMinutes: 90,
        remMinutes: 120,
        awakeMinutes: 60,
        sleepEfficiency: 90,
      };
      const outOfRangePayloads = [
        { ...base, totalSleepMinutes: -1 },
        { ...base, totalSleepMinutes: 1440.1 },
        { ...base, inBedMinutes: -1 },
        { ...base, inBedMinutes: 1440.1 },
        { ...base, coreMinutes: -1 },
        { ...base, coreMinutes: 1440.1 },
        { ...base, deepMinutes: -1 },
        { ...base, deepMinutes: 1440.1 },
        { ...base, remMinutes: -1 },
        { ...base, remMinutes: 1440.1 },
        { ...base, awakeMinutes: -1 },
        { ...base, awakeMinutes: 1440.1 },
        { ...base, sleepEfficiency: -0.1 },
        { ...base, sleepEfficiency: 110.1 },
      ].map((override) => bulkSleepSyncSchema.safeParse({ entries: [override] }));

      for (const result of outOfRangePayloads) {
        expect(result.success).toBe(false);
      }

      expect(outOfRangePayloads[0]?.error?.issues[0]?.path).toEqual(['entries', 0, 'totalSleepMinutes']);
      expect(outOfRangePayloads[12]?.error?.issues[0]?.path).toEqual(['entries', 0, 'sleepEfficiency']);
    });
  });

  describe('syncHealthDataSchema', () => {
    it('accepts full payload and recovery-only payload', () => {
      const full = syncHealthDataSchema.safeParse({
        recovery: buildValidRecoverySnapshot(),
        baseline: buildValidBaseline(),
        weight: buildValidWeightEntry(),
      });
      const minimal = syncHealthDataSchema.safeParse({
        recovery: buildValidRecoverySnapshot(),
      });

      expect(full.success).toBe(true);
      expect(minimal.success).toBe(true);
    });

    it('rejects invalid nested recovery payload', () => {
      const result = syncHealthDataSchema.safeParse({
        recovery: {
          ...buildValidRecoverySnapshot(),
          date: '2026/02/21',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['recovery', 'date']);
    });

    it('rejects invalid nested baseline payload', () => {
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

    it('rejects invalid nested weight payload', () => {
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
    it('accepts empty payload and valid date', () => {
      const emptyResult = getRecoveryQuerySchema.safeParse({});
      const validDateResult = getRecoveryQuerySchema.safeParse({
        date: VALID_DATE,
      });

      expect(emptyResult.success).toBe(true);
      expect(validDateResult.success).toBe(true);
      expect(validDateResult.data).toEqual({ date: VALID_DATE });
    });

    it('rejects malformed date query', () => {
      const invalidDateResult = getRecoveryQuerySchema.safeParse({ date: '2026/02/21' });

      expect(invalidDateResult.success).toBe(false);
      expect(invalidDateResult.error?.issues[0]?.path).toEqual(['date']);
    });
  });

  describe('coachRecommendRequestSchema', () => {
    it('accepts request without recovery', () => {
      const result = coachRecommendRequestSchema.safeParse({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('accepts recovery without source', () => {
      const withoutSourcePayload = {
        date: VALID_DATE,
        hrvMs: 45,
        hrvVsBaseline: 12.5,
        rhrBpm: 55,
        rhrVsBaseline: -2,
        sleepHours: 7.5,
        sleepEfficiency: 89,
        deepSleepPercent: 19,
        score: 72,
        state: 'ready',
      };
      const withoutSourceResult = coachRecommendRequestSchema.safeParse({
        recovery: {
          ...withoutSourcePayload,
        },
      });
      expect(withoutSourceResult.success).toBe(true);
      expect(withoutSourceResult.data).toEqual({
        recovery: {
          ...withoutSourcePayload,
          score: 72,
        },
      });
    });

    it('strips source when provided', () => {
      const withSourceResult = coachRecommendRequestSchema.safeParse({
        recovery: {
          ...buildValidRecoverySnapshot(),
          score: 72,
        },
      });

      expect(withSourceResult.success).toBe(true);
      if (withSourceResult.success) {
        expect('source' in withSourceResult.data.recovery).toBe(false);
        expect(withSourceResult.data.recovery).toEqual({
          date: VALID_DATE,
          hrvMs: 45,
          hrvVsBaseline: 12.5,
          rhrBpm: 55,
          rhrVsBaseline: -2,
          sleepHours: 7.5,
          sleepEfficiency: 89,
          deepSleepPercent: 19,
          score: 72,
          state: 'ready',
        });
      }
    });
  });
});
