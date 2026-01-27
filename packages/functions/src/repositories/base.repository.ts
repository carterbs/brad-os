import {
  type Firestore,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getFirestoreDb, getCollectionName } from '../firebase.js';

export abstract class BaseRepository<T, CreateDTO, UpdateDTO> {
  protected db: Firestore;
  protected collectionName: string;

  constructor(collectionName: string, db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName(collectionName);
  }

  protected get collection(): CollectionReference<DocumentData> {
    return this.db.collection(this.collectionName);
  }

  abstract create(data: CreateDTO): Promise<T>;
  abstract findById(id: string): Promise<T | null>;
  abstract findAll(): Promise<T[]>;
  abstract update(id: string, data: UpdateDTO): Promise<T | null>;
  abstract delete(id: string): Promise<boolean>;

  protected updateTimestamp(): string {
    return new Date().toISOString();
  }

  protected createTimestamps(): { created_at: string; updated_at: string } {
    const now = new Date().toISOString();
    return { created_at: now, updated_at: now };
  }

  protected docToEntity(doc: QueryDocumentSnapshot<DocumentData>): T {
    return { id: doc.id, ...doc.data() } as T;
  }
}
