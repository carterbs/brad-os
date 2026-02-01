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

  async findById(id: string): Promise<Ingredient | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as Ingredient;
  }

  /** Not implemented - ingredients are read-only via this API */
  create(_data: IngredientCreateDTO): Promise<Ingredient> {
    return Promise.reject(new Error('IngredientRepository.create is not implemented'));
  }

  /** Not implemented - ingredients are read-only via this API */
  update(_id: string, _data: IngredientUpdateDTO): Promise<Ingredient | null> {
    return Promise.reject(new Error('IngredientRepository.update is not implemented'));
  }

  /** Not implemented - ingredients are read-only via this API */
  delete(_id: string): Promise<boolean> {
    return Promise.reject(new Error('IngredientRepository.delete is not implemented'));
  }
}
