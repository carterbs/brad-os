import type { Firestore } from 'firebase-admin/firestore';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import type {
  BodyRegion,
  StretchRegion,
  CreateStretchRegionDTO,
} from '../shared.js';
import {
  isRecord,
  readBoolean,
  readEnum,
  readNullableString,
  readString,
} from './firestore-type-guards.js';

type StretchDefinitionRecord = {
  id: string;
  name: string;
  description: string;
  bilateral: boolean;
  image?: string;
};

const VALID_BODY_REGIONS = [
  'neck',
  'shoulders',
  'back',
  'hip_flexors',
  'glutes',
  'hamstrings',
  'quads',
  'calves',
] as const satisfies readonly BodyRegion[];

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
    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((region): region is StretchRegion => region !== null);
  }

  async findByRegion(region: string): Promise<StretchRegion | null> {
    const doc = await this.collection.doc(region).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    if (data === undefined) {
      return null;
    }
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
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

  protected parseStretchDefinition(data: unknown): StretchDefinitionRecord | null {
    if (!isRecord(data)) {
      return null;
    }

    const stretchId = readString(data, 'id');
    const name = readString(data, 'name');
    const description = readString(data, 'description');
    const bilateral = readBoolean(data, 'bilateral');
    const imageValue = readNullableString(data, 'image');
    const image = imageValue === null ? undefined : imageValue;

    if (
      stretchId === null ||
      name === null ||
      description === null ||
      bilateral === null ||
      imageValue === undefined
    ) {
      return null;
    }

    return {
      id: stretchId,
      name,
      description,
      bilateral,
      image,
    };
  }

  protected parseEntity(id: string, data: Record<string, unknown>): StretchRegion | null {
    const region = readEnum(data, 'region', VALID_BODY_REGIONS);
    const displayName = readString(data, 'displayName');
    const iconName = readString(data, 'iconName');
    const stretchesRaw = data['stretches'];
    const createdAt = readString(data, 'created_at');
    const updatedAt = readString(data, 'updated_at');

    if (
      region === null ||
      displayName === null ||
      iconName === null ||
      !Array.isArray(stretchesRaw) ||
      createdAt === null ||
      updatedAt === null
    ) {
      return null;
    }

    const stretches: StretchDefinitionRecord[] = [];
    for (const stretch of stretchesRaw) {
      const parsedStretch = this.parseStretchDefinition(stretch);
      if (parsedStretch === null) {
        return null;
      }
      stretches.push(parsedStretch);
    }

    return {
      id,
      region,
      displayName,
      iconName,
      stretches,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }
}
