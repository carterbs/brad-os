import { z } from 'zod';
const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner']);

export const mealPlanEntrySchema = z.object({
  day_index: z.number().int().min(0).max(6),
  meal_type: mealTypeSchema,
  meal_id: z.string().nullable(),
  meal_name: z.string().nullable(),
}).strict();

export const critiqueOperationSchema = z.object({
  day_index: z.number().int().min(0).max(6),
  meal_type: mealTypeSchema,
  new_meal_id: z.string().nullable(),
}).strict();

export const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  operations: z.array(critiqueOperationSchema).optional(),
}).strict();

const mealSchema = z.object({
  id: z.string(),
  name: z.string(),
  meal_type: mealTypeSchema,
  effort: z.number().int().min(1).max(10),
  has_red_meat: z.boolean(),
  prep_ahead: z.boolean(),
  url: z.string().min(0).max(2000),
  last_planned: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const mealPlanSessionSchema = z.object({
  id: z.string(),
  plan: z.array(mealPlanEntrySchema),
  meals_snapshot: z.array(mealSchema),
  history: z.array(conversationMessageSchema),
  is_finalized: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

export const createMealPlanSessionSchema = z.object({
  plan: z.array(mealPlanEntrySchema),
  meals_snapshot: z.array(mealSchema),
  history: z.array(conversationMessageSchema),
  is_finalized: z.boolean(),
}).strict();

export const updateMealPlanSessionSchema = z.object({
  plan: z.array(mealPlanEntrySchema).optional(),
  meals_snapshot: z.array(mealSchema).optional(),
  history: z.array(conversationMessageSchema).optional(),
  is_finalized: z.boolean().optional(),
}).strict();

export const applyOperationsResultSchema = z.object({
  updatedPlan: z.array(mealPlanEntrySchema),
  errors: z.array(z.string()),
}).strict();

export const critiqueInputSchema = z.object({
  critique: z.string().min(1).max(2000),
}).strict();

export const critiqueResponseSchema = z.object({
  explanation: z.string().min(1).max(2000),
  operations: z.array(critiqueOperationSchema),
}).strict();
