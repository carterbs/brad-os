import type { BaseEntity } from './database.js';

export interface RecipeIngredient {
  ingredient_id: string;
  quantity: number | null;
  unit: string | null;
}

export interface RecipeStep {
  step_number: number;
  instruction: string;
}

export interface Recipe extends BaseEntity {
  meal_id: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[] | null;
}
