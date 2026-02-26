import { describe, expect, it } from 'vitest';
import { stretchDefinitionSchema, stretchRegionSchema } from './stretch.schema.js';

const validStretchDefinition = {
  id: 'thoracic-lift',
  name: 'Thoracic Extension',
  description: 'Open up the thoracic spine with support.',
  bilateral: true,
};

describe('stretch.schema', () => {
  describe('stretchDefinitionSchema', () => {
    it('accepts valid stretch definition with required fields', () => {
      const result = stretchDefinitionSchema.safeParse(validStretchDefinition);
      expect(result.success).toBe(true);
    });

    it('accepts optional image at the 200-character upper boundary', () => {
      const result = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        image: 'a'.repeat(200),
      });

      expect(result.success).toBe(true);
    });

    it('rejects empty required string fields', () => {
      const noId = stretchDefinitionSchema.safeParse({ ...validStretchDefinition, id: '' });
      const noName = stretchDefinitionSchema.safeParse({ ...validStretchDefinition, name: '' });
      const noDescription = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        description: '',
      });

      expect(noId.success).toBe(false);
      expect(noName.success).toBe(false);
      expect(noDescription.success).toBe(false);
    });

    it('rejects over-limit string lengths for name, description, and image', () => {
      const longName = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        name: 'a'.repeat(101),
      });
      const longDescription = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        description: 'a'.repeat(1001),
      });
      const longImage = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        image: 'a'.repeat(201),
      });

      expect(longName.success).toBe(false);
      expect(longDescription.success).toBe(false);
      expect(longImage.success).toBe(false);
    });

    it('rejects non-boolean bilateral', () => {
      const result = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        bilateral: 'true' as unknown as boolean,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('stretchRegionSchema', () => {
    const validStretchRegion = {
      region: 'neck',
      displayName: 'Neck',
      iconName: 'neck',
      stretches: [validStretchDefinition],
    };

    it('accepts a valid region payload with at least one stretch', () => {
      const result = stretchRegionSchema.safeParse(validStretchRegion);
      expect(result.success).toBe(true);
    });

    it('accepts all supported body regions', () => {
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
        const result = stretchRegionSchema.safeParse({ ...validStretchRegion, region });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid region enum value', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        region: 'lower_back',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty or over-limit displayName and iconName', () => {
      const emptyDisplayName = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        displayName: '',
      });
      const longDisplayName = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        displayName: 'a'.repeat(51),
      });
      const emptyIconName = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        iconName: '',
      });
      const longIconName = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        iconName: 'a'.repeat(101),
      });

      expect(emptyDisplayName.success).toBe(false);
      expect(longDisplayName.success).toBe(false);
      expect(emptyIconName.success).toBe(false);
      expect(longIconName.success).toBe(false);
    });

    it('rejects empty stretches arrays', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        stretches: [],
      });

      expect(result.success).toBe(false);
    });

    it('rejects nested invalid stretch definitions', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        stretches: [{ ...validStretchDefinition, id: '' }],
      });

      expect(result.success).toBe(false);
    });
  });
});
