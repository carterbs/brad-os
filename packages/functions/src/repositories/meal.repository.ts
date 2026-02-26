import type { Firestore } from 'firebase-admin/firestore';
import type {
  Meal,
  CreateMealDTO,
  UpdateMealDTO,
} from '../shared.js';
import { BaseRepository } from './base.repository.js';
import {
  isRecord,
  readBoolean,
  readEnum,
  readNumber,
  readString,
} from './firestore-type-guards.js';

export class MealRepository extends BaseRepository<
  Meal,
  CreateMealDTO,
  UpdateMealDTO & Record<string, unknown>
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
      prep_ahead: data.prep_ahead,
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

  protected parseEntity(id: string, data: Record<string, unknown>): Meal | null {
    const name = readString(data, 'name');
    const mealType = readEnum(data, 'meal_type', ['breakfast', 'lunch', 'dinner'] as const);
    const effort = readNumber(data, 'effort');
    const hasRedMeat = readBoolean(data, 'has_red_meat');
    const prepAhead = readBoolean(data, 'prep_ahead');
    const url = readString(data, 'url');
    const rawLastPlanned = data['last_planned'];
    const lastPlanned =
      rawLastPlanned === undefined || rawLastPlanned === null
        ? null
        : readString(data, 'last_planned');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      name === null ||
      mealType === null ||
      effort === null ||
      hasRedMeat === null ||
      prepAhead === null ||
      url === null ||
      createdAt === null ||
      updatedAt === null ||
      (rawLastPlanned !== undefined && rawLastPlanned !== null && lastPlanned === null)
    ) {
      return null;
    }

    return {
      id,
      name,
      meal_type: mealType,
      effort,
      has_red_meat: hasRedMeat,
      prep_ahead: prepAhead,
      url,
      last_planned: lastPlanned,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async findAll(): Promise<Meal[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((meal): meal is Meal => meal !== null);
  }

  async findByType(mealType: string): Promise<Meal[]> {
    const snapshot = await this.collection
      .where('meal_type', '==', mealType)
      .orderBy('name')
      .get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((meal): meal is Meal => meal !== null);
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
}
