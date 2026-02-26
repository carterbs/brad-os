import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completedStretchSchema, createStretchSessionSchema } from './stretching.schema.js';
import { stretchDefinitionSchema, stretchRegionSchema } from './stretch.schema.js';

function buildValidStretchDefinition(overrides: Partial<z.input<typeof stretchDefinitionSchema>> = {}): z.input<typeof stretchDefinitionSchema> {
  return {
    id: 'neck-01',
    name: 'Neck Opener',
    description: 'Slow shoulder roll and neck mobility sequence.',
    bilateral: true,
    image: 'https://example.com/neck-opener.png',
    ...overrides,
  };
}

function buildValidStretchRegion(overrides: Partial<z.input<typeof stretchRegionSchema>> = {}): z.input<typeof stretchRegionSchema> {
  return {
    region: 'neck',
    displayName: 'Neck',
    iconName: 'neck-icon',
    stretches: [buildValidStretchDefinition()],
    ...overrides,
  };
}

function buildValidCompletedStretch(overrides: Partial<z.input<typeof completedStretchSchema>> = {}): z.input<typeof completedStretchSchema> {
  return {
    region: 'neck',
    stretchId: 'neck-01',
    stretchName: 'Neck Opener',
    durationSeconds: 90,
    skippedSegments: 0,
    ...overrides,
  };
}

function buildValidStretchSession(overrides: Partial<z.input<typeof createStretchSessionSchema>> = {}): z.input<typeof createStretchSessionSchema> {
  return {
    completedAt: '2026-02-21T07:00:00.000Z',
    totalDurationSeconds: 180,
    regionsCompleted: 2,
    regionsSkipped: 0,
    stretches: [buildValidCompletedStretch()],
    ...overrides,
  };
}

describe('stretch schemas', () => {
  describe('stretchDefinitionSchema', () => {
    it('accepts a valid stretch definition', () => {
      const result = stretchDefinitionSchema.safeParse(buildValidStretchDefinition());

      expect(result.success).toBe(true);
    });

    it('rejects empty and overlong definition fields', () => {
      const emptyIdResult = stretchDefinitionSchema.safeParse({
        ...buildValidStretchDefinition(),
        id: '',
      });
      const overlongDescriptionResult = stretchDefinitionSchema.safeParse({
        ...buildValidStretchDefinition(),
        description: 'x'.repeat(1001),
      });

      expect(emptyIdResult.success).toBe(false);
      expect(emptyIdResult.error?.issues[0]?.path).toEqual(['id']);
      expect(overlongDescriptionResult.success).toBe(false);
      expect(overlongDescriptionResult.error?.issues[0]?.path).toEqual(['description']);
    });
  });

  describe('stretchRegionSchema', () => {
    it('accepts a valid stretch region', () => {
      const result = stretchRegionSchema.safeParse(buildValidStretchRegion());

      expect(result.success).toBe(true);
    });

    it('rejects invalid region enum values', () => {
      const result = stretchRegionSchema.safeParse({
        ...buildValidStretchRegion(),
        region: 'ankles',
      } as unknown as z.input<typeof stretchRegionSchema>);

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(['region']);
    });

    it('rejects empty stretch lists and invalid nested stretch payloads', () => {
      const emptyStretchesResult = stretchRegionSchema.safeParse({
        ...buildValidStretchRegion(),
        stretches: [],
      });
      const invalidNestedResult = stretchRegionSchema.safeParse({
        ...buildValidStretchRegion(),
        stretches: [
          {
            ...buildValidStretchDefinition(),
            image: '',
            name: '',
          },
        ],
      });

      expect(emptyStretchesResult.success).toBe(false);
      expect(emptyStretchesResult.error?.issues[0]?.path).toEqual(['stretches']);
      expect(invalidNestedResult.success).toBe(false);
      expect(invalidNestedResult.error?.issues[0]?.path).toEqual(['stretches', 0, 'name']);
    });
  });

  describe('completedStretchSchema', () => {
    it('accepts a valid completed stretch', () => {
      const result = completedStretchSchema.safeParse(buildValidCompletedStretch());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationSeconds).toBe(90);
      }
    });

    it('rejects skipped segment and duration boundary violations', () => {
      const belowRange = completedStretchSchema.safeParse({
        ...buildValidCompletedStretch(),
        skippedSegments: -1,
      });
      const overRange = completedStretchSchema.safeParse({
        ...buildValidCompletedStretch(),
        skippedSegments: 3,
      });
      const zeroDuration = completedStretchSchema.safeParse({
        ...buildValidCompletedStretch(),
        durationSeconds: 0,
      });
      const fractionalDuration = completedStretchSchema.safeParse({
        ...buildValidCompletedStretch(),
        durationSeconds: 90.5,
      });

      expect(belowRange.success).toBe(false);
      expect(belowRange.error?.issues[0]?.path).toEqual(['skippedSegments']);
      expect(overRange.success).toBe(false);
      expect(overRange.error?.issues[0]?.path).toEqual(['skippedSegments']);
      expect(zeroDuration.success).toBe(false);
      expect(zeroDuration.error?.issues[0]?.path).toEqual(['durationSeconds']);
      expect(fractionalDuration.success).toBe(false);
      expect(fractionalDuration.error?.issues[0]?.path).toEqual(['durationSeconds']);
    });
  });

  describe('createStretchSessionSchema', () => {
    it('accepts a valid stretch session payload', () => {
      const result = createStretchSessionSchema.safeParse(buildValidStretchSession());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stretches).toHaveLength(1);
        expect(result.data.completedAt).toBe('2026-02-21T07:00:00.000Z');
      }
    });

    it('accepts non-negative session metric boundaries', () => {
      const zeroTotalsResult = createStretchSessionSchema.safeParse(
        buildValidStretchSession({
          totalDurationSeconds: 0,
          regionsCompleted: 0,
          regionsSkipped: 0,
        })
      );

      expect(zeroTotalsResult.success).toBe(true);
      if (zeroTotalsResult.success) {
        expect(zeroTotalsResult.data.totalDurationSeconds).toBe(0);
      }
    });

    it('rejects invalid datetime, negative counts, and empty stretch arrays', () => {
      const invalidDateResult = createStretchSessionSchema.safeParse({
        ...buildValidStretchSession(),
        completedAt: '2026-02-21',
      });
      const negativeCompletedResult = createStretchSessionSchema.safeParse({
        ...buildValidStretchSession(),
        regionsCompleted: -1,
      });
      const emptyStretchListResult = createStretchSessionSchema.safeParse({
        ...buildValidStretchSession(),
        stretches: [],
      });

      expect(invalidDateResult.success).toBe(false);
      expect(invalidDateResult.error?.issues[0]?.path).toEqual(['completedAt']);
      expect(negativeCompletedResult.success).toBe(false);
      expect(negativeCompletedResult.error?.issues[0]?.path).toEqual(['regionsCompleted']);
      expect(emptyStretchListResult.success).toBe(false);
      expect(emptyStretchListResult.error?.issues[0]?.path).toEqual(['stretches']);
    });
  });
});
