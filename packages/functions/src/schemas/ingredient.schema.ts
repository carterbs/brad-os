import { z } from 'zod';

export const ingredientResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  store_section: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const createIngredientSchema = z.object({
  name: z.string(),
  store_section: z.string(),
}).strict();

export const updateIngredientSchema = z.object({
  name: z.string().optional(),
  store_section: z.string().optional(),
}).strict();
