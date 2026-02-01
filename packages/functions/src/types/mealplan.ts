import type { BaseEntity } from './database.js';
import type { Meal, MealType } from './meal.js';

// ============ Meal Plan ============

export interface MealPlanEntry {
  day_index: number;
  meal_type: MealType;
  meal_id: string | null;
  meal_name: string | null;
}

export interface CritiqueOperation {
  day_index: number;
  meal_type: MealType;
  new_meal_id: string | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  operations?: CritiqueOperation[];
}

export interface MealPlanSession extends BaseEntity {
  plan: MealPlanEntry[];
  meals_snapshot: Meal[];
  history: ConversationMessage[];
  is_finalized: boolean;
}

export interface CreateMealPlanSessionDTO {
  plan: MealPlanEntry[];
  meals_snapshot: Meal[];
  history: ConversationMessage[];
  is_finalized: boolean;
}

export interface UpdateMealPlanSessionDTO {
  plan?: MealPlanEntry[];
  meals_snapshot?: Meal[];
  history?: ConversationMessage[];
  is_finalized?: boolean;
}

export interface CritiqueResponse {
  explanation: string;
  operations: CritiqueOperation[];
}
