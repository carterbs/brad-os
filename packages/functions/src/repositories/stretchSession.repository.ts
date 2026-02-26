import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type {
  StretchSessionRecord,
  CreateStretchSessionRequest,
  CompletedStretch,
  BodyRegion,
} from '../shared.js';
import { getFirestoreDb, getCollectionName } from '../firebase.js';
import {
  isRecord,
  readEnum,
  readNumber,
  readString,
} from './firestore-type-guards.js';

/**
 * Convert a local date boundary to a UTC timestamp.
 */
function localDateToUtcBoundary(
  localDate: string,
  isEndOfDay: boolean,
  timezoneOffsetMinutes: number
): string {
  const parts = localDate.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;

  const localMs = Date.UTC(
    year,
    month - 1,
    day,
    isEndOfDay ? 23 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 999 : 0
  );

  const utcMs = localMs + timezoneOffsetMinutes * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export class StretchSessionRepository {
  private db: Firestore;
  private collectionName: string;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreDb();
    this.collectionName = getCollectionName('stretch_sessions');
  }

  private get collection(): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> {
    return this.db.collection(this.collectionName);
  }

  /**
   * Create a new stretch session record.
   */
  async create(data: CreateStretchSessionRequest): Promise<StretchSessionRecord> {
    const id = randomUUID();

    const sessionData = {
      completedAt: data.completedAt,
      totalDurationSeconds: data.totalDurationSeconds,
      regionsCompleted: data.regionsCompleted,
      regionsSkipped: data.regionsSkipped,
      stretches: data.stretches,
    };

    await this.collection.doc(id).set(sessionData);

    const record: StretchSessionRecord = {
      id,
      ...sessionData,
    };

    return record;
  }

  /**
   * Find a stretch session by ID.
   */
  async findById(id: string): Promise<StretchSessionRecord | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }

  /**
   * Get the most recent stretch session.
   */
  async findLatest(): Promise<StretchSessionRecord | null> {
    const snapshot = await this.collection
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    if (doc === undefined) {
      return null;
    }
    const data = doc.data();
    if (!isRecord(data)) {
      return null;
    }
    return this.parseEntity(doc.id, data);
  }

  /**
   * Get all stretch sessions, most recent first.
   */
  async findAll(): Promise<StretchSessionRecord[]> {
    const snapshot = await this.collection.orderBy('completedAt', 'desc').get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((session): session is StretchSessionRecord => session !== null);
  }

  /**
   * Delete a stretch session by ID.
   */
  async delete(id: string): Promise<boolean> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      return false;
    }
    await this.collection.doc(id).delete();
    return true;
  }

  /**
   * Find stretch sessions where completedAt falls within the date range.
   */
  async findInDateRange(
    startDate: string,
    endDate: string,
    timezoneOffset: number = 0
  ): Promise<StretchSessionRecord[]> {
    const startTimestamp = localDateToUtcBoundary(startDate, false, timezoneOffset);
    const endTimestamp = localDateToUtcBoundary(endDate, true, timezoneOffset);

    const snapshot = await this.collection
      .where('completedAt', '>=', startTimestamp)
      .where('completedAt', '<=', endTimestamp)
      .orderBy('completedAt')
      .get();

    return snapshot.docs
      .map((doc) => {
        const data = doc.data();
        if (!isRecord(data)) {
          return null;
        }
        return this.parseEntity(doc.id, data);
      })
      .filter((session): session is StretchSessionRecord => session !== null);
  }

  protected parseCompletedStretch(data: unknown): CompletedStretch | null {
    if (!isRecord(data)) {
      return null;
    }

    const region = readEnum(data, 'region', [
      'neck',
      'shoulders',
      'back',
      'hip_flexors',
      'glutes',
      'hamstrings',
      'quads',
      'calves',
    ]);
    const stretchId = readString(data, 'stretchId');
    const stretchName = readString(data, 'stretchName');
    const durationSeconds = readNumber(data, 'durationSeconds');
    const skippedSegments = readNumber(data, 'skippedSegments');

    if (
      region === null ||
      stretchId === null ||
      stretchName === null ||
      durationSeconds === null ||
      skippedSegments === null
    ) {
      return null;
    }

    return {
      region: region as BodyRegion,
      stretchId,
      stretchName,
      durationSeconds,
      skippedSegments,
    };
  }

  protected parseEntity(id: string, data: Record<string, unknown>): StretchSessionRecord | null {
    const completedAt = readString(data, 'completedAt');
    const totalDurationSeconds = readNumber(data, 'totalDurationSeconds');
    const regionsCompleted = readNumber(data, 'regionsCompleted');
    const regionsSkipped = readNumber(data, 'regionsSkipped');
    const stretchesRaw = data['stretches'];

    if (
      completedAt === null ||
      totalDurationSeconds === null ||
      regionsCompleted === null ||
      regionsSkipped === null ||
      !Array.isArray(stretchesRaw)
    ) {
      return null;
    }

    const stretches: CompletedStretch[] = [];
    for (const stretch of stretchesRaw) {
      const parsedStretch = this.parseCompletedStretch(stretch);
      if (parsedStretch === null) {
        return null;
      }
      stretches.push(parsedStretch);
    }

    return {
      id,
      completedAt,
      totalDurationSeconds,
      regionsCompleted,
      regionsSkipped,
      stretches,
    };
  }
}
