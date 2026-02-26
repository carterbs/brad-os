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
  image: z.string().max(200).optional(),
});

export const stretchRegionSchema = z.object({
  region: bodyRegionEnum,
  displayName: z.string().min(1).max(50),
  iconName: z.string().min(1).max(100),
  stretches: z.array(stretchDefinitionSchema).min(1),
});

export const createStretchSchema = stretchRegionSchema;
export const updateStretchSchema = createStretchSchema.partial();

export type CreateStretchInput = z.input<typeof createStretchSchema>;
export type UpdateStretchInput = z.input<typeof updateStretchSchema>;
export type CreateStretchDTO = CreateStretchInput;
export type UpdateStretchDTO = UpdateStretchInput;

export type StretchDefinitionInput = z.infer<typeof stretchDefinitionSchema>;
export type StretchRegionInput = z.infer<typeof stretchRegionSchema>;
