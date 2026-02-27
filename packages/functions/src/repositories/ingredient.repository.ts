import type { Firestore } from 'firebase-admin/firestore';
import type { CreateIngredientDTO, Ingredient, UpdateIngredientDTO } from '../shared.js';
import { BaseRepository } from './base.repository.js';
import { isRecord, readString } from './firestore-type-guards.js';

export class IngredientRepository extends BaseRepository<
  Ingredient,
  CreateIngredientDTO,
  UpdateIngredientDTO
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

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  create(_data: CreateIngredientDTO): Promise<Ingredient> {
    return Promise.reject(new Error('IngredientRepository.create is not implemented'));
  }

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  override async update(_id: string, _data: UpdateIngredientDTO): Promise<Ingredient | null> {
    return Promise.reject(new Error('IngredientRepository.update is not implemented'));
  }

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  override async delete(_id: string): Promise<boolean> {
    return Promise.reject(new Error('IngredientRepository.delete is not implemented'));
  }
}
