import { z } from 'zod';
import type { Meal } from './meal.js';

export type MealPlanEntry = z.infer<
  typeof import('../schemas/mealplan.schema.js').mealPlanEntrySchema
>;
export type ConversationMessage = z.infer<
  typeof import('../schemas/mealplan.schema.js').conversationMessageSchema
>;
export type CritiqueOperation = z.infer<
  typeof import('../schemas/mealplan.schema.js').critiqueOperationSchema
>;
export type MealPlanSession = z.infer<
  typeof import('../schemas/mealplan.schema.js').mealPlanSessionSchema
>;
export type CreateMealPlanSessionDTO = z.infer<
  typeof import('../schemas/mealplan.schema.js').createMealPlanSessionSchema
>;
export type UpdateMealPlanSessionDTO = z.infer<
  typeof import('../schemas/mealplan.schema.js').updateMealPlanSessionSchema
>;
export type CritiqueResponse = z.infer<
  typeof import('../schemas/mealplan.schema.js').critiqueResponseSchema
>;
export type ApplyOperationsResult = z.infer<
  typeof import('../schemas/mealplan.schema.js').applyOperationsResultSchema
>;

export interface MealPlanRecencyMealRepository {
  updateLastPlanned(id: string, timestamp: string | null): Promise<Meal | null>;
}

export interface MealPlanRecencySessionRepository {
  findAll(): Promise<MealPlanSession[]>;
}

export interface MealPlanRecencyReconciliationParams {
  previousPlan: ReadonlyArray<MealPlanEntry>;
  nextPlan: ReadonlyArray<MealPlanEntry>;
  sessionRepository: MealPlanRecencySessionRepository;
  mealRepository: MealPlanRecencyMealRepository;
}

export interface MealPlanRecencyReconciliationResult {
  affectedMealIds: string[];
}
