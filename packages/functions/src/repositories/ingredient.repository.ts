import type { Firestore } from 'firebase-admin/firestore';
import type { Ingredient, CreateIngredientDTO, UpdateIngredientDTO } from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { isRecord, readString } from './firestore-type-guards.js';

export class IngredientRepository extends BaseRepository<
  Ingredient,
  CreateIngredientDTO,
  UpdateIngredientDTO & Record<string, unknown>
> {
  constructor(db?: Firestore) {
    super('ingredients', db);
  }

  protected parseEntity(id: string, data: Record<string, unknown>): Ingredient | null {
    const name = readString(data, 'name');
    const storeSection = readString(data, 'store_section');
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');
    if (name === null || storeSection === null || createdAt === null || updatedAt === null) {
      return null;
    }
    return {
      id,
      name,
      store_section: storeSection,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async create(data: CreateIngredientDTO): Promise<Ingredient> {
    const timestamps = this.createTimestamps();
    const ingredientData = {
      name: data.name,
      store_section: data.store_section,
      ...timestamps,
    };

    const docRef = await this.collection.add(ingredientData);
    return {
      id: docRef.id,
      ...ingredientData,
    };
  }

  async findAll(): Promise<Ingredient[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((ingredient): ingredient is Ingredient => ingredient !== null);
  }
}
