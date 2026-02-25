import type { Firestore } from 'firebase-admin/firestore';
import type { Ingredient } from '../shared.js';
import { BaseRepository } from './base.repository.js';

/** Read-only DTO placeholders for BaseRepository contract */
interface IngredientCreateDTO {
  name: string;
  store_section: string;
}

interface IngredientUpdateDTO {
  name?: string;
  store_section?: string;
}

export class IngredientRepository extends BaseRepository<
  Ingredient,
  IngredientCreateDTO,
  IngredientUpdateDTO
> {
  constructor(db?: Firestore) {
    super('ingredients', db);
  }

  async findAll(): Promise<Ingredient[]> {
    const snapshot = await this.collection.orderBy('name').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Ingredient);
  }

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  create(_data: IngredientCreateDTO): Promise<Ingredient> {
    return Promise.reject(new Error('IngredientRepository.create is not implemented'));
  }

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  override async update(_id: string, _data: IngredientUpdateDTO): Promise<Ingredient | null> {
    return Promise.reject(new Error('IngredientRepository.update is not implemented'));
  }

  // Intentional read-only guardrail: Ingredient data is managed externally and not writable via this repository.
  override async delete(_id: string): Promise<boolean> {
    return Promise.reject(new Error('IngredientRepository.delete is not implemented'));
  }
}
