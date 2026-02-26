import { describe, expect, it } from 'vitest';
import { completedStretchSchema, createStretchSessionSchema } from './stretching.schema.js';

describe('stretching.schema', () => {
  const validCompletedStretch = {
    region: 'neck',
    stretchId: 'neck-forward-tilt',
    stretchName: 'Neck Forward Tilt',
    durationSeconds: 60,
    skippedSegments: 1,
  };

  const validStretchSession = {
    completedAt: '2026-02-25T12:34:56.789Z',
    totalDurationSeconds: 600,
    regionsCompleted: 8,
    regionsSkipped: 2,
    stretches: [validCompletedStretch],
  };

  describe('completedStretchSchema', () => {
    it('accepts a valid completed stretch payload', () => {
      const result = completedStretchSchema.safeParse(validCompletedStretch);
      expect(result.success).toBe(true);
    });

    it('accepts boundary skippedSegments values', () => {
      const zeroSkips = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: 0,
      });
      const maxSkips = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        skippedSegments: 2,
      });

      expect(zeroSkips.success).toBe(true);
      expect(maxSkips.success).toBe(true);
    });

    it('rejects invalid region enum values', () => {
      const result = completedStretchSchema.safeParse({
        ...validCompletedStretch,
        region: 'arms',
      });

      expect(result.success).toBe(false);
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

    it('rejects empty stretchId and stretchName', () => {
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
  });

  describe('createStretchSessionSchema', () => {
    it('accepts valid session payload with ISO datetime and non-empty stretches', () => {
      const result = createStretchSessionSchema.safeParse(validStretchSession);
      expect(result.success).toBe(true);
    });

    it('accepts nonnegative integer boundaries at zero for aggregate fields', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        totalDurationSeconds: 0,
        regionsCompleted: 0,
        regionsSkipped: 0,
      });

      expect(result.success).toBe(true);
    });

    it('rejects malformed datetime', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        completedAt: '2026-02-25 12:34:56',
      });

      expect(result.success).toBe(false);
    });

    it('rejects negative and non-integer aggregate counters', () => {
      const negativeDuration = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        totalDurationSeconds: -1,
      });
      const fractionalDuration = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        totalDurationSeconds: 600.5,
      });
      const negativeRegionsCompleted = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        regionsCompleted: -1,
      });
      const fractionalRegionsSkipped = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        regionsSkipped: 1.5,
      });

      expect(negativeDuration.success).toBe(false);
      expect(fractionalDuration.success).toBe(false);
      expect(negativeRegionsCompleted.success).toBe(false);
      expect(fractionalRegionsSkipped.success).toBe(false);
    });

    it('rejects empty stretches array', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        stretches: [],
      });

      expect(result.success).toBe(false);
    });

    it('rejects nested invalid completed stretch entries', () => {
      const result = createStretchSessionSchema.safeParse({
        ...validStretchSession,
        stretches: [
          {
            ...validCompletedStretch,
            durationSeconds: 0,
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });
});
