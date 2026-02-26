import type { Firestore } from 'firebase-admin/firestore';
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readNumber,
  readNullableString,
  readString,
} from './firestore-type-guards.js';

/** Read-only DTO placeholders for BaseRepository contract */
interface RecipeCreateDTO {
  meal_id: string;
}

interface RecipeUpdateDTO extends Record<string, unknown> {
  meal_id?: string;
}

export class RecipeRepository extends BaseRepository<
  Recipe,
  RecipeCreateDTO,
  RecipeUpdateDTO
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
  ): RecipeIngredient | null {
    if (!isRecord(ingredientData)) {
      return null;
    }

    const ingredientId = readString(ingredientData, 'ingredient_id');
    const rawQuantity = ingredientData['quantity'];
    const rawUnit = ingredientData['unit'];

    if (ingredientId === null || rawQuantity === undefined || rawUnit === undefined) {
      return null;
    }

    const quantity = rawQuantity === null ? null : readNumber(ingredientData, 'quantity');
    const unit = readNullableString(ingredientData, 'unit');

    if (quantity === null || unit === null || unit === undefined) {
      return null;
    }

    return {
      ingredient_id: ingredientId,
      quantity,
      unit,
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
    const stepsRaw = data['steps'];
    if (!Array.isArray(ingredientsRaw) || stepsRaw === undefined) {
      return null;
    }

    const ingredients: RecipeIngredient[] = [];
    for (const ingredient of ingredientsRaw) {
      const parsedIngredient = this.parseRecipeIngredient(ingredient);
      if (parsedIngredient === null) {
        return null;
      }
      ingredients.push(parsedIngredient);
    }

    let steps: RecipeStep[] | null;
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

  // Intentional read-only guardrail: Recipe data is managed externally and not writable via this repository.
  create(_data: RecipeCreateDTO): Promise<Recipe> {
    return Promise.reject(new Error('RecipeRepository.create is not implemented'));
  }

  // Intentional read-only guardrail: Recipe data is managed externally and not writable via this repository.
  override async update(_id: string, _data: RecipeUpdateDTO): Promise<Recipe | null> {
    return Promise.reject(new Error('RecipeRepository.update is not implemented'));
  }

  // Intentional read-only guardrail: Recipe data is managed externally and not writable via this repository.
  override async delete(_id: string): Promise<boolean> {
    return Promise.reject(new Error('RecipeRepository.delete is not implemented'));
  }
}
