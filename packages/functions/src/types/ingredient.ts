import type { BaseEntity } from './database.js';

export interface Ingredient extends BaseEntity {
  name: string;
  store_section: string;
}
