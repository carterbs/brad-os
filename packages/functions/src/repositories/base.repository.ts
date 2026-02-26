import {
  type Firestore,
  type CollectionReference,
  type DocumentData,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import {
  isRecord,
} from './firestore-type-guards.js';

export abstract class BaseRepository<T extends { id: string }, CreateDTO, UpdateDTO extends Record<string, unknown>> {
  protected db: Firestore;
  protected collectionName: string;
  protected includeTimestampOnUpdate = true;

  constructor(collectionName: string, db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName(collectionName);
  }

  protected get collection(): CollectionReference<DocumentData> {
    return this.db.collection(this.collectionName);
  }

  abstract create(data: CreateDTO): Promise<T>;
  abstract findAll(): Promise<T[]>;
  protected abstract parseEntity(id: string, data: Record<string, unknown>): T | null;

  async findById(id: string): Promise<T | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }

    return this.docToEntity(doc);
  }

  async update(id: string, data: UpdateDTO): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates = this.buildUpdatePayload(data);

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    if (this.includeTimestampOnUpdate) {
      updates['updated_at'] = this.updateTimestamp();
    }

    await this.collection.doc(id).update(updates);
    return this.findById(id);
  }

  protected buildUpdatePayload(data: UpdateDTO): Record<string, unknown> {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }
    return updates;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }

  protected updateTimestamp(): string {
    return new Date().toISOString();
  }

  protected createTimestamps(): { created_at: string; updated_at: string } {
    const now = new Date().toISOString();
    return { created_at: now, updated_at: now };
  }

  protected docToEntity(doc: DocumentSnapshot<DocumentData>): T | null {
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }
}
