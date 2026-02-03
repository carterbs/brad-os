import type { Firestore } from 'firebase-admin/firestore';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import type { StretchRegion, CreateStretchRegionDTO } from '../shared.js';

export class StretchRepository {
  private db: Firestore;
  private collectionName: string;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName('stretches');
  }

  private get collection(): FirebaseFirestore.CollectionReference {
    return this.db.collection(this.collectionName);
  }

  async findAll(): Promise<StretchRegion[]> {
    const snapshot = await this.collection.orderBy('region').get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as StretchRegion[];
  }

  async findByRegion(region: string): Promise<StretchRegion | null> {
    const doc = await this.collection.doc(region).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as StretchRegion;
  }

  async seed(regions: CreateStretchRegionDTO[]): Promise<void> {
    const batch = this.db.batch();
    const now = new Date().toISOString();

    for (const region of regions) {
      const docRef = this.collection.doc(region.region);
      batch.set(docRef, {
        ...region,
        created_at: now,
        updated_at: now,
      });
    }

    await batch.commit();
  }
}
