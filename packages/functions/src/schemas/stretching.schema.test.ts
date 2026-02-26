import { describe, expect, it } from 'vitest';
import { completedStretchSchema, createStretchSessionSchema } from './stretching.schema.js';

const validCompletedStretch = {
  region: 'neck',
  stretchId: 'thoracic-lift',
  stretchName: 'Thoracic Lift',
  durationSeconds: 45,
  skippedSegments: 1,
};

const validSessionPayload = {
  completedAt: '2026-02-25T12:34:56.789Z',
  totalDurationSeconds: 1800,
  regionsCompleted: 5,
  regionsSkipped: 1,
  stretches: [validCompletedStretch],
};

describe('stretching.schema', () => {
  describe('completedStretchSchema', () => {
    it('accepts a valid completed stretch payload', () => {
      const result = completedStretchSchema.safeParse(validCompletedStretch);
      expect(result.success).toBe(true);
    });

    it('accepts boundary values for duration and skipped segments', () => {
      const minDuration = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        durationSeconds: 1,
      });
      const maxSkippedSegments = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: 2,
      });

      expect(minDuration.success).toBe(true);
      expect(maxSkippedSegments.success).toBe(true);
    });

    it('accepts valid stretch definition with required fields', () => {
      const result = completedStretchSchema.safeParse(validCompletedStretch);
      expect(result.success).toBe(true);
    });

    it('accepts all valid body regions', () => {
      const regions = [
        'neck',
        'shoulders',
        'back',
        'hip_flexors',
        'glutes',
        'hamstrings',
        'quads',
        'calves',
      ] as const;

      for (const region of regions) {
        const result = completedStretchSchema.safeParse({
          ...validCompletedStretch,
          region,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid region enum values', () => {
      const invalid = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        region: 'lower_back',
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects non-positive and non-integer durationSeconds', () => {
      const zero = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        durationSeconds: 0,
      });
      const negative = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        durationSeconds: -1,
      });
      const fractional = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        durationSeconds: 30.5,
      });

      expect(zero.success).toBe(false);
      expect(negative.success).toBe(false);
      expect(fractional.success).toBe(false);
    });

    it('rejects empty stretch identifiers and names', () => {
      const emptyId = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        stretchId: '',
      });
      const emptyName = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        stretchName: '',
      });

      expect(emptyId.success).toBe(false);
      expect(emptyName.success).toBe(false);
    });

    it('rejects out-of-range and non-integer skippedSegments', () => {
      const negative = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: -1,
      });
      const aboveMax = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: 3,
      });
      const fractional = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: 1.5,
      });

      expect(negative.success).toBe(false);
      expect(aboveMax.success).toBe(false);
      expect(fractional.success).toBe(false);
    });
  });

  describe('createStretchSessionSchema', () => {
    it('accepts a valid stretch session payload', () => {
      const result = createStretchSessionSchema.safeParse(validSessionPayload);
      expect(result.success).toBe(true);
    });

    it('accepts valid stretch region list with one completed stretch', () => {
      const result = createStretchSessionSchema.safeParse(validSessionPayload);
      expect(result.success).toBe(true);
    });

    it('accepts nonnegative integer boundary aggregate values', () => {
      const zeroValues = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        totalDurationSeconds: 0,
        regionsCompleted: 0,
        regionsSkipped: 0,
      });

      expect(zeroValues.success).toBe(true);
    });

    it('rejects malformed datetime', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        completedAt: '2026-02-25 12:34:56',
      });

      expect(result.success).toBe(false);
    });

    it('rejects negative and non-integer aggregate counters', () => {
      const negativeCounter = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        totalDurationSeconds: -1,
        regionsCompleted: -1,
        regionsSkipped: -1,
      });
      const fractionalCounter = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        totalDurationSeconds: 1.5,
        regionsCompleted: 1.5,
        regionsSkipped: 1.5,
      });

      expect(negativeCounter.success).toBe(false);
      expect(fractionalCounter.success).toBe(false);
    });

    it('rejects empty stretches array', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        stretches: [],
      });

      expect(result.success).toBe(false);
    });

    it('rejects nested invalid completed stretch entries', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validSessionPayload,
        stretches: [{ ...validCompletedStretch, durationSeconds: 0.5 }],
      });

      expect(result.success).toBe(false);
    });
  });
});
