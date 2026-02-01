import type { Firestore } from 'firebase-admin/firestore';
import type {
  Meal,
  CreateMealDTO,
  UpdateMealDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';

export class MealRepository extends BaseRepository<
  Meal,
  CreateMealDTO,
  UpdateMealDTO
> {
  constructor(db?: Firestore) {
    super('meals', db);
  }

  async create(data: CreateMealDTO): Promise<Meal> {
    const timestamps = this.createTimestamps();
    const mealData = {
      name: data.name,
      meal_type: data.meal_type,
      effort: data.effort,
      has_red_meat: data.has_red_meat,
      url: data.url,
      last_planned: null,
      ...timestamps,
    };

    const docRef = await this.collection.add(mealData);
    const meal: Meal = {
      id: docRef.id,
      ...mealData,
    };

    return meal;
  }

  async findById(id: string): Promise<Meal | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Meal;
  }

  async findAll(): Promise<Meal[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Meal);
  }

  async findByType(mealType: string): Promise<Meal[]> {
    const snapshot = await this.collection
      .where('meal_type', '==', mealType)
      .orderBy('name')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Meal);
  }

  async update(id: string, data: UpdateMealDTO): Promise<Meal | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: Record<string, string | number | boolean> = {};

    if (data.name !== undefined) {
      updates['name'] = data.name;
    }

    if (data.meal_type !== undefined) {
      updates['meal_type'] = data.meal_type;
    }

    if (data.effort !== undefined) {
      updates['effort'] = data.effort;
    }

    if (data.has_red_meat !== undefined) {
      updates['has_red_meat'] = data.has_red_meat;
    }

    if (data.url !== undefined) {
      updates['url'] = data.url;
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    updates['updated_at'] = this.updateTimestamp();

    await this.collection.doc(id).update(updates);
    return this.findById(id);
  }

  async updateLastPlanned(id: string, timestamp: string): Promise<Meal | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.collection.doc(id).update({
      last_planned: timestamp,
      updated_at: this.updateTimestamp(),
    });

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }
}
