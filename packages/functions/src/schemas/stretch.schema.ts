import { z } from 'zod';

const bodyRegionEnum = z.enum([
  'neck',
  'shoulders',
  'back',
  'hip_flexors',
  'glutes',
  'hamstrings',
  'quads',
  'calves',
]);

export const stretchDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  bilateral: z.boolean(),
});

export const stretchRegionSchema = z.object({
  region: bodyRegionEnum,
  displayName: z.string().min(1).max(50),
  iconName: z.string().min(1).max(100),
  stretches: z.array(stretchDefinitionSchema).min(1),
});

export type StretchDefinitionInput = z.infer<typeof stretchDefinitionSchema>;
export type StretchRegionInput = z.infer<typeof stretchRegionSchema>;
