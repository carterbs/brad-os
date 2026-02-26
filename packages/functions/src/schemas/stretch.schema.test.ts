import { describe, expect, it } from 'vitest';
import { stretchDefinitionSchema, stretchRegionSchema } from './stretch.schema.js';

describe('stretch.schema', () => {
  const validStretchDefinition = {
    id: 'neck-forward-tilt',
    name: 'Neck Forward Tilt',
    description: 'Gently stretch your neck forward and hold.',
    bilateral: false,
    image: 'https://example.com/stretch.png',
  };

  const validStretchRegion = {
    region: 'neck',
    displayName: 'Neck',
    iconName: 'figure.flexibility',
    stretches: [validStretchDefinition],
  };

  describe('stretchDefinitionSchema', () => {
    it('accepts valid payload with all required fields and optional image', () => {
      const result = stretchDefinitionSchema.safeParse(validStretchDefinition);
      expect(result.success).toBe(true);
    });

    it('accepts valid payload when image is omitted', () => {
      const result = stretchDefinitionSchema.safeParse({
        id: 'neck-forward-tilt',
        name: 'Neck Forward Tilt',
        description: 'Gently stretch your neck forward and hold.',
        bilateral: false,
      });

      expect(result.success).toBe(true);
    });

    it('accepts optional image at the 200-character upper boundary', () => {
      const result = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        image: 'a'.repeat(200),
      });

      expect(result.success).toBe(true);
    });

    it('accepts valid stretch definition with required fields', () => {
      const result = stretchDefinitionSchema.safeParse(validStretchDefinition);
      expect(result.success).toBe(true);
    });

    it('rejects empty required strings', () => {
      const emptyId = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        id: '',
      });
      const emptyName = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        name: '',
      });
      const emptyDescription = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        description: '',
      });

      expect(emptyId.success).toBe(false);
      expect(emptyName.success).toBe(false);
      expect(emptyDescription.success).toBe(false);
    });

    it('rejects length overflow for name, description, and image', () => {
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

    it('rejects non-boolean bilateral values', () => {
      const result = stretchDefinitionSchema.safeParse({
        ...validStretchDefinition,
        bilateral: 'false',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('stretchRegionSchema', () => {
    it('accepts valid region object with at least one stretch', () => {
      const result = stretchRegionSchema.safeParse(validStretchRegion);
      expect(result.success).toBe(true);
    });

    it('accepts each allowed region enum value', () => {
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
        const result = stretchRegionSchema.safeParse({
          ...validStretchRegion,
          region,
        });

        expect(result.success).toBe(true);
      }
    });

    it('rejects unknown region values', () => {
      const arms = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        region: 'arms',
      });
      const lowerBack = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        region: 'lower_back',
      });

      expect(arms.success).toBe(false);
      expect(lowerBack.success).toBe(false);
    });

    it('rejects empty/overflow displayName and iconName', () => {
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

    it('rejects empty stretches array', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        stretches: [],
      });

      expect(result.success).toBe(false);
    });

    it('rejects nested invalid stretchDefinition entries', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        stretches: [
          {
            ...validStretchDefinition,
            name: '',
          },
        ],
      });

      expect(result.success).toBe(false);
    });

    it('also rejects nested stretchDefinition entries missing required identifiers', () => {
      const result = stretchRegionSchema.safeParse({
        ...validStretchRegion,
        stretches: [{
          ...validStretchDefinition,
          id: '',
        }],
      });

      expect(result.success).toBe(false);
    });
  });
});
