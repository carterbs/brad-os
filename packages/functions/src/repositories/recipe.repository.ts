import type { Firestore } from 'firebase-admin/firestore';
import type {
  Recipe,
  RecipeStep,
  CreateRecipeDTO,
  UpdateRecipeDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readNumber,
  readNullableString,
  readString,
} from './firestore-type-guards.js';
import { AppError } from '../types/errors.js';
import { MealRepository } from './meal.repository.js';
import { IngredientRepository } from './ingredient.repository.js';

export class RecipeRepository extends BaseRepository<
  Recipe,
  CreateRecipeDTO,
  UpdateRecipeDTO
> {
  constructor(db?: Firestore) {
    super('recipes', db);
  }

  async findAll(): Promise<Recipe[]> {
    const snapshot = await this.collection.orderBy('created_at').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((recipe): recipe is Recipe => recipe !== null);
  }

  async create(data: CreateRecipeDTO): Promise<Recipe> {
    const existing = await this.findByMealId(data.meal_id);
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Recipe already exists for this meal');
    }

    const mealRepo = new MealRepository(this.db);
    const meal = await mealRepo.findById(data.meal_id);
    if (!meal) {
      throw new AppError(404, 'NOT_FOUND', `Meal with id ${data.meal_id} not found`);
    }

    const ingredientRepo = new IngredientRepository(this.db);
    const missingIds: string[] = [];
    for (const ing of data.ingredients) {
      const found = await ingredientRepo.findById(ing.ingredient_id);
      if (!found) {
        missingIds.push(ing.ingredient_id);
      }
    }
    if (missingIds.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Missing ingredient IDs: ${missingIds.join(', ')}`);
    }

    const timestamps = this.createTimestamps();
    const recipeData = {
      meal_id: data.meal_id,
      ingredients: data.ingredients,
      steps: data.steps ?? null,
      ...timestamps,
    };

    const docRef = await this.collection.add(recipeData);
    return { id: docRef.id, ...recipeData };
  }

  async findByMealId(mealId: string): Promise<Recipe | null> {
    const snapshot = await this.collection.where('meal_id', '==', mealId).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    if (!doc) {
      return null;
    }
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }

  override async update(id: string, data: UpdateRecipeDTO): Promise<Recipe | null> {
    // meal_id is immutable — strip it from the update payload
    const { meal_id: _mealId, ...rest } = data;
    return super.update(id, rest as UpdateRecipeDTO);
  }

  async findByMealIds(mealIds: string[]): Promise<Recipe[]> {
    if (mealIds.length === 0) {
      return [];
    }
    const snapshot = await this.collection.where('meal_id', 'in', mealIds).get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((recipe): recipe is Recipe => recipe !== null);
  }

  protected parseRecipeIngredient(
    ingredientData: unknown
  ): Recipe['ingredients'][number] | null {
    if (!isRecord(ingredientData)) {
      return null;
    }

    const ingredientId = readString(ingredientData, 'ingredient_id');
    const rawQuantity = ingredientData['quantity'] ?? null;
    const rawUnit = ingredientData['unit'] ?? null;

    if (ingredientId === null) {
      return null;
    }

    const quantity = rawQuantity === null ? null : readNumber(ingredientData, 'quantity');
    const unit = rawUnit === null ? null : readNullableString(ingredientData, 'unit');

    if (rawQuantity !== null && quantity === null) {
      return null;
    }

    return {
      ingredient_id: ingredientId,
      quantity,
      unit: unit ?? null,
    };
  }

  protected parseRecipeStep(stepData: unknown): RecipeStep | null {
    if (!isRecord(stepData)) {
      return null;
    }

    const stepNumber = readNumber(stepData, 'step_number');
    const instruction = readString(stepData, 'instruction');

    if (stepNumber === null || instruction === null) {
      return null;
    }

    return {
      step_number: stepNumber,
      instruction,
    };
  }

  protected parseEntity(id: string, data: Record<string, unknown>): Recipe | null {
    const mealId = readString(data, 'meal_id');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (mealId === null || createdAt === null || updatedAt === null) {
      return null;
    }

    const ingredientsRaw = data['ingredients'];
    const stepsRaw = data['steps'] ?? null;
    if (!Array.isArray(ingredientsRaw)) {
      return null;
    }

    const ingredients: Recipe['ingredients'] = [];
    for (const ingredient of ingredientsRaw) {
      const parsedIngredient = this.parseRecipeIngredient(ingredient);
      if (parsedIngredient === null) {
        return null;
      }
      ingredients.push(parsedIngredient);
    }

    let steps: Recipe['steps'] | null;
    if (stepsRaw === null) {
      steps = null;
    } else if (Array.isArray(stepsRaw)) {
      steps = [];
      for (const step of stepsRaw) {
        const parsedStep = this.parseRecipeStep(step);
        if (parsedStep === null) {
          return null;
        }
        steps.push(parsedStep);
      }
    } else {
      return null;
    }

    return {
      id,
      meal_id: mealId,
      ingredients,
      steps,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

}
