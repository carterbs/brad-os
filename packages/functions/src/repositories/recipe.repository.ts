import type { Firestore } from 'firebase-admin/firestore';
import type { Recipe } from '../shared.js';
import { BaseRepository } from './base.repository.js';

/** Read-only DTO placeholders for BaseRepository contract */
interface RecipeCreateDTO {
  meal_id: string;
}

interface RecipeUpdateDTO {
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
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Recipe);
  }

  async findByMealIds(mealIds: string[]): Promise<Recipe[]> {
    if (mealIds.length === 0) {
      return [];
    }
    const snapshot = await this.collection.where('meal_id', 'in', mealIds).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Recipe);
  }

  create(_data: RecipeCreateDTO): Promise<Recipe> {
    return Promise.reject(new Error('RecipeRepository.create is not implemented'));
  }

  override async update(_id: string, _data: RecipeUpdateDTO): Promise<Recipe | null> {
    return Promise.reject(new Error('RecipeRepository.update is not implemented'));
  }

  override async delete(_id: string): Promise<boolean> {
    return Promise.reject(new Error('RecipeRepository.delete is not implemented'));
  }
}
